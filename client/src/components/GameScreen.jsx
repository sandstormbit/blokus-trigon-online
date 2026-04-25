import React, { useCallback, useEffect, useRef, useState } from 'react'

function triggerBounce(el) {
  if (!el) return
  el.classList.remove('btn-bounce')
  void el.offsetWidth
  el.classList.add('btn-bounce')
}
import Board from './Board.jsx'
import PlayerPanel from './PlayerPanel.jsx'
import HUD from './HUD.jsx'
import { PLAYER_COLORS } from '../hooks/useGameState.js'
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
  const toggleFreeHover = useCallback(() => setFreeHoverEnabled(v => !v), [])
  const toggleEnhancedColoring = useCallback(() => setEnhancedColoring(v => !v), [])

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

  // ── Keyboard & HUD bounce ref ─────────────────────────────────────────────
  const hudBounceRef = useRef(null)
  const keyRotate = useCallback(() => { rotatePiece(); hudBounceRef.current?.('rotate') }, [rotatePiece])
  const keyRotateReverse = useCallback(() => { rotatePieceReverse?.(); hudBounceRef.current?.('rotateReverse') }, [rotatePieceReverse])
  const keyFlip = useCallback(() => { flipPiece(); hudBounceRef.current?.('flip') }, [flipPiece])
  const keyHover = useCallback(() => { toggleFreeHover(); hudBounceRef.current?.('hover') }, [toggleFreeHover])
  const keyDeselect = useCallback(() => { deselectPiece(); hudBounceRef.current?.('deselect') }, [deselectPiece])
  const keyEndTurn = useCallback(() => {
    if (state.waitingForEndTurn) { endTurn(); hudBounceRef.current?.('endTurn') }
  }, [state.waitingForEndTurn, endTurn])

  const handleRemovePieceClick = useCallback(() => setShowRemovePieceModal(true), [])
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

  useKeyboard({
    selectedPieceId: state.selectedPieceId,
    pendingPlacement: state.pendingPlacement,
    waitingForEndTurn: state.waitingForEndTurn,
    onRotate: keyRotate,
    onRotateReverse: keyRotateReverse,
    onFlip: keyFlip,
    onToggleHover: keyHover,
    onToggleEnhancedColoring: toggleEnhancedColoring,
    onDeselect: keyDeselect,
    onConfirmPlacement: confirmPlacement,
    onCancelPlacement: cancelPlacement,
    onEndTurn: keyEndTurn,
    active: state.phase === 'playing',
  })

  const handleBoardLeave = useCallback(() => setHover(null), [setHover])

  const { players, playerCount } = state

  // No-moves modal player — suppressed for AI players (auto-handled by server/hook)
  const noMovesPlayer = (state.noMovesModalPlayerId && !noMovesLocallyDismissed)
    ? players.find(p => p.id === state.noMovesModalPlayerId && !p.isAI)
    : null
  // In online games, only the player who ran out of moves triggers the server dismiss.
  // Other players just close the modal locally and wait for the game state to update.
  const isNoMovesPlayer = !isOnline || (noMovesPlayer?.humanId === myHumanId)

  // Mega Colors 2p has only 2 player slots instead of 4
  const isMegaColors2p = state.gameModes?.megaColors && playerCount === 2

  // Layout: 3p → 1 left, 2 right; Mega Colors 2p → 1 left, 1 right; 2p/4p → 2 left, 2 right
  const leftPlayers  = playerCount === 3  ? [players[0]]
                     : isMegaColors2p     ? [players[0]]
                     : [players[0], players[3]]
  const rightPlayers = playerCount === 3  ? [players[1], players[2]]
                     : isMegaColors2p     ? [players[1]]
                     : [players[1], players[2]]

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
            <button className={styles.backToResultsBtn} onClick={(e) => { triggerBounce(e.currentTarget); setTimeout(() => setViewingFinalBoard(false), 350) }}>
              Back to results
            </button>
            {(!isOnline || isHostPlayer) ? (
              <button className={styles.finalNewGameBtn} onClick={(e) => { triggerBounce(e.currentTarget); setTimeout(newGame, 350) }}>
                <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor">
                  <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1z" clipRule="evenodd"/>
                </svg>
                New game
              </button>
            ) : (
              <button className={styles.finalWaitingBtn} disabled>
                <div className={styles.finalWaitingSpinner} />
                Waiting for host…
              </button>
            )}
          </div>
        </div>
      ) : (
        <HUD
          currentPlayer={currentPlayer}
          selectedPiece={selectedPiece}
          onRotate={rotatePiece}
          onRotateReverse={rotatePieceReverse}
          onFlip={flipPiece}
          onToggleHover={toggleFreeHover}
          freeHoverEnabled={freeHoverEnabled}
          onToggleEnhancedColoring={toggleEnhancedColoring}
          enhancedColoring={enhancedColoring}
          onDeselect={deselectPiece}
          onEndGame={requestEndGame}
          onSkip={handleSkip}
          onConfirmSkip={handleConfirmSkip}
          onCancelSkip={handleCancelSkip}
          showSkipConfirm={showSkipConfirm}
          onEndTurn={endTurn}
          waitingForEndTurn={state.waitingForEndTurn}
          players={players}
          playerCount={playerCount}
          isOnline={isOnline}
          isMyTurn={isMyTurn}
          onlineRoomCode={onlineRoomCode}
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
            />
          ))}
        </div>

        <div className={styles.boardArea}>
          {showInactivityFlash && <div className={styles.inactivityOverlay} />}
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
            requiredStartCells={state.gameModes?.requiredStart ? state.requiredStartCells : null}
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
            />
          ))}
        </div>
      </div>

      {/* Modals */}
      {state.pendingPlacement && selectedPiece && (
        <PlacementConfirmModal
          currentPlayer={currentPlayer}
          piece={selectedPiece}
          onConfirm={confirmPlacement}
          onCancel={cancelPlacement}
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
          isHost={!isOnline || isHostPlayer}
          playerTimers={finalPlayerTimers}
        />
      )}

      {noMovesPlayer && (
        <NoMovesModal
          player={noMovesPlayer}
          onDismiss={isNoMovesPlayer ? dismissNoMoves : () => setNoMovesLocallyDismissed(true)}
        />
      )}

      {showRemovePieceModal && (
        <RemovePieceModal onConfirm={handleConfirmRemove} onCancel={handleCancelRemove} />
      )}
    </div>
  )
}
