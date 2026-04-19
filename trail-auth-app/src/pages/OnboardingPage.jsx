/**
 * OnboardingPage.jsx
 *
 * Ported from quiz.html — same 5 questions, same design language,
 * now a proper React component that:
 *   1. Saves preferences to DynamoDB via POST /preferences
 *   2. Calls POST /trails/search (Bedrock + Google Places) for AI results
 *   3. Navigates to /discover when done
 *
 * This page shows up in two situations:
 *   - First login (no preference profile exists yet)
 *   - User clicks "Retake quiz" on their profile
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import { createApiClient } from '../lib/api'

const QUESTIONS = [
  {
    id: '1',
    label: 'Question 1 of 5',
    text: 'Where do you feel most at peace?',
    options: [
      { value: 'forest',   label: 'Deep in a forest',    sub: 'Towering trees, filtered light' },
      { value: 'mountain', label: 'On a mountain peak',  sub: 'Big skies, open horizons' },
      { value: 'beach',    label: 'By the ocean',        sub: 'Salt air, crashing waves' },
      { value: 'desert',   label: 'In a desert canyon',  sub: 'Red rock, silence, solitude' },
    ],
  },
  {
    id: '2',
    label: 'Question 2 of 5',
    text: "What's your fitness comfort zone?",
    options: [
      { value: 'beginner', label: 'Easy stroller',        sub: 'Flat paths, short distances' },
      { value: 'moderate', label: 'Casual hiker',         sub: 'Some hills, a few miles' },
      { value: 'advanced', label: 'Experienced trekker',  sub: 'Elevation gain, long days' },
      { value: 'expert',   label: 'Summit chaser',        sub: 'Technical terrain, multi-day' },
    ],
  },
  {
    id: '3',
    label: 'Question 3 of 5',
    text: 'What do you most want to see?',
    options: [
      { value: 'wildlife', label: 'Wildlife and birds',       sub: 'Deer, hawks, maybe a fox' },
      { value: 'views',    label: 'Panoramic views',          sub: 'Valleys, ridgelines, clouds' },
      { value: 'water',    label: 'Waterfalls and rivers',    sub: 'Moving water, cool mist' },
      { value: 'flowers',  label: 'Wildflowers and meadows',  sub: 'Color, texture, quiet beauty' },
    ],
  },
  {
    id: '4',
    label: 'Question 4 of 5',
    text: 'Who are you hiking with?',
    cols: 3,
    options: [
      { value: 'solo',    label: 'Just me',           sub: 'Quiet reflection' },
      { value: 'partner', label: 'Partner or friend', sub: 'Good conversation' },
      { value: 'group',   label: 'A whole crew',      sub: 'The more the merrier' },
    ],
  },
  {
    id: '5',
    label: 'Question 5 of 5',
    text: "What vibe are you after?",
    options: [
      { value: 'adventure',  label: 'Pure adventure',        sub: 'Push limits, feel alive' },
      { value: 'peaceful',   label: 'Peace and quiet',       sub: 'Decompress, breathe deep' },
      { value: 'scenic',     label: 'Photo-worthy beauty',   sub: 'Every turn is a postcard' },
      { value: 'discovery',  label: 'Explore and discover',  sub: 'Hidden gems and secrets' },
    ],
  },
]

// Map quiz answers to the preference schema DynamoDB expects
const TERRAIN_MAP = { forest: 'Forest', mountain: 'Mountain', beach: 'Beach', desert: 'Desert' }
const DIFFICULTY_MAP = { beginner: 'Easy', moderate: 'Medium', advanced: 'Hard', expert: 'Hard' }
const DISTANCE_MAP = { beginner: 3, moderate: 6, advanced: 12, expert: 20 }
const ELEVATION_MAP = { beginner: 200, moderate: 800, advanced: 2000, expert: 4000 }

export default function OnboardingPage() {
  const { getAccessTokenSilently } = useAuth0()
  const navigate = useNavigate()
  const api = createApiClient(getAccessTokenSilently)

  const [answers, setAnswers] = useState({})
  const [location, setLocation] = useState('')
  const [radius, setRadius] = useState('25')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const filledCount = Object.keys(answers).length
  const progress = (filledCount / 5) * 100
  // All 5 questions answered + location entered
  const canSubmit = filledCount >= 5 && location.trim().length > 0

  function pick(questionId, value) {
    setAnswers(prev => ({ ...prev, [questionId]: value }))
  }

  async function handleSubmit() {
    if (!canSubmit) return
    setLoading(true)
    setError(null)

    try {
      // Save preference profile to DynamoDB so Discover page can use it later.
      // We map the quiz answers to the structured preference schema.
      const fitness = answers['2']
      await api.post('/preferences', {
        terrain: TERRAIN_MAP[answers['1']] || 'Mountain',
        difficulty: DIFFICULTY_MAP[fitness] || 'Medium',
        distanceMiles: DISTANCE_MAP[fitness] || 6,
        elevationFeet: ELEVATION_MAP[fitness] || 800,
        drivingMinutes: parseInt(radius) * 2, // rough estimate: 1 mile radius ≈ 2 min drive
      })

      // Navigate to discover — it will load the AI-ranked trails using saved prefs.
      // We also pass the quiz answers + location in router state so DiscoverPage
      // can immediately call /trails/search for the richer AI results.
      navigate('/discover', {
        state: { quizAnswers: answers, location, radius },
      })
    } catch (e) {
      setError(e.message || 'Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="onboarding-wrap">
      <div className="quiz-header">
        <div className="eyebrow">Trail Finder</div>
        <h1 className="hero">Which hike is meant for you?</h1>
        <p>Five questions, one location, and a list of trail ideas picked for you.</p>
      </div>

      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${progress}%` }} />
      </div>

      {QUESTIONS.map(q => (
        <div className="question-block" key={q.id}>
          <div className="q-label">{q.label}</div>
          <div className="q-text">{q.text}</div>
          <div className={`options-grid${q.cols === 3 ? ' cols-3' : ''}`}>
            {q.options.map(opt => (
              <button
                key={opt.value}
                className={`opt-btn${answers[q.id] === opt.value ? ' selected' : ''}`}
                onClick={() => pick(q.id, opt.value)}
              >
                <span className="opt-label">{opt.label}</span>
                <span className="opt-sub">{opt.sub}</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="question-block">
        <div className="q-label">Location</div>
        <div className="q-text">Where do you want to hike?</div>
        <input
          className="quiz-input"
          type="text"
          placeholder="Irvine, CA"
          value={location}
          onChange={e => setLocation(e.target.value)}
        />
      </div>

      <div className="question-block">
        <div className="q-label">Radius</div>
        <div className="q-text">How far are you willing to go?</div>
        <select
          className="quiz-select"
          value={radius}
          onChange={e => setRadius(e.target.value)}
        >
          <option value="5">Within 5 miles</option>
          <option value="10">Within 10 miles</option>
          <option value="25">Within 25 miles</option>
          <option value="50">Within 50 miles</option>
        </select>
      </div>

      {error && <p className="onboarding-error">{error}</p>}

      <button
        className="btn-primary"
        disabled={!canSubmit || loading}
        onClick={handleSubmit}
      >
        {loading ? 'Finding your trails…' : 'Find my perfect hike →'}
      </button>
    </div>
  )
}
