import { useAuth0 } from '@auth0/auth0-react'

const FAKE_HIKES = [
  { id: 1, name: 'Eagle Rock Trail', miles: 5.2, difficulty: 'Hard', terrain: 'Mountain', elevation: 1200, rating: 'S' },
  { id: 2, name: 'Laguna Coast Loop', miles: 3.1, difficulty: 'Easy', terrain: 'Beach', elevation: 200, rating: 'A' },
  { id: 3, name: 'San Juan Forest Walk', miles: 7.8, difficulty: 'Medium', terrain: 'Forest', elevation: 800, rating: 'A' },
  { id: 4, name: 'Aliso Canyon Out & Back', miles: 4.5, difficulty: 'Medium', terrain: 'Canyon', elevation: 650, rating: 'B' },
]

const TIER_COLORS = { S: '#c9a84c', A: '#7eb87e', B: '#6fa3d4', C: '#b87eb8' }
const DIFFICULTY_DOT = { Easy: '#7eb87e', Medium: '#d4a84c', Hard: '#d47070' }

export default function DiscoverPage() {
  const { user } = useAuth0()

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Good morning</p>
          <h2 className="page-title">{user?.given_name || user?.nickname || 'Hiker'}</h2>
        </div>
        <div className="match-chip">4 matches today</div>
      </div>

      <p className="section-label">Recommended for you</p>

      <div className="hike-list">
        {FAKE_HIKES.map((hike, i) => (
          <div className="hike-card" key={hike.id} style={{ animationDelay: `${i * 80}ms` }}>
            <div className="hike-rank">#{i + 1}</div>
            <div className="hike-info">
              <div className="hike-name">{hike.name}</div>
              <div className="hike-meta">
                <span className="difficulty-dot" style={{ background: DIFFICULTY_DOT[hike.difficulty] }} />
                {hike.difficulty} · {hike.miles} mi · ↑{hike.elevation} ft · {hike.terrain}
              </div>
            </div>
            <div className="tier-badge" style={{ color: TIER_COLORS[hike.rating] }}>
              {hike.rating}
            </div>
          </div>
        ))}
      </div>

      <p className="discover-note">
        Ratings are from the community. Connect your AWS backend to get
        AI-powered recommendations personalized to you.
      </p>
    </div>
  )
}
