/**
 * GAME LOGIC — Blokus Trigon Phase 2
 *
 * Pure rule-enforcement functions. No React, no side effects.
 * All functions take plain data and return plain data.
 *
 * Placement rules (per PRD §5.2):
 *   First piece:
 *     1. All target cells are empty
 *   Subsequent pieces:
 *     1. All target cells are empty
 *     2. New piece shares ≥1 vertex with a same-color cell
 *     3. New piece shares no edges with any same-color cell
 *     4. No single existing same-color piece may be touched at >1 vertex
 *
 * Vertex key format: "q,r" where q,r are in half-unit coordinates
 * (same as getCellVertexKeys in boardGeometry.js)
 */

import { getEdgeNeighbors, getCellVertexKeys } from './boardGeometry.js'
import { getPieceOrientation, placePieceCells, ALPHA_SET } from './pieces.js'

// ─── Vertex helpers ───────────────────────────────────────────────────────────

/**
 * Build a set of all vertex keys occupied by a given color on the board.
 */
function buildColorVertexSet(boardCells, playerId) {
  const verts = new Set()
  for (const cell of Object.values(boardCells)) {
    if (cell.occupiedBy === playerId) {
      for (const vk of getCellVertexKeys(cell.q, cell.r)) verts.add(vk)
    }
  }
  return verts
}

/**
 * Build a set of all cell IDs occupied by a given color.
 */
function buildColorCellSet(boardCells, playerId) {
  const cells = new Set()
  for (const cell of Object.values(boardCells)) {
    if (cell.occupiedBy === playerId) cells.add(cell.id)
  }
  return cells
}

/**
 * Check whether a vertex key 'a,b' is a flat-edge midpoint of any same-color placed piece.
 *
 * A flat-edge midpoint is a lattice vertex that lies strictly INTERIOR to the combined
 * flat boundary edge of the placed piece — it is a junction between flat edge segments,
 * not an endpoint corner. New pieces may not touch these points.
 *
 * All flat-edge midpoints have (a+b) % 2 === 1.
 * Corner vertices always have a+b odd but are NOT midpoints.
 *
 * Cases A–F cover horizontal flats, same-parity diagonals, and sandwiched apexes.
 * Cases G–I (new) cover the previously-missing mixed-parity diagonal flats that
 * appear in the equilateral triangle sub-shape of pieces #5 and #13.
 */
