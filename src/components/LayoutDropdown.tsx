// ── Types & constants (used by Discover.tsx, DiscoverGrid.tsx, RepoListRow.tsx) ──

export type LayoutMode = 'grid' | 'list'
export type ListDensity = 'compact' | 'comfortable'

export interface ListFields {
  description: boolean
  tags: boolean
  stats: boolean
  type: boolean
  verification: boolean
}

export interface LayoutPrefs {
  mode: LayoutMode
  columns: number
  density: ListDensity
  fields: ListFields
}

export const DEFAULT_LAYOUT_PREFS: LayoutPrefs = {
  mode: 'grid',
  columns: 5,
  density: 'comfortable',
  fields: { description: true, tags: true, stats: true, type: true, verification: true },
}

export const LAYOUT_STORAGE_KEY = 'discover-layout-prefs'
