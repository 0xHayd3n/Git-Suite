import { useState } from 'react'
import type { CollectionRow, CollectionRepoRow } from '../types/repo'
import Toggle from './Toggle'
import LangBadge from './LangBadge'
import BannerSVG from './BannerSVG'
import { useProfileOverlay } from '../contexts/ProfileOverlay'

interface CollDetailProps {
  coll: CollectionRow
  repos: CollectionRepoRow[]
  onToggle: () => void
  onDelete: () => void
  onInstall: (owner: string, name: string) => void
  onInstallAll: () => void
  installing: Set<string>
}

export default function CollDetail({
  coll,
  repos,
  onToggle,
  onDelete,
  onInstall,
  onInstallAll,
  installing,
}: CollDetailProps) {
  const [tab, setTab] = useState<'skills' | 'details'>('skills')
  const { openProfile } = useProfileOverlay()
  const isMine = coll.owner === 'user'
  const missing = repos.filter(r => r.saved === 0)
  const langs = [...new Set(repos.map(r => r.language).filter(Boolean))] as string[]
  const totalBytes = repos.reduce((s, r) => s + (r.content_size ?? 0), 0)
  const createdDate = coll.created_at ? new Date(coll.created_at).toLocaleDateString() : '—'

  return (
    <>
      <div className="coll-detail-banner">
        <BannerSVG
          owner={coll.owner}
          name={coll.name}
          typeBucket={null}
          size="detail"
        />
        <div className="coll-banner-name">{coll.name}</div>
      </div>

      <div className="coll-meta-bar">
        <div className="coll-meta-left">
          <span className="coll-meta-creator">
            {isMine ? 'Created by you' : `by ${coll.owner}`}
          </span>
          {isMine
            ? <span className="coll-mine-pill">mine</span>
            : <span className="coll-community-pill">community</span>
          }
          <span className={`coll-meta-count${missing.length > 0 ? ' has-missing' : ''}`}>
            {repos.length} skill{repos.length !== 1 ? 's' : ''}
            {missing.length > 0 && ` · ${missing.length} missing`}
          </span>
        </div>
        <div className="coll-meta-right">
          <Toggle on={coll.active === 1} onChange={() => onToggle()} ariaLabel="Toggle collection active" />
          <span className="coll-active-label">Active</span>
        </div>
      </div>

      <div className="coll-tabs">
        <button
          className={`coll-tab${tab === 'skills' ? ' active' : ''}`}
          onClick={() => setTab('skills')}
        >
          Skills
        </button>
        <button
          className={`coll-tab${tab === 'details' ? ' active' : ''}`}
          onClick={() => setTab('details')}
        >
          Details
        </button>
      </div>

      <div className="coll-tab-content">
        {tab === 'skills' && (
          <>
            {coll.description && (
              <div className="coll-description">{coll.description}</div>
            )}
            <div className="coll-section-label-detail">Skills in this collection</div>
            <div className="coll-skills-list">
              {repos.map(r => {
                const key = `${r.owner}/${r.name}`
                const isInstalling = installing.has(key)
                return (
                  <div key={key} className={`coll-skill-row${r.saved === 0 ? ' missing' : ''}`}>
                    <LangBadge lang={r.language} />
                    <div className="coll-skill-info">
                      <div className="coll-skill-name">{r.name}</div>
                      <div className="coll-skill-meta">
                        <button
                          className="owner-name-btn"
                          onClick={(e) => { e.stopPropagation(); openProfile(r.owner) }}
                        >
                          {r.owner}
                        </button>
                        {r.version ? ` · ${r.version}` : ''}
                        {r.content_size ? ` · ${Math.round(r.content_size / 1024)} KB` : ''}
                      </div>
                    </div>
                    <div className="coll-skill-status">
                      <div className={`coll-skill-dot ${r.saved === 1 ? 'saved' : 'missing'}`} />
                      <span className={`coll-skill-status-text ${r.saved === 1 ? 'saved' : 'missing'}`}>
                        {r.saved === 1 ? 'saved' : 'missing'}
                      </span>
                      {r.saved === 0 && (
                        <button
                          className="coll-save-btn"
                          disabled={isInstalling}
                          onClick={() => onInstall(r.owner, r.name)}
                        >
                          {isInstalling ? '⟳' : '+ Save'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {tab === 'details' && (
          <>
            <div className="coll-kv-list">
              <div className="coll-kv-row">
                <span className="coll-kv-key">Created</span>
                <span className="coll-kv-val">{createdDate}</span>
              </div>
              <div className="coll-kv-row">
                <span className="coll-kv-key">Repos</span>
                <span className="coll-kv-val">{repos.length}</span>
              </div>
              <div className="coll-kv-row">
                <span className="coll-kv-key">Total size</span>
                <span className="coll-kv-val">
                  {totalBytes > 0 ? `${Math.round(totalBytes / 1024)} KB` : '—'}
                </span>
              </div>
              <div className="coll-kv-row">
                <span className="coll-kv-key">Languages</span>
                <span className="coll-kv-val">{langs.length > 0 ? langs.join(', ') : '—'}</span>
              </div>
              {!isMine && (
                <div className="coll-kv-row">
                  <span className="coll-kv-key">Curator</span>
                  <span className="coll-kv-val">{coll.owner}</span>
                </div>
              )}
            </div>
            {isMine && (
              <button className="coll-delete-btn" onClick={onDelete}>
                Delete collection
              </button>
            )}
          </>
        )}
      </div>

      <div className="coll-footer">
        <span className={`coll-footer-status${missing.length > 0 ? ' has-missing' : ''}`}>
          {missing.length === 0
            ? `All ${repos.length} skills active in Claude Desktop`
            : `${missing.length} skill${missing.length !== 1 ? 's' : ''} missing — collection partially active`
          }
        </span>
        <div className="coll-footer-actions">
          {missing.length > 0 && (
            <button className="coll-save-all-btn" onClick={onInstallAll}>
              + Save all missing
            </button>
          )}
        </div>
      </div>
    </>
  )
}
