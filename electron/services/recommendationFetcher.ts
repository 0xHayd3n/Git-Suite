// electron/services/recommendationFetcher.ts
import { searchRepos } from '../github'
import type { GitHubRepo } from '../github'
import type { UserProfile } from '../../src/types/recommendation'

export interface QueryPlan {
  topic: string
  coldStart: boolean
}

const TOP_TOPICS_COUNT = 5
const PER_TOPIC_RESULTS = 25
const STAR_THRESHOLD = 10
const COLD_START_THRESHOLD = 50000
const COLD_START_RESULTS = 100

export function planQueries(profile: UserProfile): QueryPlan[] {
  const entries = [...profile.topicAffinity.entries()].sort((a, b) => b[1] - a[1])
  if (entries.length === 0) {
    return [{ topic: '', coldStart: true }]
  }
  return entries.slice(0, TOP_TOPICS_COUNT).map(([topic]) => ({ topic, coldStart: false }))
}

export async function fetchCandidates(
  token: string | null,
  queries: QueryPlan[],
): Promise<GitHubRepo[]> {
  const seen = new Set<number>()
  const merged: GitHubRepo[] = []

  const results = await Promise.allSettled(
    queries.map(async (q) => {
      if (q.coldStart) {
        return searchRepos(token, `stars:>${COLD_START_THRESHOLD}`, COLD_START_RESULTS, 'stars', 'desc', 1)
      }
      // Empty sort = GitHub default best-match ranking
      return searchRepos(token, `topic:${q.topic} stars:>${STAR_THRESHOLD}`, PER_TOPIC_RESULTS, '', 'desc', 1)
    })
  )

  for (const r of results) {
    if (r.status === 'fulfilled') {
      for (const repo of r.value) {
        if (!seen.has(repo.id)) {
          seen.add(repo.id)
          merged.push(repo)
        }
      }
    }
  }
  return merged
}
