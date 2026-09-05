export function keepSelectedCard<T extends { id: number }>(selected: T | null, visible: T[], latest: T[] = visible): T | null {
  if (!selected) return visible[0] ?? null;
  // Keep identity, not an old rendering. New cards may reorder the lane,
  // but revisions to this exact card should appear without another click.
  return latest.find((card) => card.id === selected.id) ?? selected;
}

export function nextCardAfterRemoval<T extends { id: number }>(removedId: number, visible: T[]): T | null {
  const removedIndex = visible.findIndex((card) => card.id === removedId);
  const remaining = visible.filter((card) => card.id !== removedId);
  if (!remaining.length) return null;
  if (removedIndex < 0) return remaining[0];
  return remaining[removedIndex % remaining.length];
}

export function cardDraftKey(card: { id: number }) {
  return String(card.id);
}
