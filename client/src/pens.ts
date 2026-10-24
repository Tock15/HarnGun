import type { Participant } from '@harngun/shared';
import type { CSSProperties } from 'react';

/** Highlighter pen colors (06-UI_DESIGN_SYSTEM.md §2.1); yellow is reserved for shared dishes. */
export const penStyle = (p: Pick<Participant, 'colorIndex'> | 'shared'): CSSProperties => {
  const key = p === 'shared' ? 'shared' : p.colorIndex % 8;
  return { background: `var(--highlighter-${key})`, color: `var(--highlighter-${key}-ink)` };
};

/** First letter (Thai or Latin), so color is never the only way to tell people apart. */
export const initial = (name: string) => [...name.trim()][0]?.toUpperCase() ?? '?';
