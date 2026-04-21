import './DiscoverRow.css'
import DitherBackground from './DitherBackground'
import { formatCount } from './RepoCard'
import type { RepoRow } from '../types/repo'

interface DiscoverRowProps {
  repos: RepoRow[]
  activeIndex: number
  onNavigate: (path: string) => void
  onMore: () => void
  onHoverIndex: (index: number | null) => void
}

export default function DiscoverRow({ repos, activeIndex, onNavigate, onMore, onHoverIndex }: DiscoverRowProps) {
  if (repos.length === 0) return null

  return (
    <div className="discover-row">
      <div className="discover-row-header">
        <span className="discover-row-title">Recommended for You</span>
        <button className="discover-row-more" onClick={onMore} aria-label="More recommended repos">
          More →
        </button>
      </div>
      <div className="discover-row-cards">
        {repos.map((repo, i) => (
          <button
            key={repo.id}
            className={`discover-row-card${i === activeIndex ? ' active' : ''}`}
            onClick={() => onNavigate(`/repo/${repo.owner}/${repo.name}`)}
            onMouseEnter={() => onHoverIndex(i)}
            onMouseLeave={() => onHoverIndex(null)}
            aria-label={`${repo.owner}/${repo.name}`}
          >
            <DitherBackground avatarUrl={repo.avatar_url} />
            <div className="discover-row-card-content">
              <div className="discover-row-card-name">{repo.owner} / {repo.name}</div>
              {(repo.stars != null || repo.language) && (
                <div className="discover-row-card-meta">
                  {repo.stars != null && `⭐ ${formatCount(repo.stars)}`}
                  {repo.language && ` · ${repo.language}`}
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
