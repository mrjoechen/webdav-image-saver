importScripts('image-format.js');
importScripts('filename-rule.js');
importScripts('directory-rule.js');
importScripts('settings.js');

// Store configurations in memory for quick access
let webdavServers = [];
let appSettings = AppSettings.createDefaultSettings();
let configReady;
let configReloadQueue = Promise.resolve();
const PENDING_UPLOAD_PREFIX = 'pendingUpload_';
const processingUploadIds = new Set();
const contentScriptInjectionPromises = new Map();

// --- Initialization ---
chrome.runtime.onInstalled.addListener(() => {
    console.log("WebDAV Image Saver installed/updated.");
});

// --- Context Menu Click Handler ---
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    await configReady;
    const serverConfig = webdavServers.find(s => s.id === info.menuItemId);

    if (serverConfig && info.srcUrl && tab && Number.isInteger(tab.id)) {
        console.log(`Preparing image ${info.srcUrl} for ${serverConfig.name}`);
        try {
            await beginSaveFlow({
                serverConfig,
                imageUrl: info.srcUrl,
                pageUrl: info.pageUrl || tab.url,
                tabId: tab.id
            });
        } catch (error) {
            console.error(`Failed to prepare upload in tab ${tab.id}:`, error);
        }
    } else {
        console.warn("Context menu click ignored:", { hasConfig: !!serverConfig, hasSrcUrl: !!info.srcUrl, hasTabId: !!(tab && tab.id) });
    }
});

async function ensureContentScript(tabId) {
    if (contentScriptInjectionPromises.has(tabId)) {
        return contentScriptInjectionPromises.get(tabId);
    }

    const injectionPromise = (async () => {
        try {
            await chrome.tabs.sendMessage(tabId, { action: 'ping' });
            return;
        } catch (error) {
            console.log('Content script not present, injecting for tab:', tabId);
        }

        await chrome.scripting.insertCSS({
            target: { tabId },
            files: ['assets/bubble.css']
        });
        await chrome.scripting.executeScript({
            target: { tabId },
            files: ['content_script.js']
        });
    })();

    contentScriptInjectionPromises.set(tabId, injectionPromise);
    try {
        await injectionPromise;
    } finally {
        contentScriptInjectionPromises.delete(tabId);
    }
}

async function beginSaveFlow({ serverConfig, imageUrl, pageUrl, tabId }) {
    const uploadId = `upload_${Date.now()}_${Math.random().toString(16).substring(2, 8)}`;
    const operation = {
        uploadId,
        serverId: serverConfig.id,
        serverName: serverConfig.name,
        imageUrl,
        pageUrl,
        tabId
    };

    await ensureContentScript(tabId);

    if (appSettings.image.saveFormat === 'ask') {
        await savePendingUpload(operation);
        try {
            await chrome.tabs.sendMessage(tabId, {
                action: 'showFormatChooser',
                uploadId,
                serverName: operation.serverName
            });
        } catch (error) {
            await removePendingUpload(uploadId);
            throw error;
        }
        return;
    }

    await startUploadCountdown(operation, appSettings.image.saveFormat);
}

async function startUploadCountdown(operation, targetFormat) {
    const countdownSeconds = 3;
    const pendingUpload = { ...operation, targetFormat };

    await savePendingUpload(pendingUpload);

    try {
        await chrome.tabs.sendMessage(operation.tabId, {
            action: 'showCountdownBubble',
            uploadId: operation.uploadId,
            serverName: operation.serverName,
            countdownSeconds
        });
    } catch (error) {
        await removePendingUpload(operation.uploadId);
        throw error;
    }
}

function pendingUploadKey(uploadId) {
    return `${PENDING_UPLOAD_PREFIX}${uploadId}`;
}

async function savePendingUpload(operation) {
    await chrome.storage.session.set({ [pendingUploadKey(operation.uploadId)]: operation });
}

async function getPendingUpload(uploadId) {
    const key = pendingUploadKey(uploadId);
    const data = await chrome.storage.session.get(key);
    return data[key] || null;
}

