const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const ImageFormat = require('../image-format.js');
const FilenameRule = require('../filename-rule.js');
const DirectoryRule = require('../directory-rule.js');
const LocalCopy = require('../local-copy.js');
const LocalCopyFs = require('../local-copy-fs.js');
const BatchSave = require('../batch-save.js');

const backgroundSource = readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
const testExport = ';globalThis.__backgroundWebdavTest = { ensureWebdavDirectories, resetWebdavDirectoryCache, uploadImage, configReady, setPersistLocalCopy, saveLocalCopyOfUpload, saveImageCore, getBatchPanelContext, scanBatchTab, startBatch, getBatch, runBatch, cancelBatch, retryFailedBatch, resumePersistedBatches, setSaveImageCore };';

function response(status, statusText = '', body = '') {
  return {
    status,
    statusText,
    ok: status >= 200 && status < 300,
    text: async () => body
  };
}

const davCollectionXml = '<?xml version="1.0"?><D:multistatus xmlns:D="DAV:"><D:response><D:propstat><D:prop><D:resourcetype><D:collection/></D:resourcetype></D:prop></D:propstat></D:response></D:multistatus>';
const defaultNamespaceCollectionXml = '<?xml version="1.0"?><multistatus xmlns="DAV:"><response><propstat><prop><resourcetype><collection></collection></resourcetype></prop></propstat></response></multistatus>';

async function waitFor(check, message = 'condition was not met') {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  assert.fail(message);
}

function createMemoryStorage(initial = {}) {
  const values = { ...initial };
  return {
    async get(key) {
      if (key == null) return { ...values };
      if (typeof key === 'string') return Object.hasOwn(values, key) ? { [key]: values[key] } : {};
      if (Array.isArray(key)) {
        return Object.fromEntries(key.filter(name => Object.hasOwn(values, name)).map(name => [name, values[name]]));
      }
      return { ...key, ...Object.fromEntries(Object.keys(key).filter(name => Object.hasOwn(values, name)).map(name => [name, values[name]])) };
    },
    async set(update) { Object.assign(values, update); },
    async remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key];
    }
  };
}

async function createWorker(fetchImpl, options = {}) {
  const noopEvent = { addListener() {} };
  let runtimeMessageListener;
  const sentMessages = options.sentMessages || [];
  const localStorage = options.localStorage || createMemoryStorage(
    options.servers ? { webdavServers: options.servers } : {}
  );
  const syncStorage = options.syncStorage || createMemoryStorage();
  const sessionStorage = options.session || createMemoryStorage();
  const scriptExecutions = options.scriptExecutions || [];
  const insertedCss = options.insertedCss || [];
  const context = {
    importScripts() {},
    fetch: fetchImpl,
    Headers,
    TextEncoder,
    URL,
    AbortController,
    DOMException,
    crypto: options.crypto || webcrypto,
    btoa(value) { return Buffer.from(value, 'binary').toString('base64'); },
    console: { log() {}, warn() {}, error() {} },
    AppSettings: {
      createDefaultSettings: () => options.settings || { image: { saveFormat: 'original' } },
      loadSettings: async () => options.settings || { image: { saveFormat: 'original' } }
    },
    ImageFormat: options.ImageFormat || {},
    FilenameRule: options.FilenameRule || {},
    DirectoryRule: options.DirectoryRule || {},
    LocalCopy: options.LocalCopy || { resolveLocalSave: () => ({ skip: true, reason: 'disabled' }) },
    LocalCopyFs: options.LocalCopyFs || LocalCopyFs,
    BatchSave,
    chrome: {
      runtime: {
        onInstalled: noopEvent,
        onMessage: { addListener(listener) { runtimeMessageListener = listener; } },
        openOptionsPage() {},
        getURL: path => `chrome-extension://test/${path}`,
        getContexts: async () => [],
        sendMessage: options.sendMessage || (async () => undefined)
      },
      offscreen: {
        createDocument: options.createOffscreenDocument || (async () => {
          throw new Error('offscreen should not be used in this test');
        })
      },
      contextMenus: { onClicked: noopEvent, removeAll(callback) { callback(); }, create(_item, callback) { callback?.(); } },
      action: { onClicked: noopEvent },
      sidePanel: {
        setPanelBehavior: options.setPanelBehavior || (async () => undefined)
      },
      tabs: {
        onRemoved: noopEvent,
        query: options.tabsQuery || (async () => [{ id: 7, url: 'https://page.example/article', title: 'Article' }]),
        sendMessage: async (tabId, message) => {
          sentMessages.push({ tabId, message });
          if (typeof options.tabMessageHandler === 'function') {
            return options.tabMessageHandler(tabId, message);
          }
        }
      },
      scripting: {
        insertCSS: async details => { insertedCss.push(details); },
        executeScript: async details => { scriptExecutions.push(details); }
      },
      storage: { local: localStorage, sync: syncStorage, session: sessionStorage }
    }
  };
  context.globalThis = context;
  vm.runInNewContext(`${backgroundSource}${testExport}`, context, { filename: 'background.js' });
  await context.__backgroundWebdavTest.configReady;
  if (typeof options.persistLocalCopy === 'function') {
    context.__backgroundWebdavTest.setPersistLocalCopy(options.persistLocalCopy);
  }
  const api = context.__backgroundWebdavTest;
  api.dispatchRuntimeMessage = (message, sender = {
    url: 'chrome-extension://test/sidepanel/sidepanel.html'
  }) => new Promise(resolve => {
    const handled = runtimeMessageListener(message, sender, resolve);
    if (handled !== true) resolve({ success: false, error: 'Message was not handled.' });
  });
  return api;
}

const server = { url: 'https://dav.example/webdav', username: 'alice', password: 'secret' };

test('batch panel context omits WebDAV credentials and returns save preferences', async () => {
  const settings = {
    image: { saveFormat: 'ask' },
    filename: { rule: 'original', customTemplate: '{originalName}.{ext}' },
    directory: { rule: 'fixed' },
    localCopy: { enabled: false }
  };
  const worker = await createWorker(async () => response(200, 'OK'), {
    servers: [{
      id: 'server-1',
      name: 'My NAS',
      folder: '/Images',
      url: 'https://dav.example/webdav',
      username: 'alice',
      password: 'secret'
    }],
    settings
  });

  const context = await worker.getBatchPanelContext({
    id: 7,
    url: 'https://page.example/article',
    title: 'Article'
  });

  assert.equal(context.tab.id, 7);
  assert.equal(context.servers.length, 1);
  assert.equal(context.servers[0].id, 'server-1');
  assert.equal(context.servers[0].name, 'My NAS');
  assert.equal(context.servers[0].folder, '/Images');
  assert.equal(Object.hasOwn(context.servers[0], 'username'), false);
  assert.equal(Object.hasOwn(context.servers[0], 'password'), false);
  assert.equal(JSON.stringify(context).includes('secret'), false);
  assert.equal(context.settings.image.saveFormat, 'ask');
  assert.equal(context.activeBatch, null);
});

test('batch scan injects discovery before the content script and persists its result', async () => {
  const session = createMemoryStorage();
  const scriptExecutions = [];
  const insertedCss = [];
  const worker = await createWorker(async () => response(200, 'OK'), {
    session,
    scriptExecutions,
    insertedCss,
    tabMessageHandler: async (_tabId, message) => {
      if (message.action === 'ping') throw new Error('no receiver');
      if (message.action === 'batchPage:collectImages') {
        return {
          success: true,
          pageUrl: 'https://page.example/article',
          pageTitle: 'Article',
          images: [{ id: 'image-0', url: 'https://cdn.example/photo.jpg', name: 'photo.jpg', width: 1600, height: 900 }]
        };
      }
      throw new Error(`Unexpected message: ${message.action}`);
    }
  });

  const result = await worker.scanBatchTab({
    id: 7,
    url: 'https://page.example/article',
    title: 'Article'
  });

  assert.match(result.scanId, /^scan_/);
  assert.equal(result.tabId, 7);
  assert.equal(result.images.length, 1);
  assert.deepEqual(Array.from(scriptExecutions[0].files), ['image-discovery.js', 'content_script.js']);
  assert.deepEqual(Array.from(insertedCss[0].files), ['assets/bubble.css']);
  const stored = await session.get('batchScan_7');
  assert.equal(stored.batchScan_7.scanId, result.scanId);
  assert.equal(stored.batchScan_7.images[0].url, 'https://cdn.example/photo.jpg');
});

