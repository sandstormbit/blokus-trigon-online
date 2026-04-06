import { useState, useEffect, useRef } from 'react'
import styles from './AnimatedScore.module.css'

/**
 * Animates a numeric value: when it changes, the old value scrolls down and out
 * while the new value scrolls in from the top.
 */
export default function AnimatedScore({ value }) {
  const prevRef = useRef(value)
  const [state, setState] = useState({ curr: value, prev: null, key: 0 })

  useEffect(() => {
    if (value !== prevRef.current) {
      const old = prevRef.current
      prevRef.current = value
      setState(s => ({ curr: value, prev: old, key: s.key + 1 }))
      const t = setTimeout(() => setState(s => ({ ...s, prev: null })), 700)
      return () => clearTimeout(t)
    }
  }, [value])

  return (
    <span className={styles.wrapper}>
      {state.prev !== null && (
        <span key={`x-${state.key}`} className={styles.exit} aria-hidden="true">
          {state.prev}
        </span>
      )}
      <span key={`e-${state.key}`} className={state.key > 0 ? styles.enter : undefined}>
        {state.curr}
      </span>
    </span>
  )
}
