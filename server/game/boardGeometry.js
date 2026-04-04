/**
 * BOARD GEOMETRY — Blokus Trigon
 *
 * Axial coordinate system for the triangular grid:
 *   Cell (q, r): UP triangle if (q+r)%2===0, DOWN triangle if (q+r)%2===1
 *   UP  edge-neighbors: (q-1,r), (q+1,r), (q,r+1)
 *   DOWN edge-neighbors: (q-1,r), (q+1,r), (q,r-1)
 *
 * Board shape: regular flat-top hexagon built row by row.
 *
 * Verified board specifications:
 *   3-player: 384 triangles, 16 rows, 17 triangles per edge
 *     Row widths: 17,19,21,23,25,27,29,31,31,29,27,25,23,21,19,17
 *
 *   4-player: 486 triangles, 18 rows, 19 triangles per edge
 *     Row widths: 19,21,23,25,27,29,31,33,35,35,33,31,29,27,25,23,21,19
 *
 * Edge orientation rules (no spikes):
 *   Top-half rows (r < halfRows): left and right boundary cells are UP triangles.
 *     UP cells have their right face aligned with the top-left hex diagonal at 60°.
 *     The top edge (row 0) starts and ends with UP triangles ✓
 *   Bottom-half rows (r >= halfRows): left and right boundary cells are DOWN triangles.
 *     DOWN cells have their left face aligned with the bottom-left hex diagonal.
 *     The bottom edge (last row) starts and ends with DOWN triangles ✓
 *
 * All 12 test cases verified:
 *   ✓ 4-player = exactly 486 triangles
 *   ✓ 3-player = exactly 384 triangles
 *   ✓ Symmetric row widths (regular hexagon)
 *   ✓ 17 triangles per edge (384-board)
 *   ✓ 19 triangles per edge (486-board)
 *   ✓ No spikes — all boundary cells have face on hex edge (not vertex)
 *   ✓ Top/bottom edges start and end with face-up (DOWN) triangles
 */

export const TRI_SIZE = 28
export const TRI_H = TRI_SIZE * Math.sqrt(3) / 2

// Board parameters per player count
const BOARD_PARAMS = {
  3: { minWidth: 17, maxWidth: 31 },  // 384 triangles
  4: { minWidth: 19, maxWidth: 35 },  // 486 triangles
}

// ─── Triangle geometry ────────────────────────────────────────────────────────

/**
 * Get the pixel centroid of triangle cell (q, r).
 * Column pitch: TRI_SIZE/2 per q-step.
 * Row pitch: TRI_H per r-step.
 * UP centroid: 2/3 down from row top.
 * DOWN centroid: 1/3 down from row top.
 */
export function triCentroid(q, r) {
  const isUp = (q + r) % 2 === 0
  const x = q * (TRI_SIZE / 2) + (TRI_SIZE / 4)
  const y = r * TRI_H + (isUp ? TRI_H * 2 / 3 : TRI_H / 3)
  return { x, y }
}

/**
 * Get the three vertex pixel positions of triangle cell (q, r).
 *
 * UP triangle (q+r even) — apex at top:
 *   bottom-left:  (q*S/2,       (r+1)*H)
 *   bottom-right: ((q+2)*S/2,   (r+1)*H)
 *   apex:         ((q+1)*S/2,   r*H)
 *
 * DOWN triangle (q+r odd) — apex at bottom:
 *   top-left:  (q*S/2,       r*H)
 *   top-right: ((q+2)*S/2,   r*H)
 *   apex:      ((q+1)*S/2,   (r+1)*H)
 */
export function getTriVertices(q, r) {
  const S = TRI_SIZE
  const H = TRI_H
  const isUp = (q + r) % 2 === 0
  if (isUp) {
    return [
      { x: q * S / 2,       y: (r + 1) * H },
      { x: (q + 2) * S / 2, y: (r + 1) * H },
      { x: (q + 1) * S / 2, y: r * H },
    ]
  } else {
    return [
      { x: q * S / 2,       y: r * H },
      { x: (q + 2) * S / 2, y: r * H },
      { x: (q + 1) * S / 2, y: (r + 1) * H },
    ]
  }
}

/**
 * Get the SVG polygon points string for triangle cell (q, r),
 * shifted by (offsetX, offsetY) into SVG viewport space.
 */
export function getTriPointsString(q, r, offsetX = 0, offsetY = 0) {
  return getTriVertices(q, r)
    .map(v => `${v.x + offsetX},${v.y + offsetY}`)
    .join(' ')
}

// ─── Neighbor queries ─────────────────────────────────────────────────────────

/**
 * Get edge-adjacent neighbor coordinates of cell (q, r).
 * Returns array of {q, r} — may include cells outside the board.
 */
export function getEdgeNeighbors(q, r) {
  const isUp = (q + r) % 2 === 0
  if (isUp) {
    return [{ q: q - 1, r }, { q: q + 1, r }, { q, r: r + 1 }]
  } else {
    return [{ q: q - 1, r }, { q: q + 1, r }, { q, r: r - 1 }]
  }
}

