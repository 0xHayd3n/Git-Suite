import type { ComponentType } from 'react'
import {
  SiJavascript, SiTypescript, SiPython, SiRust, SiGo, SiRuby, SiPhp,
  SiKotlin, SiSwift, SiC, SiCplusplus, SiCss, SiHtml5,
  SiVuedotjs, SiSvelte, SiLua, SiZig, SiElixir, SiHaskell, SiDart,
  SiGnubash, SiDocker, SiR, SiScala, SiClojure, SiErlang, SiJulia,
  SiOcaml, SiSolidity, SiCoffeescript, SiElm,
  SiGit, SiNodedotjs, SiEslint, SiPrettier, SiVite, SiWebpack,
  SiRollupdotjs, SiBabel, SiJest, SiVitest, SiYarn, SiPnpm,
} from 'react-icons/si'
import {
  File, Scale, Settings, Lock, Braces, FileCode, Code, BookOpen,
  Database, GitBranch, Image, Play, Music, Archive, FileDiff,
  FileText, Table, Coffee,
} from 'lucide-react'

type IconDef = {
  icon: ComponentType<{ size?: number | string; color?: string }>
  color: string
}

// ── Exact filename matches (case-sensitive) ──────────────────────────
const FILENAME_ICONS: Record<string, IconDef> = {
  'Dockerfile':        { icon: SiDocker,     color: '#0ea5e9' },
  '.dockerignore':     { icon: SiDocker,     color: '#0ea5e9' },
  '.gitignore':        { icon: SiGit,        color: '#f97316' },
  '.gitattributes':    { icon: SiGit,        color: '#f97316' },
  '.gitmodules':       { icon: SiGit,        color: '#f97316' },
  'LICENSE':           { icon: Scale,        color: '#9ca3af' },
  'LICENSE.md':        { icon: Scale,        color: '#9ca3af' },
  'Makefile':          { icon: Settings,     color: '#9ca3af' },
  '.env':              { icon: Lock,         color: '#f59e0b' },
  '.env.local':        { icon: Lock,         color: '#f59e0b' },
  '.env.example':      { icon: Lock,         color: '#f59e0b' },
  'package.json':      { icon: SiNodedotjs,  color: '#16a34a' },
  'package-lock.json': { icon: SiNodedotjs,  color: '#16a34a' },
  'tsconfig.json':     { icon: SiTypescript,  color: '#3178c6' },
  '.eslintrc.json':    { icon: SiEslint,     color: '#4b32c3' },
  '.eslintrc.js':      { icon: SiEslint,     color: '#4b32c3' },
  '.prettierrc':       { icon: SiPrettier,   color: '#f7b93e' },
  '.prettierrc.json':  { icon: SiPrettier,   color: '#f7b93e' },
  'vite.config.ts':    { icon: SiVite,       color: '#646cff' },
  'vite.config.js':    { icon: SiVite,       color: '#646cff' },
  'webpack.config.js': { icon: SiWebpack,    color: '#8dd6f9' },
  'rollup.config.js':  { icon: SiRollupdotjs,color: '#ec4a3f' },
  '.babelrc':          { icon: SiBabel,      color: '#f5da55' },
  'babel.config.js':   { icon: SiBabel,      color: '#f5da55' },
  'jest.config.ts':    { icon: SiJest,       color: '#c21325' },
  'jest.config.js':    { icon: SiJest,       color: '#c21325' },
  'vitest.config.ts':  { icon: SiVitest,     color: '#6e9f18' },
  'yarn.lock':         { icon: SiYarn,       color: '#2c8ebb' },
  'pnpm-lock.yaml':    { icon: SiPnpm,       color: '#f69220' },
}

