import { describe, it, expectTypeOf } from 'vitest'
import type { McpTool, McpScanResult } from './mcp'

describe('mcp types', () => {
  it('McpTool shape', () => {
    expectTypeOf<McpTool>().toHaveProperty('name').toEqualTypeOf<string>()
    expectTypeOf<McpTool>().toHaveProperty('description').toEqualTypeOf<string | null>()
    expectTypeOf<McpTool>().toHaveProperty('category').toEqualTypeOf<string | null>()
    expectTypeOf<McpTool>().toHaveProperty('source').toEqualTypeOf<'static' | 'manifest' | 'readme-approx'>()
  })

  it('McpScanResult shape', () => {
    expectTypeOf<McpScanResult>().toHaveProperty('tools').toEqualTypeOf<McpTool[]>()
    expectTypeOf<McpScanResult>().toHaveProperty('source').toEqualTypeOf<'static' | 'manifest' | 'readme-approx'>()
    expectTypeOf<McpScanResult>().toHaveProperty('detectedAt').toEqualTypeOf<string>()
  })
})
