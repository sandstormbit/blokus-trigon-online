/**
 * Canvas-based board rendering utilities.
 * Used by shareGameUtils.js for generating the share image and GIF frames.
 */

import { getTriVertices } from '../game/boardGeometry.js'
import { PLAYER_COLORS } from '../hooks/useGameState.js'
import { getPieceOrientation } from '../game/pieces.js'

const BG           = '#0F1117'
const CELL_EMPTY_FILL   = '#1C2130'
const CELL_EMPTY_STROKE = '#2A3044'
const HEADER_BG    = '#171B26'
const HEADER_BORDER = '#2A3044'

const FONT_DISPLAY = "'Syne', sans-serif"
const FONT_BODY    = "'DM Sans', sans-serif"

// Small triangle size for piece previews
const PIECE_S = 13
const PIECE_H = PIECE_S * Math.sqrt(3) / 2

// Outer left/right padding so content doesn't feel edge-cramped
export const CANVAS_PAD = 0

// Score-section card layout constants
const CARD_GAP          = 5   // gap between player cards
const CARD_H_BASE       = 52  // card height with no unplaced pieces
const CARD_PIECE_CELL_W = 34  // px per piece cell width
const CARD_PIECE_ROW_H  = 38  // px per row of piece cells
const CARD_PIECE_LABEL_H = 18 // "Unplaced pieces:" label height
const CARD_SIDE_PAD     = 28  // left/right margin inside card

// ─── Internal helpers ─────────────────────────────────────────────────────────

function piecePreviewVertices(dq, dr) {
  const isUp = (dq + dr) % 2 === 0
  const S = PIECE_S, H = PIECE_H
  if (isUp) {
    return [
      { x: dq * S / 2,       y: (dr + 1) * H },
      { x: (dq + 2) * S / 2, y: (dr + 1) * H },
      { x: (dq + 1) * S / 2, y: dr * H },
    ]
  } else {
    return [
      { x: dq * S / 2,       y: dr * H },
      { x: (dq + 2) * S / 2, y: dr * H },
      { x: (dq + 1) * S / 2, y: (dr + 1) * H },
    ]
  }
}

// Draw the SVG CrownIcon (M2 19h20v2H2v-2zM2 7l5 5 5-6 5 6 5-5v10H2V7z)
// from the EndGameModal, centered at (cx, cy), scaled to `size` px.
function drawCrownIcon(ctx, cx, cy, size, color) {
  const scale = size / 24
  ctx.save()
  ctx.fillStyle = color
  ctx.translate(cx - size / 2, cy - size / 2)
  ctx.scale(scale, scale)
  const p = new Path2D('M2 19h20v2H2v-2zM2 7l5 5 5-6 5 6 5-5v10H2V7z')
  ctx.fill(p)
  ctx.restore()
}

function getPiecesPerCardRow(canvasW) {
  return Math.max(1, Math.floor((canvasW - CANVAS_PAD * 2 - CARD_SIDE_PAD * 2) / CARD_PIECE_CELL_W))
}

function cardHeight(unplacedCount, piecesPerRow) {
  if (unplacedCount === 0) return CARD_H_BASE
  const rows = Math.ceil(unplacedCount / piecesPerRow)
  return CARD_H_BASE + 8 + CARD_PIECE_LABEL_H + rows * CARD_PIECE_ROW_H
}

// ─── Exports ──────────────────────────────────────────────────────────────────

/** Build a {playerId → colorInfo} map from the players array. */
export function buildPlayerColorMap(players) {
  const map = {}
  for (const p of players) map[p.id] = PLAYER_COLORS[p.color]
  return map
}

/**
 * Draw all board cells on a 2D canvas context.
 * Origin (0,0) is the top-left of the board drawing area.
 */
export function drawBoardCells(ctx, boardData, cells, colorMap, scale = 1) {
  const { offsetX, offsetY } = boardData
  ctx.save()
  for (const cell of Object.values(cells)) {
    const verts = getTriVertices(cell.q, cell.r)
    const pts = verts.map(v => ({
      x: (v.x + offsetX) * scale,
      y: (v.y + offsetY) * scale,
    }))
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    ctx.lineTo(pts[1].x, pts[1].y)
    ctx.lineTo(pts[2].x, pts[2].y)
    ctx.closePath()
    if (cell.occupiedBy && colorMap[cell.occupiedBy]) {
      ctx.fillStyle = colorMap[cell.occupiedBy].bg
      ctx.strokeStyle = colorMap[cell.occupiedBy].dark
      ctx.lineWidth = Math.max(0.3, scale * 0.5)
    } else {
      ctx.fillStyle = CELL_EMPTY_FILL
      ctx.strokeStyle = CELL_EMPTY_STROKE
      ctx.lineWidth = Math.max(0.2, scale * 0.3)
    }
    ctx.fill()
    ctx.stroke()
  }
  ctx.restore()
}

