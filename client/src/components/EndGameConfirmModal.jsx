import React from 'react'
import Modal from './Modal.jsx'
import styles from './EndGameConfirmModal.module.css'

function triggerBounce(el) {
  if (!el) return
  el.classList.remove('btn-bounce')
  void el.offsetWidth
  el.classList.add('btn-bounce')
}

export default function EndGameConfirmModal({ onConfirm, onCancel }) {
  return (
    <Modal title="End the game?" onClose={onCancel}>
      <p className={styles.message}>
        This will end the current game and reveal final scores for all players.
      </p>
      <p className={styles.hint}>
        Make sure all players at the table agree before proceeding.
      </p>
      <div className={styles.actions}>
        <button className={styles.cancelBtn} onClick={(e) => { triggerBounce(e.currentTarget); setTimeout(onCancel, 350) }}>
          Keep playing
        </button>
        <button className={styles.confirmBtn} onClick={(e) => { triggerBounce(e.currentTarget); setTimeout(onConfirm, 350) }}>
          End game
        </button>
      </div>
    </Modal>
  )
}
