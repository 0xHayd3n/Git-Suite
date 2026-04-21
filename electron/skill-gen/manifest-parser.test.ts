import { describe, it, expect } from 'vitest'
import { parseManifest, detectManifestFile } from './manifest-parser'

describe('detectManifestFile', () => {
  it('returns package.json for Node projects', () => {
    const tree = ['src/index.ts', 'package.json', 'tsconfig.json']
    expect(detectManifestFile(tree)).toBe('package.json')
  })

  it('returns Cargo.toml for Rust projects', () => {
    const tree = ['src/main.rs', 'Cargo.toml', 'Cargo.lock']
    expect(detectManifestFile(tree)).toBe('Cargo.toml')
  })

  it('returns pyproject.toml for Python projects', () => {
    const tree = ['src/main.py', 'pyproject.toml']
    expect(detectManifestFile(tree)).toBe('pyproject.toml')
  })

  it('returns setup.py when no pyproject.toml', () => {
    const tree = ['main.py', 'setup.py']
    expect(detectManifestFile(tree)).toBe('setup.py')
  })

  it('returns go.mod for Go projects', () => {
    const tree = ['main.go', 'go.mod', 'go.sum']
    expect(detectManifestFile(tree)).toBe('go.mod')
  })

  it('returns null when no manifest found', () => {
    const tree = ['README.md', 'Makefile', 'src/main.c']
    expect(detectManifestFile(tree)).toBeNull()
  })
})

