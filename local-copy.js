(function (root, factory) {
    const filenameRule = typeof module === 'object' && module.exports
        ? require('./filename-rule.js')
        : root.FilenameRule;
    const directoryRule = typeof module === 'object' && module.exports
        ? require('./directory-rule.js')
        : root.DirectoryRule;
    const localCopy = factory(filenameRule, directoryRule);

    if (typeof module === 'object' && module.exports) {
        module.exports = localCopy;
    }

    root.LocalCopy = localCopy;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (filenameRule, directoryRule) {
    const DEFAULT_CUSTOM_TEMPLATE = filenameRule.DEFAULT_CUSTOM_TEMPLATE;

    function isPlainObject(value) {
        return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
    }

    function createDefaultLocalCopy() {
        return {
            enabled: false,
            folderName: '',
            directory: {
                rule: 'webdav'
            },
            filename: {
                rule: 'webdav',
                customTemplate: DEFAULT_CUSTOM_TEMPLATE
            }
        };
    }

    function normalizeLocalCopy(value, isFutureSchema = false) {
        const source = isPlainObject(value) ? value : {};
        const sourceDirectory = isPlainObject(source.directory) ? source.directory : {};
        const sourceFilename = isPlainObject(source.filename) ? source.filename : {};
        const hasEnabled = Object.prototype.hasOwnProperty.call(source, 'enabled');
        const hasFolderName = Object.prototype.hasOwnProperty.call(source, 'folderName');
        const hasDirectoryRule = Object.prototype.hasOwnProperty.call(sourceDirectory, 'rule');
        const hasFilenameRule = Object.prototype.hasOwnProperty.call(sourceFilename, 'rule');
        const customTemplate = String(Object.prototype.hasOwnProperty.call(sourceFilename, 'customTemplate')
            ? sourceFilename.customTemplate == null ? '' : sourceFilename.customTemplate
            : DEFAULT_CUSTOM_TEMPLATE).trim();

        return {
            ...source,
            enabled: isFutureSchema && hasEnabled ? source.enabled : Boolean(source.enabled),
            folderName: isFutureSchema && hasFolderName
                ? source.folderName
                : String(source.folderName == null ? '' : source.folderName).trim(),
            directory: {
                ...sourceDirectory,
                rule: isFutureSchema && hasDirectoryRule
                    ? sourceDirectory.rule
                    : !hasDirectoryRule || sourceDirectory.rule === 'webdav'
                        ? 'webdav'
                        : directoryRule.normalizeDirectoryRule(sourceDirectory.rule)
            },
            filename: {
                ...sourceFilename,
                rule: isFutureSchema && hasFilenameRule
                    ? sourceFilename.rule
                    : !hasFilenameRule || sourceFilename.rule === 'webdav'
                        ? 'webdav'
                        : filenameRule.normalizeFilenameRule(sourceFilename.rule),
                customTemplate: isFutureSchema && Object.prototype.hasOwnProperty.call(sourceFilename, 'customTemplate')
                    ? sourceFilename.customTemplate
                    : filenameRule.validateTemplate(customTemplate).valid
                        ? customTemplate
                        : DEFAULT_CUSTOM_TEMPLATE
            }
        };
    }

    function toRelativeFolder(folder) {
        const normalized = directoryRule.normalizeFolder(folder);
        return normalized === '/' ? '' : normalized.replace(/^\//, '');
    }

    function resolveLocalSave({
        localCopy,
        directoryRule: legacyWebdavDirectoryRule,
        webdavDirectoryRule = legacyWebdavDirectoryRule,
        webdavFilename,
        webdavFilenameRule,
        imageUrl,
        pageUrl,
        pageTitle,
        width,
        height,
        extension,
        now = new Date()
    } = {}) {
        const settings = normalizeLocalCopy(localCopy);
        if (!settings.enabled) return { skip: true, reason: 'disabled' };
        if (!settings.folderName) return { skip: true, reason: 'folder-not-selected' };

        const effectiveDirectoryRule = settings.directory.rule === 'webdav'
            ? webdavDirectoryRule
            : settings.directory.rule;
        const directory = directoryRule.resolveDirectory({
            rule: effectiveDirectoryRule,
            rootFolder: '/',
            pageUrl,
            now
        });
        const inheritedFilenameRule = isPlainObject(webdavFilenameRule) ? webdavFilenameRule : {};
        const filename = settings.filename.rule === 'webdav' && webdavFilename
            ? String(webdavFilename)
            : filenameRule.generateFilename({
                rule: settings.filename.rule === 'webdav'
                    ? inheritedFilenameRule.rule
                    : settings.filename.rule,
                template: settings.filename.rule === 'webdav'
                    ? inheritedFilenameRule.customTemplate
                    : settings.filename.customTemplate,
                imageUrl,
                pageUrl,
                pageTitle,
                width,
                height,
                extension,
                now
            });
        const relativeFolder = toRelativeFolder(directory.folder);

        return {
            skip: false,
            folderName: settings.folderName,
            relativeFolder,
            filename,
            relativePath: relativeFolder ? `${relativeFolder}/${filename}` : filename
        };
    }

    return {
        createDefaultLocalCopy,
        normalizeLocalCopy,
        resolveLocalSave,
        toRelativeFolder
    };
}));
