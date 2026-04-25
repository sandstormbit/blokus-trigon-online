import React, { useMemo } from 'react'
import Modal from './Modal.jsx'
import PiecePreview from './PiecePreview.jsx'
import { PLAYER_COLORS } from '../hooks/useGameState.js'
import styles from './EndGameModal.module.css'

function triggerBounce(el) {
  if (!el) return
  el.classList.remove('btn-bounce')
  void el.offsetWidth
  el.classList.add('btn-bounce')
}

function CrownIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
      <path d="M2 19h20v2H2v-2zM2 7l5 5 5-6 5 6 5-5v10H2V7z"/>
    </svg>
  )
}

function formatTime(ms) {
  if (!ms) return null
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export default function EndGameModal({ players, playerCount, onNewGame, onViewBoard, onClose, isHost = true, playerTimers = {} }) {
  // For 2-player mode, consolidate by humanId
  const ranked = useMemo(() => {
    if (playerCount === 2) {
      // Group slots by humanId
      const humanMap = {}
      for (const p of players) {
        if (!humanMap[p.humanId]) {
          humanMap[p.humanId] = { humanId: p.humanId, name: null, slots: [], score: 0, colors: [] }
        }
        humanMap[p.humanId].slots.push(p)
        humanMap[p.humanId].score += p.score
        humanMap[p.humanId].colors.push(p.color)
      }
      // Derive player name from first slot (strip the "(Color)" suffix)
      for (const h of Object.values(humanMap)) {
        const rawName = h.slots[0].name
        // Name was set as "PlayerName (Color)" — strip the color suffix
        h.name = rawName.replace(/\s*\([^)]+\)$/, '') || `Player ${h.humanId}`
      }
      return Object.values(humanMap).sort((a, b) => a.score - b.score)
    }
    return [...players].sort((a, b) => a.score - b.score)
  }, [players, playerCount])

  const winner = ranked[0]
  const isTie = ranked.length > 1 && ranked[0].score === ranked[1].score
  const tiedPlayers = isTie ? ranked.filter(p => p.score === ranked[0].score) : []

  // For 2p: winner color = first color of winner's slots; for display use primary color
  const winnerPrimaryColor = playerCount === 2
    ? winner.colors[0]
    : winner.color

  // Compute per-entry total timer (sum slots for 2p, direct for 3/4p)
  // Only compare human players (non-AI) for turtle/rocket
  const { fastestId, slowestId } = useMemo(() => {
    const humanTimes = []
    for (const entry of ranked) {
      if (playerCount === 2) {
        if (entry.slots.some(s => s.isAI)) continue
        const totalMs = entry.slots.reduce((s, p) => s + (playerTimers[p.id] || 0), 0)
        if (totalMs > 0) humanTimes.push({ id: `h${entry.humanId}`, ms: totalMs })
      } else {
        const p = entry  // entry is a plain player
        if (!p.isAI && (playerTimers[p.id] || 0) > 0) {
          humanTimes.push({ id: p.id, ms: playerTimers[p.id] || 0 })
        }
      }
    }
    if (humanTimes.length < 2) return { fastestId: null, slowestId: null }
    const fastest = humanTimes.reduce((a, b) => b.ms < a.ms ? b : a)
    const slowest = humanTimes.reduce((a, b) => b.ms > a.ms ? b : a)
    return { fastestId: fastest.id, slowestId: slowest.id }
  }, [ranked, playerTimers, playerCount])

  const getTimerKey = (entry) =>
    playerCount === 2 ? `h${entry.humanId}` : entry.id

  return (
    <Modal title="Game over" wide onClose={onClose}>
      {/* Winner announcement */}
      <div className={styles.winnerBanner}>
        {isTie ? (
          <>
            <div className={styles.tieLabel}>It's a tie!</div>
            <div className={styles.tiedNames}>
              {tiedPlayers.map(p => (
                <span
                  key={p.humanId || p.id}
                  style={{ color: PLAYER_COLORS[playerCount === 2 ? p.colors[0] : p.color].bg }}
                  className={styles.tiedName}
                >
                  {p.name}
                </span>
              ))}
            </div>
            <div className={styles.tieScore}>{ranked[0].score} triangles remaining</div>
          </>
        ) : (
          <>
            <div className={styles.crownIcon} style={{ color: PLAYER_COLORS[winnerPrimaryColor].bg }}>
              <CrownIcon />
            </div>
            <div className={styles.winnerName} style={{ color: PLAYER_COLORS[winnerPrimaryColor].bg }}>
              {winner.name}
            </div>
            <div className={styles.winnerLabel}>wins!</div>
            <div className={styles.winnerScore}>
              {winner.score === 0
                ? 'Placed all pieces — perfect score!'
                : `${winner.score} triangle${winner.score !== 1 ? 's' : ''} remaining`}
            </div>
          </>
        )}
      </div>

      {/* Full scoreboard */}
      <div className={styles.scoreboard}>
        <div className={styles.scoreboardLabel}>Final scores</div>
        {ranked.map((entry, idx) => {
          const isWinner = entry.score === ranked[0].score

          if (playerCount === 2) {
            // entry is a consolidated human entry with .slots, .colors, .score
            const primaryColor = PLAYER_COLORS[entry.colors[0]]
            const totalPlaced = entry.slots.reduce((s, p) => s + p.pieces.filter(pc => pc.placed).length, 0)
            const remainingPieces = entry.slots.flatMap(p =>
              p.pieces.filter(pc => !pc.placed).map(pc => ({ ...pc, color: p.color }))
            ).sort((a, b) => b.size - a.size)
            const timerKey = getTimerKey(entry)
            const totalMs = entry.slots.reduce((s, p) => s + (playerTimers[p.id] || 0), 0)
            const timeStr = formatTime(totalMs)

            return (
              <div
                key={entry.humanId}
                className={`${styles.scoreRow} ${isWinner ? styles.scoreRowWinner : ''}`}
                style={{ '--pc': primaryColor.bg }}
              >
                <div className={styles.scoreRowTop}>
                  <div className={styles.rank}>
                    {isWinner
                      ? <span className={styles.rankCrown} style={{ color: primaryColor.bg }}><CrownIcon /></span>
                      : <span className={styles.rankNum}>{idx + 1}</span>
                    }
                  </div>
                  {/* Show both color dots for 2p */}
                  <div className={styles.colorDots}>
                    {entry.colors.map(c => (
                      <div key={c} className={styles.playerColorDot} style={{ background: PLAYER_COLORS[c].bg, boxShadow: `0 0 8px ${PLAYER_COLORS[c].bg}60` }} />
                    ))}
                  </div>
                  <div className={styles.scorePlayerInfo}>
                    <div className={styles.scorePlayerName}>
                      {entry.name}
                      {!entry.slots.some(s => s.isAI) && timerKey === fastestId && <span className={styles.timerEmoji} title="Fastest player">🚀</span>}
                      {!entry.slots.some(s => s.isAI) && timerKey === slowestId && <span className={styles.timerEmoji} title="Slowest player">🐢</span>}
                    </div>
                    <div className={styles.scorePlayerMeta}>
                      {totalPlaced} of 44 placed · {entry.colors.map(c => PLAYER_COLORS[c].label).join(' & ')}
                      {timeStr && <span className={styles.timerBadge}>⏱ {timeStr}</span>}
                    </div>
                  </div>
                  <div className={styles.scoreValue}>
                    <span className={styles.scoreNumber} style={{ color: isWinner ? primaryColor.bg : 'var(--color-text-primary)' }}>
                      {entry.score}
                    </span>
                    <span className={styles.scoreUnit}>pts</span>
                  </div>
                </div>

                {remainingPieces.length > 0 && (
                  <div className={styles.remainingPieces}>
                    <div className={styles.remainingLabel}>Unplaced pieces:</div>
                    <div className={styles.remainingGrid}>
                      {remainingPieces.map((piece, pi) => {
                        const colorInfo = PLAYER_COLORS[piece.color]
                        return (
                          <div key={`${piece.color}-${piece.id}-${pi}`} className={styles.remainingPiece} title={`Piece ${piece.id} (${piece.size}▲)`}>
                            <PiecePreview
                              piece={piece}
                              color={colorInfo.bg + 'BB'}
                              colorDark={colorInfo.dark}
                              size={26}
                              rotIndex={piece.rotIndex || 0}
                              flipped={piece.flipped || false}
                            />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          } else {

          // 3/4-player: entry is a plain player
          const player = entry
          const colorInfo = PLAYER_COLORS[player.color]
          const placedCount = player.pieces.filter(p => p.placed).length
          const remainingPieces = player.pieces.filter(p => !p.placed).sort((a, b) => b.size - a.size)
          const timerKey = getTimerKey(player)
          const timeStr = formatTime(playerTimers[player.id])

          return (
            <div
              key={player.id}
              className={`${styles.scoreRow} ${isWinner ? styles.scoreRowWinner : ''}`}
              style={{ '--pc': colorInfo.bg }}
            >
              <div className={styles.scoreRowTop}>
                <div className={styles.rank}>
                  {isWinner
                    ? <span className={styles.rankCrown} style={{ color: colorInfo.bg }}><CrownIcon /></span>
                    : <span className={styles.rankNum}>{idx + 1}</span>
                  }
                </div>
                <div className={styles.colorDots}>
                  <div className={styles.playerColorDot} style={{ background: colorInfo.bg, boxShadow: `0 0 8px ${colorInfo.bg}60` }} />
                </div>
                <div className={styles.scorePlayerInfo}>
                  <div className={styles.scorePlayerName}>
                    {player.name}
                    {!player.isAI && timerKey === fastestId && <span className={styles.timerEmoji} title="Fastest player">🚀</span>}
                    {!player.isAI && timerKey === slowestId && <span className={styles.timerEmoji} title="Slowest player">🐢</span>}
                  </div>
                  <div className={styles.scorePlayerMeta}>
                    {placedCount} of 22 placed
                    {timeStr && <span className={styles.timerBadge}>⏱ {timeStr}</span>}
                  </div>
                </div>
                <div className={styles.scoreValue}>
                  <span className={styles.scoreNumber} style={{ color: isWinner ? colorInfo.bg : 'var(--color-text-primary)' }}>
                    {player.score}
                  </span>
                  <span className={styles.scoreUnit}>pts</span>
                </div>
              </div>

              {remainingPieces.length > 0 && (
                <div className={styles.remainingPieces}>
                  <div className={styles.remainingLabel}>Unplaced pieces:</div>
                  <div className={styles.remainingGrid}>
                    {remainingPieces.map(piece => (
                      <div key={piece.id} className={styles.remainingPiece} title={`Piece ${piece.id} (${piece.size}▲)`}>
                        <PiecePreview
                          piece={piece}
                          color={colorInfo.bg + 'BB'}
                          colorDark={colorInfo.dark}
                          size={26}
                          rotIndex={piece.rotIndex || 0}
                          flipped={piece.flipped || false}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
          } // end else (3/4-player)
        })}
      </div>

      <div className={styles.btnRow}>
        {onViewBoard && (
          <button className={styles.viewBoardBtn} onClick={(e) => { triggerBounce(e.currentTarget); setTimeout(onViewBoard, 350) }}>
            <svg viewBox="0 0 20 20" width="15" height="15" fill="currentColor">
              <path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/>
              <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd"/>
            </svg>
            View board
          </button>
        )}
        {isHost ? (
          <button className={styles.newGameBtn} onClick={(e) => { triggerBounce(e.currentTarget); setTimeout(onNewGame, 350) }}>
            <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1z" clipRule="evenodd"/>
            </svg>
            New game
          </button>
        ) : (
          <button className={styles.waitingNewGameBtn} disabled>
            <div className={styles.waitingSpinner} />
            Waiting for host to start a new game…
          </button>
        )}
      </div>
    </Modal>
  )
}
