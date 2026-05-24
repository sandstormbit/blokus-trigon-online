/**
 * BLOKUS TRIGON — SERVER
 *
 * Express + Socket.io server.
 * Handles room management, real-time game events, reconnection, AI turns,
 * spectators, and player replacement.
 */

import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'

import {
  createRoom, joinRoom, reconnectPlayer, handleDisconnect,
  updateSettings, startRoom, updateGameState,
  getRoom, getTokenFromSocket, getPlayerByToken, isHost, getPublicRooms,
  updatePlayerColor, appendMoveLog, addAIPlayer, removeAIPlayer, setAIPlayerDifficulty,
  replaceAIWithHuman, replaceHumanWithAI, claimAISlot,
  addSpectator, removeSpectator, transferHost, hasConnectedHumans,
  deleteRoom, leaveAndOpenSlot, takeOpenSlot,
} from './roomManager.js'

import { createGameState, processAction, serializeState } from './gameEngine.js'
import { getNormalAIMove, getHardAIMove } from './aiEngine.js'

// ─── Server setup ─────────────────────────────────────────────────────────────

const app = express()
const httpServer = createServer(app)

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173'

const io = new Server(httpServer, {
  cors: {
    origin: [CLIENT_ORIGIN, 'http://localhost:5173'],
    methods: ['GET', 'POST'],
    credentials: true,
  },
})

app.use(cors({ origin: [CLIENT_ORIGIN, 'http://localhost:5173'], credentials: true }))
app.use(express.json())

// ─── HTTP routes ──────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.get('/api/public-rooms', (_req, res) => {
  res.json(getPublicRooms())
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getRoomPlayers(room) {
  return room.players
    .filter(p => p.inLobby !== false)
    .map(p => ({
      humanId: p.humanId,
      name: p.name,
      connected: p.connected,
      isHost: p.token === room.hostToken,
      color: p.color || null,
      color2: p.color2 || null,
      isAI: p.isAI || false,
      aiDifficulty: p.isAI ? p.aiDifficulty : undefined,
      openSlot: p.openSlot || false,
    }))
}

function broadcastGameState(room) {
  if (!room) return
  io.to(room.code).emit('game_state_update', {
    gameState: serializeState(room.gameState),
  })
}

// ─── AI Turn Scheduling ───────────────────────────────────────────────────────

const ABANDONMENT_MS = 15 * 60 * 1000  // 15 minutes
const DISCONNECT_REPLACE_DELAY_MS = 5 * 60 * 1000  // 5 minutes

/**
 * Check if the current player is an AI and schedule their turn.
 * Called after every game state change.
 */
function checkAndScheduleAITurn(roomCode) {
  const room = getRoom(roomCode)
  if (!room || room.phase !== 'playing') return

  const state = room.gameState
  if (!state || state.phase !== 'playing') return

  const currentPlayer = state.players[state.currentPlayerIndex]
  if (!currentPlayer) return

  const aiRoomPlayer = room.players.find(p => p.isAI && p.humanId === currentPlayer.humanId)
  if (!aiRoomPlayer) return  // human's turn — wait for socket event

  // Clear any existing scheduled turn to avoid double-firing
  if (room.aiTurnTimer) {
    clearTimeout(room.aiTurnTimer)
    room.aiTurnTimer = null
  }

  const delay = 500 + Math.random() * 1000  // 0.5–1.5s for natural feel
  room.aiTurnTimer = setTimeout(() => {
    room.aiTurnTimer = null
    executeAITurn(roomCode, aiRoomPlayer)
  }, delay)
}

/**
 * Cancel a pending AI turn (e.g. game ended or room abandoned).
 */
function cancelAITurn(roomCode) {
  const room = getRoom(roomCode)
  if (!room) return
  if (room.aiTurnTimer) {
    clearTimeout(room.aiTurnTimer)
    room.aiTurnTimer = null
  }
}

/**
 * Execute an AI turn: compute move, apply it, broadcast, then check if next is also AI.
 */
