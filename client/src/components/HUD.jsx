import React, { useRef, useEffect } from 'react'
import { PLAYER_COLORS } from '../hooks/useGameState.js'
import styles from './HUD.module.css'

function triggerBounce(el) {
  if (!el) return
  el.classList.remove('btn-bounce')
  void el.offsetWidth
  el.classList.add('btn-bounce')
}

export default function HUD({
  currentPlayer,
  onToggleEnhancedColoring,
  enhancedColoring,
  onToggleAutoAdvance,
  autoAdvanceEnabled,
  onEndGame,
  onSkip,
  onConfirmSkip,
  onCancelSkip,
  showSkipConfirm,
  onEndTurn,
  waitingForEndTurn,
  playerCount,
  isOnline = false,
  isMyTurn = true,
  onExit = null,
  bounceRef,
}) {
  const colorInfo = currentPlayer ? PLAYER_COLORS[currentPlayer.color] : null
  const endTurnRef = useRef()
  const skipRef    = useRef()

  useEffect(() => {
    if (!bounceRef) return
    bounceRef.current = (action) => {
      const map = { endTurn: endTurnRef, skip: skipRef }
      const el = map[action]?.current
      if (el) triggerBounce(el)
    }
    return () => { if (bounceRef) bounceRef.current = null }
  })

  return (
    <div className={styles.hud}>
      {/* Left: turn indicator */}
      <div className={styles.left}>
        {currentPlayer && colorInfo && (
          <div key={currentPlayer.id} className={styles.turnInfo}>
            <div
              className={styles.turnDot}
              style={{ background: colorInfo.bg, boxShadow: `0 0 10px ${colorInfo.bg}` }}
            />
            <div>
              <div className={styles.turnLabel}>Current turn</div>
              <div className={styles.turnName} style={{ color: colorInfo.bg }}>
                {currentPlayer.name}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Center: status messages */}
      <div className={styles.center}>
        <div
          key={
            (isOnline && !isMyTurn) ? 'waiting'
            : showSkipConfirm ? 'skip-confirm'
            : waitingForEndTurn ? 'end-turn'
            : 'hint'
          }
          className={styles.centerContent}
        >
          {isOnline && !isMyTurn ? (
            <div className={styles.waitingIndicator}>
              <div className={styles.waitingSpinner} />
              <span className={styles.waitingText}>
                Waiting for{' '}
                <strong style={{ color: currentPlayer ? PLAYER_COLORS[currentPlayer.color]?.bg : 'inherit' }}>
                  {currentPlayer?.name || 'other player'}
                </strong>
              </span>
            </div>
          ) : showSkipConfirm ? (
            <div className={styles.skipConfirm}>
              <span className={styles.skipConfirmText}>Skip your turn?</span>
              <div className={styles.skipConfirmBtns}>
                <button className={styles.skipCancelBtn} onClick={onCancelSkip}>
                  No, go back
                </button>
                <button
                  className={styles.skipConfirmBtn}
                  style={{ '--c': colorInfo?.bg || '#888' }}
                  onClick={(e) => { triggerBounce(e.currentTarget); onConfirmSkip() }}
                  autoFocus
                >
                  Yes, skip turn
                </button>
              </div>
            </div>
          ) : waitingForEndTurn ? (
            <div className={styles.endTurnHint}>
              <span className={styles.endTurnHintText}>Turn complete — press End Turn to continue</span>
            </div>
          ) : (
            <div className={styles.hint}>
              Select a piece from your panel
            </div>
          )}
        </div>
      </div>

      {/* Right: toggle buttons + actions */}
      <div className={styles.right}>
        {onToggleEnhancedColoring && (
          <button
            className={enhancedColoring ? styles.glowBtnActive : styles.glowBtn}
            onClick={(e) => { triggerBounce(e.currentTarget); onToggleEnhancedColoring() }}
            title={enhancedColoring ? 'Hide piece glows (C)' : 'Show piece glows (C)'}
          >
            ✦ <kbd>C</kbd>
          </button>
        )}
        {onToggleAutoAdvance && (
          <button
            className={autoAdvanceEnabled ? styles.glowBtnActive : styles.glowBtn}
            onClick={(e) => { triggerBounce(e.currentTarget); onToggleAutoAdvance() }}
            title={autoAdvanceEnabled ? 'Auto Advance on — click to require End Turn (A)' : 'Auto Advance off — click to enable (A)'}
          >
            Auto Advance <kbd>A</kbd>
          </button>
        )}
        {isOnline && onExit && (
          <button className={styles.leaveBtn} onClick={(e) => { triggerBounce(e.currentTarget); setTimeout(onExit, 350) }}>Leave</button>
        )}
        {/* Skip button */}
        {isMyTurn && !waitingForEndTurn && !showSkipConfirm && onSkip && (
          <button
            ref={skipRef}
            className={styles.skipBtn}
            onClick={(e) => { triggerBounce(e.currentTarget); onSkip() }}
            title="Skip your turn"
          >
            Skip
          </button>
        )}
        {/* End Turn button — only shown when auto advance is off and action is taken */}
        {!autoAdvanceEnabled && isMyTurn && waitingForEndTurn && onEndTurn && (
          <button
            ref={endTurnRef}
            className={styles.endTurnBtn}
            onClick={(e) => { triggerBounce(e.currentTarget); onEndTurn() }}
            title="End your turn (Shift+Enter)"
          >
            End Turn <kbd>⇧↵</kbd>
          </button>
        )}
        <button className={styles.endBtn} onClick={(e) => { triggerBounce(e.currentTarget); setTimeout(onEndGame, 350) }}>
          End Game
        </button>
      </div>
    </div>
  )
}
