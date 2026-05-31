import React, { useState } from 'react'
import { Analytics } from '@vercel/analytics/react'
import LandingPage from './components/LandingPage.jsx'
import SetupScreen from './components/SetupScreen.jsx'
import GameScreen from './components/GameScreen.jsx'
import WaitingRoom from './components/WaitingRoom.jsx'
import SpectatorModal from './components/SpectatorModal.jsx'
import DisconnectReplaceModal from './components/DisconnectReplaceModal.jsx'
import ClaimSlotModal from './components/ClaimSlotModal.jsx'
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
      rotatePieceReverse={game.rotatePieceReverse}
      flipPiece={game.flipPiece}
      setHover={game.setHover}
      placePiece={game.placePiece}
      confirmPlacement={game.confirmPlacement}
      cancelPlacement={game.cancelPlacement}
      dismissNoMoves={game.dismissNoMoves}
      confirmSkip={game.confirmSkip}
      removePiece={game.removePiece}
      endTurn={game.endTurn}
      requestEndGame={game.requestEndGame}
      confirmEndGame={game.confirmEndGame}
      cancelEndGame={game.cancelEndGame}
      newGame={game.newGame}
      onExit={onExit}
    />
  )
}

// ─── Online wrapper ────────────────────────────────────────────────────────────
// Always mounted so the socket.io hook persists across navigation within online flow.
// Shows LandingPage → WaitingRoom → GameScreen based on roomPhase.
function OnlineApp({ onPassAndPlay }) {
  const online = useOnlineGame()

  const handleExit = () => {
    online.leaveGame()
  }

  // Show room-specific maxPlayers: derive from the room's maxPlayers stored during create/join
  // For now, use the count from roomPlayers being full
  const maxPlayers = online.maxPlayersInRoom || 4

  const { spectatorModalData, disconnectReplaceData, claimSlotData } = online

  // ── Shared overlay modals (can appear on top of any screen) ─────────────────
  const overlayModals = (
    <>
      {spectatorModalData && (
        <SpectatorModal
          roomCode={spectatorModalData.roomCode}
          phase={spectatorModalData.phase}
          aiSlots={spectatorModalData.aiSlots}
          openSlots={spectatorModalData.openSlots}
          onSpectate={() => online.spectateGame(spectatorModalData.roomCode, spectatorModalData.playerName || '')}
          onTakeAISlot={(aiHumanId) => online.takeAISlot(spectatorModalData.roomCode, aiHumanId, spectatorModalData.playerName || '')}
          onTakeOpenSlot={(aiHumanId) => online.takeOpenSlot(spectatorModalData.roomCode, aiHumanId, spectatorModalData.playerName || '', ({ error }) => {
              if (error) console.warn('take_open_slot failed:', error)
            })}
          onClose={() => online.disconnect()}
        />
      )}
      {claimSlotData && (
        <ClaimSlotModal
          playerName={claimSlotData.replacedName}
          onClaimSlot={() => online.claimAISlot()}
          onSpectate={() => online.spectateGame(claimSlotData.roomCode, claimSlotData.replacedName || '')}
        />
      )}
      {disconnectReplaceData && (
        <DisconnectReplaceModal
          playerName={disconnectReplaceData.playerName}
          onReplaceWithAI={(difficulty) => online.replaceWithAI(disconnectReplaceData.humanId, difficulty)}
          onDismiss={online.dismissDisconnectPrompt}
        />
      )}
    </>
  )

  // ── Waiting room ────────────────────────────────────────────────────────────
  if (online.roomPhase === 'waiting') {
    return (
      <>
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
          onSelectColor={online.selectColor}
          onSelectColorSlot={online.selectColorSlot}
          onAddAI={online.addAIPlayer}
          onRemoveAI={online.removeAIPlayer}
          onSetAIDifficulty={online.setAIDifficulty}
          onExit={handleExit}
        />
        {overlayModals}
      </>
    )
  }

  // ── Active / ended game ─────────────────────────────────────────────────────
  if ((online.roomPhase === 'playing' || online.roomPhase === 'ended' || online.roomPhase === 'spectating') && online.state) {
    return (
      <>
        <GameScreen
          state={online.state}
          currentPlayer={online.currentPlayer}
          getSelectedPiece={online.getSelectedPiece}
          getGhostCells={online.getGhostCells}
          selectPiece={online.selectPiece}
          deselectPiece={online.deselectPiece}
          rotatePiece={online.rotatePiece}
          rotatePieceReverse={online.rotatePieceReverse}
          flipPiece={online.flipPiece}
          setHover={online.setHover}
          placePiece={online.placePiece}
          confirmPlacement={online.confirmPlacement}
          cancelPlacement={online.cancelPlacement}
          dismissNoMoves={online.dismissNoMoves}
          confirmSkip={online.confirmSkip}
          removePiece={online.removePiece}
          endTurn={online.endTurn}
          requestEndGame={online.requestEndGame}
          confirmEndGame={online.confirmEndGame}
          cancelEndGame={online.cancelEndGame}
          newGame={online.newGame}
          isOnline={true}
          isHostPlayer={online.isHostPlayer}
          myHumanId={online.myHumanId}
          isMyTurn={online.isMyTurn()}
          onlineRoomCode={online.roomCode}
          onlinePlayers={online.roomPlayers}
          onExit={handleExit}
          otherPlayersGhosts={online.otherPlayersGhosts}
        />
        {overlayModals}
      </>
    )
  }

  // ── Reconnecting (has stored session, waiting for server to respond) ─────────
  if (online.isReconnecting) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100dvh', background: '#0f172a', color: '#94a3b8',
        fontFamily: 'sans-serif', fontSize: '1.1rem', letterSpacing: '0.05em',
      }}>
        Reconnecting…
      </div>
    )
  }

  // ── Landing page (disconnected state) ───────────────────────────────────────
  return (
    <>
      <LandingPage
        onPassAndPlay={onPassAndPlay}
        onCreateRoom={(config, callback) => {
          online.createRoom(config.mode, config.maxPlayers, config.playerName, callback)
        }}
        onJoinRoom={(config, callback) => {
          online.joinRoom(config.roomCode, config.playerName, callback)
        }}
      />
      {overlayModals}
    </>
  )
}

// ─── Root App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState('main')
  // 'main' = OnlineApp (handles landing + waiting room + online game)
  // 'pass-and-play' = local pass-and-play mode

  return (
    <>
      {screen === 'pass-and-play' ? (
        <PassAndPlayApp onExit={() => setScreen('main')} />
      ) : (
        <OnlineApp onPassAndPlay={() => setScreen('pass-and-play')} />
      )}
      <Analytics />
    </>
  )
}
