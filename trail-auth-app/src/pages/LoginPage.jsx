import { useAuth0 } from '@auth0/auth0-react'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export default function LoginPage() {
  const { loginWithRedirect, isAuthenticated } = useAuth0()
  const navigate = useNavigate()

  // If already logged in, skip the login page
  useEffect(() => {
    if (isAuthenticated) navigate('/discover')
  }, [isAuthenticated])

  return (
    <div className="login-page">
      <div className="login-hero">
        <div className="login-badge">Beta</div>
        <h1 className="login-title">
          Find your<br />
          <em>perfect trail.</em>
        </h1>
        <p className="login-sub">
          Personalized hike recommendations, trail ratings,
          and meetups with people who explore like you.
        </p>
        <button className="btn-primary" onClick={() => loginWithRedirect()}>
          Get started
        </button>
        <button className="btn-secondary" onClick={() => loginWithRedirect()}>
          Sign in
        </button>
      </div>
      <div className="login-visual">
        <div className="terrain-block t1" />
        <div className="terrain-block t2" />
        <div className="terrain-block t3" />
        <div className="elevation-label">↑ 2,400 ft</div>
      </div>
    </div>
  )
}
