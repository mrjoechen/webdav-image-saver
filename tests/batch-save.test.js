const assert = require('node:assert/strict');
const test = require('node:test');

const BatchSave = require('../batch-save.js');

function batchInput(overrides = {}) {
  return {
    batchId: 'batch-1',
    tabId: 7,
    pageUrl: 'https://page.test/post',
    pageTitle: 'Post',
    serverId: 'server-1',
    serverName: 'NAS',
    targetFormat: 'original',
    settings: {
      image: { saveFormat: 'original' },
      filename: { rule: 'automatic', customTemplate: '{originalName}.{ext}' },
      directory: { rule: 'fixed' },
      localCopy: { enabled: false }
    },
    images: [
      { id: 'image-1', url: 'https://img.test/1.jpg', name: '1.jpg', width: 1200, height: 800 },
      { id: 'image-2', url: 'https://img.test/2.jpg', name: '2.jpg', width: 900, height: 600 }
    ],
    now: 1000,
    ...overrides
  };
}

test('creates ordered queued items and summarizes progress', () => {
  const batch = BatchSave.createBatch(batchInput());
  const updated = BatchSave.transitionItem(batch, 'image-1', {
    state: 'success',
    filename: 'one.jpg',
    message: 'Saved'
  }, 2000);

  assert.notEqual(updated, batch);
  assert.equal(batch.items[0].state, 'queued');
  assert.deepEqual(updated.items.map(item => [item.id, item.state]), [
    ['image-1', 'success'],
    ['image-2', 'queued']
  ]);
  assert.deepEqual(BatchSave.summarize(updated), {
    total: 2,
    completed: 1,
    queued: 1,
    preparing: 0,
    uploading: 0,
    success: 1,
    warning: 0,
    failed: 0,
    cancelled: 0
  });
});

test('rejects invalid batches, duplicate image ids, and unknown item transitions', () => {
  assert.throws(() => BatchSave.createBatch(batchInput({ images: [] })), /at least one image/i);
  assert.throws(() => BatchSave.createBatch(batchInput({
    images: [
      { id: 'same', url: 'https://img.test/1.jpg' },
      { id: 'same', url: 'https://img.test/2.jpg' }
    ]
  })), /duplicate image id/i);

  const batch = BatchSave.createBatch(batchInput());
  assert.throws(() => BatchSave.transitionItem(batch, 'image-1', { state: 'mystery' }), /unknown item state/i);
  assert.throws(() => BatchSave.transitionItem(batch, 'missing', { state: 'failed' }), /unknown batch item/i);
});

test('public batch state contains progress but no settings snapshot', () => {
  const batch = BatchSave.createBatch(batchInput());
  const publicState = BatchSave.toPublicBatch(batch);

  assert.equal(Object.hasOwn(publicState, 'settings'), false);
  assert.deepEqual(publicState.summary, BatchSave.summarize(batch));
  assert.equal(publicState.items[0].url, 'https://img.test/1.jpg');
});

test('adds suffixes before the extension and restores existing reservations', () => {
  const allocator = BatchSave.createFilenameAllocator({
    items: [{ allocatedFolder: '/Images', filename: 'photo.jpg' }]
  });

  assert.equal(allocator.reserve('/Images', 'photo.jpg'), 'photo_2.jpg');
  assert.equal(allocator.reserve('/Images', 'photo.jpg'), 'photo_3.jpg');
  assert.equal(allocator.reserve('/Other', 'photo.jpg'), 'photo.jpg');
  assert.equal(allocator.reserve('/Images', 'README'), 'README');
  assert.equal(allocator.reserve('/Images', 'README'), 'README_2');
});

test('keeps suffixed filenames within the 255-byte WebDAV limit', () => {
  const allocator = BatchSave.createFilenameAllocator({ items: [] });
  const original = `${'a'.repeat(251)}.jpg`;

  assert.equal(allocator.reserve('/Images', original), original);
  const suffixed = allocator.reserve('/Images', original);
  assert.equal(new TextEncoder().encode(suffixed).length <= 255, true);
  assert.equal(suffixed.endsWith('_2.jpg'), true);
});

test('requeues interrupted items but preserves terminal results and allocated names', () => {
  const batch = BatchSave.createBatch(batchInput());
  const interrupted = {
    ...batch,
    state: 'running',
    items: [
      { ...batch.items[0], state: 'uploading', filename: 'photo_2.jpg', allocatedFolder: '/Images' },
      { ...batch.items[1], state: 'success', filename: 'other.jpg', allocatedFolder: '/Images' }
    ]
  };

  const normalized = BatchSave.normalizeInterruptedBatch(interrupted, 3000);

  assert.equal(normalized.state, 'queued');
  assert.deepEqual(normalized.items.map(item => [item.state, item.filename]), [
    ['queued', 'photo_2.jpg'],
    ['success', 'other.jpg']
  ]);
});

test('task pool never exceeds the configured concurrency', async () => {
  const pool = BatchSave.createTaskPool(3);
  let active = 0;
  let maximum = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });

  const jobs = Array.from({ length: 7 }, (_, index) => pool.run(async () => {
    active += 1;
    maximum = Math.max(maximum, active);
    await gate;
    active -= 1;
    return index;
  }));

  for (let attempt = 0; attempt < 20 && maximum < 3; attempt += 1) {
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.equal(maximum, 3);
  assert.equal(pool.activeCount, 3);
  release();
  assert.deepEqual(await Promise.all(jobs), [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(pool.activeCount, 0);
});

test('task pool continues scheduling after a rejected task', async () => {
  const pool = BatchSave.createTaskPool(1);
  const first = pool.run(async () => { throw new Error('failed'); });
  const second = pool.run(async () => 'continued');

  await assert.rejects(first, /failed/);
  assert.equal(await second, 'continued');
});
