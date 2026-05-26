import React, { useState } from 'react'
import { PLAYER_COLORS } from '../hooks/useGameState.js'
import styles from './MobileTopBar.module.css'
import { playSound } from '../utils/sounds.js'
import LeaveConfirmModal from './LeaveConfirmModal.jsx'

function triggerBounce(el) {
  if (!el) return
  el.classList.remove('btn-bounce')
  void el.offsetWidth
  el.classList.add('btn-bounce')
}

/**
 * Full-width top bar for mobile/tablet gameplay.
 * Contains only game-settings and navigation controls:
 *   [C]  [Auto]  [Leave]  [End Game]
 *
 * Place / Pick Up / End Turn live in the MobileActionBar
 * (positioned between the board and the bottom HUD).
 */
export default function MobileTopBar({
  enhancedColoring,
  onToggleEnhancedColoring,
  autoAdvanceEnabled,
  onToggleAutoAdvance,
  isOnline,
  onExit,           // Leave
  onEndGame,        // End Game
  currentPlayer,    // for context (unused visually but kept for future use)
}) {
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)

  return (
    <>
      <div className={styles.bar}>
        <div className={styles.left}>
          {/* Turn indicator dot */}
          {currentPlayer && (() => {
            const ci = PLAYER_COLORS[currentPlayer.color]
            return (
              <div className={styles.turnDot} style={{ background: ci.bg, boxShadow: `0 0 8px ${ci.bg}` }} />
            )
          })()}
        </div>

        {/* Right: settings + game controls */}
        <div className={styles.right}>
          <button
            className={`${styles.iconBtn} ${enhancedColoring ? styles.iconBtnActive : ''}`}
            onPointerDown={e => { triggerBounce(e.currentTarget); playSound('home-lobby'); onToggleEnhancedColoring() }}
            title={enhancedColoring ? 'Hide thick outlines (C)' : 'Show thick outlines (C)'}
            type="button"
            aria-label="Toggle enhanced coloring"
          >
            ✦ C
          </button>

          <button
            className={`${styles.autoBtn} ${autoAdvanceEnabled ? styles.autoBtnActive : ''}`}
            onPointerDown={e => { triggerBounce(e.currentTarget); playSound('home-lobby'); onToggleAutoAdvance() }}
            title={autoAdvanceEnabled ? 'Auto Advance ON' : 'Auto Advance OFF'}
            type="button"
            aria-label="Toggle auto advance"
          >
            Auto
          </button>

          {isOnline && onExit && (
            <button
              className={styles.leaveBtn}
              onPointerDown={e => { triggerBounce(e.currentTarget); playSound('home-lobby'); setTimeout(() => setShowLeaveConfirm(true), 200) }}
              type="button"
              aria-label="Leave game"
            >
              Leave
            </button>
          )}

          <button
            className={styles.endGameBtn}
            onPointerDown={e => { triggerBounce(e.currentTarget); playSound('home-lobby'); setTimeout(onEndGame, 200) }}
            type="button"
            aria-label="End game"
          >
            End Game
          </button>
        </div>
      </div>

      {showLeaveConfirm && (
        <LeaveConfirmModal
          onConfirm={onExit}
          onCancel={() => setShowLeaveConfirm(false)}
        />
      )}
    </>
  )
}