test('batch scan rejects restricted pages before attempting injection', async () => {
  const scriptExecutions = [];
  const worker = await createWorker(async () => response(200, 'OK'), { scriptExecutions });

  await assert.rejects(
    worker.scanBatchTab({ id: 9, url: 'chrome://settings', title: 'Settings' }),
    /does not allow image scanning/i
  );
  assert.equal(scriptExecutions.length, 0);
});

function batchScan(images = [
  { id: 'image-1', url: 'https://cdn.example/one.jpg', name: 'one.jpg', width: 1200, height: 800 },
  { id: 'image-2', url: 'https://cdn.example/two.jpg', name: 'two.jpg', width: 1600, height: 900 }
]) {
  return {
    scanId: 'scan-1',
    tabId: 7,
    pageUrl: 'https://page.example/article',
    pageTitle: 'Article',
    createdAt: 1000,
    images
  };
}

const batchServer = {
  id: 'server-1',
  name: 'My NAS',
  folder: '/Images',
  url: 'https://dav.example/webdav',
  username: 'alice',
  password: 'secret'
};

const batchSettings = {
  image: { saveFormat: 'original' },
  filename: { rule: 'original', customTemplate: '{originalName}.{ext}' },
  directory: { rule: 'fixed' },
  localCopy: { enabled: false }
};

test('batch start validates the latest scan and persists only selected images in scan order', async () => {
  const session = createMemoryStorage({ batchScan_7: batchScan() });
  const worker = await createWorker(async () => response(200, 'OK'), {
    session,
    servers: [batchServer],
    settings: batchSettings
  });
  worker.setSaveImageCore(async ({ allocateFilename, onTargetResolved }) => {
    const filename = allocateFilename('/Images', 'saved.jpg');
    await onTargetResolved({ folder: '/Images', filename });
    return { status: 'success', message: 'Saved', filename, folder: '/Images', warningCodes: [] };
  });

  await assert.rejects(worker.startBatch({
    scanId: 'stale-scan', tabId: 7, imageIds: ['image-1'], serverId: 'server-1', targetFormat: 'original'
  }), /scan.*no longer current/i);
  await assert.rejects(worker.startBatch({
    scanId: 'scan-1', tabId: 7, imageIds: ['missing'], serverId: 'server-1', targetFormat: 'original'
  }), /selected image.*no longer available/i);

  const started = await worker.startBatch({
    scanId: 'scan-1',
    tabId: 7,
    imageIds: ['image-2'],
    serverId: 'server-1',
    targetFormat: 'original'
  });
  await worker.runBatch(started.batchId);
  const stored = await worker.getBatch(started.batchId);

  assert.deepEqual(stored.items.map(item => item.id), ['image-2']);
  assert.equal(stored.serverName, 'My NAS');
  assert.equal(stored.settings.filename.rule, 'original');
  assert.equal(stored.state, 'completed');
});

test('batch scheduler continues after failures and reserves duplicate filenames', async () => {
  const session = createMemoryStorage({ batchScan_7: batchScan() });
  const sentMessages = [];
  const worker = await createWorker(async () => response(200, 'OK'), {
    session,
    servers: [batchServer],
    settings: batchSettings,
    sentMessages
  });
  worker.setSaveImageCore(async ({ imageUrl, allocateFilename, onTargetResolved }) => {
    const filename = allocateFilename('/Images', 'photo.jpg');
    await onTargetResolved({ folder: '/Images', filename });
    if (imageUrl.endsWith('/two.jpg')) throw new Error('WebDAV unavailable');
    return { status: 'success', message: 'Saved', filename, folder: '/Images', warningCodes: [] };
  });

  const started = await worker.startBatch({
    scanId: 'scan-1',
    tabId: 7,
    imageIds: ['image-1', 'image-2'],
    serverId: 'server-1',
    targetFormat: 'original'
  });
  const finished = await worker.runBatch(started.batchId);

  assert.equal(finished.state, 'completed');
  assert.deepEqual(finished.items.map(item => item.state), ['success', 'failed']);
  assert.deepEqual(finished.items.map(item => item.filename), ['photo.jpg', 'photo_2.jpg']);
  assert.equal(finished.summary.completed, 2);
  assert.ok(sentMessages.some(entry => entry.message.action === 'batchPage:showProgress'));
  assert.ok(sentMessages.some(entry => entry.message.action === 'batchPage:showSummary'));
});

test('batch cancellation aborts active work and cancels queued items', async () => {
  const session = createMemoryStorage({
    batchScan_7: batchScan(Array.from({ length: 5 }, (_, index) => ({
      id: `image-${index}`,
      url: `https://cdn.example/${index}.jpg`,
      name: `${index}.jpg`
    })))
  });
  const worker = await createWorker(async () => response(200, 'OK'), {
    session,
    servers: [batchServer],
    settings: batchSettings
  });
  let active = 0;
  let maximum = 0;
  worker.setSaveImageCore(async ({ signal }) => {
    active += 1;
    maximum = Math.max(maximum, active);
    try {
      await new Promise((resolve, reject) => {
        if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      });
    } finally {
      active -= 1;
    }
  });

  const started = await worker.startBatch({
    scanId: 'scan-1',
    tabId: 7,
    imageIds: ['image-0', 'image-1', 'image-2', 'image-3', 'image-4'],
    serverId: 'server-1',
    targetFormat: 'original'
  });
  const completion = worker.runBatch(started.batchId);
  await waitFor(() => active === 3, 'three batch items did not start');
  await worker.cancelBatch(started.batchId);
  const finished = await completion;

  assert.equal(maximum, 3);
  assert.equal(finished.state, 'cancelled');
  assert.equal(finished.summary.cancelled, 5);
});

test('retry reuses allocated filenames and only runs failed items', async () => {
  const session = createMemoryStorage({ batchScan_7: batchScan() });
  const worker = await createWorker(async () => response(200, 'OK'), {
    session,
    servers: [batchServer],
    settings: batchSettings
  });
  const attempts = new Map();
  worker.setSaveImageCore(async ({ imageUrl, allocateFilename, onTargetResolved }) => {
    const filename = allocateFilename('/Images', 'photo.jpg');
    await onTargetResolved({ folder: '/Images', filename });
    const count = (attempts.get(imageUrl) || 0) + 1;
    attempts.set(imageUrl, count);
    if (imageUrl.endsWith('/two.jpg') && count === 1) throw new Error('Temporary failure');
    return { status: 'success', message: 'Saved', filename, folder: '/Images', warningCodes: [] };
  });

  const started = await worker.startBatch({
    scanId: 'scan-1', tabId: 7, imageIds: ['image-1', 'image-2'], serverId: 'server-1', targetFormat: 'original'
  });
  const first = await worker.runBatch(started.batchId);
  assert.deepEqual(first.items.map(item => item.state), ['success', 'failed']);
  assert.deepEqual(first.items.map(item => item.filename), ['photo.jpg', 'photo_2.jpg']);

  await worker.retryFailedBatch(started.batchId);
  const retried = await worker.runBatch(started.batchId);
  assert.deepEqual(retried.items.map(item => item.state), ['success', 'success']);
  assert.deepEqual(retried.items.map(item => item.filename), ['photo.jpg', 'photo_2.jpg']);
  assert.equal(attempts.get('https://cdn.example/one.jpg'), 1);
  assert.equal(attempts.get('https://cdn.example/two.jpg'), 2);
});

