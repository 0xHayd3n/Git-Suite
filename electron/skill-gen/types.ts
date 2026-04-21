export type RepoType =
  | 'library'
  | 'cli-tool'
  | 'framework'
  | 'component-library'
  | 'monorepo'
  | 'infrastructure'
  | 'generic'

export interface ClassificationResult {
  type: RepoType
  confidence: number
  signals: string[]
}

export interface ManifestInfo {
  ecosystem: 'node' | 'rust' | 'python' | 'go' | 'ruby' | 'java' | 'dotnet' | 'unknown'
  name?: string
  version?: string
  description?: string
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  engines?: Record<string, string>
  bin?: Record<string, string> | string
  main?: string
  types?: string
  exports?: Record<string, unknown>
  edition?: string
  features?: Record<string, string[]>
  entryPoints?: Record<string, string>
  requiresPython?: string
  modulePath?: string
  goVersion?: string
  rawManifest?: string
}

export interface ExportEntry {
  name: string
  kind: 'function' | 'class' | 'type' | 'interface' | 'const' | 'enum'
  signature?: string
  file: string
}

export interface FlagEntry {
  name: string
  short?: string
  type: string
  default?: string
  description?: string
}

export interface CommandEntry {
  name: string
  description?: string
  flags: FlagEntry[]
}

export interface ComponentEntry {
  name: string
  props: { name: string; type: string; required: boolean; defaultValue?: string }[]
}

export interface PluginEntry {
  name: string
  hookPoint: string
  signature?: string
}

export interface PackageEntry {
  name: string
  path: string
  description?: string
  mainExport?: string
}

export interface ResourceEntry {
  type: string
  name: string
  variables?: ConfigEntry[]
}

export interface ConfigEntry {
  key: string
  type: string
  default?: string
  description?: string
}

export interface ExtractionResult {
  repoType: RepoType
  manifest: ManifestInfo
  fileTree: string[]
  exports?: ExportEntry[]
  commands?: CommandEntry[]
  components?: ComponentEntry[]
  plugins?: PluginEntry[]
  packages?: PackageEntry[]
  resources?: ResourceEntry[]
  configSchema?: ConfigEntry[]
}

export interface Extractor {
  getFilesToFetch(fileTree: string[], manifest: ManifestInfo): string[]
  extract(files: Map<string, string>, manifest: ManifestInfo): Partial<ExtractionResult>
}

export interface SectionSpec {
  maxLines: number
  instructions: string
}

export interface SkillTemplate {
  type: RepoType
  frontmatterFields: string[]
  sections: {
    core: SectionSpec
    extended: SectionSpec
    deep: SectionSpec
  }
  rules: string[]
}

export interface ClassifyInput {
  language: string
  topics: string[]
  fileTree: string[]
  manifest: ManifestInfo
  readmeHead: string
}

export interface ValidationIssue {
  check: string
  message: string
  line?: number
  fix?: string
}

export interface ValidationResult {
  passed: boolean
  errors: ValidationIssue[]
  warnings: ValidationIssue[]
  autoFixes: number
}

export interface ValidateOutput {
  content: string
  result: ValidationResult
}
