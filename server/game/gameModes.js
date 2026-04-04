/**
 * GAME MODES
 *
 * Central definition for all available game modes.
 * To add a new mode: add an entry here, handle it in gameLogic.js and/or
 * useGameState.js, and the SetupScreen UI will pick it up automatically.
 *
 * Fields:
 *   id           - unique string key used throughout state and logic
 *   name         - display name shown in setup UI
 *   description  - short description shown below name in setup UI
 *   availability - 'all' | '2p-only' (which player counts can use this mode)
 */
export const GAME_MODES = [
  {
    id: 'requiredStart',
    name: 'Required Start',
    description: "Each player's first piece must cover one of 6 marked starting triangles. Triangles are randomly chosen each game.",
    availability: 'all',
  },
  {
    id: 'zenMode',
    name: 'Zen Mode',
    description: 'All placement rules are off. Place pieces on any empty triangle — no vertex or edge restrictions.',
    availability: 'all',
  },
  {
    id: 'megaColors',
    name: 'Mega Colors',
    description: 'Each player picks one color and receives two full Alpha Sets in that color. Placement rules apply across both sets as one.',
    availability: '2p-only',
  },
]
