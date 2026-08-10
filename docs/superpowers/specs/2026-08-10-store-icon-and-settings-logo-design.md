# Store Icon and Settings Logo Design

## Goal

Use the current WebDAV Image Saver icon consistently in the Chrome Web Store and in the settings page header. The work must not introduce a second visual variant or change the existing icon artwork.

## Store Icon

- Create `store-assets/store-icon-128.png` as a 128×128 RGBA PNG.
- Use `icons/icon128.png` as the only source.
- Preserve every source pixel, including the transparent corners; the store asset must be byte-for-byte identical to the source icon.
- Do not add text, padding, borders, shadows, backgrounds, color adjustments, or compression changes.

## Settings Header Logo

- Replace the cloud-upload SVG inside `.logo-icon` with an image that loads `../icons/icon48.png`.
- Keep the rendered logo box at 42×42 CSS pixels so the existing header alignment and spacing do not change.
- Treat the image as decorative because the adjacent heading already provides the accessible name.
- Remove the wrapper background, border, shadow, and backdrop filters so the app icon does not appear inside a second rounded container.
- Do not alter the title, subtitle, header actions, responsive layout, or light/dark theme behavior.

## Files

- Add `store-assets/store-icon-128.png`.
- Update `options/options.html`.
- Update `options/options.css`.
- Reuse `icons/icon128.png` and `icons/icon48.png`; do not create additional icon variants.

## Validation

- Confirm the store asset is exactly 128×128, RGBA, and has transparent corner pixels.
- Confirm the store asset and `icons/icon128.png` have identical checksums.
- Confirm the settings page references a packaged local image and no remote resource.
- Confirm the logo is rendered at 42×42 CSS pixels without the previous wrapper decoration.
- Parse the manifest and check the working tree for whitespace errors.
