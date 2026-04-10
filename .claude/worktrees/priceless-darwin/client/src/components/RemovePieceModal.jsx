import React from 'react'
import Modal from './Modal.jsx'
import styles from './PlacementConfirmModal.module.css'

function triggerBounce(el) {
  if (!el) return
  el.classList.remove('btn-bounce')
  void el.offsetWidth
  el.classList.add('btn-bounce')
}

export default function RemovePieceModal({ onConfirm, onCancel }) {
  return (
    <Modal title="Remove piece?" onClose={onCancel}>
      <p className={styles.message}>Remove this piece from the board and return it to your hand?</p>
      <div className={styles.actions}>
        <button
          className={styles.cancelBtn}
          onClick={(e) => { triggerBounce(e.currentTarget); onCancel() }}
        >
          No <kbd>Esc</kbd>
        </button>
        <button
          className={styles.confirmBtn}
          style={{ '--c': '#6366f1' }}
          onClick={(e) => { triggerBounce(e.currentTarget); onConfirm() }}
          autoFocus
        >
          Yes, remove it <kbd>Enter</kbd>
        </button>
      </div>
    </Modal>
  )
}
