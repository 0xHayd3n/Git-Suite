import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateSkill, generateComponentsSkill, type SkillGenInput } from './legacy'

// Module-level mock handle — MUST be declared before vi.mock due to hoisting
const mockCreate = vi.fn()

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}))

const baseInput: SkillGenInput = {
  owner: 'vercel',
  name: 'next.js',
  language: 'TypeScript',
  topics: ['react', 'ssr'],
  readme: 'Hello world',
  version: 'v14.0',
}

describe('generateSkill', () => {
  beforeEach(() => {
    mockCreate.mockReset()
  })

  it('instantiates Anthropic with the provided apiKey', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '# skill' }],
    })
    const Anthropic = (await import('@anthropic-ai/sdk')).default as unknown as ReturnType<typeof vi.fn>
    Anthropic.mockClear()
    await generateSkill(baseInput, 'sk-ant-test')
    expect(Anthropic).toHaveBeenCalledWith({ apiKey: 'sk-ant-test' })
  })

  it('returns the text content from the API response', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '## [CORE]\nfoo\n## [EXTENDED]\nbar\n## [DEEP]\nbaz' }],
    })
    const result = await generateSkill(baseInput, 'sk-ant-test')
    expect(result).toBe('## [CORE]\nfoo\n## [EXTENDED]\nbar\n## [DEEP]\nbaz')
  })

  it('truncates readme to 12000 characters', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] })
    const longReadme = 'x'.repeat(20000)
    await generateSkill({ ...baseInput, readme: longReadme }, 'sk-ant-test')
    const callArgs = mockCreate.mock.calls[0][0]
    const prompt = callArgs.messages[0].content as string
    // The truncated readme (12000 chars) should appear, but not the full 20000
    expect(prompt).toContain('x'.repeat(12000))
    expect(prompt).not.toContain('x'.repeat(12001))
  })

  it('returns empty string when response content type is not text', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'image', source: {} }],
    })
    const result = await generateSkill(baseInput, 'sk-ant-test')
    expect(result).toBe('')
  })

  it('appends component prompt when isComponents and enabledComponents provided', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: '## [CORE]\nok' }] })
    await generateSkill(
      { ...baseInput, isComponents: true, enabledComponents: ['Button', 'Input'] },
      'sk-ant-test'
    )
    const prompt = mockCreate.mock.calls[0][0].messages[0].content as string
    expect(prompt).toContain('Button, Input')
    expect(prompt).toContain('#### headings')
    expect(prompt).toContain('### ComponentName')
  })

  it('does not append component prompt when isComponents is false', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: '## [CORE]\nok' }] })
    await generateSkill({ ...baseInput, isComponents: false }, 'sk-ant-test')
    const prompt = mockCreate.mock.calls[0][0].messages[0].content as string
    expect(prompt).not.toContain('component library')
  })

  it('does not append component prompt when enabledComponents is absent', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: '## [CORE]\nok' }] })
    await generateSkill({ ...baseInput, isComponents: true }, 'sk-ant-test')
    const prompt = mockCreate.mock.calls[0][0].messages[0].content as string
    expect(prompt).not.toContain('ONLY for these enabled components')
  })

  it('does not append component prompt when enabledComponents is empty array', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: '## [CORE]\nok' }] })
    await generateSkill({ ...baseInput, isComponents: true, enabledComponents: [] }, 'sk-ant-test')
    const prompt = mockCreate.mock.calls[0][0].messages[0].content as string
    expect(prompt).not.toContain('ONLY for these enabled components')
  })
})

describe('generateComponentsSkill', () => {
  beforeEach(() => {
    mockCreate.mockReset()
  })

  it('includes scanned component names and props in prompt', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: '## [COMPONENTS]\nok' }] })
    await generateComponentsSkill(
      {
        ...baseInput,
        isComponents: true,
        scannedComponents: [
          { name: 'Button', props: [{ name: 'disabled', type: 'boolean', required: false }] },
          { name: 'Alert', props: [{ name: 'severity', type: 'string', required: true }] },
        ],
      },
      'sk-ant-test',
    )
    const prompt = mockCreate.mock.calls[0][0].messages[0].content as string
    expect(prompt).toContain('SCANNED COMPONENTS')
    expect(prompt).toContain('Button')
    expect(prompt).toContain('disabled (boolean, optional)')
    expect(prompt).toContain('Alert')
    expect(prompt).toContain('severity (string, required)')
  })

  it('includes defaultValue when present', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: '## [COMPONENTS]\nok' }] })
    await generateComponentsSkill(
      {
        ...baseInput,
        isComponents: true,
        scannedComponents: [
          { name: 'Toggle', props: [{ name: 'active', type: 'boolean', required: false, defaultValue: 'false' }] },
        ],
      },
      'sk-ant-test',
    )
    const prompt = mockCreate.mock.calls[0][0].messages[0].content as string
    expect(prompt).toContain('active (boolean, optional, default: false)')
  })

  it('falls back to README-only when scannedComponents is empty', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: '## [COMPONENTS]\nok' }] })
    await generateComponentsSkill(
      { ...baseInput, isComponents: true, scannedComponents: [] },
      'sk-ant-test',
    )
    const prompt = mockCreate.mock.calls[0][0].messages[0].content as string
    expect(prompt).not.toContain('SCANNED COMPONENTS')
    expect(prompt).toContain('Document all components you can identify from the README')
  })

  it('falls back to README-only when scannedComponents is undefined', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: '## [COMPONENTS]\nok' }] })
    await generateComponentsSkill({ ...baseInput, isComponents: true }, 'sk-ant-test')
    const prompt = mockCreate.mock.calls[0][0].messages[0].content as string
    expect(prompt).not.toContain('SCANNED COMPONENTS')
    expect(prompt).toContain('Document all components you can identify from the README')
  })

  it('lists components with no props by name only', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: '## [COMPONENTS]\nok' }] })
    await generateComponentsSkill(
      {
        ...baseInput,
        isComponents: true,
        scannedComponents: [{ name: 'Divider', props: [] }],
      },
      'sk-ant-test',
    )
    const prompt = mockCreate.mock.calls[0][0].messages[0].content as string
    expect(prompt).toContain('- Divider: (no props extracted)')
  })
})
