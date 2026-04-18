import { Routes, Route } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import LoginPage from './pages/LoginPage'
import DiscoverPage from './pages/DiscoverPage'
import ProfilePage from './pages/ProfilePage'
import ProtectedRoute from './components/ProtectedRoute'
import NavBar from './components/NavBar'
import LoadingScreen from './components/LoadingScreen'

export default function App() {
  const { isLoading } = useAuth0()

  // Auth0 is figuring out if the user is logged in — show a spinner
  if (isLoading) return <LoadingScreen />

  return (
    <>
      <NavBar />
      <Routes>
        <Route path="/" element={<LoginPage />} />

        {/* Protected pages — redirects to login if not signed in */}
        <Route path="/discover" element={
          <ProtectedRoute>
            <DiscoverPage />
          </ProtectedRoute>
        } />
        <Route path="/profile" element={
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        } />
      </Routes>
    </>
  )
}
