/**
 * BLOKUS TRIGON — ALPHA SET
 * 22 hardcoded polyiamond pieces, confirmed correct.
 *
 * Coordinate system:
 *   Cell (q, r): UP if (q+r)%2===0, DOWN if (q+r)%2===1
 *   UP  edge-neighbors: (q-1,r), (q+1,r), (q,r+1)   [always DOWN cells]
 *   DOWN edge-neighbors: (q-1,r), (q+1,r), (q,r-1)  [always UP cells]
 *
 * ── Root cause of previous bugs ──────────────────────────────────────────────
 *
 *   The old normalization shifted q and r by arbitrary amounts (minQ, minR),
 *   which changed the parity (q+r)%2 of cells whenever the shift was odd.
 *   Changing parity flips a cell from UP to DOWN or vice versa, which changes
 *   its edge neighbors — breaking edge-connectivity and distorting shapes.
 *
 *   Example: piece #5 canonical [[2,0],[1,1],[2,1],[3,1]] is edge-connected.
 *   Old normalization shifted q by minQ=1 (odd), giving [[1,0],[0,1],[1,1],[2,1]].
 *   Now (1,0) has parity 1=DOWN. DOWN(1,0) neighbors: (0,0),(2,0),(1,-1).
 *   None of the other 3 cells appear in that list → (1,0) is isolated → disconnected.
 *
 * ── Fix 1: Parity-safe normalization ─────────────────────────────────────────
 *
 *   Only shift q and r by EVEN amounts so (q+r)%2 is preserved for every cell.
 *   Compute minQ/minR then round DOWN to the nearest even number before subtracting.
 *
 * ── Fix 2: Parity-preserving hflip ───────────────────────────────────────────
 *
 *   The old hflip mirrored pixel positions then snapped to the nearest grid cell
 *   regardless of parity. For some pieces the nearest cell had the wrong parity,
 *   producing a different triangle orientation and breaking edge-connectivity.
 *
 *   Fix: when snapping a mirrored pixel position back to the grid, only consider
 *   candidate cells whose parity matches the original cell being mirrored.
 *
 * ── Rotation formula ─────────────────────────────────────────────────────────
 *
 *   60° CW rotation of cell (q, r), parity p = (q+r) % 2:
 *     nq = (q - 3r + 10 + p) / 2
 *     nr = (q + r - p) / 2
 *
 *   CRITICAL: apply N rotations in a single chain from canonical (or flipped) cells
 *   WITHOUT parity-safe-normalizing between steps. Only normalize once at the end.
 *
 * ── Verification (all 22 pieces) ─────────────────────────────────────────────
 *
 *   ✓ All canonical forms are edge-connected
 *   ✓ rot0 output exactly matches canonical form
 *   ✓ All 6 rotations are edge-connected for every piece
 *   ✓ All 6 flipped rotations are edge-connected for every piece
 *   ✓ Applying rot60cw × 6 returns every piece to its canonical form
 */

import { TRI_SIZE, TRI_H } from './boardGeometry.js'

// ─── Alpha Set ────────────────────────────────────────────────────────────────

export const ALPHA_SET = [
  // 1-triangle
  { id: 1,  size: 1,  cells: [[0,0]] },
  // 2-triangle
  { id: 2,  size: 2,  cells: [[0,0],[1,0]] },
  // 3-triangle
  { id: 3,  size: 3,  cells: [[0,0],[1,0],[2,0]] },
  // 4-triangle (3 pieces)
  { id: 4,  size: 4,  cells: [[0,0],[1,0],[2,0],[3,0]] },           // straight line
  { id: 5,  size: 4,  cells: [[2,0],[1,1],[2,1],[3,1]] },           // equilateral triangle
  { id: 6,  size: 4,  cells: [[0,0],[1,0],[2,0],[0,1]] },           // L-shape
  // 5-triangle (4 pieces)
  { id: 7,  size: 5,  cells: [[0,0],[1,0],[2,0],[3,0],[4,0]] },     // straight line
  { id: 8,  size: 5,  cells: [[2,0],[3,0],[1,1],[2,1],[3,1]] },     // equilateral + 1 on side
  { id: 9,  size: 5,  cells: [[0,0],[1,0],[2,0],[3,0],[0,1]] },     // 4-strip + branch at end
  { id: 10, size: 5,  cells: [[0,0],[1,0],[0,1],[1,1],[2,1]] },     // 2x3 block minus 1 corner
  // 6-triangle (12 pieces)
  { id: 11, size: 6,  cells: [[0,0],[1,0],[2,0],[3,0],[4,0],[5,0]] },          // straight line
  { id: 12, size: 6,  cells: [[0,0],[1,0],[2,0],[3,0],[4,0],[0,1]] },          // 5-strip + branch left
  { id: 13, size: 6,  cells: [[2,0],[1,1],[2,1],[3,1],[1,2],[0,2]] },          // equilateral + 2-strip bottom-left
  { id: 14, size: 6,  cells: [[2,0],[1,1],[2,1],[3,1],[1,2],[3,2]] },          // equilateral + 2 on bottom edge
  { id: 15, size: 6,  cells: [[0,0],[1,0],[2,0],[3,0],[4,0],[2,1]] },          // 5-strip + branch middle
  { id: 16, size: 6,  cells: [[2,0],[1,0],[3,0],[1,1],[2,1],[3,1]] },          // equilateral + 1 on two sides (star)
  { id: 17, size: 6,  cells: [[1,0],[2,0],[2,1],[3,1],[4,1],[5,1]] },          // two 3-strips at 120°
  { id: 18, size: 6,  cells: [[0,0],[1,0],[2,0],[3,0],[0,1],[1,1]] },          // 4-strip + 2 adjacent
  { id: 19, size: 6,  cells: [[0,0],[1,0],[2,0],[3,0],[0,1],[2,1]] },          // 4-strip + 2 spread
  { id: 20, size: 6,  cells: [[0,0],[1,0],[2,0],[0,1],[1,1],[2,1]] },          // 2x3 full block
  { id: 21, size: 6,  cells: [[0,0],[1,0],[2,0],[3,0],[2,1],[3,1]] },          // 4-strip + 2 at right end
  { id: 22, size: 6,  cells: [[0,0],[1,0],[2,0],[2,1],[3,1],[4,1]] },          // two 3-strips at 120° (variant)
]

