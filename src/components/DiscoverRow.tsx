import { useState, useEffect } from 'react'
import './DiscoverRow.css'
import DitherBackground from './DitherBackground'
import LanguageIcon from './LanguageIcon'
import { formatCount, formatRecency } from './RepoCard'
import { getLangColor } from '../lib/languages'
import { getSubTypeConfig, getBucketGradient, getBucketColor } from '../config/repoTypeConfig'
import { parseTopics, type RepoRow } from '../types/repo'

interface DiscoverRowProps {
  repos: RepoRow[]
  activeIndex: number
  columns: number
  onNavigate: (path: string) => void
  onMore: () => void
  onPause: (paused: boolean) => void
  onAdvance: (delta: number) => void
}

function DiscoverRowCardItem({
  repo,
  posIndex,
  columns,
  onNavigate,
}: {
  repo: RepoRow
  posIndex: number
  columns: number
  onNavigate: (path: string) => void
}) {
  const [starred, setStarred] = useState(!!repo.starred_at)
  const [starWorking, setStarWorking] = useState(false)

  useEffect(() => { setStarred(!!repo.starred_at) }, [repo.starred_at])

  const handleStar = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (starWorking) return
    setStarWorking(true)
    try {
      if (starred) {
        await window.api.github.unstarRepo(repo.owner, repo.name)
        setStarred(false)
      } else {
        await window.api.github.starRepo(repo.owner, repo.name)
        setStarred(true)
      }
    } catch { /* silently ignore */ }
    finally { setStarWorking(false) }
  }

  const langColor = getLangColor(repo.language)
  const typeConfig = getSubTypeConfig(repo.type_sub)
  const gradient = getBucketGradient(typeConfig?.accentColor ?? getBucketColor(repo.type))
  const isPrev = posIndex === -1
  const isActive = posIndex === 0
  const GAP = 16 // must match discover-grid gap
  // Card width = (100% - (N-1)*16px) / N  — identical to grid 1fr columns
  // Position of slot i = i * (card_width + gap) = i * (100% + 16px) / N
  const cardWidth = `calc((100% - ${(columns - 1) * GAP}px) / ${columns})`
  const cardLeft = isPrev
    ? `calc(-1 * (100% + ${GAP}px) / ${columns})`
    : `calc(${posIndex} * (100% + ${GAP}px) / ${columns})`
  const targetOpacity = isPrev ? 0.22 : 1
  const topics = parseTopics(repo.topics).slice(0, 3)
  const recency = formatRecency(repo.pushed_at)
  const licenseText = repo.license && repo.license !== 'NOASSERTION' ? repo.license : 'N/A'
  const firstSentence = (() => {
    if (!repo.description) return ''
    const match = repo.description.match(/^.*?[.!?](?=\s|$)/)
    return match ? match[0] : repo.description
  })()

  return (
    <button
      key={repo.id}
      className={`discover-row-card${isPrev ? ' discover-row-card--prev' : isActive ? ' discover-row-card--p0' : ''}${starred ? ' discover-row-card--starred' : ''}`}
      style={{ width: cardWidth, left: cardLeft, opacity: targetOpacity, '--target-opacity': targetOpacity } as React.CSSProperties}
      onClick={!isPrev ? () => onNavigate(`/repo/${repo.owner}/${repo.name}`) : undefined}
      aria-label={`${repo.owner}/${repo.name}`}
      tabIndex={isPrev ? -1 : undefined}
    >
      <div className="discover-row-card-dither">
        <DitherBackground avatarUrl={repo.avatar_url} fallbackGradient={gradient} />
        <button
          className={`repo-card-badge-br${starred ? ' starred' : ''}`}
          onClick={handleStar}
          disabled={starWorking || isPrev}
          title={starred ? 'Unstar' : 'Star'}
          aria-label={starred ? 'Unstar' : 'Star'}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill={starred ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
          <span>{formatCount(repo.stars)}</span>
        </button>
      </div>
      <div className="discover-row-card-info">
        <div className="discover-row-card-top">
          {repo.avatar_url && (
            <img className="discover-row-card-avatar" src={repo.avatar_url} alt="" />
          )}
          <div className="discover-row-card-top-text">
            <div className="discover-row-card-name">{repo.name}</div>
            {firstSentence && (
              <div className="discover-row-card-desc">{firstSentence}</div>
            )}
          </div>
        </div>
        <div className="discover-row-card-grow" />
        <div className="discover-row-card-footer">
          <div className="discover-row-card-footer-left">
            <div className="discover-row-card-stats">
              <span className="discover-row-card-stat discover-row-card-owner">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
                {repo.owner}
              </span>
              {recency && (
                <span className="discover-row-card-stat">{recency}</span>
              )}
              <span className="discover-row-card-stat discover-row-card-license">{licenseText}</span>
            </div>
            {topics.length > 0 && (
              <div className="discover-row-card-tags">
                {topics.map(tag => (
                  <span key={tag} className="discover-row-card-tag">{tag}</span>
                ))}
              </div>
            )}
          </div>
          <div className="discover-row-card-footer-badges">
            {repo.language && (
              <span
                className="repo-card-icon-badge"
                style={{ '--badge-color': langColor } as React.CSSProperties}
              >
                <span className="repo-card-icon-badge-icon">
                  <LanguageIcon lang={repo.language} size={18} boxed />
                </span>
                <span className="repo-card-icon-badge-text">{repo.language}</span>
              </span>
            )}
            {typeConfig && (
              <span
                className="repo-card-icon-badge"
                style={{ '--badge-color': typeConfig.accentColor } as React.CSSProperties}
              >
                {typeConfig.icon && (
                  <span className="repo-card-icon-badge-icon">
                    <span className="repo-card-subtype-icon" style={{ backgroundColor: typeConfig.accentColor }}>
                      <typeConfig.icon size={14} fill="#fff" stroke="#fff" strokeWidth={0.75} />
                    </span>
                  </span>
                )}
                <span className="repo-card-icon-badge-text">{typeConfig.label}</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}

export default function DiscoverRow({ repos, activeIndex, columns, onNavigate, onMore, onPause, onAdvance }: DiscoverRowProps) {
  if (repos.length === 0) return null

  const visible = Math.min(columns, repos.length)
  const slots: { repo: RepoRow; posIndex: number }[] = Array.from({ length: visible }, (_, i) => ({
    repo: repos[(activeIndex + i) % repos.length],
    posIndex: i,
  }))

  if (repos.length > visible) {
    slots.unshift({
      repo: repos[(activeIndex - 1 + repos.length) % repos.length],
      posIndex: -1,
    })
  }

  return (
    <div className="discover-row">
      <div className="discover-row-header">
        <button className="discover-row-title-btn" onClick={onMore} aria-label="See all recommended repos">
          <span>Recommended for You</span>
          <span className="discover-row-title-chevron" aria-hidden="true">›</span>
        </button>
      </div>
      <div
        className="discover-row-carousel"
        onMouseEnter={() => onPause(true)}
        onMouseLeave={() => onPause(false)}
      >
        {slots.map(({ repo, posIndex }) => (
          <DiscoverRowCardItem
            key={repo.id}
            repo={repo}
            posIndex={posIndex}
            columns={columns}
            onNavigate={onNavigate}
          />
        ))}
        <button
          className="discover-row-nav-zone discover-row-nav-zone--prev"
          onClick={() => onAdvance(-1)}
          aria-label="Previous"
        >
          <span aria-hidden="true">‹</span>
        </button>
        <button
          className="discover-row-nav-zone discover-row-nav-zone--next"
          onClick={() => onAdvance(1)}
          aria-label="Next"
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>
    </div>
  )
}
