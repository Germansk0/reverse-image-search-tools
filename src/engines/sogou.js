import {findNode, runOnce} from 'utils/common';
import {dataToImage, fetchImageFromBackgroundScript, processImage, validateUrl} from 'utils/app';
import {EngineError, initSearch, prepareImageForUpload, sendReceipt, setFileInputData} from 'utils/engines';

const engine = 'sogou';

async function search({search, image, storageIds} = {}) {
  if (search.assetType === 'url') {
    const url = image.imageUrl;
    const blob = validateUrl(url) && await fetchImageFromBackgroundScript(url);
    const file = blob && await dataToImage({blob});
    const processed = file && await processImage(file);
    if (!processed) {
      throw new EngineError('Sogou could not load this image link. Try uploading the image file.');
    }
    image = await prepareImageForUpload({image: processed, engine});
  }

  const inputSelector = '.index-search-box input[type="file"][accept="image/*"]';
  const input = await findNode(inputSelector);

  await setFileInputData(inputSelector, input, image);

  await sendReceipt(storageIds);

  input.dispatchEvent(new Event('change', {bubbles: true}));
}

function init() {
  initSearch(search, engine, taskId);
}

if (runOnce('search')) {
  init();
}
