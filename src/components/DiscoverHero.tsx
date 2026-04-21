import { useState, useEffect, useRef } from 'react'
import './DiscoverHero.css'
import DitherBackground from './DitherBackground'
import LanguageIcon from './LanguageIcon'
import { formatCount } from './RepoCard'
import { getLangColor } from '../lib/languages'
import { getSubTypeConfig } from '../config/repoTypeConfig'
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
  const typeConfig = getSubTypeConfig(repo.type_sub)

  // Use cached translation if the description is non-English, or resolve async
  const [desc, setDesc] = useState<string | null>(() => {
    if (repo.detected_language && repo.detected_language !== 'en' && repo.translated_description) {
      return repo.translated_description
    }
    return repo.description
  })

  useEffect(() => {
    setDesc(() => {
      if (repo.detected_language && repo.detected_language !== 'en' && repo.translated_description) {
        return repo.translated_description
      }
      return repo.description
    })

    if (!repo.description || repo.description.length < 6) return

    async function maybeTranslate() {
      try {
        const preferredLang = await window.api.settings.getPreferredLanguage().catch(() => 'en')
        if (repo.translated_description && repo.translated_description_lang === preferredLang) {
          setDesc(repo.translated_description)
          return
        }
        const scriptLang = await window.api.translate.check(repo.description!, preferredLang, 6).catch(() => null)
        if (!scriptLang) return
        const result = await window.api.translate.translate(repo.description!, preferredLang).catch(() => null)
        if (!result) return
        setDesc(result.translatedText)
        if (repo.id) {
          window.api.db.cacheTranslatedDescription(repo.id, result.translatedText, preferredLang, scriptLang).catch(() => {})
        }
      } catch { /* non-critical */ }
    }

    maybeTranslate()
  }, [repo.id]) // eslint-disable-line react-hooks/exhaustive-deps

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
        {desc && <div className="discover-hero-desc">{desc}</div>}
        <div className="discover-hero-meta">
          {repo.language && (
            <span className="discover-hero-meta-item discover-hero-badge" style={{ '--badge-color': langColor } as React.CSSProperties}>
              <LanguageIcon lang={repo.language} size={14} boxed />
              <span>{repo.language}</span>
            </span>
          )}
          {typeConfig && (
            <span className="discover-hero-meta-item discover-hero-badge" style={{ '--badge-color': typeConfig.accentColor } as React.CSSProperties}>
              {typeConfig.icon && (
                <span className="discover-hero-type-icon" style={{ backgroundColor: typeConfig.accentColor }}>
                  <typeConfig.icon size={10} fill="#fff" stroke="#fff" strokeWidth={0.75} />
                </span>
              )}
              <span>{typeConfig.label}</span>
            </span>
          )}
          {repo.stars != null && (
            <span className="discover-hero-star-badge">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              <span>{formatCount(repo.stars)}</span>
            </span>
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
