type Pick =
  | { kind: 'floor' }
  | { kind: 'enemy'; id: string }
  | { kind: 'object'; id: string; usable: boolean };
export function pointerFeedback(pick: Pick | null) {
  if (!pick) return { kind: 'inactive' } as const;
  if (pick.kind === 'enemy') return { kind: 'sword', id: pick.id } as const;
  if (pick.kind === 'object' && pick.usable) return { kind: 'outline', id: pick.id } as const;
  return { kind: 'hand' } as const;
}