async function executeAITurn(roomCode, aiRoomPlayer) {
  const room = getRoom(roomCode)
  if (!room || room.phase !== 'playing') return

  const state = room.gameState
  if (!state || state.phase !== 'playing') return

  const currentPlayer = state.players[state.currentPlayerIndex]
  if (!currentPlayer || currentPlayer.humanId !== aiRoomPlayer.humanId) return

  // Abandonment check — cancel if no human has moved in 15 minutes
  if (Date.now() - (room.lastMoveTime || 0) > ABANDONMENT_MS) return

  const humanId = aiRoomPlayer.humanId

  // Case 1: No-moves modal shown for this AI player — auto-dismiss
  if (state.noMovesModalPlayerId === currentPlayer.id) {
    const result = processAction(state, { type: 'DISMISS_NO_MOVES' }, humanId)
    if (!result.ok) return
    updateGameState(roomCode, result.state)
    broadcastGameState(getRoom(roomCode))
    checkAndScheduleAITurn(roomCode)
    return
  }

  // Case 2: Waiting for end turn (piece already placed) — just end turn
  if (state.waitingForEndTurn) {
    const result = processAction(state, { type: 'END_TURN' }, humanId)
    if (!result.ok) return
    updateGameState(roomCode, result.state)
    broadcastGameState(getRoom(roomCode))
    checkAndScheduleAITurn(roomCode)
    return
  }

  // Case 3: Normal AI turn — compute a move
  const isFirst = !currentPlayer.pieces.some(p => p.placed)
  const gameOptions = {
    gameModes: state.gameModes || {},
    requiredStartCells: state.requiredStartCells || null,
  }

  let move = null
  if (aiRoomPlayer.aiDifficulty === 'hard') {
    move = await getHardAIMove(
      state.board.cells, currentPlayer, state.players,
      isFirst, gameOptions, currentPlayer.score,
    )
  } else {
    move = getNormalAIMove(state.board.cells, currentPlayer, isFirst, gameOptions)
  }

  // Re-fetch room after async operation (state may have changed)
  const freshRoom = getRoom(roomCode)
  if (!freshRoom || freshRoom.phase !== 'playing') return
  const freshState = freshRoom.gameState
  if (!freshState || freshState.phase !== 'playing') return
  const freshPlayer = freshState.players[freshState.currentPlayerIndex]
  if (!freshPlayer || freshPlayer.humanId !== humanId) return  // turn advanced somehow

  if (move) {
    const placeResult = processAction(freshState, { type: 'PLACE_PIECE', payload: move }, humanId)
    if (!placeResult.ok) {
      // Placement was rejected (rare edge case) — skip turn
      const skipResult = processAction(freshState, { type: 'VOLUNTARY_SKIP' }, humanId)
      if (!skipResult.ok) return
      updateGameState(roomCode, skipResult.state)
    } else {
      updateGameState(roomCode, placeResult.state)
      appendMoveLog(roomCode, {
        type: 'place',
        playerHumanId: humanId,
        playerName: currentPlayer.name,
        isAI: true,
        pieceId: move.pieceId,
        anchorQ: move.anchorQ,
        anchorR: move.anchorR,
        rotIndex: move.rotIndex,
        flipped: move.flipped,
      })
      // Broadcast the placement so clients see the piece appear before turn advances
      broadcastGameState(getRoom(roomCode))
    }
  } else {
    // No legal moves — skip
    const skipResult = processAction(freshState, { type: 'VOLUNTARY_SKIP' }, humanId)
    if (!skipResult.ok) return
    updateGameState(roomCode, skipResult.state)
  }

  // End turn
  const afterRoom = getRoom(roomCode)
  if (!afterRoom) return
  const afterState = afterRoom.gameState
  const endResult = processAction(afterState, { type: 'END_TURN' }, humanId)
  if (!endResult.ok) return
  updateGameState(roomCode, endResult.state)
  broadcastGameState(getRoom(roomCode))
  checkAndScheduleAITurn(roomCode)
}

// ─── Disconnect replacement timer management ─────────────────────────────────

/**
 * Start a 5-minute timer. If the player is still disconnected, notify the
 * current host so they can choose to replace with AI.
 */
