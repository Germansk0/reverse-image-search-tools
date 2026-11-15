import {readFile} from 'node:fs/promises';
import {
  expect,
  fixtureOrigin,
  imageBytes,
  imageUrl,
  test
} from './extension.js';
import {openNativePanel} from './native-panel.js';

const engineButton = page => page.locator('#engine-selector-button');
const engineChoice = (page, name) =>
  page.getByRole('dialog').getByRole('checkbox', {name, exact: true});
const file = (name = 'sample.png', buffer = imageBytes) => ({
  name,
  mimeType: 'image/png',
  buffer
});

async function chooseOnly(page, names) {
  await engineButton(page).click();
  const all = engineChoice(page, 'All enabled engines');
  await all.check();
  await all.uncheck();
  for (const name of names) await engineChoice(page, name).check();
  await page.getByRole('button', {name: /^Done/}).click();
}

async function selectLink(page) {
  const input = page.getByRole('textbox', {name: 'Image link'});
  await input.fill(imageUrl);
  await input.press('Enter');
  const preview = page.getByRole('img', {name: 'Image URL preview'});
  await expect(preview).toBeVisible();
  await expect(preview).toHaveJSProperty('naturalWidth', 96);
}

async function screenshot(page, testInfo, name, {fullPage = false} = {}) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({path, fullPage, animations: 'disabled'});
  await testInfo.attach(name, {path, contentType: 'image/png'});
}

async function expectPanelToFit(page) {
  await expect
    .poll(() =>
      page.getByRole('main').evaluate(panel => ({
        verticalOverflow: panel.scrollHeight - panel.clientHeight,
        horizontalOverflow: panel.scrollWidth - panel.clientWidth,
        documentOverflow: document.documentElement.scrollHeight - innerHeight
      }))
    )
    .toEqual({verticalOverflow: 0, horizontalOverflow: 0, documentOverflow: 0});
}

test('the native side panel captures real pixels from the active page', async ({
  extension
}, testInfo) => {
  const source = await extension.context.newPage();
  await source.setViewportSize({width: 260, height: 400});
  await source.goto(fixtureOrigin);
  const panel = await openNativePanel(extension);
  await source.bringToFront();
  await expect
    .poll(() =>
      panel.evaluate(() => {
        const main = document.querySelector('.sidebar-prototype');
        return (
          Boolean(main?.clientHeight) && main.scrollHeight === main.clientHeight
        );
      })
    )
    .toBe(true);

  const frameOpened = source.waitForEvent('framenavigated', {
    predicate: frame => frame.url().startsWith(extension.url('capture'))
  });
  await panel.evaluate(() => {
    [...document.querySelectorAll('button')]
      .find(button => button.innerText.trim() === 'Capture area')
      .click();
  });
  const frame = await frameOpened;
  const useCapture = frame.getByRole('button', {name: 'Use capture'});
  await expect(useCapture).toBeDisabled();
  await expect(useCapture).toBeInViewport({ratio: 1});
  await expect
    .poll(() =>
      useCapture.evaluate(button => {
        const bounds = button.getBoundingClientRect();
        const toolbar = button.parentElement.getBoundingClientRect();
        return (
          toolbar.right - bounds.right >= 6 &&
          toolbar.bottom - bounds.bottom >= 6
        );
      })
    )
    .toBe(true);
  const dragBox = frame.locator('.cropper-drag-box');
  await expect(dragBox).toBeVisible();
  const {x, y, width, height} = await dragBox.boundingBox();
  await source.mouse.move(x + width * 0.45, y + height * 0.25);
  await source.mouse.down();
  await source.mouse.move(x + width * 0.7, y + height * 0.5, {steps: 8});
  await source.mouse.up();
  await expect(useCapture).toBeEnabled();
  await screenshot(source, testInfo, 'capture-toolbar');
  await useCapture.click();

  await expect
    .poll(() =>
      panel.evaluate(() => {
        const image = document.querySelector(
          'img[alt="Preview: Page capture.png"]'
        );
        if (!image?.naturalWidth) return null;
        const canvas = new OffscreenCanvas(1, 1);
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0, 1, 1);
        return [...context.getImageData(0, 0, 1, 1).data];
      })
    )
    .toEqual([0, 128, 0, 255]);

  await testInfo.attach('native-capture', {
    body: await panel.screenshot(),
    contentType: 'image/png'
  });
});

