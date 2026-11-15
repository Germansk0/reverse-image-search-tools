import {getDayPrecisionEpoch} from 'utils/common';

const message = 'Add theme support';

const revision = '20230415111029_add_theme_support';

async function upgrade() {
  const changes = {
    appTheme: 'auto', // auto, light, dark
    showEngineIcons: true,
    pinActionToolbarViewImage: true,
    pinActionToolbarShareImage: false,
    pinActionToolbarOptions: false
  };

  const {installTime} = await browser.storage.local.get('installTime');
  changes.installTime = getDayPrecisionEpoch(installTime);

  await browser.storage.local.remove([
    'searchCount',
    'viewImageAction',
    'shareImageAction'
  ]);

  changes.storageVersion = revision;
  return browser.storage.local.set(changes);
}

export {message, revision, upgrade};
