/**
 * SERVER-SIDE GAME ENGINE
 *
 * Authoritative game state management. Mirrors the logic from the client-side
 * useGameState.js reducer but as pure functions (no React).
 *
 * Sets (skippedPlayerIds, requiredStartCells) are kept in memory as Sets and
 * converted to arrays only when serializing for transmission.
 */

import { generateBoard } from '../game/boardGeometry.js'
import { createPlayerPiecesRandom, createMegaColorPieces, getPieceOrientation, placePieceCells } from '../game/pieces.js'
import { isLegalPlacement, hasAnyLegalMove, checkGameOver } from '../game/gameLogic.js'

export const PLAYER_COLORS = {
  blue:   { bg: '#3B82F6', light: '#BFDBFE', dark: '#1D4ED8', label: 'Blue' },
  red:    { bg: '#EF4444', light: '#FECACA', dark: '#B91C1C', label: 'Red' },
  green:  { bg: '#22C55E', light: '#BBF7D0', dark: '#15803D', label: 'Green' },
  yellow: { bg: '#EAB308', light: '#FEF08A', dark: '#A16207', label: 'Yellow' },
}

const DEFAULT_COLORS = ['blue', 'red', 'green', 'yellow']

// ─── Parity-aware anchor (mirrors useGameState.js) ───────────────────────────
function parityAwareAnchor(hoverCell, pieceCells) {
  const hoverParity = ((hoverCell.q + hoverCell.r) % 2 + 2) % 2
  const matchCell = pieceCells.find(c => ((c.dq + c.dr) % 2 + 2) % 2 === hoverParity)
  const anchor = matchCell || pieceCells[0]
  return { anchorQ: hoverCell.q - anchor.dq, anchorR: hoverCell.r - anchor.dr }
}

// ─── Required Start cell generation ──────────────────────────────────────────
function generateRequiredStartCells(boardCells) {
  const allKeys = Object.keys(boardCells)
  for (let i = allKeys.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = allKeys[i]; allKeys[i] = allKeys[j]; allKeys[j] = tmp
  }
  return new Set(allKeys.slice(0, 6))
}

function getGameOptions(state) {
  return {
    gameModes: state.gameModes || {},
    requiredStartCells: state.requiredStartCells || null,
  }
}

// ─── Turn advancement ─────────────────────────────────────────────────────────
function advanceTurn(state, newBoard, newPlayers, newSkipped) {
  const { turnCount } = state
  const totalSlots = newPlayers.length
  const gameOptions = getGameOptions(state)

  let nextIdx = (state.currentPlayerIndex + 1) % totalSlots
  let safetyCount = 0
  while (newSkipped.has(newPlayers[nextIdx].id) && safetyCount < totalSlots) {
    nextIdx = (nextIdx + 1) % totalSlots
    safetyCount++
  }

  const gameOver = checkGameOver(newPlayers, newBoard.cells, newSkipped, gameOptions)
  if (gameOver) {
    return {
      board: newBoard,
      players: newPlayers,
      skippedPlayerIds: newSkipped,
      currentPlayerIndex: nextIdx,
      selectedPieceId: null,
      hoverCell: null,
      pendingPlacement: null,
      noMovesModalPlayerId: null,
      showEndGameConfirm: false,
      waitingForEndTurn: false,
      phase: 'ended',
      turnCount: turnCount + 1,
    }
  }

  const nextPlayer = newPlayers[nextIdx]
  const isFirst = !nextPlayer.pieces.some(p => p.placed)
  const hasMoves = hasAnyLegalMove(newBoard.cells, nextPlayer.pieces, nextPlayer.id, isFirst, gameOptions)

  if (!hasMoves && !newSkipped.has(nextPlayer.id)) {
    return {
      board: newBoard,
      players: newPlayers,
      skippedPlayerIds: newSkipped,
      currentPlayerIndex: nextIdx,
      selectedPieceId: null,
      hoverCell: null,
      pendingPlacement: null,
      noMovesModalPlayerId: nextPlayer.id,
      showEndGameConfirm: false,
      waitingForEndTurn: false,
      turnCount: turnCount + 1,
    }
  }

  return {
    board: newBoard,
    players: newPlayers,
    skippedPlayerIds: newSkipped,
    currentPlayerIndex: nextIdx,
    selectedPieceId: null,
    hoverCell: null,
    pendingPlacement: null,
    noMovesModalPlayerId: null,
    showEndGameConfirm: false,
    waitingForEndTurn: false,
    turnCount: turnCount + 1,
  }
}

