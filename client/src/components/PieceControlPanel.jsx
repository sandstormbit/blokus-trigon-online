import React, { useRef, useEffect } from 'react'
import styles from './PieceControlPanel.module.css'
import { playSound } from '../utils/sounds.js'

function triggerBounce(el) {
  if (!el) return
  el.classList.remove('btn-bounce')
  void el.offsetWidth
  el.classList.add('btn-bounce')
}

function triggerKeyHighlight(el) {
  if (!el) return
  el.classList.remove('btn-key-highlight')
  void el.offsetWidth
  el.classList.add('btn-key-highlight')
}

export default function PieceControlPanel({
  isOpen,
  onToggle,
  side,            // 'left' | 'right'
  anchorTop,       // viewport-relative top in px
  playerColor,     // hex string e.g. '#3B82F6'
  selectedPiece,
  onRotate,
  onRotateReverse,
  onFlip,
  onToggleHover,
  freeHoverEnabled,
  onDeselect,
  bounceRef,
}) {
  const rotateRef       = useRef()
  const rotateRevRef    = useRef()
  const flipRef         = useRef()
  const hoverRef        = useRef()
  const deselectRef     = useRef()

  useEffect(() => {
    if (!bounceRef) return
    bounceRef.current = (action) => {
      const map = {
        rotate:        rotateRef,
        rotateReverse: rotateRevRef,
        flip:          flipRef,
        hover:         hoverRef,
        deselect:      deselectRef,
      }
      const el = map[action]?.current
      if (el) { triggerBounce(el); triggerKeyHighlight(el) }
    }
    return () => { if (bounceRef) bounceRef.current = null }
  })

  const isLeft = side === 'left'

  const wrapperStyle = {
    top: anchorTop,
    left: isLeft ? 240 : null,
    right: isLeft ? null : 240,
    flexDirection: isLeft ? 'row' : 'row-reverse',
    '--panel-color': playerColor,
  }

  return (
    <div className={styles.wrapper} style={wrapperStyle}>
      {/* Toggle tab — always visible at the sidebar edge */}
      <button
        className={`${styles.tab} ${isLeft ? styles.tabLeft : styles.tabRight}`}
        onClick={() => { playSound(isOpen ? 'home-lobby' : '2-deselect-piece'); onToggle() }}
        title={isOpen ? 'Close piece controls' : 'Open piece controls'}
        aria-label={isOpen ? 'Close piece controls' : 'Open piece controls'}
      >
        {isLeft ? (isOpen ? '◀' : '▶') : (isOpen ? '▶' : '◀')}
      </button>

      {/* Sliding panel */}
      <div className={`${styles.panel} ${isOpen ? styles.panelOpen : styles.panelClosed}`}>
        {selectedPiece && (
          <div className={styles.pieceLabel}>
            <span className={styles.pieceDot} />
            Piece {selectedPiece.id} selected
          </div>
        )}

        <div className={styles.btnList}>
          <button
            ref={rotateRef}
            className={styles.btn}
            onClick={() => { playSound('home-lobby'); onRotate() }}
            title="Rotate 60° CW (R)"
          >
            <svg viewBox="0 0 20 20" width="13" height="13" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd"/>
            </svg>
            Rotate <kbd>R</kbd>
          </button>

          <button
            ref={rotateRevRef}
            className={styles.btn}
            onClick={() => { playSound('home-lobby'); onRotateReverse() }}
            title="Rotate 60° CCW (⇧R)"
          >
            <svg viewBox="0 0 20 20" width="13" height="13" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M16 2a1 1 0 00-1 1v2.101a7.002 7.002 0 00-11.601 2.566 1 1 0 001.885.666A5.002 5.002 0 0114.001 7H11a1 1 0 000 2h5a1 1 0 001-1V3a1 1 0 00-1-1zm-.008 9.057a1 1 0 00-1.276.61A5.002 5.002 0 015.999 13H9a1 1 0 110-2H4a1 1 0 00-1 1v5a1 1 0 102 0v-2.101a7.002 7.002 0 0011.601-2.566 1 1 0 00-.61-1.276z" clipRule="evenodd"/>
            </svg>
            Rev. Rotate <kbd>⇧R</kbd>
          </button>

          <button
            ref={flipRef}
            className={styles.btn}
            onClick={() => { playSound('home-lobby'); onFlip() }}
            title="Flip (F)"
          >
            <svg viewBox="0 0 20 20" width="13" height="13" fill="currentColor" aria-hidden="true">
              <path d="M8 5a1 1 0 100 2h5.586l-1.293 1.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L13.586 5H8zM12 15a1 1 0 100-2H6.414l1.293-1.293a1 1 0 10-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L6.414 15H12z"/>
            </svg>
            Flip <kbd>F</kbd>
          </button>

          <button
            ref={hoverRef}
            className={`${styles.btn} ${!freeHoverEnabled ? styles.btnInactive : ''}`}
            onClick={() => { playSound('home-lobby'); onToggleHover() }}
            title="Toggle hover preview (H)"
          >
            <svg viewBox="0 0 20 20" width="13" height="13" fill="currentColor" aria-hidden="true">
              <path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/>
              <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd"/>
            </svg>
            Hover <kbd>H</kbd>
          </button>

          <button
            ref={deselectRef}
            className={`${styles.btn} ${styles.btnDeselect}`}
            onClick={() => { playSound('2-deselect-piece'); onDeselect() }}
            title="Deselect (Esc)"
          >
            <svg viewBox="0 0 20 20" width="13" height="13" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
            </svg>
            Deselect <kbd>Esc</kbd>
          </button>
        </div>
      </div>
    </div>
  )
}
