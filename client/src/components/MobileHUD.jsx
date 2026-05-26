import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import PiecePreview from './PiecePreview.jsx'
import { PLAYER_COLORS } from '../hooks/useGameState.js'
import styles from './MobileHUD.module.css'
import { playSound } from '../utils/sounds.js'


/**
 * Bottom HUD for mobile/tablet gameplay.
 *
 * Structure (top → bottom):
 *   1. Player tabs          — switch between players' piece views
 *   2. Piece carousel       — horizontally scrollable thumbnails (1 or 3 rows)
 *   3. Size toggles row     — [1] [2] [3] [4] [5] [6]  |  Total: N  [Show All]
 *
 * Interactions:
 *   • Tap a size toggle    → expand / collapse that size group in the carousel
 *   • Show All             → expand all; tap again to collapse all
 *   • Swipe up on handle   → expand HUD to 3 carousel rows; swipe down collapses
 *   • Tap a piece          → select it (only enabled when viewing own / current player's pieces)
 *
 * Props:
 *   players[]          all players in the game
 *   currentPlayerId    whose turn it is
 *   myPlayerId         local human's player id (null for pass-and-play)
 *   selectedPieceId    currently selected piece id (or null)
 *   onSelectPiece(id)  callback to select/deselect a piece
 *   isMyTurn           boolean — controls whether piece selection is enabled
 *   onRotateCW()       called when Rotate CW button is tapped
 *   onRotateCCW()      called when Rotate CCW button is tapped
 *   onFlip()           called when Flip button is tapped
 */