test('first-use chooser and Settings fit the intended viewports', async ({
  extension
}, testInfo) => {
  const panel = await extension.openPanel();
  await expect(panel.getByRole('button', {name: /Choose file/})).toBeVisible();
  await expect(panel.getByRole('textbox', {name: 'Image link'})).toBeVisible();
  await expect(
    panel.getByText('Link previews may contact the site.')
  ).toHaveCount(0);
  await expectPanelToFit(panel);
  await screenshot(panel, testInfo, 'first-use');

  await panel.setViewportSize({width: 290, height: 320});
  await expectPanelToFit(panel);
  const sourceButtons = await panel
    .locator('.source-shortcuts button')
    .evaluateAll(buttons =>
      buttons.map(button => {
        const {y, height} = button.getBoundingClientRect();
        const label = document.createRange();
        label.selectNodeContents(button);
        return {y, height, lines: label.getClientRects().length};
      })
    );
  expect(sourceButtons).toHaveLength(3);
  for (const {y, height, lines} of sourceButtons) {
    expect(y).toBe(sourceButtons[0].y);
    expect(height).toBe(sourceButtons[0].height);
    expect(lines).toBe(1);
  }
  await screenshot(panel, testInfo, 'first-use-short');
  const settingsOpened = extension.context.waitForEvent('page');
  await panel.getByRole('button', {name: 'Settings', exact: true}).click();
  const settings = await settingsOpened;
  await expect(
    settings.getByRole('heading', {name: 'Settings', exact: true})
  ).toBeVisible();
  await expect(
    settings.getByRole('checkbox', {name: 'Google Lens'})
  ).toBeChecked();
  await screenshot(settings, testInfo, 'settings');
  await settings.getByText('Advanced settings', {exact: true}).click();
  const focus = settings.getByRole('combobox', {
    name: 'Starting focus in the side panel'
  });
  await expect(focus).toHaveValue('browse');
  await focus.selectOption('url');
  await expect
    .poll(() => extension.readOptions('searchModeAction'))
    .toEqual({searchModeAction: 'url'});
  const reopened = await extension.openPanel();
  await expect(reopened.getByRole('textbox', {name: 'Image link'})).toBeFocused();
});

