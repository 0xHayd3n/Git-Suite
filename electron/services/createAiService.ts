import type { CreateMessage } from '../../src/types/create'

export interface ExtractedFile {
  path: string
  content: string
}

export interface ExtractResult {
  files: ExtractedFile[]
  reply: string
}

export function extractFiles(response: string): ExtractResult {
  const filesMatch = response.match(/<files>([\s\S]*?)<\/files>/)
  if (!filesMatch) return { files: [], reply: response.trim() }

  const filesBlock = filesMatch[1]
  const fileMatches = [...filesBlock.matchAll(/<file path="([^"]+)">\n?([\s\S]*?)\n?<\/file>/g)]
  const files = fileMatches.map(m => ({ path: m[1], content: m[2] }))
  const reply = response.slice((filesMatch.index ?? 0) + filesMatch[0].length).trim()
  return { files, reply }
}

export function truncateHistory(history: CreateMessage[]): CreateMessage[] {
  if (history.length <= 20) return history
  const summary: CreateMessage = {
    role: 'assistant',
    content: `[Summary of first ${history.length - 15} messages: conversation established tool purpose, selected repos, and initial code structure.]`,
    timestamp: history[0].timestamp,
  }
  return [summary, ...history.slice(-15)]
}

export interface RepoContext {
  name: string
  description: string
  readmeExcerpt: string
}

export function buildSystemPrompt(templateName: string, toolType: string, repos: RepoContext[]): string {
  const repoSection = repos.length > 0
    ? `\n## Repo Context\n${repos.map(r =>
        `### ${r.name}\n${r.description}\n${r.readmeExcerpt.slice(0, 500)}`
      ).join('\n\n')}`
    : ''

  return `You are an expert software engineer building a "${templateName}" (type: ${toolType}) tool for the user.

Your job: have a conversation to understand what the user wants, then generate the code incrementally.

When you produce or update files, wrap them in this exact format:
<files>
<file path="src/example.ts">
// file content here
</file>
</files>

Then write a plain-English explanation of what changed and optionally ask a follow-up question.

If you are only asking a question or clarifying (no code changes), do NOT include a <files> block.
${repoSection}

Tool type: ${toolType}
Template: ${templateName}

Start by asking the user one focused question about the purpose of their tool.`
}
