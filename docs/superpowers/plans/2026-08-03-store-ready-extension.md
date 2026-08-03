# Store-Ready WebDAV Image Saver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a self-contained, least-privilege Manifest V3 extension with encrypted WebDAV credentials, reliable uploads, automatic Chinese/English localization, a minimal options UI, and a reproducible Chrome Web Store package.

**Architecture:** Keep Chrome event coordination in a small ES-module service worker and move validation, cryptography, permissions, filenames, WebDAV requests, and configuration persistence into focused modules. Use Node's built-in test runner for pure logic and policy/package checks; use dependency injection at Chrome API boundaries so behavior can be verified without adding runtime dependencies.

**Tech Stack:** Chrome Extension Manifest V3, JavaScript ES modules, Chrome APIs, Web Crypto AES-GCM, IndexedDB, HTML/CSS, Node.js `node:test`, shell `zip`/macOS `sips` for release assets.

---

## File Map

- Modify `manifest.json`: localized metadata, module service worker, required permissions, optional HTTPS origins, local-only CSP.
- Create `package.json`: test, check, and package commands with no runtime dependencies.
- Create `_locales/en/messages.json`: English extension and UI messages.
- Create `_locales/zh_CN/messages.json`: Simplified Chinese messages with identical keys.
- Create `lib/config.js`: normalize, validate, encrypt, migrate, load, save, and delete server configurations.
- Create `lib/crypto.js`: AES-GCM encryption and persistent non-exportable IndexedDB key management.
- Create `lib/permissions.js`: exact origin pattern conversion and optional permission handling.
- Create `lib/filename.js`: safe unique image filename generation.
- Create `lib/webdav.js`: UTF-8 Basic Auth, connection testing, URL construction, image fetching, and PUT upload.
- Rewrite `background.js`: event registration and upload orchestration only.
- Rewrite `content_script.js`: accessible countdown/status UI and cancellation messaging.
- Rewrite `assets/bubble.css`: isolated, compact, reduced-motion-aware injected UI.
- Rewrite `options/options.html`: semantic, self-contained settings markup.
- Rewrite `options/options.css`: compact system-settings visual design.
- Rewrite `options/options.js`: localized state/render/form controller without user-data `innerHTML`.
- Create `scripts/check-extension.mjs`: manifest, locales, icons, and remote-code policy audit.
- Create `scripts/package-extension.mjs`: deterministic allowlisted release directory and ZIP.
- Create tests under `tests/`: pure behavior, policy, and static UI regression coverage.
- Rewrite `README.md`, `PRIVACY.md`, and `STORE_DESCRIPTION.md`: accurate functionality, handling, permissions, and submission copy.
- Create `docs/CHROME_WEB_STORE_CHECKLIST.md`: dashboard and manual review checklist.

### Task 1: Test Harness, Manifest, and Localization Foundation

**Files:**
- Create: `package.json`
- Create: `tests/manifest.test.js`
- Create: `tests/locales.test.js`
- Create: `_locales/en/messages.json`
- Create: `_locales/zh_CN/messages.json`
- Modify: `manifest.json`

- [ ] **Step 1: Add the test harness and failing compliance tests**

Create `package.json`:

```json
{
  "name": "webdav-image-saver",
  "version": "1.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test",
    "check": "node scripts/check-extension.mjs",
    "package": "node scripts/package-extension.mjs"
  }
}
```

Create tests that assert the desired manifest contract:

```js
// tests/manifest.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url)));

test('manifest uses localized MV3 metadata and a module worker', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.default_locale, 'en');
  assert.equal(manifest.name, '__MSG_extensionName__');
  assert.equal(manifest.description, '__MSG_extensionDescription__');
  assert.equal(manifest.background.type, 'module');
});

test('manifest grants no host at install time', () => {
  assert.equal(manifest.host_permissions, undefined);
  assert.deepEqual(manifest.optional_host_permissions, ['https://*/*']);
  assert.deepEqual(new Set(manifest.permissions), new Set(['activeTab', 'contextMenus', 'scripting', 'storage']));
  assert.equal(manifest.web_accessible_resources, undefined);
});
```

