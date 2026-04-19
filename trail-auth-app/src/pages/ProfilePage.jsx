import { useEffect, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { useNavigate } from 'react-router-dom'
import { createApiClient } from '../lib/api'
import { AVATAR_OPTIONS, getAvatarUrl, ProfileAvatar } from '../lib/avatars.jsx'

const TIER_COLORS = { S: '#c9a84c', A: '#7eb87e', B: '#6fa3d4', C: '#b87eb8', D: '#aaaaaa' }

export default function ProfilePage() {
  const { user, logout, getAccessTokenSilently } = useAuth0()
  const navigate = useNavigate()
  const api = createApiClient(getAccessTokenSilently)

  const [profile, setProfile] = useState(null)
  const [hikes, setHikes] = useState([])
  const [loadingHikes, setLoadingHikes] = useState(true)

  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [nameSaving, setNameSaving] = useState(false)
  const [nameError, setNameError] = useState(null)

  const [editingAvatar, setEditingAvatar] = useState(false)
  const [selectedAvatar, setSelectedAvatar] = useState('avatar-1')
  const [avatarSaving, setAvatarSaving] = useState(false)

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    loadProfile()
    loadMyHikes()
  }, [])

  async function loadProfile() {
    try {
      const { data } = await api.get('/users/me')
      setProfile(data)
      setNameInput(data.displayName)
      setSelectedAvatar(data.avatar || 'avatar-1')
    } catch (e) {
      const fallback = (user.email || '').split('@')[0] || 'hiker'
      setNameInput(fallback)
    }
  }

  async function loadMyHikes() {
    try {
      const { data } = await api.get(`/ratings/user/${encodeURIComponent(user.sub)}`)
      setHikes(data || [])
    } catch (e) {
      // no hikes yet
    } finally {
      setLoadingHikes(false)
    }
  }

  async function saveDisplayName() {
    setNameSaving(true)
    setNameError(null)
    try {
      await api.put('/users/me', { displayName: nameInput.trim() })
      setProfile(prev => ({ ...prev, displayName: nameInput.trim() }))
      setEditingName(false)
    } catch (e) {
      setNameError(e.message || 'Could not save display name')
    } finally {
      setNameSaving(false)
    }
  }

  async function saveAvatar() {
    setAvatarSaving(true)
    try {
      await api.put('/users/me', { avatar: selectedAvatar })
      setProfile(prev => ({ ...prev, avatar: selectedAvatar }))
      setEditingAvatar(false)
    } catch (e) {
      alert(e.message || 'Could not save avatar')
    } finally {
      setAvatarSaving(false)
    }
  }

  async function handleSearch(e) {
    e.preventDefault()
    if (searchQuery.trim().length < 2) return
    setSearching(true)
    setSearchResults([])
    try {
      const { data } = await api.get(`/users/search?q=${encodeURIComponent(searchQuery.trim())}`)
      setSearchResults(data || [])
    } catch (e) {
      // ignore
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="page">
      <div className="profile-header">
        <ProfileAvatar avatarId={profile?.avatar || 'avatar-1'} size={80} />
        <div>
          <h2 className="profile-name">{profile?.displayName || user?.name}</h2>
          <p className="profile-email">{user?.email}</p>
        </div>
      </div>

      {/* Avatar selector */}
      <p className="section-label" style={{ marginTop: 24 }}>Avatar</p>
      {editingAvatar ? (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            {AVATAR_OPTIONS.map(avatar => (
              <div
                key={avatar.id}
                style={{
                  cursor: 'pointer',
                  border: selectedAvatar === avatar.id ? '3px solid #7eb87e' : '3px solid transparent',
                  borderRadius: 8,
                  padding: 4,
                }}
                onClick={() => setSelectedAvatar(avatar.id)}
              >
                <img
                  src={avatar.src}
                  alt={avatar.name}
                  style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 4 }}
                />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn-primary"
              style={{ width: 'auto', padding: '11px 20px' }}
              disabled={avatarSaving}
              onClick={saveAvatar}
            >
              {avatarSaving ? 'Saving…' : 'Save'}
            </button>
            <button
              className="btn-secondary"
              style={{ width: 'auto', padding: '11px 16px' }}
              onClick={() => { setEditingAvatar(false); setSelectedAvatar(profile?.avatar || 'avatar-1') }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <ProfileAvatar avatarId={profile?.avatar || 'avatar-1'} size={40} />
          <button className="retake-btn" onClick={() => setEditingAvatar(true)}>
            Change avatar
          </button>
        </div>
      )}

      {/* Display name editor */}
      <p className="section-label">Display name</p>
      {editingName ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="quiz-input"
              style={{ flex: 1, margin: 0 }}
              type="text"
              maxLength={30}
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              autoFocus
            />
            <button
              className="btn-primary"
              style={{ width: 'auto', padding: '11px 20px' }}
              disabled={nameSaving || nameInput.trim().length < 2}
              onClick={saveDisplayName}
            >
              {nameSaving ? 'Saving…' : 'Save'}
            </button>
            <button
              className="btn-secondary"
              style={{ width: 'auto', padding: '11px 16px' }}
              onClick={() => { setEditingName(false); setNameError(null); setNameInput(profile?.displayName || '') }}
            >
              Cancel
            </button>
          </div>
          {nameError && <p style={{ color: '#d47070', fontSize: 13, margin: 0 }}>{nameError}</p>}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <span style={{ fontSize: 15 }}>{profile?.displayName || '…'}</span>
          <button
            className="retake-btn"
            onClick={() => { setEditingName(true); setNameInput(profile?.displayName || '') }}
          >
            Edit
          </button>
        </div>
      )}

      {/* User search */}
      <p className="section-label" style={{ marginTop: 8 }}>Find a hiker</p>
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          className="quiz-input"
          style={{ flex: 1, margin: 0 }}
          type="text"
          placeholder="Search by display name…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        <button className="btn-primary" style={{ width: 'auto', padding: '11px 20px' }} disabled={searching}>
          {searching ? '…' : 'Search'}
        </button>
      </form>
      {searchResults.length > 0 && (
        <div className="hike-list" style={{ marginBottom: 24 }}>
          {searchResults.map(u => (
            <div
              key={u.userId}
              className="hike-card"
              style={{ cursor: 'pointer' }}
              onClick={() => navigate(`/user/${encodeURIComponent(u.userId)}`)}
            >
              <ProfileAvatar avatarId={u.avatar || 'avatar-1'} size={40} />
              <div className="hike-info">
                <div className="hike-name">{u.displayName}</div>
              </div>
              <span className="card-chevron">›</span>
            </div>
          ))}
        </div>
      )}
      {searchResults.length === 0 && searchQuery && !searching && (
        <p className="discover-note" style={{ marginBottom: 16 }}>No hikers found.</p>
      )}

      {/* My hike history */}
      <p className="section-label">My hikes</p>
      {loadingHikes ? (
        <div className="loading-dots"><div className="dot" /><div className="dot" /><div className="dot" /></div>
      ) : hikes.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🥾</div>
          <p>No hikes yet. Rate a trail to add it here.</p>
        </div>
      ) : (
        <div className="hike-list">
          {hikes.map((hike, i) => (
            <div className="hike-card" key={`${hike.trailId}-${i}`} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
              {hike.photoUrl && (
                <img
                  src={hike.photoUrl}
                  alt="Trail"
                  style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 8 }}
                />
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className="hike-info">
                  <div className="hike-name">{hike.trailName || hike.trailId}</div>
                  {hike.review && <div className="hike-tagline">"{hike.review}"</div>}
                  <div className="hike-meta">{new Date(hike.createdAt).toLocaleDateString()}</div>
                </div>
                <div className="tier-badge" style={{ color: TIER_COLORS[hike.tier] }}>{hike.tier}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        className="btn-danger"
        style={{ marginTop: 32 }}
        onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
      >
        Sign out
      </button>
    </div>
  )
}