// ─── Parity-safe normalization ────────────────────────────────────────────────

/**
 * Shift cells so they are near the origin while preserving parity (q+r)%2 of
 * every cell. Only shifts by even amounts — odd shifts would flip UP↔DOWN.
 *
 * Sorts result by r then q for a canonical ordering.
 */
function normalizeCells(cells) {
  let minQ = Math.min(...cells.map(c => c[0]))
  let minR = Math.min(...cells.map(c => c[1]))
  // Round down to nearest even so the shift never changes cell parities
  if (((minQ % 2) + 2) % 2 !== 0) minQ -= 1
  if (((minR % 2) + 2) % 2 !== 0) minR -= 1
  return cells
    .map(([q, r]) => [q - minQ, r - minR])
    .sort((a, b) => a[1] !== b[1] ? a[1] - b[1] : a[0] - b[0])
}

// ─── Rotation ─────────────────────────────────────────────────────────────────

/**
 * Rotate cell (q, r) exactly 60° clockwise in the triangular grid.
 * Derived from user-confirmed example: piece #16 at (2,1)(3,1)(4,1)(2,2)(3,2)(4,2)
 * → (5,1)(5,2)(6,2)(3,2)(4,2)(4,3).
 * All results are integers. Applying 6 times returns to original position.
 */
function rot60cw(q, r) {
  const p = (q + r) % 2
  return [(q - 3 * r + 10 + p) / 2, (q + r - p) / 2]
}

// ─── Parity-preserving hflip ──────────────────────────────────────────────────

/** Pixel centroid of cell (q, r), matching boardGeometry.js layout. */
function cellCenter(q, r) {
  const isUp = (q + r) % 2 === 0
  return [
    q * TRI_SIZE / 2 + TRI_SIZE / 4,
    r * TRI_H + (isUp ? TRI_H * 2 / 3 : TRI_H / 3),
  ]
}

/**
 * Snap pixel position (px, py) to the nearest grid cell whose parity matches
 * `requiredParity`. Searching a ±5-row, ±6-column window.
 *
 * Parity-constrained snapping ensures that UP cells mirror to UP cells and
 * DOWN cells mirror to DOWN cells, preserving edge-connectivity.
 */
function pixelSnapWithParity(px, py, requiredParity) {
  let best = null, bestD = Infinity
  const rEst = Math.round(py / TRI_H)
  const qEst = Math.round((px - TRI_SIZE / 4) / (TRI_SIZE / 2))
  for (let dr = -5; dr <= 5; dr++) {
    for (let dq = -6; dq <= 6; dq++) {
      const q = qEst + dq, r = rEst + dr
      if (((q + r) % 2 + 2) % 2 !== requiredParity) continue  // must match parity
      const [cx, cy] = cellCenter(q, r)
      const d = (cx - px) ** 2 + (cy - py) ** 2
      if (d < bestD) { bestD = d; best = [q, r] }
    }
  }
  return best
}

/**
 * Horizontally mirror a set of cells about their pixel centroid.
 * Each mirrored position snaps to the nearest cell of the SAME PARITY as
 * the source cell, ensuring UP↔UP and DOWN↔DOWN mapping.
 * Returns parity-safe-normalized result.
 */
