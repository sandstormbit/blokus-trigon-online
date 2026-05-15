/**
 * Share / export utilities for Blokus Trigon end-game results.
 *
 * generateShareImage  — static PNG: winner header + board + EndGameModal-style score rows
 * generateReplayGIF   — animated GIF replaying every piece placement (same layout)
 */

import { generateBoard } from '../game/boardGeometry.js'
import {
  drawBoardFrame,
  drawBoardCells,
  buildPlayerColorMap,
  drawHeader,
  computeScoreSectionH,
  drawScoreSection,
  CANVAS_PAD,
} from './boardCanvas.js'
import {
  encodeGIF,
  buildColorLookup,
  quantizeImageData,
} from './gifEncoder.js'

// ─── GIF fixed palette (16 colors = power of 2 ✓) ────────────────────────────
// All canvas drawing uses ONLY these colors so solid fills quantize exactly.
const GIF_PALETTE = [
  [15,  17,  23],   // 0  #0F1117  bg base
  [28,  33,  48],   // 1  #1C2130  empty board cell
  [23,  27,  38],   // 2  #171B26  header bg
  [42,  48,  68],   // 3  #2A3044  border / separator
  [59,  130, 246],  // 4  #3B82F6  blue player
  [239, 68,  68],   // 5  #EF4444  red player
  [34,  197, 94],   // 6  #22C55E  green player
  [234, 179, 8],    // 7  #EAB308  yellow player
  [29,  78,  216],  // 8  #1D4ED8  blue dark
  [185, 28,  28],   // 9  #B91C1C  red dark
  [21,  128, 61],   // 10 #15803D  green dark
  [161, 98,  7],    // 11 #A16207  yellow dark
  [255, 255, 255],  // 12 #FFFFFF  white text
  [155, 163, 184],  // 13 #9BA3B8  secondary text
  [92,  100, 122],  // 14 #5C647A  muted text
  [0,   0,   0],    // 15 #000000  pure black / padding
]

// ─── Shared helpers ───────────────────────────────────────────────────────────

function createCanvas(w, h) {
  const canvas = document.createElement('canvas')
  canvas.width  = Math.round(w)
  canvas.height = Math.round(h)
  return canvas
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 1000)
}

async function shareOrDownload(blob, filename, mimeType) {
  if (navigator.share && navigator.canShare) {
    try {
      const file = new File([blob], filename, { type: mimeType })
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Blokus Trigon' })
        return
      }
    } catch (e) {
      if (e.name === 'AbortError') return
      // Share failed — fall through to download
    }
  }
  downloadBlob(blob, filename)
}

// ─── Share image (PNG) ────────────────────────────────────────────────────────

/**
 * Generate and share/download a PNG of the final result.
 *
 * Layout:
 *   TOP    — winner name + crown (EndGameModal winnerBanner style)
 *   MIDDLE — the final board
 *   BOTTOM — EndGameModal-style score rows (name · score · unplaced pieces)
 *
 * @param {object}   boardData
 * @param {object[]} players
 * @param {object[]} ranked    — sorted entries from EndGameModal
 * @param {number}   playerCount
 * @param {boolean}  isTie
 */
export async function generateShareImage(boardData, players, ranked, playerCount, isTie) {
  const PNG_BOARD_W = 400
  const HEADER_H = 100  // winner crown + name + score text
  const scale = PNG_BOARD_W / boardData.pixelWidth

  const boardW = Math.round(boardData.pixelWidth  * scale)
  const boardH = Math.round(boardData.pixelHeight * scale)
  const canvasW = boardW + CANVAS_PAD * 2

  const scoreSectionH = computeScoreSectionH(ranked, playerCount, canvasW)
  const canvasH = HEADER_H + boardH + scoreSectionH

  const canvas = createCanvas(canvasW, canvasH)
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = '#0F1117'
  ctx.fillRect(0, 0, canvasW, canvasH)

  drawHeader(ctx, canvasW, HEADER_H, ranked, playerCount, isTie)
  drawBoardFrame(ctx, boardData, boardData.cells, players, scale, HEADER_H, CANVAS_PAD)
  drawScoreSection(ctx, ranked, playerCount, HEADER_H + boardH, canvasW)

  // Branding
  ctx.fillStyle = '#5C647A'
  ctx.font = `10px 'DM Sans', sans-serif`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'bottom'
  ctx.fillText('Blokus Trigon', canvasW - CANVAS_PAD - 4, canvasH - 6)

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
  await shareOrDownload(blob, 'blokus-trigon-result.png', 'image/png')
}