function startDisconnectTimer(roomCode, disconnectedPlayer) {
  const room = getRoom(roomCode)
  if (!room) return
  if (room.disconnectTimers.has(disconnectedPlayer.humanId)) return

  const timer = setTimeout(() => {
    room.disconnectTimers.delete(disconnectedPlayer.humanId)

    const r = getRoom(roomCode)
    if (!r || r.phase !== 'playing') return

    const stillDisconnected = r.players.find(
      p => p.humanId === disconnectedPlayer.humanId && !p.isAI && !p.connected
    )
    if (!stillDisconnected) return

    const host = r.players.find(p => !p.isAI && p.connected && p.token === r.hostToken)
    if (!host || !host.socketId) return

    io.to(host.socketId).emit('player_replace_prompt', {
      humanId: disconnectedPlayer.humanId,
      playerName: disconnectedPlayer.name,
    })
  }, DISCONNECT_REPLACE_DELAY_MS)

  room.disconnectTimers.set(disconnectedPlayer.humanId, timer)
}

function clearDisconnectTimer(room, humanId) {
  const timer = room.disconnectTimers.get(humanId)
  if (timer) {
    clearTimeout(timer)
    room.disconnectTimers.delete(humanId)
  }
}

// ─── Socket.io connection handler ────────────────────────────────────────────