test('retry can target one failed item without rerunning sibling failures', async () => {
  const scan = batchScan([
    { id: 'image-1', url: 'https://cdn.example/one.jpg', name: 'one.jpg' },
    { id: 'image-2', url: 'https://cdn.example/two.jpg', name: 'two.jpg' },
    { id: 'image-3', url: 'https://cdn.example/three.jpg', name: 'three.jpg' }
  ]);
  const worker = await createWorker(async () => response(200, 'OK'), {
    session: createMemoryStorage({ batchScan_7: scan }),
    servers: [batchServer],
    settings: batchSettings
  });
  const attempts = new Map();
  worker.setSaveImageCore(async ({ imageUrl, allocateFilename, onTargetResolved }) => {
    const filename = allocateFilename('/Images', 'photo.jpg');
    await onTargetResolved({ folder: '/Images', filename });
    const attempt = (attempts.get(imageUrl) || 0) + 1;
    attempts.set(imageUrl, attempt);
    if (imageUrl.endsWith('/three.jpg') || (imageUrl.endsWith('/two.jpg') && attempt === 1)) {
      throw new Error('Temporary failure');
    }
    return { status: 'success', message: 'Saved', filename, folder: '/Images', warningCodes: [] };
  });

  const started = await worker.startBatch({
    scanId: 'scan-1',
    tabId: 7,
    imageIds: ['image-1', 'image-2', 'image-3'],
    serverId: 'server-1',
    targetFormat: 'original'
  });
  const first = await worker.runBatch(started.batchId);
  assert.deepEqual(first.items.map(item => item.state), ['success', 'failed', 'failed']);

  await worker.retryFailedBatch(started.batchId, ['image-2']);
  const retried = await worker.runBatch(started.batchId);
  assert.deepEqual(retried.items.map(item => item.state), ['success', 'success', 'failed']);
  assert.deepEqual(retried.items.map(item => item.filename), ['photo.jpg', 'photo_2.jpg', 'photo_3.jpg']);
  assert.deepEqual(retried.items.map(item => item.attempts), [1, 2, 1]);
});

test('targeted retry validates requested failed item ids', async () => {
  const worker = await createWorker(async () => response(200, 'OK'), {
    session: createMemoryStorage({ batchScan_7: batchScan() }),
    servers: [batchServer],
    settings: batchSettings
  });
  worker.setSaveImageCore(async ({ imageUrl, allocateFilename, onTargetResolved }) => {
    const filename = allocateFilename('/Images', 'photo.jpg');
    await onTargetResolved({ folder: '/Images', filename });
    if (imageUrl.endsWith('/two.jpg')) throw new Error('Temporary failure');
    return { status: 'success', message: 'Saved', filename, folder: '/Images', warningCodes: [] };
  });
  const started = await worker.startBatch({
    scanId: 'scan-1',
    tabId: 7,
    imageIds: ['image-1', 'image-2'],
    serverId: 'server-1',
    targetFormat: 'original'
  });
  await worker.runBatch(started.batchId);

  await assert.rejects(
    worker.retryFailedBatch(started.batchId, []),
    /choose at least one failed image/i
  );
  await assert.rejects(
    worker.retryFailedBatch(started.batchId, ['missing']),
    /unknown batch item/i
  );
  await assert.rejects(
    worker.retryFailedBatch(started.batchId, ['image-1']),
    /is not failed/i
  );
  await assert.rejects(
    worker.retryFailedBatch(started.batchId, ['image-2', 'image-2']),
    /must be unique/i
  );
});

test('runtime retry forwards selected failed item ids', async () => {
  const scan = batchScan([
    { id: 'image-1', url: 'https://cdn.example/one.jpg', name: 'one.jpg' },
    { id: 'image-2', url: 'https://cdn.example/two.jpg', name: 'two.jpg' },
    { id: 'image-3', url: 'https://cdn.example/three.jpg', name: 'three.jpg' }
  ]);
  const worker = await createWorker(async () => response(200, 'OK'), {
    session: createMemoryStorage({ batchScan_7: scan }),
    servers: [batchServer],
    settings: batchSettings
  });
  const attempts = new Map();
  worker.setSaveImageCore(async ({ imageUrl, allocateFilename, onTargetResolved }) => {
    const filename = allocateFilename('/Images', 'photo.jpg');
    await onTargetResolved({ folder: '/Images', filename });
    const attempt = (attempts.get(imageUrl) || 0) + 1;
    attempts.set(imageUrl, attempt);
    if ((imageUrl.endsWith('/two.jpg') && attempt === 1) || imageUrl.endsWith('/three.jpg')) {
      throw new Error('Temporary failure');
    }
    return { status: 'success', message: 'Saved', filename, folder: '/Images', warningCodes: [] };
  });
  const started = await worker.startBatch({
    scanId: 'scan-1',
    tabId: 7,
    imageIds: ['image-1', 'image-2', 'image-3'],
    serverId: 'server-1',
    targetFormat: 'original'
  });
  await worker.runBatch(started.batchId);

  const result = await worker.dispatchRuntimeMessage({
    action: 'batchPanel:retryFailed',
    batchId: started.batchId,
    itemIds: ['image-2']
  });
  assert.equal(result.success, true);
  assert.deepEqual(result.batch.items.map(item => item.state), ['success', 'queued', 'failed']);
  await worker.runBatch(started.batchId);
});

test('runtime batch commands accept the Side Panel and reject page senders', async () => {
  const session = createMemoryStorage({ batchScan_7: batchScan() });
  const worker = await createWorker(async () => response(200, 'OK'), {
    session,
    servers: [batchServer],
    settings: batchSettings
  });
  worker.setSaveImageCore(async ({ allocateFilename, onTargetResolved }) => {
    const filename = allocateFilename('/Images', 'saved.jpg');
    await onTargetResolved({ folder: '/Images', filename });
    return { status: 'success', message: 'Saved', filename, folder: '/Images', warningCodes: [] };
  });
  const command = {
    action: 'batchPanel:start',
    scanId: 'scan-1',
    tabId: 7,
    imageIds: ['image-1'],
    serverId: 'server-1',
    targetFormat: 'original'
  };

  const rejected = await worker.dispatchRuntimeMessage(command, {
    url: 'https://page.example/article',
    tab: { id: 7 }
  });
  assert.equal(rejected.success, false);
  assert.match(rejected.error, /side panel/i);

  const accepted = await worker.dispatchRuntimeMessage(command);
  assert.equal(accepted.success, true);
  assert.equal(accepted.batch.items.length, 1);
  await worker.runBatch(accepted.batch.batchId);
});

test('worker recovery requeues interrupted uploads and preserves their allocated filename', async () => {
  const session = createMemoryStorage();
  const worker = await createWorker(async () => response(200, 'OK'), {
    session,
    servers: [batchServer],
    settings: batchSettings
  });
  worker.setSaveImageCore(async ({ allocateFilename, onTargetResolved }) => {
    const filename = allocateFilename('/Images', 'new-name.jpg');
    await onTargetResolved({ folder: '/Images', filename });
    return { status: 'success', message: 'Saved', filename, folder: '/Images', warningCodes: [] };
  });
  const created = BatchSave.createBatch({
    batchId: 'resume-1',
    tabId: 7,
    pageUrl: 'https://page.example/article',
    pageTitle: 'Article',
    serverId: 'server-1',
    serverName: 'My NAS',
    targetFormat: 'original',
    settings: batchSettings,
    images: [{ id: 'image-1', url: 'https://cdn.example/one.jpg', name: 'one.jpg' }]
  });
  const interrupted = {
    ...created,
    state: 'running',
    items: [{
      ...created.items[0],
      state: 'uploading',
      filename: 'reserved.jpg',
      allocatedFolder: '/Images'
    }]
  };
  await session.set({
    'batch_resume-1': interrupted,
    activeBatchForTab_7: interrupted.batchId
  });

  await worker.resumePersistedBatches();
  const finished = await worker.runBatch('resume-1');

  assert.equal(finished.state, 'completed');
  assert.equal(finished.items[0].state, 'success');
  assert.equal(finished.items[0].filename, 'reserved.jpg');
});

