import React, { useMemo, useCallback, useRef, useState, useEffect } from 'react'
import {
  getTriPointsString,
  getBoardViewBox,
  triCentroid,
  TRI_SIZE,
  TRI_H,
  getTriVertices,
} from '../game/boardGeometry.js'
import { PLAYER_COLORS } from '../hooks/useGameState.js'
import styles from './Board.module.css'

// Illegal ghost: gray so it's never confused with any player's color
const GHOST_ILLEGAL_FILL   = 'rgba(100, 110, 130, 0.45)'
const GHOST_ILLEGAL_STROKE = 'rgba(160, 170, 190, 0.85)'
const EMPTY_FILL   = 'rgba(255,255,255,0.03)'
const EMPTY_STROKE = 'rgba(255,255,255,0.09)'

// Spring physics constants for free hover (matches framer-motion inspiration)
const SPRING_MASS       = 0.1
const SPRING_DAMPING    = 10
const SPRING_STIFFNESS  = 131
const SPRING_SUB_STEPS  = 5   // sub-steps per frame for stable integration

// Returns a transparent fill and stroke for the current player's color
function ghostLegalColors(colorKey) {
  if (!colorKey || !PLAYER_COLORS[colorKey]) {
    return {
      fill:   'rgba(120,130,160,0.45)',
      stroke: 'rgba(200,210,230,0.85)',
    }
  }
  const hex = PLAYER_COLORS[colorKey].bg
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return {
    fill:   `rgba(${r},${g},${b},0.40)`,
    stroke: `rgba(${r},${g},${b},0.85)`,
  }
}

/**
 * For a set of triangles (cells), collect every edge that borders a cell
 * NOT in the set — i.e. the outer perimeter of the piece.
 *
 * Edge-neighbor mapping (verified against boardGeometry.js coordinate system):
 *   UP  (q+r even):  v[0]-v[2] ↔ (q-1,r),  v[1]-v[2] ↔ (q+1,r),  v[0]-v[1] ↔ (q,r+1)
 *   DOWN (q+r odd):  v[0]-v[2] ↔ (q-1,r),  v[1]-v[2] ↔ (q+1,r),  v[0]-v[1] ↔ (q,r-1)
 *
 * Returns array of {x1,y1,x2,y2} in SVG viewport space (with offsetX/Y applied).
 */
function getOuterEdges(cells, cellKeySet, offsetX = 0, offsetY = 0) {
  const edges = []
  for (const { q, r } of cells) {
    const isUp = (q + r) % 2 === 0
    const verts = getTriVertices(q, r)
    const v = verts.map(vert => ({ x: vert.x + offsetX, y: vert.y + offsetY }))

    const neighborEdges = isUp
      ? [
          { nq: q - 1, nr: r,     va: v[0], vb: v[2] },
          { nq: q + 1, nr: r,     va: v[1], vb: v[2] },
          { nq: q,     nr: r + 1, va: v[0], vb: v[1] },
        ]
      : [
          { nq: q - 1, nr: r,     va: v[0], vb: v[2] },
          { nq: q + 1, nr: r,     va: v[1], vb: v[2] },
          { nq: q,     nr: r - 1, va: v[0], vb: v[1] },
        ]

    for (const { nq, nr, va, vb } of neighborEdges) {
      if (!cellKeySet.has(`${nq},${nr}`)) {
        edges.push({ x1: va.x, y1: va.y, x2: vb.x, y2: vb.y })
      }
    }
  }
  return edges
}

/**
 * BFS over all board cells to find connected components of same-player cells.
 * Returns an array of { edges, stroke } ready to render as outer-border lines.
 */
function getPlacedPieceOutlines(boardData, playerColorMap) {
  if (!boardData) return []
  const { cells, offsetX, offsetY } = boardData
  const visited = new Set()
  const result = []

  for (const cell of Object.values(cells)) {
    if (!cell.occupiedBy || visited.has(cell.id)) continue

    const playerId = cell.occupiedBy
    const component = []
    const queue = [cell]
    visited.add(cell.id)

    while (queue.length > 0) {
      const curr = queue.shift()
      component.push(curr)
      const isUp = (curr.q + curr.r) % 2 === 0
      const neighbors = isUp
        ? [{ q: curr.q - 1, r: curr.r }, { q: curr.q + 1, r: curr.r }, { q: curr.q, r: curr.r + 1 }]
        : [{ q: curr.q - 1, r: curr.r }, { q: curr.q + 1, r: curr.r }, { q: curr.q, r: curr.r - 1 }]
      for (const n of neighbors) {
        const nid = `${n.q},${n.r}`
        if (!visited.has(nid) && cells[nid] && cells[nid].occupiedBy === playerId) {
          visited.add(nid)
          queue.push(cells[nid])
        }
      }
    }

    const componentSet = new Set(component.map(c => c.id))
    const edges = getOuterEdges(component, componentSet, offsetX, offsetY)
    const colors = playerColorMap[playerId]
    result.push({ edges, stroke: colors ? colors.dark : 'rgba(0,0,0,0.6)' })
  }

  return result
}