async function removePendingUpload(uploadId) {
    await chrome.storage.session.remove(pendingUploadKey(uploadId));
}

async function removePendingUploadsForTab(tabId) {
    const sessionData = await chrome.storage.session.get(null);
    const keys = Object.entries(sessionData)
        .filter(([key, operation]) => key.startsWith(PENDING_UPLOAD_PREFIX) && operation?.tabId === tabId)
        .map(([key]) => key);

    if (keys.length > 0) await chrome.storage.session.remove(keys);
}

async function cancelPendingUpload(uploadId, tabId) {
    if (processingUploadIds.has(uploadId)) return;
    processingUploadIds.add(uploadId);

    try {
        const operation = await getPendingUpload(uploadId);
        if (!operation || operation.tabId !== tabId) return;
        await removePendingUpload(uploadId);
    } finally {
        processingUploadIds.delete(uploadId);
    }
}

async function handleFormatSelected(message, tabId) {
    if (processingUploadIds.has(message.uploadId)) return;
    processingUploadIds.add(message.uploadId);

    try {
        const operation = await getPendingUpload(message.uploadId);
        const allowedFormats = ['original', 'png', 'jpg', 'webp'];

        if (!operation || operation.tabId !== tabId || operation.targetFormat || !allowedFormats.includes(message.format)) {
            console.warn('Ignored invalid image format selection:', message.format);
            return;
        }

        await startUploadCountdown(operation, message.format);
    } finally {
        processingUploadIds.delete(message.uploadId);
    }
}

async function handleUploadCountdownComplete(uploadId, tabId) {
    if (processingUploadIds.has(uploadId)) return;
    processingUploadIds.add(uploadId);

    try {
        const operation = await getPendingUpload(uploadId);
        const allowedFormats = ['original', 'png', 'jpg', 'webp'];
        if (!operation || operation.tabId !== tabId || !allowedFormats.includes(operation.targetFormat)) return;

        await removePendingUpload(uploadId);
        await configReady;

        const serverConfig = webdavServers.find(server => server.id === operation.serverId);
        if (!serverConfig) {
            throw new Error('The selected WebDAV server is no longer available.');
        }

        await chrome.tabs.sendMessage(tabId, { action: 'removeCountdownBubble', uploadId })
            .catch(error => console.warn('Failed to remove countdown bubble:', error));
        await uploadImage(
            operation.imageUrl,
            operation.pageUrl,
            serverConfig,
            uploadId,
            tabId,
            operation.targetFormat
        );
    } finally {
        processingUploadIds.delete(uploadId);
    }
}

chrome.action.onClicked.addListener(() => {
    chrome.runtime.openOptionsPage();
});

chrome.tabs.onRemoved.addListener(tabId => {
    removePendingUploadsForTab(tabId)
        .catch(error => console.warn('Failed to clean up pending uploads for closed tab:', error));
});

function keepMessageChannelOpen(task, sendResponse) {
    Promise.resolve(task)
        .then(() => sendResponse({ success: true }))
        .catch(error => {
            console.error('Background message task failed:', error);
            sendResponse({ success: false, error: error.message || String(error) });
        });
    return true;
}

