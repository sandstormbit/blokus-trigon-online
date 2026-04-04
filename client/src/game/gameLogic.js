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
 *     4. No single existing same-color piece is touched at >1 vertex
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
 * Three cases cover all configurations:
 *
 * Case A (DOWN apex sandwiched): vk is the apex of a same-color DOWN cell, AND there are
 *   same-color UP cells on BOTH its left and right at the same row. The DOWN's apex sits
 *   at the bottom boundary between the two UPs — the midpoint of the flat bottom edge.
 *   Symmetric sub-case: vk is the apex of a same-color UP cell with same-color DOWNs on both
 *   sides (midpoint of flat top edge).
 *
 * Case B (adjacent DOWNs, no gap UP): vk is the shared TR/TL vertex between two same-color
 *   DOWN cells at the same row, with no same-color UP cell filling the gap between them.
 *   This vertex is the midpoint of the combined flat top edge.
 *
 * Case C (adjacent UPs, no gap DOWN): symmetric of Case B — vk is the shared BR/BL vertex
 *   between two same-color UP cells, with no same-color DOWN filling the gap.
 *   This vertex is the midpoint of the combined flat bottom edge.
 *
 * All flat-edge midpoints have (a+b) % 2 === 1 (they are apexes or shared junction vertices).
 * Corner vertices (outer endpoints of flat edges) always have a+b ODD but are NOT midpoints.
 */
