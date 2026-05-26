import { useState, useEffect } from 'react'

function detect() {
  if (typeof window === 'undefined') return 'desktop'
  const w = window.innerWidth
  const hasTouch = navigator.maxTouchPoints > 0 || ('ontouchstart' in window)
  if (w < 768) return 'mobile'
  // Tablets: touch-enabled AND narrower than 1280px (covers iPads, Android tablets, etc.)
  if (hasTouch && w < 1280) return 'tablet'
  return 'desktop'
}

/**
 * Detects whether the current device is mobile, tablet, or desktop.
 * Updates automatically on resize and orientation change.
 *
 * Returns:
 *   deviceType: 'mobile' | 'tablet' | 'desktop'
 *   isMobile:     boolean
 *   isTablet:     boolean
 *   isDesktop:    boolean
 *   isTouchDevice: boolean  (mobile or tablet)
 */
export function useDeviceType() {
  const [deviceType, setDeviceType] = useState(detect)

  useEffect(() => {
    const handler = () => setDeviceType(detect())
    window.addEventListener('resize', handler)
    window.addEventListener('orientationchange', handler)
    return () => {
      window.removeEventListener('resize', handler)
      window.removeEventListener('orientationchange', handler)
    }
  }, [])

  return {
    deviceType,
    isMobile: deviceType === 'mobile',
    isTablet: deviceType === 'tablet',
    isDesktop: deviceType === 'desktop',
    isTouchDevice: deviceType !== 'desktop',
  }
}