test('shared save core returns a result without sending a page status message', async () => {
  const sentMessages = [];
  const sourceBlob = new Blob(['image'], { type: 'image/jpeg' });
  const settings = {
    image: { saveFormat: 'original' },
    filename: { rule: 'original', customTemplate: '{originalName}.{ext}' },
    directory: { rule: 'fixed' },
    localCopy: { enabled: false }
  };
  const worker = await createWorker(async (_url, options) => {
    if (!options?.method) {
      return { ok: true, status: 200, statusText: 'OK', blob: async () => sourceBlob };
    }
    return response(201, 'Created');
  }, {
    settings,
    ImageFormat,
    FilenameRule,
    DirectoryRule,
    sentMessages
  });

  const result = await worker.saveImageCore({
    imageUrl: 'https://cdn.example/photo.png',
    pageUrl: 'https://page.example/post',
    pageTitle: 'Post',
    serverConfig: server,
    targetFormat: 'original',
    settings,
    now: new Date(2026, 7, 26, 12, 0, 0)
  });

  assert.equal(result.status, 'success');
  assert.equal(result.message, 'Saved as "photo.jpg"');
  assert.equal(result.filename, 'photo.jpg');
  assert.equal(result.folder, '/');
  assert.deepEqual(Array.from(result.warningCodes), []);
  assert.equal(sentMessages.length, 0);
});

test('shared save core uses frozen settings, allocated target, callbacks, and abort signal', async () => {
  const requests = [];
  const targets = [];
  const sourceBlob = new Blob(['image'], { type: 'image/jpeg' });
  const controller = new AbortController();
  const settings = {
    image: { saveFormat: 'original' },
    filename: { rule: 'original', customTemplate: '{originalName}.{ext}' },
    directory: { rule: 'fixed' },
    localCopy: { enabled: false }
  };
  const worker = await createWorker(async (url, options) => {
    requests.push({ url, options });
    if (!options?.method) {
      return { ok: true, status: 200, statusText: 'OK', blob: async () => sourceBlob };
    }
    return response(201, 'Created');
  }, { settings, ImageFormat, FilenameRule, DirectoryRule });

  const result = await worker.saveImageCore({
    imageUrl: 'https://cdn.example/photo.jpg',
    pageUrl: 'https://page.example/post',
    pageTitle: 'Post',
    serverConfig: server,
    targetFormat: 'original',
    settings,
    now: new Date(2026, 7, 26, 12, 0, 0),
    signal: controller.signal,
    allocateFilename(folder, filename) {
      assert.equal(folder, '/');
      assert.equal(filename, 'photo.jpg');
      return 'photo_2.jpg';
    },
    async onTargetResolved(target) {
      targets.push(target);
    }
  });

  const put = requests.find(request => request.options?.method === 'PUT');
  assert.equal(requests[0].options.signal, controller.signal);
  assert.equal(put.options.signal, controller.signal);
  assert.equal(put.url, 'https://dav.example/webdav/photo_2.jpg');
  assert.equal(targets.length, 1);
  assert.equal(targets[0].folder, '/');
  assert.equal(targets[0].filename, 'photo_2.jpg');
  assert.equal(result.filename, 'photo_2.jpg');
});

test('shared save core rejects WebDAV failures instead of converting them to page messages', async () => {
  const sentMessages = [];
  const settings = {
    image: { saveFormat: 'original' },
    filename: { rule: 'original', customTemplate: '{originalName}.{ext}' },
    directory: { rule: 'fixed' },
    localCopy: { enabled: false }
  };
  const worker = await createWorker(async (_url, options) => {
    if (!options?.method) {
      return { ok: true, status: 200, statusText: 'OK', blob: async () => new Blob(['image'], { type: 'image/jpeg' }) };
    }
    return response(403, 'Forbidden');
  }, { settings, ImageFormat, FilenameRule, DirectoryRule, sentMessages });

  await assert.rejects(worker.saveImageCore({
    imageUrl: 'https://cdn.example/photo.jpg',
    pageUrl: 'https://page.example/post',
    pageTitle: 'Post',
    serverConfig: server,
    targetFormat: 'original',
    settings
  }), /Upload failed: 403 Forbidden/);
  assert.equal(sentMessages.length, 0);
});

test('creates nested WebDAV collections parent first with credentials', async () => {
  const requests = [];
  const worker = await createWorker(async (url, options) => {
    requests.push({ url, options });
    return response(201);
  });

  await worker.ensureWebdavDirectories(server, ['/Images/2026', '/Images/2026/08']);

  assert.deepEqual(requests.map(request => [request.url, request.options.method]), [
    ['https://dav.example/webdav/Images/2026/', 'MKCOL'],
    ['https://dav.example/webdav/Images/2026/08/', 'MKCOL']
  ]);
  assert.equal(requests[0].options.headers.get('Authorization'), 'Basic YWxpY2U6c2VjcmV0');
});

test('encodes every WebDAV collection path segment', async () => {
  const requests = [];
  const worker = await createWorker(async (url, options) => {
    requests.push({ url, options });
    return response(201);
  });

  await worker.ensureWebdavDirectories(server, ['/Images & More/2026 08']);

  assert.equal(requests[0].url, 'https://dav.example/webdav/Images%20%26%20More/2026%2008/');
});

test('accepts an existing collection only after 405 is verified by depth-zero PROPFIND', async () => {
  const requests = [];
  const worker = await createWorker(async (url, options) => {
    requests.push({ url, options });
    return options.method === 'MKCOL'
      ? response(405)
      : response(207, '', davCollectionXml);
  });

  await worker.ensureWebdavDirectories(server, ['/Images']);

  assert.deepEqual(requests.map(request => request.options.method), ['MKCOL', 'PROPFIND']);
  assert.equal(requests[1].options.headers.get('Depth'), '0');
  assert.equal(requests[1].options.headers.get('Authorization'), 'Basic YWxpY2U6c2VjcmV0');
  assert.equal(requests[1].options.headers.get('Content-Type'), 'application/xml; charset=utf-8');
});

test('accepts default-namespace DAV collection XML after MKCOL is not allowed', async () => {
  const worker = await createWorker(async (_url, options) => (
    options.method === 'MKCOL'
      ? response(405)
      : response(207, '', defaultNamespaceCollectionXml)
  ));

  await worker.ensureWebdavDirectories(server, ['/Images']);
});

test('rejects a non-collection PROPFIND response and does not cache it', async () => {
  let calls = 0;
  const regularResourceXml = '<?xml version="1.0"?><D:multistatus xmlns:D="DAV:"><D:response><D:propstat><D:prop><D:resourcetype/></D:prop></D:propstat></D:response></D:multistatus>';
  const worker = await createWorker(async (_url, options) => {
    calls += 1;
    return options.method === 'MKCOL'
      ? response(405)
      : response(207, '', regularResourceXml);
  });

  await assert.rejects(
    worker.ensureWebdavDirectories(server, ['/Images']),
    /not a collection\/directory/i
  );
  await assert.rejects(
    worker.ensureWebdavDirectories(server, ['/Images']),
    /not a collection\/directory/i
  );
  assert.equal(calls, 4);
});

test('reports an actionable error when collection verification XML cannot be read', async () => {
  const worker = await createWorker(async (_url, options) => {
    if (options.method === 'MKCOL') return response(405);
    return {
      ...response(207),
      text: async () => { throw new Error('connection interrupted'); }
    };
  });

  await assert.rejects(
    worker.ensureWebdavDirectories(server, ['/Images']),
    /Could not read WebDAV directory verification response: connection interrupted/
  );
});