function hflipCells(cells) {
  const centers = cells.map(([q, r]) => cellCenter(q, r))
  const cx = centers.reduce((s, c) => s + c[0], 0) / centers.length
  const mirrored = centers.map(([px, py], i) => {
    const parity = ((cells[i][0] + cells[i][1]) % 2 + 2) % 2
    return pixelSnapWithParity(2 * cx - px, py, parity)
  })
  return normalizeCells(mirrored)
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get the oriented cell offsets for a piece at a given rotation and flip state.
 *
 * Algorithm:
 *   1. Start from parity-safe-normalized canonical cells (or hflip of them).
 *   2. Apply rotIndex steps of rot60cw in ONE CHAIN without intermediate normalization.
 *      (Intermediate normalization would shift the rotation center, distorting shapes.)
 *   3. Parity-safe-normalize once at the end.
 *
 * @param {Object}  piece    - piece object with .cells [[q,r], ...]
 * @param {number}  rotIndex - 0–5: number of 60° CW rotations to apply
 * @param {boolean} flipped  - whether to mirror the piece first
 * @returns {{ dq: number, dr: number }[]}
 */
export function getPieceOrientation(piece, rotIndex, flipped) {
  // Step 1: canonical or flipped starting cells
  let cells = flipped
    ? hflipCells(normalizeCells(piece.cells))
    : normalizeCells(piece.cells)

  // Step 2: apply all rotations in one chain, no intermediate normalize
  const rots = ((rotIndex % 6) + 6) % 6
  for (let i = 0; i < rots; i++) {
    cells = cells.map(([q, r]) => rot60cw(q, r))
  }

  // Step 3: single parity-safe normalize at the end
  cells = normalizeCells(cells)

  return cells.map(([q, r]) => ({ dq: q, dr: r }))
}

/**
 * Apply anchor offset to oriented cells to get board coordinates.
 */
export function placePieceCells(cells, anchorQ, anchorR) {
  return cells.map(c => ({
    q: (c.dq !== undefined ? c.dq : c[0]) + anchorQ,
    r: (c.dr !== undefined ? c.dr : c[1]) + anchorR,
  }))
}

/**
 * Create a fresh set of all 22 Alpha Set pieces for one player.
 */
export function createPlayerPieces() {
  return ALPHA_SET.map(def => ({
    id: def.id,
    size: def.size,
    cells: def.cells,
    placed: false,
    rotIndex: 0,
    flipped: false,
  }))
}

// ─── Random orientation for piece display ─────────────────────────────────────

/**
 * Count unique visual orientations for a piece (accounts for symmetry).
 * Pieces with only 1 unique orientation are fully symmetric — random rotation
 * makes no visual difference, so we skip it for cleaner code.
 */
function countUniqueOrientations(piece) {
  const seen = new Set()
  const base = normalizeCells(piece.cells)
  const flippedBase = hflipCells(base)
  for (let f = 0; f < 2; f++) {
    let cells = f === 0 ? base.map(c => [...c]) : flippedBase.map(c => [...c])
    for (let r = 0; r < 6; r++) {
      const key = normalizeCells(cells).map(c => c.join(',')).join('|')
      seen.add(key)
      cells = cells.map(([q, r2]) => rot60cw(q, r2))
    }
  }
  return seen.size
}

/**
 * Pick a random {rotIndex, flipped} for a piece's starting display orientation.
 * Fully symmetric pieces (1 unique orientation) always return {rotIndex:0, flipped:false}.
 */
export function randomOrientation(piece) {
  if (countUniqueOrientations(piece) === 1) {
    return { rotIndex: 0, flipped: false }
  }
  return {
    rotIndex: Math.floor(Math.random() * 6),
    flipped: Math.random() < 0.5,
  }
}

/**
 * Create a fresh set of all 22 Alpha Set pieces for one player,
 * each starting in a random visual orientation.
 */
export function createPlayerPiecesRandom() {
  return ALPHA_SET.map(def => {
    const { rotIndex, flipped } = randomOrientation(def)
    return {
      id: def.id,
      size: def.size,
      cells: def.cells,
      placed: false,
      rotIndex,
      flipped,
    }
  })
}

/**
 * Create two full Alpha Sets for one player (Mega Colors mode).
 * Set A uses piece IDs 1–22; Set B uses IDs 101–122 to keep them unique.
 * Both sets share the same player color — placement rules treat them as one.
 */
export function createMegaColorPieces() {
  const setA = createPlayerPiecesRandom()
  const setB = createPlayerPiecesRandom().map(p => ({ ...p, id: p.id + 100 }))
  return [...setA, ...setB]
}


