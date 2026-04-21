export interface AiChatMessage {
  role: 'user' | 'assistant'
  content: string
  contentHtml?: string
  repoCards?: { owner: string; name: string; description: string; stars: number; language: string }[]
  actions?: { action: string; owner: string; name: string; result?: string }[]
  timestamp: number
}
