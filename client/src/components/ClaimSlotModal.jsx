import React from 'react'
import styles from './ClaimSlotModal.module.css'

/**
 * Shown when a returning player reconnects and finds an AI took their slot.
 * Offers to reclaim the slot (inheriting AI's placed pieces) or spectate.
 */
export default function ClaimSlotModal({
  playerName,
  onClaimSlot,
  onSpectate,
}) {
  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.icon}>🔄</div>
        <h2 className={styles.title}>Welcome back, {playerName}!</h2>
        <p className={styles.subtitle}>
          An AI took over your spot while you were away.
          You can reclaim your slot and continue playing — the AI&apos;s
          placed pieces stay on the board.
        </p>

        <div className={styles.actions}>
          <button className={styles.claimBtn} onClick={onClaimSlot}>
            Reclaim My Spot
          </button>
          <button className={styles.spectateBtn} onClick={onSpectate}>
            👁 Watch as Spectator
          </button>
        </div>
      </div>
    </div>
  )
}
