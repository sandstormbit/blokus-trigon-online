/**
 * AI ENGINE (Server-Side)
 *
 * Provides Normal and Hard AI move generators.
 *
 * Normal AI: first 11 moves prefer size 5/6 pieces; first move aims for board center.
 * Hard AI:   Heuristic evaluation in a worker thread (non-blocking).
 *            Falls back to Normal AI if the 5-second budget is exceeded.
 *
 * Both return a promise resolving to:
 *   { pieceId, anchorQ, anchorR, rotIndex, flipped } | null (no legal move)
 */

import { Worker } from 'worker_threads'
import { fileURLToPath } from 'url'
import path from 'path'
import { getValidPlacements } from '../game/gameLogic.js'
import { getPieceOrientation, placePieceCells } from '../game/pieces.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WORKER_PATH = path.join(__dirname, 'aiWorker.js')

const HARD_AI_TIMEOUT_MS = 5000

/**
 * Normal AI: for the first 11 moves prefer size-5/6 pieces; first move picks randomly
 * from the top-half of unique piece shapes sorted by center proximity.
 * Returns null if no moves exist.
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
        moves.push({ pieceId: piece.id, piece, ...p })
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
      const oriented = getPieceOrientation(move.piece, move.rotIndex, move.flipped)
      const cells = placePieceCells(oriented, move.anchorQ, move.anchorR)
      const cQ = cells.reduce((s, c) => s + c.q, 0) / cells.length
      const cR = cells.reduce((s, c) => s + c.r, 0) / cells.length
      const dist = Math.sqrt((cQ - centerQ) ** 2 + (cR - centerR) ** 2)
      if (!bestByPiece.has(move.pieceId) || dist < bestByPiece.get(move.pieceId).dist) {
        bestByPiece.set(move.pieceId, { ...move, dist })
      }
    }
    const candidates = [...bestByPiece.values()].sort((a, b) => a.dist - b.dist)
    const topN = Math.max(3, Math.ceil(candidates.length * 0.5))
    const chosen = candidates[Math.floor(Math.random() * topN)]
    return { pieceId: chosen.pieceId, anchorQ: chosen.anchorQ, anchorR: chosen.anchorR, rotIndex: chosen.rotIndex, flipped: chosen.flipped }
  }

  const chosen = allMoves[Math.floor(Math.random() * allMoves.length)]
  return { pieceId: chosen.pieceId, anchorQ: chosen.anchorQ, anchorR: chosen.anchorR, rotIndex: chosen.rotIndex, flipped: chosen.flipped }
}

/**
 * Hard AI: evaluate moves with heuristic scoring in a worker thread.
 * Times out after HARD_AI_TIMEOUT_MS and falls back to a normal random move.
 * Returns a promise resolving to a move or null.
 */
export function getHardAIMove(boardCells, player, allPlayers, isFirstPiece, gameOptions, playerScore) {
  return new Promise((resolve) => {
    let settled = false

    const fallback = () => {
      if (settled) return
      settled = true
      // Fall back to Normal AI move if worker times out or errors
      resolve(getNormalAIMove(boardCells, player, isFirstPiece, gameOptions))
    }

    let worker
    try {
      worker = new Worker(WORKER_PATH, {
        workerData: {
          boardCells,
          playerPieces: player.pieces,
          playerId: player.id,
          allPlayers: allPlayers.map(p => ({ id: p.id })),
          isFirstPiece,
          gameOptions: {
            ...gameOptions,
            requiredStartCells: gameOptions.requiredStartCells
              ? [...gameOptions.requiredStartCells]
              : null,
          },
          playerScore,
        },
      })
    } catch {
      fallback()
      return
    }

    const timeout = setTimeout(() => {
      worker.terminate()
      fallback()
    }, HARD_AI_TIMEOUT_MS)

    worker.on('message', (move) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      worker.terminate()
      // Worker returns null if no moves; fall back to normal random in that case too
      resolve(move || null)
    })

    worker.on('error', () => {
      clearTimeout(timeout)
      fallback()
    })
  })
}
