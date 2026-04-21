import { memo, useState, useRef, useEffect } from 'react'

export interface TocItem {
  id: string
  text: string
  level: number
  parentId: string | null
}

/**
 * Scrolls ONLY the nearest ancestor that has a real scrollbar.
 * Using Element.scrollIntoView() would also shift the scrollTop of every
 * `overflow: hidden` ancestor in the chain.
 */
export function scrollTargetIntoView(target: HTMLElement): void {
  let el: HTMLElement | null = target.parentElement
  while (el) {
    const { overflowY } = getComputedStyle(el)
    if (overflowY === 'auto' || overflowY === 'scroll') {
      const containerRect = el.getBoundingClientRect()
      const targetRect    = target.getBoundingClientRect()
      el.scrollTo({
        top: el.scrollTop + (targetRect.top - containerRect.top),
        behavior: 'smooth',
      })
      return
    }
    el = el.parentElement
  }
  window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY, behavior: 'smooth' })
}

/**
 * Standalone table-of-contents nav with scroll spy.
 *
 * Props:
 * - headings: TOC items extracted by the parent (ReadmeRenderer → RepoDetail).
 *   TocNav does NOT extract these itself — the parent owns the canonical list.
 * - scrollContainerRef: the element whose scroll events drive the active highlight
 *   (the .article-layout-body pane).
 * - headingsContainerRef: the element to query live during scroll for current
 *   heading positions (the .readme-body div inside ReadmeRenderer).
 */
const TocNav = memo(function TocNav({
  headings,
  scrollContainerRef,
  headingsContainerRef,
}: {
  headings: TocItem[]
  scrollContainerRef: React.RefObject<HTMLElement>
  headingsContainerRef: React.RefObject<HTMLElement>
}) {
  const [activeId, setActiveId] = useState<string>(headings[0]?.id ?? '')
  const isNavigating            = useRef(false)
  const navTimeoutRef           = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset activeId when heading list changes (e.g. switching repos)
  useEffect(() => {
    setActiveId(headings[0]?.id ?? '')
  }, [headings])

  useEffect(() => {
    if (headings.length < 2) return
    const scrollEl     = scrollContainerRef.current
    const headingsRoot = headingsContainerRef.current
    if (!scrollEl || !headingsRoot) return

    // Sticky top panel inside the scroll container covers the first N pixels —
    // query it each frame so the threshold tracks collapsed vs expanded state.
    const stickyEl = scrollEl.querySelector('.article-layout-sticky-top') as HTMLElement | null

    let rafId      = 0
    let lastActive = headings[0].id

    const updateActive = () => {
      if (isNavigating.current) return
      if (rafId) return
      rafId = requestAnimationFrame(() => {
        rafId = 0
        const paneTop = scrollEl.getBoundingClientRect().top
        const stickyBottom = stickyEl ? stickyEl.getBoundingClientRect().bottom : paneTop
        const threshold = stickyBottom + 40
        const liveHeadings = Array.from(
          headingsRoot.querySelectorAll('h2[id], h3[id]')
        ) as HTMLElement[]
        let active = headings[0].id
        for (const h of liveHeadings) {
          if (h.getBoundingClientRect().top <= threshold) active = h.id
        }
        if (active !== lastActive) {
          lastActive = active
          setActiveId(active)
        }
      })
    }

    updateActive()
    scrollEl.addEventListener('scroll', updateActive, { passive: true })
    return () => {
      scrollEl.removeEventListener('scroll', updateActive)
      if (rafId) cancelAnimationFrame(rafId)
      if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current)
    }
  }, [headings, scrollContainerRef, headingsContainerRef])

  if (headings.length < 2) return null

  const activeItem   = headings.find(t => t.id === activeId)
  const expandedH2Id = activeItem?.level === 2 ? activeItem.id : (activeItem?.parentId ?? null)
  const h2sWithChildren = new Set(
    headings.filter(t => t.parentId !== null).map(t => t.parentId!)
  )

  return (
    <nav className="rm-toc" aria-label="On this page">
      <span className="rm-toc-label">On this page</span>
      {headings.map(item => {
        if (item.level === 3 && item.parentId !== expandedH2Id) return null
        const hasChildren = item.level === 2 && h2sWithChildren.has(item.id)
        const isExpanded  = hasChildren && item.id === expandedH2Id
        return (
          <a
            key={item.id}
            href={`#${item.id}`}
            className={[
              'rm-toc-item',
              `rm-toc-h${item.level}`,
              activeId === item.id ? 'rm-toc-active'   : '',
              isExpanded            ? 'rm-toc-expanded' : '',
            ].filter(Boolean).join(' ')}
            title={item.text}
            onClick={(e) => {
              e.preventDefault()
              isNavigating.current = true
              if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current)
              navTimeoutRef.current = setTimeout(() => { isNavigating.current = false }, 1000)
              const heading = document.getElementById(item.id)
              if (heading) scrollTargetIntoView(heading)
              setActiveId(item.id)
            }}
          >
            <span className="rm-toc-text">{item.text}</span>
            {hasChildren && (
              <span className="rm-toc-chevron" aria-hidden="true">
                <svg width="8" height="8" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z"/>
                </svg>
              </span>
            )}
          </a>
        )
      })}
    </nav>
  )
})

export default TocNav
