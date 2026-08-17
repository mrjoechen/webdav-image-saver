const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.resolve(__dirname, '..');

function readProjectFile(relativePath) {
  return readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

test('background loads format support and routes selected formats through conversion', () => {
  const backgroundSource = readProjectFile('background.js');

  assert.match(backgroundSource, /importScripts\(['"]image-format\.js['"]\)/);
  assert.match(backgroundSource, /importScripts\(['"]settings\.js['"]\)/);
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
  assert.match(backgroundSource, /preparedImage\.mimeType/);
  assert.match(backgroundSource, /preparedImage\.filename/);
  assert.match(backgroundSource, /preparedImage\.blob/);
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

test('options page exposes and persists the global image format preference', () => {
  const optionsHtml = readProjectFile('options/options.html');
  const optionsSource = readProjectFile('options/options.js');
  const optionsCss = readProjectFile('options/options.css');

  assert.match(optionsHtml, /id="image-format-settings-btn"/);
  assert.match(optionsHtml, /id="image-format-modal"/);
  assert.match(optionsHtml, /<script src="\.\.\/image-format\.js"><\/script>/);
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

  assert.match(optionsSource, /imageFormatPreference/);
  assert.match(optionsSource, /ImageFormat\.normalizeFormatPreference/);
  assert.match(optionsSource, /AppSettings\.loadSettings/);
  assert.match(optionsSource, /AppSettings\.updateSettings/);
  assert.doesNotMatch(optionsSource, /chrome\.storage\.local\.set\(\{ imageFormatPreference/);
  assert.match(optionsSource, /action: ['"]configUpdated['"]/);
  assert.match(optionsSource, /function openImageFormatSelect/);
  assert.match(optionsSource, /function closeImageFormatSelect/);
  assert.match(optionsSource, /function selectImageFormat/);
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