const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ImageFormat = require('../image-format.js');
const FilenameRule = require('../filename-rule.js');
const DirectoryRule = require('../directory-rule.js');

const projectRoot = path.resolve(__dirname, '..');

function readProjectFile(relativePath) {
  return readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

function createFakeElement(id, { value = '', className = '', dataset = {}, hidden = false } = {}) {
  const attributes = new Map(hidden ? [['hidden', '']] : []);
  const classes = new Set(className.split(/\s+/).filter(Boolean));
  const listeners = new Map();
  const element = {
    id,
    value,
    textContent: '',
    innerHTML: '',
    disabled: false,
    dataset: { ...dataset },
    focused: false,
    classList: {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      contains: name => classes.has(name),
      toggle: (name, force) => {
        const enabled = force === undefined ? !classes.has(name) : Boolean(force);
        if (enabled) classes.add(name); else classes.delete(name);
        return enabled;
      }
    },
    addEventListener(type, listener) {
      listeners.set(type, [...(listeners.get(type) || []), listener]);
    },
    async emit(type, event = {}) {
      const preparedEvent = { target: element, preventDefault() {}, stopPropagation() {}, ...event };
      const results = (listeners.get(type) || []).map(listener => listener(preparedEvent));
      return Promise.all(results);
    },
    setAttribute(name, valueToSet) { attributes.set(name, String(valueToSet)); },
    getAttribute(name) { return attributes.has(name) ? attributes.get(name) : null; },
    toggleAttribute(name, force) {
      const enabled = force === undefined ? !attributes.has(name) : Boolean(force);
      if (enabled) attributes.set(name, ''); else attributes.delete(name);
      return enabled;
    },
    contains() { return false; },
    focus() { element.focused = true; },
    querySelector() { return null; }
  };
  Object.defineProperty(element, 'className', {
    get: () => [...classes].join(' '),
    set: next => {
      classes.clear();
      String(next).split(/\s+/).filter(Boolean).forEach(name => classes.add(name));
    }
  });
  return element;
}

function createOptionsHarness({ settings, updateSettings, configResponse = { success: true } }) {
  const ids = [
    'empty-state', 'servers-section', 'server-list', 'add-server-btn', 'add-first-server-btn',
    'save-settings-btn', 'save-settings-modal', 'save-settings-form', 'image-format-preference',
    'image-format-select', 'image-format-trigger', 'image-format-value', 'image-format-options',
    'filename-rule', 'filename-template-group', 'filename-template', 'filename-template-error',
    'filename-preview', 'directory-rule', 'close-save-settings-btn', 'cancel-save-settings-btn',
    'save-save-settings-btn', 'theme-toggle-btn', 'theme-toggle-icon', 'server-modal', 'modal-title',
    'close-modal-btn', 'cancel-btn', 'server-form', 'save-server-btn', 'test-connection-btn',
    'connection-status', 'folder-selection', 'custom-folder-path', 'open-folder-picker-btn',
    'folder-picker-modal', 'close-folder-picker-btn', 'cancel-folder-picker-btn', 'select-folder-btn',
    'folder-picker-back-btn', 'folder-picker-refresh-btn', 'folder-list', 'selected-folder-path', 'notification',
    'edit-id', 'server-name', 'server-url', 'server-username', 'server-password'
  ];
  const elements = Object.fromEntries(ids.map(id => [id, createFakeElement(id)]));
  ['empty-state', 'server-modal', 'save-settings-modal', 'folder-picker-modal'].forEach(id => {
    elements[id].classList.add('hidden');
  });
  elements['filename-rule'].value = 'automatic';
  elements['directory-rule'].value = 'fixed';
  elements['filename-template-group'].toggleAttribute('hidden', true);
  elements['theme-toggle-icon'].querySelector = () => createFakeElement('theme-use');
  const notificationIcon = createFakeElement('notification-icon');
  const notificationMessage = createFakeElement('notification-message');
  elements.notification.querySelector = selector => selector === '.notification-icon' ? notificationIcon : notificationMessage;

  const formatOptions = ['original', 'ask', 'png', 'jpg', 'webp'].map((value, index) => {
    const option = createFakeElement(`format-${value}`, { dataset: { value } });
    option.setAttribute('aria-selected', String(index === 0));
    return option;
  });
  const documentListeners = new Map();
  const document = {
    documentElement: { dataset: {} },
    getElementById: id => elements[id] || null,
    querySelectorAll: selector => selector === '.format-select-option' ? formatOptions : [],
    addEventListener(type, listener) { documentListeners.set(type, [...(documentListeners.get(type) || []), listener]); },
    async emit(type, event = {}) {
      return Promise.all((documentListeners.get(type) || []).map(listener => listener({ preventDefault() {}, ...event })));
    },
    createElement: () => createFakeElement('created'),
    createTextNode: text => ({ textContent: text })
  };
  const runtimeCalls = [];
  const chrome = {
    storage: {
      local: { get: async () => ({ webdavServers: [] }), set: async () => {}, remove: async () => {} },
      sync: { get: async () => ({}), remove: async () => {} }
    },
    runtime: { sendMessage: async message => { runtimeCalls.push(message); return configResponse; } }
  };
  const context = {
    document,
    window: { matchMedia: () => ({ matches: false }) },
    localStorage: { getItem: () => null, setItem: () => {} },
    chrome,
    AppSettings: { loadSettings: async () => settings, updateSettings },
    ImageFormat,
    FilenameRule,
    DirectoryRule,
    console: { error() {}, warn() {}, log() {} },
    confirm: () => true,
    setTimeout: () => 0
  };
  vm.runInNewContext(readProjectFile('options/options.js'), context, { filename: 'options.js' });
  return { elements, document, formatOptions, runtimeCalls, notificationMessage };
}

async function flushOptionsInit() {
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
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
  assert.match(optionsHtml, /id="filename-rule-helper"/);
  assert.match(optionsHtml, /id="filename-rule"[^>]*aria-describedby="filename-rule-helper"/);
  assert.match(optionsHtml, /id="filename-template-helper"/);
  assert.match(optionsHtml, /id="filename-template"[^>]*aria-describedby="filename-template-helper filename-template-error"/);
  assert.match(optionsHtml, /id="filename-template-error"[^>]*role="alert"[^>]*aria-live="polite"/);
  assert.match(optionsHtml, /id="filename-preview"[^>]*class="[^"]*template-preview[^"]*"[^>]*aria-live="polite"/);
  assert.match(optionsHtml, /class="[^"]*template-variables[^"]*"/);
  for (const token of ['originalName', 'date', 'time', 'domain', 'pageTitle', 'width', 'height', 'ext']) {
    assert.match(optionsHtml, new RegExp(`class="variable-token">\\{${token}\\}<\\/code>`));
  }
  assert.match(optionsHtml, /id="directory-rule-helper"/);
  assert.match(optionsHtml, /id="directory-rule"[^>]*aria-describedby="directory-rule-helper"/);

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
  assert.match(optionsSource, /template:\s*elements\.filenameTemplate\.value,/);
  assert.doesNotMatch(optionsSource, /template:\s*elements\.filenameTemplate\?\.value \|\| FilenameRule\.DEFAULT_CUSTOM_TEMPLATE/);
  assert.match(optionsCss, /\.save-settings-container\s*\{[^}]*max-height:\s*90vh;[^}]*overflow:\s*hidden;/s);
  assert.match(optionsCss, /\.save-settings-container \.modal-content\s*\{[^}]*overflow-y:\s*auto;/s);
  assert.match(optionsCss, /\.settings-section/);
  assert.match(optionsCss, /\.settings-select/);
  assert.match(optionsCss, /\.filename-preview/);
  assert.match(optionsCss, /\.template-preview/);
  assert.match(optionsCss, /\.template-variables/);
  assert.match(optionsCss, /\.variable-token/);
  assert.match(optionsCss, /\.form-error/);
  assert.match(optionsCss, /\.form-input\.is-invalid/);
  assert.match(optionsCss, /\.format-select-list\s*\{[^}]*top:\s*calc\(100% - 1px\);/s);
  assert.match(optionsCss, /\.format-select-chevron\s*\{[^}]*right:\s*14px;/s);
});

