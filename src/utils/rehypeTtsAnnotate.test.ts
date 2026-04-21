import { describe, it, expect } from 'vitest'
import { unified } from 'unified'
import rehypeParse from 'rehype-parse'
import rehypeStringify from 'rehype-stringify'
import { rehypeTtsAnnotate, type TtsAnnotation } from './rehypeTtsAnnotate'

function process(html: string) {
  const output: TtsAnnotation = { sentences: [], sections: [] }
  const result = unified()
    .use(rehypeParse, { fragment: true })
    .use(rehypeTtsAnnotate, { output })
    .use(rehypeStringify)
    .processSync(html)
  return { html: String(result), output }
}

describe('rehypeTtsAnnotate', () => {
  it('annotates paragraph with data-tts-sentence and populates sentence output', () => {
    const { html, output } = process('<p>Hello world.</p>')
    expect(output.sentences).toHaveLength(1)
    expect(output.sentences[0].text).toBe('Hello world.')
    expect(output.sentences[0].words).toEqual(['Hello', 'world.'])
    // The paragraph itself gets the data-tts-sentence attribute
    expect(html).toContain('data-tts-sentence="0"')
    // Original content is preserved (not replaced with spans)
    expect(html).toContain('Hello world.')
  })

  it('splits multi-sentence paragraphs in output but annotates container with first sentence index', () => {
    const { html, output } = process('<p>First sentence. Second sentence.</p>')
    expect(output.sentences).toHaveLength(2)
    expect(output.sentences[0].text).toBe('First sentence.')
    expect(output.sentences[1].text).toBe('Second sentence.')
    // The container gets the first sentence's index; content is preserved
    expect(html).toContain('data-tts-sentence="0"')
    expect(html).toContain('First sentence.')
    expect(html).toContain('Second sentence.')
  })

  it('skips code blocks', () => {
    const { output } = process('<p>Before.</p><pre><code>const x = 1</code></pre><p>After.</p>')
    expect(output.sentences).toHaveLength(2)
    expect(output.sentences.map(s => s.text)).toEqual(['Before.', 'After.'])
  })

  it('skips images and tables', () => {
    const { output } = process('<p>Text.</p><img src="x.png"/><table><tr><td>Data</td></tr></table>')
    expect(output.sentences).toHaveLength(1)
    expect(output.sentences[0].text).toBe('Text.')
  })

  it('records section map from h2/h3 headings', () => {
    const { output } = process('<h2>Intro</h2><p>Hello.</p><h3>Details</h3><p>More.</p>')
    expect(output.sections).toHaveLength(2)
    expect(output.sections[0]).toEqual({ headingText: 'Intro', sentenceIndex: 0 })
    expect(output.sections[1]).toEqual({ headingText: 'Details', sentenceIndex: 1 })
  })

  it('handles empty content gracefully', () => {
    const { output } = process('')
    expect(output.sentences).toHaveLength(0)
    expect(output.sections).toHaveLength(0)
  })

  it('skips content under a Mentions heading', () => {
    const { output } = process('<h2>Intro</h2><p>Hello.</p><h2>Mentions</h2><p>Contributor stuff.</p><h2>Next</h2><p>More.</p>')
    expect(output.sentences.map(s => s.text)).toEqual(['Hello.', 'More.'])
    expect(output.sections).toEqual([
      { headingText: 'Intro', sentenceIndex: 0 },
      { headingText: 'Next', sentenceIndex: 1 },
    ])
  })
})
