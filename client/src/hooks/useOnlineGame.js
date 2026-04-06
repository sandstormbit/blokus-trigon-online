/**
 * useOnlineGame
 *
 * Manages the socket.io connection and online game state.
 * Exposes the same interface as useGameState so GameScreen can be reused
 * without changes. Local UI state (selection, hover, pending) is kept
 * client-side for responsiveness; placement is validated locally first,
 * then committed via the server.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { io } from 'socket.io-client'
import { getPieceOrientation, placePieceCells } from '../game/pieces.js'
import { isLegalPlacement } from '../game/gameLogic.js'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || ''

// Deserialize state received from server (arrays → Sets)
function deserializeState(raw) {
  if (!raw) return null
  return {
    ...raw,
    skippedPlayerIds: new Set(raw.skippedPlayerIds || []),
    requiredStartCells: raw.requiredStartCells ? new Set(raw.requiredStartCells) : null,
  }
}

function parityAwareAnchor(hoverCell, pieceCells) {
  const hoverParity = ((hoverCell.q + hoverCell.r) % 2 + 2) % 2
  const matchCell = pieceCells.find(c => ((c.dq + c.dr) % 2 + 2) % 2 === hoverParity)
  const anchor = matchCell || pieceCells[0]
  return { anchorQ: hoverCell.q - anchor.dq, anchorR: hoverCell.r - anchor.dr }
}

function getGameOptions(gameState) {
  return {
    gameModes: gameState?.gameModes || {},
    requiredStartCells: gameState?.requiredStartCells || null,
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useOnlineGame() {
  const socketRef = useRef(null)

  // Connection / room state
  const [connected, setConnected] = useState(false)
  const [roomCode, setRoomCode] = useState(null)
  const [roomMode, setRoomMode] = useState('public')
  const [maxPlayersInRoom, setMaxPlayersInRoom] = useState(4)
  const [myHumanId, setMyHumanId] = useState(null)
  const [myToken, setMyToken] = useState(() => localStorage.getItem('bt_session_token') || null)
  const [isHostPlayer, setIsHostPlayer] = useState(false)
  const [roomPlayers, setRoomPlayers] = useState([])  // waiting room player list
  const [settings, setSettings] = useState({ gameModes: {} })
  const [roomPhase, setRoomPhase] = useState('disconnected')  // 'disconnected' | 'waiting' | 'playing' | 'ended'
  const [connectionError, setConnectionError] = useState(null)

  // Authoritative game state from server
  const [gameState, setGameState] = useState(null)

  // Local UI state (purely client-side, no server sync)
  const [selectedPieceId, setSelectedPieceId] = useState(null)
  const [hoverCell, setHoverCell] = useState(null)
  const [pendingPlacement, setPendingPlacement] = useState(null)

  // ── Socket initialization ───────────────────────────────────────────────────
  useEffect(() => {
    const socket = io(SERVER_URL, {
      autoConnect: false,
      withCredentials: true,
    })

    socketRef.current = socket

    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    socket.on('connect_error', (err) => setConnectionError(err.message))

    // ── Waiting room events ───────────────────────────────────────────────────
    socket.on('player_joined', ({ players }) => setRoomPlayers(players))
    socket.on('player_reconnected', ({ players }) => setRoomPlayers(players))
    socket.on('player_disconnected', ({ players }) => setRoomPlayers(players))
    socket.on('settings_updated', ({ settings: s }) => setSettings(s))
    socket.on('color_updated', ({ players }) => setRoomPlayers(players))

    // ── Game events ───────────────────────────────────────────────────────────
    socket.on('game_start', ({ gameState: raw }) => {
      const state = deserializeState(raw)
      setGameState(state)
      setRoomPhase('playing')
      setSelectedPieceId(null)
      setHoverCell(null)
      setPendingPlacement(null)
    })

    socket.on('game_state_update', ({ gameState: raw }) => {
      const state = deserializeState(raw)
      setGameState(state)
      setSelectedPieceId(null)
      setHoverCell(null)
      setPendingPlacement(null)
      if (state.phase === 'ended') setRoomPhase('ended')
    })

    socket.on('new_game_started', ({ players, settings: s }) => {
      setRoomPlayers(players)
      setSettings(s)
      setGameState(null)
      setRoomPhase('waiting')
      setSelectedPieceId(null)
      setHoverCell(null)
      setPendingPlacement(null)
    })

    // ── Auto-reconnect on mount if session data is stored ───────────────────
    const storedToken = localStorage.getItem('bt_session_token')
    const storedRoomCode = localStorage.getItem('bt_room_code')

    if (storedToken && storedRoomCode) {
      socket.connect()
      const attemptReconnect = () => {
        socket.emit('join_room', { roomCode: storedRoomCode, playerName: '', sessionToken: storedToken }, (res) => {
          if (!res.ok) {
            localStorage.removeItem('bt_room_code')
            socket.disconnect()
            return
          }
          localStorage.setItem('bt_session_token', res.token)
          setMyToken(res.token)
          setRoomCode(res.roomCode)
          setRoomMode('unknown')
          setMaxPlayersInRoom(res.maxPlayers || 4)
          setMyHumanId(res.humanId)
          setIsHostPlayer(res.isHost)
          setRoomPlayers(res.players)
          setSettings(res.settings)
          setRoomPhase(res.phase)
          if (res.gameState) {
            setGameState(deserializeState(res.gameState))
          }
        })
      }
      if (socket.connected) {
        attemptReconnect()
      } else {
        socket.once('connect', attemptReconnect)
      }
    }

    return () => {
      socket.disconnect()
      socket.removeAllListeners()
    }
  }, [])

  // ── Connect and create/join room ────────────────────────────────────────────
  const createRoomAction = useCallback((mode, maxPlayers, playerName, callback) => {
    const socket = socketRef.current
    if (!socket) return

    const token = myToken
    socket.connect()

    const emitCreate = () => {
      socket.emit('create_room', { mode, maxPlayers, playerName, sessionToken: token }, (res) => {
        if (!res.ok) {
          callback?.({ error: res.error })
          return
        }
        localStorage.setItem('bt_session_token', res.token)
        localStorage.setItem('bt_player_name', playerName)
        localStorage.setItem('bt_room_code', res.roomCode)
        setMyToken(res.token)
        setRoomCode(res.roomCode)
        setRoomMode(mode)
        setMaxPlayersInRoom(maxPlayers)
        setMyHumanId(res.humanId)
        setIsHostPlayer(res.isHost)
        setRoomPlayers(res.players)
        setSettings(res.settings)
        setRoomPhase(res.phase)
        callback?.({ ok: true, roomCode: res.roomCode })
      })
    }

    if (socket.connected) {
      emitCreate()
    } else {
      socket.once('connect', emitCreate)
    }
  }, [myToken])

  const joinRoomAction = useCallback((roomCode, playerName, callback) => {
    const socket = socketRef.current
    if (!socket) return

    const token = myToken
    socket.connect()

    const emitJoin = () => {
      socket.emit('join_room', { roomCode, playerName, sessionToken: token }, (res) => {
        if (!res.ok) {
          callback?.({ error: res.error })
          return
        }
        localStorage.setItem('bt_session_token', res.token)
        localStorage.setItem('bt_player_name', playerName)
        localStorage.setItem('bt_room_code', res.roomCode)
        setMyToken(res.token)
        setRoomCode(res.roomCode)
        setRoomMode('unknown')
        setMaxPlayersInRoom(res.maxPlayers || (res.players.length > 0 ? res.players[res.players.length - 1].humanId : 4))
        setMyHumanId(res.humanId)
        setIsHostPlayer(res.isHost)
        setRoomPlayers(res.players)
        setSettings(res.settings)
        setRoomPhase(res.phase)

        if (res.gameState) {
          setGameState(deserializeState(res.gameState))
        }
        callback?.({ ok: true, roomCode: res.roomCode })
      })
    }

    if (socket.connected) {
      emitJoin()
    } else {
      socket.once('connect', emitJoin)
    }
  }, [myToken])

  // ── Waiting room actions ────────────────────────────────────────────────────
  const updateSettingsAction = useCallback((gameModes) => {
    socketRef.current?.emit('update_settings', { gameModes })
    // Optimistic update
    setSettings(prev => ({ ...prev, gameModes: { ...prev.gameModes, ...gameModes } }))
  }, [])

  const startGameAction = useCallback((callback) => {
    socketRef.current?.emit('start_game', {}, (res) => {
      if (!res.ok) callback?.({ error: res.error })
      else callback?.({ ok: true })
    })
  }, [])

  const selectColorAction = useCallback((color) => {
    socketRef.current?.emit('select_color', { color: color || null })
    // Optimistic update
    setRoomPlayers(prev => prev.map(p =>
      p.humanId === myHumanId ? { ...p, color: color || null } : p
    ))
  }, [myHumanId])

  // ── Is it my turn? ──────────────────────────────────────────────────────────
  const isMyTurn = useCallback(() => {
    if (!gameState || gameState.phase !== 'playing') return false
    const currentPlayer = gameState.players[gameState.currentPlayerIndex]
    return currentPlayer?.humanId === myHumanId
  }, [gameState, myHumanId])

  // ── Game actions (mirror useGameState interface) ────────────────────────────

  const selectPiece = useCallback((id) => {
    if (!isMyTurn()) return
    setSelectedPieceId(prev => prev === id ? null : id)
    setPendingPlacement(null)
    setHoverCell(null)
  }, [isMyTurn])

  const deselectPiece = useCallback(() => {
    setSelectedPieceId(null)
    setHoverCell(null)
    setPendingPlacement(null)
  }, [])

  const rotatePiece = useCallback(() => {
    if (!isMyTurn() || !selectedPieceId || !gameState) return
    const currentPlayer = gameState.players[gameState.currentPlayerIndex]
    const piece = currentPlayer?.pieces.find(p => p.id === selectedPieceId)
    if (!piece) return

    // Update local copy of piece rotation in game state
    setGameState(prev => {
      if (!prev) return prev
      return {
        ...prev,
        players: prev.players.map((p, i) => {
          if (i !== prev.currentPlayerIndex) return p
          return {
            ...p,
            pieces: p.pieces.map(pc =>
              pc.id === selectedPieceId
                ? { ...pc, rotIndex: (pc.rotIndex + 1) % 6 }
                : pc
            ),
          }
        }),
      }
    })
    setPendingPlacement(null)
  }, [isMyTurn, selectedPieceId, gameState])

  const flipPiece = useCallback(() => {
    if (!isMyTurn() || !selectedPieceId || !gameState) return
    setGameState(prev => {
      if (!prev) return prev
      return {
        ...prev,
        players: prev.players.map((p, i) => {
          if (i !== prev.currentPlayerIndex) return p
          return {
            ...p,
            pieces: p.pieces.map(pc =>
              pc.id === selectedPieceId
                ? { ...pc, flipped: !pc.flipped }
                : pc
            ),
          }
        }),
      }
    })
    setPendingPlacement(null)
  }, [isMyTurn, selectedPieceId, gameState])

  const setHover = useCallback((cell) => {
    setHoverCell(cell)
  }, [])

  const placePiece = useCallback((q, r) => {
    if (!isMyTurn() || !selectedPieceId || !gameState) return

    const currentPlayer = gameState.players[gameState.currentPlayerIndex]
    const piece = currentPlayer?.pieces.find(p => p.id === selectedPieceId)
    if (!piece) return

    const cells = getPieceOrientation(piece, piece.rotIndex, piece.flipped)
    const { anchorQ, anchorR } = parityAwareAnchor({ q, r }, cells)
    const boardCells = placePieceCells(cells, anchorQ, anchorR)

    const isFirst = !currentPlayer.pieces.some(p => p.placed)
    const { legal } = isLegalPlacement(
      gameState.board.cells,
      boardCells,
      currentPlayer.id,
      isFirst,
      getGameOptions(gameState),
    )

    if (!legal) return

    setPendingPlacement({
      pieceId: piece.id,
      anchorQ,
      anchorR,
      cells: boardCells,
      rotIndex: piece.rotIndex,
      flipped: piece.flipped,
    })
  }, [isMyTurn, selectedPieceId, gameState])

  const confirmPlacement = useCallback(() => {
    if (!pendingPlacement) return

    const { pieceId, anchorQ, anchorR, rotIndex, flipped } = pendingPlacement

    socketRef.current?.emit('place_piece', { pieceId, anchorQ, anchorR, rotIndex, flipped }, (res) => {
      if (!res.ok) {
        // Server rejected — clear pending and resync will come via game_state_update
        setPendingPlacement(null)
      }
    })
    setPendingPlacement(null)
  }, [pendingPlacement])

  const cancelPlacement = useCallback(() => {
    setPendingPlacement(null)
  }, [])

  const dismissNoMoves = useCallback(() => {
    socketRef.current?.emit('dismiss_no_moves', {}, (res) => {
      if (!res.ok) console.warn('dismiss_no_moves rejected:', res.error)
    })
  }, [])

  const requestEndGame = useCallback(() => {
    socketRef.current?.emit('request_end_game', {}, (res) => {
      if (!res.ok) console.warn('request_end_game rejected:', res.error)
    })
  }, [])

  const confirmEndGame = useCallback(() => {
    socketRef.current?.emit('confirm_end_game', {}, (res) => {
      if (!res.ok) console.warn('confirm_end_game rejected:', res.error)
    })
  }, [])

  const cancelEndGame = useCallback(() => {
    socketRef.current?.emit('cancel_end_game', {}, (res) => {
      if (!res.ok) console.warn('cancel_end_game rejected:', res.error)
    })
  }, [])

  const newGame = useCallback(() => {
    socketRef.current?.emit('new_game', {}, (res) => {
      if (!res.ok) console.warn('new_game rejected:', res.error)
    })
  }, [])

  const disconnect = useCallback(() => {
    socketRef.current?.disconnect()
    localStorage.removeItem('bt_session_token')
    localStorage.removeItem('bt_room_code')
    setMyToken(null)
    setRoomCode(null)
    setRoomMode('public')
    setMaxPlayersInRoom(4)
    setMyHumanId(null)
    setIsHostPlayer(false)
    setRoomPlayers([])
    setGameState(null)
    setRoomPhase('disconnected')
    setSelectedPieceId(null)
    setHoverCell(null)
    setPendingPlacement(null)
  }, [])

  // ── Derived helpers (match useGameState interface) ────────────────────────────
  const mergedState = gameState ? {
    ...gameState,
    selectedPieceId,
    hoverCell,
    pendingPlacement,
  } : null

  const currentPlayer = gameState
    ? gameState.players[gameState.currentPlayerIndex] || null
    : null

  const getSelectedPiece = useCallback(() => {
    if (!selectedPieceId || !currentPlayer) return null
    return currentPlayer.pieces.find(p => p.id === selectedPieceId) || null
  }, [selectedPieceId, currentPlayer])

  const getGhostCells = useCallback(() => {
    if (!hoverCell || !selectedPieceId || !currentPlayer || !gameState) {
      return { cells: [], isLegal: false }
    }
    const piece = getSelectedPiece()
    if (!piece) return { cells: [], isLegal: false }

    const oriented = getPieceOrientation(piece, piece.rotIndex, piece.flipped)
    const { anchorQ, anchorR } = parityAwareAnchor(hoverCell, oriented)
    const placed = placePieceCells(oriented, anchorQ, anchorR)

    const isFirst = !currentPlayer.pieces.some(p => p.placed)
    const { legal } = isLegalPlacement(
      gameState.board.cells,
      placed,
      currentPlayer.id,
      isFirst,
      getGameOptions(gameState),
    )

    return { cells: placed, isLegal: legal }
  }, [hoverCell, selectedPieceId, currentPlayer, gameState, getSelectedPiece])

  return {
    // Connection state
    connected,
    roomCode,
    roomMode,
    maxPlayersInRoom,
    myHumanId,
    isHostPlayer,
    roomPlayers,
    settings,
    roomPhase,
    connectionError,

    // Room actions
    createRoom: createRoomAction,
    joinRoom: joinRoomAction,
    updateSettings: updateSettingsAction,
    startGame: startGameAction,
    selectColor: selectColorAction,
    disconnect,

    // Game interface (mirrors useGameState)
    state: mergedState,
    currentPlayer,
    getSelectedPiece,
    getGhostCells,
    selectPiece,
    deselectPiece,
    rotatePiece,
    flipPiece,
    setHover,
    placePiece,
    confirmPlacement,
    cancelPlacement,
    dismissNoMoves,
    requestEndGame,
    confirmEndGame,
    cancelEndGame,
    newGame,
    isMyTurn,
  }
}
