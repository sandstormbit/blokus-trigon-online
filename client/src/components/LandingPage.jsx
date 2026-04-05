import React, { useState, useEffect } from 'react'
import HowToPlayModal from './HowToPlayModal.jsx'
import styles from './LandingPage.module.css'

function triggerBounce(el) {
  if (!el) return
  el.classList.remove('btn-bounce')
  void el.offsetWidth
  el.classList.add('btn-bounce')
}

const SERVER_URL = import.meta.env.VITE_SERVER_URL || ''

export default function LandingPage({ onPassAndPlay, onCreateRoom, onJoinRoom }) {
  const [modal, setModal] = useState(null)  // null | 'create' | 'join' | 'how-to-play'

  // Create room form
  const [createMode, setCreateMode] = useState('public')
  const [createCount, setCreateCount] = useState(4)
  const [createName, setCreateName] = useState(() => localStorage.getItem('bt_player_name') || '')
  const [createError, setCreateError] = useState(null)
  const [creating, setCreating] = useState(false)

  // Join room form
  const [joinCode, setJoinCode] = useState('')
  const [joinName, setJoinName] = useState(() => localStorage.getItem('bt_player_name') || '')
  const [joinError, setJoinError] = useState(null)
  const [joining, setJoining] = useState(false)

  // Public rooms list
  const [publicRooms, setPublicRooms] = useState([])
  const [loadingRooms, setLoadingRooms] = useState(false)

  // Auto-fill code from URL query param (invite link)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('join')
    if (code) {
      setJoinCode(code.toUpperCase())
      setModal('join')
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const fetchPublicRooms = async () => {
    setLoadingRooms(true)
    try {
      const res = await fetch(`${SERVER_URL}/api/public-rooms`)
      const data = await res.json()
      setPublicRooms(data)
    } catch {
      setPublicRooms([])
    } finally {
      setLoadingRooms(false)
    }
  }

  const openModal = (name) => {
    setModal(name)
    setCreateError(null)
    setJoinError(null)
    if (name === 'join') fetchPublicRooms()
  }

  const handleCreate = () => {
    const name = createName.trim()
    if (!name) { setCreateError('Please enter your name.'); return }
    setCreating(true)
    setCreateError(null)
    onCreateRoom({ mode: createMode, maxPlayers: createCount, playerName: name }, ({ error }) => {
      setCreating(false)
      if (error) {
        const msgs = { room_not_found: 'Room not found.', room_full: 'Room is full.' }
        setCreateError(msgs[error] || `Error: ${error}`)
      }
    })
  }

  const handleJoin = (code) => {
    const roomCode = (code || joinCode).trim().toUpperCase()
    const name = joinName.trim()
    if (!roomCode) { setJoinError('Please enter a room code.'); return }
    if (!name) { setJoinError('Please enter your name.'); return }
    setJoining(true)
    setJoinError(null)
    onJoinRoom({ roomCode, playerName: name }, ({ error }) => {
      setJoining(false)
      if (error) {
        const msgs = {
          room_not_found: 'Room not found. Check the code and try again.',
          room_full: 'This room is full.',
          game_already_started: 'This game has already started.',
        }
        setJoinError(msgs[error] || `Error: ${error}`)
      }
    })
  }

  return (
    <div className={styles.container}>
      <div className={styles.backdrop} />

      {/* Brand */}
      <div className={styles.hero}>
        <div className={styles.logoWrap}>
          <svg viewBox="-8 -8 76 68" width="72" height="62" overflow="visible">
            <polygon points="30,4 56,48 4,48" fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinejoin="round"/>
            <polygon points="30,16 46,44 14,44" fill="rgba(59,130,246,0.15)" stroke="#3B82F6" strokeWidth="1.5" strokeLinejoin="round"/>
            <polygon points="20,28 30,44 10,44" fill="rgba(239,68,68,0.3)" stroke="#EF4444" strokeWidth="1" strokeLinejoin="round"/>
            <polygon points="40,28 50,44 30,44" fill="rgba(234,179,8,0.3)" stroke="#EAB308" strokeWidth="1" strokeLinejoin="round"/>
          </svg>
        </div>
        <h1 className={styles.title}>Blokus Trigon</h1>
        <p className={styles.tagline}>Strategy · Territory · Triangles</p>
      </div>

      {/* Actions */}
      <div className={styles.actions}>
        <button className={`${styles.actionBtn} ${styles.actionBtnPrimary}`} onClick={(e) => { triggerBounce(e.currentTarget); openModal('create') }} data-traced="">
          <svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd"/>
          </svg>
          Create Game
        </button>

        <button className={`${styles.actionBtn} ${styles.actionBtnSecondary}`} onClick={(e) => { triggerBounce(e.currentTarget); openModal('join') }} data-traced="">
          <svg viewBox="0 0 20 20" width="18" height="18" fill="none">
            <path d="M4 10h12M10 4l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Join Game
        </button>

        <button className={`${styles.actionBtn} ${styles.actionBtnGhost}`} onClick={() => setTimeout(onPassAndPlay, 320)} data-traced="">
          <svg viewBox="0 0 20 20" width="18" height="18" fill="none">
            <path d="M5 10.5h10M9 6.5l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Local Game
        </button>

        <button className={`${styles.actionBtn} ${styles.actionBtnGhost}`} onClick={() => openModal('how-to-play')}>
          <svg viewBox="0 0 20 20" width="18" height="18" fill="none">
            <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M10 9v5M10 7v.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          How to Play
        </button>
      </div>

      <p className={styles.footer}>For educational purposes only. Online adaptation of Blokus Trigon by Mattel.</p>

      {/* ── Create Room Modal ──────────────────────────────────────────────────── */}
      {modal === 'create' && (
        <div className={styles.overlay} onClick={() => setModal(null)}>
          <div className={styles.modalCard} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>Create Game</span>
              <button className={styles.modalClose} onClick={(e) => { triggerBounce(e.currentTarget); setModal(null) }}>
                <svg viewBox="0 0 14 14" width="13" height="13" fill="none">
                  <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            <div className={styles.modalBody}>
              <label className={styles.formLabel}>Your name</label>
              <input
                className={styles.formInput}
                placeholder="Enter your name"
                value={createName}
                onChange={e => setCreateName(e.target.value)}
                maxLength={16}
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
              />

              <label className={styles.formLabel}>Players</label>
              <div className={styles.countRow}>
                {[2, 3, 4].map(n => (
                  <button
                    key={n}
                    className={`${styles.countBtn} ${createCount === n ? styles.countBtnActive : ''}`}
                    onClick={() => setCreateCount(n)}
                  >{n}</button>
                ))}
              </div>

              <label className={styles.formLabel}>Room type</label>
              <div className={styles.modeRow}>
                {[['public', 'Public', 'Appears in the public lobby'], ['private', 'Private', 'Invite only via code']].map(([val, label, desc]) => (
                  <button
                    key={val}
                    className={`${styles.modeBtn} ${createMode === val ? styles.modeBtnActive : ''}`}
                    onClick={() => setCreateMode(val)}
                  >
                    <span className={styles.modeBtnLabel}>{label}</span>
                    <span className={styles.modeBtnDesc}>{desc}</span>
                  </button>
                ))}
              </div>

              {createError && <div className={styles.formError}>{createError}</div>}
            </div>

            <div className={styles.modalFooter}>
              <button className={styles.modalCancelBtn} onClick={(e) => { triggerBounce(e.currentTarget); setModal(null) }}>Cancel</button>
              <button className={styles.modalPrimaryBtn} onClick={(e) => { triggerBounce(e.currentTarget); handleCreate() }} disabled={creating} data-traced="">
                {creating ? 'Creating…' : 'Create Room'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Join Room Modal ────────────────────────────────────────────────────── */}
      {modal === 'join' && (
        <div className={styles.overlay} onClick={() => setModal(null)}>
          <div className={styles.modalCard} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>Join Game</span>
              <button className={styles.modalClose} onClick={(e) => { triggerBounce(e.currentTarget); setModal(null) }}>
                <svg viewBox="0 0 14 14" width="13" height="13" fill="none">
                  <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            <div className={styles.modalBody}>
              <label className={styles.formLabel}>Your name</label>
              <input
                className={styles.formInput}
                placeholder="Enter your name"
                value={joinName}
                onChange={e => setJoinName(e.target.value)}
                maxLength={16}
                autoFocus
              />

              <label className={styles.formLabel}>Room code</label>
              <input
                className={`${styles.formInput} ${styles.codeInput}`}
                placeholder="XXXXXX"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6))}
                maxLength={6}
                onKeyDown={e => e.key === 'Enter' && handleJoin()}
              />

              {joinError && <div className={styles.formError}>{joinError}</div>}

              {/* Public rooms */}
              {createMode !== 'private' && (
                <div className={styles.publicSection}>
                  <div className={styles.publicHeader}>
                    <span className={styles.formLabel} style={{ margin: 0 }}>Open public rooms</span>
                    <button className={styles.refreshBtn} onClick={fetchPublicRooms}>
                      <svg viewBox="0 0 16 16" width="12" height="12" fill="none">
                        <path d="M14 8a6 6 0 01-6 6 6 6 0 01-5.9-5M2 8a6 6 0 016-6 6 6 0 015.9 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        <path d="M14 5V8h-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Refresh
                    </button>
                  </div>
                  {loadingRooms ? (
                    <div className={styles.publicLoading}>Loading…</div>
                  ) : publicRooms.length === 0 ? (
                    <div className={styles.publicEmpty}>No public rooms open right now.</div>
                  ) : (
                    <div className={styles.publicList}>
                      {publicRooms.map(room => (
                        <button
                          key={room.code}
                          className={styles.publicRoom}
                          onClick={() => handleJoin(room.code)}
                          disabled={joining}
                        >
                          <span className={styles.publicRoomCode}>{room.code}</span>
                          <span className={styles.publicRoomInfo}>
                            {room.currentPlayers}/{room.maxPlayers} players
                          </span>
                          <span className={styles.publicRoomJoin}>Join →</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className={styles.modalFooter}>
              <button className={styles.modalCancelBtn} onClick={(e) => { triggerBounce(e.currentTarget); setModal(null) }}>Cancel</button>
              <button className={styles.modalPrimaryBtn} onClick={(e) => { triggerBounce(e.currentTarget); handleJoin() }} disabled={joining} data-traced="">
                {joining ? 'Joining…' : 'Join Room'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── How to Play Modal ──────────────────────────────────────────────────── */}
      {modal === 'how-to-play' && (
        <HowToPlayModal onClose={() => setModal(null)} />
      )}
    </div>
  )
}