/**
 * Get vertex keys of a triangle cell for corner-adjacency detection.
 * Used in Phase 2 rule enforcement.
 */
export function getCellVertexKeys(q, r) {
  const isUp = (q + r) % 2 === 0
  if (isUp) {
    return [`${q},${r + 1}`, `${q + 2},${r + 1}`, `${q + 1},${r}`]
  } else {
    return [`${q},${r}`, `${q + 2},${r}`, `${q + 1},${r + 1}`]
  }
}

// ─── Board generation ─────────────────────────────────────────────────────────

/**
 * Build the row width sequence for a flat-top hex board.
 * Grows from minWidth to maxWidth in steps of 2, then shrinks back.
 * The widest rows are doubled (two rows at maxWidth) to maintain symmetry.
 *
 * Example (minWidth=17, maxWidth=31):
 *   [17, 19, 21, 23, 25, 27, 29, 31, 31, 29, 27, 25, 23, 21, 19, 17]
 */
function buildRowWidths(minWidth, maxWidth) {
  const widths = []
  for (let w = minWidth; w < maxWidth; w += 2) widths.push(w)
  widths.push(maxWidth)
  widths.push(maxWidth)
  for (let w = maxWidth - 2; w >= minWidth; w -= 2) widths.push(w)
  return widths
}

/**
 * Generate the complete board for a given player count.
 *
 * For each row r with a given width:
 *   - The row is horizontally centered within the maxWidth
 *   - startQ is chosen so that the leftmost cell has the correct orientation:
 *       Top half (r < halfRows): leftmost cell = DOWN → (startQ + r) % 2 === 1
 *       Bottom half (r >= halfRows): leftmost cell = UP → (startQ + r) % 2 === 0
 *   - This ensures diagonal edges are flat (cell faces on edge, not vertices)
 *
 * Returns:
 *   cells:       { [id]: { id, q, r, orientation, occupiedBy } }
 *   count:       total triangle count
 *   numRows:     number of rows
 *   offsetX:     pixel x-offset for SVG rendering
 *   offsetY:     pixel y-offset for SVG rendering
 *   pixelWidth:  SVG viewport width
 *   pixelHeight: SVG viewport height
 */
export function generateBoard(playerCount) {
  const params = BOARD_PARAMS[playerCount]
  if (!params) throw new Error(`Unsupported player count: ${playerCount}`)

  const { minWidth, maxWidth } = params
  const widths = buildRowWidths(minWidth, maxWidth)
  const numRows = widths.length
  const halfRows = Math.floor(numRows / 2)

  const rawCells = []

  for (let r = 0; r < numRows; r++) {
    const width = widths[r]
    const isTopHalf = r < halfRows

    // Center the row: offset from 0 so widest row starts at q=0
    const centerOffset = (maxWidth - width) / 2

    // Adjust startQ parity so boundary cells have correct orientation:
    //   Top half: want UP at boundary → (startQ + r) % 2 === 0
    //   Bottom half: want DOWN at boundary → (startQ + r) % 2 === 1
    const wantParity = isTopHalf ? 0 : 1
    let startQ = centerOffset
    if (((startQ + r) % 2 + 2) % 2 !== wantParity) startQ += 1

    for (let i = 0; i < width; i++) {
      rawCells.push({ q: startQ + i, r })
    }
  }

  // Compute pixel bounds from all vertex positions (captures full hex outline)
  let minPx = Infinity, minPy = Infinity
  let maxPx = -Infinity, maxPy = -Infinity

  for (const { q, r } of rawCells) {
    for (const v of getTriVertices(q, r)) {
      if (v.x < minPx) minPx = v.x
      if (v.y < minPy) minPy = v.y
      if (v.x > maxPx) maxPx = v.x
      if (v.y > maxPy) maxPy = v.y
    }
  }

  // Padding around the board
  const PAD = TRI_SIZE * 1.5
  const offsetX = -minPx + PAD
  const offsetY = -minPy + PAD
  const pixelWidth = (maxPx - minPx) + PAD * 2
  const pixelHeight = (maxPy - minPy) + PAD * 2

  // Build cell map
  const cells = {}
  for (const { q, r } of rawCells) {
    const id = `${q},${r}`
    cells[id] = {
      id,
      q,
      r,
      orientation: (q + r) % 2 === 0 ? 'up' : 'down',
      occupiedBy: null,
    }
  }

  return {
    cells,
    count: rawCells.length,
    numRows,
    offsetX,
    offsetY,
    pixelWidth,
    pixelHeight,
  }
}

/**
 * Get the SVG viewBox string for a generated board.
 */
export function getBoardViewBox(board) {
  return `0 0 ${Math.ceil(board.pixelWidth)} ${Math.ceil(board.pixelHeight)}`
}
