/**
 * Sanitise a GitHub tag ref for safe use in a filename.
 * - Strips leading @scope/ prefix (e.g. @scope/v7 → v7)
 * - Replaces remaining / with _ (e.g. releases/v7.3.9 → releases_v7.3.9)
 * - Strips any character outside [a-zA-Z0-9._-] (removes spaces, etc.)
 */
export function sanitiseRef(ref: string): string {
  return ref
    .replace(/^@[^/]+\//, '')   // strip leading @scope/ prefix (e.g. @scope/v7 → v7)
    .replace(/\//g, '_')         // remaining slashes → underscores
    .replace(/[^a-zA-Z0-9._\-]/g, '')  // strip anything else unsafe in filenames
}
