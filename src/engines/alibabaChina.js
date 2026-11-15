import {findNode, executeScriptMainContext, runOnce} from 'utils/common';
import {setFileInputData, initSearch, sendReceipt} from 'utils/engines';

const engine = 'alibabaChina';

async function search({image, storageIds} = {}) {
  const legacyInput = 'input.image-file-reader-wrapper';
  const main = ':is(main, [role=main])';
  const globalButton = `${main} button.cgf-search-input__image-btn`;
  const entry = await findNode(`${globalButton}, ${legacyInput}`);
  const imageSearchButton = document.querySelector(globalButton);

  if (imageSearchButton) {
    imageSearchButton.click();
    const panel = await findNode(`${main} .cgf-image-search-panel`, {
      validateFn: node => node.getClientRects().length > 0,
      observerOptions: {attributes: true}
    });
    const inputSelector = 'input.beacon-upload-input';
    const input = await findNode(inputSelector, {rootNode: panel});

    await setFileInputData(inputSelector, input, image);
    input.dispatchEvent(new Event('change', {bubbles: true}));

    const submit = await findNode(
      'button.cgf-image-search-panel__confirm-btn:not(:disabled)',
      {
        rootNode: panel,
        observerOptions: {attributes: true, attributeFilter: ['disabled']}
      }
    );
    await executeScriptMainContext({
      func: 'alibabaChinaPatchContextScript',
      args: [true]
    });
    await sendReceipt(storageIds);
    submit.click();
    return;
  }

  await executeScriptMainContext({func: 'alibabaChinaPatchContextScript'});
  entry.click();
  await setFileInputData(legacyInput, entry, image);
  await sendReceipt(storageIds);

  window.setTimeout(() => {
    entry.dispatchEvent(new Event('change', {bubbles: true}));
  }, 100);
}

function init() {
  initSearch(search, engine, taskId, {canvasAccess: true});
}

if (runOnce('search')) {
  init();
}