test('save settings modal restores edits, validates templates, previews current input, and persists atomically', async () => {
  const initialSettings = {
    image: { saveFormat: 'png' },
    filename: { rule: 'original', customTemplate: '{originalName}_{time}.{ext}' },
    directory: { rule: 'date' }
  };
  const savedSettings = {
    image: { saveFormat: 'jpg' },
    filename: { rule: 'custom', customTemplate: FilenameRule.DEFAULT_CUSTOM_TEMPLATE },
    directory: { rule: 'domain' }
  };
  const updates = [];
  const originalGenerateFilename = FilenameRule.generateFilename;
  const previewTemplates = [];
  FilenameRule.generateFilename = options => {
    previewTemplates.push(options.template);
    return originalGenerateFilename(options);
  };

  try {
    const harness = createOptionsHarness({
      settings: initialSettings,
      updateSettings: async (_storage, update) => {
        updates.push(update);
        return savedSettings;
      }
    });
    await harness.document.emit('DOMContentLoaded');
    await flushOptionsInit();

    await harness.elements['save-settings-btn'].emit('click');
    assert.equal(harness.elements['image-format-preference'].value, 'png');
    assert.equal(harness.elements['filename-rule'].value, 'original');
    assert.equal(harness.elements['filename-template'].value, '{originalName}_{time}.{ext}');
    assert.equal(harness.elements['directory-rule'].value, 'date');

    harness.elements['filename-rule'].value = 'custom';
    await harness.elements['filename-rule'].emit('change');
    assert.equal(harness.elements['filename-template-group'].getAttribute('hidden'), null);
    harness.elements['filename-template'].value = '{unknown}';
    await harness.elements['filename-template'].emit('input');
    assert.equal(harness.elements['filename-template-error'].textContent, 'Unsupported template variable: unknown.');
    assert.equal(harness.elements['filename-template'].getAttribute('aria-invalid'), 'true');
    assert.equal(harness.elements['save-save-settings-btn'].disabled, true);
    await harness.elements['save-settings-form'].emit('submit');
    assert.equal(updates.length, 0);
    assert.equal(harness.elements['filename-template'].focused, true);

    harness.elements['filename-template'].value = '';
    await harness.elements['filename-template'].emit('input');
    assert.equal(previewTemplates.at(-1), '');
    assert.equal(typeof harness.elements['filename-preview'].textContent, 'string');

    harness.elements['filename-rule'].value = 'original';
    await harness.elements['filename-rule'].emit('change');
    assert.notEqual(harness.elements['filename-template-group'].getAttribute('hidden'), null);
    assert.equal(harness.elements['filename-template'].value, '');
    assert.equal(harness.elements['save-save-settings-btn'].disabled, false);

    harness.elements['directory-rule'].value = 'domain';
    await harness.elements['cancel-save-settings-btn'].emit('click');
    assert.equal(harness.elements['filename-rule'].value, 'original');
    assert.equal(harness.elements['filename-template'].value, '{originalName}_{time}.{ext}');
    assert.equal(harness.elements['directory-rule'].value, 'date');

    await harness.elements['save-settings-btn'].emit('click');
    harness.elements['filename-rule'].value = 'custom';
    harness.elements['filename-template'].value = '{pageTitle}.{ext}';
    harness.elements['directory-rule'].value = 'domain-date';
    await harness.elements['close-save-settings-btn'].emit('click');
    await harness.elements['save-settings-btn'].emit('click');
    assert.equal(harness.elements['filename-rule'].value, 'original');
    harness.elements['filename-rule'].value = 'custom';
    harness.elements['filename-template'].value = '{width}.{ext}';
    harness.elements['directory-rule'].value = 'domain';
    await harness.document.emit('keydown', { key: 'Escape' });
    await harness.elements['save-settings-btn'].emit('click');
    assert.equal(harness.elements['filename-rule'].value, 'original');
    assert.equal(harness.elements['filename-template'].value, '{originalName}_{time}.{ext}');
    assert.equal(harness.elements['directory-rule'].value, 'date');

    await harness.elements['save-settings-btn'].emit('click');
    await harness.formatOptions.find(option => option.dataset.value === 'webp').emit('click');
    harness.elements['filename-rule'].value = 'custom';
    await harness.elements['filename-rule'].emit('change');
    harness.elements['filename-template'].value = '{domain}_{date}.{ext}';
    await harness.elements['filename-template'].emit('input');
    harness.elements['directory-rule'].value = 'domain-date';
    await harness.elements['save-settings-form'].emit('submit');
    assert.deepEqual(JSON.parse(JSON.stringify(updates)), [{
      image: { saveFormat: 'webp' },
      filename: { rule: 'custom', customTemplate: '{domain}_{date}.{ext}' },
      directory: { rule: 'domain-date' }
    }]);
    assert.deepEqual(JSON.parse(JSON.stringify(harness.runtimeCalls)), [{ action: 'configUpdated' }]);
    assert.equal(harness.notificationMessage.textContent, 'Save settings saved.');

    await harness.elements['save-settings-btn'].emit('click');
    assert.equal(harness.elements['image-format-preference'].value, 'jpg');
    assert.equal(harness.elements['filename-rule'].value, 'custom');
    assert.equal(harness.elements['filename-template'].value, FilenameRule.DEFAULT_CUSTOM_TEMPLATE);
    assert.equal(harness.elements['directory-rule'].value, 'domain');
  } finally {
    FilenameRule.generateFilename = originalGenerateFilename;
  }
});

