const assert = require('node:assert/strict');
const test = require('node:test');

const LocalCopyFs = require('../local-copy-fs.js');

function createMemoryDirectory(name = 'root') {
  const files = new Map();
  const directories = new Map();
  return {
    name,
    files,
    directories,
    async getDirectoryHandle(segment, { create } = {}) {
      if (directories.has(segment)) return directories.get(segment);
      if (!create) throw LocalCopyFs.notFoundError(segment);
      const child = createMemoryDirectory(segment);
      directories.set(segment, child);
      return child;
    },
    async getFileHandle(segment, { create } = {}) {
      if (!files.has(segment)) {
        if (!create) throw LocalCopyFs.notFoundError(segment);
        files.set(segment, new Blob([]));
      }
      return {
        name: segment,
        async createWritable() {
          const chunks = [];
          return {
            async write(data) { chunks.push(data); },
            async close() {
              files.set(segment, chunks.length === 1 ? chunks[0] : new Blob(chunks));
            }
          };
        }
      };
    }
  };
}

test('writes nested directories and the file relative to the selected folder', async () => {
  const root = createMemoryDirectory('Pictures');
  const blob = new Blob(['image-bytes'], { type: 'image/jpeg' });
  const result = await LocalCopyFs.writeBlobToDirectory(root, 'example.com/2026/08/sunset.jpg', blob);

  assert.equal(result.filename, 'sunset.jpg');
  assert.equal(result.relativePath, 'example.com/2026/08/sunset.jpg');
  assert.equal(root.directories.has('example.com'), true);
  const month = root.directories.get('example.com').directories.get('2026').directories.get('08');
  assert.equal(month.files.get('sunset.jpg'), blob);
});

test('uniquifies colliding filenames without changing the directory', async () => {
  const root = createMemoryDirectory('Pictures');
  const first = new Blob(['one']);
  const second = new Blob(['two']);
  await LocalCopyFs.writeBlobToDirectory(root, 'photo.jpg', first);
  const result = await LocalCopyFs.writeBlobToDirectory(root, 'photo.jpg', second);

  assert.equal(result.filename, 'photo_1.jpg');
  assert.equal(result.relativePath, 'photo_1.jpg');
  assert.equal(root.files.get('photo.jpg'), first);
  assert.equal(root.files.get('photo_1.jpg'), second);
});

test('rejects a missing folder handle or empty path', async () => {
  await assert.rejects(LocalCopyFs.writeBlobToDirectory(null, 'photo.jpg', new Blob(['x'])), /No local folder selected/);
  await assert.rejects(
    LocalCopyFs.writeBlobToDirectory(createMemoryDirectory(), '', new Blob(['x'])),
    /A local file path is required/
  );
});

test('writeLocalCopy requires existing permission without prompting from the worker', async () => {
  const root = createMemoryDirectory('Pictures');
  let permissionRequests = 0;
  root.queryPermission = async () => 'prompt';
  root.requestPermission = async () => {
    permissionRequests += 1;
    throw new DOMException('Worker cannot prompt for permission.', 'SecurityError');
  };

  await assert.rejects(
    LocalCopyFs.writeLocalCopy({
      blob: new Blob(['x']),
      relativePath: 'photo.jpg',
      directoryHandle: root
    }),
    /permission was revoked/i
  );
  assert.equal(permissionRequests, 0);
});