// --- Listen for Cancellation from Content Script ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Make sure to handle other messages too (like testWebdav, configUpdated)
    if (message.action === 'cancelUpload') {
        return keepMessageChannelOpen(
            cancelPendingUpload(message.uploadId, sender.tab?.id),
            sendResponse
        );
    }
    else if (message.action === 'formatSelected') {
        const selectionTask = handleFormatSelected(message, sender.tab?.id).catch(async error => {
            if (!sender.tab?.id) return;
            await chrome.tabs.sendMessage(sender.tab.id, {
                action: 'showStatusBubble',
                uploadId: message.uploadId,
                status: 'error',
                message: `Error preparing upload: ${error.message}`
            }).catch(sendError => console.error('Failed to show format selection error:', sendError));
            throw error;
        });
        return keepMessageChannelOpen(selectionTask, sendResponse);
    }
    else if (message.action === 'cancelFormatSelection') {
        return keepMessageChannelOpen(
            cancelPendingUpload(message.uploadId, sender.tab?.id),
            sendResponse
        );
    }
    else if (message.action === 'uploadCountdownComplete') {
        const uploadTask = handleUploadCountdownComplete(message.uploadId, sender.tab?.id).catch(async error => {
            if (!sender.tab?.id) return;
            await chrome.tabs.sendMessage(sender.tab.id, {
                action: 'showStatusBubble',
                uploadId: message.uploadId,
                status: 'error',
                message: `Failed: ${error.message}`
            }).catch(sendError => console.error('Failed to show upload error:', sendError));
            throw error;
        });
        return keepMessageChannelOpen(uploadTask, sendResponse);
    }
    // --- Keep other message handlers ---
    else if (message.action === 'testWebdav') {
         testWebdavConnection(message.config)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Async response
    } else if (message.action === 'listWebdavFolders') {
         listWebdavFolders(message.config, message.folder || '/')
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Async response
    } else if (message.action === 'configUpdated') {
        console.log('Configuration updated, reloading...');
        const reloadTask = configReloadQueue.then(loadConfig);
        configReloadQueue = reloadTask.catch(error => {
            console.error('Configuration reload failed:', error);
        });
        configReady = configReloadQueue;
        const menuUpdateTask = reloadTask.then(() => {
            createContextMenus();
            console.log("Menus updated after config change.");
        });
        return keepMessageChannelOpen(menuUpdateTask, sendResponse);
    }
     return false; // Default for unhandled messages
});


// --- Configuration Loading ---
async function loadConfig() {
    try {
        // Check local storage first, fallback to sync only for legacy migration.
        const [localData, syncData, loadedSettings] = await Promise.all([
            chrome.storage.local.get('webdavServers'),
            chrome.storage.sync.get('webdavServers'),
            AppSettings.loadSettings(chrome.storage.local)
        ]);
        
        webdavServers = localData.webdavServers || syncData.webdavServers || [];
        appSettings = loadedSettings;
        console.log("Configuration loaded:", webdavServers.length, "servers");
        
        // Migrate from sync to local if needed
        if (syncData.webdavServers && !localData.webdavServers) {
            console.log('Migrating server data to local storage for better security');
            await chrome.storage.local.set({ webdavServers: webdavServers });
        }

        await clearLegacySyncServerData();
    } catch (error) {
        console.error("Error loading configuration:", error);
        webdavServers = [];
        appSettings = AppSettings.createDefaultSettings();
        throw error;
    }
}

async function clearLegacySyncServerData() {
    try {
        await chrome.storage.sync.remove(['webdavServers', 'webdavServersMetadata']);
    } catch (error) {
        console.warn('Could not clear legacy sync storage:', error);
    }
}

// --- Context Menu Setup ---
function createContextMenus() {
    // Remove existing menus first to avoid duplicates on update
    chrome.contextMenus.removeAll(() => {
        if (chrome.runtime.lastError) {
            console.warn("Error removing context menus:", chrome.runtime.lastError.message);
        }

        // Create a parent menu item
        chrome.contextMenus.create({
            id: "webdavSaverParent",
            title: "Save Image to WebDAV",
            contexts: ["image"] // Show only when right-clicking an image
        }, () => {
            if (chrome.runtime.lastError) console.error("Error creating parent menu:", chrome.runtime.lastError.message);
        });

        // Create sub-menu items for each configured server
        if (webdavServers && webdavServers.length > 0) {
            webdavServers.forEach(server => {
                chrome.contextMenus.create({
                    id: server.id, // Use unique server ID for the menu item ID
                    parentId: "webdavSaverParent",
                    title: `Send to: ${server.name} (${server.folder})`,
                    contexts: ["image"]
                }, () => {
                     if (chrome.runtime.lastError) console.error(`Error creating menu for ${server.name}:`, chrome.runtime.lastError.message);
                });
            });
        } else {
            // Add a placeholder if no servers are configured
             chrome.contextMenus.create({
                id: "noConfig",
                parentId: "webdavSaverParent",
                title: "No servers configured...",
                contexts: ["image"],
                enabled: false // Disable it
            });
        }
    });

}


