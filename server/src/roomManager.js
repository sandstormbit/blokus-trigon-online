/**
 * ROOM MANAGER
 *
 * In-memory store for game rooms. Rooms are lost on server restart (by design for Phase 4).
 *
 * Room structure:
 *   { code, mode, maxPlayers, hostToken, players, spectators, settings, phase, gameState,
 *     moveLog, aiTurnTimer, lastMoveTime, disconnectTimers }
 *
 * Player structure (within a room):
 *   Human: { humanId, name, token, socketId, connected, color, color2, isAI: false }
 *   AI:    { humanId, name, token: null, socketId: null, connected: true, color, color2,
 *            isAI: true, aiDifficulty: 'normal'|'hard' }
 *
 * Spectator structure:
 *   { socketId, name }
 */

import { generateAIName } from './aiNames.js'

// Exclude I and O to avoid confusion with 1 and 0
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'

// Maps
const rooms = new Map()          // roomCode → room
const tokenToRoom = new Map()    // sessionToken → roomCode
const socketToToken = new Map()  // socketId → sessionToken

function generateCode() {
  let code
  let attempts = 0
  do {
    code = Array.from({ length: 6 }, () =>
      CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
    ).join('')
    attempts++
    if (attempts > 1000) throw new Error('Could not generate unique room code')
  } while (rooms.has(code))
  return code
}