/** Draw the full board frame: dark background + all cells. */
export function drawBoardFrame(ctx, boardData, cells, players, scale = 1, yOffset = 0, xOffset = 0) {
  const w = Math.ceil(boardData.pixelWidth * scale)
  const h = Math.ceil(boardData.pixelHeight * scale)
  ctx.fillStyle = BG
  ctx.fillRect(xOffset, yOffset, w, h)
  ctx.save()
  ctx.translate(xOffset, yOffset)
  drawBoardCells(ctx, boardData, cells, buildPlayerColorMap(players), scale)
  ctx.restore()
}

/**
 * Draw the winner-only header bar.
 * Matches the EndGameModal's winnerBanner style:
 *   Crown icon → winner name → "wins!" → score text.
 *   Or for ties: Crown → "It's a tie!" → tied names → score.
 *
 * Use headerH ≥ 100 for comfortable layout.
 */
export function drawHeader(ctx, width, headerH, ranked, playerCount, isTie) {
  ctx.fillStyle = HEADER_BG
  ctx.fillRect(0, 0, width, headerH)
  ctx.fillStyle = HEADER_BORDER
  ctx.fillRect(0, headerH - 1, width, 1)

  const winner = ranked[0]
  const winnerColor = playerCount === 2
    ? PLAYER_COLORS[winner.colors?.[0] ?? winner.color]?.bg ?? '#fff'
    : PLAYER_COLORS[winner.color]?.bg ?? '#fff'

  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'

  if (isTie) {
    const tiedNames = ranked.filter(p => p.score === ranked[0].score).map(p => p.name).join(' & ')
    const tieColor = '#EAB308'
    drawCrownIcon(ctx, width / 2, 14, 20, tieColor)
    ctx.fillStyle = tieColor
    ctx.font = `bold 22px ${FONT_DISPLAY}`
    ctx.fillText("It's a tie!", width / 2, 36)
    ctx.fillStyle = tieColor
    ctx.font = `600 14px ${FONT_DISPLAY}`
    ctx.fillText(tiedNames, width / 2, 62)
    ctx.fillStyle = '#9BA3B8'
    ctx.font = `11px ${FONT_BODY}`
    ctx.fillText(`${ranked[0].score} triangles remaining`, width / 2, 80)
  } else {
    drawCrownIcon(ctx, width / 2, 12, 20, winnerColor)
    ctx.fillStyle = winnerColor
    ctx.font = `bold 26px ${FONT_DISPLAY}`
    ctx.fillText(winner.name, width / 2, 36)
    ctx.fillStyle = '#9BA3B8'
    ctx.font = `14px ${FONT_BODY}`
    ctx.fillText('wins!', width / 2, 66)
    ctx.font = `11px ${FONT_BODY}`
    ctx.fillText(
      winner.score === 0
        ? 'Placed all pieces — perfect score!'
        : `${winner.score} triangle${winner.score !== 1 ? 's' : ''} remaining`,
      width / 2, 82
    )
  }
}

/**
 * Compute total height needed for the EndGameModal-style score section.
 */
export function computeScoreSectionH(ranked, playerCount, canvasW) {
  const ppr = getPiecesPerCardRow(canvasW)
  let h = 10  // top padding
  for (const entry of ranked) {
    const count = playerCount === 2
      ? entry.slots.flatMap(p => p.pieces.filter(pc => !pc.placed)).length
      : entry.pieces.filter(pc => !pc.placed).length
    h += cardHeight(count, ppr) + CARD_GAP
  }
  return h + 10  // bottom padding
}

/**
 * Draw EndGameModal-style score rows for all players.
 * Each row: crown/rank | color dot | name + meta | score | unplaced pieces below.
 */
