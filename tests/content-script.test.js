const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const contentSource = readFileSync(path.join(__dirname, '..', 'content_script.js'), 'utf8');

class FakeElement {
  constructor(tagName, documentLike) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = documentLike;
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.className = '';
    this.id = '';
    this._textContent = '';
    this.isConnected = true;
  }

  set textContent(value) {
    this._textContent = String(value);
    this.children = [];
  }

  get textContent() {
    return this._textContent + this.children.map(child => child.textContent || '').join('');
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  append(...children) {
    children.forEach(child => this.appendChild(child));
  }

  setAttribute(name, value) {
    this[name] = String(value);
  }

  addEventListener() {}

  querySelector() {
    return null;
  }

  querySelectorAll() {
    return [];
  }

  focus() {}

  remove() {
    this.isConnected = false;
    this.ownerDocument.body.children = this.ownerDocument.body.children.filter(child => child !== this);
  }
}

function createHarness() {
  let messageListener;
  const document = {
    activeElement: null,
    title: 'Page title',
    baseURI: 'https://page.test/post',
    images: [],
    createElement(tagName) { return new FakeElement(tagName, document); },
    createTextNode(value) { return { textContent: String(value) }; },
    addEventListener() {},
    removeEventListener() {},
    getElementById(id) {
      return document.body.children.find(child => child.id === id) || null;
    }
  };
  document.body = new FakeElement('body', document);
  const context = {
    document,
    location: { href: 'https://page.test/post' },
    window: { matchMedia: () => ({ matches: true }) },
    HTMLElement: FakeElement,
    setInterval: () => 1,
    clearInterval() {},
    setTimeout() {},
    clearTimeout() {},
    console: { log() {}, error() {} },
    chrome: {
      runtime: {
        sendMessage: async () => ({}),
        onMessage: {
          addListener(listener) { messageListener = listener; }
        }
      }
    },
    ImageDiscovery: {
      collectImageRecords: () => [],
      discoverImages: () => []
    }
  };
  context.globalThis = context;
  vm.runInNewContext(contentSource, context, { filename: 'content_script.js' });
  return {
    document,
    send(message) {
      let response;
      messageListener(message, {}, value => { response = value; });
      return response;
    }
  };
}

test('ping reports that batch image discovery is available', () => {
  const harness = createHarness();
  const response = harness.send({ action: 'ping' });

  assert.equal(response.pong, true);
  assert.equal(response.batchDiscovery, true);
});

test('page bubble shows aggregate batch progress and final result', () => {
  const harness = createHarness();
  harness.send({
    action: 'batchPage:showProgress',
    batch: {
      batchId: 'batch-1',
      serverName: 'My NAS',
      summary: { completed: 2, total: 5 }
    }
  });

  const progress = harness.document.getElementById('webdav-batch-status-batch-1');
  assert.ok(progress);
  assert.match(progress.textContent, /Saving 2 of 5 to “My NAS”/);
  assert.match(progress.className, /webdav-batch-status/);

  harness.send({
    action: 'batchPage:showSummary',
    batch: {
      batchId: 'batch-1',
      summary: { total: 5, success: 3, warning: 1, failed: 1, cancelled: 0 }
    }
  });

  const summary = harness.document.getElementById('webdav-batch-status-batch-1');
  assert.match(summary.textContent, /Saved 4 of 5; 1 failed/);
  assert.match(summary.className, /complete/);
});
