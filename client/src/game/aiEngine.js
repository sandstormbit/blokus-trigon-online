/**
 * CLIENT-SIDE AI ENGINE (Local Games)
 *
 * Mirrors the server's AI logic for pass-and-play local games.
 * Runs synchronously on the main thread — acceptable since local games
 * have only one game at a time and the board is small (≤486 cells).
 *
 * Normal: random legal move.
 * Hard:   same greedy heuristic as the server worker, but synchronous.
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

function scoreMove(boardCells, newCells, piece, playerId, allPlayers, playerScore) {
  let score = 0

  // 1. Piece size
  score += piece.size * 100

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

  // 4. Outward expansion (early game)
  if (playerScore > 55) {
    const myPlacedCells = Object.values(boardCells).filter(c => c.occupiedBy === playerId)
    if (myPlacedCells.length === 0) {
      score += newCells.length * 2
    } else {
      const centroidQ = myPlacedCells.reduce((s, c) => s + c.q, 0) / myPlacedCells.length
      const centroidR = myPlacedCells.reduce((s, c) => s + c.r, 0) / myPlacedCells.length
      for (const cell of newCells) {
        const dist = Math.sqrt((cell.q - centroidQ) ** 2 + (cell.r - centroidR) ** 2)
        score += dist * 2
      }
    }
  }

  return score
}

/**
 * Compute a Normal AI move (random legal placement).
 * Returns { pieceId, anchorQ, anchorR, rotIndex, flipped, cells } or null.
 */
export function getNormalAIMove(boardCells, player, isFirstPiece, gameOptions) {
  const allMoves = []
  for (const piece of player.pieces) {
    if (piece.placed) continue
    const placements = getValidPlacements(boardCells, piece, player.id, isFirstPiece, false, gameOptions)
    for (const p of placements) {
      const oriented = getPieceOrientation(piece, p.rotIndex, p.flipped)
      const cells = placePieceCells(oriented, p.anchorQ, p.anchorR)
      allMoves.push({ pieceId: piece.id, cells, ...p })
    }
  }
  if (allMoves.length === 0) return null
  return allMoves[Math.floor(Math.random() * allMoves.length)]
}

/**
 * Compute a Hard AI move using the greedy heuristic.
 * Returns { pieceId, anchorQ, anchorR, rotIndex, flipped, cells } or null.
 */
export function getHardAIMove(boardCells, player, allPlayers, isFirstPiece, gameOptions, playerScore) {
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
        score: scoreMove(boardCells, cells, piece, player.id, allPlayers, playerScore),
      })
    }
  }

  if (candidateMoves.length === 0) return null

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
