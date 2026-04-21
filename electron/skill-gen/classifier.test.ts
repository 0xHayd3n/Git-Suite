import { describe, it, expect } from 'vitest'
import { classify } from './classifier'
import type { ManifestInfo } from './types'

const emptyManifest: ManifestInfo = { ecosystem: 'unknown' }

describe('classify', () => {
  it('detects library from Node package without bin', () => {
    const manifest: ManifestInfo = {
      ecosystem: 'node', name: '@tanstack/query', version: '5.0.0',
      main: './dist/index.js', types: './dist/index.d.ts',
      peerDependencies: { react: '>=17' },
    }
    const result = classify({
      language: 'TypeScript', topics: ['react', 'data-fetching', 'hooks'],
      fileTree: ['src/index.ts', 'src/types.ts', 'package.json'],
      manifest, readmeHead: '# TanStack Query\nPowerful asynchronous state management',
    })
    expect(result.type).toBe('library')
    expect(result.confidence).toBeGreaterThan(0.5)
  })

  it('detects cli-tool from bin field', () => {
    const manifest: ManifestInfo = { ecosystem: 'node', name: 'eslint', bin: { eslint: './bin/eslint.js' } }
    const result = classify({
      language: 'JavaScript', topics: ['linter', 'cli'],
      fileTree: ['bin/eslint.js', 'lib/cli.js', 'package.json'],
      manifest, readmeHead: '# ESLint\nFind and fix problems',
    })
    expect(result.type).toBe('cli-tool')
  })

  it('detects cli-tool from Rust [[bin]]', () => {
    const manifest: ManifestInfo = { ecosystem: 'rust', name: 'ripgrep', bin: { rg: 'crates/core/main.rs' } }
    const result = classify({
      language: 'Rust', topics: ['cli', 'search', 'grep'],
      fileTree: ['src/main.rs', 'Cargo.toml'],
      manifest, readmeHead: '# ripgrep\nA line-oriented search tool',
    })
    expect(result.type).toBe('cli-tool')
  })

  it('detects framework from topics and patterns', () => {
    const result = classify({
      language: 'Python', topics: ['framework', 'web', 'async'],
      fileTree: ['fastapi/__init__.py', 'fastapi/routing.py', 'fastapi/middleware.py', 'pyproject.toml'],
      manifest: { ecosystem: 'python', name: 'fastapi' },
      readmeHead: '# FastAPI\nFastAPI framework, high performance',
    })
    expect(result.type).toBe('framework')
  })

  it('detects component-library from topics', () => {
    const result = classify({
      language: 'TypeScript', topics: ['design-system', 'react', 'ui-components'],
      fileTree: ['src/Button.tsx', 'src/Input.tsx', 'package.json'],
      manifest: { ecosystem: 'node', name: '@radix-ui/primitives' },
      readmeHead: '# Radix Primitives\nUnstyled, accessible UI components',
    })
    expect(result.type).toBe('component-library')
  })

  it('detects monorepo from workspaces', () => {
    const manifest: ManifestInfo = {
      ecosystem: 'node', name: 'babel',
      rawManifest: JSON.stringify({ workspaces: ['packages/*'] }),
    }
    const result = classify({
      language: 'JavaScript', topics: ['compiler'],
      fileTree: ['packages/core/package.json', 'packages/parser/package.json', 'package.json', 'lerna.json'],
      manifest, readmeHead: '# Babel\nThe compiler for writing next generation JavaScript',
    })
    expect(result.type).toBe('monorepo')
  })

  it('detects infrastructure from .tf files', () => {
    const result = classify({
      language: 'HCL', topics: ['terraform', 'aws'],
      fileTree: ['main.tf', 'variables.tf', 'outputs.tf'],
      manifest: emptyManifest, readmeHead: '# AWS VPC Module\nTerraform module for creating VPC',
    })
    expect(result.type).toBe('infrastructure')
  })

  it('falls back to generic with low confidence', () => {
    const result = classify({
      language: 'C', topics: [], fileTree: ['main.c', 'Makefile'],
      manifest: emptyManifest, readmeHead: '# My Project',
    })
    expect(result.type).toBe('generic')
    expect(result.confidence).toBeLessThan(0.4)
  })

  it('handles empty inputs gracefully', () => {
    const result = classify({
      language: '', topics: [], fileTree: [],
      manifest: emptyManifest, readmeHead: '',
    })
    expect(result.type).toBe('generic')
  })
})