function isFlatEdgeMidpoint(a, b, boardCells, playerId) {
  // All flat-edge midpoints have a+b odd
  if ((a + b) % 2 !== 1) return false

  // ── Case A: apex of a DOWN cell sandwiched by same-color UPs ──────────────
  // vk = apex of DOWN(a-1, b-1). The DOWN apex is at the bottom level.
  // Forbidden if same-color UPs exist on both its left (a-2,b-1) and right (a,b-1).
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
  // vk = apex of UP(a-1, b). The UP apex is at the top level.
  // Forbidden if same-color DOWNs exist on both its left (a-2,b) and right (a,b).
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
  // vk = TR of DOWN(a-2, b) = TL of DOWN(a, b), with no same-color UP(a-1, b) filling the gap.
  // The gap UP, if present, would make this vertex its own apex (a corner) instead.
  // Only forbidden if both DOWN cells belong to the same piece — if they are from two different
  // pieces, vk is a legitimate corner of each piece and may be touched.
  {
    const leftDown  = boardCells[`${a - 2},${b}`]
    const rightDown = boardCells[`${a},${b}`]
    if (leftDown  && leftDown.occupiedBy  === playerId && (a - 2 + b) % 2 === 1 &&
        rightDown && rightDown.occupiedBy === playerId && (a     + b) % 2 === 1) {
      const gapUp = boardCells[`${a - 1},${b}`]
      if (!(gapUp && gapUp.occupiedBy === playerId && (a - 1 + b) % 2 === 0)) {
        if (samePiece(boardCells, playerId, `${a - 2},${b}`, `${a},${b}`)) return true
      }
    }
  }

  // ── Case C: shared BR/BL between two adjacent same-color UP cells ──────────
  // vk = BR of UP(a-2, b-1) = BL of UP(a, b-1), with no same-color DOWN(a-1, b-1) in the gap.
  // Only forbidden when both UP cells belong to the same piece.
  {
    const leftUp  = boardCells[`${a - 2},${b - 1}`]
    const rightUp = boardCells[`${a},${b - 1}`]
    if (leftUp  && leftUp.occupiedBy  === playerId && (a - 2 + b - 1) % 2 === 0 &&
        rightUp && rightUp.occupiedBy === playerId && (a     + b - 1) % 2 === 0) {
      const gapDown = boardCells[`${a - 1},${b - 1}`]
      if (!(gapDown && gapDown.occupiedBy === playerId && (a - 1 + b - 1) % 2 === 1)) {
        if (samePiece(boardCells, playerId, `${a - 2},${b - 1}`, `${a},${b - 1}`)) return true
      }
    }
  }

  // ── Case D: '/' diagonal — two same-color UP cells sharing a TR/BL diagonal vertex ──
  // vk is the shared vertex between UP(a-1, b) (its TR) and UP(a, b-1) (its BL),
  // with no same-color DOWN(a-1, b-1) bridging them (which would make vk a corner, not midpoint).
  // Only forbidden when both UP cells belong to the same piece.
  {
    const upLeft  = boardCells[`${a - 1},${b}`]
    const upRight = boardCells[`${a},${b - 1}`]
    if (upLeft  && upLeft.occupiedBy  === playerId && (a - 1 + b) % 2 === 0 &&
        upRight && upRight.occupiedBy === playerId && (a     + b - 1) % 2 === 0) {
      const gapDown = boardCells[`${a - 1},${b - 1}`]
      if (!(gapDown && gapDown.occupiedBy === playerId && (a - 1 + b - 1) % 2 === 1)) {
        if (samePiece(boardCells, playerId, `${a - 1},${b}`, `${a},${b - 1}`)) return true
      }
    }
  }

  // ── Case D (symmetric): '/' diagonal — two same-color DOWN cells ───────────
  // vk is the shared vertex between DOWN(a-2, b) (its BR) and DOWN(a-1, b-1) (its TL),
  // with no same-color UP(a-1, b) bridging them.
  // Only forbidden when both DOWN cells belong to the same piece.
  {
    const downLeft  = boardCells[`${a - 2},${b}`]
    const downRight = boardCells[`${a - 1},${b - 1}`]
    if (downLeft  && downLeft.occupiedBy  === playerId && (a - 2 + b) % 2 === 1 &&
        downRight && downRight.occupiedBy === playerId && (a - 1 + b - 1) % 2 === 1) {
      const gapUp = boardCells[`${a - 1},${b}`]
      if (!(gapUp && gapUp.occupiedBy === playerId && (a - 1 + b) % 2 === 0)) {
        if (samePiece(boardCells, playerId, `${a - 2},${b}`, `${a - 1},${b - 1}`)) return true
      }
    }
  }

  // ── Case E: '\' diagonal — two same-color UP cells sharing a TL/BR diagonal vertex ──
  // vk is the shared vertex between UP(a-2, b-1) (its TR) and UP(a-1, b) (its BL... wait:
  // UP(a-1, b) TL vertex = vk, UP(a-2, b-1) TR vertex = vk.
  // No bridging DOWN(a-2, b) should be present.
  // Only forbidden when both UP cells belong to the same piece.
  {
    const upLeft  = boardCells[`${a - 2},${b - 1}`]
    const upRight = boardCells[`${a - 1},${b}`]
    if (upLeft  && upLeft.occupiedBy  === playerId && (a - 2 + b - 1) % 2 === 0 &&
        upRight && upRight.occupiedBy === playerId && (a - 1 + b) % 2 === 0) {
      const gapDown = boardCells[`${a - 2},${b}`]
      if (!(gapDown && gapDown.occupiedBy === playerId && (a - 2 + b) % 2 === 1)) {
        if (samePiece(boardCells, playerId, `${a - 2},${b - 1}`, `${a - 1},${b}`)) return true
      }
    }
  }

  // ── Case E (symmetric): '\' diagonal — two same-color DOWN cells ───────────
  // vk is the shared vertex between DOWN(a-1, b-1) (its TR) and DOWN(a, b) (its TL),
  // with no same-color UP(a-1, b) bridging them.
  // Only forbidden when both DOWN cells belong to the same piece.
  {
    const downLeft  = boardCells[`${a - 1},${b - 1}`]
    const downRight = boardCells[`${a},${b}`]
    if (downLeft  && downLeft.occupiedBy  === playerId && (a - 1 + b - 1) % 2 === 1 &&
        downRight && downRight.occupiedBy === playerId && (a     + b) % 2 === 1) {
      const gapUp = boardCells[`${a - 1},${b}`]
      if (!(gapUp && gapUp.occupiedBy === playerId && (a - 1 + b) % 2 === 0)) {
        if (samePiece(boardCells, playerId, `${a - 1},${b - 1}`, `${a},${b}`)) return true
      }
    }
  }

  return false
}

/**
 * Return true if the two cells at key1 and key2 are connected by a path of
 * same-color edge-adjacent cells (i.e. they belong to the same placed piece).
 */