```js
// tests/locales.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readMessages = async locale => JSON.parse(await readFile(new URL(`../_locales/${locale}/messages.json`, import.meta.url)));

test('English and Chinese locales expose the same non-empty keys', async () => {
  const [en, zh] = await Promise.all([readMessages('en'), readMessages('zh_CN')]);
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort());
  for (const messages of [en, zh]) {
    for (const [key, value] of Object.entries(messages)) {
      assert.match(key, /^[A-Za-z][A-Za-z0-9_]*$/);
      assert.equal(typeof value.message, 'string');
      assert.notEqual(value.message.trim(), '');
    }
  }
});
```

- [ ] **Step 2: Run the tests and verify the expected failures**

Run: `npm test -- tests/manifest.test.js tests/locales.test.js`

Expected: manifest assertions fail and locale files report `ENOENT`.

- [ ] **Step 3: Implement the compliant manifest and complete locale catalogs**

Set manifest version `1.1.0`, `default_locale: "en"`, localized `name`/`description`, required permissions, `optional_host_permissions: ["https://*/*"]`, module worker, options page, action title/icons, and self-only extension CSP. Remove `host_permissions` and `web_accessible_resources`.

Both locale files must define every static and dynamic key used by the implementation, including:

```json
{
  "extensionName": { "message": "WebDAV Image Saver" },
  "extensionDescription": { "message": "Save images to your HTTPS WebDAV server from the context menu." },
  "actionTitle": { "message": "Open WebDAV Image Saver settings" },
  "settingsIntro": { "message": "Save web images directly to your own WebDAV server." },
  "addServer": { "message": "Add server" },
  "editServer": { "message": "Edit server" },
  "deleteServer": { "message": "Delete server" },
  "testConnection": { "message": "Test connection" },
  "save": { "message": "Save" },
  "cancel": { "message": "Cancel" },
  "serverNameLabel": { "message": "Name" },
  "serverUrlLabel": { "message": "HTTPS WebDAV URL" },
  "usernameLabel": { "message": "Username" },
  "passwordLabel": { "message": "Password" },
  "folderLabel": { "message": "Target folder" },
  "permissionDenied": { "message": "Access was not granted for this domain." },
  "httpsRequired": { "message": "Only HTTPS addresses are supported." },
  "connectionSucceeded": { "message": "Connection successful." },
  "connectionFailed": { "message": "Connection failed: $DETAIL$", "placeholders": { "detail": { "content": "$1" } } },
  "uploadCountdown": { "message": "Saving to $SERVER$ in $SECONDS$s…", "placeholders": { "server": { "content": "$1" }, "seconds": { "content": "$2" } } },
  "uploadSucceeded": { "message": "Saved as $FILENAME$", "placeholders": { "filename": { "content": "$1" } } },
  "uploadCancelled": { "message": "Upload cancelled." }
}
```

Add natural Simplified Chinese values for the same catalog. The complete catalog is: `extensionName`, `extensionDescription`, `actionTitle`, `settingsIntro`, `serversTitle`, `emptyTitle`, `emptyDescription`, `addServer`, `editServer`, `deleteServer`, `testConnection`, `save`, `cancel`, `close`, `serverNameLabel`, `serverNamePlaceholder`, `serverUrlLabel`, `serverUrlPlaceholder`, `usernameLabel`, `usernamePlaceholder`, `passwordLabel`, `passwordPlaceholder`, `passwordKeepHint`, `folderLabel`, `folderPlaceholder`, `folderHint`, `dialogAddTitle`, `dialogEditTitle`, `permissionDenied`, `httpsRequired`, `invalidUrl`, `requiredFields`, `passwordRequired`, `connectionTesting`, `connectionSucceeded`, `connectionFailed`, `serverSaved`, `serverDeleted`, `saveFailed`, `loadFailed`, `confirmDelete`, `uploadCountdown`, `uploadSucceeded`, `uploadFailed`, `uploadCancelled`, `imagePermissionDenied`, `serverPermissionMissing`, `invalidImage`, `imageTooLarge`, `networkError`, `authenticationFailed`, `forbidden`, `notFound`, `serverError`, `migrationFailed`, `menuParent`, `menuDestination`, and `menuNoServers`.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm test -- tests/manifest.test.js tests/locales.test.js`

Expected: all Task 1 tests pass.

- [ ] **Step 5: Commit the foundation**

```bash
git add package.json manifest.json _locales tests/manifest.test.js tests/locales.test.js
git commit -m "chore: establish store-compliant extension foundation"
```

### Task 2: Input Normalization and Safe Filenames

**Files:**
- Create: `lib/config.js`
- Create: `lib/filename.js`
- Create: `tests/config.test.js`
- Create: `tests/filename.test.js`

- [ ] **Step 1: Write failing normalization and filename tests**

```js
// tests/config.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFolder, normalizeServerInput } from '../lib/config.js';

