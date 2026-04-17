import React, { useState } from 'react'
import styles from './DisconnectReplaceModal.module.css'

/**
 * Shown to the host when a player has been disconnected for 5+ minutes.
 * Offers to replace them with an AI or dismiss the prompt.
 */
export default function DisconnectReplaceModal({
  playerName,
  onReplaceWithAI,  // (difficulty) => void
  onDismiss,
}) {
  const [difficulty, setDifficulty] = useState('normal')

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.icon}>⚠️</div>
        <h2 className={styles.title}>{playerName} has been away for 5+ minutes</h2>
        <p className={styles.subtitle}>
          As the host, you can replace them with an AI to keep the game going.
        </p>

        <div className={styles.diffRow}>
          <span className={styles.diffLabel}>AI Difficulty</span>
          <div className={styles.diffButtons}>
            <button
              className={`${styles.diffBtn} ${difficulty === 'normal' ? styles.diffBtnActive : ''}`}
              onClick={() => setDifficulty('normal')}
              type="button"
            >Normal</button>
            <button
              className={`${styles.diffBtn} ${difficulty === 'hard' ? styles.diffBtnActive : ''}`}
              onClick={() => setDifficulty('hard')}
              type="button"
            >Hard</button>
          </div>
        </div>

        <div className={styles.actions}>
          <button
            className={styles.replaceBtn}
            onClick={() => onReplaceWithAI(difficulty)}
          >
            Replace with AI
          </button>
          <button className={styles.dismissBtn} onClick={onDismiss}>
            Keep Waiting
          </button>
        </div>
      </div>
    </div>
  )
}