// ── Extension matches (keys are lowercase, no dot) ───────────────────
const EXTENSION_ICONS: Record<string, IconDef> = {
  // JavaScript / TypeScript
  js:   { icon: SiJavascript, color: '#ca8a04' },
  mjs:  { icon: SiJavascript, color: '#ca8a04' },
  cjs:  { icon: SiJavascript, color: '#ca8a04' },
  jsx:  { icon: SiJavascript, color: '#ca8a04' },
  ts:   { icon: SiTypescript,  color: '#3178c6' },
  mts:  { icon: SiTypescript,  color: '#3178c6' },
  cts:  { icon: SiTypescript,  color: '#3178c6' },
  tsx:  { icon: SiTypescript,  color: '#3178c6' },
  // Python
  py:   { icon: SiPython,     color: '#2563eb' },
  pyw:  { icon: SiPython,     color: '#2563eb' },
  // Systems
  rs:   { icon: SiRust,       color: '#b45309' },
  go:   { icon: SiGo,         color: '#16a34a' },
  c:    { icon: SiC,          color: '#2563eb' },
  h:    { icon: SiC,          color: '#2563eb' },
  cpp:  { icon: SiCplusplus,  color: '#7c3aed' },
  hpp:  { icon: SiCplusplus,  color: '#7c3aed' },
  cc:   { icon: SiCplusplus,  color: '#7c3aed' },
  cxx:  { icon: SiCplusplus,  color: '#7c3aed' },
  // JVM
  java: { icon: Coffee,       color: '#dc2626' },
  kt:   { icon: SiKotlin,     color: '#7c3aed' },
  kts:  { icon: SiKotlin,     color: '#7c3aed' },
  scala:{ icon: SiScala,      color: '#dc2626' },
  // Mobile
  swift:{ icon: SiSwift,      color: '#f97316' },
  dart: { icon: SiDart,       color: '#0ea5e9' },
  // Web
  rb:   { icon: SiRuby,       color: '#dc2626' },
  php:  { icon: SiPhp,        color: '#6d28d9' },
  css:  { icon: SiCss,        color: '#3b82f6' },
  scss: { icon: SiCss,        color: '#3b82f6' },
  sass: { icon: SiCss,        color: '#3b82f6' },
  less: { icon: SiCss,        color: '#3b82f6' },
  html: { icon: SiHtml5,      color: '#f97316' },
  htm:  { icon: SiHtml5,      color: '#f97316' },
  vue:  { icon: SiVuedotjs,   color: '#16a34a' },
  svelte:{ icon: SiSvelte,    color: '#f97316' },
  // Functional
  hs:   { icon: SiHaskell,    color: '#5b21b6' },
  ex:   { icon: SiElixir,     color: '#7c3aed' },
  exs:  { icon: SiElixir,     color: '#7c3aed' },
  elm:  { icon: SiElm,        color: '#0ea5e9' },
  clj:  { icon: SiClojure,    color: '#16a34a' },
  cljs: { icon: SiClojure,    color: '#16a34a' },
  erl:  { icon: SiErlang,     color: '#dc2626' },
  ml:   { icon: SiOcaml,      color: '#f97316' },
  mli:  { icon: SiOcaml,      color: '#f97316' },
  jl:   { icon: SiJulia,      color: '#7c3aed' },
  // Other languages
  lua:  { icon: SiLua,        color: '#2563eb' },
  zig:  { icon: SiZig,        color: '#f59e0b' },
  r:    { icon: SiR,          color: '#2563eb' },
  sol:  { icon: SiSolidity,   color: '#6d28d9' },
  coffee:{ icon: SiCoffeescript, color: '#b45309' },
  // Shell
  sh:   { icon: SiGnubash,    color: '#16a34a' },
  bash: { icon: SiGnubash,    color: '#16a34a' },
  zsh:  { icon: SiGnubash,    color: '#16a34a' },
  dockerfile: { icon: SiDocker, color: '#0ea5e9' },
  // Data / Config
  json: { icon: Braces,       color: '#ca8a04' },
  jsonc:{ icon: Braces,       color: '#ca8a04' },
  yaml: { icon: FileCode,     color: '#e879f9' },
  yml:  { icon: FileCode,     color: '#e879f9' },
  toml: { icon: FileCode,     color: '#9ca3af' },
  xml:  { icon: Code,         color: '#f97316' },
  svg:  { icon: Code,         color: '#f97316' },
  sql:  { icon: Database,     color: '#3b82f6' },
  graphql: { icon: GitBranch, color: '#e535ab' },
  gql:  { icon: GitBranch,    color: '#e535ab' },
  csv:  { icon: Table,        color: '#16a34a' },
  tsv:  { icon: Table,        color: '#16a34a' },
  // Docs
  md:   { icon: FileText,     color: '#3b82f6' },
  mdx:  { icon: FileText,     color: '#3b82f6' },
  markdown: { icon: FileText,  color: '#3b82f6' },
  txt:  { icon: FileText,     color: '#9ca3af' },
  text: { icon: FileText,     color: '#9ca3af' },
  log:  { icon: FileText,     color: '#9ca3af' },
  pdf:  { icon: FileText,     color: '#dc2626' },
  // Media
  png:  { icon: Image,        color: '#16a34a' },
  jpg:  { icon: Image,        color: '#16a34a' },
  jpeg: { icon: Image,        color: '#16a34a' },
  gif:  { icon: Image,        color: '#16a34a' },
  webp: { icon: Image,        color: '#16a34a' },
  ico:  { icon: Image,        color: '#16a34a' },
  bmp:  { icon: Image,        color: '#16a34a' },
  mp4:  { icon: Play,         color: '#f97316' },
  webm: { icon: Play,         color: '#f97316' },
  mov:  { icon: Play,         color: '#f97316' },
  ogg:  { icon: Play,         color: '#f97316' },
  mp3:  { icon: Music,        color: '#7c3aed' },
  wav:  { icon: Music,        color: '#7c3aed' },
  flac: { icon: Music,        color: '#7c3aed' },
  aac:  { icon: Music,        color: '#7c3aed' },
  // Archives
  zip:  { icon: Archive,      color: '#9ca3af' },
  tar:  { icon: Archive,      color: '#9ca3af' },
  gz:   { icon: Archive,      color: '#9ca3af' },
  rar:  { icon: Archive,      color: '#9ca3af' },
  '7z': { icon: Archive,      color: '#9ca3af' },
  // Misc
  lock: { icon: Lock,         color: '#9ca3af' },
  diff: { icon: FileDiff,     color: '#f59e0b' },
  patch:{ icon: FileDiff,     color: '#f59e0b' },
}

const FALLBACK: IconDef = { icon: File, color: '#6b6b80' }

function resolveIcon(filename: string): IconDef {
  // 1. Exact filename match (case-sensitive)
  const filenameMatch = FILENAME_ICONS[filename]
  if (filenameMatch) return filenameMatch

  // 2. Extension match (case-insensitive)
  const dotIdx = filename.lastIndexOf('.')
  if (dotIdx > 0) {
    const ext = filename.slice(dotIdx + 1).toLowerCase()
    const extMatch = EXTENSION_ICONS[ext]
    if (extMatch) return extMatch
  }

  // 3. Fallback
  return FALLBACK
}

interface FileIconProps {
  filename: string    // basename only, e.g. "index.ts"
  size?: number       // defaults to 14
  className?: string  // forwarded to wrapper span
}

export default function FileIcon({ filename, size = 14, className }: FileIconProps) {
  const { icon: Icon, color } = resolveIcon(filename)
  return (
    <span className={className} style={{ display: 'inline-flex', flexShrink: 0 }}>
      <Icon size={size} color={color} />
    </span>
  )
}
