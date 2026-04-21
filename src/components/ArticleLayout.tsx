// src/components/ArticleLayout.tsx
import React, { useEffect, useRef, useState } from 'react'
import { setDitherScrollHint } from '../hooks/useBayerDither'
import './ArticleLayout.css'

export type ArticleLayoutProps = {
  byline: React.ReactNode
  title: React.ReactNode
  /** Optional right-side content on the title row (e.g. metadata pills) */
  titleExtras?: React.ReactNode
  /** Optional description line below the title row */
  description?: React.ReactNode
  tabs: React.ReactNode
  body: React.ReactNode
  actionRow: React.ReactNode
  /** Optional content rendered between the action row and the tabs divider (e.g. inline clone panel) */
  actionRowExtras?: React.ReactNode
  /** Optional nav/breadcrumb bar rendered above the byline; collapses with the rest of the top panel */
  navBar?: React.ReactNode
  /** Optional dithered banner rendered between byline and title */
  dither?: React.ReactNode
  /** When true, body renders without internal padding (for Files / Components tabs) and the smart-collapse is disabled */
  fullBleedBody?: boolean
  /** Forwarded ref to the scroll container (the .article-layout element itself) */
  scrollRef?: React.RefObject<HTMLDivElement>
  /** When provided, body renders as two columns: content | divider | toc. Pass only on readme tab. */
  tocSlot?: React.ReactNode
  /** When provided, body renders a right-hand panel mirroring the TOC slot layout. Pass only on readme tab. */
  statsSlot?: React.ReactNode
  /** Forwarded ref to the body-content scroll container when tocSlot is active (replaces scrollRef for TocNav) */
  bodyScrollRef?: React.RefObject<HTMLDivElement>
}

const SCROLL_UP_REVEAL_THRESHOLD = 80 // accumulated upward scroll (px) required to re-expand the top panel

export function ArticleLayout({
  byline,
  title,
  titleExtras,
  description,
  tabs,
  body,
  actionRow,
  actionRowExtras,
  navBar,
  dither,
  fullBleedBody = false,
  scrollRef,
  tocSlot,
  statsSlot,
  bodyScrollRef,
}: ArticleLayoutProps) {
  const internalScrollRef = useRef<HTMLDivElement>(null)
  const resolvedScrollRef = scrollRef ?? internalScrollRef
  const topPanelRef = useRef<HTMLDivElement>(null)
  const [topHeight, setTopHeight] = useState(800)
  const [collapsed, setCollapsed] = useState(false)
  const lastY = useRef(0)
  const upAccum = useRef(0)

  // Measure top panel content height (scrollHeight so it's accurate even when max-height:0)
  useEffect(() => {
    const el = topPanelRef.current
    if (!el) return
    const update = () => setTopHeight(el.scrollHeight)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Smart collapse: hide top panel on scroll-down, reveal on accumulated scroll-up
  useEffect(() => {
    if (fullBleedBody) return
    const el = (bodyScrollRef ?? resolvedScrollRef).current
    if (!el) return
    lastY.current = el.scrollTop
    let scrollRaf = 0
    const onScroll = () => {
      setDitherScrollHint(true)
      if (scrollRaf) return
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = 0
        const y = el.scrollTop
        const dy = y - lastY.current
        if (y <= 4) {
          setCollapsed(false)
          upAccum.current = 0
        } else if (dy > 0) {
          upAccum.current = 0
          if (y > topHeight) setCollapsed(true)
        } else if (dy < 0) {
          upAccum.current += -dy
          if (upAccum.current > SCROLL_UP_REVEAL_THRESHOLD) {
            setCollapsed(false)
            upAccum.current = 0
          }
        }
        lastY.current = y
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [fullBleedBody, topHeight, resolvedScrollRef, bodyScrollRef])

  // Collapse header when entering full-bleed tabs (Files / Components), expand on exit.
  useEffect(() => {
    if (fullBleedBody) {
      setCollapsed(true)
      upAccum.current = 0
      lastY.current = 0
    } else {
      setCollapsed(false)
      upAccum.current = 0
    }
  }, [fullBleedBody])

  return (
    <div
      ref={resolvedScrollRef}
      className={`article-layout${fullBleedBody ? ' article-layout--fullbleed' : ''}${(tocSlot || statsSlot) ? ' article-layout--has-toc' : ''}`}
      style={{ '--top-panel-height': `${topHeight}px` } as React.CSSProperties}
    >
      <div
        className="article-layout-sticky-top"
        data-collapsed={collapsed ? 'true' : undefined}
      >
        {navBar && <div className="article-layout-navbar-slot">{navBar}</div>}
        <div ref={topPanelRef} className="article-layout-top-panel">
          <div className="article-layout-byline">{byline}</div>
          {dither && <div className="article-layout-dither">{dither}</div>}
          <div className="article-layout-title-row">
            <div className="article-layout-title">{title}</div>
            {titleExtras && <div className="article-layout-title-extras">{titleExtras}</div>}
          </div>
          {description && <div className="article-layout-description">{description}</div>}
          {actionRow != null && <div className="article-layout-actions">{actionRow}</div>}
          {actionRowExtras && <div className="article-layout-action-row-extras">{actionRowExtras}</div>}
        </div>
        <div className="article-layout-tabs-slot">{tabs}</div>
      </div>
      <div
        className={`article-layout-body${fullBleedBody ? ' article-layout-body--full-bleed' : ''}${(tocSlot || statsSlot) ? ' article-layout-body--with-toc' : ''}`}
      >
        {(tocSlot || statsSlot) ? (
          <>
            {tocSlot && <div className="article-layout-toc-slot">{tocSlot}</div>}
            <div ref={bodyScrollRef} className="article-layout-body-content">{body}</div>
            {statsSlot && <div className="article-layout-stats-slot">{statsSlot}</div>}
          </>
        ) : body}
      </div>
    </div>
  )
}
