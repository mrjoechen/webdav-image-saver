// Store configurations in memory for quick access
let webdavServers = [];
let uploadTimers = {}; // Store notification IDs and their timeouts

// --- Initialization ---
chrome.runtime.onInstalled.addListener(async () => {
    console.log("WebDAV Image Saver installed/updated.");
    await loadConfig();
    createContextMenus();
});

// --- Context Menu Click Handler ---
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    const serverConfig = webdavServers.find(s => s.id === info.menuItemId);

    if (serverConfig && info.srcUrl && tab && tab.id) {
        console.log(`Preparing image ${info.srcUrl} for ${serverConfig.name}`);

        // 1. Generate a unique ID for this upload attempt
        const uploadId = `upload_${Date.now()}_${Math.random().toString(16).substring(2, 8)}`;
        const countdownSeconds = 3;

        // 2. Inject Content Script and CSS if not already there
        try {
            // Check if content script is already injected by trying to send a ping message
            let scriptAlreadyInjected = false;
            try {
                await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
                scriptAlreadyInjected = true;
                console.log("Content script already injected for tab:", tab.id);
            } catch (e) {
                console.log("Content script not present, will inject for tab:", tab.id);
            }

            // Only inject if not already present
            if (!scriptAlreadyInjected) {
                await chrome.scripting.insertCSS({
                    target: { tabId: tab.id },
                    files: ['assets/bubble.css']
                });
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['content_script.js']
                });
                console.log("Injected content script and CSS for tab:", tab.id);
            }

            // 3. Send message to Content Script to show the bubble
            await chrome.tabs.sendMessage(tab.id, {
                action: 'showCountdownBubble',
                uploadId: uploadId,
                serverName: serverConfig.name,
                countdownSeconds: countdownSeconds
            });
            console.log("Sent showCountdownBubble message for ID:", uploadId);

            // 4. Start the background timer for the actual upload
            const timerId = setTimeout(() => {
                console.log(`Background timer expired for ${uploadId}. Starting upload.`);
                // Check if it wasn't cancelled in the meantime
                if (uploadTimers[uploadId]) {
                    const { serverConfig, imageUrl, pageUrl } = uploadTimers[uploadId];
                    // Remove the timer *before* starting the upload
                    delete uploadTimers[uploadId];
                    // Tell content script to remove the countdown bubble explicitly
                    chrome.tabs.sendMessage(tab.id, { action: 'removeCountdownBubble', uploadId: uploadId }).catch(e => console.warn("Failed to send remove message", e));
                    // Perform the upload
                    uploadImage(imageUrl, pageUrl, serverConfig, uploadId, tab.id);
                } else {
                     console.log(`Upload ${uploadId} was cancelled before timer expired.`);
                }
            }, countdownSeconds * 1000);

            // 5. Store timer details associated with the ID
            uploadTimers[uploadId] = { timerId, serverConfig, imageUrl: info.srcUrl, pageUrl: info.pageUrl || tab.url }; // Use info.pageUrl if available, else tab.url

        } catch (error) {
            console.error(`Failed to inject script/CSS or send message to tab ${tab.id}:`, error);
            // Fallback or error notification? For now, just log.
            // Maybe show a generic error status bubble immediately if injection fails?
            try {
                 await chrome.tabs.sendMessage(tab.id, {
                      action: 'showStatusBubble',
                      uploadId: uploadId, // Still useful for potential removal
                      status: 'error',
                      message: `Error preparing upload: ${error.message}`
                  });
            } catch (sendError) {
                 console.error("Also failed to send error status message:", sendError);
            }
        }

    } else {
        // Handle cases where config/URL/tab is missing
        console.warn("Context menu click ignored:", { hasConfig: !!serverConfig, hasSrcUrl: !!info.srcUrl, hasTabId: !!(tab && tab.id) });
    }
});

chrome.action.onClicked.addListener(() => {
    chrome.runtime.openOptionsPage();
});


