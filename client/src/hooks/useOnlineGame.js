/**
 * useOnlineGame
 *
 * Manages the socket.io connection and online game state.
 * Exposes the same interface as useGameState so GameScreen can be reused
 * without changes. Local UI state (selection, hover, pending) is kept
 * client-side for responsiveness; placement is validated locally first,
 * then committed via the server.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { io } from 'socket.io-client'
import { getPieceOrientation, placePieceCells } from '../game/pieces.js'
import { isLegalPlacement } from '../game/gameLogic.js'
import { playSound } from '../utils/sounds.js'

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
  // True once we've successfully joined/created a room. Used to re-join on reconnect.
  const isInRoomRef = useRef(false)

  // Connection / room state
  const [connected, setConnected] = useState(false)
  // True while an auto-reconnect attempt is in flight (prevents landing-page flash on refresh)
  const [isReconnecting, setIsReconnecting] = useState(() => {
    const token = localStorage.getItem('bt_session_token')
    const storedRoom = localStorage.getItem('bt_room_code')
    const urlJoinCode = new URLSearchParams(window.location.search).get('join')?.toUpperCase() || null
    return !!(token && storedRoom && (!urlJoinCode || urlJoinCode === storedRoom))
  })
  const [roomCode, setRoomCode] = useState(null)
  const [roomMode, setRoomMode] = useState('public')
  const [maxPlayersInRoom, setMaxPlayersInRoom] = useState(4)
  const [myHumanId, setMyHumanId] = useState(null)
  const [myToken, setMyToken] = useState(() => localStorage.getItem('bt_session_token') || null)
  const [isHostPlayer, setIsHostPlayer] = useState(false)
  const [roomPlayers, setRoomPlayers] = useState([])  // waiting room player list
  const [settings, setSettings] = useState({ gameModes: {} })
  const [roomPhase, setRoomPhase] = useState('disconnected')  // 'disconnected' | 'waiting' | 'playing' | 'ended' | 'spectating'
  const [connectionError, setConnectionError] = useState(null)
  const [isSpectator, setIsSpectator] = useState(false)

  // Modals driven by socket events
  const [spectatorModalData, setSpectatorModalData] = useState(null)   // { roomCode, phase, aiSlots? }
  const [disconnectReplaceData, setDisconnectReplaceData] = useState(null) // { humanId, playerName }
  const [claimSlotData, setClaimSlotData] = useState(null)             // { aiHumanId, replacedName, roomCode }

  // Authoritative game state from server
  const [gameState, setGameState] = useState(null)

  // Move history — accumulated client-side by watching lastPlacedCells changes
  const [moveHistory, setMoveHistory] = useState([])
  const lastPlacedCellsRef = useRef(null)

  // Local UI state (purely client-side, no server sync)
  const [selectedPieceId, setSelectedPieceId] = useState(null)
  const [hoverCell, setHoverCell] = useState(null)
  const [pendingPlacement, setPendingPlacement] = useState(null)

  // Live cursors for other players: { [humanId]: { hoverCell, selectedPieceId, rotIndex, flipped } }
  const [otherPlayersCursors, setOtherPlayersCursors] = useState({})

  // Refs to access latest values inside socket event handlers (which are bound once)
  const myHumanIdRef = useRef(myHumanId)
  useEffect(() => { myHumanIdRef.current = myHumanId }, [myHumanId])
  // Cursor emission refs — track latest state without re-creating the interval
  const cursorStateRef = useRef(null)
  const cursorVersionRef = useRef(0)
  const lastEmittedCursorVersionRef = useRef(-1)
  // Sound detection refs for other players' actions
  const prevOtherCursorsRef = useRef({})
  const prevGameLastPlacedIdRef = useRef(null)
  const prevGameLastPlacedHumanIdRef = useRef(null)
  const recentlyPlacedOtherHumanIds = useRef(new Set())

  // ── Socket initialization ───────────────────────────────────────────────────
  useEffect(() => {
    const socket = io(SERVER_URL, {
      autoConnect: false,
      withCredentials: true,
    })

    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      // Re-join the room whenever the socket reconnects (e.g. after the browser
      // was backgrounded on mobile).  isInRoomRef is only true after a successful
      // create/join, so this is a no-op on the very first connection.
      if (!isInRoomRef.current) return
      const token    = localStorage.getItem('bt_session_token')
      const roomCode = localStorage.getItem('bt_room_code')
      if (!token || !roomCode) return
      socket.emit('join_room', { roomCode, playerName: '', sessionToken: token }, (res) => {
        if (!res.ok) {
          localStorage.removeItem('bt_room_code')
          isInRoomRef.current = false
          return
        }
        if (res.maxPlayers)  setMaxPlayersInRoom(res.maxPlayers)
        if (res.humanId)     setMyHumanId(res.humanId)
        setIsHostPlayer(res.isHost || false)
        if (res.players)     setRoomPlayers(res.players)
        if (res.settings)    setSettings(res.settings)
        setRoomPhase(res.phase)
        if (res.gameState)   setGameState(deserializeState(res.gameState))
      })
    })
    socket.on('disconnect', () => setConnected(false))
    socket.on('connect_error', (err) => {
      setConnectionError(err.message)
      setIsReconnecting(false)
    })

    // ── Waiting room events ───────────────────────────────────────────────────
    socket.on('player_joined', ({ players }) => setRoomPlayers(players))
    socket.on('player_reconnected', ({ players }) => {
      setRoomPlayers(players)
      const me = players.find(p => p.humanId === myHumanIdRef.current)
      if (me) setIsHostPlayer(me.isHost)
    })
    socket.on('player_disconnected', ({ players }) => {
      setRoomPlayers(players)
      const me = players.find(p => p.humanId === myHumanIdRef.current)
      if (me) setIsHostPlayer(me.isHost)
    })

    // ── AI / spectator events ─────────────────────────────────────────────────
    socket.on('player_replaced_by_ai', ({ players }) => setRoomPlayers(players))
    socket.on('host_transferred', ({ players }) => {
      setRoomPlayers(players)
      const me = players.find(p => p.humanId === myHumanIdRef.current)
      if (me) setIsHostPlayer(me.isHost)
    })
    socket.on('player_replace_prompt', ({ humanId, playerName }) => {
      setDisconnectReplaceData({ humanId, playerName })
    })
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
      setOtherPlayersCursors({})
      setMoveHistory([])
      lastPlacedCellsRef.current = null
      prevOtherCursorsRef.current = {}
      prevGameLastPlacedIdRef.current = null
      prevGameLastPlacedHumanIdRef.current = null
      recentlyPlacedOtherHumanIds.current = new Set()
    })

    socket.on('game_state_update', ({ gameState: raw }) => {
      const state = deserializeState(raw)

      // Sound detection for other players' placement/removal
      const prevLastId = prevGameLastPlacedIdRef.current
      const newLastId = state.lastPlacedPlayerId ?? null
      if (newLastId !== prevLastId) {
        if (newLastId !== null) {
          const placingPlayer = state.players.find(p => p.id === newLastId)
          const placerHumanId = placingPlayer?.humanId ?? null
          prevGameLastPlacedHumanIdRef.current = placerHumanId
          if (placerHumanId !== null && placerHumanId !== myHumanIdRef.current) {
            playSound('place-piece')
            recentlyPlacedOtherHumanIds.current.add(placerHumanId)
          }
        } else {
          const removerHumanId = prevGameLastPlacedHumanIdRef.current
          if (removerHumanId !== null && removerHumanId !== myHumanIdRef.current) {
            playSound('remove-piece')
          }
          prevGameLastPlacedHumanIdRef.current = null
        }
      }
      prevGameLastPlacedIdRef.current = newLastId

      setGameState(state)
      setSelectedPieceId(null)
      setHoverCell(null)
      setPendingPlacement(null)
      if (state.phase === 'ended') setRoomPhase('ended')
      // Track move history from lastPlacedCells changes
      if (state.lastPlacedCells && state.lastPlacedPlayerId) {
        if (state.lastPlacedCells !== lastPlacedCellsRef.current) {
          lastPlacedCellsRef.current = state.lastPlacedCells
          setMoveHistory(prev => [...prev, { playerId: state.lastPlacedPlayerId, cells: state.lastPlacedCells }])
        }
      } else if (!state.lastPlacedCells) {
        // Piece was removed (undo) — remove last history entry
        if (lastPlacedCellsRef.current !== null) {
          lastPlacedCellsRef.current = null
          setMoveHistory(prev => prev.slice(0, -1))
        }
      }
    })

    // ── Live cursor from another player ───────────────────────────────────────
    socket.on('player_cursor_update', ({ humanId, hoverCell, selectedPieceId, rotIndex, flipped }) => {
      const prevCursor = prevOtherCursorsRef.current[humanId]
      const prevSelected = prevCursor?.selectedPieceId ?? null
      if (prevSelected === null && selectedPieceId !== null) {
        playSound('1-select-piece')
      } else if (prevSelected !== null && selectedPieceId === null) {
        if (recentlyPlacedOtherHumanIds.current.has(humanId)) {
          recentlyPlacedOtherHumanIds.current.delete(humanId)
        } else {
          playSound('2-deselect-piece')
        }
      }
      prevOtherCursorsRef.current = { ...prevOtherCursorsRef.current, [humanId]: { hoverCell, selectedPieceId, rotIndex, flipped } }
      setOtherPlayersCursors(prev => ({
        ...prev,
        [humanId]: { hoverCell, selectedPieceId, rotIndex, flipped },
      }))
    })

    // ── Auto-reconnect on mount if session data is stored ───────────────────
    const storedToken = localStorage.getItem('bt_session_token')
    const storedRoomCode = localStorage.getItem('bt_room_code')

    // Bug 4: If the URL is asking to join a DIFFERENT room, skip auto-reconnect
    // so the landing page can open the join modal for the correct room.
    const urlJoinCode = new URLSearchParams(window.location.search).get('join')?.toUpperCase() || null
    const shouldAutoReconnect = storedToken && storedRoomCode &&
      (!urlJoinCode || urlJoinCode === storedRoomCode)

    if (shouldAutoReconnect) {
      socket.connect()
      const attemptReconnect = () => {
        socket.emit('join_room', { roomCode: storedRoomCode, playerName: '', sessionToken: storedToken }, (res) => {
          setIsReconnecting(false)
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
          isInRoomRef.current = true
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

  // ── Update cursor state ref (for emission) ──────────────────────────────────
  // Runs whenever my hover/selection/rotation/flip changes
  useEffect(() => {
    if (!gameState) return
    const currentPlayer = gameState.players[gameState.currentPlayerIndex]
    if (currentPlayer?.humanId !== myHumanId) return

    const piece = currentPlayer.pieces.find(p => p.id === selectedPieceId)
    cursorStateRef.current = {
      hoverCell: hoverCell || null,
      selectedPieceId: selectedPieceId || null,
      rotIndex: piece?.rotIndex ?? 0,
      flipped: piece?.flipped ?? false,
    }
    cursorVersionRef.current++
  }, [hoverCell, selectedPieceId, gameState, myHumanId])

  // ── Emit cursor at ~20fps ───────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      const socket = socketRef.current
      if (!socket || !cursorStateRef.current) return
      if (cursorVersionRef.current === lastEmittedCursorVersionRef.current) return
      lastEmittedCursorVersionRef.current = cursorVersionRef.current
      socket.emit('cursor_update', cursorStateRef.current)
    }, 50)
    return () => clearInterval(interval)
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
        isInRoomRef.current = true
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
      socket.off('connect_error', onConnectError)
      socket.emit('join_room', { roomCode, playerName, sessionToken: token }, (res) => {
        if (!res.ok) {
          callback?.({ error: res.error })
          return
        }

        // Server offered us the chance to claim an AI slot (we reconnected after AI replaced us)
        if (res.canClaimAISlot) {
          setRoomCode(res.roomCode)
          setRoomPlayers(res.players || [])
          if (res.gameState) setGameState(deserializeState(res.gameState))
          setClaimSlotData({ aiHumanId: res.aiHumanId, replacedName: res.replacedName, roomCode: res.roomCode })
          callback?.({ ok: true, pendingAction: 'claim_slot' })
          return
        }

        // Room full or in progress — server is offering spectate/AI-slot options
        if (res.canSpectate || res.hasAISlots || res.hasOpenSlots) {
          setSpectatorModalData({
            roomCode: res.roomCode,
            phase: res.phase,
            aiSlots: res.aiSlots || null,
            openSlots: res.openSlots || null,
            playerName,
          })
          if (res.gameState) setGameState(deserializeState(res.gameState))
          callback?.({ ok: true, pendingAction: 'spectate_or_join' })
          return
        }

        localStorage.setItem('bt_session_token', res.token)
        localStorage.setItem('bt_player_name', playerName)
        localStorage.setItem('bt_room_code', res.roomCode)
        setMyToken(res.token)
        setRoomCode(res.roomCode)
        setRoomMode('unknown')
        setMaxPlayersInRoom(res.maxPlayers || (res.players?.length > 0 ? res.players[res.players.length - 1].humanId : 4))
        setMyHumanId(res.humanId)
        setIsHostPlayer(res.isHost)
        setRoomPlayers(res.players || [])
        setSettings(res.settings || { gameModes: {} })
        setRoomPhase(res.phase)

        if (res.gameState) {
          setGameState(deserializeState(res.gameState))
        }
        isInRoomRef.current = true
        callback?.({ ok: true, roomCode: res.roomCode })
      })
    }

    const onConnectError = (err) => {
      socket.off('connect', emitJoin)
      callback?.({ error: err?.message || 'connection_failed' })
    }

    if (socket.connected) {
      emitJoin()
    } else {
      socket.once('connect', emitJoin)
      socket.once('connect_error', onConnectError)
    }
  }, [myToken])

  // ── AI / Spectator actions ──────────────────────────────────────────────────

  const addAIPlayerAction = useCallback((difficulty = 'normal') => {
    socketRef.current?.emit('add_ai_player', { difficulty }, (res) => {
      if (!res?.ok) console.warn('add_ai_player rejected:', res?.error)
    })
  }, [])

  const removeAIPlayerAction = useCallback((humanId) => {
    socketRef.current?.emit('remove_ai_player', { humanId }, (res) => {
      if (!res?.ok) console.warn('remove_ai_player rejected:', res?.error)
    })
  }, [])

  const setAIDifficultyAction = useCallback((humanId, difficulty) => {
    socketRef.current?.emit('set_ai_difficulty', { humanId, difficulty }, (res) => {
      if (!res?.ok) console.warn('set_ai_difficulty rejected:', res?.error)
    })
  }, [])

  const spectateGameAction = useCallback((code, playerName, callback) => {
    const socket = socketRef.current
    if (!socket) return
    socket.emit('spectate_game', { roomCode: code, playerName }, (res) => {
      if (!res?.ok) { callback?.({ error: res?.error }); return }
      setRoomCode(res.roomCode)
      setRoomPlayers(res.players || [])
      setRoomPhase('spectating')
      setIsSpectator(true)
      setSpectatorModalData(null)
      if (res.gameState) setGameState(deserializeState(res.gameState))
      callback?.({ ok: true })
    })
  }, [])

  const takeAISlotAction = useCallback((code, aiHumanId, playerName, callback) => {
    const socket = socketRef.current
    if (!socket) return
    const token = myToken
    socket.emit('take_ai_slot', { roomCode: code, aiHumanId, playerName, sessionToken: token }, (res) => {
      if (!res?.ok) { callback?.({ error: res?.error }); return }
      localStorage.setItem('bt_session_token', res.token)
      localStorage.setItem('bt_room_code', res.roomCode)
      setMyToken(res.token)
      setRoomCode(res.roomCode)
      setMaxPlayersInRoom(res.maxPlayers || 4)
      setMyHumanId(res.humanId)
      setIsHostPlayer(res.isHost || false)
      setRoomPlayers(res.players || [])
      setSettings(res.settings || { gameModes: {} })
      setRoomPhase(res.phase)
      setSpectatorModalData(null)
      callback?.({ ok: true })
    })
  }, [myToken])

  const claimAISlotAction = useCallback((callback) => {
    const socket = socketRef.current
    const data = claimSlotData
    if (!socket || !data) return
    const token = myToken || localStorage.getItem('bt_session_token')
    socket.emit('claim_ai_slot', { roomCode: data.roomCode, sessionToken: token }, (res) => {
      if (!res?.ok) { callback?.({ error: res?.error }); return }
      setMyHumanId(res.humanId)
      setIsHostPlayer(res.isHost || false)
      setRoomPlayers(res.players || [])
      setRoomPhase('playing')
      setClaimSlotData(null)
      if (res.gameState) setGameState(deserializeState(res.gameState))
      callback?.({ ok: true })
    })
  }, [claimSlotData, myToken])

  const replaceWithAIAction = useCallback((humanId, difficulty = 'normal') => {
    socketRef.current?.emit('replace_with_ai', { humanId, difficulty }, (res) => {
      if (!res?.ok) console.warn('replace_with_ai rejected:', res?.error)
      setDisconnectReplaceData(null)
    })
  }, [])

  const dismissDisconnectPrompt = useCallback(() => {
    setDisconnectReplaceData(null)
  }, [])

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
    socketRef.current?.emit('select_color', { color: color || null, slotIdx: 0 })
    // Optimistic update
    setRoomPlayers(prev => prev.map(p =>
      p.humanId === myHumanId ? { ...p, color: color || null } : p
    ))
  }, [myHumanId])

  const selectColorSlotAction = useCallback((slotIdx, color) => {
    socketRef.current?.emit('select_color', { color: color || null, slotIdx })
    // Optimistic update
    setRoomPlayers(prev => prev.map(p => {
      if (p.humanId !== myHumanId) return p
      if (slotIdx === 1) return { ...p, color2: color || null }
      return { ...p, color: color || null }
    }))
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

  const rotatePieceReverse = useCallback(() => {
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
                ? { ...pc, rotIndex: (pc.rotIndex + 5) % 6 }
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

  const confirmSkip = useCallback(() => {
    socketRef.current?.emit('voluntary_skip', {}, (res) => {
      if (!res.ok) console.warn('voluntary_skip rejected:', res.error)
    })
  }, [])

  const removePiece = useCallback(() => {
    socketRef.current?.emit('remove_piece', {}, (res) => {
      if (!res?.ok) console.warn('remove_piece rejected:', res?.error)
    })
  }, [])

  const endTurn = useCallback(() => {
    socketRef.current?.emit('end_turn', {}, (res) => {
      if (!res.ok) console.warn('end_turn rejected:', res.error)
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

  const goToGameLobby = useCallback(() => {
    socketRef.current?.emit('rejoin_lobby', {}, (res) => {
      if (res?.ok === false) console.warn('rejoin_lobby rejected:', res.error)
    })
    setRoomPhase('waiting')
  }, [])

  const newGame = goToGameLobby

  const disconnect = useCallback(() => {
    isInRoomRef.current = false
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
    setIsSpectator(false)
    setSelectedPieceId(null)
    setHoverCell(null)
    setPendingPlacement(null)
    setSpectatorModalData(null)
    setDisconnectReplaceData(null)
    setClaimSlotData(null)
  }, [])

  // During a live game: convert slot to open AI before disconnecting so others can rejoin.
  // During waiting/ended: just disconnect.
  const leaveGame = useCallback(() => {
    const socket = socketRef.current
    if (socket?.connected && roomPhase === 'playing') {
      socket.emit('leave_game', {}, () => disconnect())
    } else {
      disconnect()
    }
  }, [roomPhase, disconnect])

  const takeOpenSlotAction = useCallback((code, aiHumanId, playerName, callback) => {
    const socket = socketRef.current
    if (!socket) return

    socket.connect()

    const doTake = () => {
      socket.off('connect_error', onTakeError)
      socket.emit('take_open_slot', { roomCode: code, aiHumanId, playerName }, (res) => {
        if (!res?.ok) { callback?.({ error: res?.error || 'unknown' }); return }
        localStorage.setItem('bt_session_token', res.token)
        localStorage.setItem('bt_room_code', res.roomCode)
        setMyToken(res.token)
        setRoomCode(res.roomCode)
        setMyHumanId(res.humanId)
        setIsHostPlayer(res.isHost || false)
        setRoomPlayers(res.players || [])
        setSettings(res.settings || { gameModes: {} })
        setRoomPhase(res.phase)
        setSpectatorModalData(null)
        if (res.gameState) setGameState(deserializeState(res.gameState))
        callback?.({ ok: true })
      })
    }

    const onTakeError = (err) => {
      socket.off('connect', doTake)
      callback?.({ error: err?.message || 'connection_failed' })
    }

    if (socket.connected) {
      doTake()
    } else {
      socket.once('connect', doTake)
      socket.once('connect_error', onTakeError)
    }
  }, [])

  // ── Derived helpers (match useGameState interface) ────────────────────────────
  const mergedState = gameState ? {
    ...gameState,
    selectedPieceId,
    hoverCell,
    pendingPlacement,
    moveHistory,
  } : null

  // ── Ghost pieces for other players' live cursors ───────────────────────────
  const otherPlayersGhosts = useMemo(() => {
    if (!gameState || !otherPlayersCursors) return []
    const currentPlayer = gameState.players[gameState.currentPlayerIndex]
    if (!currentPlayer) return []

    const result = []
    for (const [humanIdStr, cursor] of Object.entries(otherPlayersCursors)) {
      const humanId = parseInt(humanIdStr)
      // Only show cursor for whoever is currently playing
      if (currentPlayer.humanId !== humanId) continue
      if (humanId === myHumanId) continue // don't show our own cursor back to us
      if (!cursor.hoverCell || cursor.selectedPieceId == null) continue

      const piece = currentPlayer.pieces.find(p => p.id === cursor.selectedPieceId)
      if (!piece || piece.placed) continue

      const pieceCopy = { ...piece, rotIndex: cursor.rotIndex ?? 0, flipped: cursor.flipped ?? false }
      const oriented = getPieceOrientation(pieceCopy, pieceCopy.rotIndex, pieceCopy.flipped)

      // Parity-aware anchor
      const hoverParity = ((cursor.hoverCell.q + cursor.hoverCell.r) % 2 + 2) % 2
      const matchCell = oriented.find(c => ((c.dq + c.dr) % 2 + 2) % 2 === hoverParity)
      const anchor = matchCell || oriented[0]
      const anchorQ = cursor.hoverCell.q - anchor.dq
      const anchorR = cursor.hoverCell.r - anchor.dr

      const cells = placePieceCells(oriented, anchorQ, anchorR)
      result.push({ cells, color: currentPlayer.color, humanId })
    }
    return result
  }, [gameState, otherPlayersCursors, myHumanId])

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
    isReconnecting,
    roomCode,
    roomMode,
    maxPlayersInRoom,
    myHumanId,
    isHostPlayer,
    roomPlayers,
    settings,
    roomPhase,
    connectionError,
    isSpectator,

    // Modal state driven by server events
    spectatorModalData,
    disconnectReplaceData,
    claimSlotData,

    // Room actions
    createRoom: createRoomAction,
    joinRoom: joinRoomAction,
    updateSettings: updateSettingsAction,
    startGame: startGameAction,
    selectColor: selectColorAction,
    selectColorSlot: selectColorSlotAction,
    disconnect,
    leaveGame,
    goToGameLobby,

    // AI / spectator actions
    addAIPlayer: addAIPlayerAction,
    removeAIPlayer: removeAIPlayerAction,
    setAIDifficulty: setAIDifficultyAction,
    spectateGame: spectateGameAction,
    takeAISlot: takeAISlotAction,
    takeOpenSlot: takeOpenSlotAction,
    claimAISlot: claimAISlotAction,
    replaceWithAI: replaceWithAIAction,
    dismissDisconnectPrompt,

    // Game interface (mirrors useGameState)
    state: mergedState,
    currentPlayer,
    getSelectedPiece,
    getGhostCells,
    selectPiece,
    deselectPiece,
    rotatePiece,
    rotatePieceReverse,
    flipPiece,
    setHover,
    placePiece,
    confirmPlacement,
    cancelPlacement,
    dismissNoMoves,
    confirmSkip,
    removePiece,
    endTurn,
    requestEndGame,
    confirmEndGame,
    cancelEndGame,
    newGame,
    isMyTurn,
    otherPlayersGhosts,
  }
}
