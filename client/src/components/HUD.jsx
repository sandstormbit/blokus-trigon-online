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
  selectedPiece,
  onRotate,
  onFlip,
  onToggleHover,
  freeHoverEnabled,
  onDeselect,
  onEndGame,
  playerCount,
  players,
  isOnline = false,
  isMyTurn = true,
  onlineRoomCode = null,
  onExit = null,
  bounceRef,
}) {
  const colorInfo = currentPlayer ? PLAYER_COLORS[currentPlayer.color] : null
  const rotateRef = useRef()
  const flipRef = useRef()
  const hoverRef = useRef()
  const deselectRef = useRef()

  useEffect(() => {
    if (!bounceRef) return
    bounceRef.current = (action) => {
      const map = { rotate: rotateRef, flip: flipRef, hover: hoverRef, deselect: deselectRef }
      triggerBounce(map[action]?.current)
    }
    return () => { if (bounceRef) bounceRef.current = null }
  })

  return (
    <div className={styles.hud}>
      {/* Left: turn indicator */}
      <div className={styles.left}>
        {currentPlayer && colorInfo && (
          <div className={styles.turnInfo}>
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

      {/* Center: waiting indicator (online, not my turn) or piece controls */}
      <div className={styles.center}>
        <div
          key={(isOnline && !isMyTurn) ? 'waiting' : selectedPiece ? 'piece' : 'hint'}
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
          ) : selectedPiece ? (
            <div className={styles.controls}>
              <div className={styles.selectedIndicator}>
                <span className={styles.selectedDot} />
                Piece {selectedPiece.id} selected
              </div>
              <div className={styles.controlBtns}>
                <button ref={rotateRef} className={styles.controlBtn} onClick={onRotate} title="Rotate 60° CW (R)" data-action="rotate">
                  <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor">
                    <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd"/>
                  </svg>
                  Rotate <kbd>R</kbd>
                </button>
                <button ref={flipRef} className={styles.controlBtn} onClick={onFlip} title="Flip (F)" data-action="flip">
                  <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor">
                    <path d="M8 5a1 1 0 100 2h5.586l-1.293 1.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L13.586 5H8zM12 15a1 1 0 100-2H6.414l1.293-1.293a1 1 0 10-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L6.414 15H12z"/>
                  </svg>
                  Flip <kbd>F</kbd>
                </button>
                <button
                  ref={hoverRef}
                  className={freeHoverEnabled ? styles.controlBtn : styles.controlBtnGhost}
                  onClick={onToggleHover}
                  title={freeHoverEnabled ? 'Hide hover preview (H)' : 'Show hover preview (H)'}
                  data-action="hover-toggle"
                >
                  <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor">
                    <path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/>
                    <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd"/>
                  </svg>
                  Hover <kbd>H</kbd>
                </button>
                <button ref={deselectRef} className={styles.controlBtnGhost} onClick={onDeselect} title="Deselect (Esc)" data-action="deselect">
                  <svg viewBox="0 0 20 20" width="12" height="12" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
                  </svg>
                  Deselect <kbd>Esc</kbd>
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.hint}>
              Select a piece from your panel →
            </div>
          )}
        </div>
      </div>

      {/* Right: room code + scores + leave + end game */}
      <div className={styles.right}>
        {isOnline && onlineRoomCode && (
          <span className={styles.roomCodeBadge}>#{onlineRoomCode}</span>
        )}
        <div className={styles.miniScores}>
          {players && players.map(p => (
            <div key={p.id} className={styles.miniScore}>
              <div
                className={styles.miniDot}
                style={{ background: PLAYER_COLORS[p.color].bg }}
              />
              <span style={{ color: PLAYER_COLORS[p.color].bg }}>{p.score}</span>
            </div>
          ))}
        </div>
        {isOnline && onExit && (
          <button className={styles.leaveBtn} onClick={() => setTimeout(onExit, 320)} data-traced="">Leave</button>
        )}
        <button className={styles.endBtn} onClick={(e) => { triggerBounce(e.currentTarget); onEndGame() }}>
          End Game
        </button>
      </div>
    </div>
  )
}
