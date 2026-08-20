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
    descendants: new Set(),
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
      if (element.disabled && ['click', 'submit', 'change', 'input', 'keydown'].includes(type)) return [];
      if (type === 'click') element.focus();
      const preparedEvent = { target: element, preventDefault() {}, stopPropagation() {}, ...event };
      const results = (listeners.get(type) || []).map(listener => listener(preparedEvent));
      return Promise.all(results);
    },
    setAttribute(name, valueToSet) { attributes.set(name, String(valueToSet)); },
    getAttribute(name) { return attributes.has(name) ? attributes.get(name) : null; },
    hasAttribute(name) { return attributes.has(name); },
    toggleAttribute(name, force) {
      const enabled = force === undefined ? !attributes.has(name) : Boolean(force);
      if (enabled) attributes.set(name, ''); else attributes.delete(name);
      return enabled;
    },
    contains(target) { return target === element || element.descendants.has(target); },
    focus() {
      element.focused = true;
      element.onFocus?.(element);
    },
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

function createOptionsHarness({ settings, loadSettings = async () => settings, updateSettings, configResponse = { success: true } }) {
  const ids = [
    'empty-state', 'servers-section', 'server-list', 'add-server-btn', 'add-first-server-btn',
    'save-settings-btn', 'save-settings-modal', 'save-settings-dialog', 'save-settings-form', 'image-format-preference',
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
    activeElement: createFakeElement('document-body'),
    getElementById: id => elements[id] || null,
    querySelectorAll: selector => selector === '.format-select-option' ? formatOptions : [],
    addEventListener(type, listener) { documentListeners.set(type, [...(documentListeners.get(type) || []), listener]); },
    async emit(type, event = {}) {
      return Promise.all((documentListeners.get(type) || []).map(listener => listener({ preventDefault() {}, ...event })));
    },
    createElement: () => createFakeElement('created'),
    createTextNode: text => ({ textContent: text })
  };
  Object.values(elements).forEach(element => { element.onFocus = focused => { document.activeElement = focused; }; });
  formatOptions.forEach(option => { option.onFocus = focused => { document.activeElement = focused; }; });
  const modalFocusables = [
    elements['close-save-settings-btn'],
    elements['image-format-trigger'],
    ...formatOptions,
    elements['filename-rule'],
    elements['filename-template'],
    elements['directory-rule'],
    elements['cancel-save-settings-btn'],
    elements['save-save-settings-btn']
  ];
  elements['save-settings-modal'].querySelectorAll = () => modalFocusables;
  elements['save-settings-modal'].descendants = new Set(modalFocusables);
  elements['filename-template-group'].descendants.add(elements['filename-template']);
  elements['image-format-options'].descendants = new Set(formatOptions);
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
    AppSettings: { SETTINGS_SCHEMA_VERSION: 2, loadSettings, updateSettings },
    ImageFormat,
    FilenameRule,
    DirectoryRule,
    console: { error() {}, warn() {}, log() {} },
    confirm: () => true,
    setTimeout: () => 0
  };
  context.globalThis = context;
  const initMarker = '  // Initialize the app\n  init();';
  const testApiInjection = `  const loadSaveSettingsForTest = loadSaveSettings;
  let lastSaveSettingsLoadPromise = null;
  loadSaveSettings = (...args) => {
    lastSaveSettingsLoadPromise = loadSaveSettingsForTest(...args);
    return lastSaveSettingsLoadPromise;
  };
  window.__saveSettingsTestApi = {
    loadSaveSettings,
    getLastLoadPromise: () => lastSaveSettingsLoadPromise,
    getState: () => ({
      ready: saveSettingsReady,
      loading: saveSettingsLoading,
      persisted: copySaveSettings(persistedSaveSettings)
    })
  };

${initMarker}`;
  const optionsSource = readProjectFile('options/options.js');
  assert.ok(optionsSource.includes(initMarker), 'options test hook marker must remain stable');
  vm.runInNewContext(optionsSource.replace(initMarker, testApiInjection), context, { filename: 'options.js' });
  return {
    elements,
    document,
    formatOptions,
    runtimeCalls,
    notificationMessage,
    get testApi() { return context.window.__saveSettingsTestApi; }
  };
}