// ─── Create initial game state ────────────────────────────────────────────────
/**
 * Create authoritative game state for a room.
 * roomPlayers: array of { humanId, name, color? }
 * humanCount: 2 | 3 | 4 (number of humans)
 * gameModes: { requiredStart, zenMode, megaColors }
 */
export function createGameState(roomPlayers, humanCount, gameModes = {}) {
  const playerNames = roomPlayers.map(p => p.name)

  // Assign fallback colors without duplicates: explicit colors take priority,
  // then pick the first DEFAULT_COLORS entry not already taken.
  const takenColors = new Set(roomPlayers.map(p => p.color).filter(Boolean))
  const playerColors = roomPlayers.map((p) => {
    if (p.color) return p.color
    const avail = DEFAULT_COLORS.find(c => !takenColors.has(c)) || DEFAULT_COLORS[0]
    takenColors.add(avail)
    return avail
  })

  let players
  if (humanCount === 2 && gameModes.megaColors) {
    players = [
      { id: 1, humanId: roomPlayers[0].humanId, name: playerNames[0] || 'Player 1', color: playerColors[0], pieces: createMegaColorPieces(), isAI: roomPlayers[0]?.isAI || false },
      { id: 2, humanId: roomPlayers[1].humanId, name: playerNames[1] || 'Player 2', color: playerColors[1], pieces: createMegaColorPieces(), isAI: roomPlayers[1]?.isAI || false },
    ]
  } else if (humanCount === 2) {
    const defaults = ['blue', 'red', 'green', 'yellow']
    const taken2p = new Set()
    const pickColor = (explicit, fallback) => {
      if (explicit && !taken2p.has(explicit)) { taken2p.add(explicit); return explicit }
      const avail = defaults.find(c => !taken2p.has(c)) || fallback
      taken2p.add(avail)
      return avail
    }
    const resolved = [
      pickColor(roomPlayers[0].color,  defaults[0]),
      pickColor(roomPlayers[1].color,  defaults[1]),
      pickColor(roomPlayers[0].color2, defaults[2]),
      pickColor(roomPlayers[1].color2, defaults[3]),
    ]
    players = [
      { id: 1, humanId: roomPlayers[0].humanId, name: `${playerNames[0] || 'Player 1'} (${PLAYER_COLORS[resolved[0]].label})`, color: resolved[0], pieces: createPlayerPiecesRandom(), isAI: roomPlayers[0]?.isAI || false },
      { id: 2, humanId: roomPlayers[1].humanId, name: `${playerNames[1] || 'Player 2'} (${PLAYER_COLORS[resolved[1]].label})`, color: resolved[1], pieces: createPlayerPiecesRandom(), isAI: roomPlayers[1]?.isAI || false },
      { id: 3, humanId: roomPlayers[0].humanId, name: `${playerNames[0] || 'Player 1'} (${PLAYER_COLORS[resolved[2]].label})`, color: resolved[2], pieces: createPlayerPiecesRandom(), isAI: roomPlayers[0]?.isAI || false },
      { id: 4, humanId: roomPlayers[1].humanId, name: `${playerNames[1] || 'Player 2'} (${PLAYER_COLORS[resolved[3]].label})`, color: resolved[3], pieces: createPlayerPiecesRandom(), isAI: roomPlayers[1]?.isAI || false },
    ]
  } else {
    players = Array.from({ length: humanCount }, (_, i) => ({
      id: i + 1,
      humanId: roomPlayers[i].humanId,
      name: playerNames[i] || `Player ${i + 1}`,
      color: playerColors[i],
      pieces: createPlayerPiecesRandom(),
      isAI: roomPlayers[i]?.isAI || false,
    }))
  }

  // Randomize player order
  if (humanCount === 2 && !gameModes.megaColors) {
    // For 2p standard (4 slots): only randomize who goes first, preserving P1/P2 alternation
    if (Math.random() < 0.5) {
      const tmp = players[0]; players[0] = players[1]; players[1] = tmp
      const tmp2 = players[2]; players[2] = players[3]; players[3] = tmp2
    }
  } else {
    // For 3p, 4p, and 2p MegaColors: full Fisher-Yates shuffle
    for (let i = players.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const tmp = players[i]; players[i] = players[j]; players[j] = tmp
    }
  }

  players.forEach(p => {
    p.score = p.pieces.reduce((sum, pc) => sum + pc.size, 0)
  })

  const boardPlayerCount = humanCount === 2 ? 4 : humanCount
  const board = generateBoard(boardPlayerCount)

  const requiredStartCells = gameModes.requiredStart
    ? generateRequiredStartCells(board.cells)
    : null

  return {
    phase: 'playing',
    playerCount: humanCount,
    turnCount: 0,
    players,
    board,
    currentPlayerIndex: 0,
    skippedPlayerIds: new Set(),
    noMovesModalPlayerId: null,
    showEndGameConfirm: false,
    waitingForEndTurn: false,
    lastPlacedCells: null,
    lastPlacedPlayerId: null,
    lastPlacedPieceId: null,
    gameModes,
    requiredStartCells,
  }
}