function isFlatEdgeMidpoint(a, b, boardCells, playerId) {
  // All flat-edge midpoints have a+b odd
  if ((a + b) % 2 !== 1) return false

  // ── Case A: apex of a DOWN cell sandwiched by same-color UPs ──────────────
  {
    const dc = boardCells[`${a - 1},${b - 1}`]
    if (dc && dc.occupiedBy === playerId && (a - 1 + b - 1) % 2 === 1) {
      const leftUp  = boardCells[`${a - 2},${b - 1}`]
      const rightUp = boardCells[`${a},${b - 1}`]
      if (leftUp  && leftUp.occupiedBy  === playerId && (a - 2 + b - 1) % 2 === 0 &&
          rightUp && rightUp.occupiedBy === playerId && (a     + b - 1) % 2 === 0) {
        return true
      }
    }
  }

  // ── Case A (symmetric): apex of a UP cell sandwiched by same-color DOWNs ──
  {
    const uc = boardCells[`${a - 1},${b}`]
    if (uc && uc.occupiedBy === playerId && (a - 1 + b) % 2 === 0) {
      const leftDown  = boardCells[`${a - 2},${b}`]
      const rightDown = boardCells[`${a},${b}`]
      if (leftDown  && leftDown.occupiedBy  === playerId && (a - 2 + b) % 2 === 1 &&
          rightDown && rightDown.occupiedBy === playerId && (a     + b) % 2 === 1) {
        return true
      }
    }
  }

  // ── Case B: shared TR/TL between two adjacent same-color DOWN cells ────────
  {
    const leftDown  = boardCells[`${a - 2},${b}`]
    const rightDown = boardCells[`${a},${b}`]
    if (leftDown  && leftDown.occupiedBy  === playerId && (a - 2 + b) % 2 === 1 &&
        rightDown && rightDown.occupiedBy === playerId && (a     + b) % 2 === 1) {
      const gapUp = boardCells[`${a - 1},${b}`]
      if (!(gapUp && gapUp.occupiedBy === playerId && (a - 1 + b) % 2 === 0)) {
        return true
      }
    }
  }

  // ── Case C: shared BR/BL between two adjacent same-color UP cells ──────────
  {
    const leftUp  = boardCells[`${a - 2},${b - 1}`]
    const rightUp = boardCells[`${a},${b - 1}`]
    if (leftUp  && leftUp.occupiedBy  === playerId && (a - 2 + b - 1) % 2 === 0 &&
        rightUp && rightUp.occupiedBy === playerId && (a     + b - 1) % 2 === 0) {
      const gapDown = boardCells[`${a - 1},${b - 1}`]
      if (!(gapDown && gapDown.occupiedBy === playerId && (a - 1 + b - 1) % 2 === 1)) {
        return true
      }
    }
  }

  // ── Case D: '/' diagonal — two same-color UP cells ────────────────────────
  {
    const upLeft  = boardCells[`${a - 1},${b}`]
    const upRight = boardCells[`${a},${b - 1}`]
    if (upLeft  && upLeft.occupiedBy  === playerId && (a - 1 + b) % 2 === 0 &&
        upRight && upRight.occupiedBy === playerId && (a     + b - 1) % 2 === 0) {
      const gapDown = boardCells[`${a - 1},${b - 1}`]
      if (!(gapDown && gapDown.occupiedBy === playerId && (a - 1 + b - 1) % 2 === 1)) {
        return true
      }
    }
  }

  // ── Case D (symmetric): '/' diagonal — two same-color DOWN cells ──────────
  {
    const downLeft  = boardCells[`${a - 2},${b}`]
    const downRight = boardCells[`${a - 1},${b - 1}`]
    if (downLeft  && downLeft.occupiedBy  === playerId && (a - 2 + b) % 2 === 1 &&
        downRight && downRight.occupiedBy === playerId && (a - 1 + b - 1) % 2 === 1) {
      const gapUp = boardCells[`${a - 1},${b}`]
      if (!(gapUp && gapUp.occupiedBy === playerId && (a - 1 + b) % 2 === 0)) {
        return true
      }
    }
  }

  // ── Case E: '\' diagonal — two same-color UP cells ────────────────────────
  {
    const upLeft  = boardCells[`${a - 2},${b - 1}`]
    const upRight = boardCells[`${a - 1},${b}`]
    if (upLeft  && upLeft.occupiedBy  === playerId && (a - 2 + b - 1) % 2 === 0 &&
        upRight && upRight.occupiedBy === playerId && (a - 1 + b) % 2 === 0) {
      const gapDown = boardCells[`${a - 1},${b - 1}`]
      if (!(gapDown && gapDown.occupiedBy === playerId && (a - 1 + b - 1) % 2 === 1)) {
        return true
      }
    }
  }

  // ── Case E (symmetric): '\' diagonal — two same-color DOWN cells ──────────
  {
    const downLeft  = boardCells[`${a - 1},${b - 1}`]
    const downRight = boardCells[`${a},${b}`]
    if (downLeft  && downLeft.occupiedBy  === playerId && (a - 1 + b - 1) % 2 === 1 &&
        downRight && downRight.occupiedBy === playerId && (a     + b) % 2 === 1) {
      const gapUp = boardCells[`${a - 1},${b}`]
      if (!(gapUp && gapUp.occupiedBy === playerId && (a - 1 + b) % 2 === 0)) {
        return true
      }
    }
  }

  // ── Case F: horizontal flat edge — DOWN-left TR meets UP-right BL ─────────
  {
    const downLeft = boardCells[`${a - 2},${b}`]
    const upRight  = boardCells[`${a},${b - 1}`]
    if (downLeft && downLeft.occupiedBy === playerId && (a - 2 + b) % 2 === 1 &&
        upRight  && upRight.occupiedBy  === playerId && (a     + b - 1) % 2 === 0) {
      return true
    }
  }

  // ── Case F (symmetric): horizontal flat edge — UP-left BR meets DOWN-right TL ─
  {
    const upLeft    = boardCells[`${a - 2},${b - 1}`]
    const downRight = boardCells[`${a},${b}`]
    if (upLeft    && upLeft.occupiedBy    === playerId && (a - 2 + b - 1) % 2 === 0 &&
        downRight && downRight.occupiedBy === playerId && (a     + b) % 2 === 1) {
      return true
    }
  }

  // ── NEW Case G: mixed UP-DOWN \ diagonal (UP \ right + DOWN \ left) ───────
  // vk = BR of UP(a-2,b-1) == TL of DOWN(a,b)
  // Gap filler that would turn this into a corner: UP(a-1,b)
  {
    const upCell   = boardCells[`${a - 2},${b - 1}`]
    const downCell = boardCells[`${a},${b}`]
    if (upCell   && upCell.occupiedBy   === playerId && (a - 2 + b - 1) % 2 === 0 &&
        downCell && downCell.occupiedBy === playerId && (a     + b) % 2 === 1) {
      const gapUp = boardCells[`${a - 1},${b}`]
      if (!(gapUp && gapUp.occupiedBy === playerId && (a - 1 + b) % 2 === 0)) {
        return true
      }
    }
  }

  // ── NEW Case H: mixed UP-DOWN / diagonal (UP / left + DOWN / right) ───────
  // vk = BL of UP(a,b-1) == TR of DOWN(a-2,b)
  // Gap filler that would turn this into a corner: UP(a-1,b)
  {
    const upCell   = boardCells[`${a},${b - 1}`]
    const downCell = boardCells[`${a - 2},${b}`]
    if (upCell   && upCell.occupiedBy   === playerId && (a     + b - 1) % 2 === 0 &&
        downCell && downCell.occupiedBy === playerId && (a - 2 + b) % 2 === 1) {
      const gapUp = boardCells[`${a - 1},${b}`]
      if (!(gapUp && gapUp.occupiedBy === playerId && (a - 1 + b) % 2 === 0)) {
        return true
      }
    }
  }

  // ── NEW Case I: mixed DOWN-UP diagonal (apex-shared) ──────────────────────
  // vk = apex of DOWN(a-1,b-1) == apex of UP(a-1,b)
  // Gap filler that would turn this into a corner: DOWN(a,b)
  {
    const downCell = boardCells[`${a - 1},${b - 1}`]
    const upCell   = boardCells[`${a - 1},${b}`]
    if (downCell && downCell.occupiedBy === playerId && (a - 1 + b - 1) % 2 === 1 &&
        upCell   && upCell.occupiedBy   === playerId && (a - 1 + b) % 2 === 0) {
      const gapDown = boardCells[`${a},${b}`]
      if (!(gapDown && gapDown.occupiedBy === playerId && (a + b) % 2 === 1)) {
        return true
      }
    }
  }

  return false
}

