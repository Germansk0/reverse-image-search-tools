/** A stored all-selection follows newly enabled engines; a custom selection does not. */
export function resolveSelection(
  enabled,
  selection,
  {releaseEngines, recommendedEngines = enabled} = {}
) {
  const deferredSelection =
    releaseEngines &&
    selection?.mode === 'custom' &&
    Array.isArray(selection.engines) &&
    selection.engines.length &&
    selection.engines.every(engine => !releaseEngines.includes(engine));
  if (selection?.mode === 'recommended' || deferredSelection) {
    return releaseEngines && recommendedEngines.includes('googleLens')
      ? ['googleLens']
      : recommendedEngines.slice(0, 1);
  }
  if (!selection || selection.mode !== 'custom' || !Array.isArray(selection.engines)) {
    return [...enabled];
  }
  const chosen = new Set(selection.engines);
  return enabled.filter(engine => chosen.has(engine));
}

export function selectionForSave(enabled, chosen) {
  const valid = new Set(enabled);
  const unique = [...new Set(chosen)].filter(engine => valid.has(engine));
  return unique.length === enabled.length
    ? {mode: 'all'}
    : {mode: 'custom', engines: unique};
}
