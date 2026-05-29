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
const decoded = {}  // name → AudioBuffer once decoded

function getCtx() {
  if (!_ctx) {
    try { _ctx = new (window.AudioContext || window.webkitAudioContext)() } catch (_) {}
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

// Also resume as soon as the page becomes visible again (covers the case where
// iOS suspends the AudioContext while the browser is in the background).
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) unlockCtx()
})

// Pre-fetch and decode all sounds eagerly so they're ready before first play
for (const [name, file] of Object.entries(FILES)) {
  fetch(BASE + file)
    .then(r => r.arrayBuffer())
    .then(ab => {
      const c = getCtx()
      if (!c) return
      return c.decodeAudioData(ab)
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
      // Fallback: HTML5 Audio (used until decode finishes on first page load)
      const audio = fallback[name]
      if (audio) { audio.currentTime = 0; audio.play().catch(() => {}) }
    }
  } catch (_) {}
}