io.on('connection', (socket) => {

  // ── Create room ─────────────────────────────────────────────────────────────
  socket.on('create_room', ({ mode, maxPlayers, playerName, sessionToken }, ack) => {
    try {
      if (sessionToken) {
        const reconnect = reconnectPlayer(sessionToken, socket.id)
        if (reconnect.room && reconnect.room.phase === 'waiting') {
          const { room, player } = reconnect
          socket.join(room.code)
          ack({
            ok: true,
            roomCode: room.code,
            maxPlayers: room.maxPlayers,
            humanId: player.humanId,
            token: player.token,
            isHost: isHost(room, player.token),
            players: getRoomPlayers(room),
            settings: room.settings,
            phase: room.phase,
          })
          socket.to(room.code).emit('player_reconnected', { players: getRoomPlayers(room) })
          return
        }
      }

      const validMode = mode === 'private' ? 'private' : 'public'
      const validCount = [2, 3, 4].includes(maxPlayers) ? maxPlayers : 4

      const { room, player } = createRoom(validMode, validCount, playerName, socket.id)
      socket.join(room.code)

      ack({
        ok: true,
        roomCode: room.code,
        maxPlayers: room.maxPlayers,
        humanId: player.humanId,
        token: player.token,
        isHost: true,
        players: getRoomPlayers(room),
        settings: room.settings,
        phase: room.phase,
      })
    } catch (err) {
      ack({ ok: false, error: err.message })
    }
  })

  // ── Join room ────────────────────────────────────────────────────────────────
  socket.on('join_room', ({ roomCode, playerName, sessionToken }, ack) => {
    try {
      const code = roomCode?.toUpperCase()

      // Try reconnection first
      if (sessionToken) {
        const reconnect = reconnectPlayer(sessionToken, socket.id)

        // AI replaced them mid-game — offer to claim slot or spectate
        if (reconnect.error === 'ai_replaced' && reconnect.room?.code === code) {
          const room = reconnect.room
          socket.join(room.code)
          ack({
            ok: true,
            roomCode: room.code,
            phase: room.phase,
            canClaimAISlot: true,
            aiHumanId: reconnect.aiHumanId,
            replacedName: reconnect.replacedName,
            gameState: room.gameState ? serializeState(room.gameState) : null,
            moveLog: room.moveLog,
            players: getRoomPlayers(room),
          })
          return
        }

        if (reconnect.room?.code === code) {
          const { room, player } = reconnect
          socket.join(room.code)

          clearDisconnectTimer(room, player.humanId)

          const payload = {
            ok: true,
            roomCode: room.code,
            maxPlayers: room.maxPlayers,
            humanId: player.humanId,
            token: player.token,
            isHost: isHost(room, player.token),
            players: getRoomPlayers(room),
            settings: room.settings,
            phase: room.phase,
          }

          if (room.phase === 'playing' || room.phase === 'ended') {
            payload.gameState = serializeState(room.gameState)
            payload.moveLog = room.moveLog
          }

          ack(payload)
          socket.to(room.code).emit('player_reconnected', { players: getRoomPlayers(room) })
          return
        }
      }

      const result = joinRoom(code, playerName, socket.id)

      // Room is in progress — offer to spectate or take an open slot
      if (result.error === 'game_in_progress') {
        const room = result.room
        const openSlots = room.players
          .filter(p => p.openSlot)
          .map(p => ({ humanId: p.humanId, name: p.name }))
        socket.join(room.code)
        ack({
          ok: true,
          roomCode: room.code,
          phase: room.phase,
          canSpectate: true,
          hasOpenSlots: openSlots.length > 0,
          openSlots: openSlots.length > 0 ? openSlots : null,
          gameState: room.gameState ? serializeState(room.gameState) : null,
          moveLog: room.moveLog,
          players: getRoomPlayers(room),
        })
        return
      }

      // Room full with AI slots — offer to take an AI slot or spectate
      if (result.error === 'has_ai_slots') {
        const room = result.room
        ack({
          ok: true,
          roomCode: room.code,
          phase: room.phase,
          hasAISlots: true,
          aiSlots: result.aiSlots,
          players: getRoomPlayers(room),
        })
        return
      }

      if (result.error) {
        ack({ ok: false, error: result.error })
        return
      }

      const { room, player } = result
      socket.join(room.code)

      ack({
        ok: true,
        roomCode: room.code,
        maxPlayers: room.maxPlayers,
        humanId: player.humanId,
        token: player.token,
        isHost: false,
        players: getRoomPlayers(room),
        settings: room.settings,
        phase: room.phase,
      })

      socket.to(room.code).emit('player_joined', { players: getRoomPlayers(room) })
    } catch (err) {
      ack({ ok: false, error: err.message })
    }
  })

  // ── Spectate a game ─────────────────────────────────────────────────────────
  socket.on('spectate_game', ({ roomCode, playerName }, ack) => {
    const code = roomCode?.toUpperCase()
    const room = getRoom(code)
    if (!room) { ack?.({ ok: false, error: 'room_not_found' }); return }

    const result = addSpectator(code, socket.id, playerName)
    if (result.error) { ack?.({ ok: false, error: result.error }); return }

    socket.join(room.code)
    ack?.({
      ok: true,
      roomCode: room.code,
      phase: room.phase,
      gameState: room.gameState ? serializeState(room.gameState) : null,
      moveLog: room.moveLog,
      players: getRoomPlayers(room),
    })

    socket.to(room.code).emit('spectator_joined', { spectatorName: playerName || 'Spectator' })
  })

  // ── Replace AI slot with joining human (waiting room) ───────────────────────
  socket.on('take_ai_slot', ({ roomCode, aiHumanId, playerName, sessionToken }, ack) => {
    const code = roomCode?.toUpperCase()
    const result = replaceAIWithHuman(code, aiHumanId, playerName, socket.id)
    if (result.error) { ack?.({ ok: false, error: result.error }); return }

    const { room, player } = result
    socket.join(room.code)

    ack?.({
      ok: true,
      roomCode: room.code,
      maxPlayers: room.maxPlayers,
      humanId: player.humanId,
      token: player.token,
      isHost: false,
      players: getRoomPlayers(room),
      settings: room.settings,
      phase: room.phase,
    })

    io.to(room.code).emit('player_joined', { players: getRoomPlayers(room) })
  })

  // ── Claim an AI slot mid-game (returning disconnected player) ────────────────
  socket.on('claim_ai_slot', ({ roomCode, sessionToken }, ack) => {
    const code = roomCode?.toUpperCase()
    if (!sessionToken) { ack?.({ ok: false, error: 'no_token' }); return }

    const result = claimAISlot(code, sessionToken, socket.id)
    if (result.error) { ack?.({ ok: false, error: result.error }); return }

    const { room, player } = result
    socket.join(room.code)

    // Cancel any pending AI turn if it's now this player's turn
    const state = room.gameState
    if (state) {
      const cp = state.players[state.currentPlayerIndex]
      if (cp && cp.humanId === player.humanId) {
        cancelAITurn(code)
      }
    }

    ack?.({
      ok: true,
      roomCode: room.code,
      humanId: player.humanId,
      token: player.token,
      isHost: isHost(room, player.token),
      players: getRoomPlayers(room),
      gameState: serializeState(room.gameState),
      moveLog: room.moveLog,
    })

    io.to(room.code).emit('player_reconnected', { players: getRoomPlayers(room) })
  })

  // ── Add AI player (host only, waiting room) ─────────────────────────────────
  socket.on('add_ai_player', ({ difficulty = 'normal' }, ack) => {
    const roomCode = [...socket.rooms].find(r => r !== socket.id)
    if (!roomCode) { ack?.({ ok: false, error: 'not_in_room' }); return }

    const room = getRoom(roomCode)
    if (!room) { ack?.({ ok: false, error: 'room_not_found' }); return }

    const token = getTokenFromSocket(socket.id)
    if (!isHost(room, token)) { ack?.({ ok: false, error: 'not_host' }); return }

    const result = addAIPlayer(roomCode, difficulty)
    if (result.error) { ack?.({ ok: false, error: result.error }); return }

    ack?.({ ok: true })
    io.to(roomCode).emit('player_joined', { players: getRoomPlayers(result.room) })
  })

  // ── Remove AI player (host only, waiting room) ───────────────────────────────
  socket.on('remove_ai_player', ({ humanId }, ack) => {
    const roomCode = [...socket.rooms].find(r => r !== socket.id)
    if (!roomCode) { ack?.({ ok: false, error: 'not_in_room' }); return }

    const room = getRoom(roomCode)
    if (!room) { ack?.({ ok: false, error: 'room_not_found' }); return }

    const token = getTokenFromSocket(socket.id)
    if (!isHost(room, token)) { ack?.({ ok: false, error: 'not_host' }); return }

    const result = removeAIPlayer(roomCode, humanId)
    if (result.error) { ack?.({ ok: false, error: result.error }); return }

    ack?.({ ok: true })
    io.to(roomCode).emit('player_joined', { players: getRoomPlayers(result.room) })
  })

  // ── Change AI difficulty (host only, waiting room) ──────────────────────────
  socket.on('set_ai_difficulty', ({ humanId, difficulty = 'normal' }, ack) => {
    const roomCode = [...socket.rooms].find(r => r !== socket.id)
    if (!roomCode) { ack?.({ ok: false, error: 'not_in_room' }); return }

    const room = getRoom(roomCode)
    if (!room) { ack?.({ ok: false, error: 'room_not_found' }); return }

    const token = getTokenFromSocket(socket.id)
    if (!isHost(room, token)) { ack?.({ ok: false, error: 'not_host' }); return }

    const result = setAIPlayerDifficulty(roomCode, humanId, difficulty)
    if (result.error) { ack?.({ ok: false, error: result.error }); return }

    ack?.({ ok: true })
    io.to(roomCode).emit('player_joined', { players: getRoomPlayers(result.room) })
  })

  // ── Replace disconnected player with AI (host only, mid-game) ───────────────
  socket.on('replace_with_ai', ({ humanId, difficulty = 'normal' }, ack) => {
    const roomCode = [...socket.rooms].find(r => r !== socket.id)
    if (!roomCode) { ack?.({ ok: false, error: 'not_in_room' }); return }

    const room = getRoom(roomCode)
    if (!room) { ack?.({ ok: false, error: 'room_not_found' }); return }

    const token = getTokenFromSocket(socket.id)
    if (!isHost(room, token)) { ack?.({ ok: false, error: 'not_host' }); return }

    const result = replaceHumanWithAI(roomCode, humanId, difficulty)
    if (result.error) { ack?.({ ok: false, error: result.error }); return }

    clearDisconnectTimer(room, humanId)

    ack?.({ ok: true })
    io.to(roomCode).emit('player_replaced_by_ai', { players: getRoomPlayers(result.room) })

    // If it's now the AI's turn, schedule their move
    checkAndScheduleAITurn(roomCode)
  })

  // ── Update settings (any player in waiting room) ──────────────────────────
  socket.on('update_settings', ({ gameModes }) => {
    const token = getTokenFromSocket(socket.id)
    if (!token) return

    const roomCode = [...socket.rooms].find(r => r !== socket.id)
    if (!roomCode) return

    const updatedRoom = updateSettings(roomCode, gameModes)
    if (updatedRoom.error) return

    io.to(roomCode).emit('settings_updated', { settings: updatedRoom.settings })
  })

  // ── Start game (host only) ────────────────────────────────────────────────
  socket.on('start_game', (_, ack) => {
    const roomCode = [...socket.rooms].find(r => r !== socket.id)
    if (!roomCode) { ack?.({ ok: false, error: 'not_in_room' }); return }

    const room = getRoom(roomCode)
    if (!room) { ack?.({ ok: false, error: 'room_not_found' }); return }

    const token = getTokenFromSocket(socket.id)
    if (!isHost(room, token)) { ack?.({ ok: false, error: 'not_host' }); return }

    if (room.phase !== 'waiting') { ack?.({ ok: false, error: 'already_started' }); return }

    if (room.players.length < room.maxPlayers) {
      ack?.({ ok: false, error: 'not_enough_players' }); return
    }

    // All slots must have a color in 2p standard mode
    const gameModes = room.settings.gameModes
    const isTwoPlayerStandard = room.maxPlayers === 2 && !gameModes.megaColors
    if (isTwoPlayerStandard) {
      const humanPlayers = room.players.filter(p => !p.isAI)
      if (humanPlayers.some(p => !p.color || !p.color2)) {
        ack?.({ ok: false, error: 'colors_not_selected' }); return
      }
    }

    const gameState = createGameState(
      room.players,
      room.maxPlayers,
      room.settings.gameModes,
    )

    startRoom(roomCode, gameState)

    const serialized = serializeState(gameState)
    // Only send game_start to players who returned to the lobby; others are
    // still on the end screen and should not be pulled into the new game.
    const activeSockets = room.players.filter(p => p.inLobby !== false).map(p => p.socketId).filter(Boolean)
    room.players.forEach(p => { delete p.inLobby })
    for (const sid of activeSockets) io.to(sid).emit('game_start', { gameState: serialized })
    ack?.({ ok: true })

    // Schedule AI turn if the first player is AI
    checkAndScheduleAITurn(roomCode)
  })

  // ── Place piece ───────────────────────────────────────────────────────────
  socket.on('place_piece', ({ pieceId, anchorQ, anchorR, rotIndex, flipped }, ack) => {
    const roomCode = [...socket.rooms].find(r => r !== socket.id)
    if (!roomCode) { ack?.({ ok: false, error: 'not_in_room' }); return }

    const room = getRoom(roomCode)
    if (!room || room.phase !== 'playing') { ack?.({ ok: false, error: 'game_not_active' }); return }

    const token = getTokenFromSocket(socket.id)
    const player = getPlayerByToken(room, token)
    if (!player) { ack?.({ ok: false, error: 'player_not_found' }); return }

    const result = processAction(room.gameState, {
      type: 'PLACE_PIECE',
      payload: { pieceId, anchorQ, anchorR, rotIndex, flipped },
    }, player.humanId)

    if (!result.ok) {
      ack?.({ ok: false, error: result.error }); return
    }

    updateGameState(roomCode, result.state)
    appendMoveLog(roomCode, {
      type: 'place',
      playerHumanId: player.humanId,
      playerName: player.name,
      isAI: false,
      pieceId, anchorQ, anchorR, rotIndex, flipped,
    })

    ack?.({ ok: true })
    broadcastGameState(getRoom(roomCode))
  })

  // ── Dismiss no-moves (current player acknowledges they're skipped) ─────────
  socket.on('dismiss_no_moves', (_, ack) => {
    const roomCode = [...socket.rooms].find(r => r !== socket.id)
    if (!roomCode) { ack?.({ ok: false, error: 'not_in_room' }); return }

    const room = getRoom(roomCode)
    if (!room || room.phase !== 'playing') { ack?.({ ok: false, error: 'game_not_active' }); return }

    const token = getTokenFromSocket(socket.id)
    const player = getPlayerByToken(room, token)
    if (!player) { ack?.({ ok: false, error: 'player_not_found' }); return }

    const result = processAction(room.gameState, { type: 'DISMISS_NO_MOVES' }, player.humanId)
    if (!result.ok) { ack?.({ ok: false, error: result.error }); return }

    updateGameState(roomCode, result.state)
    ack?.({ ok: true })
    broadcastGameState(getRoom(roomCode))
    checkAndScheduleAITurn(roomCode)
  })

  // ── Live cursor relay ─────────────────────────────────────────────────────
  socket.on('cursor_update', (data) => {
    const roomCode = [...socket.rooms].find(r => r !== socket.id)
    if (!roomCode) return
    const token = getTokenFromSocket(socket.id)
    const room = getRoom(roomCode)
    if (!room || room.phase !== 'playing') return
    const player = getPlayerByToken(room, token)
    if (!player) return
    socket.to(roomCode).emit('player_cursor_update', { humanId: player.humanId, ...data })
  })

  // ── Remove piece ──────────────────────────────────────────────────────────
  socket.on('remove_piece', (_, ack) => {
    handleSimpleAction(socket, 'REMOVE_PIECE', ack)
  })

  // ── Voluntary skip ────────────────────────────────────────────────────────
  socket.on('voluntary_skip', (_, ack) => {
    handleSimpleAction(socket, 'VOLUNTARY_SKIP', ack)
  })

  // ── End turn ──────────────────────────────────────────────────────────────
  socket.on('end_turn', (_, ack) => {
    const roomCode = [...socket.rooms].find(r => r !== socket.id)
    if (!roomCode) { ack?.({ ok: false, error: 'not_in_room' }); return }

    const room = getRoom(roomCode)
    if (!room || room.phase !== 'playing') { ack?.({ ok: false, error: 'game_not_active' }); return }

    const token = getTokenFromSocket(socket.id)
    const player = getPlayerByToken(room, token)
    if (!player) { ack?.({ ok: false, error: 'player_not_found' }); return }

    const result = processAction(room.gameState, { type: 'END_TURN' }, player.humanId)
    if (!result.ok) { ack?.({ ok: false, error: result.error }); return }

    updateGameState(roomCode, result.state)
    ack?.({ ok: true })
    broadcastGameState(getRoom(roomCode))
    checkAndScheduleAITurn(roomCode)
  })

  // ── End game actions ──────────────────────────────────────────────────────
  socket.on('request_end_game', (_, ack) => {
    handleSimpleAction(socket, 'REQUEST_END_GAME', ack)
  })

  socket.on('confirm_end_game', (_, ack) => {
    const roomCode = [...socket.rooms].find(r => r !== socket.id)
    if (roomCode) cancelAITurn(roomCode)
    handleSimpleAction(socket, 'CONFIRM_END_GAME', ack)
  })

  socket.on('cancel_end_game', (_, ack) => {
    const roomCode = [...socket.rooms].find(r => r !== socket.id)
    handleSimpleAction(socket, 'CANCEL_END_GAME', ack)
    if (roomCode) checkAndScheduleAITurn(roomCode)
  })

  // ── Any player clicks "New Game" → resets room (once) and joins the lobby ──
  function handleRejoinLobby(ack) {
    const token = getTokenFromSocket(socket.id)
    if (!token) { ack?.({ ok: false, error: 'not_authenticated' }); return }

    const roomCode = [...socket.rooms].find(r => r !== socket.id)
    if (!roomCode) { ack?.({ ok: false, error: 'not_in_room' }); return }

    const room = getRoom(roomCode)
    if (!room) { ack?.({ ok: false, error: 'room_not_found' }); return }

    // First player to click "New Game" resets the room.
    if (room.phase === 'ended') {
      cancelAITurn(roomCode)
      room.players = room.players.filter(p => !p.isAI)
      room.players.forEach(p => { p.color = null; p.color2 = null; p.inLobby = false })
      room.phase = 'waiting'
      room.gameState = null
      room.moveLog = []
    }

    if (room.phase !== 'waiting') { ack?.({ ok: false, error: 'wrong_phase' }); return }

    const player = room.players.find(p => p.token === token)
    if (!player) { ack?.({ ok: false, error: 'player_not_found' }); return }

    player.inLobby = true

    io.to(roomCode).emit('player_joined', { players: getRoomPlayers(room) })
    ack?.({ ok: true })
  }

  socket.on('new_game', (_, ack) => handleRejoinLobby(ack))
  socket.on('rejoin_lobby', (_, ack) => handleRejoinLobby(ack))

  // ── Select color ──────────────────────────────────────────────────────────
  socket.on('select_color', ({ color, slotIdx = 0 }) => {
    const token = getTokenFromSocket(socket.id)
    if (!token) return

    const roomCode = [...socket.rooms].find(r => r !== socket.id)
    if (!roomCode) return

    const result = updatePlayerColor(roomCode, token, color || null, slotIdx)
    if (result.error) return

    io.to(roomCode).emit('color_updated', { players: getRoomPlayers(result.room) })
  })

  // ── Voluntary leave mid-game (opens slot, no AI replacement) ────────────
  socket.on('leave_game', (_, ack) => {
    const roomCode = [...socket.rooms].find(r => r !== socket.id)
    if (!roomCode) { ack?.({ ok: true }); return }

    const room = getRoom(roomCode)
    if (!room || room.phase === 'waiting') { ack?.({ ok: true }); return }

    const token = getTokenFromSocket(socket.id)
    if (!token) { ack?.({ ok: true }); return }

    const result = leaveAndOpenSlot(roomCode, token)
    if (result.error) { ack?.({ ok: false, error: result.error }); return }

    ack?.({ ok: true })
    io.to(roomCode).emit('player_disconnected', { players: getRoomPlayers(result.room) })
  })

  // ── Take an open player slot mid-game ─────────────────────────────────────
  socket.on('take_open_slot', ({ roomCode, aiHumanId, playerName }, ack) => {
    const code = roomCode?.toUpperCase()

    const result = takeOpenSlot(code, aiHumanId, playerName, socket.id)
    if (result.error) { ack?.({ ok: false, error: result.error }); return }

    const { room, player } = result
    socket.join(room.code)

    // Cancel any pending AI turn for this slot if it's their turn
    const state = room.gameState
    if (state) {
      const cp = state.players[state.currentPlayerIndex]
      if (cp && cp.humanId === player.humanId) cancelAITurn(code)
    }

    ack?.({
      ok: true,
      roomCode: room.code,
      humanId: player.humanId,
      token: player.token,
      isHost: isHost(room, player.token),
      players: getRoomPlayers(room),
      settings: room.settings,
      phase: room.phase,
      gameState: room.gameState ? serializeState(room.gameState) : null,
      moveLog: room.moveLog,
    })

    io.to(room.code).emit('player_reconnected', { players: getRoomPlayers(room) })
  })

  // ── Disconnect ────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    // Determine the socket's room before it fully disconnects
    const roomCode = [...socket.rooms].find(r => r !== socket.id)

    const result = handleDisconnect(socket.id)
    if (!result) return

    const { room, player, wasSpectator } = result

    if (wasSpectator) {
      if (room) io.to(room.code).emit('spectator_left', {})
      return
    }

    if (!room) return

    if (room.phase === 'playing' && player && !player.isAI) {
      io.to(room.code).emit('player_disconnected', { players: getRoomPlayers(room) })

      // Transfer host if needed
      if (room.hostToken === player.token || !room.players.find(p => p.token === room.hostToken)) {
        if (!hasConnectedHumans(room)) {
          // No humans left — end the game
          cancelAITurn(room.code)
          room.phase = 'ended'
          if (room.gameState) {
            room.gameState = { ...room.gameState, phase: 'ended' }
            io.to(room.code).emit('game_state_update', { gameState: serializeState(room.gameState) })
          }
          return
        }
        const newHost = transferHost(room)
        if (newHost) {
          io.to(room.code).emit('host_transferred', {
            newHostHumanId: newHost.humanId,
            players: getRoomPlayers(room),
          })
        }
      }

      // Start 5-minute replacement timer
      startDisconnectTimer(room.code, player)
    } else {
      io.to(room.code).emit('player_disconnected', { players: getRoomPlayers(room) })
    }
  })

  // ─── Helper: simple actions that just mutate state ───────────────────────────
  function handleSimpleAction(socket, actionType, ack) {
    const roomCode = [...socket.rooms].find(r => r !== socket.id)
    if (!roomCode) { ack?.({ ok: false, error: 'not_in_room' }); return }

    const room = getRoom(roomCode)
    if (!room || room.phase !== 'playing') { ack?.({ ok: false, error: 'game_not_active' }); return }

    const token = getTokenFromSocket(socket.id)
    const player = getPlayerByToken(room, token)
    if (!player) { ack?.({ ok: false, error: 'player_not_found' }); return }

    const result = processAction(room.gameState, { type: actionType }, player.humanId)
    if (!result.ok) { ack?.({ ok: false, error: result.error }); return }

    updateGameState(roomCode, result.state)
    ack?.({ ok: true })
    broadcastGameState(getRoom(roomCode))
  }
})

// ─── Start server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001
httpServer.listen(PORT, () => {
  console.log(`Blokus Trigon server running on port ${PORT}`)
})
