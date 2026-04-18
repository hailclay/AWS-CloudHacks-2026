import React from 'react'
import ReactDOM from 'react-dom/client'
import { Auth0Provider } from '@auth0/auth0-react'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

// ⬇️ Replace these two values with your own from auth0.com/dashboard
const AUTH0_DOMAIN = 'dev-a8vxe41ndq7kfjdr.us.auth0.com'      // e.g. "dev-abc123.us.auth0.com"
const AUTH0_CLIENT_ID = 'bDoGlZq8vLPkDDZoW4hA0QZOm91oF5EJ' // e.g. "aBcDeFgHiJkLmNoPqRsTuVwX"

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Auth0Provider
      domain={AUTH0_DOMAIN}
      clientId={AUTH0_CLIENT_ID}
      authorizationParams={{
        redirect_uri: window.location.origin
      }}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </Auth0Provider>
  </React.StrictMode>
)
