import React, { useState, useEffect, useCallback } from 'react'
import styles from './HowToPlayModal.module.css'

const FRAMES = [
  {
    title: 'Welcome to Blokus Trigon',
    icon: '△',
    text: 'Blokus Trigon is a strategy game played on a hexagonal board made of triangles. Your goal is to place as many of your triangular pieces as possible.',
    visual: null,
  },
  {
    title: 'The Board',
    icon: '⬡',
    text: 'The board is a flat-top hexagon. 3 players use a 384-triangle board; 4 players use a 486-triangle board.',
    visual: 'board',
  },
  {
    title: 'Your Pieces',
    icon: '▲',
    text: 'Each player has 22 polyiamond pieces — shapes made of 1 to 6 triangles. You must place all of them or run out of legal moves.',
    visual: null,
  },
  {
    title: 'First Move',
    icon: '1️⃣',
    text: 'Your first piece can go anywhere on the empty board — no restrictions. Subsequent pieces must follow the contact rules.',
    visual: null,
  },
  {
    title: 'Corner Rule',
    icon: '◈',
    text: 'After your first move, every new piece must touch at least one of your own pieces at a corner vertex.',
    visual: 'corner',
  },
  {
    title: 'Edge Rule',
    icon: '⊘',
    text: 'Your pieces can never share an edge with your own color. Two of your pieces touching edge-to-edge is not allowed.',
    visual: 'edge',
  },
  {
    title: 'Flat-Edge Rule',
    icon: '⊟',
    text: 'You may not touch the interior midpoint of a flat edge — only true corners of a piece are valid contact points.',
    visual: null,
  },
  {
    title: 'One-Vertex Rule',
    icon: '⊞',
    text: 'A new piece may touch any single existing piece at only one corner vertex. Touching the same piece at two corners is not allowed.',
    visual: null,
  },
  {
    title: 'Red Highlights',
    icon: '🔴',
    text: 'When hovering, a red ghost piece means the placement is illegal. A green ghost means it is valid — click to confirm.',
    visual: null,
  },
  {
    title: 'Scoring',
    icon: '🏆',
    text: 'Your score equals the triangles you have left unplaced. The player with the lowest score at game end wins.',
    visual: null,
  },
  {
    title: 'Keyboard Shortcuts',
    icon: '⌨',
    text: 'R — rotate piece  ·  F — flip piece  ·  Enter — confirm placement  ·  Esc — deselect / cancel  ·  H — toggle hover preview',
    visual: 'keys',
  },
  {
    title: 'Mouse Controls',
    icon: '🖱',
    text: 'Click a piece in the panel to select it. Hover the board to preview placement. Click the board to stage, then confirm or cancel.',
    visual: null,
  },
]

export default function HowToPlayModal({ onClose }) {
  const [frame, setFrame] = useState(0)
  const total = FRAMES.length

  const prev = useCallback(() => setFrame(f => Math.max(0, f - 1)), [])
  const next = useCallback(() => setFrame(f => Math.min(total - 1, f + 1)), [total])

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') next()
      if (e.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, next, prev])

  const current = FRAMES[frame]

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <span className={styles.headerTitle}>How to Play</span>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 14 14" width="14" height="14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className={styles.content}>
          <div className={styles.icon}>{current.icon}</div>
          <h2 className={styles.title}>{current.title}</h2>
          <p className={styles.text}>{current.text}</p>

          {current.visual === 'board' && (
            <div className={styles.visual}>
              <svg viewBox="0 0 120 104" width="120" height="104">
                <polygon points="60,4 112,96 8,96" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinejoin="round"/>
                <polygon points="60,20 96,84 24,84" fill="rgba(59,130,246,0.1)" stroke="#3B82F6" strokeWidth="1" strokeLinejoin="round"/>
                <text x="60" y="62" textAnchor="middle" fill="#3B82F6" fontSize="9" fontFamily="monospace">hexagonal</text>
                <text x="60" y="74" textAnchor="middle" fill="#3B82F6" fontSize="9" fontFamily="monospace">board</text>
              </svg>
            </div>
          )}

          {current.visual === 'corner' && (
            <div className={styles.visual}>
              <svg viewBox="0 0 140 60" width="140" height="60">
                {/* Existing blue piece (two triangles) */}
                <polygon points="20,50 44,50 32,28" fill="#3B82F6" opacity="0.7" stroke="#1D4ED8" strokeWidth="1"/>
                <polygon points="44,50 68,50 56,28" fill="#3B82F6" opacity="0.7" stroke="#1D4ED8" strokeWidth="1"/>
                {/* New red piece touching at corner */}
                <polygon points="68,50 92,50 80,28" fill="#EF4444" opacity="0.7" stroke="#B91C1C" strokeWidth="1"/>
                {/* Corner dot */}
                <circle cx="68" cy="50" r="3.5" fill="#22C55E" stroke="white" strokeWidth="1"/>
                <text x="70" y="58" fill="#22C55E" fontSize="8" fontFamily="sans-serif">corner touch ✓</text>
              </svg>
            </div>
          )}

          {current.visual === 'edge' && (
            <div className={styles.visual}>
              <svg viewBox="0 0 140 60" width="140" height="60">
                {/* Existing blue piece */}
                <polygon points="20,50 44,50 32,28" fill="#3B82F6" opacity="0.7" stroke="#1D4ED8" strokeWidth="1"/>
                {/* Illegal adjacent piece */}
                <polygon points="44,50 68,50 56,28" fill="#EF4444" opacity="0.5" stroke="#EF4444" strokeWidth="2" strokeDasharray="3,2"/>
                {/* X mark */}
                <line x1="46" y1="33" x2="64" y2="47" stroke="#EF4444" strokeWidth="2" strokeLinecap="round"/>
                <line x1="64" y1="33" x2="46" y2="47" stroke="#EF4444" strokeWidth="2" strokeLinecap="round"/>
                <text x="70" y="38" fill="#EF4444" fontSize="8" fontFamily="sans-serif">edge touch ✗</text>
              </svg>
            </div>
          )}

          {current.visual === 'keys' && (
            <div className={styles.keysGrid}>
              {[['R', 'Rotate'], ['F', 'Flip'], ['Enter', 'Confirm'], ['Esc', 'Cancel/Deselect'], ['H', 'Toggle hover']].map(([key, label]) => (
                <div key={key} className={styles.keyRow}>
                  <kbd className={styles.key}>{key}</kbd>
                  <span className={styles.keyLabel}>{label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className={styles.nav}>
          <button
            className={`${styles.navBtn} ${frame === 0 ? styles.navBtnDisabled : ''}`}
            onClick={prev}
            disabled={frame === 0}
          >
            ← Prev
          </button>

          <div className={styles.dots}>
            {FRAMES.map((_, i) => (
              <button
                key={i}
                className={`${styles.dot} ${i === frame ? styles.dotActive : ''}`}
                onClick={() => setFrame(i)}
                aria-label={`Go to frame ${i + 1}`}
              />
            ))}
          </div>

          {frame < total - 1 ? (
            <button className={styles.navBtn} onClick={next}>Next →</button>
          ) : (
            <button className={`${styles.navBtn} ${styles.navBtnDone}`} onClick={onClose}>Got it!</button>
          )}
        </div>
      </div>
    </div>
  )
}
