import React, { useRef, useEffect, useCallback } from 'react'
import styles from './ActionButton.module.css'

const COLORS = ['#ffffff', '#38bdf8', '#00bcd4', '#bae6fd', '#0284c7', '#e0f7fa', '#7dd3fc']
const POOL_SIZE = 6       // max particles alive at once
const SPAWN_INTERVAL = 180 // ms between top-up spawns while hovering

// Spawn spread across the button area with a random drift direction
function makeParticle(cx, cy, W, H) {
  // Spread across the full button width, centered vertically on button
  const x = cx + (Math.random() - 0.5) * W * 0.82
  const y = cy + (Math.random() - 0.5) * 28

  const moveAngle = Math.random() * Math.PI * 2
  const speed = 0.35 + Math.random() * 0.55

  return {
    x,
    y,
    vx: Math.cos(moveAngle) * speed,
    vy: Math.sin(moveAngle) * speed,
    size: 4 + Math.random() * 4, // 4–8px
    rot: Math.random() * Math.PI * 2,
    rotV: 0.018 + Math.random() * 0.032,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    alpha: 0,
    life: 1,
    decay: 0.001 + Math.random() * 0.001, // slow — distance fade is the primary mechanism
  }
}

export default function ActionButton({ className, onClick, children, circleColor = 'rgba(255,255,255,0.12)' }) {
  const canvasRef = useRef(null)
  const particlesRef = useRef([])
  const rafRef = useRef(null)
  const spawnRef = useRef(null)
  const activeRef = useRef(false)

  const tick = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const W = canvas.width
    const H = canvas.height
    ctx.clearRect(0, 0, W, H)

    particlesRef.current = particlesRef.current.filter(p => p.life > 0)

    // Button half-dimensions in canvas space (button is 320×50, canvas is 380×260)
    const cx = W / 2
    const cy = H / 2
    const btnHalfW = 160  // 320 / 2
    const btnHalfH = 25   // ~50 / 2

    for (const p of particlesRef.current) {
      p.x += p.vx
      p.y += p.vy
      p.rot += p.rotV
      p.life -= p.decay

      // Fade in quickly when newly spawned
      p.alpha = Math.min(0.85, p.alpha + 0.04)

      // Skip if any part of the star would be clipped at canvas edge
      const m = p.size + 2
      if (p.x - m < 0 || p.x + m > W || p.y - m < 0 || p.y + m > H) continue

      // Distance-based fade: full opacity at button edge, 0 at 1.3× button boundary
      // nd = 1 means exactly at button edge, nd = 1.3 means 1.3× boundary
      const nd = Math.max(Math.abs(p.x - cx) / btnHalfW, Math.abs(p.y - cy) / btnHalfH)
      const distanceFade = nd <= 1 ? 1 : Math.max(0, 1 - (nd - 1) / 0.3)
      if (distanceFade === 0) continue

      const fadeAlpha = p.alpha * distanceFade

      ctx.save()
      ctx.globalAlpha = fadeAlpha
      ctx.fillStyle = p.color
      ctx.shadowBlur = 8
      ctx.shadowColor = p.color
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      // 4-point star
      ctx.beginPath()
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2
        const b = a + Math.PI / 4
        ctx.lineTo(Math.cos(a) * p.size, Math.sin(a) * p.size)
        ctx.lineTo(Math.cos(b) * p.size * 0.38, Math.sin(b) * p.size * 0.38)
      }
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }

    if (particlesRef.current.length > 0 || activeRef.current) {
      rafRef.current = requestAnimationFrame(tick)
    } else {
      rafRef.current = null
    }
  }, [])

  const spawnToPool = useCallback((cx, cy, W, H) => {
    const needed = POOL_SIZE - particlesRef.current.length
    const toSpawn = Math.min(needed, 3)
    for (let i = 0; i < toSpawn; i++) {
      particlesRef.current.push(makeParticle(cx, cy, W, H))
    }
  }, [])

  const startConfetti = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const cx = canvas.width / 2
    const cy = canvas.height / 2
    const W = canvas.width
    const H = canvas.height

    // Initial fill — stagger lifetimes so the spread looks populated immediately
    for (let i = 0; i < POOL_SIZE; i++) {
      const p = makeParticle(cx, cy, W, H)
      p.life = 0.3 + Math.random() * 0.7
      p.alpha = 0.6 + Math.random() * 0.25
      particlesRef.current.push(p)
    }

    spawnRef.current = setInterval(() => {
      if (activeRef.current) spawnToPool(cx, cy, W, H)
    }, SPAWN_INTERVAL)

    if (!rafRef.current) rafRef.current = requestAnimationFrame(tick)
  }, [tick, spawnToPool])

  const handleEnter = () => {
    activeRef.current = true
    startConfetti()
  }

  const handleLeave = () => {
    activeRef.current = false
    clearInterval(spawnRef.current)
    spawnRef.current = null
    // Existing particles fade out naturally via their decay
  }

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current)
    clearInterval(spawnRef.current)
  }, [])

  return (
    <div className={styles.wrap} onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      <canvas ref={canvasRef} className={styles.canvas} width={380} height={260} />
      <button className={`${className} ${styles.btn}`} onClick={onClick}>
        <span className={styles.circle} style={{ background: circleColor }} />
        <svg
          className={styles.arrowIn}
          viewBox="0 0 20 20"
          width="15"
          height="15"
          fill="none"
          aria-hidden="true"
        >
          <path d="M4 10h12M10 4l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span className={styles.content}>{children}</span>
      </button>
    </div>
  )
}
