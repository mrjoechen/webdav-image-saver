const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const SidePanelApp = require('../sidepanel/sidepanel.js');
const optionsCss = readFileSync(path.join(__dirname, '..', 'options', 'options.css'), 'utf8');
const sidePanelCss = readFileSync(path.join(__dirname, '..', 'sidepanel', 'sidepanel.css'), 'utf8');

function declarationsFor(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}\\s*\\{([^}]+)\\}`).exec(source);
  assert.ok(match, `Missing CSS block for ${selector}`);
  return Object.fromEntries(match[1]
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const separator = part.indexOf(':');
      return [part.slice(0, separator).trim(), part.slice(separator + 1).trim()];
    }));
}

function exactDeclarationsFor(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]+)\\}`, 'm').exec(source);
  assert.ok(match, `Missing exact CSS block for ${selector}`);
  return Object.fromEntries(match[1]
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const separator = part.indexOf(':');
      return [part.slice(0, separator).trim(), part.slice(separator + 1).trim()];
    }));
}

const images = [
  { id: 'image-1', url: 'https://cdn.example/one.jpg', name: 'one.jpg' },
  { id: 'image-2', url: 'https://cdn.example/two.jpg', name: 'two.jpg' }
];

test('side panel shares the settings page visual tokens', () => {
  const settingsTokens = declarationsFor(optionsCss, ':root');
  const panelTokens = declarationsFor(sidePanelCss, ':root');
  const sharedTokens = [
    '--background',
    '--background-strong',
    '--surface',
    '--surface-strong',
    '--surface-muted',
    '--surface-hover',
    '--border',
    '--border-strong',
    '--text-primary',
    '--text-secondary',
    '--text-muted',
    '--button-bg',
    '--button-text',
    '--button-hover',
    '--glass-blur',
    '--radius',
    '--radius-sm',
    '--radius-pill',
    '--font-family',
    '--font-size-xs',
    '--font-size-sm',
    '--font-size-base'
  ];

  for (const token of sharedTokens) {
    assert.equal(panelTokens[token], settingsTokens[token], `${token} should match settings`);
  }
});

test('side panel honors the same saved and system dark theme overrides as settings', () => {
  const sharedDarkTokens = [
    'color-scheme',
    '--background',
    '--background-strong',
    '--surface',
    '--surface-strong',
    '--surface-muted',
    '--surface-hover',
    '--border',
    '--border-strong',
    '--text-primary',
    '--text-secondary',
    '--text-muted',
    '--button-bg',
    '--button-text',
    '--button-hover',
    '--danger',
    '--success',
    '--warning',
    '--shadow-card'
  ];
  const settingsSystemDark = declarationsFor(optionsCss, ':root:not([data-theme="light"])');
  const panelSystemDark = declarationsFor(sidePanelCss, ':root:not([data-theme="light"])');
  const settingsSavedDark = exactDeclarationsFor(optionsCss, ':root[data-theme="dark"]');
  const panelSavedDark = exactDeclarationsFor(sidePanelCss, ':root[data-theme="dark"]');

  for (const token of sharedDarkTokens) {
    assert.equal(panelSystemDark[token], settingsSystemDark[token], `system dark ${token} should match settings`);
    assert.equal(panelSavedDark[token], settingsSavedDark[token], `saved dark ${token} should match settings`);
  }
});

test('side panel translates dynamic batch copy in English and Chinese', () => {
  assert.equal(SidePanelApp.translate('en', 'saveSelectedImages', { count: 3 }), 'Save 3 images');
  assert.equal(SidePanelApp.translate('zh', 'saveSelectedImages', { count: 3 }), '保存 3 张图片');
  assert.equal(
    SidePanelApp.translate('zh', 'batchSummary', { saved: 2, failed: 1, cancelled: 0 }),
    '已保存 2 · 失败 1 · 已取消 0'
  );
  assert.equal(SidePanelApp.translate('unsupported', 'refresh'), 'Refresh');
});

test('side panel localizes known batch details while preserving server errors', () => {
  assert.equal(
    SidePanelApp.batchItemDetail('zh', {
      state: 'warning',
      message: 'Saved original GIF; animated images cannot be converted.',
      warningCodes: ['animated-image', 'local-copy']
    }, '/Images/photo.gif'),
    '动画图片已保留原格式 · 本地副本未能保存'
  );
  assert.equal(
    SidePanelApp.batchItemDetail('zh', { state: 'failed', error: 'HTTP 507 Insufficient Storage' }, ''),
    'HTTP 507 Insufficient Storage'
  );
  assert.equal(
    SidePanelApp.batchItemDetail('en', { state: 'success', message: 'Saved as photo.jpg' }, '/Images/photo.jpg'),
    '/Images/photo.jpg'
  );
  assert.equal(SidePanelApp.batchItemDetail('zh', { state: 'cancelled', message: 'Cancelled' }, ''), '已取消');
});