test('normalizes an HTTPS server without discarding its WebDAV base path', () => {
  assert.deepEqual(normalizeServerInput({
    name: ' NAS ', url: 'https://dav.example.com/remote.php/dav/', username: ' joe ', folder: 'Images/2026/'
  }), {
    name: 'NAS', url: 'https://dav.example.com/remote.php/dav', username: 'joe', folder: '/Images/2026'
  });
});

test('rejects HTTP, embedded credentials, queries, and fragments', () => {
  for (const url of ['http://dav.example.com', 'https://u:p@dav.example.com', 'https://dav.example.com/?x=1', 'https://dav.example.com/#x']) {
    assert.throws(() => normalizeServerInput({ name: 'x', url, username: 'u', folder: '/' }));
  }
});

test('normalizes root and repeated folder separators', () => {
  assert.equal(normalizeFolder('///'), '/');
  assert.equal(normalizeFolder(' Photos // 2026 / '), '/Photos/2026');
});
```

```js
// tests/filename.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { extensionForMime, generateFilename } from '../lib/filename.js';

test('maps only known image MIME types to safe extensions', () => {
  assert.equal(extensionForMime('image/jpeg'), 'jpg');
  assert.equal(extensionForMime('image/svg+xml; charset=utf-8'), 'svg');
  assert.throws(() => extensionForMime('text/html'));
});

test('creates deterministic safe names with an injected random suffix', () => {
  assert.equal(generateFilename({
    pageUrl: 'https://news.example.com/a', mimeType: 'image/png',
    now: new Date('2026-08-03T04:05:06.007Z'), randomSuffix: 'a1b2c3'
  }), 'image_20260803_040506007_news_example_com_a1b2c3.png');
});
```

- [ ] **Step 2: Run tests and confirm imports fail**

Run: `npm test -- tests/config.test.js tests/filename.test.js`

Expected: fail because `lib/config.js` and `lib/filename.js` do not exist.

- [ ] **Step 3: Implement minimal pure helpers**

Implement `normalizeServerInput()` with `new URL()`, strict `https:` enforcement, credential/query/fragment rejection, trimmed required fields, and length limits of 80 characters for name, 2048 for URL, 320 for username, and 1024 for folder. Implement `normalizeFolder()` by trimming segments, removing empty segments, and rejecting `.` and `..`.

Implement `extensionForMime()` with an explicit map for JPEG, PNG, GIF, WebP, AVIF, SVG, BMP, and ICO. Implement `generateFilename()` with UTC components, a sanitized hostname, and a six-character lowercase hexadecimal suffix supplied by the caller or generated with `crypto.getRandomValues()`.

- [ ] **Step 4: Run tests and verify green**

Run: `npm test -- tests/config.test.js tests/filename.test.js`

Expected: all Task 2 tests pass.

- [ ] **Step 5: Commit normalization helpers**

```bash
git add lib/config.js lib/filename.js tests/config.test.js tests/filename.test.js
git commit -m "feat: validate WebDAV settings and image filenames"
```

### Task 3: AES-GCM Credential Storage and Legacy Migration

**Files:**
- Create: `lib/crypto.js`
- Modify: `lib/config.js`
- Create: `tests/crypto.test.js`
- Modify: `tests/config.test.js`

- [ ] **Step 1: Write failing cryptography and migration tests**

```js
// tests/crypto.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeviceKey, decryptPassword, encryptPassword } from '../lib/crypto.js';

