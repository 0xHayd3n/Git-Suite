import { useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Pause, Play, Square, ScrollText, ChevronLeft, ChevronRight, Locate, ChevronsDown } from 'lucide-react'
import type { TtsSentence } from '../utils/rehypeTtsAnnotate'
import type { TtsSentenceStore } from '../hooks/useTtsReader'
import './TtsPlaybackBar.css'

interface Props {
  status: 'idle' | 'playing' | 'paused'
  speed: number
  autoScroll: boolean
  sections: { headingText: string; sentenceIndex: number }[]
  sentences: TtsSentence[]
  sentenceStore: TtsSentenceStore
  onPlay: () => void
  onPause: () => void
  onResume: () => void
  onStop: () => void
  onSetSpeed: (rate: number) => void
  onToggleAutoScroll: () => void
  onJumpToCurrent: () => void
  onPlayFrom: (sentenceIndex: number) => void
}

const SPEEDS = [1, 1.25, 1.5, 2]

export default function TtsPlaybackBar({
  status, speed, autoScroll, sections, sentences, sentenceStore,
  onPlay, onPause, onResume, onStop, onSetSpeed,
  onToggleAutoScroll, onJumpToCurrent, onPlayFrom,
}: Props) {
  const currentSentence = useSyncExternalStore(sentenceStore.subscribe, sentenceStore.getSnapshot)
  if (status === 'idle') return null

  // Find which section the current sentence is in
  let currentSectionIdx = 0
  for (let i = sections.length - 1; i >= 0; i--) {
    if (currentSentence >= sections[i].sentenceIndex) {
      currentSectionIdx = i
      break
    }
  }

  // Compute list skip target: if current sentence is in a run of 2+ list items,
  // find the first non-list sentence after the run
  let listSkipTarget = -1
  if (currentSentence >= 0 && sentences[currentSentence]?.isListItem) {
    // Find end of current list run
    let endOfList = currentSentence
    while (endOfList + 1 < sentences.length && sentences[endOfList + 1].isListItem) {
      endOfList++
    }
    // Find start of current list run
    let startOfList = currentSentence
    while (startOfList > 0 && sentences[startOfList - 1]?.isListItem) {
      startOfList--
    }
    // Only show skip if there are 2+ list sentences in this run
    const listLength = endOfList - startOfList + 1
    if (listLength >= 2 && endOfList + 1 < sentences.length) {
      listSkipTarget = endOfList + 1
    }
  }

  const cycleSpeed = () => {
    const idx = SPEEDS.indexOf(speed)
    const next = SPEEDS[(idx + 1) % SPEEDS.length]
    onSetSpeed(next)
  }

  const prevSection = () => {
    if (currentSectionIdx > 0) {
      onPlayFrom(sections[currentSectionIdx - 1].sentenceIndex)
    }
  }

  const nextSection = () => {
    if (currentSectionIdx < sections.length - 1) {
      onPlayFrom(sections[currentSectionIdx + 1].sentenceIndex)
    }
  }

  const slot = document.getElementById('tts-dock-slot')
  if (!slot) return null

  return createPortal(
    <div className="tts-dock-content">
      {/* Skip list button — above controls */}
      {listSkipTarget >= 0 && (
        <button
          className="tts-skip-list"
          onClick={() => onPlayFrom(listSkipTarget)}
          title="Skip past list"
        >
          <ChevronsDown size={14} className="tts-skip-list-arrow" />
          <span>Skip list</span>
        </button>
      )}

      <div className="tts-bar">
        {/* Play / Pause */}
        <button
          className="tts-bar-btn"
          onClick={status === 'playing' ? onPause : onResume}
          title={status === 'playing' ? 'Pause' : 'Resume'}
        >
          {status === 'playing' ? <Pause size={14} /> : <Play size={14} />}
        </button>

        {/* Stop */}
        <button className="tts-bar-btn tts-bar-btn--stop" onClick={onStop} title="Stop">
          <Square size={12} />
        </button>

        {/* Section nav */}
        {sections.length > 0 && (
          <div className="tts-bar-section">
            <button onClick={prevSection} disabled={currentSectionIdx === 0} title="Previous section">
              <ChevronLeft size={12} />
            </button>
            <span>{currentSectionIdx + 1} / {sections.length}</span>
            <button onClick={nextSection} disabled={currentSectionIdx >= sections.length - 1} title="Next section">
              <ChevronRight size={12} />
            </button>
          </div>
        )}

        {/* Speed */}
        <button className="tts-bar-speed" onClick={cycleSpeed} title="Playback speed">
          {speed}x
        </button>

        {/* Auto-scroll toggle */}
        <button
          className={`tts-bar-btn${autoScroll ? ' tts-bar-btn--active' : ''}`}
          onClick={onToggleAutoScroll}
          title={autoScroll ? 'Auto-scroll on' : 'Auto-scroll off'}
        >
          <ScrollText size={14} />
        </button>

        {/* Jump to current */}
        {!autoScroll && (
          <button className="tts-bar-btn tts-bar-jump" onClick={onJumpToCurrent} title="Jump to current sentence">
            <Locate size={14} />
          </button>
        )}
      </div>
    </div>,
    slot
  )
}
