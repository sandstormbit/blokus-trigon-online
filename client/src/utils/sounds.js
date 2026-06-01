const BASE = '/sounds/'

const FILES = {
  'invalid-placement':   'invalid-placement.wav',
  '1-select-piece':      '1-select-piece.wav',
  '2-deselect-piece':    '2-deselect-piece.wav',
  'click-to-place':      'click-to-place.wav',
  'place-piece':         'place-piece.wav',
  'remove-piece':        'remove-piece.wav',
  'end-turn':            'end-turn.wav',
  'home-lobby':          'home-and-lobby-general.wav',
  '1-your-turn':         '1-your-turn.wav',
  'inactivity':          'its-been-your-turn.wav',
  'did-not-win':         'did-not-win.wav',
  '1-you-win':           '1-you-win.wav',
  'deselect-cancel-home':'deselect-cancel-on-home.mp3',
  'add-ai':              'add-ai.mp3',
  '1-game-modes':        '1-game-modes.wav',
  '2-game-modes':        '2-game-modes.wav',
  'game-start':          'game-start.wav',
  'no-more-moves':       'no-more-moves.wav',
  'something-shiny':     'something-shiny.wav',
}

// ── Web Audio API — zero-latency playback after initial decode ────────────
let _ctx = null
const rawBuffers = {}    // name → ArrayBuffer (kept so we can re-decode after context recreation)
const decoded = {}       // name → AudioBuffer for the current _ctx

function createCtx() {
  try {
    const c = new (window.AudioContext || window.webkitAudioContext)()
    return c
  } catch (_) {
    return null
  }
}

// Returns a live (non-closed) AudioContext, recreating it if iOS killed it.
function getCtx() {
  if (!_ctx) {
    _ctx = createCtx()
  } else if (_ctx.state === 'closed') {
    // iOS Safari can fully close the context when backgrounded; recreate it
    // and wipe decoded cache so buffers get re-decoded against the new ctx.
    _ctx = createCtx()
    for (const k of Object.keys(decoded)) delete decoded[k]
    // Re-decode all sounds that have raw data available
    for (const [name, ab] of Object.entries(rawBuffers)) {
      if (!_ctx) break
      _ctx.decodeAudioData(ab.slice(0), buf => { decoded[name] = buf }, () => {})
    }
  }
  return _ctx
}

// Resume suspended context on user gesture (required by iOS Safari).
// 'once: true' is intentionally NOT used — iOS suspends the context again when
// the page is backgrounded, so we need the listener to fire every time the user
// returns and interacts, not just the first time.
function unlockCtx() {
  const c = getCtx()
  if (!c) return
  if (c.state === 'suspended') c.resume().catch(() => {})
}
document.addEventListener('touchstart', unlockCtx, { capture: true })
document.addEventListener('click',      unlockCtx, { capture: true })

// Resume on visibility restore AND on pageshow (covers back-forward cache on
// mobile Safari where the page is restored without a full reload).
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) unlockCtx()
})
window.addEventListener('pageshow', (e) => {
  // e.persisted is true when the page is restored from the back-forward cache
  unlockCtx()
})

// Pre-fetch and decode all sounds eagerly so they're ready before first play.
// We keep the raw ArrayBuffer so the context can be recreated without re-fetching.
for (const [name, file] of Object.entries(FILES)) {
  fetch(BASE + file)
    .then(r => r.arrayBuffer())
    .then(ab => {
      rawBuffers[name] = ab
      const c = getCtx()
      if (!c) return
      // decodeAudioData consumes the buffer, so pass a copy and keep the original
      return c.decodeAudioData(ab.slice(0))
    })
    .then(buf => { if (buf) decoded[name] = buf })
    .catch(() => {})
}

// ── HTML5 Audio fallback — used before decode completes ───────────────────
const fallback = {}
for (const [name, file] of Object.entries(FILES)) {
  try { fallback[name] = new Audio(BASE + file) } catch (_) {}
}

export function playSound(name) {
  if (!FILES[name]) return
  try {
    const c = getCtx()
    const buf = decoded[name]
    if (c && buf) {
      // Web Audio path: near-zero latency
      if (c.state === 'suspended') c.resume().catch(() => {})
      const src = c.createBufferSource()
      src.buffer = buf
      src.connect(c.destination)
      src.start(0)
    } else {
      // Fallback: HTML5 Audio (used until decode finishes, or if Web Audio unavailable)
      const audio = fallback[name]
      if (audio) { audio.currentTime = 0; audio.play().catch(() => {}) }
    }
  } catch (_) {}
}
