import { useReducer, useCallback } from 'react'
import { generateBoard } from '../game/boardGeometry.js'
import { createPlayerPiecesRandom, createMegaColorPieces, getPieceOrientation, placePieceCells } from '../game/pieces.js'
import { isLegalPlacement, hasAnyLegalMove, checkGameOver } from '../game/gameLogic.js'

// ─── Parity-aware anchor ───────────────────────────────────────────────────────
// Anchor must always have even parity so piece cells land on correct-parity positions.
function parityAwareAnchor(hoverCell, pieceCells) {
  const hoverParity = ((hoverCell.q + hoverCell.r) % 2 + 2) % 2
  const matchCell = pieceCells.find(c => ((c.dq + c.dr) % 2 + 2) % 2 === hoverParity)
  const anchor = matchCell || pieceCells[0]
  return { anchorQ: hoverCell.q - anchor.dq, anchorR: hoverCell.r - anchor.dr }
}

export const PLAYER_COLORS = {
  blue:   { bg: '#3B82F6', light: '#BFDBFE', dark: '#1D4ED8', label: 'Blue' },
  red:    { bg: '#EF4444', light: '#FECACA', dark: '#B91C1C', label: 'Red' },
  green:  { bg: '#22C55E', light: '#BBF7D0', dark: '#15803D', label: 'Green' },
  yellow: { bg: '#EAB308', light: '#FEF08A', dark: '#A16207', label: 'Yellow' },
}

export const COLOR_KEYS = ['blue', 'red', 'green', 'yellow']

const ACTIONS = {
  START_GAME:        'START_GAME',
  SELECT_PIECE:      'SELECT_PIECE',
  DESELECT_PIECE:    'DESELECT_PIECE',
  ROTATE_PIECE:      'ROTATE_PIECE',
  FLIP_PIECE:        'FLIP_PIECE',
  SET_HOVER:         'SET_HOVER',
  PLACE_PIECE:       'PLACE_PIECE',
  CONFIRM_PLACEMENT: 'CONFIRM_PLACEMENT',
  CANCEL_PLACEMENT:  'CANCEL_PLACEMENT',
  DISMISS_NO_MOVES:  'DISMISS_NO_MOVES',
  CONFIRM_SKIP:      'CONFIRM_SKIP',
  END_TURN:          'END_TURN',
  END_GAME:          'END_GAME',
  CONFIRM_END_GAME:  'CONFIRM_END_GAME',
  CANCEL_END_GAME:   'CANCEL_END_GAME',
  NEW_GAME:          'NEW_GAME',
  REMOVE_PIECE:      'REMOVE_PIECE',
}

function createInitialState() {
  return {
    phase: 'setup',
    playerCount: null,   // number of human players (2, 3, or 4)
    turnCount: 0,        // total turns (used for 2p color cycling)
    players: [],         // player objects
    board: null,
    currentPlayerIndex: 0,
    selectedPieceId: null,
    hoverCell: null,
    pendingPlacement: null,
    skippedPlayerIds: new Set(), // players with no legal moves left (permanent)
    noMovesModalPlayerId: null,  // show "no moves" modal for this player
    showEndGameConfirm: false,
    waitingForEndTurn: false,    // true after placing or voluntary skip; requires End Turn to advance
    lastPlacedCells: null,       // cells of the most recently placed piece (for glow/bounce)
    lastPlacedPlayerId: null,    // player who placed it
    lastPlacedPieceId: null,     // piece id of the most recently placed piece (for removal)
    gameModes: {},               // active game mode flags
    requiredStartCells: null,    // Set<"q,r"> | null — for Required Start mode
  }
}

// ─── Required Start helper ─────────────────────────────────────────────────────
// Pick 6 random cells from the board to serve as required first-move targets.
function generateRequiredStartCells(boardCells) {
  const allKeys = Object.keys(boardCells)
  // Fisher-Yates shuffle then take first 6
  for (let i = allKeys.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = allKeys[i]; allKeys[i] = allKeys[j]; allKeys[j] = tmp
  }
  return new Set(allKeys.slice(0, 6))
}

// ─── Derive game options object from state ─────────────────────────────────────
function getGameOptions(state) {
  return {
    gameModes: state.gameModes || {},
    requiredStartCells: state.requiredStartCells || null,
  }
}

