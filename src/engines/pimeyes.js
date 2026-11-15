import {runOnce} from 'utils/common';
import {initSearch, sendReceipt, showEngineError} from 'utils/engines';

const engine = 'pimeyes';

async function search({storageIds}) {
  await sendReceipt(storageIds);
  showEngineError({errorId: 'error_pimeyesManualSearch', engine});
}

if (runOnce('search')) {
  initSearch(search, engine, taskId, {documentLoad: 'dom'});
}
