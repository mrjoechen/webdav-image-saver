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
  const children = [];
  let innerHTML = '';
  const element = {
    id,
    value,
    textContent: '',
    selectionStart: 0,
    selectionEnd: 0,
    disabled: false,
    style: {},
    children,
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
    removeAttribute(name) { attributes.delete(name); },
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
    setSelectionRange(start, end) {
      element.selectionStart = start;
      element.selectionEnd = end;
    },
    appendChild(child) {
      children.push(child);
      if (child?.textContent !== undefined) innerHTML += String(child.textContent);
      return child;
    },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  Object.defineProperty(element, 'innerHTML', {
    get: () => innerHTML,
    set: next => {
      innerHTML = String(next);
      if (innerHTML === '') children.length = 0;
    }
  });
  Object.defineProperty(element, 'className', {
    get: () => [...classes].join(' '),
    set: next => {
      classes.clear();
      String(next).split(/\s+/).filter(Boolean).forEach(name => classes.add(name));
    }
  });
  return element;
}

function createOptionsHarness({
  settings,
  loadSettings = async () => settings,
  updateSettings,
  configResponse = { success: true },
  localStorageEntries = {},
  prefersDarkScheme = false,
  webdavServers = []
}) {
  const ids = [
    'empty-state', 'servers-section', 'server-list', 'add-server-btn', 'add-first-server-btn',
    'save-settings-btn', 'save-settings-modal', 'save-settings-dialog', 'save-settings-form', 'image-format-preference',
    'image-format-select', 'image-format-trigger', 'image-format-value', 'image-format-options',
    'filename-rule', 'filename-rule-select', 'filename-rule-trigger', 'filename-rule-value', 'filename-rule-options',
    'filename-template-group', 'filename-template', 'filename-template-error',
    'filename-preview-block', 'filename-preview', 'directory-rule', 'directory-rule-select', 'directory-rule-trigger',
    'directory-rule-value', 'directory-rule-options', 'directory-preview', 'close-save-settings-btn', 'cancel-save-settings-btn',
    'save-save-settings-btn', 'theme-toggle-btn', 'theme-toggle-icon', 'server-modal', 'modal-title',
    'close-modal-btn', 'cancel-btn', 'server-form', 'save-server-btn', 'test-connection-btn',
    'connection-status', 'folder-selection', 'custom-folder-path', 'open-folder-picker-btn',
    'folder-picker-modal', 'close-folder-picker-btn', 'cancel-folder-picker-btn', 'select-folder-btn',
    'folder-picker-back-btn', 'folder-picker-refresh-btn', 'folder-list', 'selected-folder-path', 'notification',
    'edit-id', 'server-name', 'server-url', 'server-username', 'server-password',
    'language-toggle-btn', 'save-settings-title', 'image-format-section-title', 'filename-section-title',
    'directory-section-title', 'settings-tab-format', 'settings-tab-filename', 'settings-tab-directory',
    'settings-panel-format', 'settings-panel-filename', 'settings-panel-directory'
  ];
  const elements = Object.fromEntries(ids.map(id => [id, createFakeElement(id)]));
  elements['save-settings-title'].dataset.i18n = 'saveSettings';
  elements['image-format-section-title'].dataset.i18n = 'imageFormat';
  elements['filename-section-title'].dataset.i18n = 'fileNamingRule';
  elements['directory-section-title'].dataset.i18n = 'saveDirectoryRule';
  ['empty-state', 'server-modal', 'save-settings-modal', 'folder-picker-modal'].forEach(id => {
    elements[id].classList.add('hidden');
  });
  elements['filename-rule'].value = 'automatic';
  elements['directory-rule'].value = 'fixed';
  elements['filename-template-group'].toggleAttribute('hidden', true);
  elements['filename-rule-trigger'].setAttribute('role', 'combobox');
  elements['filename-rule-trigger'].setAttribute('aria-expanded', 'false');
  elements['filename-rule-options'].setAttribute('role', 'listbox');
  elements['filename-rule-options'].classList.add('hidden');
  elements['directory-rule-trigger'].setAttribute('role', 'combobox');
  elements['directory-rule-trigger'].setAttribute('aria-expanded', 'false');
  elements['directory-rule-options'].setAttribute('role', 'listbox');
  elements['directory-rule-options'].classList.add('hidden');
  elements['theme-toggle-icon'].querySelector = () => createFakeElement('theme-use');
  const notificationIcon = createFakeElement('notification-icon');
  const notificationMessage = createFakeElement('notification-message');
  elements.notification.querySelector = selector => selector === '.notification-icon' ? notificationIcon : notificationMessage;

  const formatOptions = ['original', 'ask', 'png', 'jpg', 'webp'].map((value, index) => {
    const option = createFakeElement(`format-${value}`, { dataset: { value } });
    option.setAttribute('aria-selected', String(index === 0));
    return option;
  });
  const filenameRuleOptions = ['automatic', 'original', 'custom'].map((value, index) => {
    const option = createFakeElement(`filename-rule-option-${value}`, { dataset: { value } });
    option.setAttribute('aria-selected', String(index === 0));
    return option;
  });
  const directoryRuleOptions = ['fixed', 'date', 'domain', 'domain-date'].map((value, index) => {
    const option = createFakeElement(`directory-rule-option-${value}`, { dataset: { value } });
    option.setAttribute('aria-selected', String(index === 0));
    return option;
  });
  const variableTokens = FilenameRule.TEMPLATE_VARIABLES.map(variable => {
    const token = createFakeElement(`variable-${variable}`, { dataset: { variable } });
    token.textContent = `{${variable}}`;
    return token;
  });
  const saveSettingsTabs = [
    elements['settings-tab-format'],
    elements['settings-tab-filename'],
    elements['settings-tab-directory']
  ];
  const documentListeners = new Map();
  const document = {
    documentElement: { dataset: {} },
    activeElement: createFakeElement('document-body'),
    getElementById: id => elements[id] || null,
    querySelectorAll: selector => {
      if (selector === '.image-format-option' || selector === '.format-select-option') return formatOptions;
      if (selector === '.filename-rule-option') return filenameRuleOptions;
      if (selector === '.directory-rule-option') return directoryRuleOptions;
      if (selector === '[data-i18n]') {
        return Object.values(elements).filter(element => element.dataset.i18n);
      }
      if (selector.includes('tab')) return saveSettingsTabs;
      if (selector.includes('variable') || selector.includes('token')) return variableTokens;
      return [];
    },
    addEventListener(type, listener) { documentListeners.set(type, [...(documentListeners.get(type) || []), listener]); },
    async emit(type, event = {}) {
      return Promise.all((documentListeners.get(type) || []).map(listener => listener({ preventDefault() {}, ...event })));
    },
    createElement: () => createFakeElement('created'),
    createTextNode: text => ({ textContent: text })
  };
  Object.values(elements).forEach(element => { element.onFocus = focused => { document.activeElement = focused; }; });
  [...formatOptions, ...filenameRuleOptions, ...directoryRuleOptions, ...variableTokens, ...saveSettingsTabs].forEach(option => {
    option.onFocus = focused => { document.activeElement = focused; };
  });
  const modalFocusables = [
    elements['close-save-settings-btn'],
    ...saveSettingsTabs,
    elements['image-format-trigger'],
    ...formatOptions,
    elements['filename-rule-trigger'],
    ...filenameRuleOptions,
    elements['filename-template'],
    ...variableTokens,
    elements['directory-rule-trigger'],
    ...directoryRuleOptions,
    elements['cancel-save-settings-btn'],
    elements['save-save-settings-btn']
  ];
  elements['save-settings-modal'].querySelectorAll = () => modalFocusables;
  elements['save-settings-modal'].descendants = new Set(modalFocusables);
  elements['save-settings-dialog'].querySelectorAll = selector => {
    if (selector.includes('tab')) return saveSettingsTabs;
    if (selector.includes('variable') || selector.includes('token')) return variableTokens;
    return [];
  };
  elements['filename-template-group'].descendants = new Set([elements['filename-template'], ...variableTokens]);
  elements['image-format-options'].descendants = new Set(formatOptions);
  elements['filename-rule-options'].descendants = new Set(filenameRuleOptions);
  elements['directory-rule-options'].descendants = new Set(directoryRuleOptions);
  elements['settings-panel-format'].descendants = new Set([elements['image-format-trigger'], ...formatOptions]);
  elements['settings-panel-filename'].descendants = new Set([
    elements['filename-rule-trigger'], ...filenameRuleOptions, elements['filename-template'], ...variableTokens
  ]);
  elements['settings-panel-directory'].descendants = new Set([elements['directory-rule-trigger'], ...directoryRuleOptions]);
  const runtimeCalls = [];
  const localStorageValues = new Map(Object.entries(localStorageEntries));
  let storedWebdavServers = JSON.parse(JSON.stringify(webdavServers));
  const chrome = {
    storage: {
      local: {
        get: async key => key === 'webdavServers'
          ? { webdavServers: JSON.parse(JSON.stringify(storedWebdavServers)) }
          : {},
        set: async update => {
          if (Object.prototype.hasOwnProperty.call(update, 'webdavServers')) {
            storedWebdavServers = JSON.parse(JSON.stringify(update.webdavServers));
          }
        },
        remove: async () => {}
      },
      sync: { get: async () => ({}), remove: async () => {} }
    },
    runtime: { sendMessage: async message => { runtimeCalls.push(message); return configResponse; } }
  };
  const context = {
    document,
    window: { matchMedia: () => ({ matches: prefersDarkScheme }) },
    Date,
    localStorage: {
      getItem: key => localStorageValues.has(key) ? localStorageValues.get(key) : null,
      setItem: (key, value) => { localStorageValues.set(key, String(value)); }
    },
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
    loadServers,
    renderFolderPickerList,
    getLastLoadPromise: () => lastSaveSettingsLoadPromise,
    getState: () => ({
      ready: saveSettingsReady,
      loading: saveSettingsLoading,
      persisted: copySaveSettings(persistedSaveSettings),
      renderedServers: renderedServers.map(server => ({ ...server }))
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
    filenameRuleOptions,
    directoryRuleOptions,
    variableTokens,
    runtimeCalls,
    localStorageValues,
    notificationMessage,
    setWebdavServers(servers) {
      storedWebdavServers = JSON.parse(JSON.stringify(servers));
    },
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
  assert.match(optionsHtml, /id="save-settings-btn"[\s\S]*?<use href="#icon-settings"><\/use>/);
  assert.match(optionsHtml, /id="save-settings-modal"/);
  assert.match(optionsHtml, /id="save-settings-dialog"[^>]*class="modal-container save-settings-container"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="save-settings-title"/);
  assert.match(optionsHtml, /<h3 id="save-settings-title"[^>]*>Save settings<\/h3>/);
  assert.match(optionsHtml, /id="save-settings-form"/);
  assert.match(optionsHtml, /<h3 id="save-settings-title"[^>]*>Save settings<\/h3>/);
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

  assert.match(optionsHtml, /<label[^>]*id="filename-rule-label"[^>]*for="filename-rule-trigger"[^>]*>Naming mode<\/label>/);
  assert.match(optionsHtml, /id="filename-rule-label"[^>]*data-i18n="filenameNamingMode"/);
  assert.match(optionsHtml, /<input type="hidden" id="filename-rule" value="automatic">/);
  assert.match(optionsHtml, /<div class="[^"]*format-select[^"]*rule-select[^"]*" id="filename-rule-select">/);
  assert.match(optionsHtml, /id="filename-rule-trigger"[^>]*role="combobox"[^>]*aria-controls="filename-rule-options"/);
  assert.match(optionsHtml, /id="filename-rule-options"[^>]*role="listbox"[^>]*aria-labelledby="filename-rule-label"/);
  for (const [value, label] of [
    ['automatic', 'Automatic'],
    ['original', 'Original filename'],
    ['custom', 'Custom template']
  ]) {
    assert.match(optionsHtml, new RegExp(`class="[^"]*filename-rule-option[^"]*"[^>]*role="option"[^>]*data-value="${value}"[^>]*>[\\s\\S]*?${label}`));
  }
  assert.match(optionsHtml, /id="filename-template-group"[^>]*hidden/);
  assert.match(optionsHtml, /id="filename-rule-helper"/);
  assert.match(optionsHtml, /id="filename-rule-trigger"[^>]*aria-describedby="filename-rule-helper"/);
  assert.match(optionsHtml, /id="filename-template-helper"/);
  assert.match(optionsHtml, /id="filename-template"[^>]*aria-describedby="filename-template-helper filename-template-error"/);
  assert.match(optionsHtml, /id="filename-variable-actions"[^>]*role="group"[^>]*aria-labelledby="filename-variables-label"/);
  assert.match(optionsHtml, /id="filename-variables-label"[^>]*data-i18n="variables"/);
  assert.match(optionsHtml, /id="filename-template-error"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(optionsHtml, /id="filename-preview"[^>]*class="[^"]*template-preview[^"]*"[^>]*aria-live="polite"/);
  assert.match(optionsHtml, /class="[^"]*template-variables[^"]*"/);
  for (const token of ['originalName', 'date', 'time', 'domain', 'pageTitle', 'width', 'height', 'ext']) {
    assert.match(optionsHtml, new RegExp(`class="variable-token"[^>]*data-variable="${token}"[^>]*>\\{${token}\\}<\\/button>`));
  }
  assert.match(optionsHtml, /id="directory-rule-helper"/);
  assert.match(optionsHtml, /id="directory-rule-trigger"[^>]*aria-describedby="directory-rule-helper"/);

  assert.match(optionsHtml, /<label[^>]*id="directory-rule-label"[^>]*for="directory-rule-trigger"[^>]*>Folder structure<\/label>/);
  assert.match(optionsHtml, /id="directory-rule-label"[^>]*data-i18n="directoryFolderStructure"/);
  assert.match(optionsHtml, /<input type="hidden" id="directory-rule" value="fixed">/);
  assert.match(optionsHtml, /<div class="[^"]*format-select[^"]*rule-select[^"]*" id="directory-rule-select">/);
  assert.match(optionsHtml, /id="directory-rule-trigger"[^>]*role="combobox"[^>]*aria-controls="directory-rule-options"/);
  assert.match(optionsHtml, /id="directory-rule-options"[^>]*role="listbox"[^>]*aria-labelledby="directory-rule-label"/);
  for (const [value, label] of [
    ['fixed', 'Fixed directory'],
    ['date', 'By date'],
    ['domain', 'By website'],
    ['domain-date', 'By website and date']
  ]) {
    assert.match(optionsHtml, new RegExp(`class="[^"]*directory-rule-option[^"]*"[^>]*role="option"[^>]*data-value="${value}"[^>]*>[\\s\\S]*?${label}`));
  }
  assert.match(optionsHtml, /relative to the target folder configured on the selected WebDAV server/i);
  assert.match(optionsHtml, /\/Images is only an example/i);
  assert.match(optionsHtml, /id="save-settings-tabs"[^>]*role="tablist"/);
  for (const name of ['format', 'filename', 'directory']) {
    assert.match(optionsHtml, new RegExp(`id="settings-tab-${name}"[^>]*role="tab"[^>]*aria-controls="settings-panel-${name}"`));
    assert.match(optionsHtml, new RegExp(`id="settings-panel-${name}"[^>]*role="tabpanel"[^>]*aria-labelledby="settings-tab-${name}"`));
  }
  assert.match(optionsHtml, /id="directory-preview"[^>]*aria-live="polite"/);
  assert.match(optionsHtml, /id="language-toggle-btn"[^>]*aria-label="Switch to Chinese"/);

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
  assert.match(optionsSource, /function activateSaveSettingsTab/);
  assert.match(optionsSource, /function insertFilenameVariable/);
  assert.match(optionsSource, /function updateDirectoryPreview/);
  assert.match(optionsSource, /function applyLanguage/);
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
  assert.doesNotMatch(optionsCss, /\.modal-overlay\s*\{[^}]*transition:\s*opacity/s);
  assert.doesNotMatch(optionsCss, /\.modal-overlay\s*\{[^}]*backdrop-filter:/s);
  assert.doesNotMatch(optionsCss, /\.modal-container\s*\{[^}]*backdrop-filter:/s);
  assert.doesNotMatch(optionsCss, /\.modal-container\s*\{[^}]*transition:\s*transform/s);
  assert.doesNotMatch(optionsCss, /\.modal-overlay:not\(\.hidden\) \.modal-container\s*\{/);
  assert.match(optionsCss, /\.settings-tabs/);
  assert.match(optionsCss, /\.settings-tab\[aria-selected="true"\]/);
  assert.match(optionsCss, /\.settings-tabs\s*\{[^}]*--settings-tab-radius:\s*calc\(var\(--radius\) - 6px\);/s);
  assert.match(optionsCss, /\.settings-tabs\s*\{[^}]*--settings-tab-selected-radius:\s*calc\(var\(--radius\) - 5px\);/s);
  assert.match(optionsCss, /\.settings-tabs\s*\{[^}]*border-radius:\s*var\(--radius\);/s);
  assert.match(optionsCss, /\.settings-tab\s*\{[^}]*border-radius:\s*var\(--settings-tab-radius\);/s);
  assert.match(optionsCss, /\.settings-tab:hover:not\(:disabled\)\s*\{[^}]*border-radius:\s*var\(--settings-tab-radius\);/s);
  assert.match(optionsCss, /\.settings-tab\[aria-selected="true"\]\s*\{[^}]*border-radius:\s*var\(--settings-tab-selected-radius\);/s);
  assert.match(optionsCss, /\.settings-section/);
  assert.match(optionsCss, /\.format-select-trigger/);
  assert.match(optionsCss, /\.format-select-option/);
  assert.match(optionsCss, /\.filename-preview/);
  assert.match(optionsCss, /\.template-preview/);
  assert.match(optionsCss, /\.template-variables/);
  assert.match(optionsCss, /\.variable-token/);
  assert.match(optionsCss, /\.directory-preview/);
  assert.match(optionsCss, /\.language-toggle/);
  assert.match(optionsCss, /\.form-error/);
  assert.match(optionsCss, /\.form-input\.is-invalid/);
  assert.match(optionsCss, /\.format-select-list\s*\{[^}]*top:\s*calc\(100% - 1px\);/s);
  assert.match(optionsCss, /\.save-settings-container \.format-select\.is-open \.format-select-list\s*\{[^}]*position:\s*static;[^}]*margin-top:/s);
  assert.match(optionsCss, /\.format-select-chevron\s*\{[^}]*right:\s*14px;/s);
});

test('save settings uses an outline gear icon matching the theme toggle style', () => {
  const optionsHtml = readProjectFile('options/options.html');
  const settingsSymbol = optionsHtml.match(/<symbol id="icon-settings"[^>]*>[\s\S]*?<\/symbol>/)?.[0] || '';

  assert.match(optionsHtml, /id="save-settings-btn"[\s\S]*?<use href="#icon-settings"><\/use>/);
  assert.match(settingsSymbol, /<circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1\.5"\/>/);
  assert.match(settingsSymbol, /<path d="M13\.7654 2\.15224C13\.3978 2 12\.9319 2 12 2/);
  assert.match(settingsSymbol, /stroke="currentColor" stroke-width="1\.5"/);
  assert.doesNotMatch(settingsSymbol, /#1C274C|fill="currentColor"|stroke="none"|fill-rule=/);
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
    assert.equal(harness.elements['filename-preview'].textContent, 'Fix the template to see a preview.');
    assert.equal(harness.elements['filename-preview'].classList.contains('is-invalid'), true);

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
});

test('filename template editor is visible only while the custom rule is selected', async () => {
  const settings = {
    image: { saveFormat: 'original' },
    filename: { rule: 'automatic', customTemplate: FilenameRule.DEFAULT_CUSTOM_TEMPLATE },
    directory: { rule: 'fixed' }
  };
  const harness = createOptionsHarness({ settings, updateSettings: async () => settings });
  await harness.document.emit('DOMContentLoaded');
  await flushOptionsInit();
  await harness.elements['save-settings-btn'].emit('click');

  const editor = harness.elements['filename-template-group'];
  assert.equal(editor.hasAttribute('hidden'), true);
  assert.equal(editor.classList.contains('hidden'), true);

  harness.elements['filename-rule'].value = 'custom';
  await harness.elements['filename-rule'].emit('change');
  assert.equal(editor.hasAttribute('hidden'), false);
  assert.equal(editor.classList.contains('hidden'), false);

  harness.elements['filename-rule'].value = 'original';
  await harness.elements['filename-rule'].emit('change');
  assert.equal(editor.hasAttribute('hidden'), true);
  assert.equal(editor.classList.contains('hidden'), true);
});

test('filename preview remains visible for every naming rule', async () => {
  const settings = {
    image: { saveFormat: 'original' },
    filename: { rule: 'automatic', customTemplate: FilenameRule.DEFAULT_CUSTOM_TEMPLATE },
    directory: { rule: 'fixed' }
  };
  const harness = createOptionsHarness({ settings, updateSettings: async () => settings });
  await harness.document.emit('DOMContentLoaded');
  await flushOptionsInit();
  await harness.elements['save-settings-btn'].emit('click');

  const preview = harness.elements['filename-preview'];
  const previewPanel = harness.elements['filename-preview-block'];
  const editor = harness.elements['filename-template-group'];

  assert.equal(previewPanel.hasAttribute('hidden'), false);
  assert.equal(editor.hasAttribute('hidden'), true);
  assert.equal(preview.textContent, 'image_20260820143509_www_example_com.jpg');

  harness.elements['filename-rule'].value = 'original';
  await harness.elements['filename-rule'].emit('change');
  assert.equal(previewPanel.hasAttribute('hidden'), false);
  assert.equal(editor.hasAttribute('hidden'), true);
  assert.equal(preview.textContent, 'sunset.jpg');

  harness.elements['filename-rule'].value = 'custom';
  await harness.elements['filename-rule'].emit('change');
  assert.equal(previewPanel.hasAttribute('hidden'), false);
  assert.equal(editor.hasAttribute('hidden'), false);
  assert.equal(preview.textContent, 'sunset_20260820_example.com.jpg');
});

test('filename and directory rules use image-format-style dropdown controls', async () => {
  const updates = [];
  const settings = {
    image: { saveFormat: 'original' },
    filename: { rule: 'automatic', customTemplate: FilenameRule.DEFAULT_CUSTOM_TEMPLATE },
    directory: { rule: 'fixed' }
  };
  const harness = createOptionsHarness({
    settings,
    updateSettings: async (_storage, update) => {
      updates.push(update);
      return settings;
    }
  });
  await harness.document.emit('DOMContentLoaded');
  await flushOptionsInit();
  await harness.elements['save-settings-btn'].emit('click');

  assert.equal(harness.elements['filename-rule-value'].textContent, 'Automatic');
  assert.equal(harness.elements['filename-rule-trigger'].getAttribute('role'), 'combobox');
  assert.equal(harness.elements['filename-rule-options'].getAttribute('role'), 'listbox');

  await harness.elements['filename-rule-trigger'].emit('click');
  assert.equal(harness.elements['filename-rule-select'].classList.contains('is-open'), true);
  assert.equal(harness.elements['filename-rule-options'].classList.contains('hidden'), false);

  await harness.filenameRuleOptions.find(option => option.dataset.value === 'custom').emit('click');
  assert.equal(harness.elements['filename-rule'].value, 'custom');
  assert.equal(harness.elements['filename-rule-value'].textContent, 'Custom template');
  assert.equal(harness.elements['filename-rule-select'].classList.contains('is-open'), false);
  assert.equal(harness.elements['filename-template-group'].hasAttribute('hidden'), false);
  assert.equal(harness.elements['filename-preview'].textContent, 'sunset_20260820_example.com.jpg');

  await harness.elements['settings-tab-directory'].emit('click');
  assert.equal(harness.elements['directory-rule-value'].textContent, 'Fixed directory');
  assert.equal(harness.elements['directory-rule-trigger'].getAttribute('role'), 'combobox');
  assert.equal(harness.elements['directory-rule-options'].getAttribute('role'), 'listbox');

  await harness.elements['directory-rule-trigger'].emit('keydown', { key: 'ArrowDown' });
  assert.equal(harness.elements['directory-rule-select'].classList.contains('is-open'), true);
  assert.equal(harness.document.activeElement, harness.directoryRuleOptions[0]);

  await harness.directoryRuleOptions.find(option => option.dataset.value === 'domain-date').emit('click');
  assert.equal(harness.elements['directory-rule'].value, 'domain-date');
  assert.equal(harness.elements['directory-rule-value'].textContent, 'By website and date');
  assert.equal(harness.elements['directory-rule-select'].classList.contains('is-open'), false);
  assert.equal(harness.elements['directory-preview'].textContent, '/Images/example.com/2026/08');

  await harness.elements['save-settings-form'].emit('submit');
  assert.deepEqual(JSON.parse(JSON.stringify(updates)), [{
    image: { saveFormat: 'original' },
    filename: { rule: 'custom', customTemplate: FilenameRule.DEFAULT_CUSTOM_TEMPLATE },
    directory: { rule: 'domain-date' }
  }]);
});

test('malformed custom template warns inline and cannot be saved', async () => {
  const updates = [];
  const settings = {
    image: { saveFormat: 'original' },
    filename: { rule: 'automatic', customTemplate: FilenameRule.DEFAULT_CUSTOM_TEMPLATE },
    directory: { rule: 'fixed' }
  };
  const harness = createOptionsHarness({
    settings,
    updateSettings: async (_storage, update) => {
      updates.push(update);
      return settings;
    }
  });
  await harness.document.emit('DOMContentLoaded');
  await flushOptionsInit();
  await harness.elements['save-settings-btn'].emit('click');
  harness.elements['filename-rule'].value = 'custom';
  await harness.elements['filename-rule'].emit('change');

  const template = harness.elements['filename-template'];
  template.value = 'photo-{date';
  await template.emit('input');

  assert.equal(template.getAttribute('aria-invalid'), 'true');
  assert.equal(harness.elements['filename-template-error'].textContent, 'Template variable braces must be balanced.');
  assert.equal(harness.elements['filename-preview'].textContent, 'Fix the template to see a preview.');
  assert.equal(harness.elements['filename-preview'].classList.contains('is-invalid'), true);
  assert.equal(harness.elements['save-save-settings-btn'].disabled, true);

  await harness.elements['save-settings-form'].emit('submit');
  assert.deepEqual(updates, []);
  assert.equal(harness.elements['save-settings-modal'].classList.contains('hidden'), false);
  assert.equal(harness.document.activeElement, template);
});

test('valid custom template without ext previews and saves with the generated extension', async () => {
  const updates = [];
  const settings = {
    image: { saveFormat: 'original' },
    filename: { rule: 'automatic', customTemplate: FilenameRule.DEFAULT_CUSTOM_TEMPLATE },
    directory: { rule: 'fixed' }
  };
  const savedSettings = {
    ...settings,
    filename: { rule: 'custom', customTemplate: 'photo-{domain}' }
  };
  const harness = createOptionsHarness({
    settings,
    updateSettings: async (_storage, update) => {
      updates.push(update);
      return savedSettings;
    }
  });
  await harness.document.emit('DOMContentLoaded');
  await flushOptionsInit();
  await harness.elements['save-settings-btn'].emit('click');
  harness.elements['filename-rule'].value = 'custom';
  await harness.elements['filename-rule'].emit('change');

  const template = harness.elements['filename-template'];
  template.value = 'photo-{domain}';
  await template.emit('input');

  assert.equal(template.getAttribute('aria-invalid'), 'false');
  assert.equal(harness.elements['filename-template-error'].textContent, '');
  assert.equal(harness.elements['filename-preview'].textContent, 'photo-example.com.jpg');
  assert.equal(harness.elements['filename-preview'].classList.contains('is-invalid'), false);
  assert.equal(harness.elements['save-save-settings-btn'].disabled, false);

  await harness.elements['save-settings-form'].emit('submit');
  assert.deepEqual(JSON.parse(JSON.stringify(updates)), [{
    image: { saveFormat: 'original' },
    filename: { rule: 'custom', customTemplate: 'photo-{domain}' },
    directory: { rule: 'fixed' }
  }]);
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
  assert.equal(harness.document.activeElement, harness.elements['settings-tab-format']);
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

test('settings page first opens with the system theme when no preference is saved', async () => {
  const settings = {
    image: { saveFormat: 'original' },
    filename: { rule: 'automatic', customTemplate: FilenameRule.DEFAULT_CUSTOM_TEMPLATE },
    directory: { rule: 'fixed' }
  };
  const harness = createOptionsHarness({
    settings,
    updateSettings: async () => settings,
    prefersDarkScheme: true
  });

  await harness.document.emit('DOMContentLoaded');
  await flushOptionsInit();

  assert.equal(harness.document.documentElement.dataset.theme, 'dark');
  assert.equal(harness.localStorageValues.has('theme'), false);
  assert.equal(harness.elements['theme-toggle-btn'].getAttribute('aria-label'), 'Switch to light mode');
});

test('language toggle persists the choice and retranslates static and selected format labels', async () => {
  const settings = {
    image: { saveFormat: 'original' },
    filename: { rule: 'automatic', customTemplate: FilenameRule.DEFAULT_CUSTOM_TEMPLATE },
    directory: { rule: 'fixed' }
  };
  const harness = createOptionsHarness({ settings, updateSettings: async () => settings });
  await harness.document.emit('DOMContentLoaded');
  await flushOptionsInit();

  assert.equal(
    harness.elements['language-toggle-btn'].getAttribute('aria-label'),
    'Switch to Chinese'
  );
  await harness.elements['save-settings-btn'].emit('click');
  await harness.formatOptions.find(option => option.dataset.value === 'ask').emit('click');
  assert.equal(harness.elements['image-format-value'].textContent, 'Ask every time');

  await harness.elements['language-toggle-btn'].emit('click');
  assert.equal(harness.localStorageValues.get('language'), 'zh');
  assert.equal(harness.document.documentElement.lang, 'zh-CN');
  assert.match(harness.elements['save-settings-title'].textContent, /[\u4e00-\u9fff]/);
  assert.match(harness.elements['filename-section-title'].textContent, /[\u4e00-\u9fff]/);
  assert.match(harness.elements['directory-section-title'].textContent, /[\u4e00-\u9fff]/);
  assert.match(harness.elements['image-format-value'].textContent, /[\u4e00-\u9fff]/);

  await harness.elements['language-toggle-btn'].emit('click');
  assert.equal(harness.localStorageValues.get('language'), 'en');
  assert.equal(harness.document.documentElement.lang, 'en');
  assert.equal(harness.elements['save-settings-title'].textContent, 'Save settings');
  assert.equal(harness.elements['image-format-value'].textContent, 'Ask every time');

  const restoredHarness = createOptionsHarness({
    settings,
    updateSettings: async () => settings,
    localStorageEntries: { language: 'zh' }
  });
  await restoredHarness.document.emit('DOMContentLoaded');
  await flushOptionsInit();
  assert.equal(restoredHarness.document.documentElement.lang, 'zh-CN');
  assert.match(restoredHarness.elements['save-settings-title'].textContent, /[\u4e00-\u9fff]/);
});

test('language toggle retranslates visible connection, folder, and notification states', async () => {
  const settings = {
    image: { saveFormat: 'original' },
    filename: { rule: 'automatic', customTemplate: FilenameRule.DEFAULT_CUSTOM_TEMPLATE },
    directory: { rule: 'fixed' }
  };
  const harness = createOptionsHarness({ settings, updateSettings: async () => settings });
  await harness.document.emit('DOMContentLoaded');
  await flushOptionsInit();

  await harness.elements['test-connection-btn'].emit('click');
  await harness.elements['server-form'].emit('submit');
  harness.testApi.renderFolderPickerList([]);
  assert.match(harness.elements['connection-status'].innerHTML, /URL and Username are required/);
  assert.equal(harness.notificationMessage.textContent, 'Name, URL, and username are required.');
  assert.match(harness.elements['folder-list'].innerHTML, /No folders here/);

  await harness.elements['language-toggle-btn'].emit('click');
  assert.match(harness.elements['connection-status'].innerHTML, /测试需要填写 URL 和用户名/);
  assert.equal(harness.notificationMessage.textContent, '名称、URL 和用户名为必填项。');
  assert.match(harness.elements['folder-list'].innerHTML, /此处没有文件夹/);
});

test('known WebDAV errors remain fully localized when the language changes', async () => {
  const settings = {
    image: { saveFormat: 'original' },
    filename: { rule: 'automatic', customTemplate: FilenameRule.DEFAULT_CUSTOM_TEMPLATE },
    directory: { rule: 'fixed' }
  };
  const harness = createOptionsHarness({
    settings,
    updateSettings: async () => settings,
    configResponse: {
      success: false,
      error: 'Authentication failed. Check username and password.'
    }
  });
  await harness.document.emit('DOMContentLoaded');
  await flushOptionsInit();
  harness.elements['server-url'].value = 'https://example.com/webdav';
  harness.elements['server-username'].value = 'alice';

  await harness.elements['test-connection-btn'].emit('click');
  await harness.elements['open-folder-picker-btn'].emit('click');
  assert.match(harness.elements['connection-status'].innerHTML, /Authentication failed/);
  assert.match(harness.elements['folder-list'].innerHTML, /Authentication failed/);

  await harness.elements['language-toggle-btn'].emit('click');
  assert.match(harness.elements['connection-status'].innerHTML, /身份验证失败，请检查用户名和密码/);
  assert.match(harness.elements['folder-list'].innerHTML, /身份验证失败，请检查用户名和密码/);
  assert.doesNotMatch(harness.elements['connection-status'].innerHTML, /Authentication failed/);
  assert.doesNotMatch(harness.elements['folder-list'].innerHTML, /Authentication failed/);
});

test('Chinese filename validation localizes custom template errors', async () => {
  const settings = {
    image: { saveFormat: 'original' },
    filename: { rule: 'automatic', customTemplate: FilenameRule.DEFAULT_CUSTOM_TEMPLATE },
    directory: { rule: 'fixed' }
  };
  const harness = createOptionsHarness({
    settings,
    updateSettings: async () => settings,
    localStorageEntries: { language: 'zh' }
  });
  await harness.document.emit('DOMContentLoaded');
  await flushOptionsInit();
  await harness.elements['save-settings-btn'].emit('click');

  harness.elements['filename-rule'].value = 'custom';
  await harness.elements['filename-rule'].emit('change');
  const cases = [
    ['', '文件名模板不能为空。'],
    ['photo-{date', '模板变量的花括号必须成对。'],
    ['photo-{}', '模板变量不能为空。'],
    ['photo-{{date}}', '模板变量不能嵌套。'],
    ['photo-{unknown}', '不支持的模板变量：unknown。']
  ];
  for (const [template, error] of cases) {
    harness.elements['filename-template'].value = template;
    await harness.elements['filename-template'].emit('input');
    assert.equal(harness.elements['filename-template-error'].textContent, error, template);
    assert.equal(harness.elements['save-save-settings-btn'].disabled, true, template);
  }
});

test('server card language rendering follows the latest successful storage load', async () => {
  const settings = {
    image: { saveFormat: 'original' },
    filename: { rule: 'automatic', customTemplate: FilenameRule.DEFAULT_CUSTOM_TEMPLATE },
    directory: { rule: 'fixed' }
  };
  const server = {
    id: 'server-1',
    name: 'Personal cloud',
    url: 'https://example.com/webdav',
    username: 'alice',
    password: '',
    folder: '/Images'
  };
  const harness = createOptionsHarness({
    settings,
    updateSettings: async () => settings,
    webdavServers: [server]
  });
  await harness.document.emit('DOMContentLoaded');
  await flushOptionsInit();

  assert.deepEqual(
    JSON.parse(JSON.stringify(harness.testApi.getState().renderedServers)),
    [server]
  );
  harness.setWebdavServers([]);
  await harness.testApi.loadServers();
  await harness.elements['language-toggle-btn'].emit('click');

  assert.deepEqual(JSON.parse(JSON.stringify(harness.testApi.getState().renderedServers)), []);
  assert.equal(harness.elements['server-list'].children.length, 0);
});

test('save settings organizes format, filename, and directory in accessible keyboard tabs', async () => {
  const settings = {
    image: { saveFormat: 'original' },
    filename: { rule: 'automatic', customTemplate: FilenameRule.DEFAULT_CUSTOM_TEMPLATE },
    directory: { rule: 'fixed' }
  };
  const harness = createOptionsHarness({ settings, updateSettings: async () => settings });
  await harness.document.emit('DOMContentLoaded');
  await flushOptionsInit();

  const formatTab = harness.elements['settings-tab-format'];
  const filenameTab = harness.elements['settings-tab-filename'];
  const directoryTab = harness.elements['settings-tab-directory'];
  const formatPanel = harness.elements['settings-panel-format'];
  const filenamePanel = harness.elements['settings-panel-filename'];
  const directoryPanel = harness.elements['settings-panel-directory'];

  assert.equal(formatTab.getAttribute('role'), 'tab');
  assert.equal(formatTab.getAttribute('aria-selected'), 'true');
  assert.equal(formatPanel.hasAttribute('hidden'), false);
  assert.equal(filenamePanel.hasAttribute('hidden'), true);
  assert.equal(directoryPanel.hasAttribute('hidden'), true);

  await filenameTab.emit('click');
  assert.equal(filenameTab.getAttribute('aria-selected'), 'true');
  assert.equal(formatTab.getAttribute('aria-selected'), 'false');
  assert.equal(filenamePanel.hasAttribute('hidden'), false);
  assert.equal(formatPanel.hasAttribute('hidden'), true);
  assert.equal(directoryPanel.hasAttribute('hidden'), true);

  await filenameTab.emit('keydown', { key: 'ArrowRight' });
  assert.equal(directoryTab.getAttribute('aria-selected'), 'true');
  assert.equal(harness.document.activeElement, directoryTab);
  assert.equal(directoryPanel.hasAttribute('hidden'), false);
  assert.equal(filenamePanel.hasAttribute('hidden'), true);

  await directoryTab.emit('keydown', { key: 'Home' });
  assert.equal(formatTab.getAttribute('aria-selected'), 'true');
  assert.equal(harness.document.activeElement, formatTab);
  assert.equal(formatPanel.hasAttribute('hidden'), false);
  assert.equal(filenamePanel.hasAttribute('hidden'), true);
  assert.equal(directoryPanel.hasAttribute('hidden'), true);
});

test('directory rule changes render the resolved sample path immediately', async () => {
  const settings = {
    image: { saveFormat: 'original' },
    filename: { rule: 'automatic', customTemplate: FilenameRule.DEFAULT_CUSTOM_TEMPLATE },
    directory: { rule: 'fixed' }
  };
  const harness = createOptionsHarness({ settings, updateSettings: async () => settings });
  await harness.document.emit('DOMContentLoaded');
  await flushOptionsInit();

  harness.elements['directory-rule'].value = 'domain-date';
  await harness.elements['directory-rule'].emit('change');

  assert.equal(harness.elements['directory-preview'].textContent, '/Images/example.com/2026/08');
});

test('filename variable tokens replace the current selection and mark the template as edited', async () => {
  const updates = [];
  const settings = {
    schemaVersion: 4,
    image: { saveFormat: 'original' },
    filename: { rule: 'automatic', customTemplate: FilenameRule.DEFAULT_CUSTOM_TEMPLATE },
    directory: { rule: 'fixed' }
  };
  const harness = createOptionsHarness({
    settings,
    updateSettings: async (_storage, update) => {
      updates.push(update);
      return settings;
    }
  });
  await harness.document.emit('DOMContentLoaded');
  await flushOptionsInit();
  await harness.elements['save-settings-btn'].emit('click');

  harness.elements['filename-rule'].value = 'custom';
  await harness.elements['filename-rule'].emit('change');
  const template = harness.elements['filename-template'];
  template.value = 'prefix--suffix.{ext}';
  template.setSelectionRange(7, 8);
  template.focus();

  await harness.variableTokens.find(token => token.dataset.variable === 'domain').emit('click');

  assert.equal(template.value, 'prefix-{domain}suffix.{ext}');
  assert.equal(template.selectionStart, 15);
  assert.equal(template.selectionEnd, 15);
  assert.equal(harness.document.activeElement, template);
  assert.equal(harness.elements['filename-preview'].textContent, 'prefix-example.comsuffix.jpg');

  await harness.elements['save-settings-form'].emit('submit');
  assert.deepEqual(JSON.parse(JSON.stringify(updates)), [{
    filename: { rule: 'custom', customTemplate: 'prefix-{domain}suffix.{ext}' }
  }]);
});