export function drawScoreSection(ctx, ranked, playerCount, startY, canvasW) {
  const ppr = getPiecesPerCardRow(canvasW)
  const CARD_X   = CANVAS_PAD                              // card left edge
  const CARD_W   = canvasW - CANVAS_PAD * 2               // card width
  const RANK_CX  = CARD_X + CARD_SIDE_PAD + 9             // center x for rank icon/number
  const DOT_CX   = CARD_X + CARD_SIDE_PAD + 25            // center x for color dot
  const NAME_X   = CARD_X + CARD_SIDE_PAD + 36            // left edge of name text
  const SCORE_X  = CARD_X + CARD_W - CARD_SIDE_PAD        // right-align score here
  const PIECES_X = CARD_X + CARD_SIDE_PAD                 // left edge of pieces grid

  let curY = startY + 10

  for (let idx = 0; idx < ranked.length; idx++) {
    const entry = ranked[idx]
    const isWinner = entry.score === ranked[0].score

    const primaryColor = playerCount === 2
      ? PLAYER_COLORS[entry.colors?.[0] ?? entry.color]
      : PLAYER_COLORS[entry.color]

    const rawPieces = playerCount === 2
      ? entry.slots.flatMap(p => p.pieces.filter(pc => !pc.placed).map(pc => ({ ...pc, color: p.color })))
      : entry.pieces.filter(pc => !pc.placed).map(pc => ({ ...pc, color: entry.color }))
    const sortedPieces = [...rawPieces].sort((a, b) => b.size - a.size)

    const ch = cardHeight(sortedPieces.length, ppr)

    // Card background (inset by CANVAS_PAD on each side)
    ctx.fillStyle = isWinner ? '#1C2238' : '#141824'
    ctx.fillRect(CARD_X, curY, CARD_W, ch)

    // Winner: colored left-edge accent bar
    if (isWinner) {
      ctx.fillStyle = primaryColor.bg
      ctx.fillRect(CARD_X, curY, 3, ch)
    }

    // Rank icon or number (vertically centered in the top row area)
    const rowMidY = curY + CARD_H_BASE / 2
    if (isWinner) {
      drawCrownIcon(ctx, RANK_CX, rowMidY, 18, primaryColor.bg)
    } else {
      ctx.fillStyle = '#5C647A'
      ctx.font = `600 12px ${FONT_DISPLAY}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(idx + 1), RANK_CX, rowMidY)
    }

    // Color dot
    ctx.beginPath()
    ctx.arc(DOT_CX, rowMidY, 5, 0, Math.PI * 2)
    ctx.fillStyle = primaryColor.bg
    ctx.fill()

    // Player name
    ctx.fillStyle = primaryColor.bg
    ctx.font = `600 13px ${FONT_DISPLAY}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(entry.name, NAME_X, curY + 11)

    // Meta: "X of 22 placed"
    const placed = playerCount === 2
      ? entry.slots.reduce((s, p) => s + p.pieces.filter(pc => pc.placed).length, 0)
      : entry.pieces.filter(pc => pc.placed).length
    const total = playerCount === 2 ? 44 : 22
    ctx.fillStyle = '#5C647A'
    ctx.font = `10px ${FONT_BODY}`
    ctx.fillText(`${placed} of ${total} placed`, NAME_X, curY + 28)

    // Score number (right-aligned)
    ctx.fillStyle = isWinner ? primaryColor.bg : '#CBD5E1'
    ctx.font = `bold 22px ${FONT_DISPLAY}`
    ctx.textAlign = 'right'
    ctx.textBaseline = 'top'
    ctx.fillText(String(entry.score), SCORE_X, curY + 8)

    // "PTS" label below score
    ctx.fillStyle = '#5C647A'
    ctx.font = `9px ${FONT_BODY}`
    ctx.textBaseline = 'bottom'
    ctx.fillText('PTS', SCORE_X, curY + CARD_H_BASE - 6)

    // Unplaced pieces (below the top row)
    if (sortedPieces.length > 0) {
      const labY = curY + CARD_H_BASE + 8
      ctx.fillStyle = '#5C647A'
      ctx.font = `10px ${FONT_BODY}`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText('Unplaced pieces:', PIECES_X, labY)

      const gridY = labY + CARD_PIECE_LABEL_H
      for (let i = 0; i < sortedPieces.length; i++) {
        const col = i % ppr
        const row = Math.floor(i / ppr)
        const px = PIECES_X + col * CARD_PIECE_CELL_W + CARD_PIECE_CELL_W / 2
        const py = gridY + row * CARD_PIECE_ROW_H + CARD_PIECE_ROW_H / 2
        const piece = sortedPieces[i]
        const colorInfo = PLAYER_COLORS[piece.color] ?? primaryColor
        drawPiecePreview(ctx, piece, px, py, colorInfo.bg + 'CC', colorInfo.dark)
      }
    }

    curY += ch + CARD_GAP
  }
}

/**
 * Draw a single unplaced piece centered at (cx, cy).
 */
export function drawPiecePreview(ctx, piece, cx, cy, fillColor, strokeColor) {
  const cells = getPieceOrientation(piece, piece.rotIndex ?? 0, piece.flipped ?? false)

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const c of cells) {
    for (const v of piecePreviewVertices(c.dq, c.dr)) {
      if (v.x < minX) minX = v.x
      if (v.y < minY) minY = v.y
      if (v.x > maxX) maxX = v.x
      if (v.y > maxY) maxY = v.y
    }
  }

  const ox = cx - (minX + maxX) / 2
  const oy = cy - (minY + maxY) / 2

  ctx.save()
  for (const c of cells) {
    const verts = piecePreviewVertices(c.dq, c.dr)
    ctx.beginPath()
    ctx.moveTo(verts[0].x + ox, verts[0].y + oy)
    ctx.lineTo(verts[1].x + ox, verts[1].y + oy)
    ctx.lineTo(verts[2].x + ox, verts[2].y + oy)
    ctx.closePath()
    ctx.fillStyle = fillColor
    ctx.fill()
    ctx.strokeStyle = strokeColor
    ctx.lineWidth = 0.8
    ctx.stroke()
  }
  ctx.restore()
}