describe('parseManifest', () => {
  it('parses package.json with bin field', () => {
    const content = JSON.stringify({
      name: 'my-cli', version: '2.0.0', description: 'A CLI tool',
      bin: { 'my-cli': './dist/index.js' },
      dependencies: { 'commander': '^10.0.0' },
      engines: { node: '>=18' },
    })
    const result = parseManifest('package.json', content)
    expect(result.ecosystem).toBe('node')
    expect(result.name).toBe('my-cli')
    expect(result.version).toBe('2.0.0')
    expect(result.bin).toEqual({ 'my-cli': './dist/index.js' })
    expect(result.engines).toEqual({ node: '>=18' })
  })

  it('parses package.json with types field', () => {
    const content = JSON.stringify({
      name: '@scope/lib', version: '1.0.0',
      main: './dist/index.js', types: './dist/index.d.ts',
      peerDependencies: { react: '>=17' },
    })
    const result = parseManifest('package.json', content)
    expect(result.types).toBe('./dist/index.d.ts')
    expect(result.main).toBe('./dist/index.js')
    expect(result.peerDependencies).toEqual({ react: '>=17' })
  })

  it('parses Cargo.toml basic fields', () => {
    const content = `[package]
name = "ripgrep"
version = "14.1.0"
edition = "2021"
description = "A fast line-oriented search tool"

[[bin]]
name = "rg"
path = "crates/core/main.rs"

[dependencies]
regex = "1.10"

[features]
default = ["pcre2"]
pcre2 = ["dep:pcre2"]
`
    const result = parseManifest('Cargo.toml', content)
    expect(result.ecosystem).toBe('rust')
    expect(result.name).toBe('ripgrep')
    expect(result.version).toBe('14.1.0')
    expect(result.edition).toBe('2021')
    expect(result.bin).toEqual({ rg: 'crates/core/main.rs' })
  })

  it('parses go.mod', () => {
    const content = `module github.com/charmbracelet/bubbletea

go 1.18

require (
\tgithub.com/charmbracelet/lipgloss v0.9.1
\tgithub.com/muesli/termenv v0.15.2
)
`
    const result = parseManifest('go.mod', content)
    expect(result.ecosystem).toBe('go')
    expect(result.modulePath).toBe('github.com/charmbracelet/bubbletea')
    expect(result.goVersion).toBe('1.18')
    expect(result.name).toBe('bubbletea')
  })

  it('parses pyproject.toml', () => {
    const content = `[project]
name = "fastapi"
version = "0.110.0"
description = "FastAPI framework"
requires-python = ">=3.8"

[project.scripts]
fastapi = "fastapi.cli:main"
`
    const result = parseManifest('pyproject.toml', content)
    expect(result.ecosystem).toBe('python')
    expect(result.name).toBe('fastapi')
    expect(result.version).toBe('0.110.0')
    expect(result.requiresPython).toBe('>=3.8')
    expect(result.entryPoints).toEqual({ fastapi: 'fastapi.cli:main' })
  })

  it('parses setup.py basic fields', () => {
    const content = `from setuptools import setup

setup(
    name="click",
    version="8.1.7",
    entry_points={"console_scripts": ["click=click:cli"]},
)
`
    const result = parseManifest('setup.py', content)
    expect(result.ecosystem).toBe('python')
    expect(result.name).toBe('click')
  })

  it('returns unknown ecosystem for unrecognized files', () => {
    const result = parseManifest('Makefile', 'all: build')
    expect(result.ecosystem).toBe('unknown')
  })

  it('parses Cargo.toml with escaped strings and comments', () => {
    const content = `[package]
name = "my-crate"
version = "1.0.0"
description = "A crate with \\"quotes\\" inside"
# This is a comment
edition = "2021"
`
    const result = parseManifest('Cargo.toml', content)
    expect(result.ecosystem).toBe('rust')
    expect(result.name).toBe('my-crate')
    expect(result.description).toBe('A crate with "quotes" inside')
  })

  it('parses Cargo.toml with multiple [[bin]] entries', () => {
    const content = `[package]
name = "multi-bin"
version = "2.0.0"

[[bin]]
name = "server"
path = "src/bin/server.rs"

[[bin]]
name = "client"
path = "src/bin/client.rs"
`
    const result = parseManifest('Cargo.toml', content)
    expect(result.ecosystem).toBe('rust')
    expect(result.bin).toEqual({
      server: 'src/bin/server.rs',
      client: 'src/bin/client.rs',
    })
  })

  it('parses Cargo.toml with multiline description', () => {
    const content = `[package]
name = "multi"
version = "0.1.0"
description = """
A multiline
description here
"""
`
    const result = parseManifest('Cargo.toml', content)
    expect(result.ecosystem).toBe('rust')
    expect(result.description).toContain('multiline')
  })

  it('parses Cargo.toml with inline tables', () => {
    const content = `[package]
name = "inline-test"
version = "1.0.0"
edition = "2021"

[dependencies]
serde = { version = "1.0", features = ["derive"] }
`
    const result = parseManifest('Cargo.toml', content)
    expect(result.ecosystem).toBe('rust')
    expect(result.name).toBe('inline-test')
  })

  it('returns unknown ecosystem for malformed Cargo.toml', () => {
    const content = `this is not valid toml [[[`
    const result = parseManifest('Cargo.toml', content)
    expect(result.ecosystem).toBe('unknown')
  })

  it('parses pyproject.toml with escaped strings', () => {
    const content = `[project]
name = "my-pkg"
version = "1.0.0"
description = "A package with \\"quotes\\""
requires-python = ">=3.9"
`
    const result = parseManifest('pyproject.toml', content)
    expect(result.ecosystem).toBe('python')
    expect(result.name).toBe('my-pkg')
    expect(result.description).toBe('A package with "quotes"')
  })

  it('parses pyproject.toml with multiple scripts', () => {
    const content = `[project]
name = "multi-cli"
version = "2.0.0"

[project.scripts]
serve = "multi_cli.serve:main"
migrate = "multi_cli.db:migrate"
seed = "multi_cli.db:seed"
`
    const result = parseManifest('pyproject.toml', content)
    expect(result.entryPoints).toEqual({
      serve: 'multi_cli.serve:main',
      migrate: 'multi_cli.db:migrate',
      seed: 'multi_cli.db:seed',
    })
  })

  it('parses pyproject.toml with build-system and other sections', () => {
    const content = `[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "with-build"
version = "0.5.0"
description = "Has build system section before project"

[tool.ruff]
line-length = 120
`
    const result = parseManifest('pyproject.toml', content)
    expect(result.ecosystem).toBe('python')
    expect(result.name).toBe('with-build')
    expect(result.version).toBe('0.5.0')
  })

  it('returns unknown ecosystem for malformed pyproject.toml', () => {
    const content = `not valid toml at all [[[`
    const result = parseManifest('pyproject.toml', content)
    expect(result.ecosystem).toBe('unknown')
  })
})
