import React, { useState, useRef, useLayoutEffect } from 'react'
import { PLAYER_COLORS, COLOR_KEYS } from '../hooks/useGameState.js'
import { GAME_MODES } from '../game/gameModes.js'
import styles from './SetupScreen.module.css'
import { playSound } from '../utils/sounds.js'

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

const PLAYER_COUNT_OPTIONS = [2, 3, 4]
// Cycle: human → AI Normal → AI Hard → human
const AI_CYCLE = [null, { isAI: true, difficulty: 'normal' }, { isAI: true, difficulty: 'hard' }]
const AI_LABELS = { null: 'Human', normal: 'AI (Normal)', hard: 'AI (Hard)' }

const AI_ADJECTIVES = [
  'Bouncy', 'Breezy', 'Bubbly', 'Cheerful', 'Cozy', 'Dapper', 'Dazzling', 'Dizzy', 'Dreamy',
  'Fizzy', 'Fluffy', 'Frosty', 'Fuzzy', 'Giddy', 'Gleaming', 'Golden', 'Jolly', 'Jovial',
  'Lively', 'Mellow', 'Mighty', 'Minty', 'Nimble', 'Perky', 'Plucky', 'Radiant', 'Rowdy',
  'Sassy', 'Shiny', 'Sleepy', 'Snappy', 'Snazzy', 'Speedy', 'Spunky', 'Starry', 'Sunny',
  'Tiny', 'Wiggly', 'Wobbly', 'Zany', 'Zippy',
]
const AI_NOUNS = [
  'Axolotl', 'Badger', 'Bunny', 'Capybara', 'Chameleon', 'Chipmunk', 'Dragon', 'Dragonfly',
  'Fox', 'Frog', 'Gecko', 'Hamster', 'Hedgehog', 'Iguana', 'Jellyfish', 'Koala',
  'Lemur', 'Llama', 'Narwhal', 'Octopus', 'Otter', 'Penguin', 'Platypus', 'Puffin',
  'Quokka', 'Sloth', 'Snail', 'Squirrel', 'Unicorn', 'Wombat', 'Yeti',
]
function generateAIName() {
  const adj = AI_ADJECTIVES[Math.floor(Math.random() * AI_ADJECTIVES.length)]
  const noun = AI_NOUNS[Math.floor(Math.random() * AI_NOUNS.length)]
  return `${adj} ${noun}`
}

