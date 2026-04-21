import Anthropic from '@anthropic-ai/sdk'

export async function extractTags(
  query: string,
  knownTopics: string[],
  apiKey: string
): Promise<string[]> {
  const client = new Anthropic({ apiKey })
  const topicSample = knownTopics.slice(0, 300).join(', ')

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages: [{
      role: 'user',
      content: `You are a GitHub repository search assistant. Extract search tags from the user's query.

Known GitHub topics (use these when they match): ${topicSample}

User query: "${query}"

Return ONLY a JSON array of 3-6 lowercase tags. Prefer exact matches from the known topics list. Include the programming language if mentioned. Add inferred synonyms if useful.

Examples:
"fast async HTTP client for Python" → ["http", "python", "async", "http-client", "requests"]
"render markdown in terminal" → ["markdown", "terminal", "cli", "renderer", "ansi"]
"small library to parse CSV files" → ["csv", "parser", "lightweight", "data"]

Return only the JSON array, nothing else.`,
    }],
  })

  try {
    const text = response.content[0].type === 'text' ? response.content[0].text : '[]'
    return JSON.parse(text.trim())
  } catch {
    return query.toLowerCase().split(/\s+/).filter(w => w.length > 2).slice(0, 5)
  }
}
