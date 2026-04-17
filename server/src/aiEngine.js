/**
 * AI ENGINE (Server-Side)
 *
 * Provides Normal and Hard AI move generators.
 *
 * Normal AI: O(n) random selection from all valid placements.
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

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WORKER_PATH = path.join(__dirname, 'aiWorker.js')

const HARD_AI_TIMEOUT_MS = 5000

/**
 * Normal AI: pick a uniformly random legal move.
 * Runs synchronously in O(n) over all placements.
 * Returns null if no moves exist.
 */
export function getNormalAIMove(boardCells, player, isFirstPiece, gameOptions) {
  const allMoves = []
  for (const piece of player.pieces) {
    if (piece.placed) continue
    const placements = getValidPlacements(boardCells, piece, player.id, isFirstPiece, false, gameOptions)
    for (const p of placements) {
      allMoves.push({ pieceId: piece.id, ...p })
    }
  }
  if (allMoves.length === 0) return null
  return allMoves[Math.floor(Math.random() * allMoves.length)]
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
