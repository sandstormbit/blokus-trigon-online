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
  const toggleFreeHover = useCallback(() => setFreeHoverEnabled(v => !v), [])

  const selectedPiece = getSelectedPiece()
  const { cells: ghostCells, isLegal: ghostIsLegal } = getGhostCells()

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
    onDeselect: keyDeselect,
    onConfirmPlacement: confirmPlacement,
    onCancelPlacement: cancelPlacement,
    onEndTurn: keyEndTurn,
    active: state.phase === 'playing',
  })

  const handleBoardLeave = useCallback(() => setHover(null), [setHover])

  const { players, playerCount } = state

  // No-moves modal player
  const noMovesPlayer = (state.noMovesModalPlayerId && !noMovesLocallyDismissed)
    ? players.find(p => p.id === state.noMovesModalPlayerId)
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

  // Compute winner for final board bar (lowest score wins; for 2p, use slot level)
  const finalBoardWinner = viewingFinalBoard
    ? [...players].sort((a, b) => a.score - b.score)[0]
    : null

  return (
    <div className={styles.screen}>
      {viewingFinalBoard ? (
        <div className={styles.finalBoardHud}>
          <div className={styles.finalBoardLeft}>
            <span className={styles.gameOverLabel}>Game over</span>
          </div>
          <div className={styles.finalBoardCenter}>
            {finalBoardWinner && (() => {
              const colorInfo = PLAYER_COLORS[finalBoardWinner.color]
              return (
                <span className={styles.finalWinner} style={{ color: colorInfo.bg }}>
                  {finalBoardWinner.name} wins!
                </span>
              )
            })()}
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
            players={players}
            disabled={!!boardDisabled}
            requiredStartCells={state.gameModes?.requiredStart ? state.requiredStartCells : null}
            otherPlayersGhosts={otherPlayersGhosts}
            lastPlacedCells={state.lastPlacedCells}
            lastPlacedPlayerId={state.lastPlacedPlayerId}
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
