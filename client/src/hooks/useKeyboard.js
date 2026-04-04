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
  onRotate,
  onFlip,
  onToggleHover,
  onDeselect,
  onConfirmPlacement,
  onCancelPlacement,
  active,
}) {
  useEffect(() => {
    if (!active) return

    const handler = (e) => {
      // Don't fire if user is typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return

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

      if (!selectedPieceId) return

      switch (e.key) {
        case 'r':
        case 'R':
          e.preventDefault()
          onRotate()
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
    onRotate,
    onFlip,
    onToggleHover,
    onDeselect,
    onConfirmPlacement,
    onCancelPlacement,
  ])
}
