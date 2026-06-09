import { useEffect } from 'react'
import { playSound } from '../utils/sounds.js'

/**
 * Listens for keyboard shortcuts during gameplay.
 * Only active when a piece is selected (or for Escape to deselect).
 *
 * R       → rotate piece 60° CW
 * F       → flip piece (mirror)
 * Escape  → deselect piece / cancel pending placement
 * Enter   → confirm pending placement
 * Arrow keys → could nudge hover cell (future enhancement; for now just intercepted)
 */
export function useKeyboard({
  selectedPieceId,
  pendingPlacement,
  waitingForEndTurn,
  onRotate,
  onRotateReverse,
  onFlip,
  onToggleHover,
  onToggleEnhancedColoring,
  onToggleAutoAdvance,
  onArrowLeft,
  onArrowRight,
  onArrowUp,
  onArrowDown,
  onShiftUp,
  onShiftDown,
  onPlace,
  onDeselect,
  onConfirmPlacement,
  onCancelPlacement,
  onEndTurn,
  isTouchDevice,
  active,
}) {
  useEffect(() => {
    if (!active) return

    const handler = (e) => {
      // Don't fire if user is typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return

      // Shift+Enter → End Turn (works any time it's your turn)
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault()
        onEndTurn?.()
        return
      }

      // Enter → Place the penciled (stuck) piece in mobile layout.
      // Mirrors the on-screen "Place" button; onPlace itself guards on a legal ghost.
      if (e.key === 'Enter' && !e.shiftKey && isTouchDevice && selectedPieceId && !pendingPlacement) {
        e.preventDefault()
        onPlace?.()
        return
      }

      // C → toggle enhanced coloring (works any time during play)
      if ((e.key === 'c' || e.key === 'C') && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        playSound('home-lobby')
        onToggleEnhancedColoring?.()
        return
      }

      // A → toggle auto advance (works any time during play)
      if ((e.key === 'a' || e.key === 'A') && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        playSound('home-lobby')
        onToggleAutoAdvance?.()
        return
      }

      // Shift+Up/Down → expand/collapse mobile HUD
      if (e.key === 'ArrowUp' && e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        onShiftUp?.()
        return
      }
      if (e.key === 'ArrowDown' && e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        onShiftDown?.()
        return
      }

      // Arrow Up/Down → move ghost piece (mobile) or no-op (desktop)
      if (e.key === 'ArrowUp' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        onArrowUp?.()
        return
      }
      if (e.key === 'ArrowDown' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        onArrowDown?.()
        return
      }

      // Arrow Left/Right → move ghost (mobile) or open/close piece panel (desktop)
      if (e.key === 'ArrowRight' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        if (!isTouchDevice) playSound('home-lobby')
        onArrowRight?.()
        return
      }
      if (e.key === 'ArrowLeft' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        if (!isTouchDevice) playSound('home-lobby')
        onArrowLeft?.()
        return
      }

      if (pendingPlacement) {
        // In confirmation mode: Enter confirms, Escape cancels
        if (e.key === 'Enter') {
          e.preventDefault()
          playSound('place-piece')
          onConfirmPlacement()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          playSound('2-deselect-piece')
          onCancelPlacement()
        }
        return
      }

      // Once waiting for end turn, only allow Shift+Enter (handled above)
      if (waitingForEndTurn) return

      if (!selectedPieceId) return

      switch (e.key) {
        case 'r':
        case 'R':
          e.preventDefault()
          playSound('home-lobby')
          if (e.shiftKey) {
            onRotateReverse?.()
          } else {
            onRotate()
          }
          break
        case 'f':
        case 'F':
          e.preventDefault()
          playSound('home-lobby')
          onFlip()
          break
        case 'h':
        case 'H':
          e.preventDefault()
          playSound('home-lobby')
          onToggleHover()
          break
        case 'Escape':
          e.preventDefault()
          playSound('2-deselect-piece')
          onDeselect()
          break
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [
    active,
    selectedPieceId,
    pendingPlacement,
    waitingForEndTurn,
    onRotate,
    onRotateReverse,
    onFlip,
    onToggleHover,
    onToggleEnhancedColoring,
    onToggleAutoAdvance,
    onArrowLeft,
    onArrowRight,
    onArrowUp,
    onArrowDown,
    onShiftUp,
    onShiftDown,
    onPlace,
    isTouchDevice,
    onDeselect,
    onConfirmPlacement,
    onCancelPlacement,
    onEndTurn,
  ])
}
