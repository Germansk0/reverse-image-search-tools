import {findNode, runOnce} from 'utils/common';
import {initSearch, sendReceipt} from 'utils/engines';

const engine = 'googleImages';

async function search({session, search, image, storageIds} = {}) {
  await sendReceipt(storageIds);

  const targetNode = await Promise.race([
    findNode('div#search', {timeout: 10000, throwError: false}), // desktop
    findNode('div#rso', {timeout: 10000, throwError: false}) // mobile
  ]);

  if (targetNode && !targetNode.children.length) {
    targetNode.style.margin = '6px';
    targetNode.style.padding = '16px';
    targetNode.style.border = '1px solid #fdd663';
    targetNode.style.borderRadius = '24px';
    targetNode.style.backgroundColor = '#feefc3';

    targetNode.style.fontSize = '13px';
    targetNode.style.fontWeight = '700';
    targetNode.style.lineHeight = '20px';
    targetNode.style.color = '#2d3436';

    targetNode.textContent = 'Google has replaced this reverse image search with Google Lens. Choose Google Lens in Reverse Image Search Tools.';
  }
}

function init() {
  initSearch(search, engine, taskId);
}

if (runOnce('search')) {
  init();
}
