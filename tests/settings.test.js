const assert = require('node:assert/strict');
const test = require('node:test');

const {
  SETTINGS_SCHEMA_VERSION,
  SETTINGS_STORAGE_KEY,
  createDefaultSettings,
  loadSettings,
  normalizeSettings,
  updateSettings
} = require('../settings.js');

function createStorage(initialData = {}) {
  const data = structuredClone(initialData);
  const calls = { remove: [], set: [] };
  let api;

  api = {
    calls,
    data,
    failNextSet: false,
    async get(keys) {
      const requestedKeys = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(requestedKeys.map(key => [key, structuredClone(data[key])]));
    },
    async set(values) {
      calls.set.push(structuredClone(values));
      if (api.failNextSet) {
        api.failNextSet = false;
        throw new Error('set failed once');
      }
      Object.assign(data, structuredClone(values));
    },
    async remove(keys) {
      const requestedKeys = Array.isArray(keys) ? keys : [keys];
      calls.remove.push([...requestedKeys]);
      requestedKeys.forEach(key => delete data[key]);
    }
  };
  return api;
}

const defaultLocalCopy = {
  enabled: false,
  folderName: '',
  directory: { rule: 'webdav' },
  filename: { rule: 'webdav', customTemplate: '{originalName}_{date}_{domain}.{ext}' }
};

test('creates exact version 4 defaults and exports', () => {
  assert.equal(SETTINGS_STORAGE_KEY, 'appSettings');
  assert.equal(SETTINGS_SCHEMA_VERSION, 4);
  assert.deepEqual(createDefaultSettings(), {
    schemaVersion: 4,
    image: { saveFormat: 'original' },
    filename: { rule: 'automatic', customTemplate: '{originalName}_{date}_{domain}.{ext}' },
    directory: { rule: 'fixed' },
    localCopy: defaultLocalCopy
  });
});

test('migrates the legacy image format key into a full v2 appSettings object', async () => {
  const storage = createStorage({ imageFormatPreference: 'webp' });
  const settings = await loadSettings(storage);

  assert.deepEqual(settings, {
    schemaVersion: 4,
    image: { saveFormat: 'webp' },
    filename: { rule: 'automatic', customTemplate: '{originalName}_{date}_{domain}.{ext}' },
    directory: { rule: 'fixed' },
    localCopy: defaultLocalCopy
  });
  assert.deepEqual(storage.data.appSettings, settings);
  assert.equal('imageFormatPreference' in storage.data, false);
  assert.deepEqual(storage.calls.remove, [['imageFormatPreference']]);
  assert.equal(storage.calls.set.length, 1);
});

test('migrates explicit schema 1 settings and writes the canonical v2 value', async () => {
  const storage = createStorage({ appSettings: { schemaVersion: 1, image: { saveFormat: 'png' } } });
  const settings = await loadSettings(storage);

  assert.equal(settings.schemaVersion, 4);
  assert.equal(settings.image.saveFormat, 'png');
  assert.equal(settings.filename.rule, 'automatic');
  assert.equal(settings.directory.rule, 'fixed');
  assert.deepEqual(settings.localCopy, defaultLocalCopy);
  assert.equal(storage.calls.set.length, 1);
});

test('canonical v4 load does not set unnecessarily', async () => {
  const storage = createStorage({ appSettings: createDefaultSettings() });
  await loadSettings(storage);
  assert.deepEqual(storage.calls.set, []);
  assert.deepEqual(storage.calls.remove, []);
});

test('normalizes invalid filename rule, template, directory rule, and local copy', () => {
  const settings = normalizeSettings({
    schemaVersion: 3,
    filename: { rule: 'bad', customTemplate: ' {unknown} ' },
    directory: { rule: 'bad' },
    localCopy: { enabled: 1, folderName: '  Photos  ', filename: { rule: 'nope', customTemplate: '{bad}' } }
  });
  assert.equal(settings.filename.rule, 'automatic');
  assert.equal(settings.filename.customTemplate, '{originalName}_{date}_{domain}.{ext}');
  assert.equal(settings.directory.rule, 'fixed');
  assert.equal(settings.localCopy.enabled, true);
  assert.equal(settings.localCopy.folderName, 'Photos');
  assert.equal(settings.localCopy.directory.rule, 'webdav');
  assert.equal(settings.localCopy.filename.rule, 'automatic');
  assert.equal(settings.localCopy.filename.customTemplate, '{originalName}_{date}_{domain}.{ext}');
});

