import { useAuth0 } from '@auth0/auth0-react'
import { NavLink } from 'react-router-dom'

export default function NavBar() {
  const { isAuthenticated } = useAuth0()

  // Don't show nav on the login page
  if (!isAuthenticated) return null

  return (
    <nav className="navbar">
      <span className="navbar-brand">TrailMatch</span>
      <div className="navbar-links">
        <NavLink to="/discover" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
          Discover
        </NavLink>
        <NavLink to="/profile" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
          Profile
        </NavLink>
      </div>
    </nav>
  )
}
