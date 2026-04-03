import React from 'react'
import SetupScreen from './components/SetupScreen.jsx'
import GameScreen from './components/GameScreen.jsx'
import { useGameState } from './hooks/useGameState.js'

export default function App() {
  const game = useGameState()
  const { state } = game

  if (state.phase === 'setup') {
    return <SetupScreen onStart={game.startGame} />
  }

  return (
    <GameScreen
      state={state}
      currentPlayer={game.currentPlayer}
      getSelectedPiece={game.getSelectedPiece}
      getGhostCells={game.getGhostCells}
      selectPiece={game.selectPiece}
      deselectPiece={game.deselectPiece}
      rotatePiece={game.rotatePiece}
      flipPiece={game.flipPiece}
      setHover={game.setHover}
      placePiece={game.placePiece}
      confirmPlacement={game.confirmPlacement}
      cancelPlacement={game.cancelPlacement}
      dismissNoMoves={game.dismissNoMoves}
      requestEndGame={game.requestEndGame}
      confirmEndGame={game.confirmEndGame}
      cancelEndGame={game.cancelEndGame}
      newGame={game.newGame}
    />
  )
}
