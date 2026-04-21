import { describe, it, expect } from 'vitest'
import { libraryExtractor } from './library'
import type { ManifestInfo } from '../types'

const nodeManifest: ManifestInfo = {
  ecosystem: 'node',
  name: 'zod',
  types: './dist/index.d.ts',
  main: './dist/index.js',
}

describe('libraryExtractor.getFilesToFetch', () => {
  it('fetches .d.ts entry point when manifest has types field', () => {
    const tree = ['dist/index.d.ts', 'dist/index.js', 'src/index.ts', 'package.json']
    const result = libraryExtractor.getFilesToFetch(tree, nodeManifest)
    expect(result).toContain('dist/index.d.ts')
  })

  it('fetches src/index.ts when no types field', () => {
    const tree = ['src/index.ts', 'src/utils.ts', 'package.json']
    const result = libraryExtractor.getFilesToFetch(tree, { ecosystem: 'node', name: 'test' })
    expect(result).toContain('src/index.ts')
  })

  it('fetches src/lib.rs for Rust crates', () => {
    const tree = ['src/lib.rs', 'src/types.rs', 'Cargo.toml']
    const result = libraryExtractor.getFilesToFetch(tree, { ecosystem: 'rust', name: 'serde' })
    expect(result).toContain('src/lib.rs')
  })

  it('fetches __init__.py for Python packages', () => {
    const tree = ['pydantic/__init__.py', 'pydantic/main.py', 'pyproject.toml']
    const manifest: ManifestInfo = { ecosystem: 'python', name: 'pydantic' }
    const result = libraryExtractor.getFilesToFetch(tree, manifest)
    expect(result).toContain('pydantic/__init__.py')
  })

  it('respects 15 file limit', () => {
    const tree = Array.from({ length: 50 }, (_, i) => `src/file${i}.d.ts`)
    const result = libraryExtractor.getFilesToFetch(tree, nodeManifest)
    expect(result.length).toBeLessThanOrEqual(15)
  })

  it('fetches root .go files and skips _test.go for Go', () => {
    const tree = ['main.go', 'server.go', 'server_test.go', 'cmd/root.go']
    const result = libraryExtractor.getFilesToFetch(tree, { ecosystem: 'go', name: 'mylib' })
    expect(result).toContain('main.go')
    expect(result).toContain('server.go')
    expect(result).not.toContain('server_test.go')
  })
})

describe('libraryExtractor.extract', () => {
  it('extracts exported functions from .d.ts', () => {
    const files = new Map([
      ['dist/index.d.ts', `
export declare function z(): ZodType;
export declare function string(): ZodString;
export declare class ZodString extends ZodType {
  min(length: number): ZodString;
}
export type ZodType = { parse(data: unknown): unknown };
export interface ZodSchema { safeParse(data: unknown): SafeParseResult; }
export declare const object: (shape: Record<string, ZodType>) => ZodObject;
`],
    ])
    const result = libraryExtractor.extract(files, nodeManifest)
    expect(result.exports).toBeDefined()
    const names = result.exports!.map(e => e.name)
    expect(names).toContain('z')
    expect(names).toContain('string')
    expect(names).toContain('ZodString')
    expect(names).toContain('ZodType')
    expect(names).toContain('ZodSchema')
    expect(names).toContain('object')
  })

  it('extracts exports from TypeScript source', () => {
    const files = new Map([
      ['src/index.ts', `
export function createClient(config: Config): Client { }
export class APIClient { }
export const VERSION = '1.0.0'
export enum LogLevel { Debug, Info, Warn, Error }
export { helper } from './helper'
`],
    ])
    const result = libraryExtractor.extract(files, { ecosystem: 'node', name: 'test' })
    const names = result.exports!.map(e => e.name)
    expect(names).toContain('createClient')
    expect(names).toContain('APIClient')
    expect(names).toContain('VERSION')
    expect(names).toContain('LogLevel')
  })

  it('extracts pub functions from Rust', () => {
    const files = new Map([
      ['src/lib.rs', `
pub fn serialize<T: Serialize>(value: &T) -> Result<String> { }
pub struct Serializer { }
pub enum Format { Json, Toml, Yaml }
pub trait Serialize { fn serialize(&self) -> Result<()>; }
`],
    ])
    const result = libraryExtractor.extract(files, { ecosystem: 'rust', name: 'serde' })
    const names = result.exports!.map(e => e.name)
    expect(names).toContain('serialize')
    expect(names).toContain('Serializer')
    expect(names).toContain('Format')
    expect(names).toContain('Serialize')
  })

  it('extracts Python top-level defs and classes', () => {
    const files = new Map([
      ['pydantic/__init__.py', `
class BaseModel:
    pass

def validator(func):
    pass

class _PrivateHelper:
    pass

__all__ = ['BaseModel', 'validator']
`],
    ])
    const result = libraryExtractor.extract(files, { ecosystem: 'python', name: 'pydantic' })
    const names = result.exports!.map(e => e.name)
    expect(names).toContain('BaseModel')
    expect(names).toContain('validator')
  })

  it('extracts Go capitalized exports', () => {
    const files = new Map([
      ['server.go', `
func NewServer(addr string) *Server { }
func handleRequest(w http.ResponseWriter, r *http.Request) { }
type Server struct { }
type config struct { }
`],
    ])
    const result = libraryExtractor.extract(files, { ecosystem: 'go', name: 'myserver' })
    const names = result.exports!.map(e => e.name)
    expect(names).toContain('NewServer')
    expect(names).toContain('Server')
    expect(names).not.toContain('handleRequest')
    expect(names).not.toContain('config')
  })

  it('returns empty exports for empty files', () => {
    const files = new Map<string, string>()
    const result = libraryExtractor.extract(files, nodeManifest)
    expect(result.exports ?? []).toEqual([])
  })

  it('extracts Rust pub async/unsafe fn', () => {
    const files = new Map([
      ['src/lib.rs', `
pub async fn connect(addr: &str) -> Result<Client> { }
pub unsafe fn raw_ptr() -> *mut u8 { }
pub fn normal() { }
`],
    ])
    const result = libraryExtractor.extract(files, { ecosystem: 'rust', name: 'test' })
    const names = result.exports!.map(e => e.name)
    expect(names).toContain('connect')
    expect(names).toContain('raw_ptr')
    expect(names).toContain('normal')
  })

  it('extracts aliased re-exports using public name', () => {
    const files = new Map([
      ['src/index.ts', `
export { internal as publicAPI } from './internal'
export { foo as bar, baz } from './utils'
`],
    ])
    const result = libraryExtractor.extract(files, { ecosystem: 'node', name: 'test' })
    const names = result.exports!.map(e => e.name)
    expect(names).toContain('publicAPI')
    expect(names).not.toContain('internal')
    expect(names).toContain('bar')
    expect(names).toContain('baz')
  })
})