function samePiece(boardCells, playerId, key1, key2) {
  if (!boardCells[key1] || boardCells[key1].occupiedBy !== playerId) return false
  if (!boardCells[key2] || boardCells[key2].occupiedBy !== playerId) return false

  const visited = new Set([key1])
  const queue = [key1]

  while (queue.length) {
    const k = queue.shift()
    if (k === key2) return true
    const [q, r] = k.split(',').map(Number)
    for (const n of getEdgeNeighbors(q, r)) {
      const nk = `${n.q},${n.r}`
      if (!visited.has(nk) && boardCells[nk] && boardCells[nk].occupiedBy === playerId) {
        visited.add(nk)
        queue.push(nk)
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
  // This applies even in Zen Mode — it is a placement origin constraint, not a
  // contact-rule. Both modes can be active simultaneously.
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

  // Rule 2b: flat-edge midpoint constraint.
  //
  // A contact vertex is illegal if it is a flat-edge midpoint of the existing board's
  // same-color cells OR a midpoint of the new piece's own cells. We check each separately:
  //   (a) board piece forms the midpoint → new piece touches an interior point of existing piece
  //   (b) new piece forms the midpoint → new piece's interior point touches an existing piece
  //
  // Importantly, we do NOT combine board + new piece into one map. A single corner-to-corner
  // contact between two whole pieces can look like an interior midpoint in the combined shape,
  // but it is a legitimate corner of each individual piece and must be allowed.
  const NEW_PIECE_PID = 999
  const newPieceCellsMap = {}
  for (const { q, r } of newCells) {
    newPieceCellsMap[`${q},${r}`] = { q, r, occupiedBy: NEW_PIECE_PID }
  }

  for (const vk of newVertexKeys) {
    if (!colorVertexSet.has(vk)) continue // only contact vertices can be illegal midpoints
    const [a, b] = vk.split(',').map(Number)
    if (isFlatEdgeMidpoint(a, b, boardCells, playerId)) {
      return { legal: false, reason: 'flat_edge_midpoint_touch' }
    }
    if (isFlatEdgeMidpoint(a, b, newPieceCellsMap, NEW_PIECE_PID)) {
      return { legal: false, reason: 'flat_edge_midpoint_touch' }
    }
  }

  // Rule 4: no single existing same-color piece may be touched at >1 vertex
  const existingPieces = getColorPieces(boardCells, playerId)
  for (const pieceCells of existingPieces) {
    const pieceVertexSet = new Set()
    for (const { q, r } of pieceCells) {
      for (const vk of getCellVertexKeys(q, r)) pieceVertexSet.add(vk)
    }
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
 * (Mirrors parityAwareAnchor in useGameState.js — kept here for use in
 *  getValidPlacements without depending on the React hook.)
 */
function computeAnchor(hoverQ, hoverR, pieceCells) {
  const hoverParity = ((hoverQ + hoverR) % 2 + 2) % 2
  const matchCell = pieceCells.find(c => ((c.dq + c.dr) % 2 + 2) % 2 === hoverParity)
  const anchor = matchCell || pieceCells[0]
  return { anchorQ: hoverQ - anchor.dq, anchorR: hoverR - anchor.dr }
}

/**
 * Find all legal placements for one piece orientation on the board.
 * Returns array of { anchorQ, anchorR } for each valid position.
 *
 * Strategy: try every board cell as the "hover target" (using parity-aware
 * anchor), deduplicate by anchor position, validate each unique placement.
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
 * Returns array of { rotIndex, flipped, anchorQ, anchorR }.
 *
 * Stops early once at least one is found if `findFirst` is true (for hasAnyLegalMove).
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
 * Game ends when all non-skipped players have no legal moves.
 */
export function checkGameOver(players, boardCells, skippedPlayerIds, gameOptions = {}) {
  for (const player of players) {
    if (skippedPlayerIds.has(player.id)) continue
    const isFirst = !player.pieces.some(p => p.placed)
    if (hasAnyLegalMove(boardCells, player.pieces, player.id, isFirst, gameOptions)) return false
  }
  return true
}
