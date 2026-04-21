export type ToolType = 'mcp' | 'webapp' | 'cli' | 'widget' | 'blank'

export interface CreateTemplate {
  id: string
  name: string
  description: string
  toolType: ToolType
  gradient: [string, string]
  emoji: string
}

export interface CreateMessage {
  role: 'user' | 'assistant'
  content: string
  changedFiles?: string[]
  timestamp: number
}

export interface CreateSession {
  id: string
  name: string
  templateId: string
  toolType: ToolType
  repoIds: string[]
  chatHistory: CreateMessage[]
  localPath: string | null
  publishStatus: 'draft' | 'published'
  githubRepoUrl: string | null
  createdAt: string
  updatedAt: string
  // runtime only — not persisted
  filesMissing?: boolean
}

export interface CreateSessionRow {
  id: string
  name: string
  template_id: string
  tool_type: ToolType
  repo_ids: string
  chat_history: string
  local_path: string | null
  publish_status: 'draft' | 'published'
  github_repo_url: string | null
  created_at: string
  updated_at: string
}
