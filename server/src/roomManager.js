/**
 * ROOM MANAGER
 *
 * In-memory store for game rooms. Rooms are lost on server restart (by design for Phase 3).
 *
 * Room structure:
 *   { code, mode, maxPlayers, hostToken, players, settings, phase, gameState }
 *
 * Player structure (within a room):
 *   { humanId, name, token, socketId, connected }
 */

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
  }

  const room = {
    code,
    mode,              // 'public' | 'private'
    maxPlayers,        // 2 | 3 | 4 (number of humans)
    hostToken: token,
    players: [hostPlayer],
    settings: {
      gameModes: { requiredStart: false, zenMode: false, megaColors: false },
    },
    phase: 'waiting',  // 'waiting' | 'playing' | 'ended'
    gameState: null,
  }

  rooms.set(code, room)
  tokenToRoom.set(token, code)
  socketToToken.set(socketId, token)

  return { room, player: hostPlayer }
}

/**
 * Join an existing room. Returns { room, player } or { error }.
 */
export function joinRoom(code, playerName, socketId) {
  const room = rooms.get(code.toUpperCase())
  if (!room) return { error: 'room_not_found' }
  if (room.phase !== 'waiting') return { error: 'game_already_started' }
  if (room.players.length >= room.maxPlayers) return { error: 'room_full' }

  const token = generateToken()
  const player = {
    humanId: room.players.length + 1,
    name: playerName || `Player ${room.players.length + 1}`,
    token,
    socketId,
    connected: true,
    color: null,
    color2: null,
  }

  room.players.push(player)
  tokenToRoom.set(token, code)
  socketToToken.set(socketId, token)

  return { room, player }
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
  if (!player) return { error: 'player_not_found' }

  // Remove old socket mapping if different
  if (player.socketId && player.socketId !== socketId) {
    socketToToken.delete(player.socketId)
  }

  player.socketId = socketId
  player.connected = true
  socketToToken.set(socketId, token)

  return { room, player }
}

/**
 * Handle a socket disconnecting. Marks the player as disconnected.
 * Returns { room, player } if found, or null.
 */
export function handleDisconnect(socketId) {
  const token = socketToToken.get(socketId)
  if (!token) return null

  socketToToken.delete(socketId)

  const code = tokenToRoom.get(token)
  if (!code) return null

  const room = rooms.get(code)
  if (!room) return null

  const player = room.players.find(p => p.token === token)
  if (player) {
    player.connected = false
    player.socketId = null
  }

  return { room, player }
}

/**
 * Update room settings (game modes). Any player can call this.
 * Returns the updated room or { error }.
 */
export function updateSettings(code, gameModes) {
  const room = rooms.get(code)
  if (!room) return { error: 'room_not_found' }
  if (room.phase !== 'waiting') return { error: 'game_already_started' }

  room.settings.gameModes = { ...room.settings.gameModes, ...gameModes }
  return room
}

/**
 * Mark a room as started, storing its game state.
 */
export function startRoom(code, gameState) {
  const room = rooms.get(code)
  if (!room) return { error: 'room_not_found' }

  room.phase = 'playing'
  room.gameState = gameState
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
 * Return all public rooms that are in 'waiting' phase and not full.
 */
export function getPublicRooms() {
  return [...rooms.values()]
    .filter(r => r.mode === 'public' && r.phase === 'waiting' && r.players.length < r.maxPlayers)
    .map(r => ({
      code: r.code,
      maxPlayers: r.maxPlayers,
      currentPlayers: r.players.length,
      settings: r.settings,
    }))
}

const DEFAULT_COLORS = ['blue', 'red', 'green', 'yellow']

/**
 * Update a player's chosen color. Validates the color is not already in use
 * by another player (by explicit choice or default slot assignment).
 * Pass color=null to clear (revert to default).
 */
export function updatePlayerColor(code, token, color, slotIdx = 0) {
  const room = rooms.get(code)
  if (!room) return { error: 'room_not_found' }
  if (room.phase !== 'waiting') return { error: 'game_already_started' }

  const player = room.players.find(p => p.token === token)
  if (!player) return { error: 'player_not_found' }

  if (color !== null && color !== undefined) {
    const taken = room.players.some((p, i) => {
      if (p.token === token) {
        // Can't use the same color for both own slots
        const myOtherColor = slotIdx === 0 ? p.color2 : p.color
        return myOtherColor === color
      }
      // Check slot 0 (with positional default) and slot 1 (explicit only)
      const effectiveSlot0 = p.color || DEFAULT_COLORS[i]
      return effectiveSlot0 === color || p.color2 === color
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

  for (const player of room.players) {
    tokenToRoom.delete(player.token)
    if (player.socketId) socketToToken.delete(player.socketId)
  }

  rooms.delete(code)
}
