import React from 'react'
import Modal from './Modal.jsx'
import { PLAYER_COLORS } from '../hooks/useGameState.js'
import styles from './PlacementConfirmModal.module.css'

function triggerBounce(el) {
  if (!el) return
  el.classList.remove('btn-bounce')
  void el.offsetWidth
  el.classList.add('btn-bounce')
}

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
        <button className={styles.cancelBtn} onClick={(e) => { triggerBounce(e.currentTarget); setTimeout(onCancel, 350) }}>
          No, go back <kbd>Esc</kbd>
        </button>
        <button
          className={styles.confirmBtn}
          style={{ '--c': colorInfo.bg }}
          onClick={(e) => { triggerBounce(e.currentTarget); setTimeout(onConfirm, 350) }}
          autoFocus
        >
          Yes, place it <kbd>Enter</kbd>
        </button>
      </div>
    </Modal>
  )
}
