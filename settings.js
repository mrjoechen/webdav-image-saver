(function (root, factory) {
    const imageFormat = typeof module === 'object' && module.exports
        ? require('./image-format.js')
        : root.ImageFormat;
    const appSettings = factory(imageFormat);

    if (typeof module === 'object' && module.exports) {
        module.exports = appSettings;
    }

    root.AppSettings = appSettings;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (imageFormat) {
    const SETTINGS_STORAGE_KEY = 'appSettings';
    const LEGACY_IMAGE_FORMAT_KEY = 'imageFormatPreference';
    const SETTINGS_SCHEMA_VERSION = 1;
    let settingsUpdateQueue = Promise.resolve();

    function isPlainObject(value) {
        return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
    }

    function createDefaultSettings() {
        return {
            schemaVersion: SETTINGS_SCHEMA_VERSION,
            image: {
                saveFormat: 'original'
            }
        };
    }

    function normalizeSettings(value, legacyImageFormat) {
        const source = isPlainObject(value) ? value : {};
        const sourceImage = isPlainObject(source.image) ? source.image : {};
        const hasStoredImageFormat = Object.prototype.hasOwnProperty.call(sourceImage, 'saveFormat');
        const sourceSchemaVersion = Number.isInteger(source.schemaVersion) && source.schemaVersion > 0
            ? source.schemaVersion
            : SETTINGS_SCHEMA_VERSION;

        return {
            ...source,
            schemaVersion: Math.max(sourceSchemaVersion, SETTINGS_SCHEMA_VERSION),
            image: {
                ...sourceImage,
                saveFormat: imageFormat.normalizeFormatPreference(
                    hasStoredImageFormat ? sourceImage.saveFormat : legacyImageFormat
                )
            }
        };
    }

    function mergeSettings(base, updates) {
        if (!isPlainObject(updates)) return base;

        const result = { ...base };
        Object.entries(updates).forEach(([key, value]) => {
            result[key] = isPlainObject(value) && isPlainObject(base[key])
                ? mergeSettings(base[key], value)
                : value;
        });
        return result;
    }

    async function loadSettings(storage) {
        const data = await storage.get([SETTINGS_STORAGE_KEY, LEGACY_IMAGE_FORMAT_KEY]);
        const storedSettings = data[SETTINGS_STORAGE_KEY];
        const legacyImageFormat = data[LEGACY_IMAGE_FORMAT_KEY];
        const settings = normalizeSettings(storedSettings, legacyImageFormat);
        const needsCanonicalWrite = !isPlainObject(storedSettings) ||
            JSON.stringify(storedSettings) !== JSON.stringify(settings);

        if (needsCanonicalWrite) {
            await storage.set({ [SETTINGS_STORAGE_KEY]: settings });
        }

        if (legacyImageFormat !== undefined) {
            await storage.remove(LEGACY_IMAGE_FORMAT_KEY);
        }

        return settings;
    }

    function updateSettings(storage, updates) {
        const updateTask = settingsUpdateQueue.then(async () => {
            const currentSettings = await loadSettings(storage);
            const nextSettings = normalizeSettings(mergeSettings(currentSettings, updates));
            nextSettings.schemaVersion = Math.max(
                currentSettings.schemaVersion,
                nextSettings.schemaVersion
            );
            await storage.set({ [SETTINGS_STORAGE_KEY]: nextSettings });
            return nextSettings;
        });

        settingsUpdateQueue = updateTask.catch(() => {});
        return updateTask;
    }

    return {
        LEGACY_IMAGE_FORMAT_KEY,
        SETTINGS_SCHEMA_VERSION,
        SETTINGS_STORAGE_KEY,
        createDefaultSettings,
        loadSettings,
        normalizeSettings,
        updateSettings
    };
}));