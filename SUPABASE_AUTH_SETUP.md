# Supabase Auth for Hosted App (e.g. GitFlick on Netlify)

After deploying to https://gitflick.netlify.app, configure Supabase so signup and redirects use your real domain instead of localhost.

## 1. Fix redirect / verify links (no more localhost)

In [Supabase Dashboard](https://supabase.com/dashboard) → your project:

1. Go to **Authentication** → **URL Configuration**.
2. Set **Site URL** to: `https://gitflick.netlify.app`
3. Under **Redirect URLs**, add:
   - `https://gitflick.netlify.app/**`
   - `https://gitflick.netlify.app/auth/callback`
   - (Optional for local dev: `http://localhost:8080/**`, `http://localhost:5173/**`)

The app also sends `emailRedirectTo: window.location.origin + '/auth/callback'` on signup, so the verification link in the email will use the domain the user signed up from (gitflick or localhost).

## 2. Disable email verification (sign in without confirming email)

To let users sign in immediately after signup without confirming their email:

1. Go to **Authentication** → **Providers** → **Email**.
2. Turn **off** **“Confirm email”**.

After this, new signups are not required to click the verification link. You can turn it back on later if you want to enforce verification.