// --- Image Upload Logic ---
async function uploadImage(imageUrl, pageUrl, serverConfig, uploadId, tabId, targetFormat = 'original') {
    let success = false;
    let status = 'error';
    let statusMessage = '';
    let filename = '';

    try {
        console.log(`[${uploadId}] Fetching image: ${imageUrl}`);
        const response = await fetch(imageUrl);
        if (!response.ok) throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
        const imageBlob = await response.blob();
        console.log(`[${uploadId}] Image fetched: ${imageBlob.size} bytes, type: ${imageBlob.type}`);

        filename = generateFilename(imageUrl, pageUrl, imageBlob.type);
        const preparedImage = await ImageFormat.prepareImageForUpload({
            blob: imageBlob,
            filename,
            targetFormat
        });
        filename = preparedImage.filename;
        if (preparedImage.warningDetail) {
            console.warn(`[${uploadId}] Image conversion fallback:`, preparedImage.warningDetail);
        }

        const targetUrl = buildWebdavResourceUrl(serverConfig.url, serverConfig.folder || '/', preparedImage.filename);
        console.log(`[${uploadId}] Target WebDAV URL: ${targetUrl}`);

        const headers = new Headers();
        headers.append('Authorization', basicAuthHeader(serverConfig.username, serverConfig.password));
        headers.append('Content-Type', preparedImage.mimeType);

        console.log(`[${uploadId}] Sending PUT request...`);
        const putResponse = await fetch(targetUrl, { method: 'PUT', headers: headers, body: preparedImage.blob });
        console.log(`[${uploadId}] WebDAV response status: ${putResponse.status}`);

        if (putResponse.ok || putResponse.status === 201 || putResponse.status === 204) {
            console.log(`[${uploadId}] Image uploaded successfully!`);
            success = true;
            status = preparedImage.warningCode ? 'warning' : 'success';
            statusMessage = preparedImage.warningCode
                ? getConversionWarningMessage(preparedImage)
                : `Saved as "${filename}"`;
        } else {
             let errorDetails = `${putResponse.status} ${putResponse.statusText}`;
             try {
                 const errorText = await putResponse.text();
                 console.error(`[${uploadId}] WebDAV Error Response Body:`, errorText);
                  const match = errorText.match(/<[ds]:message[^>]*>([^<]+)<\/[ds]:message>/i);
                  if (match && match[1]) { errorDetails += ` - ${match[1].trim()}`; }
                  else if (errorText.length < 100 && errorText.length > 0) { errorDetails += ` - ${errorText}`; }
             } catch (e) { /* Ignore body read errors */ }
             throw new Error(`Upload failed: ${errorDetails}`);
        }

    } catch (error) {
        console.error(`[${uploadId}] Upload process failed:`, error);
        success = false;
        status = 'error';
        statusMessage = `Failed: ${error.message}`;
    }

    chrome.tabs.sendMessage(tabId, {
        action: 'showStatusBubble',
        uploadId: uploadId,
        status: success ? status : 'error',
        message: statusMessage
    }).then(() => {
        console.log(`[${uploadId}] Successfully sent status message to tab ${tabId}`);
    }).catch(e => console.error(`[${uploadId}] Failed to send final status to tab ${tabId}:`, e));
    }

function getConversionWarningMessage(preparedImage) {
    const filenameExtension = preparedImage.filename.includes('.')
        ? preparedImage.filename.split('.').pop()
        : '';
    const mimeSubtype = preparedImage.mimeType.includes('/')
        ? preparedImage.mimeType.split('/').pop().split('+')[0]
        : '';
    const originalFormat = (filenameExtension || mimeSubtype || 'image').toUpperCase();
    if (preparedImage.warningCode === 'animated-image') {
        return `Saved original ${originalFormat}; animated images cannot be converted.`;
    }
    return `Saved original ${originalFormat}; this image could not be converted.`;
}

