export type VersionedCard = {
  id: number;
  version: number;
  status: string;
};

export function keepSelectedCard<T extends { id: number }>(selected: T | null, visible: T[]): T | null {
  if (!selected) return visible[0] ?? null;
  return visible.some((card) => card.id === selected.id) ? selected : visible[0] ?? null;
}

export function nextCardAfterRemoval<T extends { id: number }>(removedId: number, visible: T[]): T | null {
  const removedIndex = visible.findIndex((card) => card.id === removedId);
  const remaining = visible.filter((card) => card.id !== removedId);
  if (!remaining.length) return null;
  if (removedIndex < 0) return remaining[0];
  return remaining[removedIndex % remaining.length];
}

export function cardDraftKey(card: VersionedCard) {
  return `${card.id}:${card.version}`;
}

export function cardHasChanged(selected: VersionedCard, latest: VersionedCard | undefined) {
  return Boolean(latest && (latest.version !== selected.version || latest.status !== selected.status));
}
