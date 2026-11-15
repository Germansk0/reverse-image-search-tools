import {validateUrl} from 'utils/app';
import {findNode, runOnce} from 'utils/common';
import {
  initSearch,
  prepareImageForUpload,
  sendReceipt,
  setFileInputData,
  getValidHostname
} from 'utils/engines';

const engine = '123rf';

async function search({image, storageIds} = {}) {
  const uploadButton = await findNode('#desktop-search-bar-reverseSearch-btn', {
    timeout: 5000,
    throwError: false
  });
  image = await prepareImageForUpload({
    image,
    engine,
    target: uploadButton ? 'ui' : 'api'
  });

  if (uploadButton) {
    uploadButton.click();
    const inputSelector = 'input#searchbar-draganddrop-input';
    const input = await findNode(inputSelector);
    await setFileInputData(inputSelector, input, image);
    input.dispatchEvent(new Event('input', {bubbles: true, composed: true}));
    input.dispatchEvent(new Event('change', {bubbles: true}));

    // Let the adapter in the regional page pick up the task after a redirect.
    window.setTimeout(() => {
      sendReceipt(storageIds).catch(() => {});
    }, 5000);
    return;
  }

  const data = new FormData();
  data.append('image_base64', image.imageDataUrl);

  const apiHost = getValidHostname();

  const rsp = await fetch(`https://${apiHost}/apicore/search/reverse/upload`, {
    mode: 'cors',
    method: 'POST',
    body: data
  });

  if (rsp.status !== 200) {
    throw new Error(`API response: ${rsp.status}, ${await rsp.text()}`);
  }

  const rspText = await rsp.text();

  // JSON response may start with HTML
  const searchData = JSON.parse(rspText.substring(rspText.indexOf('{')));

  const tabUrl = `https://${apiHost}/reverse-search/?fid=${searchData.data.fid}`;

  await sendReceipt(storageIds);

  if (validateUrl(tabUrl)) {
    window.location.replace(tabUrl);
  }
}

async function engineAccess() {
  if (
    /^\/reverse-search(?:\/|$)/.test(window.location.pathname) ||
    document.querySelector('h1')?.textContent.toLowerCase() === '403 error'
  ) {
    return false;
  }

  return true;
}

function init() {
  initSearch(search, engine, taskId, {engineAccess});
}

if (runOnce('search')) {
  init();
}