// --- Listen for Cancellation from Content Script ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Make sure to handle other messages too (like testWebdav, configUpdated)
    if (message.action === 'cancelUpload') {
        const uploadId = message.uploadId;
        console.log(`Received cancel request for upload ID: ${uploadId}`);
        if (uploadTimers[uploadId]) {
            clearTimeout(uploadTimers[uploadId].timerId);
            delete uploadTimers[uploadId];
            console.log(`Cancelled timer and removed tracking for ${uploadId}`);
            // No need to tell content script to remove bubble, it already did.
            // Optionally show a cancellation status bubble:
            if (sender.tab && sender.tab.id) {
                chrome.tabs.sendMessage(sender.tab.id, {
                   action: 'showStatusBubble',
                   uploadId: uploadId, // ID for context, though bubble is gone
                   status: 'error', // Or maybe a neutral 'info' status? Let's use error styling.
                   message: 'Upload cancelled.'
                }).catch(e => console.warn("Failed to send cancel status message", e));
            }
        } else {
            console.log(`Received cancel for ${uploadId}, but it was not found (already finished or cancelled).`);
        }
        return false; // Indicate sync processing
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
        loadConfig().then(() => {
             createContextMenus();
              // Reset any pending timers? Maybe not necessary, let them run with old config? Or clear uploadTimers = {}; ?
             console.log("Menus updated after config change.");
        });
        return false; // Sync processing
    }
     return false; // Default for unhandled messages
});


// --- Configuration Loading ---
async function loadConfig() {
    try {
        // Check local storage first, fallback to sync only for legacy migration.
        const localData = await chrome.storage.local.get('webdavServers');
        const syncData = await chrome.storage.sync.get('webdavServers');
        
        webdavServers = localData.webdavServers || syncData.webdavServers || [];
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
async function uploadImage(imageUrl, pageUrl, serverConfig, uploadId, tabId) {
    let success = false;
    let statusMessage = '';
    let filename = ''; // Keep filename accessible

    try {
        // 1. Generate Filename
        filename = generateFilename(imageUrl, pageUrl); // Keep using original function
        if (!filename) throw new Error("Could not generate filename.");

        // 2. Fetch Image Data (as before)
        console.log(`[${uploadId}] Fetching image: ${imageUrl}`);
        const response = await fetch(imageUrl);
        if (!response.ok) throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
        const imageBlob = await response.blob();
        console.log(`[${uploadId}] Image fetched: ${imageBlob.size} bytes, type: ${imageBlob.type}`);

        // 3. Construct WebDAV URL (as before)
        const targetUrl = buildWebdavResourceUrl(serverConfig.url, serverConfig.folder || '/', filename);
        console.log(`[${uploadId}] Target WebDAV URL: ${targetUrl}`);

        // 4. Prepare Headers (as before)
        const headers = new Headers();
        headers.append('Authorization', basicAuthHeader(serverConfig.username, serverConfig.password));
        headers.append('Content-Type', imageBlob.type || 'application/octet-stream');

        // 5. Perform PUT request (as before)
        console.log(`[${uploadId}] Sending PUT request...`);
        const putResponse = await fetch(targetUrl, { method: 'PUT', headers: headers, body: imageBlob });
        console.log(`[${uploadId}] WebDAV response status: ${putResponse.status}`);

        // 6. Check Response (as before, maybe refine error parsing)
        if (putResponse.ok || putResponse.status === 201 || putResponse.status === 204) {
            console.log(`[${uploadId}] Image uploaded successfully!`);
            success = true;
            statusMessage = `Saved as "${filename}"`; // Shorter success message for bubble
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
        statusMessage = `Failed: ${error.message}`;
    }

    // 7. Send result message back to content script
    // In background.js, add more verbose logging
    chrome.tabs.sendMessage(tabId, {
        action: 'showStatusBubble',
        uploadId: uploadId,
        status: success ? 'success' : 'error',
        message: statusMessage
    }).then(() => {
        console.log(`[${uploadId}] Successfully sent status message to tab ${tabId}`);
    }).catch(e => console.error(`[${uploadId}] Failed to send final status to tab ${tabId}:`, e));
    }

// --- Filename Generation ---
function generateFilename(imageUrl, pageUrl) {
    try {
        const url = new URL(imageUrl);
        const page = new URL(pageUrl); // Use pageUrl for hostname

        // Get file extension
        const pathname = url.pathname;
        const lastDot = pathname.lastIndexOf('.');
        const extension = (lastDot > -1) ? pathname.substring(lastDot + 1).toLowerCase() : 'jpg'; // Default to jpg if no extension

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
        // Fallback filename
        const timestamp = Date.now();
        const fallbackExt = imageUrl.split('.').pop() || 'jpg';
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
loadConfig().then(createContextMenus);
