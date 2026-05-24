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

const cache = {}

// Eagerly create Audio objects so files are fetched before first playback
for (const [name, file] of Object.entries(FILES)) {
  try { cache[name] = new Audio(BASE + file) } catch (_) {}
}

export function playSound(name) {
  const file = FILES[name]
  if (!file) return
  try {
    if (!cache[name]) cache[name] = new Audio(BASE + file)
    const audio = cache[name]
    audio.currentTime = 0
    audio.play().catch(() => {})
  } catch (_) {}
}