export default function MobileHUD({
  players,
  currentPlayerId,
  myPlayerId,
  selectedPieceId,
  onSelectPiece,
  isMyTurn,
  onRotateCW,
  onRotateCCW,
  onFlip,
  // Action bar (merged into control row)
  onPlace,
  canPlace,
  placeColor,
  onPickUp,
  canPickUp,
  onEndTurn,
  showEndTurn,
}) {
  // ── Which player's pieces are being viewed ────────────────────────────────
  const [activeTabId, setActiveTabId] = useState(null)
  const prevCurrentPlayerIdRef = useRef(null)

  // Auto-switch tab when it becomes your turn, if the tab is still on the right player
  useEffect(() => {
    if (!players.length) return
    const ownId = myPlayerId ?? currentPlayerId
    if (activeTabId === null) {
      setActiveTabId(ownId)
      return
    }
    // If the current player changed, switch to whoever's turn it now is (own player only)
    if (currentPlayerId !== prevCurrentPlayerIdRef.current) {
      if (!myPlayerId) {
        // Pass-and-play: always follow the active player
        setActiveTabId(currentPlayerId)
      }
      // Online: stay on own tab unless user hasn't set one yet
    }
    prevCurrentPlayerIdRef.current = currentPlayerId
  }, [currentPlayerId, players, myPlayerId]) // eslint-disable-line react-hooks/exhaustive-deps

  const activePlayer = useMemo(
    () => players.find(p => p.id === activeTabId) || players[0],
    [players, activeTabId]
  )

  // ── Size toggle state (single-select) ───────────────────────────────────
  // null = Show All; a number = only that size is shown in the carousel
  const [selectedSize, setSelectedSize] = useState(null)

  const toggleSize = useCallback(size => {
    setSelectedSize(prev => prev === size ? null : size)
  }, [])

  const handleShowAll = useCallback(() => {
    setSelectedSize(null)
  }, [])

  // ── HUD expansion (swipe-up) ──────────────────────────────────────────────
  const [expanded, setExpanded] = useState(false)
  const dragRef = useRef({ startY: 0, dragging: false })

  const handleHandlePointerDown = useCallback(e => {
    dragRef.current = { startY: e.clientY, dragging: true }
  }, [])

  const handleHandlePointerMove = useCallback(e => {
    if (!dragRef.current.dragging) return
    const dy = dragRef.current.startY - e.clientY
    if (dy > 30)  { setExpanded(true);  dragRef.current.dragging = false }
    if (dy < -30) { setExpanded(false); dragRef.current.dragging = false }
  }, [])

  const handleHandlePointerUp = useCallback(() => {
    dragRef.current.dragging = false
  }, [])

  // Also allow a simple tap on the handle to toggle
  const handleHandleTap = useCallback(() => {
    setExpanded(v => !v)
  }, [])

  // ── Piece data for the active tab ─────────────────────────────────────────
  const pieceGroups = useMemo(() => {
    if (!activePlayer) return []
    const remaining = activePlayer.pieces.filter(p => !p.placed)
    const groups = {}
    for (const piece of remaining) {
      if (!groups[piece.size]) groups[piece.size] = []
      groups[piece.size].push(piece)
    }
    // Largest → smallest (6 down to 1)
    return Object.entries(groups)
      .sort(([a], [b]) => Number(b) - Number(a))
      .map(([size, pieces]) => ({ size: Number(size), pieces }))
  }, [activePlayer])

  const totalRemaining = useMemo(
    () => pieceGroups.reduce((s, g) => s + g.pieces.length, 0),
    [pieceGroups]
  )

  // Pieces visible in the carousel — all sizes when selectedSize is null, else only that size
  const carouselPieces = useMemo(
    () => selectedSize === null
      ? pieceGroups.flatMap(g => g.pieces)
      : (pieceGroups.find(g => g.size === selectedSize)?.pieces ?? []),
    [pieceGroups, selectedSize]
  )

  // ── Interactability ───────────────────────────────────────────────────────
  // The player can only select pieces on their own tab AND on their own turn
  const ownId = myPlayerId ?? currentPlayerId
  const isOwnTab = activeTabId === ownId || activeTabId === currentPlayerId
  const canSelect = isOwnTab && isMyTurn

  const colorInfo = activePlayer ? PLAYER_COLORS[activePlayer.color] : null
  const playerColor = colorInfo?.bg || 'var(--accent-blue)'

  // ── Size count map ────────────────────────────────────────────────────────
  const sizeCountMap = useMemo(() => {
    const map = {}
    for (const { size, pieces } of pieceGroups) map[size] = pieces.length
    return map
  }, [pieceGroups])

  return (
    <div
      className={`${styles.hud} ${expanded ? styles.hudExpanded : ''}`}
      style={{ '--player-color': playerColor }}
    >
      {/* ── Drag handle ─────────────────────────────────────────────────── */}
      <div
        className={styles.handle}
        onPointerDown={handleHandlePointerDown}
        onPointerMove={handleHandlePointerMove}
        onPointerUp={handleHandlePointerUp}
        onClick={handleHandleTap}
        aria-label={expanded ? 'Collapse HUD' : 'Expand HUD'}
      >
        <div className={styles.handleBar} />
      </div>

      {/* ── Control bar: Rotate / Flip + Place / Pick Up / End Turn ────────── */}
      <div className={styles.rotateBar}>
        {/* CCW rotate */}
        <button
          className={styles.rotBtn}
          onPointerDown={e => { e.preventDefault(); playSound('home-lobby'); onRotateCCW?.() }}
          type="button"
          aria-label="Rotate counter-clockwise"
        >
          <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor">
            <path fillRule="evenodd" d="M16 2a1 1 0 00-1 1v2.101a7.002 7.002 0 00-11.601 2.566 1 1 0 001.885.666A5.002 5.002 0 0114.001 7H11a1 1 0 000 2h5a1 1 0 001-1V3a1 1 0 00-1-1zm-.008 9.057a1 1 0 00-1.276.61A5.002 5.002 0 015.999 13H9a1 1 0 110-2H4a1 1 0 00-1 1v5a1 1 0 102 0v-2.101a7.002 7.002 0 0011.601-2.566 1 1 0 00-.61-1.276z" clipRule="evenodd"/>
          </svg>
          <span>R</span>
        </button>

        {/* CW rotate */}
        <button
          className={styles.rotBtn}
          onPointerDown={e => { e.preventDefault(); playSound('home-lobby'); onRotateCW?.() }}
          type="button"
          aria-label="Rotate clockwise"
        >
          <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor">
            <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd"/>
          </svg>
          <span>R</span>
        </button>

        {/* Flip */}
        <button
          className={styles.rotBtn}
          onPointerDown={e => { e.preventDefault(); playSound('home-lobby'); onFlip?.() }}
          type="button"
          aria-label="Flip piece"
        >
          <svg viewBox="0 0 20 14" width="18" height="14" fill="none">
            <path d="M5 12V2M2.5 4.5L5 2l2.5 2.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M15 2v10M12.5 9.5L15 12l2.5-2.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>F</span>
        </button>

        {/* Divider */}
        <div className={styles.ctrlDivider} />

        {/* Place */}
        <button
          className={`${styles.actionBtn} ${canPlace ? styles.placeBtnActive : styles.placeBtnDisabled}`}
          style={canPlace && placeColor ? { '--place-color': placeColor } : {}}
          disabled={!canPlace}
          onPointerDown={e => { if (!canPlace) return; e.preventDefault(); onPlace?.() }}
          type="button"
        >
          Place
        </button>

        {/* Pick Up */}
        <button
          className={`${styles.actionBtn} ${styles.pickUpBtn} ${!canPickUp ? styles.pickUpBtnDisabled : ''}`}
          disabled={!canPickUp}
          onPointerDown={e => { if (!canPickUp) return; e.preventDefault(); onPickUp?.() }}
          type="button"
        >
          Pick Up
        </button>

        {/* End Turn */}
        {showEndTurn && (
          <button
            className={`${styles.actionBtn} ${styles.endTurnBtnAction}`}
            onPointerDown={e => { e.preventDefault(); onEndTurn?.() }}
            type="button"
          >
            End Turn
          </button>
        )}
      </div>

      {/* ── Player tabs ──────────────────────────────────────────────────── */}
      <div className={styles.tabs}>
        {players.map(player => {
          const ci = PLAYER_COLORS[player.color]
          const isActive = player.id === activeTabId
          const isCurrent = player.id === currentPlayerId
          return (
            <button
              key={player.id}
              className={`${styles.tab} ${isActive ? styles.tabActive : ''} ${isCurrent && !isActive ? styles.tabCurrent : ''}`}
              style={(isActive || isCurrent) ? { '--tab-color': ci.bg } : {}}
              onPointerDown={() => {
                playSound('home-lobby')
                setActiveTabId(player.id)
              }}
              type="button"
              aria-label={`View ${player.name}'s pieces`}
            >
              <span
                className={`${styles.tabDot} ${isCurrent ? styles.tabDotCurrent : ''}`}
                style={{ background: ci.bg }}
              />
              <span className={styles.tabName}>
                {player.id === ownId ? 'You' : player.name.split(' ')[0]}
              </span>
            </button>
          )
        })}
      </div>

      {/* ── Piece carousel ──────────────────────────────────────────────── */}
      <div className={`${styles.carouselWrap} ${expanded ? styles.carouselWrapExpanded : ''}`}>
        {carouselPieces.length === 0 ? (
          <div className={styles.carouselEmpty}>
            {totalRemaining === 0 ? 'All pieces placed!' : 'Select a size group below'}
          </div>
        ) : (
          <div className={styles.carousel}>
            {carouselPieces.map(piece => {
              const isSelected = selectedPieceId === piece.id
              return (
                <button
                  key={piece.id}
                  className={`${styles.pieceBtn} ${isSelected ? styles.pieceBtnSelected : ''} ${!canSelect && !isSelected ? styles.pieceBtnDisabled : ''}`}
                  style={isSelected ? { '--piece-color': playerColor } : {}}
                  onPointerDown={() => {
                    if (!canSelect && !isSelected) return
                    playSound(isSelected ? '2-deselect-piece' : '1-select-piece')
                    onSelectPiece(piece.id)
                  }}
                  type="button"
                  aria-label={`Piece ${piece.id} (${piece.size} triangles)`}
                  title={`${piece.size}▲ piece`}
                >
                  <PiecePreview
                    piece={piece}
                    color={isSelected ? (colorInfo?.bg || '#3B82F6') : (colorInfo?.bg || '#3B82F6') + 'CC'}
                    colorDark={colorInfo?.dark || '#1D4ED8'}
                    size={40}
                    rotIndex={piece.rotIndex || 0}
                    flipped={piece.flipped || false}
                  />
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Size toggles row ────────────────────────────────────────────── */}
      <div className={styles.sizeRow}>
        <div className={styles.sizeToggles}>
          {/* Largest → smallest: 6 5 4 3 2 1 */}
          {[6, 5, 4, 3, 2, 1].map(size => {
            const count = sizeCountMap[size] ?? 0
            const isSelected = selectedSize === size
            const hasAny = count > 0
            return (
              <button
                key={size}
                className={`${styles.sizeBtn} ${isSelected && hasAny ? styles.sizeBtnExpanded : ''} ${!hasAny ? styles.sizeBtnEmpty : ''}`}
                onPointerDown={() => { if (hasAny) toggleSize(size) }}
                type="button"
                aria-label={`Size ${size}: ${count} remaining`}
                disabled={!hasAny}
              >
                <span className={styles.sizeBtnNum}>{size}</span>
                <span className={styles.sizeBtnCount}>{count}</span>
              </button>
            )
          })}
        </div>

        <div className={styles.sizeRight}>
          <span className={styles.totalLabel}>
            <span className={styles.totalNum}>{totalRemaining}</span>
            <span className={styles.totalTxt}> left</span>
          </span>
          <button
            className={`${styles.showAllBtn} ${selectedSize !== null ? styles.showAllBtnActive : ''}`}
            onPointerDown={handleShowAll}
            type="button"
            aria-label="Show all pieces"
          >
            Show All
          </button>
        </div>
      </div>
    </div>
  )
}
