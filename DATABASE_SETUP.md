# Database setup (Firebase)

NeoDevEx uses **Firebase Firestore** for the `projects` collection (replacing Supabase Postgres).

1. Follow **[FIREBASE_SETUP.md](FIREBASE_SETUP.md)** to create the Firebase project, enable Firestore, and deploy `firestore.rules` + `firestore.indexes.json`.
2. Set all `VITE_FIREBASE_*` variables in your host (see [.env.example](.env.example)).

## Data model

Collection: `projects` (document ID = project id). Fields match the former Supabase row shape (see [supabase-schema.sql](supabase-schema.sql) for reference — that file is **historical** only; do not run it against Firebase).

Main fields: `user_id`, `repo_url`, `repo_name`, `title`, `status`, `manifest`, `duration_seconds`, optional graph / ingestion fields, `created_at`, `updated_at`.

## Legacy

The old Supabase SQL workflow is deprecated. Use Firestore rules for access control instead of RLS.
