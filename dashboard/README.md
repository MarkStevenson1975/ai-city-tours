# AI City Tours — Dashboard

Operator dashboard for managing AI-guided city tours. Next.js 15 (App Router) +
Supabase Auth + Tailwind. Deploys as its own Vercel project.

> **Current state (read first):** Scaffold is built (21 files), dependencies
> installed (`node_modules` present), `.env.local` set up. **Not yet running.**
>
> To get it running locally for the first time:
>   1. In Supabase dashboard → Authentication → URL Configuration, set Site URL
>      to `http://localhost:3000` and add `http://localhost:3000/auth/callback`
>      to Redirect URLs.
>   2. `npm run dev` in this folder.
>   3. Visit `http://localhost:3000`, sign in with your email (magic link).
>   4. After first sign-in, run the "make yourself admin" SQL below in
>      Supabase SQL Editor.
>   5. Refresh the dashboard — Hereford appears in your cities list.
>
> What works: cities list (RLS-scoped), per-city overview with stops table.
> What's NOT here yet: edit forms, image uploads, publish workflow, sponsor
> management — see "What's NOT in this scaffold yet" further down.

```
dashboard/
├── package.json
├── tsconfig.json
├── next.config.mjs
├── postcss.config.mjs
├── tailwind.config.ts
├── .env.local.example
├── .gitignore
├── README.md
└── src/
    ├── middleware.ts                       # session refresh + /dashboard gate
    ├── app/
    │   ├── globals.css                     # Tailwind + brand fonts
    │   ├── layout.tsx                      # root <html>
    │   ├── page.tsx                        # / → redirect by auth state
    │   ├── login/page.tsx                  # magic-link form
    │   ├── auth/
    │   │   ├── callback/route.ts           # post-magic-link exchange
    │   │   └── signout/route.ts
    │   └── dashboard/
    │       ├── layout.tsx                  # sidebar + role display
    │       ├── page.tsx                    # cities list (RLS-scoped)
    │       └── [citySlug]/page.tsx         # city overview + stops table
    └── lib/supabase/
        ├── client.ts                       # browser Supabase client
        ├── server.ts                       # server Supabase client
        └── middleware.ts                   # session refresher
```

---

## Quick start (local dev)

### 1. Install dependencies

```bash
cd "/Users/markstevenson/Documents/Claude/Projects/AI City Tours/dashboard"
npm install
```

This pulls down Next.js, React, Supabase SSR client, Tailwind, etc. (~3 minutes).

### 2. Configure env vars

```bash
cp .env.local.example .env.local
```

Open `.env.local` and fill in two values from your Supabase project
(**Project Settings → API**):

- `NEXT_PUBLIC_SUPABASE_URL` — the project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the **anon (public)** key. NOT the
  service-role key — the dashboard runs in the browser and relies on RLS
  for security, not on key secrecy.

### 3. Configure Supabase Auth redirect URLs

In Supabase dashboard → **Authentication → URL Configuration**:

- **Site URL:** `http://localhost:3000` (for now — change to your deployed URL once you ship to Vercel)
- **Redirect URLs:** add `http://localhost:3000/auth/callback`

Without this, the magic-link emails will redirect somewhere wrong.

### 4. Run dev server

```bash
npm run dev
```

Open <http://localhost:3000>. You'll be redirected to the login page.

### 5. Make yourself the admin

First time only:

1. On the login page, type your email (`stevenson953@yahoo.co.uk`) and click
   **Send magic link**
2. Check your inbox, click the link — you'll be redirected to `/dashboard`,
   which will show "No cities accessible" because `user_profiles.role`
   defaults to `operator`
3. In the Supabase SQL editor, run:
   ```sql
   UPDATE user_profiles
   SET role = 'admin'
   WHERE id = (SELECT id FROM auth.users WHERE email = 'stevenson953@yahoo.co.uk');
   ```
4. Refresh the dashboard — Hereford appears in the cities list

### 6. Click into Hereford

You should see:

- The city overview header with operator name, slug, subscription status, published version
- Four stat tiles: 10 stops, 2 sponsors, 15 location facts, 4 events
- A table of all 10 stops with their image status

**This is the read-only baseline.** Edit forms come next session.

---

## Inviting an operator

Once Hereford BID is ready to use the dashboard:

1. Supabase dashboard → **Authentication → Users → Add user → Send invite**
   to their email
2. After they confirm, find their user ID:
   ```sql
   SELECT id, email FROM auth.users WHERE email = 'them@herefordbid.co.uk';
   ```
3. Assign them to Hereford:
   ```sql
   INSERT INTO city_operators (user_id, city_id)
   VALUES (
     '<their-user-id-from-step-2>',
     (SELECT id FROM cities WHERE slug = 'hereford')
   );
   ```
4. They log in, RLS scopes their `cities` query to only Hereford, the dashboard
   shows them their one city.

---

## Deploying to Vercel

When ready to ship the dashboard publicly (after we have edit forms):

1. Create a new Vercel project pointing at this `dashboard/` subfolder
   (when importing from GitHub, set **Root Directory** to `dashboard`)
2. Add env vars in Vercel project settings:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Deploy → get a URL like `ai-city-tours-dashboard.vercel.app`
4. Update Supabase Auth redirect URLs to include the production URL:
   `https://ai-city-tours-dashboard.vercel.app/auth/callback`

---

## What's NOT in this scaffold yet

This session's scope was the foundation. Next sessions add:

- [ ] Stop edit form — name, narration, facts, coordinates, image upload
- [ ] Operator logo upload (with attribution text)
- [ ] Sponsor CRUD UI
- [ ] Location facts CRUD UI
- [ ] Events CRUD UI
- [ ] Settings page (city brand, guide voice, operator info)
- [ ] **Publish workflow** — the diff view + the "Publish" button that calls
      `publish_city()` and busts the `/api/config/<slug>` cache
- [ ] Stripe Connect onboarding for the operator
- [ ] Sponsor Stripe checkout flow + webhook handler
- [ ] Sponsor email notifications on payment fail / cancel
- [ ] QR poster generator (PDF download)
- [ ] AI-assisted new-city flow (admin)
- [ ] KPI dashboard (operator-visible analytics)

The schema in Supabase already supports all of this — the dashboard just
needs the UI built out.

---

## Common issues

### "No cities accessible to you yet"

Either:
- Your `user_profiles.role` is `operator` and you have no `city_operators`
  rows → ask the admin (Mark) to assign you, or set yourself to admin via SQL
- RLS is misconfigured → re-run the migration in `db/migrations/0001_initial_schema.sql`

### Magic link email never arrives

Check: spam folder · Supabase **Authentication → Logs** for delivery errors ·
Supabase free tier has a 3-emails-per-hour rate limit on the built-in mailer
(upgrade or wire up SMTP for production).

### Hot reload not updating

`npm run dev` keeps changes live. If something's stuck, kill the process
(Ctrl+C) and re-run.