test('migrates v3 local copies to inherit WebDAV directory while preserving filename choice', async () => {
  const storage = createStorage({
    appSettings: {
      schemaVersion: 3,
      image: { saveFormat: 'original' },
      filename: { rule: 'custom', customTemplate: 'webdav-{date}.{ext}' },
      directory: { rule: 'domain-date' },
      localCopy: {
        enabled: true,
        folderName: 'Pictures',
        filename: { rule: 'original', customTemplate: 'local-{date}.{ext}' }
      }
    }
  });

  const settings = await loadSettings(storage);

  assert.equal(settings.schemaVersion, 4);
  assert.deepEqual(settings.localCopy.directory, { rule: 'webdav' });
  assert.deepEqual(settings.localCopy.filename, {
    rule: 'original',
    customTemplate: 'local-{date}.{ext}'
  });
  assert.deepEqual(storage.data.appSettings, settings);
  assert.equal(storage.calls.set.length, 1);
});

test('trims and preserves a valid custom template even under automatic rule', () => {
  const settings = normalizeSettings({ filename: { rule: 'automatic', customTemplate: '  {originalName}-{ext}  ' } });
  assert.equal(settings.filename.rule, 'automatic');
  assert.equal(settings.filename.customTemplate, '{originalName}-{ext}');
});

test('preserves unknown fields and future schema versions at every level', () => {
  const settings = normalizeSettings({
    schemaVersion: 5,
    image: { saveFormat: 'png', futureImageOption: true },
    filename: { rule: 'original', customTemplate: '{domain}', futureFilenameOption: 7 },
    directory: { rule: 'date', futureDirectoryOption: 'keep' },
    localCopy: { enabled: 'maybe', folderName: 'USB', destination: 'external', directory: { rule: 'bucket', extra: 'directory' }, filename: { rule: 'hash', extra: true } },
    notifications: { enabled: false }
  });
  assert.deepEqual(settings, {
    schemaVersion: 5,
    image: { saveFormat: 'png', futureImageOption: true },
    filename: { rule: 'original', customTemplate: '{domain}', futureFilenameOption: 7 },
    directory: { rule: 'date', futureDirectoryOption: 'keep' },
    localCopy: {
      enabled: 'maybe',
      folderName: 'USB',
      destination: 'external',
      directory: { rule: 'bucket', extra: 'directory' },
      filename: { rule: 'hash', customTemplate: '{originalName}_{date}_{domain}.{ext}', extra: true }
    },
    notifications: { enabled: false }
  });
});

test('preserves present future-schema values without normalization', () => {
  const source = {
    schemaVersion: 5,
    image: { saveFormat: 'avif' },
    filename: { rule: 'content-hash', customTemplate: ' {futureVariable} ' },
    directory: { rule: 'project' },
    localCopy: { enabled: 'maybe', folderName: 'USB', directory: { rule: 'bucket' }, filename: { rule: 'hash', customTemplate: '{x}' } }
  };
  assert.deepEqual(normalizeSettings(source), source);
});

test('future-schema load does not destructively canonicalize present values', async () => {
  const stored = {
    schemaVersion: 5,
    image: { saveFormat: 'avif' },
    filename: { rule: 'content-hash', customTemplate: '{futureVariable}' },
    directory: { rule: 'project' },
    localCopy: { enabled: 'maybe', folderName: 'USB', directory: { rule: 'bucket' }, filename: { rule: 'hash', customTemplate: '{x}' } }
  };
  const storage = createStorage({ appSettings: stored });
  const settings = await loadSettings(storage);
  assert.deepEqual(settings, stored);
  assert.deepEqual(storage.calls.set, []);
});

test('future-schema update preserves future values while applying unrelated changes', async () => {
  const storage = createStorage({ appSettings: {
    schemaVersion: 5,
    image: { saveFormat: 'avif' },
    filename: { rule: 'content-hash', customTemplate: '{futureVariable}' },
    directory: { rule: 'project' },
    localCopy: { enabled: 'maybe', folderName: 'USB', directory: { rule: 'bucket' }, filename: { rule: 'hash', customTemplate: '{x}' } }
  } });
  const settings = await updateSettings(storage, { upload: { countdownSeconds: 8 } });
  assert.equal(settings.schemaVersion, 5);
  assert.equal(settings.image.saveFormat, 'avif');
  assert.equal(settings.filename.rule, 'content-hash');
  assert.equal(settings.filename.customTemplate, '{futureVariable}');
  assert.equal(settings.directory.rule, 'project');
  assert.equal(settings.localCopy.enabled, 'maybe');
  assert.equal(settings.upload.countdownSeconds, 8);
});