// ─── Turn advancement helper ───────────────────────────────────────────────────
// After a placement or skip, advance to the next non-skipped player.
// Checks if the next player also has no moves, setting noMovesModalPlayerId if so.
// Returns the updated state fields.
function advanceTurn(state, newBoard, newPlayers, newSkipped) {
  const { turnCount } = state
  const totalSlots = newPlayers.length  // may be >playerCount in 2p mode
  const gameOptions = getGameOptions(state)

  // Find next non-skipped slot
  let nextIdx = (state.currentPlayerIndex + 1) % totalSlots
  let safetyCount = 0
  while (newSkipped.has(newPlayers[nextIdx].id) && safetyCount < totalSlots) {
    nextIdx = (nextIdx + 1) % totalSlots
    safetyCount++
  }

  // Check if game is over (all players skipped)
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

// ─── Reducer ───────────────────────────────────────────────────────────────────
function gameReducer(state, action) {
  switch (action.type) {

    case ACTIONS.START_GAME: {
      const { humanCount, playerNames, playerColors, gameModes = {} } = action.payload

      // Build player slots.
      // 2p Mega Colors: 2 slots, each with 44 pieces in one color
      // 2p standard:    4 slots (2 per human), cycling Blue→Red→Green→Yellow
      // 3/4p:           3 or 4 slots, one color each
      let players
      if (humanCount === 2 && gameModes.megaColors) {
        players = [
          { id: 1, humanId: 1, name: playerNames[0] || 'Player 1', color: playerColors[0], pieces: createMegaColorPieces() },
          { id: 2, humanId: 2, name: playerNames[1] || 'Player 2', color: playerColors[1], pieces: createMegaColorPieces() },
        ]
      } else if (humanCount === 2) {
        // playerNames has 2 entries, playerColors has 4 (2 per human)
        players = [
          { id: 1, humanId: 1, name: `${playerNames[0]} (${PLAYER_COLORS[playerColors[0]].label})`, color: playerColors[0], pieces: createPlayerPiecesRandom() },
          { id: 2, humanId: 2, name: `${playerNames[1]} (${PLAYER_COLORS[playerColors[1]].label})`, color: playerColors[1], pieces: createPlayerPiecesRandom() },
          { id: 3, humanId: 1, name: `${playerNames[0]} (${PLAYER_COLORS[playerColors[2]].label})`, color: playerColors[2], pieces: createPlayerPiecesRandom() },
          { id: 4, humanId: 2, name: `${playerNames[1]} (${PLAYER_COLORS[playerColors[3]].label})`, color: playerColors[3], pieces: createPlayerPiecesRandom() },
        ]
      } else {
        players = Array.from({ length: humanCount }, (_, i) => ({
          id: i + 1,
          humanId: i + 1,
          name: playerNames[i] || `Player ${i + 1}`,
          color: playerColors[i],
          pieces: createPlayerPiecesRandom(),
        }))
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
        ...createInitialState(),
        phase: 'playing',
        playerCount: humanCount,
        turnCount: 0,
        players,
        board,
        gameModes,
        requiredStartCells,
        currentPlayerIndex: 0,
        skippedPlayerIds: new Set(),
      }
    }

    case ACTIONS.SELECT_PIECE: {
      const { pieceId } = action.payload
      if (state.selectedPieceId === pieceId) {
        return { ...state, selectedPieceId: null, hoverCell: null, pendingPlacement: null }
      }
      return { ...state, selectedPieceId: pieceId, pendingPlacement: null }
    }

    case ACTIONS.DESELECT_PIECE:
      return { ...state, selectedPieceId: null, hoverCell: null, pendingPlacement: null }

    case ACTIONS.ROTATE_PIECE: {
      if (!state.selectedPieceId) return state
      const players = state.players.map((p, i) => {
        if (i !== state.currentPlayerIndex) return p
        return {
          ...p,
          pieces: p.pieces.map(pc => {
            if (pc.id !== state.selectedPieceId) return pc
            return { ...pc, rotIndex: (pc.rotIndex + 1) % 6 }
          })
        }
      })
      return { ...state, players }
    }

    case ACTIONS.FLIP_PIECE: {
      if (!state.selectedPieceId) return state
      const players = state.players.map((p, i) => {
        if (i !== state.currentPlayerIndex) return p
        return {
          ...p,
          pieces: p.pieces.map(pc => {
            if (pc.id !== state.selectedPieceId) return pc
            return { ...pc, flipped: !pc.flipped }
          })
        }
      })
      return { ...state, players }
    }

    case ACTIONS.SET_HOVER:
      return { ...state, hoverCell: action.payload.cell }

    case ACTIONS.PLACE_PIECE: {
      const { hoverQ, hoverR } = action.payload
      const currentPlayer = state.players[state.currentPlayerIndex]
      const piece = currentPlayer.pieces.find(p => p.id === state.selectedPieceId)
      if (!piece) return state

      const cells = getPieceOrientation(piece, piece.rotIndex, piece.flipped)
      const { anchorQ, anchorR } = parityAwareAnchor({ q: hoverQ, r: hoverR }, cells)
      const boardCells = placePieceCells(cells, anchorQ, anchorR)

      const isFirst = !currentPlayer.pieces.some(p => p.placed)
      const { legal } = isLegalPlacement(state.board.cells, boardCells, currentPlayer.id, isFirst, getGameOptions(state))
      if (!legal) return state

      return {
        ...state,
        pendingPlacement: {
          pieceId: piece.id,
          anchorQ,
          anchorR,
          cells: boardCells,
          rotIndex: piece.rotIndex,
          flipped: piece.flipped,
        }
      }
    }

    case ACTIONS.CONFIRM_PLACEMENT: {
      if (!state.pendingPlacement) return state

      const { pieceId, cells } = state.pendingPlacement
      const playerIdx = state.currentPlayerIndex

      // Update board
      const newBoardCells = { ...state.board.cells }
      for (const cell of cells) {
        const id = `${cell.q},${cell.r}`
        newBoardCells[id] = { ...newBoardCells[id], occupiedBy: state.players[playerIdx].id }
      }
      const newBoard = { ...state.board, cells: newBoardCells }

      // Update player pieces + score
      const newPlayers = state.players.map((p, i) => {
        if (i !== playerIdx) return p
        const newPieces = p.pieces.map(pc => pc.id === pieceId ? { ...pc, placed: true } : pc)
        const score = newPieces.filter(pc => !pc.placed).reduce((sum, pc) => sum + pc.size, 0)
        return { ...p, pieces: newPieces, score }
      })

      // Don't advance turn yet — wait for END_TURN
      return {
        ...state,
        board: newBoard,
        players: newPlayers,
        pendingPlacement: null,
        selectedPieceId: null,
        hoverCell: null,
        waitingForEndTurn: true,
        lastPlacedCells: cells.map(c => ({ q: c.q, r: c.r })),
        lastPlacedPlayerId: state.players[playerIdx].id,
        lastPlacedPieceId: pieceId,
      }
    }

    case ACTIONS.CANCEL_PLACEMENT:
      return { ...state, pendingPlacement: null }

    case ACTIONS.CONFIRM_SKIP: {
      // Voluntarily skip this turn — auto-advance to next player immediately
      const newSkipped = new Set(state.skippedPlayerIds)
      const advanced = advanceTurn(
        { ...state, waitingForEndTurn: false },
        state.board,
        state.players,
        newSkipped,
      )
      return { ...state, ...advanced }
    }

    case ACTIONS.REMOVE_PIECE: {
      // Remove the last placed piece from the board, returning it to the player's hand.
      if (!state.waitingForEndTurn || !state.lastPlacedCells || !state.lastPlacedPieceId) return state

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

    case ACTIONS.END_TURN: {
      if (!state.waitingForEndTurn) return state
      const newSkipped = new Set(state.skippedPlayerIds)
      const advanced = advanceTurn(
        { ...state, waitingForEndTurn: false },
        state.board,
        state.players,
        newSkipped,
      )
      return { ...state, ...advanced }
    }

    case ACTIONS.DISMISS_NO_MOVES: {
      // Add the no-moves player to skipped set, then advance to next player
      const newSkipped = new Set(state.skippedPlayerIds)
      newSkipped.add(state.noMovesModalPlayerId)

      const advanced = advanceTurn(
        { ...state, noMovesModalPlayerId: null },
        state.board,
        state.players,
        newSkipped
      )
      return { ...state, ...advanced }
    }

    case ACTIONS.END_GAME:
      return { ...state, showEndGameConfirm: true }

    case ACTIONS.CONFIRM_END_GAME:
      return { ...state, phase: 'ended', showEndGameConfirm: false }

    case ACTIONS.CANCEL_END_GAME:
      return { ...state, showEndGameConfirm: false }

    case ACTIONS.NEW_GAME:
      return createInitialState()

    default:
      return state
  }
}

// ─── Hook ──────────────────────────────────────────────────────────────────────
export function useGameState() {
  const [state, dispatch] = useReducer(gameReducer, createInitialState())

  const startGame      = useCallback((humanCount, playerNames, playerColors, gameModes = {}) => {
    dispatch({ type: ACTIONS.START_GAME, payload: { humanCount, playerNames, playerColors, gameModes } })
  }, [])
  const selectPiece    = useCallback(id  => dispatch({ type: ACTIONS.SELECT_PIECE,   payload: { pieceId: id } }), [])
  const deselectPiece  = useCallback(()  => dispatch({ type: ACTIONS.DESELECT_PIECE }), [])
  const rotatePiece    = useCallback(()  => dispatch({ type: ACTIONS.ROTATE_PIECE }), [])
  const flipPiece      = useCallback(()  => dispatch({ type: ACTIONS.FLIP_PIECE }), [])
  const setHover       = useCallback(c   => dispatch({ type: ACTIONS.SET_HOVER, payload: { cell: c } }), [])
  const placePiece     = useCallback((q, r) => dispatch({ type: ACTIONS.PLACE_PIECE, payload: { hoverQ: q, hoverR: r } }), [])
  const confirmPlacement = useCallback(() => dispatch({ type: ACTIONS.CONFIRM_PLACEMENT }), [])
  const cancelPlacement  = useCallback(() => dispatch({ type: ACTIONS.CANCEL_PLACEMENT }), [])
  const dismissNoMoves   = useCallback(() => dispatch({ type: ACTIONS.DISMISS_NO_MOVES }), [])
  const confirmSkip      = useCallback(() => dispatch({ type: ACTIONS.CONFIRM_SKIP }), [])
  const removePiece      = useCallback(() => dispatch({ type: ACTIONS.REMOVE_PIECE }), [])
  const endTurn          = useCallback(() => dispatch({ type: ACTIONS.END_TURN }), [])
  const requestEndGame   = useCallback(() => dispatch({ type: ACTIONS.END_GAME }), [])
  const confirmEndGame   = useCallback(() => dispatch({ type: ACTIONS.CONFIRM_END_GAME }), [])
  const cancelEndGame    = useCallback(() => dispatch({ type: ACTIONS.CANCEL_END_GAME }), [])
  const newGame          = useCallback(() => dispatch({ type: ACTIONS.NEW_GAME }), [])

  const currentPlayer = state.players[state.currentPlayerIndex] || null

  const getSelectedPiece = () => {
    if (!state.selectedPieceId || !currentPlayer) return null
    return currentPlayer.pieces.find(p => p.id === state.selectedPieceId) || null
  }

  // Returns { cells, isLegal } for the hover ghost preview
  const getGhostCells = () => {
    if (!state.hoverCell || !state.selectedPieceId || !currentPlayer) return { cells: [], isLegal: false }
    const piece = getSelectedPiece()
    if (!piece) return { cells: [], isLegal: false }

    const oriented = getPieceOrientation(piece, piece.rotIndex, piece.flipped)
    const { anchorQ, anchorR } = parityAwareAnchor(state.hoverCell, oriented)
    const placed = placePieceCells(oriented, anchorQ, anchorR)

    const isFirst = !currentPlayer.pieces.some(p => p.placed)
    const { legal } = isLegalPlacement(state.board.cells, placed, currentPlayer.id, isFirst, getGameOptions(state))

    return { cells: placed, isLegal: legal }
  }

  return {
    state,
    currentPlayer,
    getSelectedPiece,
    getGhostCells,
    startGame,
    selectPiece,
    deselectPiece,
    rotatePiece,
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
  }
}
