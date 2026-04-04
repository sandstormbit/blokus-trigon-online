import React, { useState } from 'react'
import LandingPage from './components/LandingPage.jsx'
import SetupScreen from './components/SetupScreen.jsx'
import GameScreen from './components/GameScreen.jsx'
import WaitingRoom from './components/WaitingRoom.jsx'
import { useGameState } from './hooks/useGameState.js'
import { useOnlineGame } from './hooks/useOnlineGame.js'

// ─── Pass-and-play wrapper ─────────────────────────────────────────────────────
// Uses the local useGameState hook. No server connection.
function PassAndPlayApp({ onExit }) {
  const game = useGameState()
  const { state } = game

  if (state.phase === 'setup') {
    return <SetupScreen onStart={game.startGame} onBack={onExit} />
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

// ─── Online wrapper ────────────────────────────────────────────────────────────
// Always mounted so the socket.io hook persists across navigation within online flow.
// Shows LandingPage → WaitingRoom → GameScreen based on roomPhase.
function OnlineApp({ onPassAndPlay }) {
  const online = useOnlineGame()

  const handleExit = () => {
    online.disconnect()
  }

  // Show room-specific maxPlayers: derive from the room's maxPlayers stored during create/join
  // For now, use the count from roomPlayers being full
  const maxPlayers = online.maxPlayersInRoom || 4

  // ── Waiting room ────────────────────────────────────────────────────────────
  if (online.roomPhase === 'waiting') {
    return (
      <WaitingRoom
        roomCode={online.roomCode}
        roomMode={online.roomMode}
        players={online.roomPlayers}
        maxPlayers={online.maxPlayersInRoom}
        isHost={online.isHostPlayer}
        settings={online.settings}
        myHumanId={online.myHumanId}
        onUpdateSettings={online.updateSettings}
        onStartGame={online.startGame}
        onExit={handleExit}
      />
    )
  }

  // ── Active / ended game ─────────────────────────────────────────────────────
  if ((online.roomPhase === 'playing' || online.roomPhase === 'ended') && online.state) {
    return (
      <GameScreen
        state={online.state}
        currentPlayer={online.currentPlayer}
        getSelectedPiece={online.getSelectedPiece}
        getGhostCells={online.getGhostCells}
        selectPiece={online.selectPiece}
        deselectPiece={online.deselectPiece}
        rotatePiece={online.rotatePiece}
        flipPiece={online.flipPiece}
        setHover={online.setHover}
        placePiece={online.placePiece}
        confirmPlacement={online.confirmPlacement}
        cancelPlacement={online.cancelPlacement}
        dismissNoMoves={online.dismissNoMoves}
        requestEndGame={online.requestEndGame}
        confirmEndGame={online.confirmEndGame}
        cancelEndGame={online.cancelEndGame}
        newGame={online.newGame}
        isOnline={true}
        myHumanId={online.myHumanId}
        isMyTurn={online.isMyTurn()}
        onlineRoomCode={online.roomCode}
        onlinePlayers={online.roomPlayers}
        onExit={handleExit}
      />
    )
  }

  // ── Landing page (disconnected state) ───────────────────────────────────────
  return (
    <LandingPage
      onPassAndPlay={onPassAndPlay}
      onCreateRoom={(config, callback) => {
        online.createRoom(config.mode, config.maxPlayers, config.playerName, callback)
      }}
      onJoinRoom={(config, callback) => {
        online.joinRoom(config.roomCode, config.playerName, callback)
      }}
    />
  )
}

// ─── Root App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState('main')
  // 'main' = OnlineApp (handles landing + waiting room + online game)
  // 'pass-and-play' = local pass-and-play mode

  if (screen === 'pass-and-play') {
    return <PassAndPlayApp onExit={() => setScreen('main')} />
  }

  return <OnlineApp onPassAndPlay={() => setScreen('pass-and-play')} />
}
