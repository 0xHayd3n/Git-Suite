import { REPO_BUCKETS } from '../constants/repoTypes'
import { SUB_TYPE_ICONS, BUCKET_ICONS } from '../constants/bucketIcons'
import type { AnyIcon } from '../constants/bucketIcons'

// Legacy type re-exports kept only for BannerSVG pattern mapping
export type { RepoType } from '../lib/classifyRepoType'

export interface SubTypeConfig {
  label: string
  icon: AnyIcon | null
  accentColor: string
}

// Build a flat lookup: subType id → { label, icon, accentColor (from parent bucket) }
const SUB_TYPE_CONFIG_MAP = new Map<string, SubTypeConfig>()
for (const bucket of REPO_BUCKETS) {
  for (const sub of bucket.subTypes) {
    SUB_TYPE_CONFIG_MAP.set(sub.id, {
      label: sub.label,
      icon: SUB_TYPE_ICONS[sub.id] ?? BUCKET_ICONS[bucket.id] ?? null,
      accentColor: bucket.color,
    })
  }
}

export function getSubTypeConfig(typeSub: string | null | undefined): SubTypeConfig | null {
  if (!typeSub) return null
  return SUB_TYPE_CONFIG_MAP.get(typeSub) ?? null
}

// Bucket color lookup (for accent borders, etc.)
const BUCKET_COLOR_MAP = new Map(REPO_BUCKETS.map(b => [b.id, b.color]))

export function getBucketColor(typeBucket: string | null | undefined): string | null {
  if (!typeBucket) return null
  return BUCKET_COLOR_MAP.get(typeBucket) ?? null
}

// Bucket gradient mapping — each bucket hex → [darkStop, lightStop]
const BUCKET_GRADIENTS = new Map<string, [string, string]>([
  ['#3b82f6', ['#2563eb', '#60a5fa']],  // Dev Tools
  ['#10b981', ['#059669', '#34d399']],  // Frameworks
  ['#8b5cf6', ['#7c3aed', '#a855f7']],  // AI & ML
  ['#f97316', ['#ea580c', '#fb923c']],  // Learning
  ['#14b8a6', ['#0d9488', '#2dd4bf']],  // Editors & IDEs
  ['#ec4899', ['#db2777', '#f472b6']],  // Lang Projects
  ['#ef4444', ['#dc2626', '#f87171']],  // Infrastructure
  ['#64748b', ['#475569', '#94a3b8']],  // Utilities
])

export function getBucketGradient(bucketColor: string | null | undefined): [string, string] {
  if (!bucketColor) return ['#4b5563', '#9ca3af']
  return BUCKET_GRADIENTS.get(bucketColor) ?? ['#4b5563', '#9ca3af']
}
