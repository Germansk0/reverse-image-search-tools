import {readdir} from 'node:fs/promises';
import {expect, imageUrl, test} from './extension.js';
import packageInfo from '../../package.json' with {type: 'json'};

const releaseNames = [
  'Google Lens',
  'Bing',
  'Yandex',
  'TinEye',
  'Baidu',
  'Sogou',
  'Pinterest',
  'SauceNAO',
  'SHEIN',
  'Wildberries'
];
const releaseIds = [
  'googleLens',
  'bing',
  'yandex',
  'tineye',
  'baidu',
  'sogou',
  'pinterest',
  'saucenao',
  'shein',
  'wildberries'
];

async function previewLink(panel) {
  await panel.getByRole('textbox', {name: 'Image link'}).fill(imageUrl);
  await panel.getByRole('button', {name: 'Preview link'}).click();
  return panel.locator('#engine-selector-button');
}

async function individualMenuItems(extension) {
  const {menuItems} = await extension.readOptions('menuItems');
  return (menuItems ?? []).filter(
    id =>
      id.startsWith('search_') &&
      id.endsWith('_1') &&
      id !== 'search_allEngines_1'
  );
}

test('Chrome release selects four default engines for the first search and offers all ten', async ({
  extension
}, testInfo) => {
  const settings = await extension.context.newPage();
  await settings.goto(extension.url('options'));
  await expect(settings.locator('.engine-toggle span')).toHaveText(
    releaseNames.slice(0, 4)
  );
  await expect(settings.locator('.engine-toggle input:checked')).toHaveCount(4);
  await settings.screenshot({
    path: testInfo.outputPath('release-engine-settings.png')
  });
  await settings.getByRole('button', {name: 'Add engines'}).click();
  await expect(settings.locator('.engine-toggle span')).toHaveText(
    releaseNames
  );
  await expect(settings.locator('.engine-toggle input:checked')).toHaveCount(4);
  await settings
    .getByRole('searchbox', {name: 'Search all engines'})
    .fill('Taobao');
  await expect(
    settings.getByText('No engines match this filter.')
  ).toBeVisible();

  const panel = await extension.openPanel({width: 290, height: 420});
  await expect(panel.getByRole('button', {name: 'Choose file', exact: true})).toBeFocused();
  const engineButton = await previewLink(panel);
  await expect(engineButton).toContainText('Google Lens');
  await engineButton.click();
  const dialog = panel.getByRole('dialog');
  await expect(dialog.locator('.engine-name')).toHaveText(
    releaseNames.slice(0, 4)
  );
  for (const name of releaseNames.slice(0, 4)) {
    await expect(dialog.getByRole('checkbox', {name, exact: true})).toBeChecked();
  }
  await expect(dialog.getByRole('checkbox', {name: 'All enabled engines'})).toBeChecked();
  await expect(dialog.getByRole('button', {name: /^Done/})).toBeInViewport();
  await panel.screenshot({
    path: testInfo.outputPath('release-engine-picker.png')
  });
  await dialog.getByRole('button', {name: /^Done/}).click();
  await panel.getByRole('button', {name: 'Search image', exact: true}).click();
  await expect(panel.getByText('Opened 4 search tabs in a group.')).toBeVisible();

  await expect
    .poll(() => individualMenuItems(extension))
    .toEqual(releaseIds.slice(0, 4).map(id => `search_${id}_1`));
  const menuItemExists = id =>
    extension.worker.evaluate(
      id =>
        new Promise(resolve => {
          chrome.contextMenus.update(id, {enabled: true}, () => {
            resolve(!chrome.runtime.lastError);
          });
        }),
      id
    );
  await expect.poll(() => menuItemExists('search_wildberries_1')).toBe(false);
  expect(await menuItemExists('search_taobao_1')).toBe(false);

  await settings.getByRole('button', {name: 'Clear filter'}).click();
  await settings
    .getByRole('checkbox', {name: 'Wildberries', exact: true})
    .check();
  await engineButton.click();
  await expect(dialog.locator('.engine-name')).toHaveText([
    ...releaseNames.slice(0, 4),
    'Wildberries'
  ]);
  await expect.poll(() => menuItemExists('search_wildberries_1')).toBe(true);
  const bundles = await readdir(
    new URL('../../dist/chrome/src/engines/', import.meta.url),
    {
      withFileTypes: true
    }
  );
  expect(
    bundles.filter(entry => entry.isDirectory()).map(entry => entry.name)
  ).toEqual(expect.arrayContaining(['bing', 'sogou', 'wildberries']));
  expect(
    bundles
      .filter(entry => entry.isDirectory() && entry.name !== 'css')
      .every(entry => releaseIds.includes(entry.name))
  ).toBe(true);
});

test('Chrome release preserves saved preferences and falls back from a deferred selection', async ({
  extension
}) => {
  const engines = ['taobao', 'yandex', 'googleLens', 'kagi', 'bing'];
  const disabledEngines = ['kagi', 'yandex'];
  const sidebarEngineSelection = {mode: 'custom', engines: ['taobao']};
  const preferences = {
    appTheme: 'dark',
    searchModeAction: 'url',
    tabInBackgound: true,
    imgFullParse: false,
    detectAltImageDimension: false
  };
  await extension.worker.evaluate(saved => chrome.storage.local.set(saved), {
    appVersion: '1.2.0',
    engines,
    disabledEngines,
    sidebarEngineSelection,
    ...preferences
  });
  await extension.restart();
  await expect.poll(() => extension.readOptions('appVersion')).toEqual({appVersion: packageInfo.version});
  expect(await extension.readOptions(Object.keys(preferences))).toEqual(preferences);

  const panel = await extension.openPanel();
  const engineButton = await previewLink(panel);
  await expect(engineButton).toContainText('Google Lens');
  await expect
    .poll(() => individualMenuItems(extension))
    .toEqual(['search_googleLens_1', 'search_bing_1']);
  const settings = await extension.context.newPage();
  await settings.goto(extension.url('options'));
  await settings.getByRole('button', {name: 'Add engines'}).click();
  await expect(settings.locator('.engine-toggle span')).toHaveText([
    'Yandex',
    'Google Lens',
    'Bing'
  ]);
  await expect(
    settings.getByRole('checkbox', {name: 'Yandex', exact: true})
  ).not.toBeChecked();
  await settings.getByRole('button', {name: 'Move Bing up'}).click();

  await expect
    .poll(() =>
      extension.readOptions([
        'engines',
        'disabledEngines',
        'sidebarEngineSelection'
      ])
    )
    .toEqual({
      engines: ['taobao', 'yandex', 'bing', 'kagi', 'googleLens'],
      disabledEngines,
      sidebarEngineSelection
    });
  await expect
    .poll(() => individualMenuItems(extension))
    .toEqual(['search_bing_1', 'search_googleLens_1']);
  await expect(engineButton).toContainText('Google Lens');

  const rejected = await panel.evaluate(
    async imageUrl =>
      chrome.runtime.sendMessage({
        id: 'panelSearchSubmit',
        selectedEngines: ['taobao'],
        sourceTabId: (await chrome.tabs.getCurrent()).id,
        searchModeOverride: 'url',
        imageUrl
      }),
    imageUrl
  );
  expect(rejected).toMatchObject({accepted: false, openedCount: 0});
});
