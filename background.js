// Global variable to store active timeouts for cancellation
let pendingSends = {}; // key: some unique id, value: { timeoutId, profile, imageUrl, filename, tabId }

// --- Context Menu Management ---

// Function to create context menus based on stored profiles
function updateContextMenus() {
  chrome.contextMenus.removeAll(() => { // Remove existing menus first
    chrome.storage.local.get('webdavProfiles', (data) => {
      const profiles = data.webdavProfiles || [];

      if (profiles.length === 1) {
        // If only one profile, create a single menu item
        chrome.contextMenus.create({
          id: `webdav-send-${profiles[0].id}`,
          title: `Send Image to WebDAV (${profiles[0].name})`,
          contexts: ["image"] // Show only when right-clicking an image
        });
      } else if (profiles.length > 1) {
        // If multiple profiles, create a parent menu and submenus
        chrome.contextMenus.create({
          id: "webdav-send-parent",
          title: "Send Image to WebDAV",
          contexts: ["image"]
        });
        profiles.forEach(profile => {
          chrome.contextMenus.create({
            id: `webdav-send-${profile.id}`,
            parentId: "webdav-send-parent",
            title: profile.name,
            contexts: ["image"]
          });
        });
      }
      // No menu if no profiles are configured
    });
  });
}

// Initial setup when the extension is installed or updated
chrome.runtime.onInstalled.addListener(() => {
  console.log("WebDAV Image Saver installed/updated.");
  updateContextMenus(); // Create menus on install/update
});

// Listen for messages from options page to update menus
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "updateContextMenus") {
    updateContextMenus();
  }
  if (request.action === "cancelSend") {
      cancelScheduledSend(request.sendId);
  }
  // Keep the message channel open for asynchronous response if needed
  // return true;
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId.startsWith("webdav-send-")) {
    const profileId = info.menuItemId.replace("webdav-send-", "");
    const imageUrl = info.srcUrl; // URL of the right-clicked image

    if (!imageUrl) {
      console.error("Could not get image URL.");
      return;
    }

    // Retrieve the specific profile configuration
    chrome.storage.local.get('webdavProfiles', (data) => {
      const profiles = data.webdavProfiles || [];
      const profile = profiles.find(p => p.id === profileId);

      if (profile) {
        // Start the countdown process
        scheduleSend(profile, imageUrl, tab.id);
      } else {
        console.error("Clicked profile configuration not found:", profileId);
        // Optionally notify the user or open options page
        chrome.notifications.create({
           type: 'basic',
           iconUrl: 'icon128.png',
           title: 'WebDAV Error',
           message: `Configuration for profile ID ${profileId} not found. Please check settings.`
        });
        chrome.runtime.openOptionsPage();
      }
    });
  }
});

// --- Countdown and Sending Logic ---

function scheduleSend(profile, imageUrl, tabId) {
  const sendId = `send-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const countdownSeconds = 5;

  // Tell content script to show the timer
  chrome.tabs.sendMessage(tabId, {
      action: "showTimer",
      sendId: sendId,
      countdown: countdownSeconds
  });

  // Schedule the actual send operation
  const timeoutId = setTimeout(() => {
    // Check if it wasn't cancelled
    if (pendingSends[sendId]) {
      console.log(`Countdown finished for ${sendId}. Sending image: ${imageUrl} to profile: ${profile.name}`);
      sendImageToWebDAV(profile, imageUrl, sendId, tabId);
      // Clean up after starting the send
      delete pendingSends[sendId];
    }
  }, countdownSeconds * 1000);

  // Store timeout info for cancellation
  pendingSends[sendId] = { timeoutId, profile, imageUrl, tabId };
  console.log(`Scheduled send ${sendId} for image: ${imageUrl}`);
}

function cancelScheduledSend(sendId) {
    if (pendingSends[sendId]) {
        clearTimeout(pendingSends[sendId].timeoutId);
        console.log(`Cancelled send ${sendId}`);
        // Tell content script to hide the timer immediately
        chrome.tabs.sendMessage(pendingSends[sendId].tabId, { action: "hideTimer", sendId: sendId, cancelled: true });
        delete pendingSends[sendId]; // Remove from pending list
    } else {
        console.log(`Send ID ${sendId} not found or already processed.`);
    }
}


// --- WebDAV Communication ---

async function sendImageToWebDAV(profile, imageUrl, sendId, tabId) {
  try {
    // 1. Fetch the image data
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }
    const imageBlob = await response.blob();
    const contentType = response.headers.get('content-type') || 'application/octet-stream'; // Get content type or default

    // 2. Determine filename
    let filename = imageUrl.substring(imageUrl.lastIndexOf('/') + 1);
    // Clean filename (remove query parameters, decode URI components)
    filename = decodeURIComponent(filename.split('?')[0]);
    // Handle cases with no filename in URL (generate one)
     if (!filename || filename.indexOf('.') === -1) {
        const extension = contentType.split('/')[1] || 'jpg'; // Guess extension from MIME type
        filename = `image_${Date.now()}.${extension}`;
     }

    // 3. Construct WebDAV URL
    // Ensure profile URL ends with /
    const baseDavUrl = profile.url.endsWith('/') ? profile.url : profile.url + '/';
    // Ensure profile path starts and ends with / (unless it's just "/")
    let targetPath = profile.path || '/';
    if (targetPath !== '/' && !targetPath.startsWith('/')) targetPath = '/' + targetPath;
    if (targetPath !== '/' && !targetPath.endsWith('/')) targetPath = targetPath + '/';
    // Remove leading slash from path if base URL already includes it (common mistake)
    if (targetPath.startsWith('/') && baseDavUrl.endsWith('/')) {
        targetPath = targetPath.substring(1);
    }
    // Ensure filename is properly encoded for URL, but keep slashes in path
    const fullWebDavUrl = baseDavUrl + targetPath + encodeURIComponent(filename);


    console.log(`Attempting PUT to: ${fullWebDavUrl}`);

    // 4. Prepare Basic Authentication header
    const credentials = btoa(`${profile.username}:${profile.password}`); // Base64 encode "username:password"

    // 5. Send PUT request
    const putResponse = await fetch(fullWebDavUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': contentType
      },
      body: imageBlob
    });

    // 6. Handle response
    if (putResponse.ok) {
      console.log(`Image successfully uploaded to ${profile.name}: ${filename}`);
      // Notify content script of success (optional: show success message)
       chrome.tabs.sendMessage(tabId, { action: "uploadStatus", sendId: sendId, success: true, message: `Image '${filename}' saved to ${profile.name}.` });
    } else {
       const errorText = await putResponse.text();
       console.error(`WebDAV PUT failed: ${putResponse.status} ${putResponse.statusText}`, errorText);
       throw new Error(`WebDAV Error ${putResponse.status}: ${putResponse.statusText}. Server Response: ${errorText}`);
    }

  } catch (error) {
    console.error("Error sending image to WebDAV:", error);
    // Notify content script of failure (optional: show error message)
    chrome.tabs.sendMessage(tabId, { action: "uploadStatus", sendId: sendId, success: false, message: `Failed to save image: ${error.message}` });
  } finally {
      // Ensure timer is hidden even if send fails after countdown finishes
      chrome.tabs.sendMessage(tabId, { action: "hideTimer", sendId: sendId, cancelled: false });
  }
}

// --- Utility: Open Options Page on Icon Click ---
chrome.action.onClicked.addListener((tab) => {
  chrome.runtime.openOptionsPage();
});