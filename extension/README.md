# Hemma — Pure Chrome Extension

This directory contains the browser-only version of Hemma for Chrome on Windows.

## Build

From the repository root:

```bash
node extension/build.mjs
```

The loadable extension is written to `extension/dist/`.

## Install in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select `extension/dist`.
5. Open a new tab.

The extension replaces Chrome's New Tab page with Hemma.

## Pure-extension differences

- No Node.js, Express, Docker, or SQLite are required.
- Items, categories, settings, wallpapers, and backup data are stored locally in Chrome.
- HTTP/HTTPS availability checks run from the extension service worker.
- ICMP and raw TCP checks are not available in a pure browser extension and are represented as HTTP checks.
- The old network speed test that depended on the Hemma server is disabled in this build.
- Server-side favicon discovery is replaced by browser-native/site favicon URLs where possible.
- Monitoring history is stored locally by the extension service worker.

The original self-hosted deployment remains unchanged.
