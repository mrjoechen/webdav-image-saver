# Ko-fi Donation Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a secure Ko-fi donation entry to the settings header and localized donation links to both repository README files.

**Architecture:** Keep the settings entry entirely declarative: add one coffee-cup symbol to the existing inline SVG sprite and one external anchor that reuses the current header icon-button styles. Add plain Markdown links to the English and Chinese README files, with a dependency-free Node contract test covering the runtime markup and both localized documentation entries.

**Tech Stack:** Manifest V3 extension HTML, inline SVG, Markdown, Node.js built-in `node:test` and `node:assert` modules.

---

## File Structure

- Create `tests/donation-links.test.js`: static contract tests for the settings anchor, inline coffee icon, and localized README donation links.
- Modify `options/options.html`: define the coffee-cup SVG symbol and add the Ko-fi anchor before the GitHub action.
- Modify `README.md`: add the English Ko-fi support link near the top.
- Modify `README.zh-CN.md`: add the Chinese Ko-fi support link near the top.

No JavaScript, CSS, manifest, background, or permission changes are required.

### Task 1: Settings Header Donation Entry

**Files:**
- Create: `tests/donation-links.test.js`
- Modify: `options/options.html`

- [ ] **Step 1: Write the failing settings-header contract test**

Create `tests/donation-links.test.js` with:

```js
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.resolve(__dirname, '..');
const optionsHtml = readFileSync(path.join(projectRoot, 'options/options.html'), 'utf8');
const kofiUrl = 'https://ko-fi.com/joechen';

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findAnchorBlock(source, href) {
  const escapedHref = escapeRegExp(href);
  return source.match(new RegExp(`<a\\b[^>]*href="${escapedHref}"[^>]*>[\\s\\S]*?<\\/a>`, 'i'))?.[0] || '';
}

test('settings header exposes a secure and accessible Ko-fi coffee icon link', () => {
  const anchorBlock = findAnchorBlock(optionsHtml, kofiUrl);
  const openingTag = anchorBlock.match(/^<a\b[^>]*>/i)?.[0] || '';
  const rel = openingTag.match(/\brel="([^"]*)"/i)?.[1] || '';

  assert.match(optionsHtml, /<symbol id="icon-coffee" viewBox="0 0 24 24">[\s\S]*?<\/symbol>/);
  assert.notEqual(anchorBlock, '', 'Ko-fi anchor should exist');
  assert.match(openingTag, /\bclass="[^"]*\bicon-button\b[^"]*"/);
  assert.match(openingTag, /\bclass="[^"]*\bdonation-link\b[^"]*"/);
  assert.match(openingTag, /\btarget="_blank"/);
  assert.deepEqual(new Set(rel.split(/\s+/).filter(Boolean)), new Set(['noopener', 'noreferrer']));
  assert.match(openingTag, /\baria-label="Support this project on Ko-fi"/);
  assert.match(openingTag, /\btitle="Support on Ko-fi"/);
  assert.match(anchorBlock, /<use href="#icon-coffee"><\/use>/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test tests/donation-links.test.js
```

Expected: FAIL in `settings header exposes a secure and accessible Ko-fi coffee icon link` because `icon-coffee` and the Ko-fi anchor are absent.

- [ ] **Step 3: Add the minimal inline icon and header anchor**

In the SVG sprite in `options/options.html`, add this symbol immediately before `icon-github`:

```html
        <symbol id="icon-coffee" viewBox="0 0 24 24"><path d="M10 2v2"/><path d="M14 2v2"/><path d="M6 2v2"/><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M4 8h14v5a7 7 0 0 1-14 0Z"/></symbol>
```

In `.header-actions`, add this anchor immediately before the GitHub anchor:

```html
                    <a class="icon-button donation-link" href="https://ko-fi.com/joechen" target="_blank" rel="noopener noreferrer" aria-label="Support this project on Ko-fi" title="Support on Ko-fi">
                        <svg class="ui-icon"><use href="#icon-coffee"></use></svg>
                    </a>
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
node --test tests/donation-links.test.js
```

