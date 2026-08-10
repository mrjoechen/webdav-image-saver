# WebDAV Image Saver

[简体中文](README.zh-CN.md)

<a href="https://chromewebstore.google.com/detail/webdav-image-saver/ejgeeldiamekhajplkinnilgdkfcjdep">
  <img src="store-assets/chrome-web-store-badge.png" alt="Available in the Chrome Web Store" width="206">
</a>

Save web images directly to your own WebDAV server from Chrome's right-click menu.

WebDAV Image Saver is a Manifest V3 Chrome extension for people who keep images in Nextcloud, ownCloud, Synology, QNAP, or any other WebDAV-compatible storage. It does not use a hosted backend. Configuration, image fetching, folder browsing, and uploads happen inside your browser.

## Install from the Chrome Web Store

WebDAV Image Saver is available on the official Chrome Web Store:

**[Install WebDAV Image Saver](https://chromewebstore.google.com/detail/webdav-image-saver/ejgeeldiamekhajplkinnilgdkfcjdep)**

After installation, click the extension icon to configure your WebDAV server. You can pin the extension from Chrome's Extensions menu for quicker access.

## Install from GitHub Releases

You can also install a packaged version from the **[GitHub Releases page](https://github.com/mrjoechen/webdav-image-saver/releases)**:

1. Open the latest release and download `webdav-image-saver-v*.zip` from **Assets**.
2. Extract the downloaded ZIP file to a permanent folder. Do not delete this folder after installation.
3. Open `chrome://extensions` in Chrome.
4. Enable **Developer mode** in the upper-right corner.
5. Click **Load unpacked**.
6. Select the extracted folder containing `manifest.json`.
7. Click the extension icon to configure your WebDAV server.

Extensions installed from GitHub Releases do not update automatically through the Chrome Web Store. To upgrade, download the ZIP from the newest release, replace the extracted files, and click **Reload** for WebDAV Image Saver on `chrome://extensions`.

For automatic updates, install the extension from the Chrome Web Store instead.

## Features

- Save any right-clicked web image to a configured WebDAV destination.
- Configure multiple WebDAV servers.
- Test WebDAV connectivity before saving.
- Browse multi-level WebDAV folders and choose a target folder.
- Show a short countdown bubble before upload, with a cancel action.
- Open the settings page from the extension toolbar icon.
- Light/dark monochrome settings UI with packaged SVG icons.

## Install for Development

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this repository folder.
5. Click the extension icon to open settings.

## Configure a WebDAV Server

1. Open the settings page.
2. Click **Add**.
3. Enter:
   - `Name`
   - `Server URL`, for example `https://example.com/remote.php/dav/files/username`
   - `Username`
   - `Password`
4. Click **Test**.
5. If the connection succeeds, choose a folder in the folder picker.
6. Click **Save**.

Use HTTPS WebDAV URLs whenever possible. HTTP may work technically, but it sends Basic Auth credentials without transport encryption.

## Usage

1. Right-click an image on a web page.
2. Choose **Save Image to WebDAV**.
3. Pick the configured server destination.
4. Wait for the countdown or click **Cancel**.

The extension generates filenames like:

```text
image_YYYYMMDDHHMMSS_example_com.jpg
```

## Permissions

The extension requests these permissions:

- `contextMenus`: Adds the right-click save menu for images.
- `storage`: Stores WebDAV server configurations in Chrome extension storage.
- `scripting`: Injects the countdown/status bubble into the current page after you choose a save action.
- `host_permissions: <all_urls>`: Fetches the selected image URL and connects to user-provided WebDAV URLs.

## Data Handling

- WebDAV configuration is stored in `chrome.storage.local`.
- A password-free metadata copy is stored in `chrome.storage.sync` for compatibility with existing records.
- Images are fetched and uploaded directly by the browser.
- No analytics, tracking, hosted API, or developer-operated server is used.
- Credentials are not app-level encrypted by this extension. They rely on Chrome profile and operating-system storage protections.

See [PRIVACY.md](PRIVACY.md) for the full privacy policy.

## Development Checks

Run syntax checks before packaging:

```bash
node --check background.js
node --check content_script.js
node --check options/options.js
```

Check for remote resources before Chrome Web Store submission:

```bash
rg "https://|http://|fonts.googleapis|gstatic|eval\\(|new Function" manifest.json background.js content_script.js options assets
```

The options page should use only packaged files and inline SVG symbols. Do not add remotely hosted scripts, styles, fonts, or icon fonts.

## Chrome Web Store Packaging

Recommended package contents:

```text
manifest.json
background.js
content_script.js
assets/
icons/
options/
PRIVACY.md
STORE_DESCRIPTION.md
```

Do not include repository-only files in the upload ZIP, such as `.git`, `docs/`, development notes, screenshots-in-progress, or OS metadata.

Manual packaging example:

```bash
mkdir -p dist/webdav-image-saver
cp manifest.json background.js content_script.js PRIVACY.md STORE_DESCRIPTION.md dist/webdav-image-saver/
cp -R assets icons options dist/webdav-image-saver/
cd dist
zip -X -r webdav-image-saver.zip webdav-image-saver
```

Before upload, verify:

- Manifest version and description are final.
- Icons are exactly 16x16, 48x48, and 128x128.
- The ZIP contains only runtime files.
- The privacy policy URL is public and matches actual behavior.
- Store listing claims match implemented features.

## Repository

GitHub: [mrjoechen/webdav-image-saver](https://github.com/mrjoechen/webdav-image-saver)

## License

Add a license before publishing if this repository is intended to be open source.
