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
  // Convert hex to rgba with low opacity
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return {
    fill:   `rgba(${r},${g},${b},0.40)`,
    stroke: `rgba(${r},${g},${b},0.85)`,
  }
}

// Returns a near-solid fill and bright stroke for the floating free hover
function freeHoverColors(colorKey) {
  if (!colorKey || !PLAYER_COLORS[colorKey]) {
    return {
      fill:   'rgba(120,130,160,0.88)',
      stroke: 'rgba(255,255,255,0.95)',
    }
  }
  const hex = PLAYER_COLORS[colorKey].bg
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return {
    fill:   `rgba(${r},${g},${b},0.88)`,
    stroke: 'rgba(255,255,255,0.95)',
  }
}

/**
 * Compute the outline polygon of the board — the convex hull of all
 * board-cell vertex positions — as an SVG points string, offset by boardData offsets.
 * We do a simple approach: collect all unique vertex positions, compute convex hull.
 */
function getBoardOutlinePoints(boardData) {
  if (!boardData) return ''
  const { cells, offsetX, offsetY } = boardData

  // Collect all unique pixel vertices
  const pts = []
  const seen = new Set()
  for (const cell of Object.values(cells)) {
    // Get pixel vertices from getTriPointsString indirectly via getTriVertices
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

  // Convex hull (gift wrapping)
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
  onCellClick,
  onCellHover,
  onBoardLeave,
  players,
  disabled,
}) {
  const svgRef = useRef(null)

  // --- Free hover spring state ---
  const rawSvgPos     = useRef(null)
  const springRef     = useRef({ x: 0, y: 0, vx: 0, vy: 0 })
  const rafRef        = useRef(null)
  const isOnBoardRef  = useRef(false)
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
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
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

  // Legal ghost colors derived from current player's color
  const legalGhost = useMemo(() => ghostLegalColors(currentPlayerColor), [currentPlayerColor])

  // Free hover colors (near-solid, bright border)
  const floatColors = useMemo(() => freeHoverColors(currentPlayerColor), [currentPlayerColor])

  // Board outline points for the white border (Fix 6)
  const outlinePoints = useMemo(() => getBoardOutlinePoints(boardData), [boardData])

  /**
   * Compute piece triangles in SVG-space, expressed as vertex positions
   * relative to the piece's own centroid. These are translated to the
   * spring-animated cursor position at render time.
   */
  const freeHoverTriangles = useMemo(() => {
    if (!ghostCells || ghostCells.length === 0 || !boardData) return []
    const { offsetX, offsetY } = boardData

    // Piece centroid in SVG space
    let cx = 0, cy = 0
    for (const c of ghostCells) {
      const cent = triCentroid(c.q, c.r)
      cx += cent.x + offsetX
      cy += cent.y + offsetY
    }
    cx /= ghostCells.length
    cy /= ghostCells.length

    // Each triangle's vertices relative to piece centroid
    return ghostCells.map(c => {
      const verts = getTriVertices(c.q, c.r)
      return verts.map(v => ({
        x: v.x + offsetX - cx,
        y: v.y + offsetY - cy,
      }))
    })
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
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
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

  const showFreeHover = freeHoverPos && selectedPiece && !disabled && freeHoverTriangles.length > 0

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
          {/* Drop-shadow filter gives the free hover its 3D "floating" depth */}
          <filter id="freeHoverShadow" x="-60%" y="-60%" width="220%" height="220%">
            <feDropShadow dx="3" dy="5" stdDeviation="5" floodColor="rgba(0,0,0,0.75)" />
          </filter>
        </defs>

        {/* Fix 6: Bold white board outline */}
        {outlinePoints && (
          <polygon
            points={outlinePoints}
            fill="none"
            stroke="rgba(255,255,255,0.75)"
            strokeWidth={2.5}
            strokeLinejoin="round"
          />
        )}

        {cells.map(cell => {
          const { q, r, occupiedBy, id } = cell
          const isGhost = ghostCellSet.has(id)
          const occupied = occupiedBy !== null

          let fill        = EMPTY_FILL
          let stroke      = EMPTY_STROKE
          let strokeWidth = 0.5

          if (occupied && playerColorMap[occupiedBy]) {
            fill        = playerColorMap[occupiedBy].bg
            stroke      = playerColorMap[occupiedBy].dark
            strokeWidth = 0.5
          } else if (isGhost) {
            // Fix 5: legal = transparent player color; illegal = gray
            fill        = ghostIsLegal ? legalGhost.fill   : GHOST_ILLEGAL_FILL
            stroke      = ghostIsLegal ? legalGhost.stroke : GHOST_ILLEGAL_STROKE
            strokeWidth = 1.5
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

        {/*
          Free view hover — spring-follows the mouse at all times.
          Renders on top of ALL board cells (including placed pieces) with a
          3D drop-shadow so the piece always "floats" visibly above the board.
          The piece centroid tracks the cursor; it does not snap to any cell.
        */}
        {showFreeHover && (
          <g
            transform={`translate(${freeHoverPos.x},${freeHoverPos.y})`}
            filter="url(#freeHoverShadow)"
            pointerEvents="none"
          >
            {/* Depth/shadow offset layer — drawn first (behind) */}
            {freeHoverTriangles.map((tri, i) => (
              <polygon
                key={`depth-${i}`}
                points={tri.map(v => `${v.x + 2},${v.y + 3}`).join(' ')}
                fill="rgba(0,0,0,0.45)"
                stroke="none"
              />
            ))}
            {/* Main floating piece layer */}
            {freeHoverTriangles.map((tri, i) => (
              <polygon
                key={`piece-${i}`}
                points={tri.map(v => `${v.x},${v.y}`).join(' ')}
                fill={floatColors.fill}
                stroke={floatColors.stroke}
                strokeWidth={2.5}
                strokeLinejoin="round"
              />
            ))}
          </g>
        )}
      </svg>
    </div>
  )
}
