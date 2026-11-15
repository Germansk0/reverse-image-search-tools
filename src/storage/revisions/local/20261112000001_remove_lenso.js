const message = 'Remove Lenso.ai';
const revision = '20261112000001_remove_lenso';
const engine = 'lenso';

async function upgrade() {
  const options = await browser.storage.local.get([
    'engines',
    'disabledEngines',
    'sidebarEngineSelection'
  ]);
  const changes = {storageVersion: revision};

  for (const key of ['engines', 'disabledEngines']) {
    if (options[key]?.includes(engine)) {
      changes[key] = options[key].filter(id => id !== engine);
    }
  }

  const selection = options.sidebarEngineSelection;
  if (selection?.mode === 'custom' && selection.engines?.includes(engine)) {
    changes.sidebarEngineSelection = {
      ...selection,
      engines: selection.engines.filter(id => id !== engine)
    };
  }

  return browser.storage.local.set(changes);
}

export {message, revision, upgrade};
