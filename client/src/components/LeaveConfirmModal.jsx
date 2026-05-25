import React from 'react'
import Modal from './Modal.jsx'
import styles from './LeaveConfirmModal.module.css'
import { playSound } from '../utils/sounds.js'

function triggerBounce(el) {
  if (!el) return
  el.classList.remove('btn-bounce')
  void el.offsetWidth
  el.classList.add('btn-bounce')
}

export default function LeaveConfirmModal({ onConfirm, onCancel }) {
  return (
    <Modal title="Leave the game?" onClose={onCancel}>
      <p className={styles.message}>
        You'll be removed from the game. Other players can continue without you.
      </p>
      <div className={styles.actions}>
        <button className={styles.stayBtn} onClick={(e) => { triggerBounce(e.currentTarget); playSound('home-lobby'); setTimeout(onCancel, 350) }} autoFocus>
          Stay
        </button>
        <button className={styles.leaveBtn} onClick={(e) => { triggerBounce(e.currentTarget); playSound('home-lobby'); setTimeout(onConfirm, 350) }}>
          Leave
        </button>
      </div>
    </Modal>
  )
}