// ─── Process a player action ──────────────────────────────────────────────────
/**
 * Process a game action from a player. Returns { ok, state, error }.
 * humanId: the acting human's id (1-indexed slot in the room)
 */
export function processAction(state, action, humanId) {
  const currentPlayer = state.players[state.currentPlayerIndex]
  if (!currentPlayer) return { ok: false, error: 'no_current_player' }

  // Validate it's this human's turn
  if (currentPlayer.humanId !== humanId) {
    return { ok: false, error: 'not_your_turn' }
  }

  switch (action.type) {
    case 'PLACE_PIECE': {
      const { pieceId, anchorQ, anchorR, rotIndex, flipped } = action.payload

      const piece = currentPlayer.pieces.find(p => p.id === pieceId)
      if (!piece) return { ok: false, error: 'piece_not_found' }
      if (piece.placed) return { ok: false, error: 'piece_already_placed' }

      const oriented = getPieceOrientation({ ...piece, rotIndex, flipped }, rotIndex, flipped)
      const boardCells = placePieceCells(oriented, anchorQ, anchorR)

      const isFirst = !currentPlayer.pieces.some(p => p.placed)
      const { legal, reason } = isLegalPlacement(
        state.board.cells,
        boardCells,
        currentPlayer.id,
        isFirst,
        getGameOptions(state),
      )

      if (!legal) return { ok: false, error: reason }

      // Commit placement
      const newBoardCells = { ...state.board.cells }
      for (const cell of boardCells) {
        const id = `${cell.q},${cell.r}`
        newBoardCells[id] = { ...newBoardCells[id], occupiedBy: currentPlayer.id }
      }
      const newBoard = { ...state.board, cells: newBoardCells }

      const newPlayers = state.players.map((p, i) => {
        if (i !== state.currentPlayerIndex) return p
        const newPieces = p.pieces.map(pc =>
          pc.id === pieceId
            ? { ...pc, placed: true, rotIndex, flipped }
            : pc
        )
        const score = newPieces.filter(pc => !pc.placed).reduce((sum, pc) => sum + pc.size, 0)
        return { ...p, pieces: newPieces, score }
      })

      return {
        ok: true,
        state: {
          ...state,
          board: newBoard,
          players: newPlayers,
          pendingPlacement: null,
          selectedPieceId: null,
          hoverCell: null,
          waitingForEndTurn: true,
          lastPlacedCells: boardCells.map(c => ({ q: c.q, r: c.r })),
          lastPlacedPlayerId: currentPlayer.id,
          lastPlacedPieceId: pieceId,
        }
      }
    }

    case 'REMOVE_PIECE': {
      if (!state.waitingForEndTurn || !state.lastPlacedCells || !state.lastPlacedPieceId) {
        return { ok: false, error: 'cannot_remove_piece' }
      }

      const playerIdx = state.currentPlayerIndex

      // Restore board cells
      const newBoardCells = { ...state.board.cells }
      for (const cell of state.lastPlacedCells) {
        const id = `${cell.q},${cell.r}`
        newBoardCells[id] = { ...newBoardCells[id], occupiedBy: null }
      }
      const newBoard = { ...state.board, cells: newBoardCells }

      // Restore piece to unplaced
      const newPlayers = state.players.map((p, i) => {
        if (i !== playerIdx) return p
        const newPieces = p.pieces.map(pc =>
          pc.id === state.lastPlacedPieceId ? { ...pc, placed: false } : pc
        )
        const score = newPieces.filter(pc => !pc.placed).reduce((sum, pc) => sum + pc.size, 0)
        return { ...p, pieces: newPieces, score }
      })

      return {
        ok: true,
        state: {
          ...state,
          board: newBoard,
          players: newPlayers,
          waitingForEndTurn: false,
          selectedPieceId: null,
          hoverCell: null,
          pendingPlacement: null,
          lastPlacedCells: null,
          lastPlacedPlayerId: null,
          lastPlacedPieceId: null,
        }
      }
    }

    case 'VOLUNTARY_SKIP': {
      if (state.waitingForEndTurn) return { ok: false, error: 'already_waiting_for_end_turn' }
      return {
        ok: true,
        state: {
          ...state,
          waitingForEndTurn: true,
          selectedPieceId: null,
          hoverCell: null,
          pendingPlacement: null,
        }
      }
    }

    case 'END_TURN': {
      if (!state.waitingForEndTurn) return { ok: false, error: 'not_waiting_for_end_turn' }
      const newSkipped = new Set(state.skippedPlayerIds)
      const advanced = advanceTurn(
        { ...state, waitingForEndTurn: false },
        state.board,
        state.players,
        newSkipped,
      )
      return { ok: true, state: { ...state, ...advanced } }
    }

    case 'DISMISS_NO_MOVES': {
      if (state.noMovesModalPlayerId !== currentPlayer.id) {
        return { ok: false, error: 'not_no_moves_player' }
      }
      const newSkipped = new Set(state.skippedPlayerIds)
      newSkipped.add(state.noMovesModalPlayerId)
      const advanced = advanceTurn(
        { ...state, noMovesModalPlayerId: null },
        state.board,
        state.players,
        newSkipped,
      )
      return { ok: true, state: { ...state, ...advanced } }
    }

    case 'REQUEST_END_GAME': {
      return { ok: true, state: { ...state, showEndGameConfirm: true } }
    }

    case 'CONFIRM_END_GAME': {
      if (!state.showEndGameConfirm) return { ok: false, error: 'no_confirm_pending' }
      return { ok: true, state: { ...state, phase: 'ended', showEndGameConfirm: false } }
    }

    case 'CANCEL_END_GAME': {
      return { ok: true, state: { ...state, showEndGameConfirm: false } }
    }

    default:
      return { ok: false, error: 'unknown_action' }
  }
}

// ─── Serialization ────────────────────────────────────────────────────────────
/**
 * Convert server state (with Sets) to JSON-safe object for transmission.
 */
export function serializeState(state) {
  return {
    ...state,
    skippedPlayerIds: [...state.skippedPlayerIds],
    requiredStartCells: state.requiredStartCells ? [...state.requiredStartCells] : null,
    lastPlacedCells: state.lastPlacedCells || null,
  }
}