test('encrypts Unicode credentials with a fresh IV and decrypts them', async () => {
  const key = await createDeviceKey();
  const first = await encryptPassword('密碼🔐', key);
  const second = await encryptPassword('密碼🔐', key);
  assert.notEqual(first.passwordCipher, '密碼🔐');
  assert.notEqual(first.passwordIv, second.passwordIv);
  assert.equal(await decryptPassword(first, key), '密碼🔐');
});

test('ciphertext cannot be decrypted with a different key', async () => {
  const record = await encryptPassword('secret', await createDeviceKey());
  await assert.rejects(decryptPassword(record, await createDeviceKey()));
});
```

Add a config test using in-memory `storage` and `keyProvider` adapters. It must prove `migrateLegacyServers()` writes schema version 2 records without a `password` property, decrypts successfully, and removes `webdavServers` from both local and sync only after verification.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- tests/crypto.test.js tests/config.test.js`

Expected: fail because crypto exports and migration APIs are missing.

- [ ] **Step 3: Implement AES-GCM and IndexedDB key management**

Implement:

```js
export async function createDeviceKey(cryptoImpl = globalThis.crypto) {
  return cryptoImpl.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encryptPassword(password, key, cryptoImpl = globalThis.crypto) {
  const iv = cryptoImpl.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(password);
  const ciphertext = await cryptoImpl.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return { passwordCipher: bytesToBase64(new Uint8Array(ciphertext)), passwordIv: bytesToBase64(iv) };
}
```

Add complementary decoding/decryption and `getOrCreateDeviceKey()` backed by IndexedDB database `webdav-image-saver`, object store `keys`, key `device-aes-gcm-v1`. Reject if the stored object is not a `CryptoKey` with AES-GCM, non-extractable, encrypt/decrypt usages.

- [ ] **Step 4: Implement versioned config persistence and safe migration**

Add `loadServers()`, `getServer()`, `saveServer()`, `deleteServer()`, and `migrateLegacyServers()` to `lib/config.js`. Accept injected `{ local, sync, keyProvider }` adapters in tests and default to Chrome storage plus `getOrCreateDeviceKey()` in production. Editing with an empty password preserves existing ciphertext; creating with an empty password throws `PASSWORD_REQUIRED`.

- [ ] **Step 5: Run tests and verify green**

Run: `npm test -- tests/crypto.test.js tests/config.test.js`

Expected: all encryption, wrong-key, persistence, edit, delete, and migration tests pass.

- [ ] **Step 6: Commit encrypted storage**

```bash
git add lib/crypto.js lib/config.js tests/crypto.test.js tests/config.test.js
git commit -m "feat: encrypt persisted WebDAV credentials"
```

### Task 4: Exact Optional Host Permissions

**Files:**
- Create: `lib/permissions.js`
- Create: `tests/permissions.test.js`

- [ ] **Step 1: Write failing permission tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureOriginPermission, toOriginPattern } from '../lib/permissions.js';

test('converts an HTTPS URL to one exact origin pattern', () => {
  assert.equal(toOriginPattern('https://dav.example.com:8443/root'), 'https://dav.example.com:8443/*');
});

test('rejects non-HTTPS and credential-bearing URLs', () => {
  assert.throws(() => toOriginPattern('http://dav.example.com/a'));
  assert.throws(() => toOriginPattern('https://u:p@dav.example.com/a'));
});

test('requests only when the exact origin is absent', async () => {
  const calls = [];
  const api = {
    contains: async value => (calls.push(['contains', value]), false),
    request: async value => (calls.push(['request', value]), true)
  };
  assert.equal(await ensureOriginPermission('https://img.example/a.png', api), true);
  assert.deepEqual(calls[1][1], { origins: ['https://img.example/*'] });
});
```

- [ ] **Step 2: Run and confirm RED**

Run: `npm test -- tests/permissions.test.js`

Expected: fail because the module is missing.

- [ ] **Step 3: Implement exact-origin permission helpers**

Implement `toOriginPattern()`, `hasOriginPermission()`, and `ensureOriginPermission()`. The request function returns `false` for a user denial, throws stable `HTTPS_REQUIRED`/`INVALID_URL` codes for invalid input, and never requests `https://*/*` at runtime.

