# Privacy Policy for WebDAV Image Saver Chrome Extension

**Effective Date:** [2025-04-28]

Thank you for using WebDAV Image Saver ("the Extension"). This policy explains how we handle information when you use the Extension. Our core principle is to collect and handle the minimum information necessary for the Extension to function and to ensure your data remains under your control.

**1. Information We Handle**

The Extension needs access to certain information to perform its core function of saving images to your WebDAV server. This includes:

*   **User-Provided WebDAV Configuration:**
    *   **What:** The WebDAV server URL, username, password, and target folder path you enter into the Extension's options page.
    *   **Why:** This information is essential to establish a connection with YOUR specified WebDAV server and upload images to the correct location.
    *   **How Handled:** This configuration data is stored locally on your computer using the `chrome.storage.sync` API. This means it persists across browser sessions and, if you have Chrome Sync enabled, may be synchronized across your logged-in Chrome instances. **This data is NEVER transmitted to the developer or any third-party server.** It is only used by the Extension running in *your* browser to communicate directly with *your* specified WebDAV server.
*   **Image Data:**
    *   **What:** The binary data of the specific image you choose to save by right-clicking and selecting a destination.
    *   **Why:** This is the content you intend to save to your WebDAV server.
    *   **How Handled:** When you initiate a save, the Extension fetches the image data from its source URL. This data is held temporarily in your browser's memory *only* during the upload process. It is sent directly from your browser to your specified WebDAV server. **The image data is NEVER stored permanently by the Extension itself, nor is it sent to the developer or any third party.**
*   **Source Image URL and Page URL:**
    *   **What:** The URL of the image you right-clicked on, and the URL of the webpage where the image was found.
    *   **Why:** The image URL is needed to fetch the image data. The page URL's domain name is used to generate the default filename for the saved image (e.g., `image_..._websitedomain_com.ext`).
    *   **How Handled:** These URLs are used temporarily during the fetch and upload process. They are **NOT stored by the Extension** after the operation is complete and are **NOT sent to the developer or any third party.**

**2. Information We DO NOT Collect**

We believe in minimizing data collection. The Extension **DOES NOT** collect, store, or transmit:

*   Your browsing history (except for the transient use of the current page URL for filename generation).
*   Any personal identification information (like your name, email address, etc.).
*   Usage analytics or tracking data about how you interact with the Extension or websites.
*   Any data from your WebDAV server other than what's necessary for connection testing (PROPFIND on the target directory) and uploading (PUT request).
*   Any other content from the webpages you visit.

**3. How Information Is Used**

The limited information handled by the Extension is used *solely* for the following purposes, initiated by you:

*   To authenticate and connect to the WebDAV server(s) you have configured.
*   To test the connection to your configured WebDAV server.
*   To list folders on your WebDAV server (during configuration).
*   To fetch the image you select.
*   To upload the selected image data to your specified WebDAV server and folder.
*   To generate a descriptive filename for the saved image.
*   To display status notifications (countdown, success, error) within your browser.

**4. Data Storage and Transmission**

*   **Storage:** Configuration data (URL, credentials, folder) is stored locally using `chrome.storage.sync`. Image data is only held in memory during upload.
*   **Transmission:** All communication related to your WebDAV server (connection tests, folder listing, image uploads) happens **directly between your browser and the WebDAV server URL you provide.** Your credentials and image data are **NEVER** routed through or stored on servers controlled by the developer or any third party. We recommend using HTTPS for your WebDAV server URL for secure transmission.

**5. Data Sharing**

We **DO NOT** share any of your information (configuration, image data, URLs) with any third parties. Period.

**6. Permissions**

The Extension requests the minimum permissions necessary for its functionality:
*   `contextMenus`: To add the right-click save option.
*   `storage`: To save your server configurations.
*   `scripting`: To show in-page notifications/bubbles.
*   `host_permissions` (`<all_urls>`): To fetch images from any site and connect to your user-defined WebDAV server.

**7. Changes to This Privacy Policy**

We may update this Privacy Policy from time to time. If we make significant changes, we will notify you through the Extension update process or by posting the new policy prominently. Your continued use of the Extension after changes signifies your acceptance of the revised policy.

**8. Contact Us**

If you have any questions or concerns about this Privacy Policy or the Extension's handling of data, please open an issue on our GitHub repository: [Link to Your GitHub Issues Page] or contact us at [mrjctech@gmail.com].

---
