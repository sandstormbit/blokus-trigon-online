import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { playSound } from '../utils/sounds.js'

function triggerBounce(el) {
  if (!el) return
  el.classList.remove('btn-bounce')
  void el.offsetWidth
  el.classList.add('btn-bounce')
}
import Board from './Board.jsx'
import PlayerPanel from './PlayerPanel.jsx'
import PieceControlPanel from './PieceControlPanel.jsx'
import HUD from './HUD.jsx'
import { PLAYER_COLORS } from '../hooks/useGameState.js'
import AnimatedScore from './AnimatedScore.jsx'
import PlacementConfirmModal from './PlacementConfirmModal.jsx'
import EndGameConfirmModal from './EndGameConfirmModal.jsx'
import EndGameModal from './EndGameModal.jsx'
import NoMovesModal from './NoMovesModal.jsx'
import RemovePieceModal from './RemovePieceModal.jsx'
import { useKeyboard } from '../hooks/useKeyboard.js'
import styles from './GameScreen.module.css'

export default function GameScreen({
  state,
  currentPlayer,
  getSelectedPiece,
  getGhostCells,
  selectPiece,
  deselectPiece,
  rotatePiece,
  rotatePieceReverse,
  flipPiece,
  setHover,
  placePiece,
  confirmPlacement,
  cancelPlacement,
  dismissNoMoves,
  confirmSkip,
  removePiece,
  endTurn,
  requestEndGame,
  confirmEndGame,
  cancelEndGame,
  newGame,
  // Online-specific props (optional — not used in pass-and-play)
  isOnline = false,
  isHostPlayer = true,
  myHumanId = null,
  isMyTurn = true,
  onlineRoomCode = null,
  onlinePlayers = null,
  onExit = null,
  otherPlayersGhosts = null,
}) {
  const [viewingFinalBoard, setViewingFinalBoard] = useState(false)
  const [freeHoverEnabled, setFreeHoverEnabled] = useState(true)
  const [showSkipConfirm, setShowSkipConfirm] = useState(false)
  const [showRemovePieceModal, setShowRemovePieceModal] = useState(false)
  const [noMovesLocallyDismissed, setNoMovesLocallyDismissed] = useState(false)
  const [enhancedColoring, setEnhancedColoring] = useState(false)
  const [autoAdvanceEnabled, setAutoAdvanceEnabled] = useState(false)
  const [controlPanelOpen, setControlPanelOpen] = useState(false)
  const [controlPanelAnchorTop, setControlPanelAnchorTop] = useState(100)
  const toggleFreeHover = useCallback(() => setFreeHoverEnabled(v => !v), [])
  const toggleEnhancedColoring = useCallback(() => setEnhancedColoring(v => !v), [])
  const toggleAutoAdvance = useCallback(() => setAutoAdvanceEnabled(v => !v), [])
  const toggleControlPanel  = useCallback(() => setControlPanelOpen(v => !v), [])
  const openControlPanel   = useCallback(() => setControlPanelOpen(true), [])
  const closeControlPanel  = useCallback(() => setControlPanelOpen(false), [])

  // Refs for PieceControlPanel positioning
  const controlPanelBounceRef = useRef(null)
  const activePanelRef = useRef(null)
  // Stable refs for 2p-standard local toggle positioning — one per player slot, always attached to
  // the same DOM element. Four separate refs avoid the ref-swap ordering issue that occurs when a
  // single ref moves between DOM elements (React detaches before attaching, leaving a null window).
  const p0PanelRef = useRef(null)
  const p1PanelRef = useRef(null)
  const p2PanelRef = useRef(null)
  const p3PanelRef = useRef(null)

  // Auto-open control panel on each color's first piece selection
  const autoOpenedPlayerIds = useRef(new Set())
  const prevSelectedPieceRef = useRef(null)
  useEffect(() => {
    const pid = currentPlayer?.id
    if (state.selectedPieceId !== null && prevSelectedPieceRef.current === null && pid && !autoOpenedPlayerIds.current.has(pid)) {
      setControlPanelOpen(true)
      autoOpenedPlayerIds.current.add(pid)
    }
    prevSelectedPieceRef.current = state.selectedPieceId
  }, [state.selectedPieceId, currentPlayer?.id])

  // Computed early so the useLayoutEffect below can use it without hitting the TDZ.
  const toggleOwnerPlayerEarly = (() => {
    if (isOnline && myHumanId !== null) {
      const myPlayers = state.players.filter(p => p.humanId === myHumanId)
      return myPlayers.find(p => p.id === currentPlayer?.id) ?? myPlayers[0] ?? currentPlayer
    }
    return currentPlayer
  })()

  // Track toggle owner panel's viewport top for positioning the floating panel.
  // 2p standard uses stable per-slot refs to avoid the null window when a single ref moves
  // between DOM elements. Works for both local and online 2p standard games.
  useLayoutEffect(() => {
    const is2pStd = state.playerCount === 2 && !state.gameModes?.megaColors
    let ref
    if (is2pStd) {
      const refMap = [p0PanelRef, p1PanelRef, p2PanelRef, p3PanelRef]
      const toggleIdx = state.players.findIndex(p => p.id === toggleOwnerPlayerEarly?.id)
      ref = (toggleIdx >= 0 ? refMap[toggleIdx] : null) ?? activePanelRef
    } else {
      ref = activePanelRef
    }
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    setControlPanelAnchorTop(rect.top)
  }, [currentPlayer?.id, toggleOwnerPlayerEarly?.id, state.currentPlayerIndex, state.phase, state.playerCount, state.gameModes, isOnline])

  // IDs of the player(s) whose pieces get thicker outlines when enhanced coloring is on.
  // Online: the local client's assigned player(s) (matched by humanId).
  // Local pass-and-play: whoever's turn it currently is.
  const enhancedColoringPlayerIds = React.useMemo(() => {
    if (!enhancedColoring) return []
    if (isOnline && myHumanId !== null) {
      return state.players.filter(p => p.humanId === myHumanId).map(p => p.id)
    }
    return currentPlayer ? [currentPlayer.id] : []
  }, [enhancedColoring, isOnline, myHumanId, state.players, currentPlayer?.id])

  const selectedPiece = getSelectedPiece()
  const { cells: ghostCells, isLegal: ghostIsLegal } = getGhostCells()

  // ── Per-player last placed tracking (feature 4) ───────────────────────────
  const [lastPlacedPerPlayer, setLastPlacedPerPlayer] = useState({})
  const prevLastPlacedPlayerIdRef = useRef(null)

  useEffect(() => {
    const pid = state.lastPlacedPlayerId
    const cells = state.lastPlacedCells
    if (pid && cells) {
      setLastPlacedPerPlayer(prev => ({ ...prev, [pid]: cells }))
    } else if (!pid && prevLastPlacedPlayerIdRef.current) {
      // Piece was removed via undo — clear that player's last-placed glow
      const removedId = prevLastPlacedPlayerIdRef.current
      setLastPlacedPerPlayer(prev => {
        const next = { ...prev }
        delete next[removedId]
        return next
      })
    }
    prevLastPlacedPlayerIdRef.current = pid
  }, [state.lastPlacedCells, state.lastPlacedPlayerId])

  useEffect(() => {
    if (state.phase === 'setup') {
      setLastPlacedPerPlayer({})
      prevLastPlacedPlayerIdRef.current = null
    }
  }, [state.phase])

  // ── Player timer tracking (feature 2) ────────────────────────────────────
  const playerTimersAccRef = useRef({})    // { playerId: ms } — accumulates during play
  const turnTimerStartRef  = useRef(null)  // timestamp when current turn started
  const turnTimerPlayerRef = useRef(null)  // playerId currently being timed
  const prevPhaseRef       = useRef(null)
  const [finalPlayerTimers, setFinalPlayerTimers] = useState({})

  const flushCurrentTimer = useCallback(() => {
    const pid = turnTimerPlayerRef.current
    if (pid === null || turnTimerStartRef.current === null) return
    const elapsed = Date.now() - turnTimerStartRef.current
    playerTimersAccRef.current = {
      ...playerTimersAccRef.current,
      [pid]: (playerTimersAccRef.current[pid] || 0) + elapsed,
    }
    turnTimerStartRef.current = null
  }, [])

  useEffect(() => {
    const phase = state.phase
    const prevPhase = prevPhaseRef.current
    prevPhaseRef.current = phase

    if (phase === 'setup') {
      // New game (local flow: ended → setup → playing)
      playerTimersAccRef.current = {}
      turnTimerStartRef.current = null
      turnTimerPlayerRef.current = null
      setFinalPlayerTimers({})
      return
    }

    if (phase === 'ended') {
      flushCurrentTimer()
      setFinalPlayerTimers({ ...playerTimersAccRef.current })
      return
    }

    if (phase === 'playing') {
      // Online new game: goes ended → playing without a setup phase
      if (prevPhase === 'ended') {
        playerTimersAccRef.current = {}
        turnTimerStartRef.current = null
        turnTimerPlayerRef.current = null
        setFinalPlayerTimers({})
      }

      const cp = currentPlayer
      if (!cp) return
      if (turnTimerPlayerRef.current !== cp.id) {
        flushCurrentTimer()
        if (cp.isAI) {
          // Don't time AI turns — leave refs null so they accumulate nothing
          turnTimerPlayerRef.current = null
          turnTimerStartRef.current = null
        } else {
          turnTimerPlayerRef.current = cp.id
          turnTimerStartRef.current = Date.now()
        }
      }
    }
  }, [currentPlayer?.id, state.phase, flushCurrentTimer])

  // ── Turn glow & inactivity flash (features 5 & 6) ────────────────────────
  const [showTurnGlow, setShowTurnGlow] = useState(false)
  const [showInactivityFlash, setShowInactivityFlash] = useState(false)
  const lastActivityRef = useRef(Date.now())

  const handleMouseActivity = useCallback(() => {
    lastActivityRef.current = Date.now()
    setShowTurnGlow(false)
    setShowInactivityFlash(false)
  }, [])

  // Show turn glow when a new human turn begins
  useEffect(() => {
    if (state.phase !== 'playing') { setShowTurnGlow(false); return }
    if (!isMyTurn || currentPlayer?.isAI || state.waitingForEndTurn) {
      setShowTurnGlow(false)
      return
    }
    setShowTurnGlow(true)
    lastActivityRef.current = Date.now()
  }, [currentPlayer?.id, isMyTurn, state.phase, state.waitingForEndTurn])

  // Hide turn glow when piece is selected
  useEffect(() => {
    if (state.selectedPieceId) setShowTurnGlow(false)
  }, [state.selectedPieceId])

  // Inactivity: 10 seconds with no mouse/piece activity → flash background
  useEffect(() => {
    if (!isMyTurn || state.phase !== 'playing' || state.waitingForEndTurn || currentPlayer?.isAI) {
      setShowInactivityFlash(false)
      return
    }
    lastActivityRef.current = Date.now()
    const interval = setInterval(() => {
      if (Date.now() - lastActivityRef.current >= 10000) {
        setShowInactivityFlash(true)
      }
    }, 500)
    return () => clearInterval(interval)
  }, [isMyTurn, state.phase, state.waitingForEndTurn, currentPlayer?.id])

  // ── Sound effects ─────────────────────────────────────────────────────────

  // Game start: play once when phase first becomes 'playing'
  const gameStartPlayedRef = useRef(false)
  useEffect(() => {
    if (state.phase === 'playing' && !gameStartPlayedRef.current) {
      gameStartPlayedRef.current = true
      playSound('game-start')
    }
    if (state.phase === 'setup') gameStartPlayedRef.current = false
  }, [state.phase])

  // Your turn: skip the initial turn, then play on each subsequent human turn
  const turnSoundKeyRef = useRef(null)
  const turnSoundInitRef = useRef(false)
  useEffect(() => {
    if (state.phase !== 'playing') { turnSoundInitRef.current = false; return }
    if (!isMyTurn || currentPlayer?.isAI) {
      // Mark init as done when AI or opponent goes first, so the local human's
      // actual first turn is recognised as a genuine transition and plays the sound.
      turnSoundInitRef.current = true
      turnSoundKeyRef.current = null
      return
    }
    const key = currentPlayer?.id
    if (!turnSoundInitRef.current) {
      turnSoundInitRef.current = true
      turnSoundKeyRef.current = key
      return
    }
    if (key !== turnSoundKeyRef.current) {
      playSound('1-your-turn')
      turnSoundKeyRef.current = key
    }
  }, [state.phase, state.currentPlayerIndex, isMyTurn, currentPlayer?.id])

  // Inactivity flash
  useEffect(() => {
    if (showInactivityFlash) playSound('inactivity')
  }, [showInactivityFlash])

  // No more moves modal — delay 1s so it doesn't overlap with end-turn sound
  const noMovesSoundTimerRef = useRef(null)
  useEffect(() => {
    clearTimeout(noMovesSoundTimerRef.current)
    if (state.noMovesModalPlayerId) {
      noMovesSoundTimerRef.current = setTimeout(() => playSound('no-more-moves'), 1000)
    }
    return () => clearTimeout(noMovesSoundTimerRef.current)
  }, [state.noMovesModalPlayerId])

  // End game: win or lose
  const endSoundPlayedRef = useRef(false)
  useEffect(() => {
    if (state.phase === 'ended' && !endSoundPlayedRef.current) {
      endSoundPlayedRef.current = true
      const minScore = Math.min(...state.players.map(p => p.score))
      const iAmWinner = myHumanId !== null
        ? state.players.some(p => p.humanId === myHumanId && p.score === minScore)
        : true
      playSound(iAmWinner ? '1-you-win' : 'did-not-win')
    }
    if (state.phase !== 'ended') endSoundPlayedRef.current = false
  }, [state.phase, state.players, myHumanId])

  // Turn progression: play end-turn sound whenever currentPlayerIndex changes during play.
  // Delay 1 second after AI turns so place-piece and end-turn don't overlap.
  const prevCurrentPlayerIdxRef = useRef(null)
  const endTurnSoundTimerRef = useRef(null)
  const playersRef = useRef(state.players)
  playersRef.current = state.players
  useEffect(() => {
    if (state.phase !== 'playing') {
      clearTimeout(endTurnSoundTimerRef.current)
      prevCurrentPlayerIdxRef.current = null
      return
    }
    const idx = state.currentPlayerIndex
    if (prevCurrentPlayerIdxRef.current !== null && prevCurrentPlayerIdxRef.current !== idx) {
      const prevPlayer = playersRef.current[prevCurrentPlayerIdxRef.current]
      const prevPlayerIsMe = !isOnline || prevPlayer?.humanId === myHumanId
      if (!prevPlayer?.isAI && prevPlayerIsMe) {
        playSound('end-turn')
      }
      // Local AI: sound played in useGameState.js before dispatch
      // Online (other human or AI ending turn): no sound
    }
    prevCurrentPlayerIdxRef.current = idx
  }, [state.phase, state.currentPlayerIndex])

  // ── Keyboard & HUD bounce ref ─────────────────────────────────────────────
  const hudBounceRef = useRef(null)
  const keyRotate = useCallback(() => { rotatePiece(); controlPanelBounceRef.current?.('rotate') }, [rotatePiece])
  const keyRotateReverse = useCallback(() => { rotatePieceReverse?.(); controlPanelBounceRef.current?.('rotateReverse') }, [rotatePieceReverse])
  const keyFlip = useCallback(() => { flipPiece(); controlPanelBounceRef.current?.('flip') }, [flipPiece])
  const keyHover = useCallback(() => { toggleFreeHover(); controlPanelBounceRef.current?.('hover') }, [toggleFreeHover])
  const keyDeselect = useCallback(() => { deselectPiece(); controlPanelBounceRef.current?.('deselect') }, [deselectPiece])
  const keyEndTurn = useCallback(() => {
    if (state.waitingForEndTurn && !currentPlayer?.isAI) { endTurn(); hudBounceRef.current?.('endTurn') }
  }, [state.waitingForEndTurn, currentPlayer?.isAI, endTurn])

  const handleConfirmPlacement = useCallback(() => {
    confirmPlacement(autoAdvanceEnabled)
  }, [confirmPlacement, autoAdvanceEnabled])

  // Auto-advance when A is on — covers both: placement while A is already on,
  // and A being toggled on while already waiting for end turn.
  // Skip for AI players — they handle their own end-turn with a sound delay.
  // 1-second delay mirrors the AI / human-to-AI transition so placement is visible.
  const autoAdvanceTimerRef = useRef(null)
  useEffect(() => {
    clearTimeout(autoAdvanceTimerRef.current)
    if (autoAdvanceEnabled && state.waitingForEndTurn && !currentPlayer?.isAI) {
      autoAdvanceTimerRef.current = setTimeout(endTurn, 1000)
    }
    return () => clearTimeout(autoAdvanceTimerRef.current)
  }, [autoAdvanceEnabled, state.waitingForEndTurn, currentPlayer?.isAI, endTurn])

  const handleRemovePieceClick = useCallback(() => { playSound('1-select-piece'); setShowRemovePieceModal(true) }, [])
  const handleConfirmRemove = useCallback(() => {
    setShowRemovePieceModal(false)
    removePiece?.()
  }, [removePiece])
  const handleCancelRemove = useCallback(() => setShowRemovePieceModal(false), [])

  // Clear skip confirm if the turn changes underneath us (edge case)
  useEffect(() => { setShowSkipConfirm(false) }, [state.currentPlayerIndex])

  // Reset local no-moves dismissal whenever a new no-moves modal appears
  useEffect(() => { setNoMovesLocallyDismissed(false) }, [state.noMovesModalPlayerId])

  const handleSkip = useCallback(() => setShowSkipConfirm(true), [])
  const handleCancelSkip = useCallback(() => setShowSkipConfirm(false), [])
  const handleConfirmSkip = useCallback(() => {
    setShowSkipConfirm(false)
    confirmSkip()
  }, [confirmSkip])

  // panelSide: which side the toggle owner's HUD is on — drives both keyboard shortcuts and tab arrow.
  // Must be computed from toggleOwnerPlayerEarly (not currentPlayer) so online games and 2p-standard
  // stay consistent regardless of whose turn it currently is.
  const panelSide = (() => {
    const { players, playerCount, gameModes } = state
    const isMC2p = gameModes?.megaColors && playerCount === 2
    const leftIds = playerCount === 3  ? [players[0]?.id]
                  : isMC2p            ? [players[0]?.id]
                  : [players[0]?.id, players[3]?.id]
    return leftIds.includes(toggleOwnerPlayerEarly?.id) ? 'left' : 'right'
  })()

  useKeyboard({
    selectedPieceId: state.selectedPieceId,
    pendingPlacement: state.pendingPlacement,
    waitingForEndTurn: state.waitingForEndTurn,
    onRotate: keyRotate,
    onRotateReverse: keyRotateReverse,
    onFlip: keyFlip,
    onToggleHover: keyHover,
    onToggleEnhancedColoring: toggleEnhancedColoring,
    onToggleAutoAdvance: toggleAutoAdvance,
    onArrowRight: panelSide === 'left' ? openControlPanel : closeControlPanel,
    onArrowLeft:  panelSide === 'left' ? closeControlPanel : openControlPanel,
    onDeselect: keyDeselect,
    onConfirmPlacement: handleConfirmPlacement,
    onCancelPlacement: cancelPlacement,
    onEndTurn: keyEndTurn,
    active: state.phase === 'playing',
  })

  const handleBoardLeave = useCallback(() => setHover(null), [setHover])

  const { players, playerCount } = state

  // No-moves modal player — shown for both human and AI players.
  const noMovesPlayer = (state.noMovesModalPlayerId && !noMovesLocallyDismissed)
    ? players.find(p => p.id === state.noMovesModalPlayerId)
    : null
  // In online games, only the player who ran out of moves triggers the server dismiss.
  // Other players just close the modal locally and wait for the game state to update.
  // AI players never manually dismiss — the modal auto-clears when the turn advances.
  const isNoMovesPlayer = !isOnline || (noMovesPlayer?.humanId === myHumanId)

  // Mega Colors 2p has only 2 player slots instead of 4
  const isMegaColors2p = state.gameModes?.megaColors && playerCount === 2
  // 2p standard: 4 slots (2 per human), not Mega Colors
  const is2pStandard = playerCount === 2 && !isMegaColors2p

  // Layout: 3p → 1 left, 2 right; Mega Colors 2p → 1 left, 1 right; 2p/4p → 2 left, 2 right
  const leftPlayers  = playerCount === 3  ? [players[0]]
                     : isMegaColors2p     ? [players[0]]
                     : [players[0], players[3]]
  const rightPlayers = playerCount === 3  ? [players[1], players[2]]
                     : isMegaColors2p     ? [players[1]]
                     : [players[1], players[2]]

  // toggleOwnerPlayerEarly (computed above, before hooks) has the same logic — reuse it here.
  const toggleOwnerPlayer = toggleOwnerPlayerEarly
  // panelSide is computed early (before useKeyboard) so keyboard bindings and tab arrow always agree.

  const isModalOpen = !!state.pendingPlacement || state.showEndGameConfirm ||
                      (state.phase === 'ended' && !viewingFinalBoard) || !!state.noMovesModalPlayerId ||
                      showRemovePieceModal
  const boardDisabled = isModalOpen || (state.phase === 'ended' && viewingFinalBoard) || state.waitingForEndTurn

  // Compute winner(s) for final board bar (ties supported)
  const finalBoardSorted = viewingFinalBoard ? [...players].sort((a, b) => a.score - b.score) : []
  const finalBoardWinner = finalBoardSorted[0] || null
  const finalBoardTiedWinners = (
    viewingFinalBoard &&
    finalBoardSorted.length > 1 &&
    finalBoardSorted[0]?.score === finalBoardSorted[1]?.score
  ) ? finalBoardSorted.filter(p => p.score === finalBoardSorted[0].score) : null

  return (
    <div className={styles.screen}>
      {viewingFinalBoard ? (
        <div className={styles.finalBoardHud}>
          <div className={styles.finalBoardLeft}>
            <span className={styles.gameOverLabel}>Game over</span>
          </div>
          <div className={styles.finalBoardCenter}>
            {finalBoardTiedWinners && finalBoardTiedWinners.length > 1 ? (
              <span className={styles.finalTie}>
                {finalBoardTiedWinners.map((p, i) => {
                  const ci = PLAYER_COLORS[p.color]
                  return (
                    <React.Fragment key={p.id}>
                      {i > 0 && <span className={styles.finalTieAnd}> &amp; </span>}
                      <span style={{ color: ci.bg }}>{p.name}</span>
                    </React.Fragment>
                  )
                })}
                {' '}tie!
              </span>
            ) : finalBoardWinner ? (() => {
              const colorInfo = PLAYER_COLORS[finalBoardWinner.color]
              return (
                <span className={styles.finalWinner} style={{ color: colorInfo.bg }}>
                  {finalBoardWinner.name} wins!
                </span>
              )
            })() : null}
          </div>
          <div className={styles.finalBoardRight}>
            <button className={styles.backToResultsBtn} onClick={(e) => { triggerBounce(e.currentTarget); playSound('home-lobby'); setTimeout(() => setViewingFinalBoard(false), 350) }}>
              Back to results
            </button>
            {onExit && (
              <button className={styles.finalLeaveBtn} onClick={(e) => { triggerBounce(e.currentTarget); playSound('home-lobby'); setTimeout(onExit, 350) }}>
                Leave
              </button>
            )}
            <button
              className={styles.finalNewGameBtn}
              onClick={(e) => { triggerBounce(e.currentTarget); playSound('home-lobby'); setTimeout(newGame, 350) }}
            >
              <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor">
                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1z" clipRule="evenodd"/>
              </svg>
              New game
            </button>
          </div>
        </div>
      ) : (
        <HUD
          currentPlayer={currentPlayer}
          onToggleEnhancedColoring={toggleEnhancedColoring}
          enhancedColoring={enhancedColoring}
          onToggleAutoAdvance={toggleAutoAdvance}
          autoAdvanceEnabled={autoAdvanceEnabled}
          onEndGame={requestEndGame}
          onSkip={handleSkip}
          onConfirmSkip={handleConfirmSkip}
          onCancelSkip={handleCancelSkip}
          showSkipConfirm={showSkipConfirm}
          onEndTurn={currentPlayer?.isAI ? null : endTurn}
          waitingForEndTurn={state.waitingForEndTurn}
          playerCount={playerCount}
          isOnline={isOnline}
          isMyTurn={isMyTurn}
          onExit={onExit}
          bounceRef={hudBounceRef}
        />
      )}

      <div className={styles.playArea}>
        <div className={styles.sidebar}>
          {leftPlayers.map(player => (
            <PlayerPanel
              key={player.id}
              player={player}
              isActive={currentPlayer?.id === player.id}
              selectedPieceId={currentPlayer?.id === player.id ? state.selectedPieceId : null}
              onSelectPiece={selectPiece}
              disabled={currentPlayer?.id !== player.id}
              isSkipped={state.skippedPlayerIds.has(player.id)}
              panelRef={
                is2pStandard
                  ? (player.id === players[0]?.id ? p0PanelRef : player.id === players[3]?.id ? p3PanelRef : null)
                  : (toggleOwnerPlayer?.id === player.id ? activePanelRef : null)
              }
            />
          ))}
        </div>

        <div className={styles.boardArea}>
          {showInactivityFlash && <div className={styles.inactivityOverlay} />}

          {/* Score overlay — floats at the top of the board area */}
          <div className={styles.scoreOverlay} aria-hidden="true">
            {isOnline && onlineRoomCode && (
              <div className={styles.scoreOverlayRoomCode}>#{onlineRoomCode}</div>
            )}
            <div className={styles.scoreOverlayScores}>
              {players.map(p => {
                const ci = PLAYER_COLORS[p.color]
                return (
                  <div key={p.id} className={styles.scoreOverlayItem}>
                    <div className={styles.scoreOverlayDot} style={{ background: ci.bg, boxShadow: `0 0 5px ${ci.bg}` }} />
                    <span className={styles.scoreOverlayValue} style={{ color: ci.bg }}>
                      <AnimatedScore value={p.score} />
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          <Board
            boardData={state.board}
            selectedPiece={selectedPiece}
            hoverCell={state.hoverCell}
            ghostCells={ghostCells}
            ghostIsLegal={ghostIsLegal}
            currentPlayerColor={currentPlayer?.color || null}
            freeHoverEnabled={freeHoverEnabled}
            onCellClick={placePiece}
            onCellHover={setHover}
            onBoardLeave={handleBoardLeave}
            onMouseActivity={handleMouseActivity}
            players={players}
            disabled={!!boardDisabled}
            requiredStartCells={
              state.gameModes?.requiredStart && !state.players.every(p => p.pieces.some(pc => pc.placed))
                ? state.requiredStartCells
                : null
            }
            otherPlayersGhosts={otherPlayersGhosts}
            lastPlacedCells={state.lastPlacedCells}
            lastPlacedPlayerId={state.lastPlacedPlayerId}
            lastPlacedPerPlayer={lastPlacedPerPlayer}
            enhancedColoringPlayerIds={enhancedColoringPlayerIds}
            yourTurn={showTurnGlow}
            onRemovePiece={
              isMyTurn && state.waitingForEndTurn && state.lastPlacedCells && !showRemovePieceModal
                ? handleRemovePieceClick
                : undefined
            }
          />
        </div>

        <div className={styles.sidebar}>
          {rightPlayers.map(player => (
            <PlayerPanel
              key={player.id}
              player={player}
              isActive={currentPlayer?.id === player.id}
              selectedPieceId={currentPlayer?.id === player.id ? state.selectedPieceId : null}
              onSelectPiece={selectPiece}
              disabled={currentPlayer?.id !== player.id}
              isSkipped={state.skippedPlayerIds.has(player.id)}
              panelRef={
                is2pStandard
                  ? (player.id === players[1]?.id ? p1PanelRef : player.id === players[2]?.id ? p2PanelRef : null)
                  : (toggleOwnerPlayer?.id === player.id ? activePanelRef : null)
              }
            />
          ))}
        </div>
      </div>

      {/* Floating piece control panel */}
      {state.phase === 'playing' && toggleOwnerPlayer && !toggleOwnerPlayer.isAI && (isMyTurn || isOnline || is2pStandard) && (
        <PieceControlPanel
          isOpen={controlPanelOpen}
          onToggle={toggleControlPanel}
          side={panelSide}
          anchorTop={controlPanelAnchorTop}
          playerColor={PLAYER_COLORS[toggleOwnerPlayer.color].bg}
          selectedPiece={selectedPiece}
          onRotate={keyRotate}
          onRotateReverse={keyRotateReverse}
          onFlip={keyFlip}
          onToggleHover={keyHover}
          freeHoverEnabled={freeHoverEnabled}
          onDeselect={keyDeselect}
          bounceRef={controlPanelBounceRef}
        />
      )}

      {/* Modals */}
      {state.pendingPlacement && selectedPiece && (
        <PlacementConfirmModal
          currentPlayer={currentPlayer}
          piece={selectedPiece}
          onConfirm={handleConfirmPlacement}
          onCancel={cancelPlacement}
          autoAdvanceEnabled={autoAdvanceEnabled}
        />
      )}

      {state.showEndGameConfirm && (
        <EndGameConfirmModal onConfirm={confirmEndGame} onCancel={cancelEndGame} />
      )}

      {state.phase === 'ended' && !viewingFinalBoard && (
        <EndGameModal
          players={players}
          playerCount={playerCount}
          onNewGame={newGame}
          onViewBoard={() => setViewingFinalBoard(true)}
          onClose={() => setViewingFinalBoard(true)}
          onLeave={onExit || null}
          playerTimers={finalPlayerTimers}
          moveHistory={state.moveHistory ?? []}
          boardData={state.board}
        />
      )}

      {noMovesPlayer && (
        <NoMovesModal
          player={noMovesPlayer}
          onDismiss={noMovesPlayer?.isAI ? null : (isNoMovesPlayer ? dismissNoMoves : () => setNoMovesLocallyDismissed(true))}
        />
      )}

      {showRemovePieceModal && (
        <RemovePieceModal onConfirm={handleConfirmRemove} onCancel={handleCancelRemove} />
      )}
    </div>
  )
}
