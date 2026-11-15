const message = 'Retain storage revision compatibility';

const revision = 'ryY8H0EWf';

async function upgrade() {
  return browser.storage.local.set({storageVersion: revision});
}

export {message, revision, upgrade};
