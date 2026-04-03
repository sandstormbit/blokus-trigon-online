import React from 'react'
import Modal from './Modal.jsx'
import { PLAYER_COLORS } from '../hooks/useGameState.js'
import styles from './PlacementConfirmModal.module.css'

export default function PlacementConfirmModal({ currentPlayer, piece, onConfirm, onCancel }) {
  const colorInfo = PLAYER_COLORS[currentPlayer.color]

  return (
    <Modal title="Confirm placement" onClose={onCancel}>
      <p className={styles.message}>
        Place{' '}
        <strong style={{ color: colorInfo.bg }}>
          Piece {piece.id}
        </strong>{' '}
        ({piece.size} triangle{piece.size !== 1 ? 's' : ''}) here?
      </p>
      <p className={styles.hint}>This action cannot be undone.</p>
      <div className={styles.actions}>
        <button className={styles.cancelBtn} onClick={onCancel}>
          No, go back <kbd>Esc</kbd>
        </button>
        <button
          className={styles.confirmBtn}
          style={{ '--c': colorInfo.bg }}
          onClick={onConfirm}
          autoFocus
        >
          Yes, place it <kbd>Enter</kbd>
        </button>
      </div>
    </Modal>
  )
}
