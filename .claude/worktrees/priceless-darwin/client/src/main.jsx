import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/global.css'

// ── Global button bounce (click & keyboard) ──
function triggerBounce(btn) {
  if (!btn || btn.disabled) return
  btn.classList.remove('btn-bounce')
  void btn.offsetWidth // force reflow to restart animation
  btn.classList.add('btn-bounce')
  btn.addEventListener('animationend', () => btn.classList.remove('btn-bounce'), { once: true })
}

document.addEventListener('click', e => {
  const btn = e.target.closest('button:not([disabled])')
  if (btn) triggerBounce(btn)
})

document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return
  const el = document.activeElement
  if (el?.tagName === 'BUTTON' && !el.disabled) triggerBounce(el)
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