// --- Filename Generation ---
function generateFilename(imageUrl, pageUrl, mimeType = '') {
    try {
        const url = new URL(imageUrl);
        const page = new URL(pageUrl); // Use pageUrl for hostname

        const pathname = url.pathname;
        const lastDot = pathname.lastIndexOf('.');
        const urlExtension = lastDot > pathname.lastIndexOf('/') ? pathname.substring(lastDot + 1) : 'bin';
        const extension = ImageFormat.extensionForMimeType(mimeType, urlExtension);

        // Get date timestamp YYYYMMDDHHMMSS
        const now = new Date();
        const timestamp = now.getFullYear().toString() +
                          (now.getMonth() + 1).toString().padStart(2, '0') +
                          now.getDate().toString().padStart(2, '0') +
                          now.getHours().toString().padStart(2, '0') +
                          now.getMinutes().toString().padStart(2, '0') +
                          now.getSeconds().toString().padStart(2, '0');

        // Get hostname and replace dots with underscores
        const hostname = page.hostname.replace(/\./g, '_');

        return `image_${timestamp}_${hostname}.${extension}`;
    } catch (e) {
        console.error("Error generating filename:", e);
        const timestamp = Date.now();
        const fallbackExt = ImageFormat.extensionForMimeType(mimeType, 'bin');
        return `image_${timestamp}_fallback.${fallbackExt}`;
    }
}

// --- WebDAV Folder Browsing ---
async function testWebdavConnection(config) {
    console.log("Testing connection to:", config.url);

    try {
        return await listWebdavFolders(config, '/');
    } catch (error) {
        console.error("WebDAV PROPFIND test failed:", error);
        return await fallbackHeadConnectionTest(config, error);
    }
}

async function listWebdavFolders(config, folder = '/') {
    const normalizedFolder = normalizeWebdavFolder(folder);
    const targetUrl = buildWebdavCollectionUrl(config.url, normalizedFolder);
    const headers = new Headers();
    headers.append('Authorization', basicAuthHeader(config.username, config.password));
    headers.append('Depth', '1');
    headers.append('Content-Type', 'application/xml; charset=utf-8');

    console.log(`Listing WebDAV folder: ${targetUrl}`);

    const response = await fetch(targetUrl, {
        method: 'PROPFIND',
        headers,
        mode: 'cors',
        credentials: 'omit',
        body: '<?xml version="1.0" encoding="utf-8"?>\n<D:propfind xmlns:D="DAV:"><D:prop><D:resourcetype/><D:displayname/></D:prop></D:propfind>'
    });

    console.log(`PROPFIND response status: ${response.status}`);

    if (response.status === 207) {
        const responseText = await response.text();
        return {
            success: true,
            folder: normalizedFolder,
            folders: parseWebdavChildFolders(responseText, config.url, normalizedFolder)
        };
    }

    if (response.status === 401) {
        throw new Error('Authentication failed. Check username and password.');
    }

    if (response.status === 404) {
        throw new Error('Folder not found. Check the WebDAV URL or folder path.');
    }

    let errorDetails = `Server error: ${response.status} ${response.statusText}`;
    try {
        const errorText = await response.text();
        if (errorText) errorDetails += ` - ${errorText.substring(0, 200)}`;
    } catch (e) {
        // Ignore body read errors.
    }
    throw new Error(errorDetails);
}

async function fallbackHeadConnectionTest(config, originalError) {
    try {
        console.log("Attempting fallback HEAD request...");
        const fallbackHeaders = new Headers();
        fallbackHeaders.append('Authorization', basicAuthHeader(config.username, config.password));

        const headResponse = await fetch(buildWebdavCollectionUrl(config.url, '/'), {
            method: 'HEAD',
            headers: fallbackHeaders,
            mode: 'cors',
            credentials: 'omit'
        });

        if (headResponse.ok || headResponse.status === 404) {
            console.log("Fallback HEAD request successful");
            return {
                success: true,
                folders: ['/'],
                message: 'Connection test passed with limited folder browsing.'
            };
        }

        if (headResponse.status === 401) {
            return { success: false, error: 'Authentication failed. Check username and password.' };
        }

        return { success: false, error: `Server error: ${headResponse.status} ${headResponse.statusText}` };
    } catch (fallbackError) {
        console.error("Fallback HEAD request also failed:", fallbackError);
        return { success: false, error: fallbackError.message || originalError.message || 'Unknown connection error' };
    }
}

