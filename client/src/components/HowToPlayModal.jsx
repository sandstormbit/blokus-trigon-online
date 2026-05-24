import React, { useState, useEffect, useCallback, useRef } from 'react'
import styles from './HowToPlayModal.module.css'
import { ALPHA_SET } from '../game/pieces.js'
import { playSound } from '../utils/sounds.js'

function triggerBounce(el) {
  if (!el) return
  el.classList.remove('btn-bounce')
  void el.offsetWidth
  el.classList.add('btn-bounce')
}

// Compute polygon strings + bounding box for a piece given triangle side S.
function piecePolys(cells, S) {
  const H = S * Math.sqrt(3) / 2
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  const polys = cells.map(([q, r]) => {
    const isUp = ((q + r) % 2 + 2) % 2 === 0
    const verts = isUp
      ? [[q * S / 2, (r + 1) * H], [(q + 2) * S / 2, (r + 1) * H], [(q + 1) * S / 2, r * H]]
      : [[q * S / 2, r * H],       [(q + 2) * S / 2, r * H],       [(q + 1) * S / 2, (r + 1) * H]]
    verts.forEach(([x, y]) => {
      if (x < minX) minX = x; if (x > maxX) maxX = x
      if (y < minY) minY = y; if (y > maxY) maxY = y
    })
    return verts.map(p => p.join(',')).join(' ')
  })
  return { polys, minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY }
}

function PieceSVG({ piece, S, cx, cy, fill, stroke, strokeWidth, animation, animDelay }) {
  const { polys, minX, maxX, minY, maxY } = piecePolys(piece.cells, S)
  const dx = cx - (minX + maxX) / 2
  const dy = cy - (minY + maxY) / 2
  const innerStyle = animation ? {
    transformBox: 'fill-box',
    transformOrigin: 'center',
    animation: animation === 'rotate'
      ? `pieceRotate 6s linear ${animDelay || 0}s infinite`
      : `piecePulse 1.8s ease-in-out ${animDelay || 0}s infinite`,
  } : undefined
  return (
    <g transform={`translate(${dx}, ${dy})`}>
      <g style={innerStyle}>
        {polys.map((p, i) => (
          <polygon key={i} points={p} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="miter"/>
        ))}
      </g>
    </g>
  )
}

const FRAMES = [
  { title: 'Welcome to Blokus Trigon', icon: '△',
    text: 'Blokus Trigon is a strategy game played on a hexagonal board made of triangles. Your goal is to place as many of your triangular pieces as possible.',
    visual: 'welcome' },
  { title: 'The Board', icon: '⬡',
    text: 'The board is a flat-top hexagon. 3 players use a 384-triangle board; 4 players use a 486-triangle board.',
    visual: 'board' },
  { title: 'Your Pieces', icon: '▲',
    text: 'Each player has 22 polyiamond pieces — shapes made of 1 to 6 triangles. You must place all of them or run out of legal moves.',
    visual: 'pieces' },
  { title: 'First Move', icon: '1️⃣',
    text: "Your first piece can go anywhere on the empty board (unless it's Required Start) — no restrictions. Next pieces must follow the contact rules.",
    visual: 'rulesList' },
  { title: 'Placement Highlights', icon: '🔴',
    text: 'When hovering, a gray ghost piece means the placement is not valid. When the color changes from gray to your chosen color, then it is valid. Click to place.',
    visual: 'ghost' },
  { title: 'Corner Rule', icon: '◈',
    text: 'After your first move, every new piece must touch at least one of your own pieces at a corner vertex.',
    visual: 'corner' },
  { title: 'Flat Edge Rule', icon: '⊘',
    text: "You may not touch the corner of one of your pieces to another of your piece's flat edge, or vice versa.",
    visual: 'edge' },
  { title: 'Same Edge Rule', icon: '⊟',
    text: 'Your pieces can never share an edge with your own color. Two of your pieces touching edge-to-edge is not allowed.',
    visual: 'sameEdge' },
  { title: 'One Vertex Rule', icon: '⊞',
    text: 'A new piece may touch any single existing piece at only one corner vertex. Touching the same piece at two corners is not allowed.',
    visual: 'twoCorners' },
  { title: 'Scoring', icon: '🏆',
    text: 'Your score equals the triangles you have left unplaced. The player with the lowest score at game end wins.',
    visual: 'scoreboard' },
  { title: 'Keyboard Shortcuts', icon: '⌨',
    text: 'Press these keys during gameplay to control your piece after selection, or customize your board and turn advancement.',
    visual: 'keys' },
  { title: 'Game Modes', icon: '⚙',
    text: 'Choose between optional game modes during game setup. More game modes are always in development!',
    visual: 'modes' },
]

