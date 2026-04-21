import { useState, useEffect, useRef } from 'react'

const SEARCH_SUGGESTIONS = [
  'React frameworks',
  'machine learning tools',
  'CLI utilities',
  'Find a fast build tool',
  'neovim plugins',
  'state management',
  'computer vision projects',
  'kubernetes tools',
  'static site generators',
  'database clients',
  'awesome lists',
]

const AI_SUGGESTIONS = [
  'Find me a lightweight React state manager',
  'What are the best Rust CLI tools?',
  'Show me rising AI agent frameworks',
  'Find me an alternative to Express.js',
  'What CSS framework has the best DX?',
  'Find me a self-hosted analytics tool',
  'Compare popular vector databases',
  'What are good monorepo build tools?',
  'Find me a terminal file manager',
  'Show me projects for learning Go',
]

const CYCLE_MS = 3500
const FADE_MS = 400

export function useRotatingPlaceholder(focused: boolean, hasValue: boolean, aiMode = false) {
  const suggestions = aiMode ? AI_SUGGESTIONS : SEARCH_SUGGESTIONS
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(true)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset index when switching modes
  useEffect(() => {
    setIndex(0)
    setVisible(true)
  }, [aiMode])

  useEffect(() => {
    if (focused || hasValue) {
      if (timerRef.current) clearInterval(timerRef.current)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timerRef.current = null
      timeoutRef.current = null
      return
    }

    timerRef.current = setInterval(() => {
      setVisible(false)
      timeoutRef.current = setTimeout(() => {
        setIndex(prev => (prev + 1) % suggestions.length)
        setVisible(true)
        timeoutRef.current = null
      }, FADE_MS)
    }, CYCLE_MS)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [focused, hasValue, suggestions])

  return { text: suggestions[index], visible }
}
