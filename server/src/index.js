/**
 * BLOKUS TRIGON — SERVER
 *
 * Express + Socket.io server.
 * Handles room management, real-time game events, and reconnection.
 */

import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'

import {
  createRoom, joinRoom, reconnectPlayer, handleDisconnect,
  updateSettings, startRoom, updateGameState,
  getRoom, getTokenFromSocket, getPlayerByToken, isHost, getPublicRooms,
  updatePlayerColor,
} from './roomManager.js'

import { createGameState, processAction, serializeState } from './gameEngine.js'

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
  return room.players.map(p => ({
    humanId: p.humanId,
    name: p.name,
    connected: p.connected,
    isHost: p.token === room.hostToken,
    color: p.color || null,
  }))
}

function broadcastGameState(room) {
  io.to(room.code).emit('game_state_update', {
    gameState: serializeState(room.gameState),
  })
}

// ─── Socket.io connection handler ────────────────────────────────────────────

io.on('connection', (socket) => {

  // ── Create room ─────────────────────────────────────────────────────────────
  socket.on('create_room', ({ mode, maxPlayers, playerName, sessionToken }, ack) => {
    try {
      // Try to reconnect first if token provided
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
        if (reconnect.room?.code === code) {
          const { room, player } = reconnect
          socket.join(room.code)

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
          }

          ack(payload)
          socket.to(room.code).emit('player_reconnected', { players: getRoomPlayers(room) })
          return
        }
      }

      const result = joinRoom(code, playerName, socket.id)
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

      // Notify others
      socket.to(room.code).emit('player_joined', { players: getRoomPlayers(room) })
    } catch (err) {
      ack({ ok: false, error: err.message })
    }
  })

  // ── Update settings (any player in waiting room) ──────────────────────────
  socket.on('update_settings', ({ gameModes }) => {
    const token = getTokenFromSocket(socket.id)
    if (!token) return

    const room = [...io.sockets.adapter.rooms].reduce(() => null, null)
    // Find room via token lookup
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

    const gameState = createGameState(
      room.players,
      room.maxPlayers,
      room.settings.gameModes,
    )

    startRoom(roomCode, gameState)

    const serialized = serializeState(gameState)
    io.to(roomCode).emit('game_start', { gameState: serialized })
    ack?.({ ok: true })
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
  })

  // ── End game actions (current player only) ────────────────────────────────
  socket.on('request_end_game', (_, ack) => {
    handleSimpleAction(socket, 'REQUEST_END_GAME', ack)
  })

  socket.on('confirm_end_game', (_, ack) => {
    handleSimpleAction(socket, 'CONFIRM_END_GAME', ack)
  })

  socket.on('cancel_end_game', (_, ack) => {
    handleSimpleAction(socket, 'CANCEL_END_GAME', ack)
  })

  // ── New game (host only, after game ends) ──────────────────────────────────
  socket.on('new_game', (_, ack) => {
    const roomCode = [...socket.rooms].find(r => r !== socket.id)
    if (!roomCode) { ack?.({ ok: false, error: 'not_in_room' }); return }

    const room = getRoom(roomCode)
    if (!room) { ack?.({ ok: false, error: 'room_not_found' }); return }

    const token = getTokenFromSocket(socket.id)
    if (!isHost(room, token)) { ack?.({ ok: false, error: 'not_host' }); return }

    // Reset room to waiting phase
    room.phase = 'waiting'
    room.gameState = null

    io.to(roomCode).emit('new_game_started', {
      players: getRoomPlayers(room),
      settings: room.settings,
    })
    ack?.({ ok: true })
  })

  // ── Select color (player chooses their color in waiting room) ─────────────
  socket.on('select_color', ({ color }) => {
    const token = getTokenFromSocket(socket.id)
    if (!token) return

    const roomCode = [...socket.rooms].find(r => r !== socket.id)
    if (!roomCode) return

    const result = updatePlayerColor(roomCode, token, color || null)
    if (result.error) return

    io.to(roomCode).emit('color_updated', { players: getRoomPlayers(result.room) })
  })

  // ── Disconnect ────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const result = handleDisconnect(socket.id)
    if (!result) return

    const { room } = result
    if (!room) return

    io.to(room.code).emit('player_disconnected', { players: getRoomPlayers(room) })
  })

  // ─── Helper: simple actions that just mutate state ──────────────────────────
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