test('schema downgrade updates preserve future values before normalization', async () => {
  const storage = createStorage({ appSettings: {
    schemaVersion: 5,
    image: { saveFormat: 'avif' },
    filename: { rule: 'content-hash', customTemplate: '{futureVariable}' },
    directory: { rule: 'project' },
    localCopy: { enabled: 'maybe', folderName: 'USB', directory: { rule: 'bucket' }, filename: { rule: 'hash', customTemplate: '{x}' } }
  } });
  const settings = await updateSettings(storage, {
    schemaVersion: 1,
    upload: { countdownSeconds: 9 }
  });
  assert.equal(settings.schemaVersion, 5);
  assert.equal(settings.image.saveFormat, 'avif');
  assert.equal(settings.filename.rule, 'content-hash');
  assert.equal(settings.filename.customTemplate, '{futureVariable}');
  assert.equal(settings.directory.rule, 'project');
  assert.equal(settings.localCopy.folderName, 'USB');
  assert.equal(settings.upload.countdownSeconds, 9);
});

test('non-object groups safely normalize and partial updates preserve nested future fields', async () => {
  const storage = createStorage({
    appSettings: {
      schemaVersion: 2,
      image: 'invalid',
      filename: { rule: 'original', customTemplate: '{domain}', future: true },
      directory: { rule: 'date', future: true },
      localCopy: { enabled: true, folderName: 'Photos', filename: { rule: 'original', extra: true } },
      upload: { countdownSeconds: 5 }
    }
  });
  const settings = await updateSettings(storage, {
    image: { saveFormat: 'jpg' },
    filename: { rule: 'custom' },
    directory: { rule: 'domain' },
    localCopy: { filename: { rule: 'custom' } }
  });
  assert.deepEqual(settings.image, { saveFormat: 'jpg' });
  assert.deepEqual(settings.filename, { rule: 'custom', customTemplate: '{domain}', future: true });
  assert.deepEqual(settings.directory, { rule: 'domain', future: true });
  assert.deepEqual(settings.localCopy, {
    enabled: true,
    folderName: 'Photos',
    directory: { rule: 'webdav' },
    filename: { rule: 'custom', customTemplate: '{originalName}_{date}_{domain}.{ext}', extra: true }
  });
  assert.deepEqual(settings.upload, { countdownSeconds: 5 });
});

test('updates cannot downgrade a future schema version', async () => {
  const storage = createStorage({ appSettings: { schemaVersion: 5, image: { saveFormat: 'original' }, filename: { rule: 'automatic', customTemplate: '{domain}' }, directory: { rule: 'fixed' } } });
  const settings = await updateSettings(storage, { schemaVersion: 1, image: { saveFormat: 'webp' } });
  assert.equal(settings.schemaVersion, 5);
  assert.equal(settings.image.saveFormat, 'webp');
});

test('concurrent partial updates across groups and unrelated fields retain all values', async () => {
  const storage = createStorage({ appSettings: createDefaultSettings() });
  const originalGet = storage.get;
  storage.get = async keys => {
    const result = await originalGet.call(storage, keys);
    await new Promise(resolve => setTimeout(resolve, 5));
    return result;
  };
  await Promise.all([
    updateSettings(storage, { image: { saveFormat: 'png' } }),
    updateSettings(storage, { filename: { rule: 'custom' } }),
    updateSettings(storage, { directory: { rule: 'date' } }),
    updateSettings(storage, { localCopy: { enabled: true, folderName: 'Pictures' } }),
    updateSettings(storage, { upload: { countdownSeconds: 6 } })
  ]);
  assert.equal(storage.data.appSettings.image.saveFormat, 'png');
  assert.equal(storage.data.appSettings.filename.rule, 'custom');
  assert.equal(storage.data.appSettings.directory.rule, 'date');
  assert.equal(storage.data.appSettings.localCopy.enabled, true);
  assert.equal(storage.data.appSettings.localCopy.folderName, 'Pictures');
  assert.equal(storage.data.appSettings.upload.countdownSeconds, 6);
});

test('invalid image formats fall back to original', () => {
  assert.equal(normalizeSettings({ image: { saveFormat: 'invalid' } }).image.saveFormat, 'original');
});

test('queue recovers after a failed storage update', async () => {
  const storage = createStorage({ appSettings: createDefaultSettings() });
  storage.failNextSet = true;
  await assert.rejects(updateSettings(storage, { image: { saveFormat: 'png' } }), /set failed once/);
  const settings = await updateSettings(storage, { image: { saveFormat: 'webp' } });
  assert.equal(settings.image.saveFormat, 'webp');
  assert.equal(storage.data.appSettings.image.saveFormat, 'webp');
});
