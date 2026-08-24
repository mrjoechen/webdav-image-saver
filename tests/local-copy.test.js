const assert = require('node:assert/strict');
const test = require('node:test');

const DirectoryRule = require('../directory-rule.js');
const FilenameRule = require('../filename-rule.js');
const LocalCopy = require('../local-copy.js');

const now = new Date(2026, 7, 20, 14, 35, 9);
const pageUrl = 'https://www.example.com/article';
const imageUrl = 'https://cdn.example.net/photos/sunset.png';

function localCopy(overrides = {}) {
  return LocalCopy.normalizeLocalCopy({
    enabled: true,
    folderName: 'Pictures',
    directory: { rule: 'webdav' },
    filename: { rule: 'webdav', customTemplate: FilenameRule.DEFAULT_CUSTOM_TEMPLATE },
    ...overrides,
    directory: {
      rule: 'webdav',
      ...(overrides.directory || {})
    },
    filename: {
      rule: 'webdav',
      customTemplate: FilenameRule.DEFAULT_CUSTOM_TEMPLATE,
      ...(overrides.filename || {})
    }
  });
}

test('defaults are disabled and inherit WebDAV naming and directory rules', () => {
  assert.deepEqual(LocalCopy.createDefaultLocalCopy(), {
    enabled: false,
    folderName: '',
    directory: { rule: 'webdav' },
    filename: { rule: 'webdav', customTemplate: '{originalName}_{date}_{domain}.{ext}' }
  });
});

test('normalizes invalid local naming and trims the folder name', () => {
  const settings = LocalCopy.normalizeLocalCopy({
    enabled: 'yes',
    folderName: '  Photos  ',
    directory: { rule: 'bad' },
    filename: { rule: 'bad', customTemplate: ' {unknown} ' }
  });
  assert.equal(settings.enabled, true);
  assert.equal(settings.folderName, 'Photos');
  assert.equal(settings.directory.rule, 'fixed');
  assert.equal(settings.filename.rule, 'automatic');
  assert.equal(settings.filename.customTemplate, '{originalName}_{date}_{domain}.{ext}');
});

test('skips when local copy is disabled or no folder is selected', () => {
  assert.deepEqual(LocalCopy.resolveLocalSave({ localCopy: { enabled: false, folderName: 'Pictures' } }), {
    skip: true,
    reason: 'disabled'
  });
  assert.deepEqual(LocalCopy.resolveLocalSave({ localCopy: { enabled: true, folderName: '   ' } }), {
    skip: true,
    reason: 'folder-not-selected'
  });
  assert.deepEqual(LocalCopy.resolveLocalSave({}), { skip: true, reason: 'disabled' });
});

test('uses the local naming rule independently of the WebDAV filename', () => {
  const plan = LocalCopy.resolveLocalSave({
    localCopy: localCopy({
      directory: { rule: 'fixed' },
      filename: { rule: 'custom', customTemplate: '{originalName}-{date}.{ext}' }
    }),
    webdavDirectoryRule: 'domain-date',
    webdavFilename: 'webdav-generated-name.jpg',
    imageUrl,
    pageUrl,
    pageTitle: 'Summer trip',
    width: 1920,
    height: 1080,
    extension: 'jpg',
    now
  });

  assert.equal(plan.skip, false);
  assert.equal(plan.folderName, 'Pictures');
  assert.equal(plan.relativeFolder, '');
  assert.equal(plan.filename, 'sunset-20260820.jpg');
  assert.equal(plan.relativePath, 'sunset-20260820.jpg');
  assert.notEqual(
    plan.filename,
    FilenameRule.generateFilename({
      rule: 'automatic',
      imageUrl,
      pageUrl,
      extension: 'jpg',
      now
    })
  );
});

test('inherits WebDAV filename and directory when both rules are set to webdav', () => {
  const plan = LocalCopy.resolveLocalSave({
    localCopy: localCopy(),
    webdavDirectoryRule: 'domain-date',
    webdavFilename: 'webdav-generated-name.jpg',
    imageUrl,
    pageUrl,
    extension: 'jpg',
    now
  });

  assert.equal(plan.relativeFolder, 'example.com/2026/08');
  assert.equal(plan.filename, 'webdav-generated-name.jpg');
  assert.equal(plan.relativePath, 'example.com/2026/08/webdav-generated-name.jpg');
});

test('uses the local directory rule independently of WebDAV', () => {
  for (const rule of DirectoryRule.DIRECTORY_RULES) {
    const webdav = DirectoryRule.resolveDirectory({ rule, rootFolder: '/Images', pageUrl, now });
    const localRoot = DirectoryRule.resolveDirectory({ rule, rootFolder: '/', pageUrl, now });
    const plan = LocalCopy.resolveLocalSave({
      localCopy: localCopy({ directory: { rule } }),
      webdavDirectoryRule: 'fixed',
      imageUrl,
      pageUrl,
      extension: 'jpg',
      now
    });

    const expectedRelative = localRoot.folder === '/' ? '' : localRoot.folder.replace(/^\//, '');
    assert.equal(plan.relativeFolder, expectedRelative, rule);
    assert.equal(
      webdav.folder,
      expectedRelative ? `/Images/${expectedRelative}` : '/Images',
      rule
    );
    assert.equal(
      plan.relativePath,
      expectedRelative ? `${expectedRelative}/${plan.filename}` : plan.filename,
      rule
    );
  }
});

test('preserves unknown local-copy fields under future schema', () => {
  const source = {
    enabled: 'maybe',
    folderName: 'USB',
    destination: 'external',
    directory: { rule: 'future-directory-rule', extra: 'directory' },
    filename: { rule: 'content-hash', customTemplate: '{future}', extra: true }
  };
  assert.deepEqual(LocalCopy.normalizeLocalCopy(source, true), source);
});
