import { useEffect } from 'react'

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
  onDeselect,
  onConfirmPlacement,
  onCancelPlacement,
  onEndTurn,
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

      // C → toggle enhanced coloring (works any time during play)
      if ((e.key === 'c' || e.key === 'C') && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        onToggleEnhancedColoring?.()
        return
      }

      // A → toggle auto advance (works any time during play)
      if ((e.key === 'a' || e.key === 'A') && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        onToggleAutoAdvance?.()
        return
      }

      // Arrow keys → open/close piece control panel (works any time during play)
      if (e.key === 'ArrowRight' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        onArrowRight?.()
        return
      }
      if (e.key === 'ArrowLeft' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        onArrowLeft?.()
        return
      }

      if (pendingPlacement) {
        // In confirmation mode: Enter confirms, Escape cancels
        if (e.key === 'Enter') {
          e.preventDefault()
          onConfirmPlacement()
        } else if (e.key === 'Escape') {
          e.preventDefault()
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
          if (e.shiftKey) {
            onRotateReverse?.()
          } else {
            onRotate()
          }
          break
        case 'f':
        case 'F':
          e.preventDefault()
          onFlip()
          break
        case 'h':
        case 'H':
          e.preventDefault()
          onToggleHover()
          break
        case 'Escape':
          e.preventDefault()
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
    onDeselect,
    onConfirmPlacement,
    onCancelPlacement,
    onEndTurn,
  ])
}
