const GENERATED_START = '<!-- generated:start -->'
const GENERATED_END   = '<!-- generated:end -->'
const USER_START      = '<!-- user:start -->'
const USER_END        = '<!-- user:end -->'

/** Extract the content between generated markers, or null if not present. */
export function extractGeneratedBlock(content: string): string | null {
  const start = content.indexOf(GENERATED_START)
  const end   = content.indexOf(GENERATED_END)
  if (start === -1 || end === -1 || end <= start) return null
  return content.slice(start + GENERATED_START.length, end)
}

/** Extract the full user block including its markers, or null if not present. */
function extractUserBlockFull(content: string): string | null {
  const start = content.indexOf(USER_START)
  const end   = content.indexOf(USER_END)
  if (start === -1 || end === -1 || end <= start) return null
  return content.slice(start, end + USER_END.length)
}

/**
 * Returns true when the generated block in the current file on disk differs
 * from the generated block in the last content we wrote (stored in DB).
 * A difference means the user edited inside the generated section.
 */
export function detectConflict(storedContent: string, currentContent: string): boolean {
  const storedBlock   = extractGeneratedBlock(storedContent)
  const currentBlock  = extractGeneratedBlock(currentContent)
  if (storedBlock === null || currentBlock === null) return false
  return storedBlock.trim() !== currentBlock.trim()
}

/**
 * Merge: take the generated block from newContent, preserve the user block
 * from currentFile. If currentFile has no markers (first generation), returns
 * newContent unchanged.
 */
export function mergeWithCurrentFile(currentFile: string, newContent: string): string {
  const userBlock = extractUserBlockFull(currentFile)
  if (!userBlock) return newContent

  const userStartInNew = newContent.indexOf(USER_START)
  const userEndInNew   = newContent.indexOf(USER_END)
  if (userStartInNew === -1 || userEndInNew === -1) return newContent

  return (
    newContent.slice(0, userStartInNew) +
    userBlock +
    newContent.slice(userEndInNew + USER_END.length)
  )
}

export interface RegenerationCheckResult {
  /** True when the user has edited the generated block since last generation. */
  conflict: boolean
  /** The merged content to write, or null if a conflict requires user resolution. */
  merged: string | null
}

/**
 * Full regeneration check. Given the new generated content, the stored DB
 * content, and the current file on disk:
 * - If no conflict: returns merged content (new generated + preserved user block).
 * - If conflict: returns { conflict: true, merged: null }.
 * - If first generation (no stored content): returns new content as-is.
 */
export function prepareWrite(
  newContent: string,
  storedContent: string | null,
  currentFileContent: string | null,
): RegenerationCheckResult {
  if (!storedContent || !currentFileContent) {
    return { conflict: false, merged: newContent }
  }

  if (detectConflict(storedContent, currentFileContent)) {
    return { conflict: true, merged: null }
  }

  return { conflict: false, merged: mergeWithCurrentFile(currentFileContent, newContent) }
}
