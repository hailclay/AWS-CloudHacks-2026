import { useAuth0 } from '@auth0/auth0-react'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export default function LoginPage() {
  const { loginWithRedirect, isAuthenticated } = useAuth0()
  const navigate = useNavigate()

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
        {isAuthenticated ? (
          <button className="btn-primary" onClick={() => navigate('/discover')}>
            Continue
          </button>
        ) : (
          <>
            <button className="btn-primary" onClick={() => loginWithRedirect()}>
              Get started
            </button>
            <button className="btn-secondary" onClick={() => loginWithRedirect()}>
              Sign in
            </button>
          </>
        )}
      </div>
      <div className="login-visual">
        <img 
          src="/mascot-hero.png" 
          alt="Antsy mascot" 
          style={{ 
            width: '100%', 
            maxWidth: 300, 
            height: 'auto',
            objectFit: 'contain'
          }} 
        />
      </div>
    </div>
  )
}
