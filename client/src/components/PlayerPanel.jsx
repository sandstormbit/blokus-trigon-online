import React, { useMemo } from 'react'
import PiecePreview from './PiecePreview.jsx'
import { PLAYER_COLORS } from '../hooks/useGameState.js'
import styles from './PlayerPanel.module.css'
import AnimatedScore from './AnimatedScore.jsx'

export default function PlayerPanel({
  player,
  isActive,
  selectedPieceId,
  onSelectPiece,
  disabled,
  isSkipped,
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

  return (
    <div
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
          <div className={styles.playerName}>{player.name}</div>
          <div className={styles.playerMeta}>
            {placedCount} placed · {22 - placedCount} remaining
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
                      onClick={() => !disabled && !isSkipped && onSelectPiece(piece.id)}
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