test('resolves WebDAV XML namespaces in element scope when verifying collections', async () => {
  const cases = [
    {
      name: 'a local prefix rebind from DAV to another namespace',
      body: '<root xmlns:D="DAV:"><D:resourcetype xmlns:D="urn:not-dav"><D:collection/></D:resourcetype></root>',
      accepted: false
    },
    {
      name: 'an unrelated DAV prefix declaration elsewhere in the response',
      body: '<root xmlns:D="urn:not-dav"><other xmlns:D="DAV:"><D:collection/></other><D:resourcetype><D:collection/></D:resourcetype></root>',
      accepted: false
    },
    {
      name: 'a locally declared DAV prefix',
      body: '<root><R:resourcetype xmlns:R="DAV:"><R:collection/></R:resourcetype></root>',
      accepted: true
    },
    {
      name: 'a default namespace rebound from a non-DAV ancestor to DAV',
      body: '<root xmlns="urn:not-dav"><resourcetype xmlns="DAV:"><collection></collection></resourcetype></root>',
      accepted: true
    },
    {
      name: 'a default namespace rebound away from DAV',
      body: '<root xmlns="DAV:"><resourcetype xmlns="urn:not-dav"><collection/></resourcetype></root>',
      accepted: false
    },
    {
      name: 'a wrong-case DAV Collection element',
      body: '<D:multistatus xmlns:D="DAV:"><D:resourcetype><D:Collection/></D:resourcetype></D:multistatus>',
      accepted: false
    },
    {
      name: 'a wrong-case DAV ResourceType element',
      body: '<D:multistatus xmlns:D="DAV:"><D:ResourceType><D:collection/></D:ResourceType></D:multistatus>',
      accepted: false
    },
    {
      name: 'a collection-shaped XML comment',
      body: '<!-- <D:resourcetype><D:collection/></D:resourcetype> --><D:multistatus xmlns:D="DAV:"><D:resourcetype/></D:multistatus>',
      accepted: false
    }
  ];

  for (const fixture of cases) {
    let calls = 0;
    const worker = await createWorker(async (_url, options) => {
      calls += 1;
      return options.method === 'MKCOL'
        ? response(405)
        : response(207, '', fixture.body);
    });

    if (fixture.accepted) {
      await worker.ensureWebdavDirectories(server, ['/Images']);
      assert.equal(calls, 2, fixture.name);
      continue;
    }

    await assert.rejects(
      worker.ensureWebdavDirectories(server, ['/Images']),
      /not a collection\/directory/i,
      fixture.name
    );
    await assert.rejects(
      worker.ensureWebdavDirectories(server, ['/Images']),
      /not a collection\/directory/i,
      `${fixture.name} should not be cached`
    );
    assert.equal(calls, 4, fixture.name);
  }
});

test('rejects malformed WebDAV verification XML without caching it', async () => {
  const invalidBodies = [
    '<!garbage><D:resourcetype xmlns:D="DAV:"><D:collection/></D:resourcetype>',
    '<!DOCTYPE collection><D:resourcetype xmlns:D="DAV:"><D:collection/></D:resourcetype>',
    '<![CDATA[not a document]]><D:resourcetype xmlns:D="DAV:"><D:collection/></D:resourcetype>',
    '<D:resourcetype xmlns:D="DAV:"><D:collection/></D:not-resourcetype>'
  ];

  for (const body of invalidBodies) {
    let calls = 0;
    const worker = await createWorker(async (_url, options) => {
      calls += 1;
      return options.method === 'MKCOL' ? response(405) : response(207, '', body);
    });

    await assert.rejects(worker.ensureWebdavDirectories(server, ['/Images']), /not a collection\/directory/i);
    await assert.rejects(worker.ensureWebdavDirectories(server, ['/Images']), /not a collection\/directory/i);
    assert.equal(calls, 4);
  }
});

test('accepts a well-formed collection response with XML declaration and comments', async () => {
  const body = '\uFEFF<?xml version="1.0" encoding="utf-8"?>\n<!-- before root -->\n<D:multistatus xmlns:D="DAV:"><D:resourcetype><D:collection/></D:resourcetype></D:multistatus>\n<!-- after root -->';
  const worker = await createWorker(async (_url, options) => (
    options.method === 'MKCOL' ? response(405) : response(207, '', body)
  ));

  await worker.ensureWebdavDirectories(server, ['/Images']);
});

test('validates WebDAV XML declarations before trusting a collection response', async () => {
  const collectionRoot = '<D:multistatus xmlns:D="DAV:"><D:resourcetype><D:collection/></D:resourcetype></D:multistatus>';
  const invalidBodies = [
    `<?xml?>${collectionRoot}`,
    `<?xml garbage?>${collectionRoot}`,
    `<?xml version="1.0"?><?xml version="1.0"?>${collectionRoot}`,
    `<?Xml version="1.0"?>${collectionRoot}`,
    `<?xml-stylesheet href="style.xsl"?>${collectionRoot}`,
    ` <?xml version="1.0"?>${collectionRoot}`,
    `<!-- before declaration --><?xml version="1.0"?>${collectionRoot}`,
    `<?processing instruction?><?xml version="1.0"?>${collectionRoot}`,
    `<?xml encoding="utf-8" version="1.0"?>${collectionRoot}`,
    `<?xml version="2.0"?>${collectionRoot}`,
    `<?xml version="1.0" encoding="9bad"?>${collectionRoot}`,
    `<?xml version="1.0" standalone="maybe"?>${collectionRoot}`,
    `<?xml version="1.0" unknown="value"?>${collectionRoot}`,
    `${collectionRoot}<?xml version="1.0"?>`
  ];

  for (const body of invalidBodies) {
    let calls = 0;
    const worker = await createWorker(async (_url, options) => {
      calls += 1;
      return options.method === 'MKCOL' ? response(405) : response(207, '', body);
    });

    await assert.rejects(worker.ensureWebdavDirectories(server, ['/Images']), /not a collection\/directory/i);
    await assert.rejects(worker.ensureWebdavDirectories(server, ['/Images']), /not a collection\/directory/i);
    assert.equal(calls, 4);
  }
});

test('enforces XML S whitespace in WebDAV processing instructions and declarations', async () => {
  const collectionRoot = '<D:multistatus xmlns:D="DAV:"><D:resourcetype><D:collection/></D:resourcetype></D:multistatus>';
  const invalidBodies = [
    `<? xml version="1.0"?>${collectionRoot}`,
    `\v<?xml version="1.0"?>${collectionRoot}`,
    `\u00A0<?xml version="1.0"?>${collectionRoot}`,
    `<?xml\vversion="1.0"?>${collectionRoot}`,
    `<?xml\u00A0version="1.0"?>${collectionRoot}`
  ];

  for (const body of invalidBodies) {
    let calls = 0;
    const worker = await createWorker(async (_url, options) => {
      calls += 1;
      return options.method === 'MKCOL' ? response(405) : response(207, '', body);
    });

    await assert.rejects(worker.ensureWebdavDirectories(server, ['/Images']), /not a collection\/directory/i);
    await assert.rejects(worker.ensureWebdavDirectories(server, ['/Images']), /not a collection\/directory/i);
    assert.equal(calls, 4);
  }

  const validXmlSBody = `<?xml\tversion\t=\t"1.0"\r\nencoding\t=\t"utf-8"\nstandalone\t=\t"yes"\r?>${collectionRoot}`;
  const validWorker = await createWorker(async (_url, options) => (
    options.method === 'MKCOL' ? response(405) : response(207, '', validXmlSBody)
  ));
  await validWorker.ensureWebdavDirectories(server, ['/Images']);
});

