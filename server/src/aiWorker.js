/**
 * HARD AI WORKER THREAD
 *
 * Runs in an isolated worker thread to avoid blocking the event loop.
 * Receives game state data via workerData, evaluates all legal moves
 * using a greedy heuristic, and posts the best move back to the parent.
 *
 * Scoring weights (heaviest to lightest):
 *   1. Piece size         — larger pieces score higher
 *   2. New corner count   — vertices the placement opens for future use
 *   3. Opponent blocking  — opponent corner vertices we overlap
 *   First move only: strong center proximity bonus overrides other scoring
 *
 * Returns top-N (3–5) moves scored, then picks randomly among them for variety.
 */

import { workerData, parentPort } from 'worker_threads'
import { getValidPlacements, isLegalPlacement } from '../game/gameLogic.js'
import { getPieceOrientation, placePieceCells } from '../game/pieces.js'
import { getCellVertexKeys } from '../game/boardGeometry.js'

const {
  boardCells,
  playerPieces,
  playerId,
  allPlayers,
  isFirstPiece,
  gameOptions: rawGameOptions,
} = workerData

// Re-hydrate requiredStartCells as a Set (serialized as array)
const gameOptions = {
  ...rawGameOptions,
  requiredStartCells: rawGameOptions.requiredStartCells
    ? new Set(rawGameOptions.requiredStartCells)
    : null,
}

// Compute board center once for first-move proximity scoring
const boardCellsArray = Object.values(boardCells)
const boardCenterQ = boardCellsArray.reduce((s, c) => s + c.q, 0) / boardCellsArray.length
const boardCenterR = boardCellsArray.reduce((s, c) => s + c.r, 0) / boardCellsArray.length

// Build vertex set for a given playerId from current board
function buildColorVertexSet(cells, pid) {
  const verts = new Set()
  for (const cell of Object.values(cells)) {
    if (cell.occupiedBy === pid) {
      for (const vk of getCellVertexKeys(cell.q, cell.r)) verts.add(vk)
    }
  }
  return verts
}

function scoreMove(newCells, piece) {
  let score = 0

  // 1. Piece size (weight: highest — 100 per triangle)
  score += piece.size * 100

  // First move: strong center proximity bonus dominates other scoring
  if (isFirstPiece) {
    const centQ = newCells.reduce((s, c) => s + c.q, 0) / newCells.length
    const centR = newCells.reduce((s, c) => s + c.r, 0) / newCells.length
    const dist = Math.sqrt((centQ - boardCenterQ) ** 2 + (centR - boardCenterR) ** 2)
    score -= dist * 50
    return score
  }

  // 2. New corner count — vertices from this placement not already in our color set
  const existingMyVerts = buildColorVertexSet(boardCells, playerId)
  const newVerts = new Set()
  for (const cell of newCells) {
    for (const vk of getCellVertexKeys(cell.q, cell.r)) newVerts.add(vk)
  }
  for (const vk of newVerts) {
    if (!existingMyVerts.has(vk)) score += 3
  }

  // 3. Opponent corner blocking — count opponent vertices our new cells overlap
  for (const other of allPlayers) {
    if (other.id === playerId) continue
    const opponentVerts = buildColorVertexSet(boardCells, other.id)
    for (const vk of newVerts) {
      if (opponentVerts.has(vk)) score += 5
    }
  }

  return score
}

// Collect all legal moves across all unplaced pieces
const candidateMoves = []

for (const piece of playerPieces) {
  if (piece.placed) continue
  const placements = getValidPlacements(boardCells, piece, playerId, isFirstPiece, false, gameOptions)
  for (const placement of placements) {
    const oriented = getPieceOrientation(piece, placement.rotIndex, placement.flipped)
    const newCells = placePieceCells(oriented, placement.anchorQ, placement.anchorR)
    candidateMoves.push({
      pieceId: piece.id,
      anchorQ: placement.anchorQ,
      anchorR: placement.anchorR,
      rotIndex: placement.rotIndex,
      flipped: placement.flipped,
      score: scoreMove(newCells, piece),
    })
  }
}

if (candidateMoves.length === 0) {
  parentPort.postMessage(null)
} else if (isFirstPiece) {
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
  const chosen = candidates[Math.floor(Math.random() * topN)]
  parentPort.postMessage({
    pieceId: chosen.pieceId,
    anchorQ: chosen.anchorQ,
    anchorR: chosen.anchorR,
    rotIndex: chosen.rotIndex,
    flipped: chosen.flipped,
  })
} else {
  // Sort descending by score, pick randomly among top moves for variety.
  // Use a wider pool for the first few moves to avoid early-game repetition.
  const piecesPlaced = playerPieces.filter(p => p.placed).length
  candidateMoves.sort((a, b) => b.score - a.score)
  const fraction = piecesPlaced < 3 ? 0.12 : 0.05
  const topN = Math.min(piecesPlaced < 3 ? 12 : 5, Math.max(3, Math.ceil(candidateMoves.length * fraction)))
  const topMoves = candidateMoves.slice(0, topN)
  const chosen = topMoves[Math.floor(Math.random() * topMoves.length)]

  parentPort.postMessage({
    pieceId: chosen.pieceId,
    anchorQ: chosen.anchorQ,
    anchorR: chosen.anchorR,
    rotIndex: chosen.rotIndex,
    flipped: chosen.flipped,
  })
}
