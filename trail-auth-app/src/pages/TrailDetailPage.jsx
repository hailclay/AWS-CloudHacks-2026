/**
 * TrailDetailPage.jsx
 *
 * Shows full trail info when a user taps a card on the Discover page.
 * Works for both trail types:
 *   - S3 seed trails (have trailId, structured fields)
 *   - Quiz/Google Places trails (have id, tags, maps_url)
 *
 * Features:
 *   - Trail stats (difficulty, distance, elevation, terrain)
 *   - Google Maps embed showing the trailhead location
 *   - "Get Directions" button opening Google Maps navigation
 *   - Community tier ratings breakdown (S/A/B/C/D) — from app.py
 *   - Rate this trail form (S/A/B/C/D + optional review text)
 *   - 10 most recent posts from this trail
 */

import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import { createApiClient } from '../lib/api'
import { ProfileAvatar } from '../lib/avatars.jsx'

const TIERS = ['S', 'A', 'B', 'C', 'D']
const TIER_COLORS = { S: '#c9a84c', A: '#7eb87e', B: '#6fa3d4', C: '#b87eb8', D: '#aaaaaa' }
const TIER_LABELS = { S: 'Exceptional', A: 'Great', B: 'Good', C: 'Okay', D: 'Skip it' }
const DIFFICULTY_DOT = { Easy: '#7eb87e', Medium: '#d4a84c', Hard: '#d47070', Moderate: '#d4a84c' }
const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY

