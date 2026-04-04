import React from 'react'
import Modal from './Modal.jsx'
import { PLAYER_COLORS } from '../hooks/useGameState.js'
import styles from './NoMovesModal.module.css'

export default function NoMovesModal({ player, onDismiss }) {
  if (!player) return null
  const colorInfo = PLAYER_COLORS[player.color]

  return (
    <Modal title="No moves available">
      <div className={styles.content}>
        <div
          className={styles.colorBadge}
          style={{ background: colorInfo.bg + '22', borderColor: colorInfo.bg }}
        >
          <div className={styles.colorDot} style={{ background: colorInfo.bg }} />
          <span className={styles.playerName} style={{ color: colorInfo.bg }}>
            {player.name}
          </span>
        </div>

        <p className={styles.message}>
          has no legal moves remaining and will be skipped for the rest of the game.
        </p>

        <p className={styles.hint}>
          Their panel will be grayed out to indicate they are out of moves.
        </p>

        <button
          className={styles.okBtn}
          style={{ '--btn-color': colorInfo.bg, '--btn-dark': colorInfo.dark }}
          onClick={onDismiss}
        >
          OK, continue
        </button>
      </div>
    </Modal>
  )
}