// ─── Core placement validator ─────────────────────────────────────────────────

/**
 * Check whether placing `newCells` (array of {q,r}) is legal for `playerId`.
 *
 * gameOptions = { gameModes: {}, requiredStartCells: Set|null }
 * Returns { legal: boolean, reason: string }
 */
export function isLegalPlacement(boardCells, newCells, playerId, isFirstPiece, gameOptions = {}) {
  const { gameModes = {}, requiredStartCells = null } = gameOptions

  // Rule 1: all target cells must be empty and on the board
  for (const { q, r } of newCells) {
    const cell = boardCells[`${q},${r}`]
    if (!cell) return { legal: false, reason: 'off_board' }
    if (cell.occupiedBy !== null) return { legal: false, reason: 'occupied' }
  }

  // Required Start: first piece must cover one of the 6 marked triangles.
  if (isFirstPiece && gameModes.requiredStart && requiredStartCells) {
    const coversRequired = newCells.some(({ q, r }) => requiredStartCells.has(`${q},${r}`))
    if (!coversRequired) return { legal: false, reason: 'required_start' }
  }

  // Zen Mode: skip all contact/adjacency rules — any empty cell is valid.
  if (gameModes.zenMode) return { legal: true, reason: 'ok' }

  if (isFirstPiece) return { legal: true, reason: 'ok' }

  // Build lookup sets for this color
  const colorCellSet   = buildColorCellSet(boardCells, playerId)
  const colorVertexSet = buildColorVertexSet(boardCells, playerId)

  // Rule 3: new piece must not share any edge with a same-color cell
  for (const { q, r } of newCells) {
    for (const neighbor of getEdgeNeighbors(q, r)) {
      if (colorCellSet.has(`${neighbor.q},${neighbor.r}`)) {
        return { legal: false, reason: 'edge_touch' }
      }
    }
  }

  // Rule 2: new piece must share ≥1 vertex with a same-color cell
  const newVertexKeys = new Set()
  for (const { q, r } of newCells) {
    for (const vk of getCellVertexKeys(q, r)) newVertexKeys.add(vk)
  }
  const hasVertexTouch = [...newVertexKeys].some(vk => colorVertexSet.has(vk))
  if (!hasVertexTouch) return { legal: false, reason: 'no_vertex_touch' }

  // Build per-piece data once — used by both Rule 2b and Rule 4.
  // Checking flat-edge midpoints must be done per piece; cells from two
  // different pieces can accidentally match a midpoint pattern even though
  // no flat edge actually spans them (e.g. three pieces meeting at one vertex).
  const existingPieces = getColorPieces(boardCells, playerId)
  const existingPieceData = existingPieces.map(pieceCells => {
    const cellsMap = {}
    const vertexSet = new Set()
    for (const { q, r } of pieceCells) {
      cellsMap[`${q},${r}`] = { q, r, occupiedBy: playerId }
      for (const vk of getCellVertexKeys(q, r)) vertexSet.add(vk)
    }
    return { cellsMap, vertexSet }
  })

  // Rule 2b: flat-edge midpoint constraint.
  const NEW_PIECE_PID = 999
  const newPieceCellsMap = {}
  for (const { q, r } of newCells) {
    newPieceCellsMap[`${q},${r}`] = { q, r, occupiedBy: NEW_PIECE_PID }
  }

  for (const vk of newVertexKeys) {
    if (!colorVertexSet.has(vk)) continue
    const [a, b] = vk.split(',').map(Number)
    for (const { cellsMap } of existingPieceData) {
      if (isFlatEdgeMidpoint(a, b, cellsMap, playerId)) {
        return { legal: false, reason: 'flat_edge_midpoint_touch' }
      }
    }
    if (isFlatEdgeMidpoint(a, b, newPieceCellsMap, NEW_PIECE_PID)) {
      return { legal: false, reason: 'flat_edge_midpoint_touch' }
    }
  }

  // Rule 4: no single existing same-color piece may be touched at >1 vertex
  for (const { vertexSet: pieceVertexSet } of existingPieceData) {
    const touchCount = [...newVertexKeys].filter(vk => pieceVertexSet.has(vk)).length
    if (touchCount > 1) return { legal: false, reason: 'multi_vertex_touch' }
  }

  return { legal: true, reason: 'ok' }
}

