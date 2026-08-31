# Netlify Environment Variables Setup

> **This file is a Netlify-specific walkthrough. The authoritative, generated
> list of every variable this deployment reads is
> [`docs/environment-variables.md`](docs/environment-variables.md)** (regenerate
> with `npm run docs:env`). Anything below that contradicts it is stale —
> the Firebase and `VITE_API_URL` variables in particular belong to the retired
> `legacy/` app and are not read by the current frontend.

## Required Environment Variables

Make sure these are set in your Netlify dashboard (Site settings → Environment variables):

### Backend API URL

```
VITE_API_URL=https://repo-reel-backend.fly.dev
```

### Firebase (Auth, Firestore, Storage)

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

See `FIREBASE_SETUP.md` for Console steps and deploying rules/indexes.

### Gemini AI (Optional)

```
VITE_GEMINI_API_KEY=your_gemini_api_key
VITE_GEMINI_MODEL=gemini-3.0-flash
```

### Google TTS (Optional)

```
VITE_GOOGLE_TTS_API_KEY=your_google_tts_api_key
```

### Feature Flags (Optional)

```
VITE_USE_MOCK_MANIFEST=false
```

## How to Set Environment Variables in Netlify

1. Go to your Netlify dashboard
2. Select your site
3. Go to **Site settings** → **Environment variables**
4. Click **Add a variable**
5. Add each variable above
6. Redeploy your site

## Important Notes

- **VITE_API_URL** must be set to your Fly.io backend URL: `https://repo-reel-backend.fly.dev`
- Without this, the frontend will try to use the proxy (`/api`) which only works in development
- All variables starting with `VITE_` are exposed to the browser, so don't put secrets there
- After adding variables, trigger a new deployment
