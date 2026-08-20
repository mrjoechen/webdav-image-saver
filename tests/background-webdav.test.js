const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const ImageFormat = require('../image-format.js');
const FilenameRule = require('../filename-rule.js');
const DirectoryRule = require('../directory-rule.js');

const backgroundSource = readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
const testExport = ';globalThis.__backgroundWebdavTest = { ensureWebdavDirectories, resetWebdavDirectoryCache, uploadImage, configReady };';

function response(status, statusText = '') {
  return {
    status,
    statusText,
    ok: status >= 200 && status < 300,
    text: async () => ''
  };
}

async function waitFor(check, message = 'condition was not met') {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  assert.fail(message);
}

async function createWorker(fetchImpl, options = {}) {
  const noopEvent = { addListener() {} };
  const sentMessages = options.sentMessages || [];
  const storageArea = {
    get: async () => ({}),
    set: async () => {},
    remove: async () => {}
  };
  const context = {
    importScripts() {},
    fetch: fetchImpl,
    Headers,
    TextEncoder,
    URL,
    crypto: webcrypto,
    btoa(value) { return Buffer.from(value, 'binary').toString('base64'); },
    console: { log() {}, warn() {}, error() {} },
    AppSettings: {
      createDefaultSettings: () => options.settings || { image: { saveFormat: 'original' } },
      loadSettings: async () => options.settings || { image: { saveFormat: 'original' } }
    },
    ImageFormat: options.ImageFormat || {},
    FilenameRule: options.FilenameRule || {},
    DirectoryRule: options.DirectoryRule || {},
    chrome: {
      runtime: { onInstalled: noopEvent, onMessage: noopEvent, openOptionsPage() {} },
      contextMenus: { onClicked: noopEvent, removeAll(callback) { callback(); }, create(_item, callback) { callback?.(); } },
      action: { onClicked: noopEvent },
      tabs: {
        onRemoved: noopEvent,
        sendMessage: async (tabId, message) => {
          sentMessages.push({ tabId, message });
        }
      },
      scripting: { insertCSS: async () => {}, executeScript: async () => {} },
      storage: { local: storageArea, sync: storageArea, session: storageArea }
    }
  };
  context.globalThis = context;
  vm.runInNewContext(`${backgroundSource}${testExport}`, context, { filename: 'background.js' });
  await context.__backgroundWebdavTest.configReady;
  return context.__backgroundWebdavTest;
}

const server = { url: 'https://dav.example/webdav', username: 'alice', password: 'secret' };

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
    return response(options.method === 'MKCOL' ? 405 : 207);
  });

  await worker.ensureWebdavDirectories(server, ['/Images']);

  assert.deepEqual(requests.map(request => request.options.method), ['MKCOL', 'PROPFIND']);
  assert.equal(requests[1].options.headers.get('Depth'), '0');
  assert.equal(requests[1].options.headers.get('Authorization'), 'Basic YWxpY2U6c2VjcmV0');
  assert.equal(requests[1].options.headers.get('Content-Type'), 'application/xml; charset=utf-8');
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
