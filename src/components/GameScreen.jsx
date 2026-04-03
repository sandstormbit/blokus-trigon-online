import React, { useCallback, useState } from 'react'
import Board from './Board.jsx'
import PlayerPanel from './PlayerPanel.jsx'
import HUD from './HUD.jsx'
import { PLAYER_COLORS } from '../hooks/useGameState.js'
import PlacementConfirmModal from './PlacementConfirmModal.jsx'
import EndGameConfirmModal from './EndGameConfirmModal.jsx'
import EndGameModal from './EndGameModal.jsx'
import NoMovesModal from './NoMovesModal.jsx'
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
  flipPiece,
  setHover,
  placePiece,
  confirmPlacement,
  cancelPlacement,
  dismissNoMoves,
  requestEndGame,
  confirmEndGame,
  cancelEndGame,
  newGame,
}) {
  const [viewingFinalBoard, setViewingFinalBoard] = useState(false)
  const [freeHoverEnabled, setFreeHoverEnabled] = useState(true)
  const toggleFreeHover = useCallback(() => setFreeHoverEnabled(v => !v), [])

  const selectedPiece = getSelectedPiece()
  const { cells: ghostCells, isLegal: ghostIsLegal } = getGhostCells()

  useKeyboard({
    selectedPieceId: state.selectedPieceId,
    pendingPlacement: state.pendingPlacement,
    onRotate: rotatePiece,
    onFlip: flipPiece,
    onToggleHover: toggleFreeHover,
    onDeselect: deselectPiece,
    onConfirmPlacement: confirmPlacement,
    onCancelPlacement: cancelPlacement,
    active: state.phase === 'playing',
  })

  const handleBoardLeave = useCallback(() => setHover(null), [setHover])

  const { players, playerCount } = state

  // No-moves modal player
  const noMovesPlayer = state.noMovesModalPlayerId
    ? players.find(p => p.id === state.noMovesModalPlayerId)
    : null

  // Layout: for 2p/4p → 2 left, 2 right; for 3p → 1 left, 2 right
  const leftPlayers  = playerCount === 3 ? [players[0]]                : [players[0], players[3]]
  const rightPlayers = playerCount === 3 ? [players[1], players[2]]    : [players[1], players[2]]

  const isModalOpen = !!state.pendingPlacement || state.showEndGameConfirm ||
                      (state.phase === 'ended' && !viewingFinalBoard) || !!state.noMovesModalPlayerId
  const boardDisabled = isModalOpen || (state.phase === 'ended' && viewingFinalBoard)

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
            <button className={styles.backToResultsBtn} onClick={() => setViewingFinalBoard(false)}>
              Back to results
            </button>
            <button className={styles.finalNewGameBtn} onClick={newGame}>
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
          selectedPiece={selectedPiece}
          onRotate={rotatePiece}
          onFlip={flipPiece}
          onToggleHover={toggleFreeHover}
          freeHoverEnabled={freeHoverEnabled}
          onDeselect={deselectPiece}
          onEndGame={requestEndGame}
          players={players}
          playerCount={playerCount}
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
        />
      )}

      {noMovesPlayer && (
        <NoMovesModal player={noMovesPlayer} onDismiss={dismissNoMoves} />
      )}
    </div>
  )
}
