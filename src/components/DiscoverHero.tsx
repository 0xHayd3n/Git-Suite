import { useState, useEffect, useRef } from 'react'
import './DiscoverHero.css'
import DitherBackground from './DitherBackground'
import { formatCount } from './RepoCard'
import { getLangColor } from '../lib/languages'
import type { RepoRow } from '../types/repo'

interface DiscoverHeroProps {
  repo: RepoRow | null
  onNavigate: (path: string) => void
}

interface LayerProps {
  repo: RepoRow
  animClass: string
}

function HeroLayer({ repo, animClass }: LayerProps) {
  const langColor = getLangColor(repo.language)
  return (
    <div className={`discover-hero-layer ${animClass}`}>
      <DitherBackground avatarUrl={repo.avatar_url} />
      <div className="discover-hero-fade" />
      {repo.avatar_url && (
        <div className="discover-hero-avatar">
          <img className="discover-hero-avatar-img" src={repo.avatar_url} alt={repo.owner} />
          <span className="discover-hero-owner">{repo.owner}</span>
        </div>
      )}
      <div className="discover-hero-content">
        <div className="discover-hero-label">Featured · Top Recommended</div>
        <div className="discover-hero-title">{repo.owner} / {repo.name}</div>
        {repo.description && (
          <div className="discover-hero-desc">{repo.description}</div>
        )}
        <div className="discover-hero-meta">
          {repo.language && (
            <span className="discover-hero-meta-item">
              <span className="discover-hero-lang-dot" style={{ background: langColor }} />
              {repo.language}
            </span>
          )}
          {repo.stars != null && (
            <span className="discover-hero-meta-item">⭐ {formatCount(repo.stars)}</span>
          )}
          {repo.forks != null && (
            <span className="discover-hero-meta-item">🍴 {formatCount(repo.forks)}</span>
          )}
        </div>
      </div>
    </div>
  )
}

export default function DiscoverHero({ repo, onNavigate }: DiscoverHeroProps) {
  const [shownRepo, setShownRepo] = useState<RepoRow | null>(repo)
  const [outgoingRepo, setOutgoingRepo] = useState<RepoRow | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!repo || repo.id === shownRepo?.id) return

    if (timerRef.current) clearTimeout(timerRef.current)

    setOutgoingRepo(shownRepo)
    setShownRepo(repo)

    timerRef.current = setTimeout(() => {
      setOutgoingRepo(null)
    }, 450)
  }, [repo?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  if (!shownRepo && !outgoingRepo) return null

  const handleClick = () => {
    const r = shownRepo ?? outgoingRepo!
    onNavigate(`/repo/${r.owner}/${r.name}`)
  }

  return (
    <div className="discover-hero" onClick={handleClick}>
      {outgoingRepo && (
        <HeroLayer key={outgoingRepo.id + '-out'} repo={outgoingRepo} animClass="discover-hero-layer--out" />
      )}
      {shownRepo && (
        <HeroLayer key={shownRepo.id + '-in'} repo={shownRepo} animClass={outgoingRepo ? 'discover-hero-layer--in' : 'discover-hero-layer--stable'} />
      )}
    </div>
  )
}