test('requires DAV collection markers to be direct resourcetype children', async () => {
  const nestedCollectionBody = '<D:multistatus xmlns:D="DAV:"><D:resourcetype><x><D:collection/></x></D:resourcetype></D:multistatus>';
  let nestedCalls = 0;
  const nestedWorker = await createWorker(async (_url, options) => {
    nestedCalls += 1;
    return options.method === 'MKCOL' ? response(405) : response(207, '', nestedCollectionBody);
  });

  await assert.rejects(nestedWorker.ensureWebdavDirectories(server, ['/Images']), /not a collection\/directory/i);
  await assert.rejects(nestedWorker.ensureWebdavDirectories(server, ['/Images']), /not a collection\/directory/i);
  assert.equal(nestedCalls, 4);

  for (const collectionTag of ['<D:collection/>', '<D:collection></D:collection>']) {
    const directBody = `<D:multistatus xmlns:D="DAV:"><D:resourcetype>${collectionTag}</D:resourcetype></D:multistatus>`;
    const directWorker = await createWorker(async (_url, options) => (
      options.method === 'MKCOL' ? response(405) : response(207, '', directBody)
    ));
    await directWorker.ensureWebdavDirectories(server, ['/Images']);
  }
});

test('rejects leading XML whitespace inside start and end tags', async () => {
  const invalidBodies = [
    '< D:multistatus xmlns:D="DAV:"><D:resourcetype><D:collection/></D:resourcetype></D:multistatus>',
    '<D:multistatus xmlns:D="DAV:"><D:resourcetype><D:collection/></D:resourcetype>< /D:multistatus>',
    '<D:multistatus xmlns:D="DAV:"><D:resourcetype><D:collection/></D:resourcetype></ D:multistatus>'
  ];

  for (const body of invalidBodies) {
    let calls = 0;
    const worker = await createWorker(async (_url, options) => {
      calls += 1;
      return options.method === 'MKCOL' ? response(405) : response(207, '', body);
    });

    await assert.rejects(worker.ensureWebdavDirectories(server, ['/Images']), /not a collection\/directory/i);
    await assert.rejects(worker.ensureWebdavDirectories(server, ['/Images']), /not a collection\/directory/i);
    assert.equal(calls, 4);
  }
});

test('validates entity references in WebDAV XML text and attributes', async () => {
  const invalidBodies = [
    '<D:multistatus xmlns:D="DAV:">bare & text<D:resourcetype><D:collection/></D:resourcetype></D:multistatus>',
    '<D:multistatus xmlns:D="DAV:">&notDeclared;<D:resourcetype><D:collection/></D:resourcetype></D:multistatus>',
    '<D:multistatus xmlns:D="DAV:">&#0;<D:resourcetype><D:collection/></D:resourcetype></D:multistatus>',
    '<D:multistatus xmlns:D="DAV:">&#xD800;<D:resourcetype><D:collection/></D:resourcetype></D:multistatus>',
    '<D:multistatus xmlns:D="DAV:" data="&notDeclared;"><D:resourcetype><D:collection/></D:resourcetype></D:multistatus>',
    '<D:multistatus xmlns:D="DAV:" xmlns:x="&notDeclared;"><D:resourcetype><D:collection/></D:resourcetype></D:multistatus>'
  ];

  for (const body of invalidBodies) {
    let calls = 0;
    const worker = await createWorker(async (_url, options) => {
      calls += 1;
      return options.method === 'MKCOL' ? response(405) : response(207, '', body);
    });

    await assert.rejects(worker.ensureWebdavDirectories(server, ['/Images']), /not a collection\/directory/i);
    await assert.rejects(worker.ensureWebdavDirectories(server, ['/Images']), /not a collection\/directory/i);
    assert.equal(calls, 4);
  }

  const validBody = '<D:multistatus xmlns:D="DAV:" data="&amp;">&#65;&#x20;&amp;&lt;&gt;&apos;&quot;<D:resourcetype><D:collection/></D:resourcetype></D:multistatus>';
  const validWorker = await createWorker(async (_url, options) => (
    options.method === 'MKCOL' ? response(405) : response(207, '', validBody)
  ));
  await validWorker.ensureWebdavDirectories(server, ['/Images']);
});

test('rejects illegal XML lexical content in collection responses without caching it', async t => {
  const collection = '<D:resourcetype><D:collection/></D:resourcetype>';
  const fixtures = [
    {
      name: 'a raw less-than sign in an attribute value',
      body: `<D:multistatus xmlns:D="DAV:" data="bad<value">${collection}</D:multistatus>`
    },
    {
      name: 'a double hyphen in a comment body',
      body: `<D:multistatus xmlns:D="DAV:"><!-- bad -- comment -->${collection}</D:multistatus>`
    },
    {
      name: 'a comment body ending in a hyphen before the close delimiter',
      body: `<D:multistatus xmlns:D="DAV:"><!-- bad--->${collection}</D:multistatus>`
    },
    {
      name: 'a CDATA close delimiter in ordinary text',
      body: `<D:multistatus xmlns:D="DAV:">bad]]>${collection}</D:multistatus>`
    },
    {
      name: 'an illegal XML code point in an attribute value',
      body: `<D:multistatus xmlns:D="DAV:" data="bad\u0001value">${collection}</D:multistatus>`
    },
    {
      name: 'an illegal XML code point in text',
      body: `<D:multistatus xmlns:D="DAV:">bad\u0001text${collection}</D:multistatus>`
    },
    {
      name: 'an illegal XML code point in a comment',
      body: `<D:multistatus xmlns:D="DAV:"><!-- bad\u0001comment -->${collection}</D:multistatus>`
    },
    {
      name: 'an illegal XML code point in CDATA',
      body: `<D:multistatus xmlns:D="DAV:"><![CDATA[bad\u0001data]]>${collection}</D:multistatus>`
    },
    {
      name: 'an illegal XML code point in a processing instruction',
      body: `<D:multistatus xmlns:D="DAV:"><?check bad\u0001data?>${collection}</D:multistatus>`
    }
  ];

  for (const fixture of fixtures) {
    await t.test(fixture.name, async () => {
      let calls = 0;
      const worker = await createWorker(async (_url, options) => {
        calls += 1;
        return options.method === 'MKCOL' ? response(405) : response(207, '', fixture.body);
      });

      await assert.rejects(
        worker.ensureWebdavDirectories(server, ['/Images']),
        /not a collection\/directory/i
      );
      await assert.rejects(
        worker.ensureWebdavDirectories(server, ['/Images']),
        /not a collection\/directory/i
      );
      assert.equal(calls, 4, 'a malformed response must not populate the confirmed-directory cache');
    });
  }
});

test('requires XML whitespace between WebDAV response attributes', async t => {
  const collection = '<D:resourcetype><D:collection/></D:resourcetype>';
  const invalidBodies = [
    `<D:multistatus xmlns:D="DAV:"x="1">${collection}</D:multistatus>`,
    `<D:multistatus xmlns:D="DAV:" data="a"other="b">${collection}</D:multistatus>`
  ];

  for (const [index, body] of invalidBodies.entries()) {
    await t.test(`rejects adjacent attributes without XML S (${index + 1})`, async () => {
      let calls = 0;
      const worker = await createWorker(async (_url, options) => {
        calls += 1;
        return options.method === 'MKCOL' ? response(405) : response(207, '', body);
      });

      await assert.rejects(worker.ensureWebdavDirectories(server, ['/Images']), /not a collection\/directory/i);
      await assert.rejects(worker.ensureWebdavDirectories(server, ['/Images']), /not a collection\/directory/i);
      assert.equal(calls, 4, 'an invalid attribute list must not be cached');
    });
  }

  for (const [name, separator] of [
    ['space', ' '],
    ['tab', '\t'],
    ['carriage return', '\r'],
    ['line feed', '\n']
  ]) {
    await t.test(`accepts attributes separated by ${name}`, async () => {
      const body = `<D:multistatus xmlns:D="DAV:"${separator}data="ok">${collection}</D:multistatus>`;
      const worker = await createWorker(async (_url, options) => (
        options.method === 'MKCOL' ? response(405) : response(207, '', body)
      ));

      await worker.ensureWebdavDirectories(server, ['/Images']);
    });
  }
});