test('validates a link, previews it and opens only the selected result tabs', async ({
  extension
}, testInfo) => {
  const panel = await extension.openPanel();
  const link = panel.getByRole('textbox', {name: 'Image link'});
  await link.fill('file:///tmp/sample.png');
  await link.press('Enter');
  await expect(link).toHaveAttribute('aria-invalid', 'true');
  await expect(
    panel.getByText(/direct image link that starts with http or https/)
  ).toBeVisible();
  await screenshot(panel, testInfo, 'invalid-link');

  await selectLink(panel);
  await chooseOnly(panel, ['Bing', 'TinEye']);
  await expect(engineButton(panel)).toContainText('Bing, TinEye');
  await screenshot(panel, testInfo, 'link-ready');
  await panel.getByRole('button', {name: 'Search image', exact: true}).click();
  await expect(panel.getByText(/Opened 2 search tabs/)).toBeVisible();
  const newSearch = panel.getByRole('button', {
    name: 'New search',
    exact: true
  });
  await expect(newSearch).toBeVisible();

  await expect
    .poll(() =>
      extension.worker.evaluate(async () =>
        (await chrome.tabs.query({}))
          .filter(tab => /^https:\/\/www\.(bing|tineye)\.com\//.test(tab.url))
          .map(tab => ({url: tab.url, groupId: tab.groupId}))
      )
    )
    .toEqual(
      expect.arrayContaining([
        {
          url: expect.stringContaining('bing.com/images/search'),
          groupId: expect.any(Number)
        },
        {
          url: expect.stringContaining('tineye.com/search/'),
          groupId: expect.any(Number)
        }
      ])
    );
  const tabs = await extension.worker.evaluate(() => chrome.tabs.query({}));
  const bing = tabs.find(tab =>
    tab.url?.startsWith('https://www.bing.com/images/search')
  );
  const tineye = tabs.find(tab =>
    tab.url?.startsWith('https://www.tineye.com/search/')
  );
  expect(new URL(tineye.url).searchParams.get('url')).toBe(imageUrl);
  expect(new URL(bing.url).searchParams.get('q')).toBe(`imgurl:${imageUrl}`);
  expect(bing.groupId).toBeGreaterThanOrEqual(0);
  expect(tineye.groupId).toBe(bing.groupId);
  expect(
    tabs.some(tab => tab.url?.startsWith('https://lens.google.com/'))
  ).toBe(false);
  await expect
    .poll(() =>
      extension.worker.evaluate(
        async () =>
          (await chrome.tabs.query({active: true, lastFocusedWindow: true}))[0]
            ?.groupId
      )
    )
    .toBe(bing.groupId);
  await newSearch.press('Enter');
  await expect(link).toBeVisible();
  await expect(link).toBeFocused();
  await expect(link).toHaveValue('');
  await expect(panel.getByRole('img', {name: 'Image URL preview'})).toHaveCount(
    0
  );
  const afterReset = await extension.worker.evaluate(() =>
    chrome.tabs.query({})
  );
  expect(
    afterReset
      .filter(tab => /^https:\/\/www\.(bing|tineye)\.com\//.test(tab.url))
      .map(tab => tab.id)
      .sort()
  ).toEqual([bing.id, tineye.id].sort());
  await selectLink(panel);
  await expect(engineButton(panel)).toContainText('Bing, TinEye');
});

test('background searches leave the active tab in place and open the requested results', async ({
  extension
}) => {
  await extension.worker.evaluate(() =>
    chrome.storage.local.set({tabInBackgound: true})
  );
  const panel = await extension.openPanel();
  await selectLink(panel);
  await chooseOnly(panel, ['Bing']);
  await panel.bringToFront();
  await panel.getByRole('button', {name: 'Search image', exact: true}).click();
  await expect(panel.getByRole('button', {name: 'New search'})).toBeVisible();
  await expect
    .poll(() =>
      extension.worker.evaluate(
        async () =>
          (await chrome.tabs.query({active: true, lastFocusedWindow: true}))[0]
            ?.url
      )
    )
    .toBe(panel.url());
  await expect
    .poll(() =>
      extension.worker.evaluate(async () =>
        (await chrome.tabs.query({})).some(tab =>
          tab.url?.startsWith('https://www.bing.com/images/search')
        )
      )
    )
    .toBe(true);
});

test('an upload-only engine can keep its selection when changing a link to a file', async ({
  extension
}, testInfo) => {
  await extension.worker.evaluate(() =>
    chrome.storage.local.set({engines: ['bing', 'baidu'], disabledEngines: []})
  );
  const panel = await extension.openPanel({width: 290, height: 320});
  await selectLink(panel);
  await chooseOnly(panel, ['Baidu']);
  await expect(panel.getByText('Baidu requires a file upload.')).toBeVisible();
  await expect(engineButton(panel)).toBeFocused();
  await expectPanelToFit(panel);
  await screenshot(panel, testInfo, 'upload-only-link');

  await panel.keyboard.press('Tab');
  const upload = panel.getByRole('button', {name: 'Upload image'});
  await expect(upload).toBeFocused();
  const chooser = panel.waitForEvent('filechooser');
  await upload.press('Enter');
  await (await chooser).setFiles(file());
  await expect(
    panel.getByRole('img', {name: 'Preview: sample.png'})
  ).toBeVisible();
  await expect(engineButton(panel)).toContainText('Baidu');
  await expect(
    panel.getByRole('button', {name: 'Search image', exact: true})
  ).toBeFocused();
  await expectPanelToFit(panel);
});

test('filters the full engine catalogue and returns focus to the panel at a short height', async ({
  extension
}, testInfo) => {
  await extension.worker.evaluate(() =>
    chrome.storage.local.set({disabledEngines: [], showEngineIcons: false})
  );
  const panel = await extension.openPanel({width: 290, height: 320});
  await panel.locator('input[type=file]').setInputFiles(file());
  await expect(
    panel.getByRole('img', {name: 'Preview: sample.png'})
  ).toBeVisible();
  const selector = engineButton(panel);
  await selector.press('Enter');
  const dialog = panel.getByRole('dialog');
  const filter = dialog.getByRole('searchbox', {
    name: 'Filter enabled search engines'
  });
  const done = dialog.getByRole('button', {name: /^Done/});
  const manage = dialog.getByRole('button', {name: 'Manage engines'});
  await expect(filter).toBeFocused();
  await filter.press('Shift+Tab');
  await expect(manage).toBeFocused();
  await manage.press('Shift+Tab');
  await expect(done).toBeFocused();
  await done.press('Tab');
  await expect(manage).toBeFocused();
  await manage.press('Tab');
  await expect(filter).toBeFocused();

  const alignedRows = await dialog
    .locator('.engine-choice-grid .engine-row')
    .evaluateAll(
      rows => new Set(rows.map(row => row.getBoundingClientRect().height)).size
    );
  expect(alignedRows).toBe(1);
  const auTradeMarks = engineChoice(panel, 'Australian Trade Mark Search');
  await expect(auTradeMarks.locator('..')).toHaveAttribute(
    'title',
    'Australian Trade Mark Search'
  );
  await filter.fill('Australian');
  await expect(auTradeMarks).toBeVisible();
  await expect(dialog.locator('.engine-choice-grid .engine-name')).toHaveText([
    'Australian Trade Mark Search',
    'Australian Design Search'
  ]);
  const icon = auTradeMarks.locator('..').locator('img');
  await expect(icon).toBeHidden();
  await screenshot(panel, testInfo, 'original-engine-names');
  await panel.setViewportSize({width: 420, height: 680});
  await expect(icon).toBeVisible();
  await expect.poll(() => icon.evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
  await panel.setViewportSize({width: 290, height: 320});
  await filter.fill('');

  await panel.keyboard.insertText('Madrid Monitor');
  await expect(engineChoice(panel, 'Madrid Monitor')).toBeInViewport({
    ratio: 1
  });
  await expect(done).toBeInViewport({ratio: 1});
  await expect(dialog.locator('.engine-choice-grid input')).toHaveCount(1);
  await expect
    .poll(() => dialog.evaluate(el => el.scrollHeight - el.clientHeight))
    .toBe(0);
  await screenshot(panel, testInfo, 'filtered-engines-short');
  await filter.press('Escape');
  await expect(filter).toHaveValue('');
  await filter.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(selector).toBeFocused();
  await expectPanelToFit(panel);
});

test('previews uploaded files and delivers unchanged bytes to the provider input', async ({
  extension
}, testInfo) => {
  const panel = await extension.openPanel();
  const chooserOpened = panel.waitForEvent('filechooser');
  await panel.getByRole('button', {name: /Choose file/}).click();
  await (await chooserOpened).setFiles(file());
  await expect(
    panel.getByRole('img', {name: 'Preview: sample.png'})
  ).toBeVisible();
  await chooseOnly(panel, ['TinEye']);
  await screenshot(panel, testInfo, 'upload-ready');

  const resultOpened = extension.context.waitForEvent('page');
  await panel.getByRole('button', {name: 'Search image', exact: true}).click();
  const result = await resultOpened;
  const upload = result.locator('input#upload-box');
  await expect
    .poll(() => upload.evaluate(input => input.files[0]?.name))
    .toBe('sample.png');
  const bytes = await upload.evaluate(async input =>
    Array.from(new Uint8Array(await input.files[0].arrayBuffer()))
  );
  expect(Buffer.from(bytes)).toEqual(imageBytes);
  await expect(panel.getByText('Opened 1 search tab.')).toBeVisible();
});

test('persists settings and selected engines across a browser restart', async ({
  extension
}, testInfo) => {
  const panel = await extension.openPanel();
  await selectLink(panel);
  await chooseOnly(panel, ['TinEye']);
  await expect
    .poll(() => extension.readOptions('sidebarEngineSelection'))
    .toEqual({
      sidebarEngineSelection: {mode: 'custom', engines: ['tineye']}
    });

  await engineButton(panel).click();
  const settingsOpened = extension.context.waitForEvent('page');
  await panel.getByRole('button', {name: 'Manage engines'}).click();
  const settings = await settingsOpened;
  await settings.getByRole('checkbox', {name: 'Yandex', exact: true}).click();
  await expect(settings.getByText('Yandex disabled.')).toBeVisible();
  await settings.getByRole('button', {name: 'Undo', exact: true}).click();
  await expect(
    settings.getByRole('checkbox', {name: 'Yandex', exact: true})
  ).toBeChecked();
  await settings.getByRole('checkbox', {name: 'Yandex', exact: true}).click();
  await settings.getByRole('button', {name: 'Move TinEye up'}).click();
  await settings.getByRole('combobox', {name: 'Theme'}).selectOption('dark');
  await expect
    .poll(() =>
      extension.readOptions(['appTheme', 'disabledEngines', 'engines'])
    )
    .toMatchObject({
      appTheme: 'dark',
      disabledEngines: expect.arrayContaining(['yandex'])
    });
  await expect
    .poll(async () => {
      const {engines} = await extension.readOptions('engines');
      return engines.indexOf('tineye') < engines.indexOf('bing');
    })
    .toBe(true);

  await extension.restart();
  await expect
    .poll(() =>
      extension.readOptions([
        'appTheme',
        'disabledEngines',
        'sidebarEngineSelection'
      ])
    )
    .toMatchObject({
      appTheme: 'dark',
      disabledEngines: expect.arrayContaining(['yandex']),
      sidebarEngineSelection: {mode: 'custom', engines: ['tineye']}
    });
  const reopened = await extension.openPanel();
  await expect(reopened.locator('.vn-app')).toHaveClass(/theme-dark/);
  await selectLink(reopened);
  await expect(engineButton(reopened)).toContainText('TinEye');
  await engineButton(reopened).click();
  await expect(engineChoice(reopened, 'TinEye')).toBeChecked();
  await expect(engineChoice(reopened, 'Bing')).not.toBeChecked();
  await expect(engineChoice(reopened, 'Yandex')).toHaveCount(0);
  await screenshot(reopened, testInfo, 'engines-dark');
});

test('Chrome registers the grouped menu and updates it from Settings', async ({
  extension
}, testInfo) => {
  const hasMenuItem = id =>
    extension.worker.evaluate(
      id =>
        new Promise(resolve => {
          // Update an already enabled item to check that Chromium registered it.
          chrome.contextMenus.update(id, {enabled: true}, () => {
            resolve(!chrome.runtime.lastError);
          });
        }),
      id
    );
  const pageItems = async () => {
    const {menuItems} = await extension.readOptions('menuItems');
    return menuItems?.filter(id => id.endsWith('_1'));
  };
  const menuOrder = [
    'view_1', 'sep_1', 'search_allEngines_1', 'sep_allEngines_1',
    'search_googleLens_1', 'search_bing_1', 'search_yandex_1', 'search_tineye_1'
  ];
  await expect.poll(pageItems).toEqual(menuOrder);
  for (const id of menuOrder) {
    await expect.poll(() => hasMenuItem(id)).toBe(true);
  }

  const settings = await extension.context.newPage();
  await settings.goto(extension.url('options'));
  const menu = settings.getByRole('combobox', {name: 'Menu layout'});
  await expect(menu).toHaveValue('sub');
  await expect(menu.locator('option')).toHaveText([
    'Off', 'All and individual engines', 'All engines only', 'Individual engines only'
  ]);
  await settings.getByRole('button', {name: 'Move Bing up'}).press('Enter');
  await expect(
    settings.getByRole('button', {name: 'Move Bing down'})
  ).toBeFocused();
  await expect.poll(pageItems).toEqual([
    ...menuOrder.slice(0, 4), 'search_bing_1', 'search_googleLens_1',
    ...menuOrder.slice(6)
  ]);
  await screenshot(settings, testInfo, 'settings-right-click');

  await menu.selectOption('off');
  await expect.poll(() => hasMenuItem('view_1')).toBe(false);
  await expect.poll(() => hasMenuItem('search_allEngines_1')).toBe(false);
  await expect
    .poll(() =>
      extension.readOptions([
        'showInContextMenu',
        'searchAllEnginesContextMenu'
      ])
    )
    .toEqual({showInContextMenu: false, searchAllEnginesContextMenu: 'sub'});

  await menu.selectOption('main');
  await expect.poll(pageItems).toEqual(['view_1', 'sep_1', 'search_allEngines_1']);
  await expect.poll(() => hasMenuItem('search_allEngines_1')).toBe(true);
  await settings.reload();
  await expect(menu).toHaveValue('main');
  await menu.selectOption('false');
  await expect.poll(() => hasMenuItem('search_allEngines_1')).toBe(false);
  await expect.poll(() => hasMenuItem('search_bing_1')).toBe(true);
});

test('Chrome migrates a saved first-engine menu and preserves its off state', async ({
  extension
}) => {
  await extension.worker.evaluate(() =>
    chrome.storage.local.set({
      storageVersion: '20251203085001_add_yandexhost',
      searchAllEnginesContextMenu: 'first',
      showInContextMenu: false,
      viewImageContextMenu: false
    })
  );
  await extension.restart();
  await expect
    .poll(() =>
      extension.readOptions([
        'searchAllEnginesContextMenu',
        'showInContextMenu',
        'viewImageContextMenu'
      ])
    )
    .toEqual({
      searchAllEnginesContextMenu: 'sub',
      showInContextMenu: false,
      viewImageContextMenu: false
    });
  const settings = await extension.context.newPage();
  await settings.goto(extension.url('options'));
  const menu = settings.getByRole('combobox', {name: 'Menu layout'});
  await expect(menu).toHaveValue('off');
  await menu.selectOption('sub');
  await expect(settings.getByRole('combobox', {name: 'Open image'})).toHaveValue('off');
});

test('upgrading removes Lenso from the saved engine list, selection, and menus', async ({
  extension
}) => {
  await extension.worker.evaluate(async () => {
    const {menuItems} = await chrome.storage.local.get('menuItems');
    await new Promise((resolve, reject) =>
      chrome.contextMenus.create(
        {id: 'search_lenso_1', title: 'Lenso.ai', contexts: ['image']},
        () => chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve()
      )
    );
    await chrome.storage.local.set({
      storageVersion: '20261112000000_group_chrome_context_menu',
      engines: ['pinterest', 'lenso', 'tineye', 'bing'],
      disabledEngines: ['lenso', 'bing'],
      sidebarEngineSelection: {mode: 'custom', engines: ['pinterest', 'lenso']},
      menuItems: [...menuItems, 'search_lenso_1']
    });
  });
  await extension.restart();
  await expect
    .poll(() =>
      extension.readOptions(['engines', 'disabledEngines', 'sidebarEngineSelection'])
    )
    .toEqual({
      engines: ['pinterest', 'tineye', 'bing'],
      disabledEngines: ['bing'],
      sidebarEngineSelection: {mode: 'custom', engines: ['pinterest']}
    });
  await expect
    .poll(async () => (await extension.readOptions('menuItems')).menuItems)
    .toEqual(expect.arrayContaining(['search_pinterest_1', 'search_tineye_1']));
  expect((await extension.readOptions('menuItems')).menuItems).not.toContain('search_lenso_1');
  expect(
    await extension.worker.evaluate(() => new Promise(resolve =>
      chrome.contextMenus.update('search_lenso_1', {enabled: true}, () => {
        resolve(Boolean(chrome.runtime.lastError));
      })
    ))
  ).toBe(true);

  const settings = await extension.context.newPage();
  await settings.goto(extension.url('options'));
  await settings.getByRole('button', {name: 'Add engines'}).click();
  await settings.getByRole('searchbox', {name: 'Search all engines'}).fill('lenso');
  await expect(settings.getByText('No engines match this filter.')).toBeVisible();
});

test('Chrome groups right-click preferences with the commands they affect', async ({
  extension
}, testInfo) => {
  const settings = await extension.context.newPage();
  await settings.setViewportSize({width: 1040, height: 780});
  await settings.goto(extension.url('options'));
  await settings.getByText('Advanced settings', {exact: true}).click();
  await expect(settings.getByLabel('Show search engine icons')).toHaveCount(0);
  const openImage = settings.getByRole('combobox', {name: 'Open image'});
  await expect(openImage).toHaveValue('viewer');
  await expect(openImage).toHaveAccessibleDescription(
    'Show Open image in the right-click menu and choose where it opens.'
  );
  await openImage.selectOption('off');
  await settings.getByText('Advanced menu options', {exact: true}).click();
  await expect(
    settings.getByText('Confirm images from clipboard', {exact: true})
  ).toHaveCount(0);
  const menu = settings.locator('.section-context-menu');
  const imageInput = menu.getByRole('combobox', {name: 'Image input'});
  const nearby = menu.getByLabel('Look for nearby images');
  const sizes = menu.getByLabel('Find alternate image sizes');
  const upload = menu.getByLabel('Upload to engines that may block links');
  await expect(nearby).toBeChecked();
  await expect(sizes).toBeChecked();
  await nearby.uncheck();
  await sizes.uncheck();
  await expect
    .poll(() => extension.readOptions(['imgFullParse', 'detectAltImageDimension']))
    .toEqual({imgFullParse: false, detectAltImageDimension: false});
  await nearby.check();
  await sizes.check();
  await upload.uncheck();
  await expect
    .poll(() =>
      extension.readOptions([
        'imgFullParse',
        'detectAltImageDimension',
        'bypassImageHostBlocking'
      ])
    )
    .toEqual({
      imgFullParse: true,
      detectAltImageDimension: true,
      bypassImageHostBlocking: false
    });
  const controls = settings.locator(
    '.settings-card select:visible, .settings-card .option input:visible'
  );
  expect(await controls.count()).toBeGreaterThan(8);
  for (const control of await controls.all()) {
    await expect(control).toHaveAccessibleDescription(/\S/);
  }
  await expect(upload).toHaveAccessibleDescription(
    'Send the image file instead of its link to certain engines.'
  );
  await expect(imageInput).toHaveAccessibleDescription(
    'Choose how the extension gets the image from the page.'
  );
  await screenshot(settings, testInfo, 'settings-advanced', {fullPage: true});
  await settings.setViewportSize({width: 290, height: 680});
  await expect
    .poll(() => settings.evaluate(() => document.documentElement.scrollWidth))
    .toBe(290);
  await expect(
    settings.getByText(
      'Send the image file instead of its link to certain engines.'
    )
  ).toBeVisible();
  await screenshot(settings, testInfo, 'settings-compact', {fullPage: true});

  await imageInput.selectOption('selectImage');
  await expect(nearby).toBeChecked();
  await expect(upload).toHaveCount(0);
  await imageInput.selectOption('capture');
  await expect(nearby).toHaveCount(0);
  await expect(sizes).toHaveCount(0);

  await openImage.selectOption('tab');
  await expect(nearby).toBeChecked();
  await expect(sizes).toBeChecked();
  await expect
    .poll(() =>
      extension.readOptions(['viewImageContextMenu', 'viewImageUseViewer'])
    )
    .toEqual({viewImageContextMenu: true, viewImageUseViewer: false});
  await openImage.selectOption('viewer');
  await expect
    .poll(() => extension.readOptions('viewImageUseViewer'))
    .toEqual({viewImageUseViewer: true});
  await openImage.selectOption('off');
  await expect(nearby).toHaveCount(0);
  await expect(sizes).toHaveCount(0);
  await imageInput.selectOption('selectUrl');
  await expect(upload).toBeVisible();
  await expect(upload).not.toBeChecked();
});

test('Chrome shows advanced provider preferences when their engines are enabled', async ({
  extension
}, testInfo) => {
  const {engines} = await extension.readOptions('engines');
  const disabledEngines = engines.filter(
    engine => !['googleLens', 'yandex', 'tineye'].includes(engine)
  );
  await extension.worker.evaluate(
    disabledEngines => chrome.storage.local.set({disabledEngines}),
    disabledEngines
  );
  const settings = await extension.context.newPage();
  await settings.setViewportSize({width: 400, height: 780});
  await settings.goto(extension.url('options'));
  const advanced = settings.getByText('Advanced settings', {exact: true});
  const google = settings.getByLabel('Let Google choose the region');
  const yandex = settings.getByRole('combobox', {name: 'Yandex site'});
  const engine = name => settings.getByRole('checkbox', {name, exact: true});

  await advanced.click();
  await google.uncheck();
  await yandex.selectOption('yandex_ru');
  await expect
    .poll(() => extension.readOptions(['localGoogle', 'yandexHost']))
    .toEqual({localGoogle: false, yandexHost: 'yandex_ru'});
  await engine('Google Lens').click();
  await expect(google).toHaveCount(0);
  await expect(yandex).toBeVisible();
  await engine('Yandex').click();
  await expect(yandex).toHaveCount(0);
  await expect
    .poll(() => extension.readOptions('disabledEngines'))
    .toEqual({disabledEngines: [...disabledEngines, 'googleLens', 'yandex']});

  await settings.reload();
  await advanced.click();
  await expect(google).toHaveCount(0);
  await expect(yandex).toHaveCount(0);
  const path = testInfo.outputPath('settings-tineye-only.png');
  await settings.locator('.section-misc').screenshot({path, animations: 'disabled'});
  await testInfo.attach('settings-tineye-only', {path, contentType: 'image/png'});

  await settings.getByRole('button', {name: 'Add engines'}).click();
  const filter = settings.getByRole('searchbox', {name: 'Search all engines'});
  await filter.fill('Google Lens');
  await engine('Google Lens').check();
  await expect(google).toBeVisible();
  await expect(google).not.toBeChecked();
  await filter.fill('Yandex');
  await engine('Yandex').check();
  await expect(yandex).toBeVisible();
  await expect(yandex).toHaveValue('yandex_ru');
});

test('a click on Preview link explains invalid input and returns focus', async ({
  extension
}, testInfo) => {
  const panel = await extension.openPanel();
  const link = panel.getByRole('textbox', {name: 'Image link'});
  await link.fill('file:///tmp/sample.png');
  const preview = panel.getByRole('button', {name: 'Preview link'});
  await expect(preview).toBeEnabled();
  await preview.click();
  await expect(link).toBeFocused();
  await expect(link).toHaveAttribute('aria-invalid', 'true');
  await expect(link).toHaveAccessibleDescription(/direct image link/);
  await screenshot(panel, testInfo, 'link-recovery');
  await selectLink(panel);
});

test('New search clears a link before submitting and returns focus to image entry', async ({
  extension
}, testInfo) => {
  const panel = await extension.openPanel({width: 290, height: 320});
  const link = panel.getByRole('textbox', {name: 'Image link'});
  const newSearch = panel.getByRole('button', {
    name: 'New search',
    exact: true
  });
  await selectLink(panel);
  await expect(newSearch).toHaveCount(1);
  await screenshot(panel, testInfo, 'new-search-link');
  await newSearch.press('Enter');
  await expect(link).toBeFocused();
  await expect(link).toHaveValue('');
  await expect(panel.getByRole('img', {name: 'Image URL preview'})).toHaveCount(
    0
  );
  await expect(engineButton(panel)).toBeHidden();
  await expectPanelToFit(panel);
  await selectLink(panel);
  await expect(
    panel.getByRole('button', {name: 'Search image', exact: true})
  ).toBeEnabled();
});

test('New search clears the entire batch and its warning in one step', async ({
  extension
}, testInfo) => {
  const panel = await extension.openPanel({width: 290, height: 320});
  const choose = panel.getByRole('button', {name: 'Choose file'});
  await panel
    .locator('input[type=file]')
    .setInputFiles([
      file(),
      file('second.png'),
      {name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Notes')}
    ]);
  const warning = panel.getByText(/1 file was not usable/);
  await expect(warning).toBeVisible();
  const thumbnails = panel.getByRole('group', {name: 'Image previews'});
  await expect(thumbnails.getByRole('button')).toHaveCount(2);
  await expect(panel.getByRole('button', {name: /^Remove image/})).toHaveCount(
    0
  );
  await expectPanelToFit(panel);
  await screenshot(panel, testInfo, 'new-search-batch');
  await panel
    .getByRole('button', {name: 'New search', exact: true})
    .press('Enter');
  await expect(choose).toBeFocused();
  await expect(thumbnails).toHaveCount(0);
  await expect(warning).toHaveCount(0);
  await expectPanelToFit(panel);
});

test('a fresh file error explains what to do and supports choosing again', async ({
  extension
}, testInfo) => {
  const panel = await extension.openPanel();
  const upload = panel.locator('input[type=file]');
  await upload.setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Example text file')
  });
  await expect(
    panel
      .getByRole('status')
      .filter({hasText: 'Choose an image file and try again.'})
  ).toBeVisible();
  await expect(panel.getByRole('button', {name: /Choose file/})).toBeFocused();
  await screenshot(panel, testInfo, 'file-recovery');
  await upload.setInputFiles(file());
  await expect(
    panel.getByRole('img', {name: 'Preview: sample.png'})
  ).toBeVisible();
});

test('three-file preview and results fit a short side panel', async ({
  extension
}, testInfo) => {
  const panel = await extension.openPanel({width: 290, height: 320});
  const [second, third] = await Promise.all([
    readFile(
      new URL('../../src/assets/icons/engines/tineye.png', import.meta.url)
    ),
    readFile(
      new URL('../../src/assets/icons/engines/whatanime.png', import.meta.url)
    )
  ]);
  await panel
    .locator('input[type=file]')
    .setInputFiles([
      file(),
      file('second.png', second),
      file('third.png', third)
    ]);
  await expect(
    panel.getByRole('img', {name: 'Preview: sample.png'})
  ).toBeVisible();
  const thumbnails = panel.getByRole('group', {name: 'Image previews'});
  await expect(thumbnails.getByRole('button')).toHaveCount(3);
  const thirdThumbnail = thumbnails.getByRole('button', {name: 'third.png'});
  await thirdThumbnail.press('Enter');
  await expect(thirdThumbnail).toHaveAttribute('aria-pressed', 'true');
  await expect(
    panel.getByRole('img', {name: 'Preview: third.png'})
  ).toBeVisible();
  await chooseOnly(panel, ['TinEye']);
  await expectPanelToFit(panel);
  await screenshot(panel, testInfo, 'short-ready');
  await panel
    .getByRole('button', {name: 'Search 3 images', exact: true})
    .click();
  await expect(panel.getByText(/Opened 3 search tabs/)).toBeVisible();
  await expect(
    panel.getByRole('button', {name: 'New search'})
  ).toBeInViewport();
  await expectPanelToFit(panel);
  await screenshot(panel, testInfo, 'short-results');
});

test('skipped files and search actions stay visible in a short side panel', async ({
  extension
}, testInfo) => {
  const panel = await extension.openPanel({width: 290, height: 320});
  await panel.locator('input[type=file]').setInputFiles([
    file(),
    {
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Example text file')
    },
    file('second.png')
  ]);
  await expect(panel.getByText(/1 file was not usable/)).toBeVisible();
  await chooseOnly(panel, ['TinEye']);
  await expectPanelToFit(panel);
  await panel
    .getByRole('button', {name: 'Search 2 images', exact: true})
    .click();
  await expect(panel.getByText(/Opened 2 search tabs/)).toBeVisible();
  await expectPanelToFit(panel);
  await screenshot(panel, testInfo, 'short-partial-upload');
});

test('a dropped batch with a skipped file and bulk confirmation fits a short side panel', async ({
  extension
}, testInfo) => {
  await extension.worker.evaluate(() =>
    chrome.storage.local.set({
      disabledEngines: [],
      sidebarEngineSelection: {mode: 'all'}
    })
  );
  const panel = await extension.openPanel({width: 290, height: 260});
  const dataTransfer = await panel.evaluateHandle(bytes => {
    const transfer = new DataTransfer();
    for (const name of ['first.png', 'second.png']) {
      transfer.items.add(
        new File([new Uint8Array(bytes)], name, {type: 'image/png'})
      );
    }
    transfer.items.add(new File(['Notes'], 'notes.txt', {type: 'text/plain'}));
    return transfer;
  }, Array.from(imageBytes));
  await panel.getByRole('main').dispatchEvent('drop', {dataTransfer});
  await expect(panel.getByText(/1 file was not usable/)).toBeVisible();
  const {engines} = await extension.readOptions('engines');
  await expect(
    engineButton(panel).getByText(`+${engines.length - 1}`, {exact: true})
  ).toBeInViewport({ratio: 1});
  const search = panel.getByRole('button', {
    name: 'Search 2 images',
    exact: true
  });
  await expectPanelToFit(panel);
  await search.press('Enter');
  const confirm = panel.getByRole('button', {name: 'Open tabs'});
  await expect(confirm).toBeFocused();
  await expect(confirm).toBeInViewport({ratio: 1});
  await expect(
    panel.getByText(`Send to engines? Up to ${engines.length * 2} tabs.`)
  ).toBeInViewport({ratio: 1});
  await expect(
    panel.getByRole('img', {name: 'Preview: first.png'})
  ).toBeInViewport({ratio: 1});
  await expectPanelToFit(panel);
  await screenshot(panel, testInfo, 'short-bulk-confirmation');
  await confirm.press('Escape');
  await expect(search).toBeFocused();
  await expectPanelToFit(panel);
});
