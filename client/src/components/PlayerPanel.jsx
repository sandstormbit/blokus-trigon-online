import React, { useCallback, useMemo, useRef, useState } from 'react'
import PiecePreview from './PiecePreview.jsx'
import { PLAYER_COLORS } from '../hooks/useGameState.js'
import styles from './PlayerPanel.module.css'
import AnimatedScore from './AnimatedScore.jsx'
import { playSound } from '../utils/sounds.js'

export default function PlayerPanel({
  player,
  isActive,
  selectedPieceId,
  onSelectPiece,
  disabled,
  isSkipped,
  panelRef = null,
}) {
  const colorInfo = PLAYER_COLORS[player.color]

  const pieceGroups = useMemo(() => {
    const remaining = player.pieces.filter(p => !p.placed)
    const groups = {}
    for (const piece of remaining) {
      if (!groups[piece.size]) groups[piece.size] = []
      groups[piece.size].push(piece)
    }
    return Object.entries(groups)
      .sort(([a], [b]) => Number(b) - Number(a))
      .map(([size, pieces]) => ({ size: Number(size), pieces }))
  }, [player.pieces])

  const totalRemaining = player.score
  const placedCount = player.pieces.filter(p => p.placed).length
  const totalPieces = player.pieces.length

  // Name scroll: measure overflow on hover and animate to reveal full name
  const nameRef = useRef(null)
  const [nameScrollPx, setNameScrollPx] = useState(0)

  const onNameEnter = useCallback(() => {
    const el = nameRef.current
    if (!el) return
    const overflow = el.scrollWidth - el.clientWidth
    if (overflow > 0) setNameScrollPx(overflow)
  }, [])

  const onNameLeave = useCallback(() => setNameScrollPx(0), [])

  return (
    <div
      ref={panelRef}
      className={`
        ${styles.panel}
        ${isActive ? styles.panelActive : ''}
        ${isSkipped ? styles.panelSkipped : ''}
      `}
      style={{
        '--player-color': colorInfo.bg,
        '--player-color-light': colorInfo.light,
        '--player-color-dark': colorInfo.dark,
      }}
    >
      {/* Player header */}
      <div className={styles.header}>
        <div className={styles.colorDot} />
        <div className={styles.playerInfo}>
          <div
            ref={nameRef}
            className={`${styles.playerName} ${nameScrollPx > 0 ? styles.playerNameScrolling : ''}`}
            style={nameScrollPx > 0 ? { '--name-scroll': `-${nameScrollPx}px` } : undefined}
            onMouseEnter={onNameEnter}
            onMouseLeave={onNameLeave}
            title={player.name}
          >
            {player.name}
          </div>
          <div className={styles.playerMeta}>
            {totalPieces - placedCount}/{totalPieces}
          </div>
        </div>
        <div className={styles.score}>
          <div className={styles.scoreNum}><AnimatedScore value={totalRemaining} /></div>
          <div className={styles.scoreLabel}>pts</div>
        </div>
      </div>

      {isSkipped ? (
        <div className={styles.skippedBadge}>No moves left</div>
      ) : isActive ? (
        <div className={styles.turnBadge}>Your turn</div>
      ) : null}

      {/* Piece groups */}
      <div className={styles.piecesContainer}>
        {pieceGroups.length === 0 ? (
          <div className={styles.allPlaced}>All pieces placed!</div>
        ) : (
          pieceGroups.map(({ size, pieces }) => (
            <div key={size} className={styles.pieceGroup}>
              <div className={styles.groupLabel}>{size}▲</div>
              <div className={styles.pieceGrid}>
                {pieces.map(piece => {
                  const isSelected = selectedPieceId === piece.id
                  return (
                    <button
                      key={piece.id}
                      className={`${styles.pieceBtn} ${isSelected ? styles.pieceBtnSelected : ''}`}
                      onClick={() => {
                        if (disabled || isSkipped) return
                        playSound(isSelected ? '2-deselect-piece' : '1-select-piece')
                        onSelectPiece(piece.id)
                      }}
                      disabled={(disabled && !isSelected) || isSkipped}
                      title={`Piece ${piece.id} (${piece.size} triangles)`}
                    >
                      <PiecePreview
                        piece={piece}
                        color={isSelected ? colorInfo.bg : colorInfo.bg + 'CC'}
                        colorDark={colorInfo.dark}
                        size={32}
                        rotIndex={piece.rotIndex || 0}
                        flipped={piece.flipped || false}
                      />
                    </button>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