test('side panel applies translated text and accessible attributes to its document', () => {
  const textElement = { dataset: { i18n: 'refresh' }, textContent: '' };
  const labelledElement = {
    attributes: new Map([['data-i18n-aria-label', 'openSettings']]),
    getAttribute(name) {
      return this.attributes.get(name) || null;
    },
    setAttribute(name, value) {
      this.attributes.set(name, value);
    }
  };
  const titledElement = {
    attributes: new Map([['data-i18n-title', 'settings']]),
    getAttribute(name) {
      return this.attributes.get(name) || null;
    },
    setAttribute(name, value) {
      this.attributes.set(name, value);
    }
  };
  const doc = {
    title: '',
    querySelectorAll(selector) {
      if (selector === '[data-i18n]') return [textElement];
      if (selector === '[data-i18n-aria-label]') return [labelledElement];
      if (selector === '[data-i18n-title]') return [titledElement];
      return [];
    }
  };

  SidePanelApp.applyDocumentLanguage(doc, 'zh');

  assert.equal(doc.title, '批量保存图片');
  assert.equal(textElement.textContent, '刷新');
  assert.equal(labelledElement.attributes.get('aria-label'), '打开扩展设置');
  assert.equal(titledElement.attributes.get('title'), '设置');
});

test('side panel applies saved UI preferences and reacts only to relevant storage changes', () => {
  const entries = new Map([
    ['theme', 'dark'],
    ['language', 'zh']
  ]);
  const storage = {
    getItem(key) {
      return entries.has(key) ? entries.get(key) : null;
    }
  };
  const root = { dataset: {}, lang: '' };
  const appliedLanguages = [];
  const preferences = SidePanelApp.createUiPreferenceSync({
    root,
    storage,
    onLanguageChange: language => appliedLanguages.push(language)
  });

  assert.deepEqual(preferences.sync(), { theme: 'dark', language: 'zh' });
  assert.equal(root.dataset.theme, 'dark');
  assert.equal(root.dataset.language, 'zh');
  assert.equal(root.lang, 'zh-CN');
  assert.deepEqual(appliedLanguages, ['zh']);

  entries.set('theme', 'light');
  preferences.handleStorage({ key: 'theme' });
  assert.equal(root.dataset.theme, 'light');
  assert.deepEqual(appliedLanguages, ['zh']);

  entries.set('language', 'en');
  preferences.handleStorage({ key: 'language' });
  assert.equal(root.dataset.language, 'en');
  assert.equal(root.lang, 'en');
  assert.deepEqual(appliedLanguages, ['zh', 'en']);

  entries.set('theme', 'invalid');
  preferences.handleStorage({ key: null });
  assert.equal('theme' in root.dataset, false);

  preferences.handleStorage({ key: 'unrelated' });
  assert.deepEqual(appliedLanguages, ['zh', 'en']);
});

test('side panel controls use the settings page spatial metrics', () => {
  const iconButton = declarationsFor(sidePanelCss, '.icon-button');
  const select = declarationsFor(sidePanelCss, '.field select');
  const primaryButton = declarationsFor(sidePanelCss, '.primary-button');
  const imageRow = declarationsFor(sidePanelCss, '.image-row');

  assert.equal(iconButton.width, '42px');
  assert.equal(iconButton.height, '42px');
  assert.equal(iconButton['border-radius'], 'var(--radius-pill)');
  assert.equal(select['min-height'], '44px');
  assert.equal(select.padding, '10px 12px');
  assert.equal(select['border-radius'], 'var(--radius-sm)');
  assert.equal(primaryButton['min-height'], '42px');
  assert.equal(primaryButton['border-radius'], 'var(--radius-pill)');
  assert.equal(imageRow.gap, '12px');
  assert.equal(imageRow.padding, '12px');
  assert.equal(imageRow['border-radius'], 'var(--radius)');
});

test('selected image cards rely on the checkbox without an inset accent rail', () => {
  const selectedRow = exactDeclarationsFor(sidePanelCss, '.image-row.selected');

  assert.doesNotMatch(selectedRow['box-shadow'] || '', /\binset\b/);
});

