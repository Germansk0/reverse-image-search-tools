# Chromium extension tests

From the source directory, use the Node version in `.nvmrc`.

```sh
npm ci
npx playwright install chromium
npm run test:e2e
```

The test command runs the full catalogue suite, then rebuilds `dist/chrome` with the Chrome release lineup and tests that package. Both suites load the extension unpacked in fresh Chromium profiles. Use `npm run test:e2e:release` for the release checks alone or `PW_HEADED=1 npm run test:e2e` to see the browser. Reports, screenshots, and browser logs are under `artifacts/chromium-report`, `artifacts/chromium`, and `artifacts/chromium-release`.

The Chrome toolbar action is configured to open the side panel. The native panel test opens that browser surface through Chrome’s gesture-gated API and uses Playwright to select a crop on the active tab. The remaining panel tests load the same extension document in a tab so Playwright can exercise controls and resize the viewport. The background service worker, extension storage, file chooser, tab groups, and provider adapter run with Chrome’s real APIs. HTTP fixtures stand in for image hosts and provider pages.

The right-click settings test checks whether Chromium registered the expected command after reordering engines and toggling the menu. Selecting a command in Chrome’s native menu requires a separate manual check.

Run the existing logic tests with `node --test tests/*.test.js`.