async function flushOptionsInit() {
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
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
  assert.match(optionsHtml, /id="save-settings-dialog"[^>]*class="modal-container save-settings-container"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="save-settings-title"/);
  assert.match(optionsHtml, /<h3 id="save-settings-title">Save settings<\/h3>/);
  assert.match(optionsHtml, /id="save-settings-form"/);
  assert.match(optionsHtml, /<h3 id="save-settings-title">Save settings<\/h3>/);
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
  assert.match(optionsSource, /const loadRevision = \+\+saveSettingsRevision/);
  assert.match(optionsSource, /if \(loadRevision !== saveSettingsRevision\) return false;/);
  assert.match(optionsSource, /isSaving \|\| !saveSettingsReady/);
  assert.match(optionsSource, /function trapSaveSettingsTab/);
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
  assert.match(optionsCss, /\.save-settings-container \.format-select\.is-open \.format-select-list\s*\{[^}]*position:\s*static;[^}]*margin-top:/s);
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

test('future-schema save settings submit only explicit edits instead of UI fallbacks', async () => {
  const futureSettings = {
    schemaVersion: 4,
    image: { saveFormat: 'avif' },
    filename: { rule: 'content-hash', customTemplate: '{futureVariable}' },
    directory: { rule: 'project' }
  };

  function createFutureHarness() {
    const updates = [];
    const harness = createOptionsHarness({
      settings: futureSettings,
      updateSettings: async (_storage, update) => {
        updates.push(update);
        return {
          ...futureSettings,
          image: { ...futureSettings.image, ...update.image },
          filename: { ...futureSettings.filename, ...update.filename },
          directory: { ...futureSettings.directory, ...update.directory }
        };
      }
    });
    return { harness, updates };
  }

  const direct = createFutureHarness();
  await direct.harness.document.emit('DOMContentLoaded');
  await flushOptionsInit();
  await direct.harness.elements['save-settings-btn'].emit('click');
  assert.equal(direct.harness.elements['image-format-preference'].value, 'original');
  assert.equal(direct.harness.elements['filename-rule'].value, 'automatic');
  assert.equal(direct.harness.elements['directory-rule'].value, 'fixed');
  await direct.harness.elements['save-settings-form'].emit('submit');
  assert.deepEqual(JSON.parse(JSON.stringify(direct.updates)), [{}]);
  assert.deepEqual(JSON.parse(JSON.stringify(direct.harness.testApi.getState().persisted)), futureSettings);

  const oneEdit = createFutureHarness();
  await oneEdit.harness.document.emit('DOMContentLoaded');
  await flushOptionsInit();
  await oneEdit.harness.elements['save-settings-btn'].emit('click');
  oneEdit.harness.elements['directory-rule'].value = 'date';
  await oneEdit.harness.elements['directory-rule'].emit('change');
  await oneEdit.harness.elements['save-settings-form'].emit('submit');
  assert.deepEqual(JSON.parse(JSON.stringify(oneEdit.updates)), [{ directory: { rule: 'date' } }]);
  assert.equal(oneEdit.harness.testApi.getState().persisted.image.saveFormat, 'avif');
  assert.equal(oneEdit.harness.testApi.getState().persisted.filename.rule, 'content-hash');
  assert.equal(oneEdit.harness.testApi.getState().persisted.filename.customTemplate, '{futureVariable}');

  const explicitFallback = createFutureHarness();
  await explicitFallback.harness.document.emit('DOMContentLoaded');
  await flushOptionsInit();
  await explicitFallback.harness.elements['save-settings-btn'].emit('click');
  await explicitFallback.harness.formatOptions.find(option => option.dataset.value === 'original').emit('click');
  await explicitFallback.harness.elements['save-settings-form'].emit('submit');
  assert.deepEqual(JSON.parse(JSON.stringify(explicitFallback.updates)), [{ image: { saveFormat: 'original' } }]);
  assert.equal(explicitFallback.harness.testApi.getState().persisted.filename.rule, 'content-hash');
  assert.equal(explicitFallback.harness.testApi.getState().persisted.directory.rule, 'project');
});