Expected: PASS with one passing test and no warnings.

- [ ] **Step 5: Commit the settings entry and its test**

```bash
git add tests/donation-links.test.js options/options.html
git commit -m "feat: add Ko-fi link to settings"
```

### Task 2: English README Donation Link

**Files:**
- Modify: `tests/donation-links.test.js`
- Modify: `README.md`

- [ ] **Step 1: Add the failing English README test**

Append to `tests/donation-links.test.js`:

```js
test('English README links to Ko-fi with the support label', () => {
  const readme = readFileSync(path.join(projectRoot, 'README.md'), 'utf8');

  assert.match(
    readme,
    /^☕ \[Support this project on Ko-fi\]\(https:\/\/ko-fi\.com\/joechen\)$/m
  );
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test tests/donation-links.test.js
```

Expected: the settings test passes and `English README links to Ko-fi with the support label` fails because the line is absent.

- [ ] **Step 3: Add the English donation link**

In `README.md`, insert this line after `[简体中文](README.zh-CN.md)` and before the Chrome Web Store badge:

```markdown
☕ [Support this project on Ko-fi](https://ko-fi.com/joechen)
```

Keep one blank line above and below the new line.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
node --test tests/donation-links.test.js
```

Expected: PASS with two passing tests and no warnings.

- [ ] **Step 5: Commit the English README entry**

```bash
git add tests/donation-links.test.js README.md
git commit -m "docs: add Ko-fi link to English README"
```

### Task 3: Chinese README Donation Link

**Files:**
- Modify: `tests/donation-links.test.js`
- Modify: `README.zh-CN.md`

- [ ] **Step 1: Add the failing Chinese README test**

Append to `tests/donation-links.test.js`:

```js
test('Chinese README links to Ko-fi with the localized support label', () => {
  const readme = readFileSync(path.join(projectRoot, 'README.zh-CN.md'), 'utf8');

  assert.match(
    readme,
    /^☕ \[在 Ko-fi 上支持这个项目\]\(https:\/\/ko-fi\.com\/joechen\)$/m
  );
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test tests/donation-links.test.js
```

Expected: the existing two tests pass and `Chinese README links to Ko-fi with the localized support label` fails because the line is absent.

- [ ] **Step 3: Add the Chinese donation link**

In `README.zh-CN.md`, insert this line after `[English](README.md)` and before the Chrome Web Store badge:

```markdown
☕ [在 Ko-fi 上支持这个项目](https://ko-fi.com/joechen)
```

Keep one blank line above and below the new line.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
node --test tests/donation-links.test.js
```

Expected: PASS with three passing tests and no warnings.

- [ ] **Step 5: Commit the Chinese README entry**

```bash
git add tests/donation-links.test.js README.zh-CN.md
git commit -m "docs: add Ko-fi link to Chinese README"
```

### Task 4: Regression and Packaging-Safety Verification

**Files:**
- Verify: `tests/donation-links.test.js`
- Verify: `options/options.html`
- Verify: `README.md`
- Verify: `README.zh-CN.md`

- [ ] **Step 1: Run all Node tests**

Run:

```bash
node --test
```

Expected: all three donation-link tests pass with zero failures.

- [ ] **Step 2: Run JavaScript syntax checks**

Run:

```bash
node --check background.js
node --check content_script.js
node --check options/options.js
node --check tests/donation-links.test.js
```

Expected: every command exits with status 0 and produces no syntax errors.

- [ ] **Step 3: Check that no remote runtime assets were introduced**

Run:

```bash
rg -n '<(script|link|img)[^>]+(src|href)="https?://' options
```

Expected: no matches. The Ko-fi URL is navigation in an `<a>` element, not a remotely loaded script, stylesheet, font, or image.

- [ ] **Step 4: Check whitespace and final scope**

Run:

```bash
git diff --check HEAD~3..HEAD
git status --short
```

Expected: `git diff --check` reports no errors, and `git status --short` is clean except for the uncommitted implementation-plan document if it was intentionally left outside the feature commits.
