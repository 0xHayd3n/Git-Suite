export interface McpTool {
  name: string
  description: string | null
  category: string | null
  paramSchema: unknown | null
  source: 'static' | 'manifest' | 'readme-approx'
}

export interface McpScanResult {
  tools: McpTool[]
  source: 'static' | 'manifest' | 'readme-approx'
  detectedAt: string
}