export default function SetupScreen({ onStart, onBack }) {
  const [playerCount, setPlayerCount] = useState(4)  // drives button active state (immediate)
  const [shownCount, setShownCount] = useState(4)    // drives player list rendering (animated)
  const [hiding, setHiding] = useState(false)        // true during the fade-out phase
  const [playerNames, setPlayerNames] = useState(['', '', ''])
  const [playerColors, setPlayerColors] = useState([null, null, null, null])
  // playerAI[i] = null (human) | { isAI: true, difficulty: 'normal'|'hard' }
  const [playerAI, setPlayerAI] = useState([null, null, null, null])
  const [gameModes, setGameModes] = useState({
    requiredStart: false,
    zenMode: false,
    megaColors: false,
  })
  const [modesOpen, setModesOpen] = useState(false)
  const [shownMegaColors, setShownMegaColors] = useState(false) // drives layout (animated)
  const playerContentRef = useRef(null)
  const isFirstMount = useRef(true)

  const updateName = (idx, name) => {
    const updated = [...playerNames]
    updated[idx] = name
    setPlayerNames(updated)
  }

  const cycleAI = (idx) => {
    const updatedAI = [...playerAI]
    const updatedColors = [...playerColors]
    const updatedNames = [...playerNames]

    // 2p standard: each player owns two color slots (idx*2 and idx*2+1)
    const is2pStd = shownCount === 2 && !shownMegaColors

    const currentCycleIdx = AI_CYCLE.findIndex(a =>
      a === null ? updatedAI[idx] === null : (updatedAI[idx]?.difficulty === a?.difficulty)
    )
    const nextCycleIdx = (currentCycleIdx + 1) % AI_CYCLE.length
    const next = AI_CYCLE[nextCycleIdx]
    const wasHuman = updatedAI[idx] === null
    // Prevent all slots being AI
    const humanCount = updatedAI.filter((a, i) => i !== idx && a === null).length
    if (next !== null && humanCount === 0) return

    if (next !== null && wasHuman) {
      // Transitioning human → AI: auto-assign color(s) and generate a name
      if (is2pStd) {
        const otherStart = idx === 0 ? 2 : 0
        const taken = [updatedColors[otherStart], updatedColors[otherStart + 1]].filter(Boolean)
        const available = COLOR_KEYS.filter(c => !taken.includes(c))
        updatedColors[idx * 2]     = available[0] ?? null
        updatedColors[idx * 2 + 1] = available[1] ?? null
      } else {
        const taken = updatedColors.slice(0, shownCount).filter((c, i) => i !== idx && c !== null)
        const available = COLOR_KEYS.filter(c => !taken.includes(c))
        updatedColors[idx] = available[0] ?? null
      }
      updatedNames[idx] = generateAIName()
    } else if (next === null) {
      // Transitioning AI → human: clear the auto-assigned values
      if (is2pStd) {
        updatedColors[idx * 2]     = null
        updatedColors[idx * 2 + 1] = null
      } else {
        updatedColors[idx] = null
      }
      updatedNames[idx] = ''
    }
    // Normal → Hard: keep existing name and color

    updatedAI[idx] = next === null ? null : { ...next }
    setPlayerAI(updatedAI)
    setPlayerColors(updatedColors)
    setPlayerNames(updatedNames)
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

  const handleMegaColorsToggle = () => {
    const newVal = !gameModes.megaColors
    setGameModes(prev => ({ ...prev, megaColors: newVal })) // immediate for button active state

    const outer = playerContentRef.current
    if (outer) {
      outer.style.transition = 'none'
      outer.style.height = outer.offsetHeight + 'px'
    }

    setHiding(true)
    setTimeout(() => {
      setShownMegaColors(newVal)
      setHiding(false)
    }, 1000)
  }

  const handleCountChange = (n) => {
    if (n === playerCount) return
    setPlayerCount(n)      // update active button immediately

    // Pin current height so it doesn't snap when content swaps
    const outer = playerContentRef.current
    if (outer) {
      outer.style.transition = 'none'
      outer.style.height = outer.offsetHeight + 'px'
    }

    setHiding(true)
    setTimeout(() => {
      setShownCount(n)     // swap content while faded out
      setHiding(false)     // key change + class removal → new element fades in
    }, 1000)
  }

  // After content swaps, animate height from pinned old value to new natural height
  useLayoutEffect(() => {
    if (isFirstMount.current) { isFirstMount.current = false; return }
    const outer = playerContentRef.current
    if (!outer) return

    // Briefly measure the outer's true natural height (includes child margins
    // captured by the BFC that overflow:hidden creates — inner.offsetHeight
    // would miss collapsed margins and land at the wrong target)
    const pinnedH = outer.style.height
    outer.style.transition = 'none'
    outer.style.height = 'auto'
    const newH = outer.offsetHeight
    outer.style.height = pinnedH  // restore pin before paint

    requestAnimationFrame(() => {
      outer.style.transition = 'height 1000ms ease'
      outer.style.height = newH + 'px'
    })
    const timer = setTimeout(() => {
      outer.style.height = ''
      outer.style.transition = ''
    }, 1200)
    return () => clearTimeout(timer)
  }, [shownCount, shownMegaColors])

  const slotColor = (idx) => playerColors[idx] || 'blue'

  const allColorsSelected = (() => {
    if (playerCount === 2 && gameModes.megaColors) {
      return [0, 1].every(i => playerColors[i] !== null || playerAI[i]?.isAI)
    } else if (playerCount === 2) {
      // 4 color slots — AI players don't need to pick colors
      // Each player owns two slots: player 0 → slots 0,1 · player 1 → slots 2,3
      return [0, 1, 2, 3].every(i => {
        const humanIdx = Math.floor(i / 2)
        return playerColors[i] !== null || playerAI[humanIdx]?.isAI
      })
    } else {
      return playerColors.slice(0, playerCount).every((c, i) => c !== null || playerAI[i]?.isAI)
    }
  })()

  const handleStart = () => {
    const defaults = ['blue', 'red', 'green', 'yellow']
    const pickUnique = (colors) => {
      const taken = new Set()
      return colors.map((c) => {
        if (c) { taken.add(c); return c }
        const avail = defaults.find(d => !taken.has(d)) || defaults[0]
        taken.add(avail)
        return avail
      })
    }
    if (playerCount === 2 && gameModes.megaColors) {
      const names = [0, 1].map(i => playerNames[i].trim() || `Player ${i + 1}`)
      const resolved = pickUnique(playerColors.slice(0, 2))
      onStart(2, names, resolved, gameModes, playerAI.slice(0, 2))
    } else if (playerCount === 2) {
      const names = [0, 1].map(i => playerNames[i].trim() || `Player ${i + 1}`)
      const resolved = pickUnique(playerColors.slice(0, 4))
      onStart(2, names, resolved, gameModes, playerAI.slice(0, 2))
    } else {
      const names = Array.from({ length: playerCount }, (_, i) =>
        playerNames[i].trim() || (playerAI[i]?.isAI ? generateAIName() : `Player ${i + 1}`)
      )
      const resolved = pickUnique(playerColors.slice(0, playerCount))
      onStart(playerCount, names, resolved, gameModes, playerAI.slice(0, playerCount))
    }
  }

  const boardSize = shownCount === 3 ? 384 : 486

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
          <h1 className={styles.title}>Blokus Trigon</h1>
          <p className={styles.subtitle}>Local Game</p>
        </div>
        {onBack ? (
          <button
            className={styles.backBtn}
            onClick={(e) => { triggerBounce(e.currentTarget); playSound('deselect-cancel-home'); setTimeout(onBack, 350) }}
            title="Back to main menu"
            type="button"
          >
            <svg viewBox="0 0 20 20" width="15" height="15" fill="none">
              <path d="M7 3H4a1 1 0 00-1 1v12a1 1 0 001 1h3M10 10H17M17 10l-3-3M17 10l-3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Menu
          </button>
        ) : (
          <div className={styles.logoMark}>
            <svg viewBox="-6 -6 72 64" width="44" height="38" overflow="visible">
              <polygon points="30,4 56,48 4,48" fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinejoin="round"/>
              <polygon points="30,16 46,44 14,44" fill="rgba(59,130,246,0.2)" stroke="#3B82F6" strokeWidth="1.5" strokeLinejoin="round"/>
              <polygon points="20,28 30,44 10,44" fill="rgba(239,68,68,0.3)" stroke="#EF4444" strokeWidth="1" strokeLinejoin="round"/>
              <polygon points="40,28 50,44 30,44" fill="rgba(234,179,8,0.3)" stroke="#EAB308" strokeWidth="1" strokeLinejoin="round"/>
            </svg>
          </div>
        )}
      </div>

      {/* ── Animated panels wrapper ───────────────────────────── */}
      <div className={`${styles.wrapper} ${modesOpen ? styles.wrapperOpen : ''}`}>
        <div className={styles.panels}>

          {/* Left: setup card */}
          <div className={styles.setupCard}>
            {/* Game modes toggle */}
            <button
              className={styles.modesToggleBtn}
              onClick={() => { playSound('home-lobby'); setModesOpen(o => !o) }}
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
                    onClick={() => { playSound('home-lobby'); handleCountChange(n) }}
                  >
                    <span className={styles.countNum}>{n}</span>
                    <span className={styles.countLabel}>players</span>
                    <span className={styles.boardTag}>{n === 3 ? '384' : '486'} tiles</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Player setup + board info — animated when count changes */}
            <div ref={playerContentRef} className={styles.playerContentOuter}>
            <div
              key={`${shownCount}-${shownMegaColors}`}
              className={`${styles.playerContent} ${hiding ? styles.playerContentOut : ''}`}
            >
            <div className={styles.section}>
              <label className={styles.sectionLabel}>Players</label>
              <div className={styles.playerList}>

                {shownCount === 2 && shownMegaColors ? (
                  // Mega Colors 2p: one color per player, gets 2 alpha sets
                  [0, 1].map(humanIdx => {
                    const isAI = playerAI[humanIdx]?.isAI
                    return (
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
                      {isAI ? (
                        <span className={styles.aiLabel}>
                          {playerNames[humanIdx] || AI_LABELS[playerAI[humanIdx].difficulty]}
                          <span className={styles.aiDiffBadge}>{playerAI[humanIdx].difficulty === 'hard' ? 'Hard' : 'Normal'}</span>
                        </span>
                      ) : (
                        <input
                          className={styles.nameInput}
                          placeholder={`Player ${humanIdx + 1}`}
                          value={playerNames[humanIdx]}
                          onChange={e => updateName(humanIdx, e.target.value)}
                          maxLength={16}
                        />
                      )}
                      <button
                        className={`${styles.aiToggle} ${isAI ? styles.aiToggleActive : ''}`}
                        onClick={() => { playSound('home-lobby'); cycleAI(humanIdx) }}
                        title={`Toggle AI (current: ${isAI ? AI_LABELS[playerAI[humanIdx].difficulty] : 'Human'})`}
                        type="button"
                      >
                        AI
                      </button>
                      <div className={styles.colorPicker} style={{ pointerEvents: isAI ? 'none' : 'auto' }}>
                        {COLOR_KEYS.map(colorKey => {
                          const isUsed = [0, 1].some(i => playerColors[i] === colorKey && i !== humanIdx)
                          const isSelected = playerColors[humanIdx] === colorKey
                          return (
                            <button
                              key={colorKey}
                              className={`${styles.colorSwatch} ${isSelected ? styles.colorSwatchSelected : ''} ${isUsed ? styles.colorSwatchUsed : ''}`}
                              style={{ background: PLAYER_COLORS[colorKey].bg }}
                              onClick={() => { playSound('home-lobby'); updateColor(humanIdx, colorKey) }}
                              title={PLAYER_COLORS[colorKey].label}
                              disabled={isUsed || isAI}
                            />
                          )
                        })}
                      </div>
                    </div>
                    )
                  })
                ) : shownCount === 2 ? (
                  // Standard 2p: 2 players each pick 2 color sets
                  [0, 1].map(humanIdx => {
                    const isAI = playerAI[humanIdx]?.isAI
                    return (
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
                        {isAI ? (
                          <span className={styles.aiLabel}>
                            {playerNames[humanIdx] || AI_LABELS[playerAI[humanIdx].difficulty]}
                            <span className={styles.aiDiffBadge}>{playerAI[humanIdx].difficulty === 'hard' ? 'Hard' : 'Normal'}</span>
                          </span>
                        ) : (
                          <input
                            className={styles.nameInput}
                            placeholder={`Player ${humanIdx + 1}`}
                            value={playerNames[humanIdx]}
                            onChange={e => updateName(humanIdx, e.target.value)}
                            maxLength={16}
                          />
                        )}
                        <button
                          className={`${styles.aiToggle} ${isAI ? styles.aiToggleActive : ''}`}
                          onClick={() => { playSound('home-lobby'); cycleAI(humanIdx) }}
                          title={`Toggle AI (current: ${isAI ? AI_LABELS[playerAI[humanIdx].difficulty] : 'Human'})`}
                          type="button"
                        >
                          AI
                        </button>
                      </div>
                      <div className={styles.twoPlayerColors}>
                        {[0, 1].map(setIdx => {
                          const slotIdx = humanIdx * 2 + setIdx
                          return (
                            <div key={setIdx} className={styles.twoPlayerColorRow}>
                              <span className={styles.colorSetLabel}>Set {setIdx + 1}</span>
                              <div className={styles.colorPicker} style={{ pointerEvents: isAI ? 'none' : 'auto' }}>
                                {COLOR_KEYS.map(colorKey => {
                                  const isUsed = playerColors.slice(0, 4).some((c, i) => c === colorKey && i !== slotIdx)
                                  const isSelected = playerColors[slotIdx] === colorKey
                                  return (
                                    <button
                                      key={colorKey}
                                      className={`${styles.colorSwatch} ${isSelected ? styles.colorSwatchSelected : ''} ${isUsed ? styles.colorSwatchUsed : ''}`}
                                      style={{ background: PLAYER_COLORS[colorKey].bg }}
                                      onClick={() => { playSound('home-lobby'); updateColor(slotIdx, colorKey) }}
                                      title={PLAYER_COLORS[colorKey].label}
                                      disabled={isUsed || isAI}
                                    />
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                    )
                  })
                ) : (
                  // 3 or 4 players: one color per player
                  Array.from({ length: shownCount }, (_, i) => {
                    const isAI = playerAI[i]?.isAI
                    return (
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
                      {isAI ? (
                        <span className={styles.aiLabel}>
                          {playerNames[i] || AI_LABELS[playerAI[i].difficulty]}
                          <span className={styles.aiDiffBadge}>{playerAI[i].difficulty === 'hard' ? 'Hard' : 'Normal'}</span>
                        </span>
                      ) : (
                        <input
                          className={styles.nameInput}
                          placeholder={`Player ${i + 1}`}
                          value={playerNames[i]}
                          onChange={e => updateName(i, e.target.value)}
                          maxLength={16}
                        />
                      )}
                      <button
                        className={`${styles.aiToggle} ${isAI ? styles.aiToggleActive : ''}`}
                        onClick={() => { playSound('home-lobby'); cycleAI(i) }}
                        title={`Toggle AI (current: ${isAI ? AI_LABELS[playerAI[i].difficulty] : 'Human'})`}
                        type="button"
                      >
                        AI
                      </button>
                      <div className={styles.colorPicker} style={{ pointerEvents: isAI ? 'none' : 'auto' }}>
                        {COLOR_KEYS.map(colorKey => {
                          const isUsed = playerColors.slice(0, shownCount).some((c, j) => c === colorKey && j !== i)
                          const isSelected = playerColors[i] === colorKey
                          return (
                            <button
                              key={colorKey}
                              className={`${styles.colorSwatch} ${isSelected ? styles.colorSwatchSelected : ''} ${isUsed ? styles.colorSwatchUsed : ''}`}
                              style={{ background: PLAYER_COLORS[colorKey].bg }}
                              onClick={() => { playSound('home-lobby'); updateColor(i, colorKey) }}
                              title={PLAYER_COLORS[colorKey].label}
                              disabled={isUsed || isAI}
                            />
                          )
                        })}
                      </div>
                    </div>
                    )
                  })
                )}
              </div>
            </div>

            {/* Board info */}
            <div className={styles.boardInfo}>
              <div className={styles.boardInfoIcon}>⬡</div>
              <div>
                <div className={styles.boardInfoTitle}>
                  {shownCount === 2 ? '2-player board' : `${shownCount}-player board`} — {boardSize} triangles
                </div>
                <div className={styles.boardInfoDesc}>
                  {shownCount === 2 && shownMegaColors
                    ? '2 × 44 pieces per player · 1 color each · Rules enforced'
                    : shownCount === 2
                      ? '2 × 22 pieces per player · 4 color sets total · Rules enforced'
                      : `22 pieces per player · Local game · Rules enforced`}
                </div>
              </div>
            </div>
            </div>{/* end animated playerContent inner */}
            </div>{/* end playerContentOuter */}

            <button className={styles.startBtn} onClick={() => setTimeout(handleStart, 320)} disabled={!allColorsSelected}>
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
                      onClick={(e) => {
                        if (!available) return
                        triggerBounceInline(e.currentTarget)
                        playSound(active ? '2-game-modes' : '1-game-modes')
                        if (mode.id === 'megaColors' && shownCount === 2) handleMegaColorsToggle()
                        else toggleMode(mode.id)
                      }}
                      disabled={!available}
                      type="button"
                      data-no-bounce
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
