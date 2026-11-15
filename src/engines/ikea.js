import {findNode, getText, processNode, runOnce} from 'utils/common';
import {EngineError, initSearch, sendReceipt, setFileInputData, showEngineError} from 'utils/engines';

const engine = 'ikea';

async function search({session, search, image, storageIds} = {}) {
  // go to regional site
  processNode('.region-picker a.website-link', node => node.click(), {
    throwError: false
  });

  const cameraSelector = '#search-box-visual-search-icon';
  if (
    !document.querySelector(cameraSelector)?.getClientRects().length &&
    document.querySelector('#onetrust-accept-btn-handler')?.getClientRects().length
  ) {
    showEngineError({errorId: 'error_ikeaCookieChoice', engine});
  }

  const camera = await findNode(cameraSelector, {
    throwError: false,
    observerOptions: {attributes: true},
    validateFn: node => node.getClientRects().length > 0
  });
  if (!camera) {
    throw new EngineError(getText('error_ikeaCameraUnavailable'));
  }
  camera.click();

  const inputSelector = 'input[type=file]';
  const input = await findNode(inputSelector);

  await setFileInputData(inputSelector, input, image);

  await sendReceipt(storageIds);

  input.dispatchEvent(new Event('change'));
}

async function engineAccess() {
  if (
    // Cloudflare challenge
    document
      .querySelector('noscript')
      ?.textContent.includes(
        '<div class="h2"><span id="challenge-error-text">'
      ) ||
    // Cloudflare error
    document.querySelector('div#cf-wrapper > div#cf-error-details')
  ) {
    return false;
  }

  return true;
}

function init() {
  initSearch(search, engine, taskId, {engineAccess, documentVisible: true});
}

if (runOnce('search')) {
  init();
}
