import { useAuth0 } from '@auth0/auth0-react'

export default function ProfilePage() {
  const { user, logout } = useAuth0()

  return (
    <div className="page">
      <div className="profile-header">
        <img
          src={user?.picture}
          alt="Profile"
          className="profile-avatar"
          referrerPolicy="no-referrer"
        />
        <div>
          <h2 className="profile-name">{user?.name}</h2>
          <p className="profile-email">{user?.email}</p>
        </div>
      </div>

      <p className="section-label">Auth0 user object</p>
      <div className="code-block">
        <pre>{JSON.stringify(user, null, 2)}</pre>
      </div>

      <p className="profile-note">
        This is everything Auth0 gives you for free. You can store additional
        data like hike preferences in DynamoDB, keyed by <code>user.sub</code> (the unique user ID).
      </p>

      <button
        className="btn-danger"
        onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
      >
        Sign out
      </button>
    </div>
  )
}
