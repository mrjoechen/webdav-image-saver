const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const backgroundSource = readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
const testExport = ';globalThis.__backgroundWebdavTest = { ensureWebdavDirectories, resetWebdavDirectoryCache };';

function response(status, statusText = '') {
  return {
    status,
    statusText,
    ok: status >= 200 && status < 300,
    text: async () => ''
  };
}

function createWorker(fetchImpl) {
  const noopEvent = { addListener() {} };
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
    btoa(value) { return Buffer.from(value, 'binary').toString('base64'); },
    console: { log() {}, warn() {}, error() {} },
    AppSettings: {
      createDefaultSettings: () => ({ image: { saveFormat: 'original' } }),
      loadSettings: async () => ({ image: { saveFormat: 'original' } })
    },
    ImageFormat: {},
    FilenameRule: {},
    DirectoryRule: {},
    chrome: {
      runtime: { onInstalled: noopEvent, onMessage: noopEvent, openOptionsPage() {} },
      contextMenus: { onClicked: noopEvent, removeAll(callback) { callback(); }, create(_item, callback) { callback?.(); } },
      action: { onClicked: noopEvent },
      tabs: { onRemoved: noopEvent, sendMessage: async () => {} },
      scripting: { insertCSS: async () => {}, executeScript: async () => {} },
      storage: { local: storageArea, sync: storageArea, session: storageArea }
    }
  };
  context.globalThis = context;
  vm.runInNewContext(`${backgroundSource}${testExport}`, context, { filename: 'background.js' });
  return context.__backgroundWebdavTest;
}

const server = { url: 'https://dav.example/webdav', username: 'alice', password: 'secret' };

test('creates nested WebDAV collections parent first with credentials', async () => {
  const requests = [];
  const worker = createWorker(async (url, options) => {
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
  const worker = createWorker(async (url, options) => {
    requests.push({ url, options });
    return response(201);
  });

  await worker.ensureWebdavDirectories(server, ['/Images & More/2026 08']);

  assert.equal(requests[0].url, 'https://dav.example/webdav/Images%20%26%20More/2026%2008/');
});

test('accepts an existing collection only after 405 is verified by depth-zero PROPFIND', async () => {
  const requests = [];
  const worker = createWorker(async (url, options) => {
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
  const worker = createWorker(async () => {
    requestCount += 1;
    await new Promise(resolve => { resolveRequest = resolve; });
    return response(201);
  });

  const first = worker.ensureWebdavDirectories(server, ['/Images']);
  const second = worker.ensureWebdavDirectories(server, ['/Images']);
  await Promise.resolve();
  assert.equal(requestCount, 1);
  resolveRequest();
  await Promise.all([first, second]);
  await worker.ensureWebdavDirectories(server, ['/Images']);
  assert.equal(requestCount, 1);
});

test('does not cache failed collection creation and retries it', async () => {
  let calls = 0;
  const worker = createWorker(async () => {
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
    const worker = createWorker(async () => response(status, statusText));
    await assert.rejects(worker.ensureWebdavDirectories(server, ['/Images']), expectedError);
  }

  const requests = [];
  const worker = createWorker(async (url, options) => {
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
  const worker = createWorker(async () => {
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

test('reset retains an in-flight creation so concurrent work stays deduplicated', async () => {
  let resolveRequest;
  let calls = 0;
  const worker = createWorker(async () => {
    calls += 1;
    await new Promise(resolve => { resolveRequest = resolve; });
    return response(201);
  });

  const first = worker.ensureWebdavDirectories(server, ['/Images']);
  await Promise.resolve();
  worker.resetWebdavDirectoryCache();
  const second = worker.ensureWebdavDirectories(server, ['/Images']);
  assert.equal(calls, 1);
  resolveRequest();
  await Promise.all([first, second]);
});
