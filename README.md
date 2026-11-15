# Reverse Image Search Tools

Find where an image appears online, look for similar images, or identify a
product using multiple reverse image search providers.

Click the toolbar icon to open the search workspace. Choose, paste, or drop an
image, or enter a direct image link. In supported desktop sidebars you can
capture an area of the active page. Preview the image, choose your engines,
and click **Search image**. Right-click a webpage image for a direct search.

New installations enable and select Google Lens, Bing, Yandex, and TinEye.
Settings also offers Baidu, Sogou, Pinterest, SauceNAO, SHEIN, and Wildberries.

## Build and test

Use the Node.js version in `.nvmrc` and run `npm ci` from the source directory.
Build with `npm run build:prod:chrome`. Load `dist/chrome` through
**Manage Extensions → Developer mode → Load unpacked**. Equivalent build
commands are available for Edge, Firefox, Opera, Safari, and Samsung Internet.
If the optional PNG optimizer cannot run, set `SKIP_PNG_OPTIMIZATION=true`.

Run logic tests with `node --test tests/*.test.js`. Install the Chromium
Playwright browser with `npx playwright install chromium`, then run
`npm run test:e2e` for the installed-extension tests. Provider responses in
these tests use local fixtures.

## License

See [LICENSE](LICENSE) and [NOTICE](NOTICE).
