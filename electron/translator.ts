// Uses the unofficial Google Translate client endpoint — no API key required.
// Response shape: [[["translated","original",null,null,score],...],null,"detected-lang"]

const GT_URL = 'https://translate.googleapis.com/translate_a/single'

interface TranslateResult {
  translatedText: string
  detectedLanguage: string
}

// ── Local script detection (no network calls) ─────────────────────
// Unicode range → language code mapping for non-Latin scripts
const SCRIPT_RANGES: Array<{ re: RegExp; lang: string }> = [
  { re: /[\u3040-\u309F\u30A0-\u30FF]/g, lang: 'ja' },  // Hiragana + Katakana → Japanese
  { re: /[\uAC00-\uD7AF]/g,              lang: 'ko' },  // Hangul → Korean
  { re: /[\u0400-\u04FF]/g,              lang: 'ru' },  // Cyrillic → Russian
  { re: /[\u0600-\u06FF]/g,              lang: 'ar' },  // Arabic
  { re: /[\u0900-\u097F]/g,              lang: 'hi' },  // Devanagari → Hindi
  { re: /[\u4E00-\u9FFF\u3400-\u4DBF]/g, lang: 'zh' },  // CJK Unified → Chinese (also used in ja/ko)
]

// Latin script range — covers ASCII letters and Latin Extended
const LATIN_RE = /[A-Za-z\u00C0-\u024F]/g

/**
 * Detect the dominant script/language of a text string using Unicode ranges.
 * Returns a BCP-47 code or null if text is too short or predominantly Latin.
 * This is purely local — no network calls.
 */
export function detectScriptLanguage(text: string): string | null {
  // Strip numbers, punctuation, whitespace — only look at "letter" chars
  const letters = text.replace(/[\d\s\p{P}\p{S}]/gu, '')
  if (letters.length < 4) return null

  const latinCount = (letters.match(LATIN_RE) || []).length

  // Check each non-Latin script
  for (const { re, lang } of SCRIPT_RANGES) {
    re.lastIndex = 0
    const count = (letters.match(re) || []).length
    // If this script accounts for ≥ 20% of letters, it's significant
    if (count >= letters.length * 0.2) {
      // Special case: CJK can be Chinese, Japanese, or Korean.
      // If we already matched Hiragana/Katakana or Hangul above, those took priority.
      // If CJK chars dominate without kana/hangul → Chinese.
      return lang
    }
  }

  // Predominantly Latin
  if (latinCount >= letters.length * 0.7) return 'en' // approximate — Latin-script language
  return null
}

// Detect the language of a text string via Google Translate API
export async function detectLanguage(text: string): Promise<string | null> {
  try {
    const sample = encodeURIComponent(text.slice(0, 500))
    const url = `${GT_URL}?client=gtx&sl=auto&tl=en&dt=t&dt=ld&q=${sample}`
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const data = await res.json()
    // Detected language is the 3rd top-level element
    return (data[2] as string) ?? null
  } catch {
    return null
  }
}

// Translate text to target language.
// Preserves code blocks by replacing them with placeholders before translation.
export async function translate(
  text: string,
  targetLang: string,
  sourceLang = 'auto'
): Promise<TranslateResult | null> {
  try {
    // Extract code blocks and replace with placeholders
    const codeBlocks: string[] = []
    const protectedText = text.replace(/```[\s\S]*?```|`[^`]+`/g, match => {
      const placeholder = `CODEBLOCK_${codeBlocks.length}_END`
      codeBlocks.push(match)
      return placeholder
    })

    // Split into chunks ≤ 4800 chars to stay within URL limits
    const CHUNK = 4800
    const chunks: string[] = []
    for (let i = 0; i < protectedText.length; i += CHUNK) {
      chunks.push(protectedText.slice(i, i + CHUNK))
    }

    const responses = await Promise.all(chunks.map(chunk => {
      const url =
        `${GT_URL}?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&dt=ld` +
        `&q=${encodeURIComponent(chunk)}`
      return fetch(url, { signal: AbortSignal.timeout(15000) })
        .then(res => res.ok ? res.json() : null)
        .catch(() => null)
    }))

    // If any chunk failed, bail — translator contract returns null on failure
    if (responses.some(r => r === null)) return null

    const translatedParts = responses.map(data => {
      return (data[0] as Array<[string, ...unknown[]]>)
        .map(pair => pair[0] ?? '')
        .join('')
    })

    // Pick up detected language from first chunk
    let detectedLang = sourceLang
    if (detectedLang === 'auto' && responses[0]?.[2]) {
      detectedLang = responses[0][2] as string
    }

    let result = translatedParts.join('')

    // Restore code blocks
    codeBlocks.forEach((block, i) => {
      result = result.replace(`CODEBLOCK_${i}_END`, block)
    })

    return {
      translatedText: result,
      detectedLanguage: detectedLang === 'auto' ? 'unknown' : detectedLang,
    }
  } catch {
    return null
  }
}

// Check if translation is needed using local script detection (no network call).
// Returns the detected language code if translation is needed, or null if not.
export function needsTranslation(
  text: string,
  targetLang: string,
  minLength = 200
): string | null {
  // Strip markdown formatting
  const plainText = text.replace(/```[\s\S]*?```|`[^`]+`|\[.*?\]\(.*?\)|#+\s|[*_]{1,2}/g, '')
  if (plainText.length < minLength) return null

  const detected = detectScriptLanguage(plainText)
  if (!detected) return null

  // Same language — no translation needed.
  // Handle variants e.g. zh, zh-TW, zh-CN all match 'zh'
  if (detected.startsWith(targetLang) || targetLang.startsWith(detected)) return null
  return detected
}
