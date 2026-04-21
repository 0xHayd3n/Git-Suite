// src/types/components.ts
export type Framework = 'react' | 'vue' | 'svelte' | 'solid' | 'angular' | 'javascript' | 'typescript' | 'unknown'

export interface ScannedComponent {
  path: string    // e.g. "src/components/Button.tsx"
  source: string  // raw file content
}

export interface ComponentScanResult {
  framework: Framework
  components: ScannedComponent[]
}