function KeysVisual() {
  const rotateRef    = useRef(null)
  const revRotateRef = useRef(null)
  const flipRef      = useRef(null)
  const hoverRef     = useRef(null)
  const deselectRef  = useRef(null)
  const outlineRef   = useRef(null)
  const autoRef      = useRef(null)

  const [outlineOn, setOutlineOn] = useState(false)
  const [autoOn,    setAutoOn]    = useState(false)

  function fireStrong(ref) {
    const el = ref.current
    if (!el) return
    el.classList.remove('btn-bounce', 'btn-key-highlight-strong')
    void el.offsetWidth
    el.classList.add('btn-bounce', 'btn-key-highlight-strong')
  }

  function fireToggle(ref, setter) {
    const el = ref.current
    if (el) {
      el.classList.remove('btn-bounce')
      void el.offsetWidth
      el.classList.add('btn-bounce')
    }
    setter(prev => !prev)
  }

  useEffect(() => {
    const handler = (e) => {
      const k = e.key
      if ((k === 'r' || k === 'R') && !e.shiftKey)                                  fireStrong(rotateRef)
      else if ((k === 'r' || k === 'R') && e.shiftKey)                              fireStrong(revRotateRef)
      else if (k === 'f' || k === 'F')                                               fireStrong(flipRef)
      else if (k === 'h' || k === 'H')                                               fireStrong(hoverRef)
      else if (k === 'Escape')                                                        fireStrong(deselectRef)
      else if ((k === 'c' || k === 'C') && !e.shiftKey && !e.ctrlKey && !e.metaKey) fireToggle(outlineRef, setOutlineOn)
      else if ((k === 'a' || k === 'A') && !e.shiftKey && !e.ctrlKey && !e.metaKey) fireToggle(autoRef, setAutoOn)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const pill = (extra = {}) => ({
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '7px 9px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 8, cursor: 'pointer', ...extra,
  })
  const cap = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minWidth: 20, height: 18, padding: '0 6px',
    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)',
    borderRadius: 4, fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.85)',
  }
  const lbl = (color = 'rgba(255,255,255,0.85)') => ({ flex: 1, textAlign: 'left', fontSize: 12, color })
  const colTitle = {
    fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.45)',
    textTransform: 'uppercase', letterSpacing: '0.08em',
    textAlign: 'left', margin: '0 0 8px 2px',
  }
  const Icon = ({ d, viewBox = '0 0 24 24', stroke = 'rgba(255,255,255,0.85)' }) => (
    <svg width="15" height="15" viewBox={viewBox} fill="none"
         stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
  )

  const goldPill = {
    background: 'rgba(234,179,8,0.12)',
    border: '1px solid rgba(234,179,8,0.4)',
    boxShadow: '0 0 8px rgba(234,179,8,0.25)',
  }
  const GOLD = '#fde68a'
  const GOLD_DESC = 'rgba(253,230,138,0.6)'

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.15fr', gap: 14, width: '100%', maxWidth: 410, alignItems: 'start' }}>
      <div>
        <div style={colTitle}>Piece Controls</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div ref={rotateRef} style={pill()} onClick={() => fireStrong(rotateRef)}>
            <Icon d={<><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><polyline points="21 3 21 8 16 8"/></>}/>
            <span style={lbl()}>Rotate</span><span style={cap}>R</span>
          </div>
          <div ref={revRotateRef} style={pill()} onClick={() => fireStrong(revRotateRef)}>
            <Icon d={<><path d="M21 12a9 9 0 0 0-15-6.7L3 8"/><polyline points="3 3 3 8 8 8"/></>}/>
            <span style={lbl()}>Rev. Rotate</span><span style={{ ...cap, minWidth: 28 }}>⇧R</span>
          </div>
          <div ref={flipRef} style={pill()} onClick={() => fireStrong(flipRef)}>
            <Icon d={<><polyline points="17 4 21 8 17 12"/><line x1="21" y1="8" x2="3" y2="8"/><polyline points="7 20 3 16 7 12"/><line x1="3" y1="16" x2="21" y2="16"/></>}/>
            <span style={lbl()}>Flip</span><span style={cap}>F</span>
          </div>
          <div ref={hoverRef} style={pill()} onClick={() => fireStrong(hoverRef)}>
            <Icon d={<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></>}/>
            <span style={lbl()}>Hover</span><span style={cap}>H</span>
          </div>
          <div ref={deselectRef} style={pill({ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.18)' })} onClick={() => fireStrong(deselectRef)}>
            <Icon stroke="rgba(248,113,113,0.9)" d={<><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></>}/>
            <span style={lbl('rgba(248,113,113,0.9)')}>Deselect</span><span style={{ ...cap, minWidth: 28 }}>Esc</span>
          </div>
        </div>
      </div>
      <div>
        <div style={colTitle}>Customizations</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div ref={outlineRef}
               style={{ ...pill(), ...(outlineOn ? goldPill : {}), flexDirection: 'column', alignItems: 'stretch', gap: 0, padding: '8px 10px 9px' }}
               onClick={() => fireToggle(outlineRef, setOutlineOn)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill={outlineOn ? GOLD : 'rgba(255,255,255,0.85)'} stroke="none">
                <path d="M12 2 L13.6 10.4 L22 12 L13.6 13.6 L12 22 L10.4 13.6 L2 12 L10.4 10.4 Z"/>
              </svg>
              <span style={lbl(outlineOn ? GOLD : undefined)}>Outline</span><span style={cap}>C</span>
            </div>
            <div style={{ fontSize: 11, color: outlineOn ? GOLD_DESC : 'rgba(255,255,255,0.55)', lineHeight: 1.4, textAlign: 'left', marginTop: 6 }}>
              Adds more pronounced outline to your pieces on the board.
            </div>
          </div>
          <div ref={autoRef}
               style={{ ...pill(), ...(autoOn ? goldPill : {}), flexDirection: 'column', alignItems: 'stretch', gap: 0, padding: '8px 10px 9px' }}
               onClick={() => fireToggle(autoRef, setAutoOn)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon stroke={autoOn ? GOLD : undefined} d={<><polyline points="13 5 20 12 13 19"/><polyline points="5 5 12 12 5 19"/></>}/>
              <span style={lbl(autoOn ? GOLD : undefined)}>Auto Advance</span><span style={cap}>A</span>
            </div>
            <div style={{ fontSize: 11, color: autoOn ? GOLD_DESC : 'rgba(255,255,255,0.55)', lineHeight: 1.4, textAlign: 'left', marginTop: 6 }}>
              Removes End Turn button. Turn advances automatically after placing your piece on the board.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function triggerBounceInlineMd(el) {
  if (!el) return
  el.style.animation = 'none'
  void el.offsetWidth
  el.style.animation = 'btnBounceMd 0.48s cubic-bezier(0.34, 1.56, 0.64, 1) both'
  setTimeout(() => { el.style.animation = '' }, 520)
}

const MODES_DATA = [
  { id: 'required', name: 'Required Start', tag: null,
    desc: "Each player's first piece must cover one of 6 marked starting triangles. Triangles are randomly chosen each game." },
  { id: 'zen', name: 'Zen Mode', tag: null,
    desc: 'All placement rules are off. Place pieces on any empty triangle — no vertex or edge restrictions.' },
  { id: 'mega', name: 'Mega Colors', tag: '2P ONLY',
    desc: 'Each player picks one color and receives two full Alpha Sets in that color. Placement rules apply across both sets as one.' },
]

function ModesVisual() {
  const [active, setActive] = useState(() => new Set())
  const rowRefs = useRef([])

  function toggleMode(id, idx) {
    triggerBounceInlineMd(rowRefs.current[idx])
    setActive(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 410 }}>
      {MODES_DATA.map((m, idx) => {
        const on = active.has(m.id)
        return (
          <div
            key={m.id}
            ref={el => rowRefs.current[idx] = el}
            onClick={() => toggleMode(m.id, idx)}
            style={{
              display: 'flex', gap: 10, alignItems: 'flex-start',
              padding: '10px 12px', borderRadius: 10, textAlign: 'left',
              cursor: 'pointer',
              background: on ? 'rgba(59,130,246,0.08)' : 'rgba(255,255,255,0.04)',
              border: on ? '1px solid rgba(59,130,246,0.3)' : '1px solid rgba(255,255,255,0.10)',
              transition: 'background 0.15s, border-color 0.15s',
            }}
          >
            <span style={{
              flex: '0 0 auto', marginTop: 2, width: 14, height: 14, borderRadius: 4,
              border: on ? '1.5px solid #3B82F6' : '1.5px solid rgba(255,255,255,0.35)',
              background: on ? '#3B82F6' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.15s, border-color 0.15s',
            }}>
              {on && (
                <svg viewBox="0 0 10 8" width="9" height="9">
                  <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                </svg>
              )}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{m.name}</span>
                {m.tag && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', color: '#fff',
                    background: '#3B82F6', padding: '2px 6px', borderRadius: 4,
                  }}>{m.tag}</span>
                )}
              </div>
              <div style={{ fontSize: 11, lineHeight: 1.45, color: 'rgba(255,255,255,0.55)' }}>{m.desc}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function FrameVisual({ kind }) {
  if (kind === 'welcome') {
    return (
      <img src="/assets/welcome.png" alt="Blokus Trigon" style={{
        display: 'block', maxWidth: 360, maxHeight: 200,
        width: 'auto', height: 'auto', borderRadius: 8,
      }}/>
    )
  }

  if (kind === 'board') {
    const S = 6
    const H = S * Math.sqrt(3) / 2
    const aIn  = 8 * S
    const aOut = 9 * S
    const sqrt3 = Math.sqrt(3)
    const hexPoints = (a) => [
      [-a, 0], [-a/2, -a*sqrt3/2], [a/2, -a*sqrt3/2],
      [a, 0],  [a/2,  a*sqrt3/2],  [-a/2, a*sqrt3/2],
    ]
    const hexStr = (a) => hexPoints(a).map(([x, y]) => `${x},${y}`).join(' ')
    const eps = 1e-6
    const inHex = (a) => (x, y) =>
      Math.abs(y) <= a*sqrt3/2 + eps &&
      Math.abs(sqrt3*x + y) <= a*sqrt3 + eps &&
      Math.abs(sqrt3*x - y) <= a*sqrt3 + eps
    const insideOuter = inHex(aOut)
    const tris = []
    const rMin = -Math.ceil(aOut / H) - 1
    const rMax =  Math.ceil(aOut / H) + 1
    const kMin = -Math.ceil(2*aOut / S) - 2
    const kMax =  Math.ceil(2*aOut / S) + 2
    for (let r = rMin; r <= rMax; r++) {
      for (let k = kMin; k <= kMax; k++) {
        const yTop = r * H, yBot = (r + 1) * H
        const isDown = ((r + k) % 2 + 2) % 2 === 0
        const v = isDown
          ? [[k*S/2, yTop], [(k+2)*S/2, yTop], [(k+1)*S/2, yBot]]
          : [[k*S/2, yBot], [(k+2)*S/2, yBot], [(k+1)*S/2, yTop]]
        if (v.every(([x, y]) => insideOuter(x, y))) {
          tris.push(v.map(p => p.join(',')).join(' '))
        }
      }
    }
    const pad = 3, W = 2*aOut, Hx = aOut*sqrt3
    const extraR = 28, extraL = 24
    const vbX = -W/2 - pad - extraL, vbY = -Hx/2 - pad - 4
    const vbW = W + 2*pad + extraL + extraR, vbH = Hx + 2*pad + 8
    const outerAnchor = [3*aOut/4, -aOut*sqrt3/4]
    const innerAnchor = [-3*aIn/4, -aIn*sqrt3/4]
    const outerLabelX = aOut + 4, outerLabelY = outerAnchor[1] - 3
    const innerLabelX = -aOut - 4, innerLabelY = innerAnchor[1] - 3
    return (
      <svg viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
           style={{ width: '100%', maxWidth: 440, height: 'auto', display: 'block' }}>
        <polygon points={hexStr(aOut)} fill="rgba(59,130,246,0.08)"/>
        <g stroke="#3B82F6" strokeWidth="0.22" fill="none" opacity="0.85">
          {tris.map((p, i) => <polygon key={i} points={p}/>)}
        </g>
        <polygon points={hexStr(aIn)} fill="none" stroke="#FFFFFF" strokeWidth="0.65" strokeLinejoin="miter"/>
        <polygon points={hexStr(aOut)} fill="none" stroke="#3B82F6" strokeWidth="1" strokeLinejoin="miter"/>
        <g stroke="#FFFFFF" strokeWidth="0.32" fill="none">
          <line x1={innerLabelX + extraL - 1} y1={innerLabelY + 2} x2={innerAnchor[0] - 1} y2={innerAnchor[1] - 1}/>
          <circle cx={innerAnchor[0] - 1} cy={innerAnchor[1] - 1} r="0.65" fill="#FFFFFF" stroke="none"/>
        </g>
        <g stroke="#3B82F6" strokeWidth="0.36" fill="none">
          <line x1={outerAnchor[0]} y1={outerAnchor[1]} x2={outerLabelX - 1} y2={outerLabelY + 2}/>
          <circle cx={outerAnchor[0]} cy={outerAnchor[1]} r="0.65" fill="#3B82F6" stroke="none"/>
        </g>
        <g fontFamily="DM Sans, sans-serif" fontSize="4" fontWeight="600" letterSpacing="0.18">
          <text x={outerLabelX} y={outerLabelY} fill="#3B82F6">2 / 4 PLAYER</text>
          <text x={outerLabelX} y={outerLabelY + 4.4} fontSize="3.2" fontWeight="500" fill="rgba(255,255,255,0.5)">486 triangles</text>
          <text x={innerLabelX} y={innerLabelY} textAnchor="end" fill="#FFFFFF">3 PLAYER</text>
          <text x={innerLabelX} y={innerLabelY + 4.4} fontSize="3.2" fontWeight="500" fill="rgba(255,255,255,0.5)" textAnchor="end">384 triangles</text>
        </g>
      </svg>
    )
  }

  if (kind === 'pieces') {
    const ids = ALPHA_SET.map(p => p.id)
    const shuffled = [...ids].sort((a, b) => ((a * 2654435761) >>> 0) - ((b * 2654435761) >>> 0))
    const pulseIds = new Set(shuffled.slice(0, 3))
    const rotateIds = new Set(shuffled.slice(3, 6))
    const animFor = (id) => pulseIds.has(id) ? 'pulse' : rotateIds.has(id) ? 'rotate' : null
    const delayFor = (id) => ((id * 31) % 100) / 100 * 1.5

    function Group({ size, color, label, S, cols }) {
      const pieces = ALPHA_SET.filter(p => p.size === size)
      const sized = pieces.map(p => ({ p, b: piecePolys(p.cells, S) }))
      const maxW = Math.max(...sized.map(s => s.b.w))
      const maxH = Math.max(...sized.map(s => s.b.h))
      const gap = 6, cellW = maxW + gap, cellH = maxH + gap
      const rows = Math.ceil(pieces.length / cols)
      const W = cols * cellW, H = rows * cellH
      return (
        <div style={{
          position: 'relative', border: `1.5px solid ${color}`, borderRadius: 10,
          padding: '10px 8px 6px', background: 'rgba(255,255,255,0.02)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{
            position: 'absolute', top: -9, left: 10,
            background: '#1E2433', color, fontWeight: 700, fontSize: 11,
            padding: '0 6px', lineHeight: '14px', fontFamily: "'DM Sans', sans-serif",
          }}>{label}</span>
          <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ display: 'block' }}>
            <defs>
              <style>{`
                @keyframes piecePulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.25); } }
                @keyframes pieceRotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
              `}</style>
            </defs>
            {sized.map(({ p }, i) => {
              const c = i % cols, r = Math.floor(i / cols)
              return (
                <PieceSVG key={p.id} piece={p} S={S}
                  cx={c * cellW + cellW / 2} cy={r * cellH + cellH / 2}
                  fill="#CBD5E1" stroke="#FFFFFF" strokeWidth="0.9"
                  animation={animFor(p.id)} animDelay={delayFor(p.id)}/>
              )
            })}
          </svg>
        </div>
      )
    }

    const S = 13
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', width: '100%' }}>
        <Group size={6} color="#EF4444" label="6" S={S} cols={4}/>
        <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
          <Group size={5} color="#3B82F6" label="5" S={S} cols={4}/>
          <Group size={4} color="#EAB308" label="4" S={S} cols={3}/>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
          <Group size={3} color="#22C55E" label="3" S={S} cols={1}/>
          <Group size={2} color="#EC4899" label="2" S={S} cols={1}/>
          <Group size={1} color="#A855F7" label="1" S={S} cols={1}/>
        </div>
      </div>
    )
  }

  if (kind === 'rulesList') {
    const rules = [
      ['Corner Rule',     'Touch your own piece at a corner vertex.'],
      ['Flat Edge Rule',  "Don't touch a corner to your piece's flat edge."],
      ['Same Edge Rule',  'Your pieces can never share an edge.'],
      ['One Vertex Rule', 'Touch any single piece at only one vertex.'],
    ]
    return (
      <ul style={{
        listStyle: 'none', margin: 0, padding: 0,
        display: 'flex', flexDirection: 'column', gap: 8,
        width: '100%', maxWidth: 360, textAlign: 'left',
      }}>
        {rules.map(([name, desc]) => (
          <li key={name} style={{
            display: 'flex', alignItems: 'baseline', gap: 10,
            padding: '8px 12px',
            background: 'rgba(59,130,246,0.06)',
            border: '1px solid rgba(59,130,246,0.18)',
            borderRadius: 6,
          }}>
            <span style={{ color: '#3B82F6', fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", minWidth: 110 }}>{name}</span>
            <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, lineHeight: 1.4 }}>{desc}</span>
          </li>
        ))}
      </ul>
    )
  }

  const videoStyle = {
    display: 'block', width: '100%', maxWidth: 360, borderRadius: 8, background: 'rgba(0,0,0,0.3)',
  }

  if (kind === 'ghost')      return <video src="/assets/ghost-preview.mp4" autoPlay loop muted playsInline style={videoStyle}/>
  if (kind === 'corner')     return <video src="/assets/placement.mp4"    autoPlay loop muted playsInline style={videoStyle}/>
  if (kind === 'edge')       return <video src="/assets/flat-edge.mp4"    autoPlay loop muted playsInline style={videoStyle}/>
  if (kind === 'sameEdge')   return <video src="/assets/same-edge.mp4"    autoPlay loop muted playsInline style={videoStyle}/>
  if (kind === 'twoCorners') return <video src="/assets/two-corners.mp4"  autoPlay loop muted playsInline style={videoStyle}/>

  if (kind === 'scoreboard') {
    return (
      <img src="/assets/scoreboard.png" alt="Final scoreboard" style={{
        display: 'block', maxWidth: 360, maxHeight: 260, width: 'auto', height: 'auto',
      }}/>
    )
  }

  if (kind === 'keys') return <KeysVisual />
  if (kind === 'modes') return <ModesVisual />

  return null
}

export default function HowToPlayModal({ onClose }) {
  const [frame, setFrame] = useState(0)
  const total = FRAMES.length
  const prevBtnRef = useRef(null)
  const nextBtnRef = useRef(null)

  const prev = useCallback(() => setFrame(f => Math.max(0, f - 1)), [])
  const next = useCallback(() => setFrame(f => Math.min(total - 1, f + 1)), [total])

  const isLastFrame = frame === total - 1

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') { playSound('deselect-cancel-home'); onClose(); return }
      if (e.key === 'ArrowRight') {
        triggerBounce(nextBtnRef.current)
        if (isLastFrame) { playSound('1-select-piece'); setTimeout(onClose, 350) }
        else { playSound('home-lobby'); next() }
        return
      }
      if (e.key === 'ArrowLeft') { triggerBounce(prevBtnRef.current); playSound('home-lobby'); prev(); return }
      if (e.key === 'Enter' && isLastFrame) { triggerBounce(nextBtnRef.current); playSound('1-select-piece'); setTimeout(onClose, 350) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, next, prev, isLastFrame])

  const current = FRAMES[frame]

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.headerTitle}>How to Play</span>
          <button className={styles.closeBtn} onClick={(e) => { triggerBounce(e.currentTarget); playSound('deselect-cancel-home'); setTimeout(onClose, 350) }} aria-label="Close">
            <svg viewBox="0 0 14 14" width="14" height="14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className={styles.content}>
          <h2 className={styles.title}>{current.title}</h2>
          <p className={styles.text}>{current.text}</p>
          {current.visual && (
            <div className={styles.visual}>
              <FrameVisual kind={current.visual}/>
            </div>
          )}
        </div>

        <div className={styles.nav}>
          <button
            ref={prevBtnRef}
            className={`${styles.navBtn} ${frame === 0 ? styles.navBtnDisabled : ''}`}
            onClick={(e) => { triggerBounce(e.currentTarget); playSound('home-lobby'); prev() }}
            disabled={frame === 0}
          >← Prev</button>

          <div className={styles.dots}>
            {FRAMES.map((_, i) => (
              <button
                key={i}
                className={`${styles.dot} ${i === frame ? styles.dotActive : ''}`}
                onClick={() => { playSound('home-lobby'); setFrame(i) }}
                aria-label={`Go to frame ${i + 1}`}
              />
            ))}
          </div>

          {frame < total - 1 ? (
            <button ref={nextBtnRef} className={styles.navBtn} onClick={(e) => { triggerBounce(e.currentTarget); playSound('home-lobby'); next() }}>Next →</button>
          ) : (
            <button ref={nextBtnRef} className={`${styles.navBtn} ${styles.navBtnDone}`} onClick={(e) => { triggerBounce(e.currentTarget); playSound('1-select-piece'); setTimeout(onClose, 350) }}>Got it!</button>
          )}
        </div>
      </div>
    </div>
  )
}