test('save settings disables while writing and recovers from a deferred failed write', async () => {
  let resolveUpdate;
  const deferredUpdate = new Promise(resolve => { resolveUpdate = resolve; });
  const settings = {
    image: { saveFormat: 'original' },
    filename: { rule: 'automatic', customTemplate: FilenameRule.DEFAULT_CUSTOM_TEMPLATE },
    directory: { rule: 'fixed' }
  };
  const harness = createOptionsHarness({ settings, updateSettings: () => deferredUpdate });
  await harness.document.emit('DOMContentLoaded');
  await flushOptionsInit();
  await harness.elements['save-settings-btn'].emit('click');
  const saving = harness.elements['save-settings-form'].emit('submit');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(harness.elements['save-save-settings-btn'].disabled, true);
  resolveUpdate(settings);
  await saving;
  assert.equal(harness.elements['save-save-settings-btn'].disabled, false);

  let rejectUpdate;
  const failedHarness = createOptionsHarness({
    settings,
    updateSettings: () => new Promise((resolve, reject) => { rejectUpdate = reject; })
  });
  await failedHarness.document.emit('DOMContentLoaded');
  await flushOptionsInit();
  await failedHarness.elements['save-settings-btn'].emit('click');
  failedHarness.elements['filename-rule'].value = 'custom';
  await failedHarness.elements['filename-rule'].emit('change');
  failedHarness.elements['filename-template'].value = '{domain}.{ext}';
  await failedHarness.elements['filename-template'].emit('input');
  const failingSave = failedHarness.elements['save-settings-form'].emit('submit');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(failedHarness.elements['save-save-settings-btn'].disabled, true);
  rejectUpdate(new Error('storage unavailable'));
  await failingSave;
  assert.equal(failedHarness.elements['save-save-settings-btn'].disabled, false);
  assert.equal(failedHarness.notificationMessage.textContent, 'Could not save Save settings.');
  await failedHarness.elements['cancel-save-settings-btn'].emit('click');
  await failedHarness.elements['save-settings-btn'].emit('click');
  assert.equal(failedHarness.elements['filename-rule'].value, 'automatic');
  assert.equal(failedHarness.elements['filename-template'].value, FilenameRule.DEFAULT_CUSTOM_TEMPLATE);
  assert.equal(failedHarness.elements['directory-rule'].value, 'fixed');
});

