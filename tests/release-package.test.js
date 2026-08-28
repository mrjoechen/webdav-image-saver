const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.resolve(__dirname, '..');
const releaseWorkflow = readFileSync(
  path.join(projectRoot, '.github/workflows/release.yml'),
  'utf8'
);
const packageStep = releaseWorkflow.match(
  /- name: Build extension package[\s\S]*?(?=\n      - name:|$)/
)?.[0] || '';

test('release package includes the batch side-panel runtime files', () => {
  for (const runtimePath of ['batch-save.js', 'image-discovery.js', 'sidepanel']) {
    assert.equal(
      packageStep.includes(runtimePath),
      true,
      `release workflow must package ${runtimePath}`
    );
  }
});