/**
 * Find all connected components (placed pieces) of a given color on the board.
 * Returns array of arrays of {q, r} cells.
 */
function getColorPieces(boardCells, playerId) {
  const remaining = new Set(
    Object.values(boardCells)
      .filter(c => c.occupiedBy === playerId)
      .map(c => c.id)
  )
  const pieces = []

  while (remaining.size > 0) {
    const startId = [...remaining][0]
    const startCell = boardCells[startId]
    const component = []
    const queue = [startCell]
    remaining.delete(startId)

    while (queue.length) {
      const cell = queue.shift()
      component.push({ q: cell.q, r: cell.r })
      for (const n of getEdgeNeighbors(cell.q, cell.r)) {
        const nId = `${n.q},${n.r}`
        if (remaining.has(nId)) {
          remaining.delete(nId)
          queue.push(boardCells[nId])
        }
      }
    }
    pieces.push(component)
  }

  return pieces
}

// ─── Valid placement finder ───────────────────────────────────────────────────

/**
 * Compute the parity-aware anchor for a hover cell and piece cells.
 */
function computeAnchor(hoverQ, hoverR, pieceCells) {
  const hoverParity = ((hoverQ + hoverR) % 2 + 2) % 2
  const matchCell = pieceCells.find(c => ((c.dq + c.dr) % 2 + 2) % 2 === hoverParity)
  const anchor = matchCell || pieceCells[0]
  return { anchorQ: hoverQ - anchor.dq, anchorR: hoverR - anchor.dr }
}

