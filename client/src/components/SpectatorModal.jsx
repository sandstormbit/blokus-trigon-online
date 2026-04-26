import React from 'react'
import styles from './SpectatorModal.module.css'

/**
 * Shown when a player tries to join a room that is full or in-progress.
 * Offers spectate option and (if waiting room has AI slots) option to take an AI slot.
 */
export default function SpectatorModal({
  roomCode,
  phase,
  aiSlots,          // [{humanId, name, aiDifficulty}] | null — waiting room AI slots
  openSlots,        // [{humanId, name}] | null — mid-game open player slots
  onSpectate,
  onTakeAISlot,     // (aiHumanId) => void — waiting room only
  onTakeOpenSlot,   // (aiHumanId) => void — mid-game open slots
  onClose,
}) {
  const isInProgress = phase === 'playing' || phase === 'ended'

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h2 className={styles.title}>
          {isInProgress ? 'Game In Progress' : 'Room Full'}
        </h2>
        <p className={styles.subtitle}>
          {isInProgress
            ? `Room ${roomCode} has already started.`
            : `Room ${roomCode} is full with ${aiSlots?.length ? `${aiSlots.length} AI player${aiSlots.length !== 1 ? 's' : ''}` : 'players'}.`}
        </p>

        {aiSlots && aiSlots.length > 0 && !isInProgress && (
          <div className={styles.section}>
            <p className={styles.sectionLabel}>Take an AI slot:</p>
            {aiSlots.map(slot => (
              <button
                key={slot.humanId}
                className={styles.takeSlotBtn}
                onClick={() => onTakeAISlot?.(slot.humanId)}
              >
                Replace <strong>{slot.name}</strong>
                <span className={styles.slotDiff}>{slot.aiDifficulty} AI</span>
              </button>
            ))}
          </div>
        )}

        {openSlots && openSlots.length > 0 && isInProgress && (
          <div className={styles.section}>
            <p className={styles.sectionLabel}>Take an open player slot:</p>
            {openSlots.map(slot => (
              <button
                key={slot.humanId}
                className={styles.takeSlotBtn}
                onClick={() => onTakeOpenSlot?.(slot.humanId)}
              >
                Play as <strong>{slot.name}</strong>
              </button>
            ))}
          </div>
        )}

        <div className={styles.actions}>
          <button className={styles.spectateBtn} onClick={onSpectate}>
            👁 Watch as Spectator
          </button>
          <button className={styles.cancelBtn} onClick={onClose}>
            Go Back
          </button>
        </div>
      </div>
    </div>
  )
}