test('future custom templates stay preserved until a filename control is explicitly edited', async () => {
  const futureSettings = {
    schemaVersion: 4,
    image: { saveFormat: 'original' },
    filename: { rule: 'custom', customTemplate: '{futureVariable}' },
    directory: { rule: 'project' }
  };

  function createFutureCustomHarness() {
    const updates = [];
    const harness = createOptionsHarness({
      settings: futureSettings,
      updateSettings: async (_storage, update) => {
        updates.push(update);
        return {
          ...futureSettings,
          image: { ...futureSettings.image, ...update.image },
          filename: { ...futureSettings.filename, ...update.filename },
          directory: { ...futureSettings.directory, ...update.directory }
        };
      }
    });
    return { harness, updates };
  }

  const direct = createFutureCustomHarness();
  await direct.harness.document.emit('DOMContentLoaded');
  await flushOptionsInit();
  await direct.harness.elements['save-settings-btn'].emit('click');
  assert.equal(direct.harness.elements['filename-rule'].value, 'custom');
  assert.equal(direct.harness.elements['filename-template'].value, '{futureVariable}');
  assert.equal(direct.harness.elements['filename-template'].getAttribute('aria-invalid'), 'false');
  assert.equal(direct.harness.elements['filename-template-error'].textContent, '');
  assert.equal(direct.harness.elements['save-save-settings-btn'].disabled, false);
  await direct.harness.elements['save-settings-form'].emit('submit');
  assert.deepEqual(JSON.parse(JSON.stringify(direct.updates)), [{}]);

  const unrelatedEdit = createFutureCustomHarness();
  await unrelatedEdit.harness.document.emit('DOMContentLoaded');
  await flushOptionsInit();
  await unrelatedEdit.harness.elements['save-settings-btn'].emit('click');
  unrelatedEdit.harness.elements['directory-rule'].value = 'date';
  await unrelatedEdit.harness.elements['directory-rule'].emit('change');
  assert.equal(unrelatedEdit.harness.elements['save-save-settings-btn'].disabled, false);
  await unrelatedEdit.harness.elements['save-settings-form'].emit('submit');
  assert.deepEqual(
    JSON.parse(JSON.stringify(unrelatedEdit.updates)),
    [{ directory: { rule: 'date' } }]
  );
  assert.equal(unrelatedEdit.harness.testApi.getState().persisted.filename.rule, 'custom');
  assert.equal(unrelatedEdit.harness.testApi.getState().persisted.filename.customTemplate, '{futureVariable}');

  const templateEdit = createFutureCustomHarness();
  await templateEdit.harness.document.emit('DOMContentLoaded');
  await flushOptionsInit();
  await templateEdit.harness.elements['save-settings-btn'].emit('click');
  await templateEdit.harness.elements['filename-template'].emit('input');
  assert.equal(templateEdit.harness.elements['filename-template'].getAttribute('aria-invalid'), 'true');
  assert.equal(templateEdit.harness.elements['save-save-settings-btn'].disabled, true);
  await templateEdit.harness.elements['save-settings-form'].emit('submit');
  assert.deepEqual(templateEdit.updates, []);
  templateEdit.harness.elements['filename-template'].value = '{domain}.{ext}';
  await templateEdit.harness.elements['filename-template'].emit('input');
  assert.equal(templateEdit.harness.elements['save-save-settings-btn'].disabled, false);
  await templateEdit.harness.elements['save-settings-form'].emit('submit');
  assert.deepEqual(
    JSON.parse(JSON.stringify(templateEdit.updates)),
    [{ filename: { customTemplate: '{domain}.{ext}' } }]
  );

  const ruleEdit = createFutureCustomHarness();
  await ruleEdit.harness.document.emit('DOMContentLoaded');
  await flushOptionsInit();
  await ruleEdit.harness.elements['save-settings-btn'].emit('click');
  await ruleEdit.harness.elements['filename-rule'].emit('change');
  assert.equal(ruleEdit.harness.elements['filename-template'].getAttribute('aria-invalid'), 'true');
  await ruleEdit.harness.elements['save-settings-form'].emit('submit');
  assert.deepEqual(ruleEdit.updates, []);

  await ruleEdit.harness.elements['cancel-save-settings-btn'].emit('click');
  await ruleEdit.harness.elements['save-settings-btn'].emit('click');
  assert.equal(ruleEdit.harness.elements['filename-template'].getAttribute('aria-invalid'), 'false');
  assert.equal(ruleEdit.harness.elements['filename-template-error'].textContent, '');
  assert.equal(ruleEdit.harness.elements['save-save-settings-btn'].disabled, false);
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

test('save settings waits for a successful load, retries failures, and ignores stale initial loads', async () => {
  const firstLoad = deferred();
  const readySettings = {
    image: { saveFormat: 'png' },
    filename: { rule: 'original', customTemplate: '{originalName}.{ext}' },
    directory: { rule: 'date' }
  };
  const harness = createOptionsHarness({
    settings: readySettings,
    loadSettings: () => firstLoad.promise,
    updateSettings: async () => readySettings
  });
  await harness.document.emit('DOMContentLoaded');
  assert.equal(harness.elements['save-settings-btn'].disabled, true);
  await harness.elements['save-settings-btn'].emit('click');
  assert.equal(harness.elements['save-settings-modal'].classList.contains('hidden'), true);
  firstLoad.resolve(readySettings);
  await flushOptionsInit();
  assert.equal(harness.elements['save-settings-btn'].disabled, false);
  assert.equal(harness.elements['save-settings-modal'].classList.contains('hidden'), true);
  await harness.elements['save-settings-btn'].emit('click');
  assert.equal(harness.elements['save-settings-modal'].classList.contains('hidden'), false);

  const failedLoad = deferred();
  const retryLoad = deferred();
  let loadCount = 0;
  const retryHarness = createOptionsHarness({
    settings: readySettings,
    loadSettings: () => (++loadCount === 1 ? failedLoad.promise : retryLoad.promise),
    updateSettings: async () => readySettings
  });
  await retryHarness.document.emit('DOMContentLoaded');
  failedLoad.reject(new Error('storage unavailable'));
  await flushOptionsInit();
  assert.equal(retryHarness.elements['save-settings-btn'].disabled, false);
  assert.equal(retryHarness.elements['save-settings-btn'].getAttribute('title'), 'Retry loading Save settings');
  await retryHarness.elements['save-settings-btn'].emit('click');
  assert.equal(retryHarness.elements['save-settings-btn'].disabled, true);
  retryLoad.resolve(readySettings);
  await flushOptionsInit();
  assert.equal(retryHarness.elements['save-settings-modal'].classList.contains('hidden'), false);
  assert.equal(retryHarness.elements['filename-rule'].value, 'original');

  const initialLoad = deferred();
  const newerLoad = deferred();
  const olderSettings = {
    image: { saveFormat: 'png' },
    filename: { rule: 'original', customTemplate: '{originalName}.{ext}' },
    directory: { rule: 'date' }
  };
  const newerSettings = {
    image: { saveFormat: 'webp' },
    filename: { rule: 'custom', customTemplate: '{domain}.{ext}' },
    directory: { rule: 'domain' }
  };
  let staleLoadCount = 0;
  const staleHarness = createOptionsHarness({
    settings: olderSettings,
    loadSettings: () => (++staleLoadCount === 1 ? initialLoad.promise : newerLoad.promise),
    updateSettings: async () => newerSettings
  });
  await staleHarness.document.emit('DOMContentLoaded');
  const initialResult = staleHarness.testApi.getLastLoadPromise();
  assert.ok(initialResult);
  const newerResult = staleHarness.testApi.loadSaveSettings();
  newerLoad.resolve(newerSettings);
  assert.equal(await newerResult, true);
  assert.equal(staleHarness.testApi.getState().ready, true);
  assert.equal(staleHarness.elements['save-settings-btn'].disabled, false);
  assert.equal(staleHarness.elements['image-format-preference'].value, 'webp');
  initialLoad.resolve(olderSettings);
  assert.equal(await initialResult, false);
  assert.equal(staleHarness.testApi.getState().persisted.image.saveFormat, 'webp');
  assert.equal(staleHarness.elements['filename-rule'].value, 'custom');
  assert.equal(staleHarness.elements['directory-rule'].value, 'domain');

});

test('save settings locks the visible dialog during pending writes and restores focus and controls', async () => {
  const pendingUpdate = deferred();
  const settings = {
    image: { saveFormat: 'original' },
    filename: { rule: 'automatic', customTemplate: FilenameRule.DEFAULT_CUSTOM_TEMPLATE },
    directory: { rule: 'fixed' }
  };
  let updateCount = 0;
  const harness = createOptionsHarness({
    settings,
    updateSettings: () => {
      updateCount += 1;
      return pendingUpdate.promise;
    }
  });
  await harness.document.emit('DOMContentLoaded');
  await flushOptionsInit();
  await harness.elements['save-settings-btn'].emit('click');
  const saving = harness.elements['save-settings-form'].emit('submit');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(updateCount, 1);
  assert.equal(harness.elements['save-settings-form'].getAttribute('aria-busy'), 'true');
  assert.equal(harness.elements['save-settings-dialog'].getAttribute('aria-busy'), 'true');
  assert.equal(harness.elements['save-settings-modal'].getAttribute('aria-busy'), 'true');
  for (const id of ['save-save-settings-btn', 'cancel-save-settings-btn', 'close-save-settings-btn', 'image-format-trigger', 'filename-rule', 'filename-template', 'directory-rule']) {
    assert.equal(harness.elements[id].disabled, true, `${id} is disabled while saving`);
  }
  assert.equal(harness.formatOptions.every(option => option.disabled), true);
  await harness.elements['save-settings-form'].emit('submit');
  await harness.elements['cancel-save-settings-btn'].emit('click');
  await harness.elements['close-save-settings-btn'].emit('click');
  await harness.elements['save-settings-modal'].emit('click', { target: harness.elements['save-settings-modal'] });
  await harness.document.emit('keydown', { key: 'Escape' });
  assert.equal(updateCount, 1);
  assert.equal(harness.elements['save-settings-modal'].classList.contains('hidden'), false);
  pendingUpdate.resolve(settings);
  await saving;
  assert.equal(harness.elements['save-settings-modal'].classList.contains('hidden'), true);
  assert.equal(harness.elements['save-settings-form'].getAttribute('aria-busy'), 'false');
  assert.equal(harness.elements['save-settings-dialog'].getAttribute('aria-busy'), 'false');
  assert.equal(harness.document.activeElement, harness.elements['save-settings-btn']);

  const rejectedUpdate = deferred();
  const failedHarness = createOptionsHarness({ settings, updateSettings: () => rejectedUpdate.promise });
  await failedHarness.document.emit('DOMContentLoaded');
  await flushOptionsInit();
  await failedHarness.elements['save-settings-btn'].emit('click');
  const failing = failedHarness.elements['save-settings-form'].emit('submit');
  await new Promise(resolve => setImmediate(resolve));
  rejectedUpdate.reject(new Error('storage unavailable'));
  await failing;
  assert.equal(failedHarness.elements['save-settings-modal'].classList.contains('hidden'), false);
  assert.equal(failedHarness.elements['save-settings-form'].getAttribute('aria-busy'), 'false');
  assert.equal(failedHarness.elements['save-settings-dialog'].getAttribute('aria-busy'), 'false');
  assert.equal(failedHarness.elements['save-save-settings-btn'].disabled, false);
  assert.equal(failedHarness.elements['cancel-save-settings-btn'].disabled, false);
  assert.equal(failedHarness.notificationMessage.textContent, 'Could not save Save settings.');
});

test('save settings dialog traps tab and returns focus after each permitted dismissal', async () => {
  const settings = {
    image: { saveFormat: 'original' },
    filename: { rule: 'automatic', customTemplate: FilenameRule.DEFAULT_CUSTOM_TEMPLATE },
    directory: { rule: 'fixed' }
  };
  const harness = createOptionsHarness({ settings, updateSettings: async () => settings });
  await harness.document.emit('DOMContentLoaded');
  await flushOptionsInit();
  await harness.elements['save-settings-btn'].emit('click');
  assert.equal(harness.document.activeElement, harness.elements['image-format-trigger']);
  await harness.elements['image-format-trigger'].emit('click');
  assert.equal(harness.elements['image-format-trigger'].getAttribute('aria-expanded'), 'true');
  await harness.document.emit('keydown', { key: 'Escape', preventDefault() {} });
  assert.equal(harness.elements['image-format-options'].classList.contains('hidden'), true);
  assert.equal(harness.elements['image-format-trigger'].getAttribute('aria-expanded'), 'false');
  assert.equal(harness.elements['save-settings-modal'].classList.contains('hidden'), false);
  assert.equal(harness.document.activeElement, harness.elements['image-format-trigger']);
  await harness.document.emit('keydown', { key: 'Escape' });
  assert.equal(harness.elements['save-settings-modal'].classList.contains('hidden'), true);
  assert.equal(harness.document.activeElement, harness.elements['save-settings-btn']);

  await harness.elements['save-settings-btn'].emit('click');
  harness.elements['close-save-settings-btn'].focus();
  let prevented = false;
  await harness.document.emit('keydown', { key: 'Tab', shiftKey: true, preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(harness.document.activeElement, harness.elements['save-save-settings-btn']);
  harness.elements['save-save-settings-btn'].focus();
  await harness.document.emit('keydown', { key: 'Tab', preventDefault() {} });
  assert.equal(harness.document.activeElement, harness.elements['close-save-settings-btn']);

  await harness.elements['cancel-save-settings-btn'].emit('click');
  assert.equal(harness.document.activeElement, harness.elements['save-settings-btn']);
  await harness.elements['save-settings-btn'].emit('click');
  await harness.elements['close-save-settings-btn'].emit('click');
  assert.equal(harness.document.activeElement, harness.elements['save-settings-btn']);
  await harness.elements['save-settings-btn'].emit('click');
  await harness.document.emit('keydown', { key: 'Escape' });
  assert.equal(harness.document.activeElement, harness.elements['save-settings-btn']);
  await harness.elements['save-settings-btn'].emit('click');
  await harness.elements['save-settings-modal'].emit('click', { target: harness.elements['save-settings-modal'] });
  assert.equal(harness.document.activeElement, harness.elements['save-settings-btn']);
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
