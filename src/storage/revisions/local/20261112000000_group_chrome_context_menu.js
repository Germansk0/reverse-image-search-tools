import {targetEnv} from 'utils/config';

const message = 'Replace the first-engine context menu layout';
const revision = '20261112000000_group_chrome_context_menu';

async function upgrade() {
  const changes = {storageVersion: revision};
  if (targetEnv === 'chrome') {
    const {searchAllEnginesContextMenu} = await browser.storage.local.get(
      'searchAllEnginesContextMenu'
    );
    if (searchAllEnginesContextMenu === 'first') {
      changes.searchAllEnginesContextMenu = 'sub';
    }
  }

  return browser.storage.local.set(changes);
}

export {message, revision, upgrade};