function generateToken() {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a new room. Returns { room, player } or throws.
 */
export function createRoom(mode, maxPlayers, hostName, socketId) {
  const code = generateCode()
  const token = generateToken()

  const hostPlayer = {
    humanId: 1,
    name: hostName || 'Player 1',
    token,
    socketId,
    connected: true,
    color: null,
    color2: null,
    isAI: false,
  }

  const room = {
    code,
    mode,              // 'public' | 'private'
    maxPlayers,        // 2 | 3 | 4
    hostToken: token,
    players: [hostPlayer],
    spectators: [],    // [{ socketId, name }]
    settings: {
      gameModes: { requiredStart: false, zenMode: false, megaColors: false },
    },
    phase: 'waiting',  // 'waiting' | 'playing' | 'ended'
    gameState: null,
    moveLog: [],       // [{ type, playerHumanId, playerName, pieceId, anchorQ, anchorR, rotIndex, flipped, cells, timestamp }]
    aiTurnTimer: null, // cancellable setTimeout handle for pending AI turn
    lastMoveTime: Date.now(),
    disconnectTimers: new Map(), // humanId → setTimeout handle (5-min replacement prompt)
  }

  rooms.set(code, room)
  tokenToRoom.set(token, code)
  socketToToken.set(socketId, token)

  return { room, player: hostPlayer }
}

/**
 * Join an existing room as a player.
 * If the room is full but has AI slots, returns { error: 'has_ai_slots', aiSlots, room }.
 * If the room is in progress (playing/ended), returns { error: 'game_in_progress', room }.
 * Returns { room, player } on success, or { error } on failure.
 */
export function joinRoom(code, playerName, socketId) {
  const room = rooms.get(code.toUpperCase())
  if (!room) return { error: 'room_not_found' }

  if (room.phase === 'playing' || room.phase === 'ended') {
    return { error: 'game_in_progress', room }
  }

  const humanPlayers = room.players.filter(p => !p.isAI)
  const aiPlayers = room.players.filter(p => p.isAI)

  if (humanPlayers.length >= room.maxPlayers && aiPlayers.length === 0) {
    return { error: 'room_full' }
  }

  if (humanPlayers.length >= room.maxPlayers && aiPlayers.length > 0) {
    return { error: 'has_ai_slots', aiSlots: aiPlayers.map(p => ({ humanId: p.humanId, name: p.name, aiDifficulty: p.aiDifficulty })), room }
  }

  const token = generateToken()
  const player = {
    humanId: room.players.length + 1,
    name: playerName || `Player ${room.players.length + 1}`,
    token,
    socketId,
    connected: true,
    color: null,
    color2: null,
    isAI: false,
  }

  room.players.push(player)
  tokenToRoom.set(token, code)
  socketToToken.set(socketId, token)

  return { room, player }
}

/**
 * Add an AI player to an open slot in a waiting room.
 * Returns { room, aiPlayer } or { error }.
 */
export function addAIPlayer(code, difficulty = 'normal') {
  const room = rooms.get(code)
  if (!room) return { error: 'room_not_found' }
  if (room.phase !== 'waiting') return { error: 'game_already_started' }
  if (room.players.length >= room.maxPlayers) return { error: 'room_full' }

  const validDifficulty = difficulty === 'hard' ? 'hard' : 'normal'
  const allColors = ['blue', 'red', 'green', 'yellow']
  const takenColors = new Set(room.players.flatMap(p => [p.color, p.color2]).filter(Boolean))
  const available = allColors.filter(c => !takenColors.has(c))
  const isTwoPlayerStandard = room.maxPlayers === 2 && !room.settings?.gameModes?.megaColors
  const aiColor = available[0] || null
  const aiColor2 = isTwoPlayerStandard ? (available[1] || null) : null

  const aiPlayer = {
    humanId: room.players.length + 1,
    name: generateAIName(),
    token: null,
    socketId: null,
    connected: true,
    color: aiColor,
    color2: aiColor2,
    isAI: true,
    aiDifficulty: validDifficulty,
  }

  room.players.push(aiPlayer)
  return { room, aiPlayer }
}

/**
 * Remove an AI player from a waiting room (host replaces with open slot).
 * Returns { room } or { error }.
 */
export function removeAIPlayer(code, humanId) {
  const room = rooms.get(code)
  if (!room) return { error: 'room_not_found' }
  if (room.phase !== 'waiting') return { error: 'game_already_started' }

  const aiIdx = room.players.findIndex(p => p.isAI && p.humanId === humanId)
  if (aiIdx === -1) return { error: 'ai_not_found' }

  room.players.splice(aiIdx, 1)

  // Re-number humanIds sequentially
  room.players.forEach((p, i) => { p.humanId = i + 1 })

  return { room }
}

/**
 * Replace an AI player in a waiting room with a joining human player.
 * Returns { room, player } or { error }.
 */
export function replaceAIWithHuman(code, aiHumanId, playerName, socketId) {
  const room = rooms.get(code)
  if (!room) return { error: 'room_not_found' }
  if (room.phase !== 'waiting') return { error: 'game_already_started' }

  const aiIdx = room.players.findIndex(p => p.isAI && p.humanId === aiHumanId)
  if (aiIdx === -1) return { error: 'ai_not_found' }

  const token = generateToken()
  const player = {
    humanId: aiHumanId,
    name: playerName || `Player ${aiHumanId}`,
    token,
    socketId,
    connected: true,
    color: room.players[aiIdx].color || null,
    color2: room.players[aiIdx].color2 || null,
    isAI: false,
  }

  room.players[aiIdx] = player
  tokenToRoom.set(token, code)
  socketToToken.set(socketId, token)

  return { room, player }
}

/**
 * Replace a disconnected human player with an AI mid-game.
 * Returns { room, aiPlayer } or { error }.
 */
export function replaceHumanWithAI(code, humanId, difficulty = 'normal') {
  const room = rooms.get(code)
  if (!room) return { error: 'room_not_found' }
  if (room.phase !== 'playing') return { error: 'game_not_active' }

  const playerIdx = room.players.findIndex(p => !p.isAI && p.humanId === humanId)
  if (playerIdx === -1) return { error: 'player_not_found' }

  const existing = room.players[playerIdx]
  if (existing.connected) return { error: 'player_still_connected' }

  const oldToken = existing.token
  if (oldToken) tokenToRoom.delete(oldToken)

  const aiPlayer = {
    humanId: existing.humanId,
    name: generateAIName(),
    token: null,
    socketId: null,
    connected: true,
    color: existing.color,
    color2: existing.color2,
    isAI: true,
    aiDifficulty: difficulty === 'hard' ? 'hard' : 'normal',
    // Store original player info for potential claim-back
    replacedToken: oldToken,
    replacedName: existing.name,
  }

  room.players[playerIdx] = aiPlayer
  return { room, aiPlayer }
}

/**
 * Allow a returning player to reclaim the slot an AI took over mid-game.
 * Returns { room, player } or { error }.
 */
export function claimAISlot(code, originalToken, newSocketId) {
  const room = rooms.get(code)
  if (!room) return { error: 'room_not_found' }
  if (room.phase !== 'playing') return { error: 'game_not_active' }

  const aiPlayer = room.players.find(p => p.isAI && p.replacedToken === originalToken)
  if (!aiPlayer) return { error: 'slot_not_found' }

  const playerIdx = room.players.indexOf(aiPlayer)

  const restoredPlayer = {
    humanId: aiPlayer.humanId,
    name: aiPlayer.replacedName || `Player ${aiPlayer.humanId}`,
    token: originalToken,
    socketId: newSocketId,
    connected: true,
    color: aiPlayer.color,
    color2: aiPlayer.color2,
    isAI: false,
  }

  room.players[playerIdx] = restoredPlayer
  tokenToRoom.set(originalToken, code)
  socketToToken.set(newSocketId, originalToken)

  return { room, player: restoredPlayer }
}

/**
 * Add a spectator to a room. Returns { room, spectator } or { error }.
 */
export function addSpectator(code, socketId, name) {
  const room = rooms.get(code)
  if (!room) return { error: 'room_not_found' }

  const existing = room.spectators.find(s => s.socketId === socketId)
  if (existing) return { room, spectator: existing }

  const spectator = { socketId, name: name || 'Spectator' }
  room.spectators.push(spectator)
  return { room, spectator }
}

/**
 * Remove a spectator from a room.
 */
export function removeSpectator(code, socketId) {
  const room = rooms.get(code)
  if (!room) return
  room.spectators = room.spectators.filter(s => s.socketId !== socketId)
}

/**
 * Attempt to reconnect a player by session token.
 * Updates their socketId and marks them connected.
 * Returns { room, player } or { error }.
 */
export function reconnectPlayer(token, socketId) {
  const code = tokenToRoom.get(token)
  if (!code) return { error: 'session_not_found' }

  const room = rooms.get(code)
  if (!room) return { error: 'room_not_found' }

  const player = room.players.find(p => p.token === token)
  if (!player) {
    // Check if an AI replaced them — offer claim-back
    const aiReplacement = room.players.find(p => p.isAI && p.replacedToken === token)
    if (aiReplacement) return { error: 'ai_replaced', room, aiHumanId: aiReplacement.humanId, replacedName: aiReplacement.replacedName }
    return { error: 'player_not_found' }
  }

  if (player.socketId && player.socketId !== socketId) {
    socketToToken.delete(player.socketId)
  }

  player.socketId = socketId
  player.connected = true
  socketToToken.set(socketId, token)

  return { room, player }
}

/**
 * Handle a socket disconnecting.
 * - During 'waiting': removes human players, marks AI still connected.
 *   Transfers host if needed.
 * - During 'playing'/'ended': marks player disconnected for reconnection.
 * - Spectators: removed from spectator list.
 * Returns { room, player, wasSpectator } or null.
 */
export function handleDisconnect(socketId) {
  // Check if spectator first
  for (const room of rooms.values()) {
    const specIdx = room.spectators.findIndex(s => s.socketId === socketId)
    if (specIdx !== -1) {
      room.spectators.splice(specIdx, 1)
      return { room, player: null, wasSpectator: true }
    }
  }

  const token = socketToToken.get(socketId)
  if (!token) return null

  socketToToken.delete(socketId)

  const code = tokenToRoom.get(token)
  if (!code) return null

  const room = rooms.get(code)
  if (!room) return null

  const player = room.players.find(p => p.token === token)
  if (!player) return { room, player: null, wasSpectator: false }

  if (room.phase === 'waiting') {
    room.players = room.players.filter(p => p.token !== token)
    tokenToRoom.delete(token)

    if (room.players.length === 0) {
      rooms.delete(code)
      return { room: null, player, wasSpectator: false }
    }

    // Re-number humanIds for remaining players
    room.players.forEach((p, i) => { p.humanId = i + 1 })

    if (room.hostToken === token) {
      const nextHuman = room.players.find(p => !p.isAI)
      room.hostToken = nextHuman ? nextHuman.token : room.players[0]?.token
    }
  } else {
    player.connected = false
    player.socketId = null
  }

  return { room, player, wasSpectator: false }
}

/**
 * Update room settings (game modes). Any player can call this.
 */
export function updateSettings(code, gameModes) {
  const room = rooms.get(code)
  if (!room) return { error: 'room_not_found' }
  if (room.phase !== 'waiting') return { error: 'game_already_started' }

  room.settings.gameModes = { ...room.settings.gameModes, ...gameModes }
  return room
}

/**
 * Mark a room as started, storing its game state. Initializes moveLog.
 */
export function startRoom(code, gameState) {
  const room = rooms.get(code)
  if (!room) return { error: 'room_not_found' }

  room.phase = 'playing'
  room.gameState = gameState
  room.moveLog = []
  room.lastMoveTime = Date.now()
  return room
}

/**
 * Update the game state stored in a room.
 */
export function updateGameState(code, gameState) {
  const room = rooms.get(code)
  if (!room) return null

  room.gameState = gameState
  if (gameState.phase === 'ended') room.phase = 'ended'
  return room
}

/**
 * Append an entry to the room's move log.
 */
export function appendMoveLog(code, entry) {
  const room = rooms.get(code)
  if (!room) return
  room.moveLog.push({ ...entry, timestamp: Date.now() })
  room.lastMoveTime = Date.now()
}

/**
 * Get a room by code.
 */
export function getRoom(code) {
  return rooms.get(code?.toUpperCase()) || null
}

/**
 * Get token from socketId.
 */
export function getTokenFromSocket(socketId) {
  return socketToToken.get(socketId) || null
}

/**
 * Get player in room by token.
 */
export function getPlayerByToken(room, token) {
  return room.players.find(p => p.token === token) || null
}

/**
 * Check if token belongs to room host.
 */
export function isHost(room, token) {
  return room.hostToken === token
}

/**
 * Return all public rooms that are in 'waiting' phase with open human slots.
 */
export function getPublicRooms() {
  return [...rooms.values()]
    .filter(r => r.mode === 'public' && r.phase === 'waiting')
    .map(r => {
      const humanCount = r.players.filter(p => !p.isAI).length
      return {
        code: r.code,
        maxPlayers: r.maxPlayers,
        currentPlayers: humanCount,
        settings: r.settings,
      }
    })
    .filter(r => r.currentPlayers < r.maxPlayers)
}

/**
 * Update a player's chosen color. Validates the color is not already in use
 * by another player's explicit selection.
 */
export function updatePlayerColor(code, token, color, slotIdx = 0) {
  const room = rooms.get(code)
  if (!room) return { error: 'room_not_found' }
  if (room.phase !== 'waiting') return { error: 'game_already_started' }

  const player = room.players.find(p => p.token === token)
  if (!player) return { error: 'player_not_found' }

  if (color !== null && color !== undefined) {
    const taken = room.players.some((p) => {
      if (p.token === token) {
        const myOtherColor = slotIdx === 0 ? p.color2 : p.color
        return myOtherColor === color
      }
      return p.color === color || p.color2 === color
    })
    if (taken) return { error: 'color_taken' }
  }

  if (slotIdx === 1) {
    player.color2 = color || null
  } else {
    player.color = color || null
  }
  return { room }
}

/**
 * Clean up a room and all associated mappings.
 */
export function deleteRoom(code) {
  const room = rooms.get(code)
  if (!room) return

  if (room.aiTurnTimer) {
    clearTimeout(room.aiTurnTimer)
    room.aiTurnTimer = null
  }

  for (const timer of room.disconnectTimers.values()) {
    clearTimeout(timer)
  }

  for (const player of room.players) {
    if (player.token) tokenToRoom.delete(player.token)
    if (player.socketId) socketToToken.delete(player.socketId)
  }

  rooms.delete(code)
}

/**
 * Transfer host to a random connected human player (used when host disconnects).
 * Returns the new host player or null if no humans remain.
 */
export function transferHost(room) {
  const candidates = room.players.filter(p => !p.isAI && p.connected && p.token !== room.hostToken)
  if (candidates.length === 0) return null

  const newHost = candidates[Math.floor(Math.random() * candidates.length)]
  room.hostToken = newHost.token
  return newHost
}

/**
 * Check whether any human player is still connected to the room.
 */
export function hasConnectedHumans(room) {
  return room.players.some(p => !p.isAI && p.connected)
}