- [ ] **Step 4: Run and verify green**

Run: `npm test -- tests/permissions.test.js`

Expected: all permission tests pass.

- [ ] **Step 5: Commit permission handling**

```bash
git add lib/permissions.js tests/permissions.test.js
git commit -m "feat: request host access per domain"
```

### Task 5: WebDAV Connection and Upload Client

**Files:**
- Create: `lib/webdav.js`
- Create: `tests/webdav.test.js`

- [ ] **Step 1: Write failing WebDAV tests**

Cover UTF-8 Basic Auth round-trip, encoded folder segments, 207 success, 401/403/404 classification, timeout/network failure, non-image rejection, declared/actual 50 MiB limit, PUT success, and response-body redaction. Representative tests:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { basicAuthorization, buildTargetUrl, testConnection } from '../lib/webdav.js';

test('encodes Unicode Basic Auth as UTF-8 bytes', () => {
  const encoded = basicAuthorization('用户', '密碼').slice('Basic '.length);
  assert.equal(Buffer.from(encoded, 'base64').toString('utf8'), '用户:密碼');
});

test('encodes each target folder segment', () => {
  assert.equal(
    buildTargetUrl('https://dav.example/base', '/图片/2026 summer', 'a b.png'),
    'https://dav.example/base/%E5%9B%BE%E7%89%87/2026%20summer/a%20b.png'
  );
});

