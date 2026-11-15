/** Reorder the visible engines while keeping hidden engines in their slots. */
export function applyVisibleOrder(engines, visible, ordered) {
  const allowed = new Set(visible);
  const requested = new Set(ordered);
  if (allowed.size !== visible.length || requested.size !== ordered.length ||
      ordered.length !== visible.length || ordered.some(engine => !allowed.has(engine))) {
    return [...engines];
  }
  let next = 0;
  return engines.map(engine => allowed.has(engine) ? ordered[next++] : engine);
}
