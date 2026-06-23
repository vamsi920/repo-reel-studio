# Firebase setup (replaces Supabase)

Follow the [Firebase basics](https://firebase.google.com/docs) workflow using `npx -y firebase-tools@latest` (login, `firebase use --add <PROJECT_ID>`).

## 1. Console

1. Create a Firebase project (or pick an existing one).
2. **Authentication**: enable Email/Password, Google, and GitHub. Add authorized domains (e.g. `localhost`, your Netlify/Vercel domain).
3. **Firestore**: create database (production mode is fine once rules are deployed).
4. **Storage**: enable default bucket.
5. **Register app**: Web app → copy config into `.env` as `VITE_FIREBASE_*` (see [.env.example](.env.example)).

## 2. GitHub OAuth (optional)

In Firebase Auth → GitHub provider, add the GitHub OAuth App **Client ID** and **Client secret**. In GitHub, set Authorization callback URL to the value shown in the Firebase console.

## 3. Deploy rules and indexes

From the repo root (after `firebase use --add <PROJECT_ID>`):

```bash
npx -y firebase-tools@latest deploy --only firestore:rules,firestore:indexes,storage
```

This deploys [firestore.rules](firestore.rules), [firestore.indexes.json](firestore.indexes.json), and [storage.rules](storage.rules).

## 4. Redirect URL for OAuth

OAuth uses `signInWithRedirect` to `/auth/callback`. Ensure that URL is listed under Authentication → Settings → Authorized domains (same origin is enough).

## 5. Env vars

Set all `VITE_FIREBASE_*` variables in Netlify/hosting (see [.env.example](.env.example)). Remove old `VITE_SUPABASE_*` values.
