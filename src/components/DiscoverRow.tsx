import './DiscoverRow.css'
import DitherBackground from './DitherBackground'
import LanguageIcon from './LanguageIcon'
import { formatCount } from './RepoCard'
import { getLangColor } from '../lib/languages'
import { getSubTypeConfig } from '../config/repoTypeConfig'
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
        {repos.map((repo, i) => {
          const typeConfig = getSubTypeConfig(repo.type_sub)
          const langColor = getLangColor(repo.language)
          return (
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
                {(repo.stars != null) && (
                  <div className="discover-row-card-meta">
                    ⭐ {formatCount(repo.stars)}
                  </div>
                )}
                <div className="discover-row-card-badges">
                  {repo.language && (
                    <span
                      className="discover-row-badge"
                      style={{ '--badge-color': langColor } as React.CSSProperties}
                    >
                      <LanguageIcon lang={repo.language} size={13} boxed />
                      <span className="discover-row-badge-label">{repo.language}</span>
                    </span>
                  )}
                  {typeConfig && (
                    <span
                      className="discover-row-badge"
                      style={{ '--badge-color': typeConfig.accentColor } as React.CSSProperties}
                    >
                      {typeConfig.icon && (
                        <span className="discover-row-badge-type-icon" style={{ backgroundColor: typeConfig.accentColor }}>
                          <typeConfig.icon size={10} fill="#fff" stroke="#fff" strokeWidth={0.75} />
                        </span>
                      )}
                      <span className="discover-row-badge-label">{typeConfig.label}</span>
                    </span>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
