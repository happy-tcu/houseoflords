# House of Lords

Isomo Scholars' Debate — 18 July 2026. Web app for judges, scholars, and admins to run the tournament in real time.

## Stack
- Vite + React + React Router
- Supabase (Postgres + Auth + RLS + Realtime)
- Google OAuth (whitelist gate)

## Setup

```bash
npm install
cp .env.example .env
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

## Supabase

1. Create a project
2. Enable Google as an auth provider
3. Run `supabase/schema.sql` in the SQL editor
4. Populate `allowed_users` with your roster (email + role + code)

## Roles

- `scholar` — 60 debaters; sees their room, side, opponent, motion
- `judge` — 30 judges; scores speakers, submits ballot, doubles as timekeeper
- `admin` — releases motions per round, sees live standings
