# Ko-fi Donation Link Design

## Goal

Give users a clear, unobtrusive way to support the project from both the extension settings page and the repository documentation. Every donation entry opens `https://ko-fi.com/joechen`.

## Settings Page

- Add a monochrome coffee-cup symbol to the existing inline SVG sprite in `options/options.html`.
- Add a circular icon link to the header actions, immediately before the GitHub link.
- Reuse the existing `icon-button` and `ui-icon` styles so the control matches the GitHub and theme controls in light mode, dark mode, narrow layouts, hover states, and reduced-transparency mode.
- Open Ko-fi in a new tab with `target="_blank"` and `rel="noopener noreferrer"`.
- Provide the accessible name `Support this project on Ko-fi` and the tooltip `Support on Ko-fi`.
- Do not add JavaScript, permissions, remote assets, or new CSS unless visual verification shows an existing style cannot be reused.

The header action order will be: Ko-fi, GitHub, theme toggle.

## README Presentation

- Add a short coffee-prefixed donation link near the top of both README files, after the language switcher and before the Chrome Web Store badge.
- Use `☕ [Support this project on Ko-fi](https://ko-fi.com/joechen)` in `README.md`.
- Use `☕ [在 Ko-fi 上支持这个项目](https://ko-fi.com/joechen)` in `README.zh-CN.md`.
- Keep the link as text instead of a remote badge so rendering does not depend on a third-party image and no additional binary asset is needed.

## Behavior and Failure Handling

The settings link uses normal browser anchor navigation, and the README links use normal Markdown navigation. Ko-fi availability and navigation errors remain browser-managed; the extension does not intercept clicks or show an error state.

## Verification

Add a focused test using Node's built-in test runner. The test will read the runtime HTML and both README files and verify:

- the coffee-cup SVG symbol exists and is used by the Ko-fi header link;
- the settings link uses the exact Ko-fi URL;
- the settings link opens a new tab with both `noopener` and `noreferrer` protections;
- the settings link has an accessible name and tooltip;
- both README files contain the exact Ko-fi URL and their expected localized labels.

Follow red-green-refactor: add the test and observe the expected failure before changing the settings page or README files. After implementation, run the focused test, the full Node test discovery command, JavaScript syntax checks, and a remote-resource scan of extension runtime files.

## Out of Scope

- Donation prompts, modals, banners, analytics, or click tracking.
- Ko-fi API integration or payment handling inside the extension.
- Changes to extension permissions, background logic, or store listing copy.