/**
 * Compute the outline polygon of the board — the convex hull of all
 * board-cell vertex positions — as an SVG points string, offset by boardData offsets.
 */
function getBoardOutlinePoints(boardData) {
  if (!boardData) return ''
  const { cells, offsetX, offsetY } = boardData

  const pts = []
  const seen = new Set()
  for (const cell of Object.values(cells)) {
    const S = TRI_SIZE
    const H = TRI_H
    const { q, r } = cell
    const isUp = (q + r) % 2 === 0
    let verts
    if (isUp) {
      verts = [
        { x: q * S / 2 + offsetX,       y: (r + 1) * H + offsetY },
        { x: (q + 2) * S / 2 + offsetX, y: (r + 1) * H + offsetY },
        { x: (q + 1) * S / 2 + offsetX, y: r * H + offsetY },
      ]
    } else {
      verts = [
        { x: q * S / 2 + offsetX,       y: r * H + offsetY },
        { x: (q + 2) * S / 2 + offsetX, y: r * H + offsetY },
        { x: (q + 1) * S / 2 + offsetX, y: (r + 1) * H + offsetY },
      ]
    }
    for (const v of verts) {
      const key = `${Math.round(v.x * 10)},${Math.round(v.y * 10)}`
      if (!seen.has(key)) { seen.add(key); pts.push(v) }
    }
  }

  if (pts.length < 3) return ''
  const hull = []
  let start = pts.reduce((a, b) => (b.x < a.x || (b.x === a.x && b.y < a.y) ? b : a))
  let current = start
  do {
    hull.push(current)
    let next = pts[0] === current ? pts[1] : pts[0]
    for (const p of pts) {
      if (p === current) continue
      const cross = (next.x - current.x) * (p.y - current.y) -
                    (next.y - current.y) * (p.x - current.x)
      if (cross < 0) next = p
    }
    current = next
  } while (current !== start && hull.length <= pts.length)

  return hull.map(p => `${p.x},${p.y}`).join(' ')
}

