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

  return {
    calls,
    data,
    async get(keys) {
      const requestedKeys = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(requestedKeys.map(key => [key, structuredClone(data[key])]));
    },
    async set(values) {
      calls.set.push(structuredClone(values));
      Object.assign(data, structuredClone(values));
    },
    async remove(keys) {
      const requestedKeys = Array.isArray(keys) ? keys : [keys];
      calls.remove.push([...requestedKeys]);
      requestedKeys.forEach(key => delete data[key]);
    }
  };
}

test('creates a versioned default settings object', () => {
  assert.equal(SETTINGS_STORAGE_KEY, 'appSettings');
  assert.equal(SETTINGS_SCHEMA_VERSION, 1);
  assert.deepEqual(createDefaultSettings(), {
    schemaVersion: 1,
    image: {
      saveFormat: 'original'
    }
  });
});

test('migrates the legacy image format key into appSettings', async () => {
  const storage = createStorage({ imageFormatPreference: 'webp' });

  const settings = await loadSettings(storage);

  assert.equal(settings.image.saveFormat, 'webp');
  assert.deepEqual(storage.data.appSettings, settings);
  assert.equal('imageFormatPreference' in storage.data, false);
  assert.deepEqual(storage.calls.remove, [['imageFormatPreference']]);
});

test('normalization preserves unknown fields and future schema versions', () => {
  const settings = normalizeSettings({
    schemaVersion: 4,
    image: {
      saveFormat: 'png',
      futureImageOption: true
    },
    notifications: {
      enabled: false
    }
  });

  assert.deepEqual(settings, {
    schemaVersion: 4,
    image: {
      saveFormat: 'png',
      futureImageOption: true
    },
    notifications: {
      enabled: false
    }
  });
});

test('partial updates preserve other setting groups and nested fields', async () => {
  const storage = createStorage({
    appSettings: {
      schemaVersion: 1,
      image: {
        saveFormat: 'original',
        futureImageOption: 'keep-me'
      },
      upload: {
        countdownSeconds: 5
      }
    }
  });

  const settings = await updateSettings(storage, {
    image: {
      saveFormat: 'jpg'
    }
  });

  assert.deepEqual(settings, {
    schemaVersion: 1,
    image: {
      saveFormat: 'jpg',
      futureImageOption: 'keep-me'
    },
    upload: {
      countdownSeconds: 5
    }
  });
  assert.deepEqual(storage.data.appSettings, settings);
});

test('invalid image formats fall back to original', () => {
  assert.equal(normalizeSettings({ image: { saveFormat: 'invalid' } }).image.saveFormat, 'original');
});

test('updates cannot downgrade a future schema version', async () => {
  const storage = createStorage({
    appSettings: {
      schemaVersion: 4,
      image: { saveFormat: 'original' }
    }
  });

  const settings = await updateSettings(storage, {
    schemaVersion: 1,
    image: { saveFormat: 'webp' }
  });

  assert.equal(settings.schemaVersion, 4);
  assert.equal(settings.image.saveFormat, 'webp');
});

test('concurrent partial updates are serialized without losing fields', async () => {
  const storage = createStorage({
    appSettings: createDefaultSettings()
  });
  const originalGet = storage.get;
  storage.get = async keys => {
    const result = await originalGet.call(storage, keys);
    await new Promise(resolve => setTimeout(resolve, 5));
    return result;
  };

  await Promise.all([
    updateSettings(storage, { image: { saveFormat: 'png' } }),
    updateSettings(storage, { upload: { countdownSeconds: 6 } })
  ]);

  assert.equal(storage.data.appSettings.image.saveFormat, 'png');
  assert.equal(storage.data.appSettings.upload.countdownSeconds, 6);
});