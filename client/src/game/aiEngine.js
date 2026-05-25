/**
 * CLIENT-SIDE AI ENGINE (Local Games)
 *
 * Mirrors the server's AI logic for pass-and-play local games.
 * Runs synchronously on the main thread — acceptable since local games
 * have only one game at a time and the board is small (≤486 cells).
 *
 * Normal: first 11 moves prefer size-5/6 pieces; first move picks randomly from
 *          the top-half of unique piece shapes sorted by center proximity.
 * Hard:   greedy heuristic (synchronous); first move uses same per-piece dedup.
 */

import { getValidPlacements } from './gameLogic.js'
import { getPieceOrientation, placePieceCells } from './pieces.js'
import { getCellVertexKeys } from './boardGeometry.js'

function buildColorVertexSet(boardCells, playerId) {
  const verts = new Set()
  for (const cell of Object.values(boardCells)) {
    if (cell.occupiedBy === playerId) {
      for (const vk of getCellVertexKeys(cell.q, cell.r)) verts.add(vk)
    }
  }
  return verts
}

function scoreMove(boardCells, newCells, piece, playerId, allPlayers, isFirstPiece, boardCenterQ, boardCenterR) {
  let score = 0

  // 1. Piece size
  score += piece.size * 100

  // First move: strong center proximity bonus dominates other scoring
  if (isFirstPiece) {
    const centQ = newCells.reduce((s, c) => s + c.q, 0) / newCells.length
    const centR = newCells.reduce((s, c) => s + c.r, 0) / newCells.length
    const dist = Math.sqrt((centQ - boardCenterQ) ** 2 + (centR - boardCenterR) ** 2)
    score -= dist * 50
    return score
  }

  // 2. New corner vertices
  const myVerts = buildColorVertexSet(boardCells, playerId)
  const newVerts = new Set()
  for (const cell of newCells) {
    for (const vk of getCellVertexKeys(cell.q, cell.r)) newVerts.add(vk)
  }
  for (const vk of newVerts) {
    if (!myVerts.has(vk)) score += 3
  }

  // 3. Opponent corner blocking
  for (const other of allPlayers) {
    if (other.id === playerId) continue
    const oppVerts = buildColorVertexSet(boardCells, other.id)
    for (const vk of newVerts) {
      if (oppVerts.has(vk)) score += 5
    }
  }

  return score
}

/**
 * Compute a Normal AI move.
 * First 11 moves: randomly pick from size-5/6 pieces.
 * First move: pick from the center-nearest placement of each unique piece shape
 *   (top 50% by distance), so no single compact piece dominates every game.
 * Returns { pieceId, anchorQ, anchorR, rotIndex, flipped, cells } or null.
 */
export function getNormalAIMove(boardCells, player, isFirstPiece, gameOptions) {
  const piecesPlaced = player.pieces.filter(p => p.placed).length
  const preferLarge = piecesPlaced < 11

  const collect = (sizeFilter) => {
    const moves = []
    for (const piece of player.pieces) {
      if (piece.placed) continue
      if (sizeFilter && piece.size !== 5 && piece.size !== 6) continue
      const placements = getValidPlacements(boardCells, piece, player.id, isFirstPiece, false, gameOptions)
      for (const p of placements) {
        const oriented = getPieceOrientation(piece, p.rotIndex, p.flipped)
        const cells = placePieceCells(oriented, p.anchorQ, p.anchorR)
        moves.push({ pieceId: piece.id, cells, ...p })
      }
    }
    return moves
  }

  let allMoves = preferLarge ? collect(true) : collect(false)
  if (allMoves.length === 0) allMoves = collect(false)
  if (allMoves.length === 0) return null

  if (isFirstPiece) {
    const boardVals = Object.values(boardCells)
    const centerQ = boardVals.reduce((s, c) => s + c.q, 0) / boardVals.length
    const centerR = boardVals.reduce((s, c) => s + c.r, 0) / boardVals.length

    // Keep only the center-nearest placement per unique piece shape,
    // then pick randomly from the top half — prevents always landing on
    // the most compact piece (e.g. #20) in its multiple center rotations.
    const bestByPiece = new Map()
    for (const move of allMoves) {
      const cQ = move.cells.reduce((s, c) => s + c.q, 0) / move.cells.length
      const cR = move.cells.reduce((s, c) => s + c.r, 0) / move.cells.length
      const dist = Math.sqrt((cQ - centerQ) ** 2 + (cR - centerR) ** 2)
      if (!bestByPiece.has(move.pieceId) || dist < bestByPiece.get(move.pieceId).dist) {
        bestByPiece.set(move.pieceId, { ...move, dist })
      }
    }
    const candidates = [...bestByPiece.values()].sort((a, b) => a.dist - b.dist)
    const topN = Math.max(3, Math.ceil(candidates.length * 0.5))
    return candidates[Math.floor(Math.random() * topN)]
  }

  return allMoves[Math.floor(Math.random() * allMoves.length)]
}

/**
 * Compute a Hard AI move using the greedy heuristic.
 * First move aims for board center.
 * Returns { pieceId, anchorQ, anchorR, rotIndex, flipped, cells } or null.
 */
export function getHardAIMove(boardCells, player, allPlayers, isFirstPiece, gameOptions, playerScore) {
  const boardVals = Object.values(boardCells)
  const boardCenterQ = boardVals.reduce((s, c) => s + c.q, 0) / boardVals.length
  const boardCenterR = boardVals.reduce((s, c) => s + c.r, 0) / boardVals.length

  const candidateMoves = []

  for (const piece of player.pieces) {
    if (piece.placed) continue
    const placements = getValidPlacements(boardCells, piece, player.id, isFirstPiece, false, gameOptions)
    for (const p of placements) {
      const oriented = getPieceOrientation(piece, p.rotIndex, p.flipped)
      const cells = placePieceCells(oriented, p.anchorQ, p.anchorR)
      candidateMoves.push({
        pieceId: piece.id,
        cells,
        ...p,
        score: scoreMove(boardCells, cells, piece, player.id, allPlayers, isFirstPiece, boardCenterQ, boardCenterR),
      })
    }
  }

  if (candidateMoves.length === 0) return null

  if (isFirstPiece) {
    // Deduplicate by pieceId (keep highest-scoring placement per piece) so the
    // compact center piece doesn't crowd out all top-N slots with its rotations.
    const bestByPiece = new Map()
    for (const m of candidateMoves) {
      if (!bestByPiece.has(m.pieceId) || m.score > bestByPiece.get(m.pieceId).score) {
        bestByPiece.set(m.pieceId, m)
      }
    }
    const candidates = [...bestByPiece.values()].sort((a, b) => b.score - a.score)
    const topN = Math.max(3, Math.ceil(candidates.length * 0.5))
    return candidates[Math.floor(Math.random() * topN)]
  }

  candidateMoves.sort((a, b) => b.score - a.score)
  const topN = Math.min(5, Math.max(3, Math.ceil(candidateMoves.length * 0.05)))
  const topMoves = candidateMoves.slice(0, topN)
  return topMoves[Math.floor(Math.random() * topMoves.length)]
}

/**
 * Route to the correct AI implementation based on difficulty.
 */
export function computeAIMove(boardCells, player, allPlayers, isFirstPiece, gameOptions) {
  if (player.aiDifficulty === 'hard') {
    return getHardAIMove(boardCells, player, allPlayers, isFirstPiece, gameOptions, player.score)
  }
  return getNormalAIMove(boardCells, player, isFirstPiece, gameOptions)
}