test('destination combobox reuses the settings page custom select treatment', () => {
  const settingsTrigger = exactDeclarationsFor(optionsCss, '.format-select-trigger');
  const panelTrigger = exactDeclarationsFor(sidePanelCss, '.format-select-trigger');
  const settingsChevron = exactDeclarationsFor(optionsCss, '.format-select-chevron');
  const panelChevron = exactDeclarationsFor(sidePanelCss, '.format-select-chevron');
  const settingsList = exactDeclarationsFor(optionsCss, '.format-select-list');
  const panelList = exactDeclarationsFor(sidePanelCss, '.format-select-list');
  const settingsOption = exactDeclarationsFor(optionsCss, '.format-select-option');
  const panelOption = exactDeclarationsFor(sidePanelCss, '.format-select-option');

  for (const property of ['min-height', 'padding', 'background-color', 'border', 'border-radius', 'line-height']) {
    assert.equal(panelTrigger[property], settingsTrigger[property], `trigger ${property} should match settings`);
  }
  for (const property of ['right', 'width', 'height', 'color']) {
    assert.equal(panelChevron[property], settingsChevron[property], `chevron ${property} should match settings`);
  }
  for (const property of ['gap', 'padding', 'background-color', 'border', 'box-shadow']) {
    assert.equal(panelList[property], settingsList[property], `menu ${property} should match settings`);
  }
  for (const property of ['min-height', 'gap', 'padding', 'border-radius', 'font-size']) {
    assert.equal(panelOption[property], settingsOption[property], `option ${property} should match settings`);
  }
});

test('destination menu derives its visible label and selected option from configured servers', () => {
  const menu = SidePanelApp.createDestinationMenu([
    { id: 'server-1', name: 'NAS', folder: '/Photos' },
    { id: 'server-2', name: 'Backup', folder: '' }
  ], 'server-2');

  assert.deepEqual(menu, {
    disabled: false,
    value: 'server-2',
    label: 'Backup · /',
    items: [
      { value: 'server-1', label: 'NAS · /Photos', selected: false },
      { value: 'server-2', label: 'Backup · /', selected: true }
    ]
  });
  assert.deepEqual(SidePanelApp.createDestinationMenu([], ''), {
    disabled: true,
    value: '',
    label: 'No destinations configured',
    items: []
  });
});

test('destination menu keyboard navigation wraps and supports boundary keys', () => {
  assert.equal(SidePanelApp.nextDestinationIndex(0, 'ArrowDown', 3), 1);
  assert.equal(SidePanelApp.nextDestinationIndex(2, 'ArrowDown', 3), 0);
  assert.equal(SidePanelApp.nextDestinationIndex(0, 'ArrowUp', 3), 2);
  assert.equal(SidePanelApp.nextDestinationIndex(1, 'Home', 3), 0);
  assert.equal(SidePanelApp.nextDestinationIndex(1, 'End', 3), 2);
  assert.equal(SidePanelApp.nextDestinationIndex(1, 'Tab', 3), 1);
  assert.equal(SidePanelApp.nextDestinationIndex(0, 'ArrowDown', 0), -1);
});

test('panel model selects all discovered images and the only destination', () => {
  const model = SidePanelApp.createPanelModel({
    scan: { scanId: 'scan-1', tabId: 7, images },
    servers: [{ id: 'server-1', name: 'NAS' }],
    settings: { image: { saveFormat: 'original' } }
  });

  assert.deepEqual(model.selectedIds, ['image-1', 'image-2']);
  assert.equal(model.serverId, 'server-1');
  assert.equal(model.targetFormat, 'original');
  assert.equal(SidePanelApp.canStartBatch(model), true);
});

test('panel requires explicit destination and batch format when choices exist', () => {
  const model = SidePanelApp.createPanelModel({
    scan: { scanId: 'scan-1', tabId: 7, images },
    servers: [
      { id: 'server-1', name: 'NAS' },
      { id: 'server-2', name: 'Backup' }
    ],
    settings: { image: { saveFormat: 'ask' } }
  });

  assert.equal(model.serverId, '');
  assert.equal(model.targetFormat, '');
  assert.equal(SidePanelApp.canStartBatch(model), false);

  const ready = SidePanelApp.updatePanelModel(model, {
    serverId: 'server-2',
    targetFormat: 'webp'
  });
  assert.equal(SidePanelApp.canStartBatch(ready), true);
});

test('selection updates stay unique and reject unavailable image ids', () => {
  const model = SidePanelApp.createPanelModel({
    scan: { scanId: 'scan-1', tabId: 7, images },
    servers: [],
    settings: { image: { saveFormat: 'jpg' } }
  });

  const cleared = SidePanelApp.updatePanelModel(model, { selectedIds: [] });
  const selected = SidePanelApp.updatePanelModel(cleared, {
    selectedIds: ['image-2', 'image-2', 'missing']
  });

  assert.deepEqual(selected.selectedIds, ['image-2']);
  assert.deepEqual(SidePanelApp.selectedImages(selected).map(image => image.id), ['image-2']);
  assert.equal(SidePanelApp.canStartBatch(selected), false);
});
