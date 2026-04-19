import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import { createApiClient } from '../lib/api'

const TIER_COLORS = { S: '#c9a84c', A: '#7eb87e', B: '#6fa3d4', C: '#b87eb8', D: '#aaaaaa' }

export default function UserProfilePage() {
  const { userId } = useParams()
  const navigate = useNavigate()
  const { getAccessTokenSilently } = useAuth0()
  const api = createApiClient(getAccessTokenSilently)

  const [profile, setProfile] = useState(null)
  const [hikes, setHikes] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => { loadProfile() }, [userId])

  async function loadProfile() {
    setLoading(true)
    try {
      const [{ data: userdata }, { data: ratings }] = await Promise.all([
        api.get(`/users/${encodeURIComponent(userId)}`),
        api.get(`/ratings/user/${encodeURIComponent(userId)}`),
      ])
      setProfile(userdata)
      setHikes(ratings || [])
    } catch (e) {
      if (e.statusCode === 404) setNotFound(true)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return (
    <div className="page">
      <div className="loading-dots"><div className="dot" /><div className="dot" /><div className="dot" /></div>
    </div>
  )

  if (notFound) return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate(-1)}>← Back</button>
      <div className="empty-state">
        <div className="empty-icon">🥾</div>
        <p>User not found.</p>
      </div>
    </div>
  )

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate(-1)}>← Back</button>

      <div className="profile-header">
        {profile?.picture ? (
          <img src={profile.picture} alt="Profile" className="profile-avatar" referrerPolicy="no-referrer" />
        ) : (
          <div className="profile-avatar" style={{ background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>
            🥾
          </div>
        )}
        <div>
          <h2 className="profile-name">{profile?.displayName || 'Hiker'}</h2>
          <p className="profile-email">{hikes.length} trail{hikes.length !== 1 ? 's' : ''} hiked</p>
        </div>
      </div>

      <p className="section-label" style={{ marginTop: 24 }}>Hike history</p>
      {hikes.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🥾</div>
          <p>No hikes rated yet.</p>
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
    </div>
  )
}