/**
 * Find all legal placements for one piece orientation on the board.
 */
function findOrientationPlacements(boardCells, orientedCells, playerId, isFirstPiece, gameOptions = {}) {
  const tried = new Set()
  const valid = []

  for (const boardCell of Object.values(boardCells)) {
    if (boardCell.occupiedBy !== null) continue

    const { anchorQ, anchorR } = computeAnchor(boardCell.q, boardCell.r, orientedCells)
    const key = `${anchorQ},${anchorR}`
    if (tried.has(key)) continue
    tried.add(key)

    const placed = placePieceCells(orientedCells, anchorQ, anchorR)
    const { legal } = isLegalPlacement(boardCells, placed, playerId, isFirstPiece, gameOptions)
    if (legal) valid.push({ anchorQ, anchorR })
  }

  return valid
}

/**
 * Get all valid placements for a piece (all orientations) for a player.
 */
export function getValidPlacements(boardCells, piece, playerId, isFirstPiece, findFirst = false, gameOptions = {}) {
  const results = []

  for (let flipped = 0; flipped < 2; flipped++) {
    for (let rotIndex = 0; rotIndex < 6; rotIndex++) {
      const oriented = getPieceOrientation(piece, rotIndex, flipped === 1)
      const placements = findOrientationPlacements(boardCells, oriented, playerId, isFirstPiece, gameOptions)

      for (const { anchorQ, anchorR } of placements) {
        results.push({ rotIndex, flipped: flipped === 1, anchorQ, anchorR })
        if (findFirst) return results
      }
    }
  }

  return results
}

/**
 * Check whether a player has any legal move remaining.
 */
export function hasAnyLegalMove(boardCells, pieces, playerId, isFirstPiece, gameOptions = {}) {
  for (const piece of pieces) {
    if (piece.placed) continue
    const found = getValidPlacements(boardCells, piece, playerId, isFirstPiece, true, gameOptions)
    if (found.length > 0) return true
  }
  return false
}

/**
 * Check whether the game is over.
 */
export function checkGameOver(players, boardCells, skippedPlayerIds, gameOptions = {}) {
  for (const player of players) {
    if (skippedPlayerIds.has(player.id)) continue
    const isFirst = !player.pieces.some(p => p.placed)
    if (hasAnyLegalMove(boardCells, player.pieces, player.id, isFirst, gameOptions)) return false
  }
  return true
}