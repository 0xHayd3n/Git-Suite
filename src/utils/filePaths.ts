/**
 * Resolve a relative path against a base directory path.
 * resolveRelativePath('docs', '../README.md') => 'README.md'
 * resolveRelativePath('src/components', './Button.tsx') => 'src/components/Button.tsx'
 * resolveRelativePath('', 'docs/guide.md') => 'docs/guide.md'
 */
export function resolveRelativePath(basePath: string, relativePath: string): string {
  // Strip leading ./ from relative path
  let rel = relativePath.replace(/^\.\//, '')

  // Start from base directory segments
  const segments = basePath ? basePath.split('/') : []

  // Process ../ prefixes
  while (rel.startsWith('../')) {
    segments.pop()
    rel = rel.slice(3)
  }

  // Append remaining path
  if (rel) segments.push(...rel.split('/'))

  return segments.join('/')
}

export type LinkType = 'anchor' | 'internal' | 'external'

/**
 * Classify a link href found in a markdown file.
 * Returns the link type and resolved path (for internal links).
 */
export function classifyLink(
  href: string,
  basePath: string,
  repoOwner: string,
  repoName: string,
): { type: LinkType; resolvedPath?: string } {
  if (!href) return { type: 'external' }

  // Anchor links
  if (href.startsWith('#')) return { type: 'anchor' }

  // Absolute GitHub URLs pointing to same repo
  const ghBlobMatch = href.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/(blob|tree)\/[^/]+\/(.+)$/
  )
  if (ghBlobMatch) {
    const [, owner, name, , path] = ghBlobMatch
    if (owner.toLowerCase() === repoOwner.toLowerCase() && name.toLowerCase() === repoName.toLowerCase()) {
      return { type: 'internal', resolvedPath: path }
    }
    return { type: 'external' }
  }

  // External URLs
  if (href.startsWith('http://') || href.startsWith('https://')) {
    return { type: 'external' }
  }

  // Relative paths — internal blob links
  const resolvedPath = resolveRelativePath(basePath, href)
  return { type: 'internal', resolvedPath }
}