test('shares in-flight creation and caches confirmed collections', async () => {
  let resolveRequest;
  let requestCount = 0;
  const worker = await createWorker(async () => {
    requestCount += 1;
    await new Promise(resolve => { resolveRequest = resolve; });
    return response(201);
  });

  const first = worker.ensureWebdavDirectories(server, ['/Images']);
  const second = worker.ensureWebdavDirectories(server, ['/Images']);
  await waitFor(() => requestCount === 1, 'the shared MKCOL request did not start');
  assert.equal(requestCount, 1);
  resolveRequest();
  await Promise.all([first, second]);
  await worker.ensureWebdavDirectories(server, ['/Images']);
  assert.equal(requestCount, 1);
});

test('separates confirmed and in-flight collection cache entries when credentials differ', async () => {
  const resolvers = [];
  let requestCount = 0;
  const worker = await createWorker(async () => {
    requestCount += 1;
    await new Promise(resolve => { resolvers.push(resolve); });
    return response(201);
  });
  const differentPassword = { ...server, password: 'another-secret' };

  const first = worker.ensureWebdavDirectories(server, ['/Images']);
  const second = worker.ensureWebdavDirectories(differentPassword, ['/Images']);
  await waitFor(() => requestCount === 2, 'different credentials shared an in-flight MKCOL request');
  resolvers[0]();
  resolvers[1]();
  await Promise.all([first, second]);
  await worker.ensureWebdavDirectories(server, ['/Images']);
  await worker.ensureWebdavDirectories(differentPassword, ['/Images']);

  assert.equal(requestCount, 2);
});

test('does not cache failed collection creation and retries it', async () => {
  let calls = 0;
  const worker = await createWorker(async () => {
    calls += 1;
    return response(calls === 1 ? 500 : 201, 'Server Error');
  });

  await assert.rejects(worker.ensureWebdavDirectories(server, ['/Images']), /Failed to create directory: 500 Server Error/);
  await worker.ensureWebdavDirectories(server, ['/Images']);
  assert.equal(calls, 2);
});

test('reports clear collection creation failures without a root fallback', async () => {
  const cases = [
    [401, 'Unauthorized', /Directory creation authentication failed\. Check username and password\./],
    [403, 'Forbidden', /Directory creation permission denied\./],
    [409, 'Conflict', /Cannot create directory because its parent does not exist\./],
    [500, 'Server Error', /Failed to create directory: 500 Server Error/]
  ];

  for (const [status, statusText, expectedError] of cases) {
    const worker = await createWorker(async () => response(status, statusText));
    await assert.rejects(worker.ensureWebdavDirectories(server, ['/Images']), expectedError);
  }

  const requests = [];
  const worker = await createWorker(async (url, options) => {
    requests.push({ url, options });
    return response(options.method === 'MKCOL' ? 405 : 404, 'Not Found');
  });
  await assert.rejects(
    worker.ensureWebdavDirectories(server, ['/Images']),
    /Cannot create directory: server does not support MKCOL and the directory does not exist\./
  );
  assert.deepEqual(requests.map(request => request.options.method), ['MKCOL', 'PROPFIND']);
});

test('does not request fixed directories and reset clears confirmed collection cache', async () => {
  let calls = 0;
  const worker = await createWorker(async () => {
    calls += 1;
    return response(201);
  });

  await worker.ensureWebdavDirectories(server, []);
  assert.equal(calls, 0);
  await worker.ensureWebdavDirectories(server, ['/Images']);
  await worker.ensureWebdavDirectories(server, ['/Images']);
  assert.equal(calls, 1);
  worker.resetWebdavDirectoryCache();
  await worker.ensureWebdavDirectories(server, ['/Images']);
  assert.equal(calls, 2);
});

test('reset isolates new work from stale in-flight authorization and stale cache writes', async () => {
  const resolvers = [];
  let calls = 0;
  const worker = await createWorker(async () => {
    calls += 1;
    await new Promise(resolve => { resolvers.push(resolve); });
    return response(201);
  });

  const first = worker.ensureWebdavDirectories(server, ['/Images']);
  await waitFor(() => calls === 1, 'the original MKCOL request did not start');
  worker.resetWebdavDirectoryCache();
  const refreshedServer = { ...server, password: 'refreshed-secret' };
  const second = worker.ensureWebdavDirectories(refreshedServer, ['/Images']);
  await waitFor(() => calls === 2, 'the replacement MKCOL request did not start');
  assert.equal(calls, 2);
  resolvers[1]();
  await second;
  resolvers[0]();
  await first;
  const retry = worker.ensureWebdavDirectories(server, ['/Images']);
  await waitFor(() => calls === 3, 'the old cache generation suppressed a retry');
  resolvers[2]();
  await retry;
  await worker.ensureWebdavDirectories(server, ['/Images']);
  assert.equal(calls, 3);
});

test('reset during credential fingerprinting leaves the stale creation uncached', async () => {
  let releaseDigest;
  let digestStarted = false;
  const digestGate = new Promise(resolve => { releaseDigest = resolve; });
  const controlledCrypto = {
    subtle: {
      async digest(...args) {
        digestStarted = true;
        await digestGate;
        return webcrypto.subtle.digest(...args);
      }
    }
  };
  let calls = 0;
  const worker = await createWorker(async () => {
    calls += 1;
    return response(201);
  }, { crypto: controlledCrypto });

  const staleEnsure = worker.ensureWebdavDirectories(server, ['/Images']);
  await waitFor(() => digestStarted, 'credential fingerprinting did not start');
  worker.resetWebdavDirectoryCache();
  releaseDigest();
  await staleEnsure;
  assert.equal(calls, 1);

  await worker.ensureWebdavDirectories(server, ['/Images']);
  assert.equal(calls, 2);
});

test('uses the prepared AVIF MIME type for the final filename and upload target', async () => {
  const requests = [];
  const statuses = [];
  const settings = {
    image: { saveFormat: 'original' },
    filename: { rule: 'original', customTemplate: '{originalName}.{ext}' },
    directory: { rule: 'fixed' }
  };
  const worker = await createWorker(async (url, options) => {
    requests.push({ url, options });
    if (!options || !options.method) {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        blob: async () => new Blob(['avif'], { type: 'image/avif' })
      };
    }
    return response(201, 'Created');
  }, {
    settings,
    ImageFormat,
    FilenameRule,
    DirectoryRule,
    sentMessages: statuses
  });
  await worker.configReady;

  await worker.uploadImage(
    'https://cdn.example/photo.png',
    'https://page.example/article',
    'An article',
    server,
    'upload-avif',
    7,
    'original'
  );
  await new Promise(resolve => setImmediate(resolve));

  const put = requests.find(request => request.options?.method === 'PUT');
  assert.ok(put);
  assert.equal(put.url, 'https://dav.example/webdav/photo.avif');
  assert.equal(put.options.headers.get('Content-Type'), 'image/avif');
  assert.equal(requests.some(request => request.options?.method === 'MKCOL'), false);
  assert.equal(statuses.length, 1);
  assert.equal(statuses[0].tabId, 7);
  assert.equal(statuses[0].message.action, 'showStatusBubble');
  assert.equal(statuses[0].message.uploadId, 'upload-avif');
  assert.equal(statuses[0].message.status, 'success');
  assert.equal(statuses[0].message.message, 'Saved as "photo.avif"');
});

