import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import { createApiClient } from '../lib/api'

const TIER_COLORS = { S: '#c9a84c', A: '#7eb87e', B: '#6fa3d4', C: '#b87eb8', D: '#aaaaaa' }
const DIFFICULTY_DOT = { Easy: '#7eb87e', Medium: '#d4a84c', Hard: '#d47070', Moderate: '#d4a84c', Advanced: '#d47070' }

export default function DiscoverPage() {
  const { user, getAccessTokenSilently } = useAuth0()
  const location = useLocation()
  const navigate = useNavigate()
  const api = createApiClient(getAccessTokenSilently)

  const [trails, setTrails] = useState([])
  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const quizState = location.state

  useEffect(() => { loadTrails() }, [])

  async function loadTrails() {
    setLoading(true)
    setError(null)
    try {
      if (quizState?.quizAnswers) {
        const { data } = await api.post('/trails/search', {
          answers: quizState.quizAnswers,
          location: quizState.location,
          radius: quizState.radius,
        })
        setTrails(data.trails || [])
        setAnalysis(data.analysis || null)
      } else {
        const { data } = await api.get('/trails')
        setTrails(data.trails || [])
        if (!data.hasPreferences) { navigate('/onboarding'); return }
      }
    } catch (e) {
      if (e.statusCode === 404) { navigate('/onboarding'); return }
      setError(e.message || 'Could not load trails. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function openTrail(trail) {
    const id = trail.trailId || trail.id || encodeURIComponent(trail.name)
    navigate(`/trail/${id}`, { state: { trail } })
  }

  if (loading) {
    return (
      <div className="page">
        <div className="loading-dots">
          <div className="dot" /><div className="dot" /><div className="dot" />
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>
          {quizState ? 'Finding your trails…' : 'Loading recommendations…'}
        </p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="page">
        <p className="discover-note" style={{ color: '#d47070' }}>{error}</p>
        <button className="btn-primary" onClick={loadTrails}>Try again</button>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="page-eyebrow">{quizState ? `Near ${quizState.location}` : 'Good morning'}</p>
          <h2 className="page-title">{user?.given_name || user?.nickname || 'Hiker'}</h2>
        </div>
        <div className="match-chip">{trails.length} matches</div>
      </div>

      {analysis && (
        <div className="analysis-card">
          <div className="analysis-label">Your trail personality</div>
          <p className="analysis-text">{analysis}</p>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p className="section-label">{quizState ? 'Matched hikes' : 'Recommended for you'}</p>
        <button className="retake-btn" onClick={() => navigate('/onboarding')}>
          {quizState ? 'Retake quiz' : 'Take quiz'}
        </button>
      </div>

      {trails.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🥾</div>
          <p>No trails found. Try a different location or adjust your preferences.</p>
          <button className="btn-primary" onClick={() => navigate('/onboarding')}>Retake quiz</button>
        </div>
      ) : (
        <div className="hike-list">
          {trails.map((trail, i) => (
            <div
              className="hike-card"
              key={trail.id || trail.trailId || i}
              style={{ animationDelay: `${i * 80}ms`, cursor: 'pointer' }}
              onClick={() => openTrail(trail)}
            >
              <div className="hike-rank">#{i + 1}</div>
              <div className="hike-info">
                <div className="hike-name">{trail.name}</div>
                <div className="hike-meta">
                  {trail.tags ? (
                    <span>{trail.tags.join(' · ')}</span>
                  ) : (
                    <>
                      <span className="difficulty-dot" style={{ background: DIFFICULTY_DOT[trail.difficulty] }} />
                      {trail.difficulty} · {trail.distanceMiles} mi · ↑{trail.elevationFeet} ft · {trail.terrain}
                    </>
                  )}
                </div>
                {trail.tagline && <div className="hike-tagline">{trail.tagline}</div>}
              </div>
              {trail.communityTier && (
                <div className="tier-badge" style={{ color: TIER_COLORS[trail.communityTier] }}>
                  {trail.communityTier}
                </div>
              )}
              {trail.rating && (
                <div className="tier-badge" style={{ color: TIER_COLORS['A'] }}>
                  ⭐ {trail.rating.toFixed(1)}
                </div>
              )}
              <span className="card-chevron">›</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