test('does not treat a 404 as a successful connection', async () => {
  const fetchImpl = async () => new Response('', { status: 404 });
  await assert.rejects(testConnection({ url: 'https://dav.example', username: 'u', password: 'p' }, { fetchImpl }), { code: 'NOT_FOUND' });
});
```

- [ ] **Step 2: Run and confirm RED**

Run: `npm test -- tests/webdav.test.js`

Expected: fail because the module does not exist.

- [ ] **Step 3: Implement the connection client**

Implement `basicAuthorization()` using `TextEncoder`, `buildTargetUrl()` with encoded segments, and `testConnection()` using `PROPFIND`, `Depth: 0`, an XML request body, `credentials: 'omit'`, and an injected fetch. Accept status 200–299, including 207. Throw errors with stable codes: `AUTH_FAILED`, `FORBIDDEN`, `NOT_FOUND`, `SERVER_ERROR`, `TIMEOUT`, and `NETWORK_ERROR`.

- [ ] **Step 4: Implement image fetch and PUT**

Implement `fetchImage()` and `uploadImage()` with a shared `AbortSignal`. Reject non-`image/*`, zero bytes, `Content-Length > 52_428_800`, and final Blob sizes above 52_428_800. Build the filename after reading the MIME type, then PUT with `Authorization`, the exact image content type, and `credentials: 'omit'`. Return `{ filename, size, mimeType }` only for successful 2xx responses.

- [ ] **Step 5: Run and verify green**

Run: `npm test -- tests/webdav.test.js`

Expected: every WebDAV client test passes without network access.

- [ ] **Step 6: Commit the client**

```bash
git add lib/webdav.js tests/webdav.test.js
git commit -m "feat: harden WebDAV connection and uploads"
```

### Task 6: Service Worker Orchestration

**Files:**
- Rewrite: `background.js`
- Create: `tests/background-static.test.js`
- Modify: `_locales/en/messages.json`
- Modify: `_locales/zh_CN/messages.json`

- [ ] **Step 1: Write static and contract tests first**

Test that `background.js` imports the focused modules, registers `runtime.onInstalled`, `contextMenus.onClicked`, `runtime.onMessage`, and `action.onClicked`, contains no `chrome.storage.sync.get('webdavServers')`, does not log configuration/password objects, and does not call the removed notification helper.

- [ ] **Step 2: Run and confirm the old worker fails**

Run: `npm test -- tests/background-static.test.js`

Expected: fail on module imports, action handler, and legacy storage usage.

- [ ] **Step 3: Rewrite the worker as an event coordinator**

Implement:

```js
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
chrome.runtime.onInstalled.addListener(async () => {
  await migrateLegacyServers();
  await rebuildContextMenus();
});
chrome.contextMenus.onClicked.addListener(handleContextMenuClick);
chrome.runtime.onMessage.addListener(handleMessage);
```

`rebuildContextMenus()` loads fresh sanitized server records and creates one parent plus one child per server. `handleContextMenuClick()` reloads the selected encrypted record, requests only the image origin, injects packaged CSS/script under `activeTab`, shows the three-second countdown, stores `{ timer, controller, tabId }` in a `Map`, and uploads after the timer. Cancellation clears the timer and aborts the controller. `testWebdav` decrypts only for the duration of the request. `configUpdated` rebuilds menus. All user-facing strings come from `chrome.i18n.getMessage()`.

- [ ] **Step 4: Run syntax and worker tests**

Run: `node --check background.js && npm test -- tests/background-static.test.js`

Expected: syntax exit 0 and all worker contract tests pass.

- [ ] **Step 5: Commit orchestration**

```bash
git add background.js tests/background-static.test.js _locales
git commit -m "refactor: coordinate uploads in the MV3 worker"
```

### Task 7: Accessible In-Page Upload Feedback

**Files:**
- Rewrite: `content_script.js`
- Rewrite: `assets/bubble.css`
- Create: `tests/content-ui-static.test.js`

- [ ] **Step 1: Write failing injected-UI safety tests**

Assert that the content script uses `textContent`, creates buttons/elements through DOM methods, supplies `role="status"` or `role="alert"`, handles `ping`, countdown, removal, status, and cancellation actions, and contains no assignment to `innerHTML`. Assert CSS includes a fixed extension-specific root, visible focus, and `prefers-reduced-motion`.

- [ ] **Step 2: Run and confirm RED**

Run: `npm test -- tests/content-ui-static.test.js`

Expected: old `innerHTML` and missing accessibility assertions fail.

- [ ] **Step 3: Rewrite the content script and CSS**

Build the bubble using `document.createElement()`. Use one fixed container with extension-prefixed classes, a polite live status during countdown, an alert for errors, a cancel button with the localized label supplied in the message, and cleanup of all intervals/timeouts. CSS uses a system font, 12px radius for the panel, 8px for buttons, one blue accent, green/red semantic states, a focus-visible outline, and no page-global selectors.

- [ ] **Step 4: Run and verify green**

Run: `node --check content_script.js && npm test -- tests/content-ui-static.test.js`

Expected: syntax and all injected-UI tests pass.

- [ ] **Step 5: Commit feedback UI**

```bash
git add content_script.js assets/bubble.css tests/content-ui-static.test.js
git commit -m "feat: add accessible upload feedback"
```

### Task 8: Minimal Localized Options Page

**Files:**
- Rewrite: `options/options.html`
- Rewrite: `options/options.css`
- Rewrite: `options/options.js`
- Create: `tests/options-static.test.js`
- Modify: `_locales/en/messages.json`
- Modify: `_locales/zh_CN/messages.json`

- [ ] **Step 1: Write failing options-page policy and accessibility tests**

Assert that HTML contains no `http://`, `https://`, remote `link`, or material icon font; includes a semantic `main`, dialog role/ARIA, explicit labels, live notification region, and module script. Assert JS localizes every `[data-i18n]`, requests the exact server origin before testing/saving, uses `textContent`/DOM creation for server values, restores focus after modal close, preserves an existing password when the edit field is empty, and contains no `innerHTML` assignment.

- [ ] **Step 2: Run and confirm RED**

Run: `npm test -- tests/options-static.test.js`

Expected: fail on remote fonts, missing dialog semantics, non-module script, and `innerHTML`.

- [ ] **Step 3: Implement semantic self-contained HTML**

Create a 760px settings shell with header title/description/add button, one list surface, one empty state, an accessible add/edit dialog, five labeled fields, inline validation/status, test/cancel/save actions, and a live notification. Use plain text or packaged inline SVG symbols; do not embed remote URLs or inline event handlers.

- [ ] **Step 4: Implement the visual system**

Rewrite CSS with system fonts, cool neutral variables, a single blue accent, 12px surfaces/8px controls, flat divided server rows, 44px minimum primary controls, responsive single-column form layout below 640px, visible `:focus-visible`, disabled/loading/error/success states, and `prefers-reduced-motion`. Avoid gradients, backdrop filters, generic card shadows, and hover translation.

- [ ] **Step 5: Implement the localized controller**

Import config and permission helpers. Localize marked text and placeholders on DOMContentLoaded. Render untrusted values only via `textContent`. On test/save, validate first, call `ensureOriginPermission(url)`, then send the test or persist the encrypted record. On edit, leave the password field empty with localized “leave blank to keep” help. Use a modal focus trap, Escape, backdrop close, and trigger-focus restoration. Confirm deletion before calling `deleteServer()` and notify the worker to rebuild menus after mutations.

- [ ] **Step 6: Run and verify green**

Run: `node --check options/options.js && npm test -- tests/options-static.test.js tests/locales.test.js tests/config.test.js tests/permissions.test.js`

Expected: syntax and all options/localization/config/permission tests pass.

- [ ] **Step 7: Commit the settings redesign**

```bash
git add options _locales tests/options-static.test.js
git commit -m "feat: redesign and localize extension settings"
```

### Task 9: Documentation, Exact Icons, and Release Audit

**Files:**
- Rewrite: `README.md`
- Rewrite: `PRIVACY.md`
- Rewrite: `STORE_DESCRIPTION.md`
- Create: `docs/CHROME_WEB_STORE_CHECKLIST.md`
- Create: `scripts/check-extension.mjs`
- Create: `scripts/package-extension.mjs`
- Modify: `icons/icon16.png`
- Modify: `icons/icon48.png`
- Modify: `icons/icon128.png`
- Create: `tests/docs.test.js`
- Create: `tests/release.test.js`

- [ ] **Step 1: Write failing documentation and release tests**

Tests must reject placeholder brackets/domains, claims that Chrome storage itself encrypts credentials, claims of HTTP support, remote-code URLs in packaged HTML/CSS/JS, mismatched PNG dimensions, absent privacy disclosure topics, unequal locale keys, required host permissions, files outside the package allowlist, and ZIP entries beginning with `.git`, `tests`, `docs/superpowers`, or `node_modules`.

- [ ] **Step 2: Run and confirm RED**

Run: `npm test -- tests/docs.test.js tests/release.test.js`

Expected: fail on current placeholders, inaccurate claims, icon dimensions, and missing scripts/checklist.

- [ ] **Step 3: Rewrite public documentation accurately**

README covers installation, HTTPS-only WebDAV setup, per-domain permission prompts, encrypted local credentials, right-click usage, development tests, and package creation. Privacy policy identifies authentication information, website/image resources, storage/retention/deletion, direct transfers, AES-GCM at rest, HTTPS in transit, no developer collection/analytics/ads/human access, Limited Use compliance, and the real GitHub issues contact. Store description contains only implemented features and concise permission reasons.

The Web Store checklist specifies category, single purpose, privacy-field selections, permission justifications, privacy-policy URL, 1280×800 or 640×400 screenshots, 128×128 store icon, no remote-code declaration, test credentials/server guidance if reviewers need it, and ZIP upload verification.

- [ ] **Step 4: Resize icons to their declared dimensions**

Preserve the current source artwork in a temporary workspace path, then run:

```bash
cp icons/icon128.png /tmp/webdav-image-saver-icon-source.png
sips -z 16 16 /tmp/webdav-image-saver-icon-source.png --out icons/icon16.png
sips -z 48 48 /tmp/webdav-image-saver-icon-source.png --out icons/icon48.png
sips -z 128 128 /tmp/webdav-image-saver-icon-source.png --out icons/icon128.png
```

Verify with `sips -g pixelWidth -g pixelHeight icons/icon16.png icons/icon48.png icons/icon128.png`.

- [ ] **Step 5: Implement audit and packaging scripts**

`check-extension.mjs` reads the package allowlist, manifest, locale files, PNG IHDR sizes, and text sources. It exits nonzero for remote executable/style references, `eval`/`new Function`, inline script handlers, host permissions, exposed resources, locale mismatch, icon mismatch, or missing files.

`package-extension.mjs` removes and recreates `dist/webdav-image-saver`, copies only manifest, background/content scripts, `lib`, `options`, `assets`, `_locales`, and `icons`, runs the checker against that directory, and creates `dist/webdav-image-saver-1.1.0.zip` with `zip -X -r`. It never copies documentation, tests, package metadata, or repository files.

- [ ] **Step 6: Run tests, audit, and package**

Run: `npm test -- tests/docs.test.js tests/release.test.js && npm run check && npm run package`

Expected: tests pass, checker prints a zero-error summary, and the ZIP is created. Run `unzip -l dist/webdav-image-saver-1.1.0.zip` and confirm only allowlisted runtime files appear.

- [ ] **Step 7: Commit release readiness**

```bash
git add README.md PRIVACY.md STORE_DESCRIPTION.md docs/CHROME_WEB_STORE_CHECKLIST.md scripts icons tests/docs.test.js tests/release.test.js
git commit -m "docs: prepare Chrome Web Store resubmission"
```

### Task 10: Full Verification and Chrome Acceptance Pass

**Files:**
- Modify only files implicated by verification failures.

- [ ] **Step 1: Run the complete automated suite from a clean command**

Run: `npm test`

Expected: zero failed, cancelled, or skipped tests.

- [ ] **Step 2: Run syntax checks for every runtime script**

Run:

```bash
for file in background.js content_script.js options/options.js lib/*.js; do node --check "$file"; done
```

Expected: exit 0 with no syntax errors.

- [ ] **Step 3: Run the policy audit and rebuild the release ZIP**

Run: `npm run check && npm run package && unzip -l dist/webdav-image-saver-1.1.0.zip`

Expected: audit exit 0 and a runtime-only ZIP listing.

- [ ] **Step 4: Load the unpacked release in a clean Chrome profile**

Load `dist/webdav-image-saver` from `chrome://extensions` with Developer mode enabled. Confirm there are no manifest, CSP, service worker, or options-page console errors; the toolbar action opens settings; Chinese Chrome shows Chinese and English Chrome shows English.

- [ ] **Step 5: Exercise the complete user flow**

Verify these cases individually:

1. HTTP WebDAV URL is rejected before a permission request.
2. HTTPS test requests exactly one origin and handles grant and denial.
3. Wrong credentials report authentication failure without exposing credentials.
4. Saving a new configuration produces no plaintext password in `chrome.storage.local` or `chrome.storage.sync`.
5. Editing with an empty password preserves the existing secret.
6. Right-clicking an HTTPS image requests only its origin the first time.
7. Countdown cancellation prevents a PUT.
8. Successful upload shows the generated filename and writes a valid image.
9. Non-image and oversized responses are rejected.
10. Delete removes the configuration and updates the context menu.
11. Browser restart still decrypts the saved configuration.
12. Options and page feedback are fully keyboard operable.

- [ ] **Step 6: Record any external test limitation honestly**

If no HTTPS WebDAV test endpoint is available, mark only the real connection/PUT cases as requiring publisher verification in `docs/CHROME_WEB_STORE_CHECKLIST.md`; do not mark them passed based on mocks.

- [ ] **Step 7: Commit verification-driven fixes, if any**

```bash
git add manifest.json background.js content_script.js lib options assets _locales scripts tests README.md PRIVACY.md STORE_DESCRIPTION.md docs/CHROME_WEB_STORE_CHECKLIST.md icons
git commit -m "fix: address release verification findings"
```

Skip this commit only if verification produced no file changes.