// ─── Replay GIF ───────────────────────────────────────────────────────────────

/**
 * Generate and download an animated GIF replaying all piece placements.
 * Total duration ≈ 10 seconds; final frame held 3× longer.
 * Header: winner crown + name. Bottom: score rows (static, final state).
 *
 * @param {object[]} moveHistory  — [{playerId, cells:[{q,r}]}]
 * @param {object[]} players
 * @param {object[]} ranked
 * @param {number}   playerCount
 * @param {boolean}  isTie
 * @param {number}   boardPlayerCount — 4 for 2p/4p, 3 for 3p
 * @param {function} onProgress   — optional callback(fraction 0..1)
 */
export async function generateReplayGIF(moveHistory, players, ranked, playerCount, isTie, boardPlayerCount, onProgress) {
  const emptyBoard = generateBoard(boardPlayerCount)

  const GIF_BOARD_W = 400
  const HEADER_H = 100
  const scale = GIF_BOARD_W / emptyBoard.pixelWidth

  const boardW = Math.round(emptyBoard.pixelWidth  * scale)
  const boardH = Math.round(emptyBoard.pixelHeight * scale)
  const canvasW = boardW + CANVAS_PAD * 2

  const scoreSectionH = computeScoreSectionH(ranked, playerCount, canvasW)
  const canvasH = HEADER_H + boardH + scoreSectionH

  const N = moveHistory.length
  const normalDelay = N > 0 ? Math.max(6, Math.round(700 / (N + 1))) : 100
  const finalDelay  = 300

  const canvas = createCanvas(canvasW, canvasH)
  const ctx = canvas.getContext('2d')

  const colorMap = buildPlayerColorMap(players)
  const quantize = buildColorLookup(GIF_PALETTE)
  const frames = []
  const delays = []

  const cellsSnapshot = {}
  for (const [id, cell] of Object.entries(emptyBoard.cells)) {
    cellsSnapshot[id] = { ...cell }
  }

  const captureFrame = (delay) => {
    ctx.fillStyle = '#0F1117'
    ctx.fillRect(0, 0, canvasW, canvasH)

    drawHeader(ctx, canvasW, HEADER_H, ranked, playerCount, isTie)

    ctx.fillStyle = '#0F1117'
    ctx.fillRect(0, HEADER_H, canvasW, boardH)
    ctx.save()
    ctx.translate(CANVAS_PAD, HEADER_H)
    drawBoardCells(ctx, emptyBoard, cellsSnapshot, colorMap, scale)
    ctx.restore()

    drawScoreSection(ctx, ranked, playerCount, HEADER_H + boardH, canvasW)

    const imgData = ctx.getImageData(0, 0, canvasW, canvasH)
    frames.push(quantizeImageData(imgData.data, canvasW, canvasH, quantize))
    delays.push(delay)
  }

  captureFrame(normalDelay)

  for (let i = 0; i < moveHistory.length; i++) {
    const { playerId, cells } = moveHistory[i]
    for (const { q, r } of cells) {
      const id = `${q},${r}`
      if (cellsSnapshot[id]) cellsSnapshot[id] = { ...cellsSnapshot[id], occupiedBy: playerId }
    }

    const isLast = i === moveHistory.length - 1
    captureFrame(isLast ? finalDelay : normalDelay)

    if (onProgress) onProgress((i + 1) / moveHistory.length)
    if (i % 10 === 9) await new Promise(r => setTimeout(r, 0))
  }

  if (moveHistory.length === 0) captureFrame(finalDelay)

  const gifBytes = encodeGIF(frames, canvasW, canvasH, GIF_PALETTE, delays)
  const blob = new Blob([gifBytes], { type: 'image/gif' })
  await shareOrDownload(blob, 'blokus-trigon-replay.gif', 'image/gif')
}
