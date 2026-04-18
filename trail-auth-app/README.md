# TrailMatch — Auth0 Starter

A React PWA starter with Auth0 login, protected routes, and a fake hike discover page.
Use this as the foundation for your AWS hackathon project.

---

## Setup (5 steps)

### 1. Install dependencies
```bash
cd trail-auth-app
npm install
```

### 2. Create a free Auth0 account
Go to https://auth0.com and sign up for free.

### 3. Create an Auth0 Application
1. In your Auth0 dashboard → Applications → Create Application
2. Choose "Single Page Application"
3. Choose React

### 4. Configure Auth0 URLs
In your Auth0 app settings, set these fields:
- **Allowed Callback URLs** → `http://localhost:5173`
- **Allowed Logout URLs** → `http://localhost:5173`
- **Allowed Web Origins** → `http://localhost:5173`

Then save changes.

### 5. Add your credentials to main.jsx
Open `src/main.jsx` and replace:
```js
const AUTH0_DOMAIN = 'YOUR_AUTH0_DOMAIN'     // e.g. "dev-abc123.us.auth0.com"
const AUTH0_CLIENT_ID = 'YOUR_AUTH0_CLIENT_ID' // from your Auth0 app settings
```

---

## Run it
```bash
npm run dev
```
Open http://localhost:5173

---

## What's in here

| File | What it does |
|------|-------------|
| `src/main.jsx` | Wraps the whole app in Auth0Provider — the ONE place Auth0 is configured |
| `src/App.jsx` | Defines routes. Wraps protected pages in ProtectedRoute |
| `src/pages/LoginPage.jsx` | Landing page with sign in button |
| `src/pages/DiscoverPage.jsx` | Shows fake hike list — replace with real Lambda call later |
| `src/pages/ProfilePage.jsx` | Shows Auth0 user object so you can see what data you get |
| `src/components/ProtectedRoute.jsx` | Redirects to login if user isn't authenticated |
| `src/components/NavBar.jsx` | Only shows when logged in |

## Next steps
1. Replace fake hike data in DiscoverPage with a real Lambda + DynamoDB call
2. Add the onboarding preferences page
3. Connect to Amazon Personalize for real recommendations
