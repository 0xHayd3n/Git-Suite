// electron/storybookDetector.ts

/** Build the ordered list of candidate base URLs to probe. */
export function buildCandidates(
  owner: string,
  name: string,
  homepage: string | null,
  extraCandidates: string[],
): string[] {
  const seen = new Set<string>()
  const add = (u: string) => { const n = u.replace(/\/$/, ''); if (n) seen.add(n) }

  if (homepage) add(homepage)
  add(`https://${owner}.github.io/${name}`)
  if (name.toLowerCase() === `${owner.toLowerCase()}.github.io`) {
    add(`https://${owner}.github.io`)
  }
  for (const c of extraCandidates) add(c)

  return [...seen]
}

/** Probe one base URL — try all known Storybook index paths in order.
 *  Returns the normalised base URL on success, or null. */
export async function probeStorybookUrl(base: string): Promise<string | null> {
  const b = base.replace(/\/$/, '')
  const probes = [
    `${b}/index.json`,
    `${b}/stories.json`,
    `${b}/storybook-static/index.json`,
    `${b}/storybook-static/stories.json`,
  ]
  for (const url of probes) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) continue
      const text = await res.text()
      JSON.parse(text)  // throws if not valid JSON
      return b
    } catch {
      // network error, timeout, or invalid JSON — try next probe
    }
  }
  return null
}
