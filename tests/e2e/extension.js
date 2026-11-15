import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {chromium, expect, test as base} from '@playwright/test';

const extensionPath = path.resolve(import.meta.dirname, '../../dist/chrome');
export const fixtureOrigin = 'https://images.example.test';
export const imageUrl = `${fixtureOrigin}/image.png?size=original&name=a%20b`;
export const imageBytes = await readFile(
  new URL('../../src/assets/icons/engines/iqdb.png', import.meta.url)
);

export const test = base.extend({
  extension: async ({}, use, testInfo) => {
    const profile = await mkdtemp(path.join(tmpdir(), 'rist-chromium-'));
    const diagnostics = [];
    let context;
    let worker;
    let origin;

    async function launch() {
      context = await chromium.launchPersistentContext(profile, {
        channel: 'chromium',
        viewport: null,
        headless: !process.env.PW_HEADED,
        colorScheme: 'light',
        args: [
          '--lang=en-US',
          '--window-size=1280,900',
          '--no-proxy-server',
          '--host-resolver-rules=MAP * ~NOTFOUND',
          `--disable-extensions-except=${extensionPath}`,
          `--load-extension=${extensionPath}`
        ]
      });

      context.on('weberror', error =>
        diagnostics.push({
          level: 'uncaught',
          url: error.page()?.url(),
          message: String(error.error())
        })
      );
      context.on('console', entry => {
        if (['error', 'warning'].includes(entry.type())) {
          diagnostics.push({
            level: entry.type(),
            url: entry.location().url || entry.page()?.url(),
            message: entry.text()
          });
        }
      });

      // Keep the extension's Chrome APIs real and stub only external HTTP(S).
      await context.route(/^https?:/, route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin === fixtureOrigin && url.pathname === '/image.png') {
          return route.fulfill({contentType: 'image/png', body: imageBytes});
        }
        if (request.resourceType() === 'document') {
          const body =
            url.hostname === 'www.tineye.com'
              ? '<title>TinEye fixture</title><input id="upload-box" type="file">'
              : url.origin === fixtureOrigin
                ? '<title>Image fixture</title><body style="background:#008000"><img src="/image.png" alt="Fixture image" width="160" height="160"></body>'
                : '<title>External fixture</title>';
          return route.fulfill({contentType: 'text/html', body});
        }
        return route.fulfill({status: 204});
      });

      worker =
        context
          .serviceWorkers()
          .find(item => item.url().startsWith('chrome-extension:')) ??
        (await context.waitForEvent('serviceworker', {
          predicate: item => item.url().startsWith('chrome-extension:'),
          timeout: 10000
        }));
      origin = `chrome-extension://${new URL(worker.url()).hostname}`;
      await expect
        .poll(() =>
          worker.evaluate(
            async () =>
              (await chrome.sidePanel.getPanelBehavior()).openPanelOnActionClick
          )
        )
        .toBe(true);
    }

    async function readOptions(keys) {
      return worker.evaluate(keys => chrome.storage.local.get(keys), keys);
    }

    try {
      await launch();
      await expect
        .poll(() => readOptions('sidebarEngineSelection'), {timeout: 12000})
        .toEqual({sidebarEngineSelection: {mode: 'all'}});

      await use({
        get context() {
          return context;
        },
        get worker() {
          return worker;
        },
        url(relativePath) {
          return `${origin}/src/${relativePath}/index.html`;
        },
        readOptions,
        async openPanel(viewport = {width: 360, height: 680}) {
          const page = await context.newPage();
          await page.setViewportSize(viewport);
          await page.goto(`${origin}/src/sidepanel/index.html`);
          await expect(
            page.getByRole('heading', {name: 'Find image matches'})
          ).toBeVisible();
          return page;
        },
        async restart() {
          await context.close();
          await launch();
        }
      });
    } finally {
      await context?.close();
      const log = testInfo.outputPath('browser-log.json');
      await writeFile(log, JSON.stringify(diagnostics, null, 2));
      await testInfo.attach('browser-log', {
        path: log,
        contentType: 'application/json'
      });
      await rm(profile, {recursive: true, force: true});
      expect(
        diagnostics.filter(
          entry =>
            entry.level === 'uncaught' ||
            (entry.level === 'error' &&
              entry.url?.startsWith('chrome-extension:'))
        )
      ).toEqual([]);
    }
  }
});

export {expect};