function parseWebdavChildFolders(responseText, baseUrl, parentFolder) {
    const basePath = getWebdavBasePath(baseUrl);
    const normalizedParent = normalizeWebdavFolder(parentFolder);
    const folders = new Set();
    const hrefRegex = /<(?:\w+:)?href[^>]*>([^<]+)<\/(?:\w+:)?href>/gi;
    let match;

    while ((match = hrefRegex.exec(responseText)) !== null) {
        try {
            const rawHref = match[1].trim();
            if (!rawHref || !rawHref.endsWith('/')) continue;

            const hrefPath = getHrefPath(rawHref);
            let relativePath = hrefPath.startsWith(basePath)
                ? hrefPath.substring(basePath.length)
                : hrefPath.replace(/^\/+/, '');

            relativePath = relativePath.replace(/\/+$/, '');
            const folderPath = normalizeWebdavFolder(relativePath ? `/${relativePath}` : '/');

            if (folderPath !== normalizedParent && getWebdavParentFolder(folderPath) === normalizedParent) {
                folders.add(folderPath);
            }
        } catch (error) {
            console.warn(`Skipping href due to processing error: ${match ? match[1] : 'N/A'}`, error);
        }
    }

    return [...folders].sort((a, b) => a.localeCompare(b));
}

function buildWebdavCollectionUrl(baseUrl, folder) {
    const trimmedBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const normalizedFolder = normalizeWebdavFolder(folder);

    if (normalizedFolder === '/') {
        return `${trimmedBaseUrl}/`;
    }

    const encodedFolder = normalizedFolder
        .split('/')
        .filter(Boolean)
        .map(segment => encodeURIComponent(segment))
        .join('/');

    return `${trimmedBaseUrl}/${encodedFolder}/`;
}

function buildWebdavResourceUrl(baseUrl, folder, filename) {
    return `${buildWebdavCollectionUrl(baseUrl, folder)}${encodeURIComponent(filename)}`;
}

function basicAuthHeader(username, password) {
    const bytes = new TextEncoder().encode(`${username || ''}:${password || ''}`);
    let binary = '';

    bytes.forEach(byte => {
        binary += String.fromCharCode(byte);
    });

    return `Basic ${btoa(binary)}`;
}

function getWebdavBasePath(baseUrl) {
    const url = new URL(baseUrl);
    let pathname = decodeURIComponent(url.pathname || '/');

    if (!pathname.endsWith('/')) {
        pathname += '/';
    }

    return pathname;
}

function getHrefPath(href) {
    try {
        return decodeURIComponent(new URL(href).pathname);
    } catch (error) {
        return decodeURIComponent(href.split(/[?#]/)[0]);
    }
}

function normalizeWebdavFolder(folder) {
    const rawFolder = String(folder || '/').trim();
    if (!rawFolder || rawFolder === '/') return '/';

    let normalized = rawFolder.startsWith('/') ? rawFolder : `/${rawFolder}`;
    normalized = normalized.replace(/\/+/g, '/');

    if (normalized.endsWith('/') && normalized.length > 1) {
        normalized = normalized.slice(0, -1);
    }

    return normalized;
}

function getWebdavParentFolder(folder) {
    const normalizedFolder = normalizeWebdavFolder(folder);
    if (normalizedFolder === '/') return '/';

    const lastSlash = normalizedFolder.lastIndexOf('/');
    return lastSlash <= 0 ? '/' : normalizedFolder.slice(0, lastSlash);
}

// --- Initial load and menu creation on startup ---
configReady = loadConfig().catch(error => {
    console.error('Initial configuration load failed:', error);
});
configReloadQueue = configReady;
configReady.then(createContextMenus);
