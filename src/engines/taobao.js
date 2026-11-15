import {findNode, executeScriptMainContext, runOnce} from 'utils/common';
import {setFileInputData, initSearch, sendReceipt} from 'utils/engines';

const engine = 'taobao';

async function search({image, storageIds} = {}) {
  await executeScriptMainContext({func: 'taobaoPatchContext'});

  const camera = await findNode('div.image-search-icon-wrapper', {
    timeout: 120000
  });
  const inputSelector = 'input[type="file"]';
  // Some versions create the image search input only when the camera opens.
  const existingInputs = new Set(document.querySelectorAll(inputSelector));
  const getSearchInput = () =>
    document.querySelector('input#image-search-custom-file-input[type="file"]') ||
    [...document.querySelectorAll(inputSelector)].find(
      input => !existingInputs.has(input)
    );

  camera.click();
  await findNode(inputSelector, {
    validateFn: () => Boolean(getSearchInput()),
    observerOptions: {attributes: true, attributeFilter: ['id', 'type']}
  });

  const input = getSearchInput();
  await setFileInputData(inputSelector, input, image);

  await sendReceipt(storageIds);

  window.setTimeout(() => {
    input.dispatchEvent(new Event('change', {bubbles: true}));
  }, 100);

  (
    await findNode('div#image-search-upload-button.upload-button-active', {
      observerOptions: {attributes: true, attributeFilter: ['class']}
    })
  ).click();
}

function init() {
  initSearch(search, engine, taskId, {canvasAccess: true});
}

if (runOnce('search')) {
  init();
}
