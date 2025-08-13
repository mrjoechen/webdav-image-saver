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

        // 2. Inject Content Script and CSS if not already there (or just CSS)
        try {
            await chrome.scripting.insertCSS({
                target: { tabId: tab.id },
                files: ['assets/bubble.css']
            });
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content_script.js']
            });
            console.log("Injected content script and CSS for tab:", tab.id);

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
        // Check local storage first (new secure storage), fallback to sync for migration
        const localData = await chrome.storage.local.get('webdavServers');
        const syncData = await chrome.storage.sync.get('webdavServers');
        
        webdavServers = localData.webdavServers || syncData.webdavServers || [];
        console.log("Configuration loaded:", webdavServers.length, "servers");
        
        // Migrate from sync to local if needed
        if (syncData.webdavServers && !localData.webdavServers) {
            console.log('Migrating server data to local storage for better security');
            await chrome.storage.local.set({ webdavServers: webdavServers });
        }
    } catch (error) {
        console.error("Error loading configuration:", error);
        webdavServers = [];
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
        let folderPath = serverConfig.folder.endsWith('/') && serverConfig.folder.length > 1 ? serverConfig.folder.slice(0, -1) : serverConfig.folder;
        let baseUrl = serverConfig.url.endsWith('/') ? serverConfig.url.slice(0, -1) : serverConfig.url;
        const targetUrl = `${baseUrl}${folderPath}/${filename}`;
        console.log(`[${uploadId}] Target WebDAV URL: ${targetUrl}`);

        // 4. Prepare Headers (as before)
        const headers = new Headers();
        headers.append('Authorization', 'Basic ' + btoa(`${serverConfig.username}:${serverConfig.password}`));
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

// --- Show Upload Result Notification ---
function showUploadResultNotification(serverName, success, message) {
    chrome.notifications.create({
        type: 'basic',
        iconUrl: success ? 'icons/icon128.png' : 'icons/icon_error.png', // You might need an error icon
        title: success ? 'Upload Successful' : 'Upload Failed',
        message: success ? `Image saved as "${message}" to "${serverName}"` : `Failed to save to "${serverName}": ${message}`,
        priority: success ? 0 : 1
    });
}


// --- WebDAV Connection Test Logic (Using Regex) ---
async function testWebdavConnection(config) {
    console.log("Testing connection to:", config.url);
    const headers = new Headers();
    headers.append('Authorization', 'Basic ' + btoa(`${config.username}:${config.password}`));
    headers.append('Depth', '1'); // Request listing of immediate children

    let testUrl = config.url;
    // Ensure URL ends with a slash for PROPFIND on a collection
    if (!testUrl.endsWith('/')) {
        testUrl += '/';
    }

    try {
        // Add CORS-friendly headers for browser extension
        headers.append('Content-Type', 'application/xml; charset=utf-8');
        
        const response = await fetch(testUrl, {
            method: 'PROPFIND',
            headers: headers,
            mode: 'cors',
            credentials: 'omit',
            // Add minimal PROPFIND body to avoid some server issues
            body: '<?xml version="1.0" encoding="utf-8"?>\n<D:propfind xmlns:D="DAV:"><D:prop><D:resourcetype/><D:displayname/></D:prop></D:propfind>'
        });

        console.log(`PROPFIND response status: ${response.status}`);

        // 207 Multi-Status is the expected success code for PROPFIND
        if (response.status === 207) {
            const responseText = await response.text();
            const folders = [];

            // Regex to find content within <href>...</href> or <D:href>...</D:href> tags
            // This is a simplified regex, might need adjustments based on actual server response
            const hrefRegex = /<(?:\w+:)?href[^>]*>([^<]+)<\/(?:\w+:)?href>/gi;
            let match;

            while ((match = hrefRegex.exec(responseText)) !== null) {
                try {
                    const rawHref = match[1].trim(); // Content like /remote.php/dav/files/user/Documents/

                    // We only want directories, identified by ending with a slash
                    if (rawHref && rawHref.endsWith('/')) {
                        let path = decodeURIComponent(rawHref); // Decode URL encoding like %20

                        // --- Path Normalization (Crucial) ---
                        // We need to make the path relative to the *base* WebDAV folder specified in config.url
                        let baseUrlPath = '/'; // Default assumption (root)
                        try {
                             // Parse the configured URL to get its path component
                             const configUrl = new URL(config.url);
                             if (configUrl.pathname && configUrl.pathname !== '/') {
                                 baseUrlPath = configUrl.pathname;
                                 // Ensure the base path ends with a slash for proper comparison/stripping
                                 if (!baseUrlPath.endsWith('/')) {
                                     // Handle case where config URL might be '.../files/user' vs '.../files/user/'
                                      // We want the directory containing the target, so add / or go up one level
                                     const lastSlash = baseUrlPath.lastIndexOf('/');
                                     if(lastSlash > 0) { // Check if not like '/file'
                                          baseUrlPath = baseUrlPath.substring(0, lastSlash + 1);
                                     } else {
                                         baseUrlPath = '/'; // Fallback to root if structure is unexpected
                                     }
                                 }
                             }
                        } catch(e) {
                            console.warn("Could not parse config URL for base path, assuming root.", e);
                        }


                        // If the found path starts with the base path, remove the base path part
                        // Need case-insensitive comparison? Maybe not for paths.
                        if (path.startsWith(baseUrlPath)) {
                            path = path.substring(baseUrlPath.length);
                        }

                        // --- Clean up the relative path ---
                        // Remove leading slash if present (we'll add it back consistently)
                        if (path.startsWith('/')) {
                             path = path.substring(1);
                        }
                        // Remove trailing slash (it's guaranteed by the check above, unless it was only "/")
                        if (path.endsWith('/') && path.length > 0) {
                            path = path.slice(0, -1);
                        }

                        // Add the leading slash for representation in the dropdown, skip empty root path ('')
                        if (path !== '') {
                            folders.push('/' + path);
                        }
                    }
                } catch (e) {
                    // Handle potential errors during decoding or processing a single href
                    console.warn(`Skipping href due to processing error: ${match ? match[1] : 'N/A'}`, e);
                }
            }

            console.log("Found folders via regex:", folders);
            // Add root folder explicitly and ensure uniqueness
            const uniqueFolders = ['/', ...new Set(folders)];
            // Sort folders alphabetically after root? Optional.
            // uniqueFolders.sort((a, b) => {
            //    if (a === '/') return -1;
            //    if (b === '/') return 1;
            //    return a.localeCompare(b);
            // });

            return { success: true, folders: uniqueFolders };

        } else if (response.status === 401) {
            throw new Error('Authentication failed (Unauthorized). Check username/password.');
        } else if (response.status === 404) {
             throw new Error('URL Not Found (404). Check the WebDAV URL path.');
        } else {
             // Try reading the body for more info on other errors
             let errorDetails = `Unexpected status code: ${response.status} ${response.statusText}`;
             try {
                 const errorText = await response.text();
                  if(errorText) errorDetails += ` - ${errorText.substring(0, 200)}`; // Show beginning of error body
             } catch(e) { /* ignore */}
             throw new Error(errorDetails);
        }
    } catch (error) {
        console.error("WebDAV PROPFIND test failed:", error);
        
        // Fallback: Try simpler HEAD request if PROPFIND fails
        try {
            console.log("Attempting fallback HEAD request...");
            const fallbackHeaders = new Headers();
            fallbackHeaders.append('Authorization', 'Basic ' + btoa(`${config.username}:${config.password}`));
            
            const headResponse = await fetch(testUrl, {
                method: 'HEAD',
                headers: fallbackHeaders,
                mode: 'cors',
                credentials: 'omit'
            });
            
            if (headResponse.ok || headResponse.status === 404) {
                // 404 is acceptable for HEAD on a collection, means auth worked
                console.log("Fallback HEAD request successful");
                return { 
                    success: true, 
                    folders: ['/'], // Return root folder only for fallback
                    message: 'Connection test passed (limited folder browsing)'
                };
            } else if (headResponse.status === 401) {
                return { success: false, error: 'Authentication failed. Check username and password.' };
            } else {
                return { success: false, error: `Server error: ${headResponse.status} ${headResponse.statusText}` };
            }
        } catch (fallbackError) {
            console.error("Fallback HEAD request also failed:", fallbackError);
            
            // Check if it's a CORS/network error specifically
            if (fallbackError instanceof TypeError && fallbackError.message.includes('fetch')) {
                return { 
                    success: false, 
                    error: `🚫 CORS/Network Error: Cannot connect to ${config.url}
                    
Possible solutions:
• Configure CORS on your WebDAV server
• Use HTTPS instead of HTTP  
• Check if server allows browser access
• Verify server is running and accessible

Technical: ${fallbackError.message}` 
                };
            }
            
            return { success: false, error: fallbackError.message || 'Unknown connection error' };
        }
    }
}

// --- Initial load and menu creation on startup ---
loadConfig().then(createContextMenus);