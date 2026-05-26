import React, { useCallback } from 'react'
import styles from './BoardArrowControls.module.css'

/**
 * Directional arrow controls overlaid around the board for mobile/tablet.
 * Layout:
 *   ↑  (top-left)
 *   ←  (left-center)
 *        →  (right-center)
 *        ↓  (bottom-right)
 *
 * Props:
 *   onMove(dx, dy) — called with a direction; dx/dy are unit vectors in
 *                    screen-pixel space (e.g. dx=-1 means left).
 *   visible        — hide entirely when no piece is selected
 *   stepPx         — pixel delta per tap (default 14)
 */
export default function BoardArrowControls({ onMove, visible, stepPx = 20 }) {
  const left  = useCallback(e => { e.preventDefault(); onMove(-stepPx, 0) }, [onMove, stepPx])
  const right = useCallback(e => { e.preventDefault(); onMove(stepPx, 0) }, [onMove, stepPx])
  const up    = useCallback(e => { e.preventDefault(); onMove(0, -stepPx) }, [onMove, stepPx])
  const down  = useCallback(e => { e.preventDefault(); onMove(0, stepPx) }, [onMove, stepPx])

  if (!visible) return null

  return (
    <>
      {/* Left column: ↑ stacked above ← */}
      <div className={styles.leftCol}>
        <button
          className={styles.arrowBtn}
          onPointerDown={up}
          aria-label="Move piece up"
          type="button"
        >
          <svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor">
            <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd"/>
          </svg>
        </button>
        <button
          className={styles.arrowBtn}
          onPointerDown={left}
          aria-label="Move piece left"
          type="button"
        >
          <svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor">
            <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd"/>
          </svg>
        </button>
      </div>

      {/* Right column: → above ↓ */}
      <div className={styles.rightCol}>
        <button
          className={styles.arrowBtn}
          onPointerDown={right}
          aria-label="Move piece right"
          type="button"
        >
          <svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor">
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd"/>
          </svg>
        </button>
        <button
          className={styles.arrowBtn}
          onPointerDown={down}
          aria-label="Move piece down"
          type="button"
        >
          <svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor">
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 011.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd"/>
          </svg>
        </button>
      </div>
    </>
  )
}
