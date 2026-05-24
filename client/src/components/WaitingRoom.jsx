import React, { useState, useCallback } from 'react'
import { GAME_MODES } from '../game/gameModes.js'
import { PLAYER_COLORS, COLOR_KEYS } from '../hooks/useGameState.js'
import styles from './WaitingRoom.module.css'
import { playSound } from '../utils/sounds.js'

const DEFAULT_COLORS = ['blue', 'red', 'green', 'yellow']

function triggerBounce(el) {
  if (!el) return
  el.classList.remove('btn-bounce')
  void el.offsetWidth
  el.classList.add('btn-bounce')
}

function triggerBounceInline(el) {
  if (!el) return
  el.style.animation = 'none'
  void el.offsetWidth
  el.style.animation = 'btnBounce 0.48s cubic-bezier(0.34, 1.56, 0.64, 1) both'
  setTimeout(() => { el.style.animation = '' }, 520)
}

function triggerBounceInlineMd(el) {
  if (!el) return
  el.style.animation = 'none'
  void el.offsetWidth
  el.style.animation = 'btnBounceMd 0.48s cubic-bezier(0.34, 1.56, 0.64, 1) both'
  setTimeout(() => { el.style.animation = '' }, 520)
}

export default function WaitingRoom({
  roomCode,
  roomMode,
  players,
  maxPlayers,
  isHost,
  settings,
  myHumanId,
  onUpdateSettings,
  onStartGame,
  onSelectColor,
  onSelectColorSlot,
  onAddAI,
  onRemoveAI,
  onSetAIDifficulty,
  onExit,
}) {
  const [copied, setCopied] = useState(false)
  const [startError, setStartError] = useState(null)
  const [starting, setStarting] = useState(false)
  const [aiDifficulty, setAIDifficulty] = useState({})  // { slotIndex: 'normal'|'hard' } — per slot

  const shareUrl = `${window.location.origin}/api/share?join=${roomCode}`
  const gameModes = settings?.gameModes || {}
  const isTwoPlayerStandard = maxPlayers === 2 && !gameModes.megaColors

  const copyCode = useCallback(() => {
    navigator.clipboard.writeText(roomCode).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [roomCode])

  const copyLink = useCallback(() => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [shareUrl])

  const toggleMode = useCallback((id) => {
    onUpdateSettings({ ...gameModes, [id]: !gameModes[id] })
  }, [gameModes, onUpdateSettings])

  const handleStart = useCallback(() => {
    setStartError(null)
    setStarting(true)
    onStartGame(({ error }) => {
      setStarting(false)
      if (error) {
        const msgs = {
          not_enough_players: `Need ${maxPlayers} players to start. ${players.length}/${maxPlayers} joined.`,
          not_host: 'Only the host can start the game.',
          already_started: 'Game already started.',
        }
        setStartError(msgs[error] || error)
      }
    })
  }, [onStartGame, maxPlayers, players.length])

  const filledSlots = players.length
  const humanSlots = players.filter(p => !p.isAI).length
  const allColorsReady = isTwoPlayerStandard
    ? filledSlots === maxPlayers && players.filter(p => !p.isAI).every(p => p && p.color && p.color2)
    : true
  // Must have at least 1 human + all slots filled
  const canStart = isHost && filledSlots >= maxPlayers && humanSlots >= 1 && allColorsReady

  return (
    <div className={styles.container}>
      <div className={styles.backdrop} />

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.logoMark}>
          <svg viewBox="-6 -6 72 64" width="36" height="32" overflow="visible">
            <polygon points="30,4 56,48 4,48" fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinejoin="round"/>
            <polygon points="30,16 46,44 14,44" fill="rgba(59,130,246,0.2)" stroke="#3B82F6" strokeWidth="1.5" strokeLinejoin="round"/>
          </svg>
        </div>
        <div className={styles.brand}>
          <h1 className={styles.title}>Blokus Trigon</h1>
          <p className={styles.subtitle}>
            {roomMode === 'private' ? 'Private Room' : 'Public Room'} · {maxPlayers} players
          </p>
        </div>
        <button className={styles.exitBtn} onClick={(e) => { triggerBounce(e.currentTarget); playSound('deselect-cancel-home'); setTimeout(onExit, 350) }} title="Leave room">
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none">
            <path d="M7 3H4a1 1 0 00-1 1v12a1 1 0 001 1h3M10 10H17M17 10l-3-3M17 10l-3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Leave
        </button>
      </div>

      <div className={styles.body}>
        {/* Left: Room code + players */}
        <div className={styles.leftPanel}>

          {/* Room code */}
          <div className={styles.codeCard}>
            <div className={styles.codeLabel}>Room Code</div>
            <div className={styles.codeDisplay}>
              <span className={styles.codeText}>{roomCode}</span>
              <button className={styles.copyBtn} onClick={() => { playSound('home-lobby'); copyCode() }} title="Copy room code">
                {copied ? (
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                    <path d="M2 8l4 4 8-8" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : (
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                    <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M11 5V3.5A1.5 1.5 0 009.5 2h-7A1.5 1.5 0 001 3.5v7A1.5 1.5 0 002.5 12H4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                )}
              </button>
            </div>
            <button className={styles.linkBtn} onClick={() => { playSound('home-lobby'); copyLink() }}>
              <svg viewBox="0 0 16 16" width="12" height="12" fill="none">
                <path d="M6.5 9.5a3.5 3.5 0 005 0l2-2a3.5 3.5 0 00-5-5L7.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M9.5 6.5a3.5 3.5 0 00-5 0l-2 2a3.5 3.5 0 005 5l1-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Copy invite link
            </button>
          </div>

          {/* Player slots */}
          <div className={styles.playersCard}>
            <div className={styles.sectionLabel}>
              Players <span className={styles.playerCount}>{filledSlots}/{maxPlayers}</span>
            </div>
            <div className={styles.playerList}>
              {Array.from({ length: maxPlayers }, (_, i) => {
                const player = players[i]
                const isMe = player?.humanId === myHumanId
                return (
                  <div key={i} className={`${styles.playerSlot} ${player ? styles.playerSlotFilled : styles.playerSlotEmpty}`}>
                    <div className={styles.playerSlotNum}>{i + 1}</div>
                    {player ? (
                      <>
                        <div className={styles.playerSlotInfo}>
                          <span className={styles.playerSlotName}>
                            {player.name}
                            {isMe && <span className={styles.youBadge}>You</span>}
                            {player.isHost && <span className={styles.hostBadge}>Host</span>}
                          </span>
                          {isTwoPlayerStandard ? (
                            // 2p standard mode: two color set rows per player
                            <div className={styles.colorSets}>
                              {[0, 1].map(setIdx => {
                                const slotColor = setIdx === 0 ? player.color : player.color2
                                return (
                                  <div key={setIdx} className={styles.colorSetRow}>
                                    <span className={styles.colorSetLabel}>Set {setIdx + 1}</span>
                                    <div className={styles.colorSwatches}>
                                      {COLOR_KEYS.map(colorKey => {
                                        const isActive = slotColor === colorKey
                                        const takenByOther = players.some(p => {
                                          if (!p) return false
                                          if (p.humanId === player.humanId) {
                                            // Same player: block the other slot
                                            return (setIdx === 0 ? p.color2 : p.color) === colorKey
                                          }
                                          // Different player: block both their slots
                                          return p.color === colorKey || p.color2 === colorKey
                                        })
                                        return (
                                          <button
                                            key={colorKey}
                                            className={`${styles.colorSwatch} ${isActive ? styles.colorSwatchActive : ''} ${takenByOther && !isActive ? styles.colorSwatchTaken : ''}`}
                                            style={{ '--swatch-bg': PLAYER_COLORS[colorKey].bg }}
                                            onClick={isMe ? () => { playSound('home-lobby'); onSelectColorSlot(setIdx, isActive ? null : colorKey) } : undefined}
                                            disabled={!isMe || (takenByOther && !isActive)}
                                            title={isMe ? (isActive ? `Deselect ${PLAYER_COLORS[colorKey].label}` : `Select ${PLAYER_COLORS[colorKey].label}`) : PLAYER_COLORS[colorKey].label}
                                            type="button"
                                          />
                                        )
                                      })}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          ) : (
                            // Standard single-color row
                            <div className={styles.colorSwatches}>
                              {COLOR_KEYS.map(colorKey => {
                                const activeColor = player.color || DEFAULT_COLORS[i]
                                const isActive = activeColor === colorKey
                                const takenByOther = players.some((p, j) => {
                                  if (!p || j === i) return false
                                  return (p.color || DEFAULT_COLORS[j]) === colorKey
                                })
                                return (
                                  <button
                                    key={colorKey}
                                    className={`${styles.colorSwatch} ${isActive ? styles.colorSwatchActive : ''} ${takenByOther && !isActive ? styles.colorSwatchTaken : ''}`}
                                    style={{ '--swatch-bg': PLAYER_COLORS[colorKey].bg }}
                                    onClick={isMe ? () => { playSound('home-lobby'); onSelectColor(isActive ? null : colorKey) } : undefined}
                                    disabled={!isMe || (takenByOther && !isActive)}
                                    title={isMe ? (isActive ? `Deselect ${PLAYER_COLORS[colorKey].label}` : `Select ${PLAYER_COLORS[colorKey].label}`) : PLAYER_COLORS[colorKey].label}
                                    type="button"
                                  />
                                )
                              })}
                            </div>
                          )}
                        </div>
                        {player.isAI && isHost ? (
                          <div className={styles.aiSlotControls}>
                            <button
                              className={styles.aiDiffCycleBtn}
                              onClick={() => { playSound('home-lobby'); onSetAIDifficulty?.(player.humanId, player.aiDifficulty === 'normal' ? 'hard' : 'normal') }}
                              title={`Switch to ${player.aiDifficulty === 'normal' ? 'Hard' : 'Normal'} AI`}
                              type="button"
                            >
                              🤖 {player.aiDifficulty === 'hard' ? 'Hard' : 'Normal'} AI
                            </button>
                            <button
                              className={styles.removeAIBtn}
                              onClick={() => { playSound('home-lobby'); onRemoveAI?.(player.humanId) }}
                              title="Remove AI player"
                              type="button"
                            >✕</button>
                          </div>
                        ) : (
                          <div className={`${styles.connDot} ${player.connected ? styles.connDotOn : styles.connDotOff}`} title={player.connected ? 'Connected' : 'Disconnected'}/>
                        )}
                      </>
                    ) : isHost ? (
                      <div className={styles.emptySlotHost}>
                        <span className={styles.playerSlotWaiting}>Waiting for player…</span>
                        <div className={styles.addAIControls}>
                          <select
                            className={styles.aiDiffSelect}
                            value={aiDifficulty[i] || 'normal'}
                            onChange={e => setAIDifficulty(prev => ({ ...prev, [i]: e.target.value }))}
                            onClick={e => e.stopPropagation()}
                          >
                            <option value="normal">Normal</option>
                            <option value="hard">Hard</option>
                          </select>
                          <button
                            className={styles.addAIBtn}
                            onClick={(e) => { triggerBounceInline(e.currentTarget); playSound('add-ai'); onAddAI?.(aiDifficulty[i] || 'normal') }}
                            type="button"
                          >
                            + Add AI
                          </button>
                        </div>
                      </div>
                    ) : (
                      <span className={styles.playerSlotWaiting}>Waiting for player…</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Start button */}
          {isHost && (
            <div className={styles.startArea}>
              {startError && <div className={styles.startError}>{startError}</div>}
              <button
                className={`${styles.startBtn} ${!canStart ? styles.startBtnDisabled : ''}`}
                onClick={(e) => { triggerBounce(e.currentTarget); setTimeout(handleStart, 350) }}
                disabled={!canStart || starting}
              >
                {starting ? 'Starting…' : (
                  <>
                    <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd"/>
                    </svg>
                    Start Game
                  </>
                )}
              </button>
              {!canStart && (
                <p className={styles.startHint}>
                  {filledSlots < maxPlayers
                    ? `Waiting for ${maxPlayers - filledSlots} more player${maxPlayers - filledSlots !== 1 ? 's' : ''} (or add AI)…`
                    : humanSlots === 0
                      ? 'At least one human player is required.'
                      : 'All players must select both color sets before starting.'}
                </p>
              )}
            </div>
          )}

          {!isHost && (
            <div className={styles.waitingForHost}>
              <div className={styles.spinner}/>
              <span>Waiting for host to start the game…</span>
            </div>
          )}
        </div>

        {/* Right: Game modes */}
        <div className={styles.rightPanel}>
          <div className={styles.modesCard}>
            <div className={styles.sectionLabel}>Game Modes</div>
            <p className={styles.modesHint}>Any player can toggle modes before the game starts.</p>
            <div className={styles.modesList}>
              {GAME_MODES.map(mode => {
                const available = mode.availability === 'all' ||
                  (mode.availability === '2p-only' && maxPlayers === 2)
                const active = gameModes[mode.id] && available
                return (
                  <button
                    key={mode.id}
                    className={`${styles.modeToggle} ${active ? styles.modeToggleActive : ''} ${!available ? styles.modeToggleDisabled : ''}`}
                    onClick={(e) => { if (available) { triggerBounceInlineMd(e.currentTarget); playSound(active ? '2-game-modes' : '1-game-modes'); toggleMode(mode.id) } }}
                    disabled={!available}
                    type="button"
                    data-no-bounce
                  >
                    <div className={`${styles.modeCheck} ${active ? styles.modeCheckActive : ''}`}>
                      {active && (
                        <svg viewBox="0 0 10 8" width="9" height="9" fill="none">
                          <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                    <div className={styles.modeBody}>
                      <div className={styles.modeNameRow}>
                        <span className={styles.modeName}>{mode.name}</span>
                        {mode.availability === '2p-only' && (
                          <span className={styles.modeBadge}>2p only</span>
                        )}
                      </div>
                      <div className={styles.modeDesc}>{mode.description}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
