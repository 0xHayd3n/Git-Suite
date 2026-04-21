import { describe, it, expect } from 'vitest'
import { buildPushUrl } from './createGitService'

describe('buildPushUrl', () => {
  it('embeds token in HTTPS URL', () => {
    const url = buildPushUrl('ghp_abc123', 'haydo', 'my-tool')
    expect(url).toBe('https://ghp_abc123@github.com/haydo/my-tool.git')
  })

  it('does not include token in clean URL', () => {
    const clean = `https://github.com/haydo/my-tool`
    expect(clean).not.toContain('ghp_')
  })
})