test('save settings keeps returned state when background reload reports a warning', async () => {
  const initialSettings = {
    image: { saveFormat: 'original' },
    filename: { rule: 'automatic', customTemplate: FilenameRule.DEFAULT_CUSTOM_TEMPLATE },
    directory: { rule: 'fixed' }
  };
  const returnedSettings = {
    image: { saveFormat: 'png' },
    filename: { rule: 'original', customTemplate: '{pageTitle}.{ext}' },
    directory: { rule: 'date' }
  };
  const harness = createOptionsHarness({
    settings: initialSettings,
    updateSettings: async () => returnedSettings,
    configResponse: { success: false }
  });
  await harness.document.emit('DOMContentLoaded');
  await flushOptionsInit();
  await harness.elements['save-settings-btn'].emit('click');
  await harness.elements['save-settings-form'].emit('submit');
  assert.equal(harness.notificationMessage.textContent, 'Saved. Reload the extension to apply it.');
  assert.equal(harness.elements.notification.classList.contains('warning'), true);
  await harness.elements['save-settings-btn'].emit('click');
  assert.equal(harness.elements['image-format-preference'].value, 'png');
  assert.equal(harness.elements['filename-rule'].value, 'original');
  assert.equal(harness.elements['filename-template'].value, '{pageTitle}.{ext}');
  assert.equal(harness.elements['directory-rule'].value, 'date');
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
