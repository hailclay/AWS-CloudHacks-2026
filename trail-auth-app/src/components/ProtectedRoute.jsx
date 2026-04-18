import { useAuth0 } from '@auth0/auth0-react'
import { useEffect } from 'react'
import LoadingScreen from './LoadingScreen'

// Wrap any page with this to require login
// If not logged in → redirects to Auth0 login automatically
export default function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      loginWithRedirect()
    }
  }, [isLoading, isAuthenticated])

  if (isLoading) return <LoadingScreen />
  if (!isAuthenticated) return null

  return children
}
