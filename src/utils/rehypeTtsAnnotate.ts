import { visit, SKIP } from 'unist-util-visit'
import type { Root, Element, Text } from 'hast'

export interface TtsSentence {
  sentenceIndex: number
  text: string
  words: string[]
  isListItem?: boolean
}

export interface TtsSection {
  headingText: string
  sentenceIndex: number
}

export interface TtsAnnotation {
  sentences: TtsSentence[]
  sections: TtsSection[]
}

interface Options {
  output: TtsAnnotation
}

const SKIP_TAGS = new Set(['pre', 'code', 'img', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'svg', 'video', 'audio'])

// Split text into sentences on . ! ? followed by whitespace or end-of-string.
// Keeps the punctuation attached to the sentence.
// Periods between digits (8.1, 3.14) are treated as decimal points, not sentence endings.
function splitSentences(text: string): string[] {
  const result: string[] = []
  let start = 0

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch !== '.' && ch !== '!' && ch !== '?') continue

    // Skip decimal/version numbers like 8.1, 3.14
    if (ch === '.' && /\d/.test(text[i - 1] ?? '') && /\d/.test(text[i + 1] ?? '')) continue

    // Only split if followed by whitespace or end of string
    const next = text[i + 1]
    if (next === undefined || /\s/.test(next)) {
      const sentence = text.slice(start, i + 1).trim()
      if (sentence) result.push(sentence)
      start = i + 1
    }
  }

  const remaining = text.slice(start).trim()
  if (remaining) result.push(remaining)
  return result
}

const BLOCK_TAGS = new Set(['p', 'li', 'dd', 'div', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'])

function extractText(node: Element): string {
  let text = ''
  for (const child of node.children) {
    if (child.type === 'text') text += (child as Text).value
    else if (child.type === 'element' && !SKIP_TAGS.has((child as Element).tagName)) {
      // Add space before block elements so text from separate <p> elements
      // inside a <li> doesn't run together (e.g. "11:If" → "11: If")
      if (text && BLOCK_TAGS.has((child as Element).tagName)) text += ' '
      text += extractText(child as Element)
    }
  }
  return text
}

// Headings that signal the end of readable content — everything after is skipped.
const STOP_HEADINGS = /^references?$/i

// Headings whose entire section should be skipped (until next heading at same/higher level).
const SKIP_SECTION_HEADINGS = /^(?:to[\s-]?do(?:\s+list)?|mentions)$/i

/** Returns true if the element contains an <input type="checkbox"> (GFM task list). */
function containsCheckbox(node: Element): boolean {
  for (const child of node.children) {
    if (child.type === 'element') {
      const el = child as Element
      if (el.tagName === 'input' && el.properties?.type === 'checkbox') return true
      if (containsCheckbox(el)) return true
    }
  }
  return false
}

export function rehypeTtsAnnotate(options: Options) {
  const { output } = options
  let sentenceCounter = 0

  return (tree: Root) => {
    // Clear arrays before populating — prevents sentence accumulation across
    // React re-renders (rehype plugins run each render but the output object
    // is a long-lived ref that persists across renders).
    output.sentences.length = 0
    output.sections.length = 0

    let stopped = false
    let skipUntilLevel = 0 // >0 = skip content until heading at this level or higher

    visit(tree, 'element', (node: Element) => {
      if (stopped) return SKIP

      // Skip non-readable elements entirely
      if (SKIP_TAGS.has(node.tagName)) return SKIP

      // Handle all headings for section skipping and navigation
      const headingMatch = node.tagName.match(/^h([1-6])$/)
      if (headingMatch) {
        const level = parseInt(headingMatch[1])
        const headingText = extractText(node).trim()

        // End a skipped section when we reach a heading at the same or higher level
        if (skipUntilLevel > 0 && level <= skipUntilLevel) {
          skipUntilLevel = 0
        }

        // Stop headings (references) — stop all remaining content
        if (STOP_HEADINGS.test(headingText)) {
          stopped = true
          return SKIP
        }

        // Skip-section headings (todo) — skip until next heading at same/higher level
        if (SKIP_SECTION_HEADINGS.test(headingText)) {
          skipUntilLevel = level
          return SKIP
        }

        // Record section headings for navigation (h2, h3 only)
        if ((level === 2 || level === 3) && headingText) {
          output.sections.push({ headingText, sentenceIndex: sentenceCounter })
        }
        return SKIP
      }

      // Skip content inside a skipped section
      if (skipUntilLevel > 0) return SKIP

      // Only annotate leaf text containers (p, li, dd)
      if (node.tagName !== 'p' && node.tagName !== 'li' && node.tagName !== 'dd') return

      // Skip task list items (checkbox items)
      if (node.tagName === 'li' && containsCheckbox(node)) return SKIP

      const fullText = extractText(node).trim()
      if (!fullText) return SKIP

      const sentences = splitSentences(fullText)
      const isListItem = node.tagName === 'li'

      // Annotate the node itself with the first sentence index so the DOM
      // element can be highlighted without replacing the original children
      // (preserving inline elements like links, code, images, etc.)
      node.properties = node.properties ?? {}
      node.properties.dataTtsSentence = String(sentenceCounter)

      for (const sentenceText of sentences) {
        const words = sentenceText.split(/\s+/).filter(Boolean)
        output.sentences.push({
          sentenceIndex: sentenceCounter,
          text: sentenceText,
          words,
          ...(isListItem && { isListItem: true }),
        })
        sentenceCounter++
      }

      return SKIP
    })
  }
}
