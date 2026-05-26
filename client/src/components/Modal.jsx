import React, { useEffect, useRef } from 'react'
import styles from './Modal.module.css'
import { playSound } from '../utils/sounds.js'

function triggerBounce(el) {
  if (!el) return
  el.classList.remove('btn-bounce')
  void el.offsetWidth
  el.classList.add('btn-bounce')
}

export default function Modal({ title, children, onClose, wide, headerActions, mobileFull }) {
  const closeBtnRef = useRef()

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape' && onClose) {
        triggerBounce(closeBtnRef.current)
        playSound('2-deselect-piece')
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget && onClose) { playSound('2-deselect-piece'); onClose() } }}>
      <div className={`${styles.modal} ${wide ? styles.wide : ''} ${mobileFull ? styles.mobileFull : ''} animate-fadeInScale`}>
        {title && (
          <div className={styles.header}>
            <h2 className={styles.title}>{title}</h2>
            <div className={styles.headerRight}>
              {headerActions}
              {onClose && (
                <button ref={closeBtnRef} className={styles.closeBtn} onClick={(e) => { triggerBounce(e.currentTarget); playSound('2-deselect-piece'); setTimeout(onClose, 350) }}>
                  <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}
        <div className={`${styles.body} ${mobileFull ? styles.mobileFullBody : ''}`}>
          {children}
        </div>
      </div>
    </div>
  )
}