export default function Board({
  boardData,
  selectedPiece,
  hoverCell,
  ghostCells,
  ghostIsLegal,
  currentPlayerColor,
  freeHoverEnabled,
  onCellClick,
  onCellHover,
  onBoardLeave,
  players,
  disabled,
  requiredStartCells,  // Set<"q,r"> | null — Required Start mode markers
}) {
  const svgRef = useRef(null)

  // --- Free hover spring state ---
  const rawSvgPos    = useRef(null)
  const springRef    = useRef({ x: 0, y: 0, vx: 0, vy: 0 })
  const rafRef       = useRef(null)
  const isOnBoardRef = useRef(false)
  const [freeHoverPos, setFreeHoverPos] = useState(null)

  // Spring animation loop — runs via requestAnimationFrame while mouse is on board
  const runSpring = useCallback(() => {
    if (!isOnBoardRef.current) return
    const raw = rawSvgPos.current
    if (raw) {
      const sp = springRef.current
      const dt = (1 / 60) / SPRING_SUB_STEPS
      for (let i = 0; i < SPRING_SUB_STEPS; i++) {
        const ax = ((raw.x - sp.x) * SPRING_STIFFNESS - sp.vx * SPRING_DAMPING) / SPRING_MASS
        const ay = ((raw.y - sp.y) * SPRING_STIFFNESS - sp.vy * SPRING_DAMPING) / SPRING_MASS
        sp.vx += ax * dt
        sp.vy += ay * dt
        sp.x  += sp.vx * dt
        sp.y  += sp.vy * dt
      }
      setFreeHoverPos({ x: sp.x, y: sp.y })
    }
    rafRef.current = requestAnimationFrame(runSpring)
  }, [])

  // Cancel RAF on unmount
  useEffect(() => {
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [])

  const viewBox = useMemo(() => {
    if (!boardData) return '0 0 100 100'
    return getBoardViewBox(boardData)
  }, [boardData])

  const ghostCellSet = useMemo(() => {
    if (!ghostCells || ghostCells.length === 0) return new Set()
    return new Set(ghostCells.map(c => `${c.q},${c.r}`))
  }, [ghostCells])

  const playerColorMap = useMemo(() => {
    const map = {}
    if (players) players.forEach(p => { map[p.id] = PLAYER_COLORS[p.color] })
    return map
  }, [players])

  const legalGhost = useMemo(() => ghostLegalColors(currentPlayerColor), [currentPlayerColor])

  // Player's primary hex color used for the free hover outline + glow
  const playerColorHex = useMemo(() => {
    if (!currentPlayerColor || !PLAYER_COLORS[currentPlayerColor]) return '#ffffff'
    return PLAYER_COLORS[currentPlayerColor].bg
  }, [currentPlayerColor])

  const outlinePoints = useMemo(() => getBoardOutlinePoints(boardData), [boardData])

  /**
   * Outer edges of each placed piece (connected component), expressed in SVG
   * viewport space. Recomputed only when the board changes (on placement).
   */
  const placedPieceOutlines = useMemo(
    () => getPlacedPieceOutlines(boardData, playerColorMap),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [boardData, playerColorMap]
  )

  /**
   * Outer border edges of the current ghost piece, expressed relative to the
   * piece centroid. Translated to spring mouse position at render time.
   */
  const freeHoverEdges = useMemo(() => {
    if (!ghostCells || ghostCells.length === 0 || !boardData) return []
    const { offsetX, offsetY } = boardData

    // Piece centroid in SVG viewport space
    let cx = 0, cy = 0
    for (const c of ghostCells) {
      const cent = triCentroid(c.q, c.r)
      cx += cent.x + offsetX
      cy += cent.y + offsetY
    }
    cx /= ghostCells.length
    cy /= ghostCells.length

    const cellKeySet = new Set(ghostCells.map(c => `${c.q},${c.r}`))
    const edges = getOuterEdges(ghostCells, cellKeySet, offsetX, offsetY)

    // Translate to centroid-relative coordinates
    return edges.map(e => ({
      x1: e.x1 - cx, y1: e.y1 - cy,
      x2: e.x2 - cx, y2: e.y2 - cy,
    }))
  }, [ghostCells, boardData])

  const svgPosToCell = useCallback((clientX, clientY) => {
    const svg = svgRef.current
    if (!svg || !boardData) return null

    const pt = svg.createSVGPoint()
    pt.x = clientX
    pt.y = clientY
    const svgPt = pt.matrixTransform(svg.getScreenCTM().inverse())

    const gridX = svgPt.x - boardData.offsetX
    const gridY = svgPt.y - boardData.offsetY
    const rEst = gridY / TRI_H
    const qEst = (gridX - TRI_SIZE / 4) / (TRI_SIZE / 2)

    let best = null
    let bestDist = Infinity

    for (let dr = -2; dr <= 2; dr++) {
      for (let dq = -3; dq <= 3; dq++) {
        const q = Math.round(qEst) + dq
        const r = Math.round(rEst) + dr
        const id = `${q},${r}`
        if (!boardData.cells[id]) continue

        const { x, y } = triCentroid(q, r)
        const svgCx = x + boardData.offsetX
        const svgCy = y + boardData.offsetY
        const dist = (svgPt.x - svgCx) ** 2 + (svgPt.y - svgCy) ** 2
        if (dist < bestDist) { bestDist = dist; best = { q, r } }
      }
    }
    return best
  }, [boardData])

  const handleMouseMove = useCallback((e) => {
    // Always track raw SVG position for free hover spring
    const svg = svgRef.current
    if (svg) {
      const pt = svg.createSVGPoint()
      pt.x = e.clientX
      pt.y = e.clientY
      const svgPt = pt.matrixTransform(svg.getScreenCTM().inverse())
      rawSvgPos.current = { x: svgPt.x, y: svgPt.y }

      if (!isOnBoardRef.current) {
        // Teleport spring to current position on entry (no initial lag)
        isOnBoardRef.current = true
        springRef.current = { x: svgPt.x, y: svgPt.y, vx: 0, vy: 0 }
        rafRef.current = requestAnimationFrame(runSpring)
      }
    }

    if (disabled || !selectedPiece) return
    const cell = svgPosToCell(e.clientX, e.clientY)
    if (cell) onCellHover(cell)
  }, [disabled, selectedPiece, svgPosToCell, onCellHover, runSpring])

  const handleBoardLeave = useCallback(() => {
    isOnBoardRef.current = false
    rawSvgPos.current = null
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    setFreeHoverPos(null)
    onBoardLeave()
  }, [onBoardLeave])

  const handleClick = useCallback((e) => {
    if (disabled || !selectedPiece || !hoverCell || !ghostIsLegal) return
    onCellClick(hoverCell.q, hoverCell.r)
  }, [disabled, selectedPiece, hoverCell, ghostIsLegal, onCellClick])

  if (!boardData) return null

  const cells = Object.values(boardData.cells)
  const { offsetX, offsetY } = boardData

  const showFreeHover = freeHoverEnabled && freeHoverPos && selectedPiece && !disabled && freeHoverEdges.length > 0

  return (
    <div className={styles.boardWrapper}>
      <svg
        ref={svgRef}
        className={`${styles.svg} ${selectedPiece && !disabled ? styles.svgActive : ''}`}
        viewBox={viewBox}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleBoardLeave}
        onClick={handleClick}
        style={{ maxWidth: '100%', maxHeight: '100%' }}
      >
        <defs>
          {/* Glow in the player's color for the free hover outline */}
          <filter id="freeHoverGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor={playerColorHex} floodOpacity="0.8" />
          </filter>
        </defs>

        {/* Bold white board outline */}
        {outlinePoints && (
          <polygon
            points={outlinePoints}
            fill="none"
            stroke="rgba(255,255,255,0.75)"
            strokeWidth={2.5}
            strokeLinejoin="round"
          />
        )}

        {/* Cell fills */}
        {cells.map(cell => {
          const { q, r, occupiedBy, id } = cell
          const isGhost = ghostCellSet.has(id)
          const occupied = occupiedBy !== null

          let fill        = EMPTY_FILL
          let stroke      = EMPTY_STROKE
          let strokeWidth = 0.5

          const isRequiredStart = requiredStartCells && requiredStartCells.has(id)

          if (occupied && playerColorMap[occupiedBy]) {
            fill        = playerColorMap[occupiedBy].bg
            // Keep a very subtle inner-cell line so adjacent same-color triangles
            // are faintly distinguishable; the outer border handles the piece edge.
            stroke      = 'rgba(0,0,0,0.18)'
            strokeWidth = 0.4
          } else if (isGhost) {
            fill        = ghostIsLegal ? legalGhost.fill   : GHOST_ILLEGAL_FILL
            stroke      = ghostIsLegal ? legalGhost.stroke : GHOST_ILLEGAL_STROKE
            strokeWidth = 1.5
          } else if (isRequiredStart) {
            fill        = 'rgba(243,232,238,0.45)'
            stroke      = 'rgba(243,232,238,0.55)'
            strokeWidth = 0.9
          }

          return (
            <polygon
              key={id}
              points={getTriPointsString(q, r, offsetX, offsetY)}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
            />
          )
        })}

        {/* Required Start markers — gold dot + ring at centroid of each marked cell */}
        {requiredStartCells && cells
          .filter(cell => !cell.occupiedBy && requiredStartCells.has(cell.id))
          .map(cell => {
            const cent = triCentroid(cell.q, cell.r)
            const cx = cent.x + offsetX
            const cy = cent.y + offsetY
            return (
              <g key={`rs-${cell.id}`} pointerEvents="none">
                <circle cx={cx} cy={cy} r={5.5} fill="none" stroke="#f3e8ee" strokeWidth={0.8} />
                <circle cx={cx} cy={cy} r={3}   fill="#f3e8ee" />
              </g>
            )
          })
        }

        {/*
          Placed piece outer borders — one outline per connected piece.
          Thin line in a darker shade of the player's color traces only the
          exterior edges (edges not shared with another same-player cell).
        */}
        {placedPieceOutlines.map((piece, pi) =>
          piece.edges.map((edge, ei) => (
            <line
              key={`po-${pi}-${ei}`}
              x1={edge.x1} y1={edge.y1}
              x2={edge.x2} y2={edge.y2}
              stroke={piece.stroke}
              strokeWidth={1.5}
              strokeLinecap="round"
            />
          ))
        )}

        {/*
          Free view hover — spring-follows the mouse.
          Shows only the outer border of the piece as a thin white outline,
          always fully visible on top of everything including placed pieces.
        */}
        {showFreeHover && (
          <g
            transform={`translate(${freeHoverPos.x},${freeHoverPos.y})`}
            filter="url(#freeHoverGlow)"
            pointerEvents="none"
          >
            {freeHoverEdges.map((edge, i) => (
              <line
                key={i}
                x1={edge.x1} y1={edge.y1}
                x2={edge.x2} y2={edge.y2}
                stroke={playerColorHex}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeOpacity={0.95}
              />
            ))}
          </g>
        )}
      </svg>
    </div>
  )
}