export default function TrailDetailPage() {
  const { user, getAccessTokenSilently } = useAuth0()
  const location = useLocation()
  const navigate = useNavigate()
  const api = createApiClient(getAccessTokenSilently)

  // Trail data is passed via router state from DiscoverPage
  const trail = location.state?.trail
  const trailId = trail?.trailId || trail?.id || trail?.name

  const [ratings, setRatings] = useState(null)
  const [posts, setPosts] = useState([])
  const [myRating, setMyRating] = useState(null)
  const [selectedTier, setSelectedTier] = useState(null)
  const [review, setReview] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [ratingSuccess, setRatingSuccess] = useState(false)
  const [loadingRatings, setLoadingRatings] = useState(true)
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)

  useEffect(() => {
    if (!trail) {
      navigate('/discover')
      return
    }
    loadRatings()
    loadPosts()
  }, [])

  async function loadRatings() {
    setLoadingRatings(true)
    try {
      const { data } = await api.get(`/ratings/${encodeURIComponent(trailId)}`)
      setRatings(data)
      // Find the current user's own rating if it exists
      const mine = data.ratings?.find(r => r.userId === user?.sub)
      if (mine) {
        setMyRating(mine)
        setSelectedTier(mine.tier)
        setReview(mine.review || '')
        setPhotoPreview(mine.photoUrl || null)
      }
    } catch (e) {
      // 404 just means no ratings yet — that's fine
      if (e.statusCode !== 404) console.error('Failed to load ratings:', e)
      setRatings({ ratings: [], tierCounts: { S: 0, A: 0, B: 0, C: 0, D: 0 }, communityTier: null, totalRatings: 0 })
    } finally {
      setLoadingRatings(false)
    }
  }

  async function loadPosts() {
    try {
      const { data } = await api.get(`/posts/trail/${encodeURIComponent(trailId)}`)
      setPosts(data || [])
    } catch (e) {
      // Posts are optional — don't block the page
    }
  }

  async function submitRating() {
    if (!selectedTier) return
    setSubmitting(true)
    try {
      let photoKey = myRating?.photoKey || null

      // If a new photo was picked, get a pre-signed URL and upload it
      if (photoFile) {
        const { data: urlData } = await api.post('/ratings/upload-url', {
          trailId,
          contentType: photoFile.type,
        })
        await fetch(urlData.uploadUrl, {
          method: 'PUT',
          body: photoFile,
          headers: { 'Content-Type': photoFile.type },
        })
        photoKey = urlData.photoKey
      }

      await api.post('/ratings', {
        trailId,
        trailName: trail.name,
        tier: selectedTier,
        review: review.trim() || null,
        photoKey,
      })
      setRatingSuccess(true)
      setMyRating({ tier: selectedTier, review: review.trim(), photoKey })
      setPhotoFile(null)
      await loadRatings()
    } catch (e) {
      alert(e.message || 'Failed to submit rating')
    } finally {
      setSubmitting(false)
    }
  }

  async function deleteRating() {
    if (!confirm('Remove your rating?')) return
    try {
      await api.delete(`/ratings/${encodeURIComponent(trailId)}`)
      setMyRating(null)
      setSelectedTier(null)
      setReview('')
      setPhotoFile(null)
      setPhotoPreview(null)
      setRatingSuccess(false)
      await loadRatings()
    } catch (e) {
      alert(e.message || 'Failed to delete rating')
    }
  }

  if (!trail) return null

  // Build Google Maps embed URL from trail coordinates
  const hasCoords = trail.lat && trail.lng
  const mapsEmbedUrl = hasCoords && GOOGLE_MAPS_KEY
    ? `https://www.google.com/maps/embed/v1/place?key=${GOOGLE_MAPS_KEY}&q=${trail.lat},${trail.lng}&zoom=14`
    : null
  const directionsUrl = hasCoords
    ? `https://www.google.com/maps/dir/?api=1&destination=${trail.lat},${trail.lng}`
    : trail.maps_url || null

  return (
    <div className="page">
      {/* Back button */}
      <button className="back-btn" onClick={() => navigate(-1)}>
        ← Back
      </button>

      {/* Hero section */}
      <div className="detail-hero">
        <div className="detail-terrain-emoji">
          {terrainEmoji(trail.terrain || trail.tags?.[0])}
        </div>
        <div>
          <h1 className="detail-title">{trail.name}</h1>
          {trail.tagline && <p className="detail-tagline">{trail.tagline}</p>}
        </div>
      </div>

      {/* Stats row */}
      {(trail.difficulty || trail.distanceMiles || trail.elevationFeet || trail.terrain) && (
        <div className="detail-stats">
          {trail.difficulty && (
            <div className="stat-pill">
              <span className="stat-dot" style={{ background: DIFFICULTY_DOT[trail.difficulty] }} />
              {trail.difficulty}
            </div>
          )}
          {trail.distanceMiles && (
            <div className="stat-pill">🥾 {trail.distanceMiles} mi</div>
          )}
          {trail.elevationFeet && (
            <div className="stat-pill">↑ {trail.elevationFeet} ft</div>
          )}
          {trail.terrain && (
            <div className="stat-pill">{trail.terrain}</div>
          )}
          {trail.tags && !trail.difficulty && trail.tags.map(tag => (
            <div className="stat-pill" key={tag}>{tag}</div>
          ))}
        </div>
      )}

      {/* Google Maps embed */}
      {mapsEmbedUrl ? (
        <div className="map-container">
          <iframe
            title="Trail map"
            src={mapsEmbedUrl}
            width="100%"
            height="260"
            style={{ border: 0, borderRadius: 12 }}
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      ) : hasCoords ? (
        <div className="map-placeholder">
          <p>Add <code>VITE_GOOGLE_MAPS_KEY</code> to .env.local to see the map</p>
        </div>
      ) : null}

      {/* Directions button */}
      {directionsUrl && (
        <a
          href={directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="directions-btn"
        >
          📍 Get directions
        </a>
      )}

      {/* Community ratings — from app.py concept */}
      <div className="section-label" style={{ marginTop: 28 }}>Community ratings</div>
      {loadingRatings ? (
        <div className="loading-dots" style={{ justifyContent: 'flex-start', margin: '12px 0' }}>
          <div className="dot" /><div className="dot" /><div className="dot" />
        </div>
      ) : (
        <div className="ratings-card">
          {ratings?.totalRatings === 0 ? (
            <p className="ratings-empty">No ratings yet — be the first!</p>
          ) : (
            <>
              <div className="community-tier-row">
                <span className="community-tier-label">Community tier</span>
                <span
                  className="community-tier-badge"
                  style={{ color: TIER_COLORS[ratings?.communityTier] }}
                >
                  {ratings?.communityTier}
                </span>
                <span className="community-tier-count">
                  {ratings?.totalRatings} rating{ratings?.totalRatings !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="tier-breakdown">
                {TIERS.map(tier => (
                  <div className="tier-bar-row" key={tier}>
                    <span className="tier-bar-label" style={{ color: TIER_COLORS[tier] }}>{tier}</span>
                    <div className="tier-bar-track">
                      <div
                        className="tier-bar-fill"
                        style={{
                          width: ratings?.totalRatings
                            ? `${(ratings.tierCounts[tier] / ratings.totalRatings) * 100}%`
                            : '0%',
                          background: TIER_COLORS[tier],
                        }}
                      />
                    </div>
                    <span className="tier-bar-count">{ratings?.tierCounts[tier] || 0}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Individual reviews */}
      {!loadingRatings && ratings?.reviews?.length > 0 && (
        <>
          <div className="section-label" style={{ marginTop: 28 }}>Reviews</div>
          <div className="posts-list">
            {ratings.reviews.map((r, i) => (
              <div
                className="post-card"
                key={`${r.userId}-${i}`}
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/user/${encodeURIComponent(r.userId)}`)}
              >
                <div className="post-meta">
                  <ProfileAvatar avatarId={r.avatar || 'avatar-1'} size={40} className="post-avatar" />
                  <div style={{ flex: 1 }}>
                    <div className="post-author">{r.displayName}</div>
                    <div className="post-time">{new Date(r.createdAt).toLocaleDateString()}</div>
                  </div>
                  <span className="tier-badge" style={{ color: TIER_COLORS[r.tier] }}>{r.tier}</span>
                </div>
                {r.photoUrl && (
                  <img
                    src={r.photoUrl}
                    alt="Trail"
                    style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 8, marginTop: 8 }}
                  />
                )}
                {r.review && <p className="post-caption" style={{ marginTop: 8 }}>{r.review}</p>}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Rate this trail */}      <div className="section-label" style={{ marginTop: 28 }}>
        {myRating ? 'Your rating' : 'Rate this trail'}
      </div>
      <div className="rating-form">
        <div className="tier-picker">
          {TIERS.map(tier => (
            <button
              key={tier}
              className={`tier-btn${selectedTier === tier ? ' selected' : ''}`}
              style={selectedTier === tier ? { borderColor: TIER_COLORS[tier], color: TIER_COLORS[tier] } : {}}
              onClick={() => setSelectedTier(tier)}
            >
              <span className="tier-btn-letter">{tier}</span>
              <span className="tier-btn-label">{TIER_LABELS[tier]}</span>
            </button>
          ))}
        </div>

        <textarea
          className="review-input"
          placeholder="Add a note (optional, 500 chars max)"
          maxLength={500}
          value={review}
          onChange={e => setReview(e.target.value)}
        />

        {/* Photo upload */}
        <div style={{ marginTop: 12 }}>
          {photoPreview && (
            <img
              src={photoPreview}
              alt="Trail photo"
              style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 10, marginBottom: 8 }}
            />
          )}
          <label style={{ display: 'inline-block', cursor: 'pointer' }}>
            <span className="retake-btn">
              {photoPreview ? '📷 Change photo' : '📷 Add photo'}
            </span>
            <input
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={e => {
                const file = e.target.files?.[0]
                if (!file) return
                setPhotoFile(file)
                setPhotoPreview(URL.createObjectURL(file))
              }}
            />
          </label>
          {photoFile && (
            <button
              className="retake-btn"
              style={{ marginLeft: 8, color: '#d47070' }}
              onClick={() => { setPhotoFile(null); setPhotoPreview(myRating?.photoUrl || null) }}
            >
              Remove
            </button>
          )}
        </div>

        <div className="rating-actions">
          <button
            className="btn-primary"
            disabled={!selectedTier || submitting}
            onClick={submitRating}
            style={{ width: 'auto', padding: '11px 24px' }}
          >
            {submitting ? 'Saving…' : myRating ? 'Update rating' : 'Submit rating'}
          </button>
          {myRating && (
            <button className="btn-danger" onClick={deleteRating}>
              Remove
            </button>
          )}
        </div>

        {ratingSuccess && (
          <p className="rating-success">Rating saved! ✓</p>
        )}
      </div>

      {/* Recent posts */}
      {posts.length > 0 && (
        <>
          <div className="section-label" style={{ marginTop: 28 }}>Recent posts</div>
          <div className="posts-list">
            {posts.map(post => (
              <div className="post-card" key={post.postId}>
                <div className="post-meta">
                  <div className="post-avatar">
                    {(post.userDisplayName || 'H')[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="post-author">{post.userDisplayName || 'Hiker'}</div>
                    <div className="post-time">
                      {new Date(post.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                {post.wildlifeTag && (
                  <div className="wildlife-tag">🦎 {post.wildlifeTag}</div>
                )}
                <p className="post-caption">{post.caption}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function terrainEmoji(terrain) {
  if (!terrain) return '🥾'
  const t = terrain.toLowerCase()
  if (t.includes('mountain') || t.includes('mountain')) return '⛰️'
  if (t.includes('beach') || t.includes('coastal')) return '🏖️'
  if (t.includes('forest')) return '🌲'
  if (t.includes('desert') || t.includes('canyon')) return '🏜️'
  return '🥾'
}
