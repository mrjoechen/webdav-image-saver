const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.resolve(__dirname, '..');

function readProjectFile(relativePath) {
  return readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

test('background loads save-rule support and routes selected formats through conversion', () => {
  const backgroundSource = readProjectFile('background.js');

  assert.match(backgroundSource, /importScripts\(['"]image-format\.js['"]\);\s*importScripts\(['"]filename-rule\.js['"]\);\s*importScripts\(['"]directory-rule\.js['"]\);\s*importScripts\(['"]settings\.js['"]\)/);
  assert.match(backgroundSource, /AppSettings\.loadSettings/);
  assert.match(backgroundSource, /appSettings\.image\.saveFormat/);
  assert.match(backgroundSource, /configReloadQueue/);
  assert.match(backgroundSource, /message\.action === ['"]formatSelected['"]/);
  assert.match(backgroundSource, /message\.action === ['"]cancelFormatSelection['"]/);
  assert.match(backgroundSource, /chrome\.storage\.session/);
  assert.match(backgroundSource, /processingUploadIds/);
  assert.match(backgroundSource, /contentScriptInjectionPromises/);
  assert.match(backgroundSource, /message\.action === ['"]uploadCountdownComplete['"]/);
  assert.match(backgroundSource, /ImageFormat\.prepareImageForUpload/);
  assert.match(backgroundSource, /pageTitle:\s*tab\.title\s*\|\|\s*''/);
  assert.match(backgroundSource, /async function beginSaveFlow\(\{ serverConfig, imageUrl, pageUrl, pageTitle, tabId \}\)/);
  assert.match(backgroundSource, /operation\.pageTitle/);
  assert.match(backgroundSource, /FilenameRule\.readImageDimensions\(imageBlob\)/);
  assert.match(backgroundSource, /FilenameRule\.extractSourceExtension\(imageUrl\)/);
  assert.match(backgroundSource, /FilenameRule\.generateFilename\(/);
  assert.match(backgroundSource, /DirectoryRule\.resolveDirectory\(/);
  assert.match(backgroundSource, /await ensureWebdavDirectories\(serverConfig, targetDirectory\.foldersToCreate\)/);
  assert.match(backgroundSource, /buildWebdavResourceUrl\(serverConfig\.url, targetDirectory\.folder, filename\)/);
  assert.match(backgroundSource, /method:\s*'MKCOL'/);
  assert.match(backgroundSource, /method:\s*'PROPFIND'/);
  assert.match(backgroundSource, /\.append\('Depth', '0'\)/);
  assert.match(backgroundSource, /preparedImage\.mimeType/);
  assert.match(backgroundSource, /preparedImage\.blob/);
  assert.doesNotMatch(backgroundSource, /function generateFilename\(/);
  assert.doesNotMatch(backgroundSource, /setTimeout\s*\(/);
});

test('content script exposes a per-save chooser and warning status', () => {
  const contentSource = readProjectFile('content_script.js');
  const bubbleCss = readProjectFile('assets/bubble.css');

  assert.match(contentSource, /function showFormatChooser/);
  assert.match(contentSource, /function sendRuntimeMessage/);
  assert.match(contentSource, /action: ['"]formatSelected['"]/);
  assert.match(contentSource, /action: ['"]cancelFormatSelection['"]/);
  assert.match(contentSource, /action: ['"]uploadCountdownComplete['"]/);
  assert.match(contentSource, /cancelButton\.disabled = true/);
  assert.match(contentSource, /message\.action === ['"]showFormatChooser['"]/);
  assert.match(bubbleCss, /\.webdav-format-chooser/);
  assert.match(bubbleCss, /\.webdav-saver-status-bubble\.warning/);
});

test('options page exposes and persists combined save settings', () => {
  const optionsHtml = readProjectFile('options/options.html');
  const optionsSource = readProjectFile('options/options.js');
  const optionsCss = readProjectFile('options/options.css');

  assert.match(optionsHtml, /id="save-settings-btn"[^>]*aria-label="Save settings"[^>]*title="Save settings"/);
  assert.match(optionsHtml, /id="save-settings-modal"/);
  assert.match(optionsHtml, /id="save-settings-form"/);
  assert.match(optionsHtml, /<h3>Save settings<\/h3>/);
  assert.match(optionsHtml, /id="close-save-settings-btn"/);
  assert.match(optionsHtml, /id="cancel-save-settings-btn"/);
  assert.match(optionsHtml, /id="save-save-settings-btn"/);
  assert.doesNotMatch(optionsHtml, /id="image-format-settings-btn"/);
  assert.doesNotMatch(optionsHtml, /id="image-format-modal"/);
  assert.doesNotMatch(optionsHtml, /id="image-format-form"/);
  assert.match(optionsHtml, /<script src="\.\.\/image-format\.js"><\/script>/);
  assert.match(optionsHtml, /<script src="\.\.\/image-format\.js"><\/script>\s*<script src="\.\.\/filename-rule\.js"><\/script>\s*<script src="\.\.\/directory-rule\.js"><\/script>\s*<script src="\.\.\/settings\.js"><\/script>/);
  assert.match(optionsHtml, /<script src="\.\.\/settings\.js"><\/script>/);
  assert.doesNotMatch(optionsHtml, /<select[^>]*id="image-format-preference"/);
  assert.match(optionsHtml, /id="image-format-trigger"[^>]*role="combobox"/);
  assert.match(optionsHtml, /id="image-format-options"[^>]*role="listbox"/);
  for (const [value, label] of [
    ['original', 'Original'],
    ['ask', 'Ask every time'],
    ['png', 'PNG'],
    ['jpg', 'JPG'],
    ['webp', 'WebP']
  ]) {
    assert.match(optionsHtml, new RegExp(`role="option"[^>]*data-value="${value}"[^>]*>[\\s\\S]*?${label}`));
  }

  assert.match(optionsHtml, /<label[^>]*for="filename-rule"[^>]*>File naming rule<\/label>/);
  for (const [value, label] of [
    ['automatic', 'Automatic'],
    ['original', 'Original filename'],
    ['custom', 'Custom template']
  ]) {
    assert.match(optionsHtml, new RegExp(`<option value="${value}">${label}<\\/option>`));
  }
  assert.match(optionsHtml, /id="filename-template-group"[^>]*hidden/);
  assert.match(optionsHtml, /id="filename-template"[^>]*aria-describedby="filename-template-error"/);
  assert.match(optionsHtml, /id="filename-template-error"[^>]*role="alert"[^>]*aria-live="polite"/);
  assert.match(optionsHtml, /id="filename-preview"[^>]*aria-live="polite"/);
  for (const token of ['originalName', 'date', 'time', 'domain', 'pageTitle', 'width', 'height', 'ext']) {
    assert.match(optionsHtml, new RegExp(`\\{${token}\\}`));
  }

  assert.match(optionsHtml, /<label[^>]*for="directory-rule"[^>]*>Save directory rule<\/label>/);
  for (const [value, label] of [
    ['fixed', 'Fixed directory'],
    ['date', 'By date'],
    ['domain', 'By website'],
    ['domain-date', 'By website and date']
  ]) {
    assert.match(optionsHtml, new RegExp(`<option value="${value}">${label}<\\/option>`));
  }
  assert.match(optionsHtml, /relative to the target folder configured on the selected WebDAV server/i);
  assert.match(optionsHtml, /\/Images is only an example/i);

  assert.match(optionsSource, /persistedSaveSettings/);
  assert.match(optionsSource, /ImageFormat\.normalizeFormatPreference/);
  assert.match(optionsSource, /AppSettings\.loadSettings/);
  assert.match(optionsSource, /AppSettings\.updateSettings/);
  assert.match(optionsSource, /FilenameRule\.validateTemplate/);
  assert.match(optionsSource, /FilenameRule\.generateFilename/);
  assert.match(optionsSource, /FilenameRule\.normalizeFilenameRule/);
  assert.match(optionsSource, /DirectoryRule\.normalizeDirectoryRule/);
  assert.match(optionsSource, /image:\s*\{\s*saveFormat:/s);
  assert.match(optionsSource, /filename:\s*\{\s*rule:.*customTemplate:/s);
  assert.match(optionsSource, /directory:\s*\{\s*rule:/s);
  assert.doesNotMatch(optionsSource, /chrome\.storage\.local\.set\(\{ imageFormatPreference/);
  assert.match(optionsSource, /action: ['"]configUpdated['"]/);
  assert.match(optionsSource, /function openImageFormatSelect/);
  assert.match(optionsSource, /function closeImageFormatSelect/);
  assert.match(optionsSource, /function selectImageFormat/);
  assert.match(optionsSource, /function restoreSaveSettingsControls/);
  assert.match(optionsSource, /function updateFilenameRuleEditor/);
  assert.match(optionsSource, /function closeSaveSettingsModal\(\)\s*\{[\s\S]*?restoreSaveSettingsControls\(\);/);
  assert.match(optionsSource, /filenameTemplateGroup\?\.toggleAttribute\(['"]hidden['"], !isCustom\)/);
  assert.match(optionsSource, /saveSaveSettingsBtn\.disabled = invalid/);
  assert.match(optionsSource, /event\.target === elements\.saveSettingsModal/);
  assert.match(optionsSource, /new Date\(2026,\s*7,\s*20,\s*14,\s*35,\s*9\)/);
  assert.match(optionsSource, /imageUrl:\s*['"]https:\/\/cdn\.example\.net\/photos\/sunset\.png['"]/);
  assert.match(optionsSource, /pageUrl:\s*['"]https:\/\/www\.example\.com\/article['"]/);
  assert.match(optionsSource, /pageTitle:\s*['"]Summer trip['"]/);
  assert.match(optionsSource, /width:\s*1920/);
  assert.match(optionsSource, /height:\s*1080/);
  assert.match(optionsCss, /\.save-settings-container\s*\{[^}]*max-height:\s*90vh;[^}]*overflow:\s*hidden;/s);
  assert.match(optionsCss, /\.save-settings-container \.modal-content\s*\{[^}]*overflow-y:\s*auto;/s);
  assert.match(optionsCss, /\.settings-section/);
  assert.match(optionsCss, /\.settings-select/);
  assert.match(optionsCss, /\.filename-preview/);
  assert.match(optionsCss, /\.form-error/);
  assert.match(optionsCss, /\.form-input\.is-invalid/);
  assert.match(optionsCss, /\.format-select-list\s*\{[^}]*top:\s*calc\(100% - 1px\);/s);
  assert.match(optionsCss, /\.format-select-chevron\s*\{[^}]*right:\s*14px;/s);
});

test('theme toggle uses a balanced moon icon without resizing between themes', () => {
  const optionsHtml = readProjectFile('options/options.html');
  const optionsCss = readProjectFile('options/options.css');

  assert.match(
    optionsHtml,
    /<symbol id="icon-moon"[^>]*><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"\/><\/symbol>/
  );
  assert.match(optionsCss, /\.theme-toggle \.ui-icon\s*\{[^}]*width:\s*22px;[^}]*height:\s*22px;/s);
});