test('uses actual ICO MIME aliases for extensionless and incorrectly extended uploads', async () => {
  const variants = [
    { mimeType: 'image/x-icon', imageUrl: 'https://cdn.example/favicon' },
    { mimeType: 'image/vnd.microsoft.icon', imageUrl: 'https://cdn.example/favicon.png' }
  ];

  for (const [index, variant] of variants.entries()) {
    const requests = [];
    const statuses = [];
    const sourceBlob = new Blob([`ico-${index}`], { type: variant.mimeType });
    const settings = {
      image: { saveFormat: 'original' },
      filename: { rule: 'original', customTemplate: '{originalName}.{ext}' },
      directory: { rule: 'fixed' }
    };
    const worker = await createWorker(async (url, options) => {
      requests.push({ url, options });
      if (!options?.method) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          blob: async () => sourceBlob
        };
      }
      return response(201, 'Created');
    }, {
      settings,
      ImageFormat,
      FilenameRule,
      DirectoryRule,
      sentMessages: statuses
    });

    await worker.uploadImage(
      variant.imageUrl,
      'https://page.example/article',
      'An article',
      server,
      `upload-ico-${index}`,
      7,
      'original'
    );
    await new Promise(resolve => setImmediate(resolve));

    const put = requests.find(request => request.options?.method === 'PUT');
    assert.ok(put);
    assert.equal(put.url, 'https://dav.example/webdav/favicon.ico');
    assert.equal(put.options.headers.get('Content-Type'), variant.mimeType);
    assert.equal(put.options.body, sourceBlob);
    assert.equal(statuses.length, 1);
    assert.equal(statuses[0].message.status, 'success');
    assert.equal(statuses[0].message.message, 'Saved as "favicon.ico"');
  }
});

test('saves the uploaded blob with independent local naming and directory rules', async () => {
  const localCopies = [];
  const statuses = [];
  const sourceBlob = new Blob(['photo-bytes'], { type: 'image/jpeg' });
  const settings = {
    image: { saveFormat: 'original' },
    filename: { rule: 'original', customTemplate: '{originalName}.{ext}' },
    directory: { rule: 'date' },
    localCopy: {
      enabled: true,
      folderName: 'Pictures',
      directory: { rule: 'date' },
      filename: { rule: 'custom', customTemplate: '{originalName}-{date}.{ext}' }
    }
  };
  const worker = await createWorker(async (_url, options) => {
    if (!options?.method) {
      return { ok: true, status: 200, statusText: 'OK', blob: async () => sourceBlob };
    }
    return response(201, 'Created');
  }, {
    settings,
    ImageFormat,
    FilenameRule,
    DirectoryRule,
    LocalCopy,
    sentMessages: statuses,
    persistLocalCopy: async payload => {
      localCopies.push(payload);
      return { filename: payload.relativePath.split('/').pop(), relativePath: payload.relativePath };
    }
  });

  await worker.uploadImage(
    'https://cdn.example/photo.png',
    'https://www.example.com/article',
    'An article',
    server,
    'upload-local',
    7,
    'original'
  );
  await new Promise(resolve => setImmediate(resolve));

  const now = new Date();
  const dateStamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const monthStamp = String(now.getMonth() + 1).padStart(2, '0');
  assert.equal(localCopies.length, 1);
  assert.equal(localCopies[0].blob, sourceBlob);
  assert.equal(localCopies[0].relativePath, `${now.getFullYear()}/${monthStamp}/photo-${dateStamp}.jpg`);
  assert.equal(statuses[0].message.status, 'success');
  assert.equal(statuses[0].message.message, 'Saved as "photo.jpg"');
});

test('uses the exact WebDAV filename and directory rules when local rules inherit them', async () => {
  const localCopies = [];
  const sourceBlob = new Blob(['photo-bytes'], { type: 'image/jpeg' });
  const settings = {
    image: { saveFormat: 'original' },
    filename: { rule: 'custom', customTemplate: 'webdav-{date}.{ext}' },
    directory: { rule: 'domain-date' },
    localCopy: {
      enabled: true,
      folderName: 'Pictures',
      directory: { rule: 'webdav' },
      filename: { rule: 'webdav', customTemplate: 'unused-{date}.{ext}' }
    }
  };
  const worker = await createWorker(async (_url, options) => {
    if (!options?.method) {
      return { ok: true, status: 200, statusText: 'OK', blob: async () => sourceBlob };
    }
    return response(201, 'Created');
  }, {
    settings,
    ImageFormat,
    FilenameRule,
    DirectoryRule,
    LocalCopy,
    persistLocalCopy: async payload => {
      localCopies.push(payload);
      return { filename: payload.relativePath.split('/').pop(), relativePath: payload.relativePath };
    }
  });

  await worker.uploadImage(
    'https://cdn.example/photo.png',
    'https://www.example.com/article',
    'An article',
    server,
    'upload-local-inherit',
    7,
    'original'
  );
  await new Promise(resolve => setImmediate(resolve));

  const now = new Date();
  const dateStamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const monthStamp = String(now.getMonth() + 1).padStart(2, '0');
  assert.equal(localCopies.length, 1);
  assert.equal(
    localCopies[0].relativePath,
    `example.com/${now.getFullYear()}/${monthStamp}/webdav-${dateStamp}.jpg`
  );
});

test('keeps the WebDAV upload and warns when the local copy fails', async () => {
  const statuses = [];
  const sourceBlob = new Blob(['photo-bytes'], { type: 'image/jpeg' });
  const settings = {
    image: { saveFormat: 'original' },
    filename: { rule: 'original', customTemplate: '{originalName}.{ext}' },
    directory: { rule: 'fixed' },
    localCopy: {
      enabled: true,
      folderName: 'Pictures',
      filename: { rule: 'original', customTemplate: '{originalName}.{ext}' }
    }
  };
  const worker = await createWorker(async (_url, options) => {
    if (!options?.method) {
      return { ok: true, status: 200, statusText: 'OK', blob: async () => sourceBlob };
    }
    return response(201, 'Created');
  }, {
    settings,
    ImageFormat,
    FilenameRule,
    DirectoryRule,
    LocalCopy,
    sentMessages: statuses,
    persistLocalCopy: async () => {
      throw new Error('disk full');
    }
  });

  await worker.uploadImage(
    'https://cdn.example/photo.png',
    'https://page.example/article',
    'An article',
    server,
    'upload-local-fail',
    7,
    'original'
  );
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(statuses[0].message.status, 'warning');
  assert.equal(statuses[0].message.message, 'Saved as "photo.jpg" Local copy failed.');
});

test('writes the original Blob directly without extension messaging or an offscreen document', async () => {
  const sourceBytes = [0, 255, 128, 13, 10, 42];
  const sourceBlob = new Blob([Uint8Array.from(sourceBytes)], { type: 'image/jpeg' });
  const writes = [];
  let runtimeMessages = 0;
  let offscreenDocuments = 0;
  const worker = await createWorker(async () => response(200), {
    settings: {
      image: { saveFormat: 'original' },
      directory: { rule: 'fixed' },
      localCopy: {
        enabled: true,
        folderName: 'Pictures',
        filename: { rule: 'original', customTemplate: '{originalName}.{ext}' }
      }
    },
    LocalCopy,
    LocalCopyFs: {
      ...LocalCopyFs,
      async writeLocalCopy(payload) {
        writes.push(payload);
        return { filename: 'photo.jpg', relativePath: payload.relativePath };
      }
    },
    sendMessage: async () => {
      runtimeMessages += 1;
      throw new Error('runtime messaging must not be used for local writes');
    },
    createOffscreenDocument: async () => {
      offscreenDocuments += 1;
      throw new Error('offscreen documents must not be used for local writes');
    }
  });

  const result = await worker.saveLocalCopyOfUpload({
    blob: sourceBlob,
    imageUrl: 'https://cdn.example/photo.jpg',
    pageUrl: 'https://page.example/article',
    pageTitle: 'Article',
    width: 640,
    height: 480,
    extension: 'jpg',
    now: new Date(2026, 7, 24, 12, 0, 0)
  });

  assert.equal(result.warning, undefined);
  assert.deepEqual(Object.keys(result), []);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].blob, sourceBlob);
  assert.equal(writes[0].relativePath, 'photo.jpg');
  assert.equal(runtimeMessages, 0);
  assert.equal(offscreenDocuments, 0);
});
