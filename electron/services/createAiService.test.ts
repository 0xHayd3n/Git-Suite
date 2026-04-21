import { describe, it, expect } from 'vitest'
import { extractFiles, truncateHistory, buildSystemPrompt } from './createAiService'

describe('extractFiles', () => {
  it('returns empty array and full text when no <files> block', () => {
    const input = 'Hello! What should we build?'
    const result = extractFiles(input)
    expect(result.files).toEqual([])
    expect(result.reply).toBe('Hello! What should we build?')
  })

  it('extracts single file and reply text', () => {
    const input = `<files>\n<file path="src/index.ts">\nconsole.log('hi')\n</file>\n</files>\n\nAdded entry point.`
    const result = extractFiles(input)
    expect(result.files).toHaveLength(1)
    expect(result.files[0].path).toBe('src/index.ts')
    expect(result.files[0].content).toBe("console.log('hi')")
    expect(result.reply).toBe('Added entry point.')
  })

  it('extracts multiple files', () => {
    const input = `<files>\n<file path="a.ts">\nA\n</file>\n<file path="b.ts">\nB\n</file>\n</files>\n\nDone.`
    const result = extractFiles(input)
    expect(result.files).toHaveLength(2)
    expect(result.files[1].path).toBe('b.ts')
  })
})

describe('truncateHistory', () => {
  it('returns history unchanged when 20 or fewer messages', () => {
    const messages = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant' as 'user' | 'assistant',
      content: `msg ${i}`,
      timestamp: i,
    }))
    expect(truncateHistory(messages)).toHaveLength(20)
  })

  it('truncates to 15 most recent when over 20 messages', () => {
    const messages = Array.from({ length: 25 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant' as 'user' | 'assistant',
      content: `msg ${i}`,
      timestamp: i,
    }))
    const result = truncateHistory(messages)
    expect(result).toHaveLength(16) // summary + 15 recent
    expect(result[0].role).toBe('assistant')
    expect(result[0].content).toContain('[Summary')
    expect(result[result.length - 1].content).toBe('msg 24')
  })
})

describe('buildSystemPrompt', () => {
  it('includes template and tool type', () => {
    const prompt = buildSystemPrompt('MCP Server Starter', 'mcp', [])
    expect(prompt).toContain('MCP Server Starter')
    expect(prompt).toContain('mcp')
  })

  it('includes repo context limited to 500 chars', () => {
    const longReadme = 'A'.repeat(1000)
    const prompt = buildSystemPrompt('test', 'webapp', [{ name: 'my-repo', description: 'A tool', readmeExcerpt: longReadme }])
    // README excerpt must not exceed 500 chars (system prompt text after the section is expected)
    expect(prompt).not.toContain('A'.repeat(501))
  })

  it('includes <files> format instructions', () => {
    const prompt = buildSystemPrompt('test', 'cli', [])
    expect(prompt).toContain('<files>')
    expect(prompt).toContain('<file path=')
  })
})
