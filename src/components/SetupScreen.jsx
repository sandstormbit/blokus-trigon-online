import React, { useState } from 'react'
import { PLAYER_COLORS, COLOR_KEYS } from '../hooks/useGameState.js'
import { GAME_MODES } from '../game/gameModes.js'
import styles from './SetupScreen.module.css'

const PLAYER_COUNT_OPTIONS = [2, 3, 4]

export default function SetupScreen({ onStart }) {
  const [playerCount, setPlayerCount] = useState(4)
  const [playerNames, setPlayerNames] = useState(['', '', ''])
  const [playerColors, setPlayerColors] = useState([null, null, null, null])
  const [gameModes, setGameModes] = useState({
    requiredStart: false,
    zenMode: false,
    megaColors: false,
  })
  const [modesOpen, setModesOpen] = useState(false)

  const updateName = (idx, name) => {
    const updated = [...playerNames]
    updated[idx] = name
    setPlayerNames(updated)
  }

  const updateColor = (slotIdx, color) => {
    const updated = [...playerColors]
    if (updated[slotIdx] === color) {
      updated[slotIdx] = null
    } else {
      const currentHolder = updated.findIndex((c, i) => c === color && i !== slotIdx)
      if (currentHolder !== -1) updated[currentHolder] = null
      updated[slotIdx] = color
    }
    setPlayerColors(updated)
  }

  const toggleMode = (id) => {
    setGameModes(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const slotColor = (idx) => playerColors[idx] || 'blue'

  const handleStart = () => {
    if (playerCount === 2 && gameModes.megaColors) {
      const names = [
        playerNames[0].trim() || 'Player 1',
        playerNames[1].trim() || 'Player 2',
      ]
      const defaults = ['blue', 'red']
      const resolved = [playerColors[0] || defaults[0], playerColors[1] || defaults[1]]
      onStart(2, names, resolved, gameModes)
    } else if (playerCount === 2) {
      const names = [
        playerNames[0].trim() || 'Player 1',
        playerNames[1].trim() || 'Player 2',
      ]
      const defaults = ['blue', 'red', 'green', 'yellow']
      const resolved = playerColors.slice(0, 4).map((c, i) => c || defaults[i])
      onStart(2, names, resolved, gameModes)
    } else {
      const names = Array.from({ length: playerCount }, (_, i) =>
        playerNames[i].trim() || `Player ${i + 1}`
      )
      const defaults = ['blue', 'red', 'green', 'yellow']
      const resolved = playerColors.slice(0, playerCount).map((c, i) => c || defaults[i])
      onStart(playerCount, names, resolved, gameModes)
    }
  }

  const boardSize = playerCount === 3 ? 384 : 486

  return (
    <div className={styles.container}>
      <div className={styles.backdrop} />

      {/* ── Brand header — always centered, never moves ───────── */}
      <div className={styles.header}>
        <div className={styles.logoMark}>
          <svg viewBox="-6 -6 72 64" width="44" height="38" overflow="visible">
            <polygon points="30,4 56,48 4,48" fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinejoin="round"/>
            <polygon points="30,16 46,44 14,44" fill="rgba(59,130,246,0.2)" stroke="#3B82F6" strokeWidth="1.5" strokeLinejoin="round"/>
            <polygon points="20,28 30,44 10,44" fill="rgba(239,68,68,0.3)" stroke="#EF4444" strokeWidth="1" strokeLinejoin="round"/>
            <polygon points="40,28 50,44 30,44" fill="rgba(234,179,8,0.3)" stroke="#EAB308" strokeWidth="1" strokeLinejoin="round"/>
          </svg>
        </div>
        <div className={styles.brand}>
          <h1 className={styles.title}>Blokus Trigon Online</h1>
          <p className={styles.subtitle}>Strategy · Territory · Triangles</p>
        </div>
        <div className={styles.logoMark}>
          <svg viewBox="-6 -6 72 64" width="44" height="38" overflow="visible">
            <polygon points="30,4 56,48 4,48" fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinejoin="round"/>
            <polygon points="30,16 46,44 14,44" fill="rgba(59,130,246,0.2)" stroke="#3B82F6" strokeWidth="1.5" strokeLinejoin="round"/>
            <polygon points="20,28 30,44 10,44" fill="rgba(239,68,68,0.3)" stroke="#EF4444" strokeWidth="1" strokeLinejoin="round"/>
            <polygon points="40,28 50,44 30,44" fill="rgba(234,179,8,0.3)" stroke="#EAB308" strokeWidth="1" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>

      {/* ── Animated panels wrapper ───────────────────────────── */}
      <div className={`${styles.wrapper} ${modesOpen ? styles.wrapperOpen : ''}`}>
        <div className={styles.panels}>

          {/* Left: setup card */}
          <div className={styles.setupCard}>
            {/* Game modes toggle */}
            <button
              className={styles.modesToggleBtn}
              onClick={() => setModesOpen(o => !o)}
              title={modesOpen ? 'Close game modes' : 'Open game modes'}
              type="button"
            >
              <svg viewBox="0 0 16 16" width="13" height="13" fill="none">
                <path
                  d={modesOpen ? 'M10 3L5 8l5 5' : 'M6 3l5 5-5 5'}
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            {/* Player count */}
            <div className={`${styles.section} ${styles.sectionPlayerCount}`}>
              <label className={styles.sectionLabel}>Number of players</label>
              <div className={styles.countSelector}>
                {PLAYER_COUNT_OPTIONS.map(n => (
                  <button
                    key={n}
                    className={`${styles.countBtn} ${playerCount === n ? styles.countBtnActive : ''}`}
                    onClick={() => setPlayerCount(n)}
                  >
                    <span className={styles.countNum}>{n}</span>
                    <span className={styles.countLabel}>players</span>
                    <span className={styles.boardTag}>{n === 3 ? '384' : '486'} tiles</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Player setup */}
            <div className={styles.section}>
              <label className={styles.sectionLabel}>Players</label>
              <div className={styles.playerList}>

                {playerCount === 2 && gameModes.megaColors ? (
                  // Mega Colors 2p: one color per player, gets 2 alpha sets
                  [0, 1].map(humanIdx => (
                    <div key={humanIdx} className={styles.playerRow}>
                      <div
                        className={styles.playerNumber}
                        style={{
                          background: PLAYER_COLORS[slotColor(humanIdx)].bg + '22',
                          borderColor: PLAYER_COLORS[slotColor(humanIdx)].bg,
                        }}
                      >
                        <span style={{ color: PLAYER_COLORS[slotColor(humanIdx)].bg }}>
                          {humanIdx + 1}
                        </span>
                      </div>
                      <input
                        className={styles.nameInput}
                        placeholder={`Player ${humanIdx + 1}`}
                        value={playerNames[humanIdx]}
                        onChange={e => updateName(humanIdx, e.target.value)}
                        maxLength={16}
                      />
                      <div className={styles.colorPicker}>
                        {COLOR_KEYS.map(colorKey => {
                          const isUsed = [0, 1].some(i => playerColors[i] === colorKey && i !== humanIdx)
                          const isSelected = playerColors[humanIdx] === colorKey
                          return (
                            <button
                              key={colorKey}
                              className={`${styles.colorSwatch} ${isSelected ? styles.colorSwatchSelected : ''} ${isUsed ? styles.colorSwatchUsed : ''}`}
                              style={{ background: PLAYER_COLORS[colorKey].bg }}
                              onClick={() => updateColor(humanIdx, colorKey)}
                              title={PLAYER_COLORS[colorKey].label}
                              disabled={isUsed}
                            />
                          )
                        })}
                      </div>
                    </div>
                  ))
                ) : playerCount === 2 ? (
                  // Standard 2p: 2 players each pick 2 color sets
                  [0, 1].map(humanIdx => (
                    <div key={humanIdx} className={styles.twoPlayerGroup}>
                      <div className={styles.twoPlayerHeader}>
                        <div
                          className={styles.playerNumber}
                          style={{
                            background: PLAYER_COLORS[slotColor(humanIdx * 2)].bg + '22',
                            borderColor: PLAYER_COLORS[slotColor(humanIdx * 2)].bg,
                          }}
                        >
                          <span style={{ color: PLAYER_COLORS[slotColor(humanIdx * 2)].bg }}>
                            {humanIdx + 1}
                          </span>
                        </div>
                        <input
                          className={styles.nameInput}
                          placeholder={`Player ${humanIdx + 1}`}
                          value={playerNames[humanIdx]}
                          onChange={e => updateName(humanIdx, e.target.value)}
                          maxLength={16}
                        />
                      </div>
                      <div className={styles.twoPlayerColors}>
                        {[0, 1].map(setIdx => {
                          const slotIdx = humanIdx * 2 + setIdx
                          return (
                            <div key={setIdx} className={styles.twoPlayerColorRow}>
                              <span className={styles.colorSetLabel}>Set {setIdx + 1}</span>
                              <div className={styles.colorPicker}>
                                {COLOR_KEYS.map(colorKey => {
                                  const isUsed = playerColors.slice(0, 4).some((c, i) => c === colorKey && i !== slotIdx)
                                  const isSelected = playerColors[slotIdx] === colorKey
                                  return (
                                    <button
                                      key={colorKey}
                                      className={`${styles.colorSwatch} ${isSelected ? styles.colorSwatchSelected : ''} ${isUsed ? styles.colorSwatchUsed : ''}`}
                                      style={{ background: PLAYER_COLORS[colorKey].bg }}
                                      onClick={() => updateColor(slotIdx, colorKey)}
                                      title={PLAYER_COLORS[colorKey].label}
                                      disabled={isUsed}
                                    />
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))
                ) : (
                  // 3 or 4 players: one color per player
                  Array.from({ length: playerCount }, (_, i) => (
                    <div key={i} className={styles.playerRow}>
                      <div
                        className={styles.playerNumber}
                        style={{
                          background: PLAYER_COLORS[slotColor(i)].bg + '22',
                          borderColor: PLAYER_COLORS[slotColor(i)].bg,
                        }}
                      >
                        <span style={{ color: PLAYER_COLORS[slotColor(i)].bg }}>{i + 1}</span>
                      </div>
                      <input
                        className={styles.nameInput}
                        placeholder={`Player ${i + 1}`}
                        value={playerNames[i]}
                        onChange={e => updateName(i, e.target.value)}
                        maxLength={16}
                      />
                      <div className={styles.colorPicker}>
                        {COLOR_KEYS.map(colorKey => {
                          const isUsed = playerColors.slice(0, playerCount).some((c, j) => c === colorKey && j !== i)
                          const isSelected = playerColors[i] === colorKey
                          return (
                            <button
                              key={colorKey}
                              className={`${styles.colorSwatch} ${isSelected ? styles.colorSwatchSelected : ''} ${isUsed ? styles.colorSwatchUsed : ''}`}
                              style={{ background: PLAYER_COLORS[colorKey].bg }}
                              onClick={() => updateColor(i, colorKey)}
                              title={PLAYER_COLORS[colorKey].label}
                              disabled={isUsed}
                            />
                          )
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Board info */}
            <div className={styles.boardInfo}>
              <div className={styles.boardInfoIcon}>⬡</div>
              <div>
                <div className={styles.boardInfoTitle}>
                  {playerCount === 2 ? '2-player board' : `${playerCount}-player board`} — {boardSize} triangles
                </div>
                <div className={styles.boardInfoDesc}>
                  {playerCount === 2 && gameModes.megaColors
                    ? '2 × 44 pieces per player · 1 color each · Rules enforced'
                    : playerCount === 2
                      ? '2 × 22 pieces per player · 4 color sets total · Rules enforced'
                      : `22 pieces per player · Pass and play · Rules enforced`}
                </div>
              </div>
            </div>

            <button className={styles.startBtn} onClick={handleStart}>
              <span>Start Game</span>
              <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
                <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd"/>
              </svg>
            </button>
          </div>

          {/* Right: game modes panel (animated wrapper) */}
          <div className={`${styles.modesCardWrapper} ${modesOpen ? styles.modesCardWrapperOpen : ''}`}>
            <div className={styles.modesCard}>
              <label className={styles.sectionLabel}>Game modes</label>
              <div className={styles.modesList}>
                {GAME_MODES.map(mode => {
                  const available = mode.availability === 'all' ||
                    (mode.availability === '2p-only' && playerCount === 2)
                  const active = gameModes[mode.id] && available
                  return (
                    <button
                      key={mode.id}
                      className={`${styles.modeToggle} ${active ? styles.modeToggleActive : ''} ${!available ? styles.modeToggleDisabled : ''}`}
                      onClick={() => available && toggleMode(mode.id)}
                      disabled={!available}
                      type="button"
                    >
                      <div className={`${styles.modeToggleCheck} ${active ? styles.modeToggleCheckActive : ''}`}>
                        {active && (
                          <svg viewBox="0 0 10 8" width="9" height="9" fill="none">
                            <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                      <div className={styles.modeToggleBody}>
                        <div className={styles.modeToggleNameRow}>
                          <span className={styles.modeToggleName}>{mode.name}</span>
                          {mode.availability === '2p-only' && (
                            <span className={styles.modeBadge}>2p only</span>
                          )}
                        </div>
                        <div className={styles.modeToggleDesc}>{mode.description}</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

        </div>{/* end .panels */}
      </div>{/* end .wrapper */}

      <p className={styles.footer}>For educational purposes only. Online adaptation of Blokus Trigon by Mattel.</p>
    </div>
  )
}
