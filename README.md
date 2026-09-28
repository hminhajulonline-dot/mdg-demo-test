# Microstock Metadata Generator — by Plickify

A private, AI-powered toolkit for microstock contributors.
Upload images and instantly get optimized **titles, descriptions, keywords
and categories**, then export platform-ready CSVs for Adobe Stock,
Shutterstock, Freepik, Vecteezy, Dreamstime, 123RF, Depositphotos, Pond5
and more — plus a suite of companion tools: a **Prompt Generator**
(Manual + guided Auto engine), **EPS/AI to JPG**, **File Converter** and
**Adobe Tracker** (keyword & contributor research).

**The entire site is admin-only.** Visitors cannot sign up — only
authorized administrators (Google sign-in or email/password) can enter
the site and use the tools.

Fork this repository, connect **your own** Supabase project + Vercel
deployment, run the SQL migrations once, and you have your own branded,
fully self-hostable metadata tool.

---

## Table of Contents

1. [Features](#features)
2. [Tools](#tools)
3. [Tech Stack](#tech-stack)
4. [Requirements](#requirements)
5. [Fork Instructions](#fork-instructions)
6. [Local Installation](#local-installation)
7. [Environment Variables](#environment-variables)
8. [Supabase Project Setup](#supabase-project-setup)
9. [Database Migrations](#database-migrations)
10. [Storage](#storage)
11. [Google OAuth Setup](#google-oauth-setup)
12. [First Admin Setup](#first-admin-setup)
13. [AI API Keys (BYOK)](#ai-api-keys-byok)
14. [Vercel Deployment](#vercel-deployment)
15. [Custom Domain](#custom-domain)
16. [Admin Panel Guide](#admin-panel-guide)
17. [Editing Page Content](#editing-page-content)
18. [Branding & Theme](#branding--theme)
19. [Updating the Project](#updating-the-project)
20. [Community Feed](#community-feed)
21. [Troubleshooting](#troubleshooting)
22. [Security Notes](#security-notes)

---

## Features

### Access control
- Whole site gated behind login at the middleware level
- Two sign-in methods for admins: **Google OAuth** and
  **email/password** (with a forgot-password reset link), both on
  `/login`
- Only `admin_users` rows with `status = 'active'` can enter
- No public registration anywhere — accounts are created by the first
  Google sign-in or by adding the admin by email

### Generator (CSV Tree parity)
- Two modes: **Metadata** and **Image-to-Prompt** (`/generator?mode=img2prompt`)
- Full control sidebar docked left: platform tiles (9 templates), title
  length sliders, keyword count sliders, prefix/suffix, negative title
  words / keywords / prompt words, prohibited words, single-word keywords,
  silhouette, transparent & white background, camera parameters, custom AI
  instructions; PNG files automatically get "isolated on transparent
  background" phrasing
- Bulk queue with live stats (done/total/success/failed + ETA), **Stop**
  button and one automatic retry of failed images
- Deterministic enforcement: word-boundary truncation, banned-word
  stripping, prefix/suffix application, keyword dedupe/cap
- Result cards mirror the selected platform's columns exactly

### API keys — bring your own (BYOK)
- 13 providers: Groq (default), Gemini, OpenAI, OpenRouter, Mistral,
  Cloudflare Workers AI, NVIDIA NIM, GitHub Models, Cohere, Together AI,
  SambaNova, DeepInfra, Cerebras
- The admin chooses which providers are available (**Admin → AI Providers**)
- Multi-key rotation per provider, automatic cross-provider fallback,
  client RPM throttling, key cooldown badges
- Bilingual step-by-step tutorials (English / বাংলা) inside the API Keys
  modal for every provider
- Keys are stored only in the browser of the person who adds them
- Optional server-wide fallback via `AI_API_KEY` env var

### Exports
- Per-platform CSV templates identical to each marketplace's upload format
- Filename extension override (eps/ai/svg/jpg/jpeg/png/psd)
- Metadata mode exports **CSV**; prompt mode exports **all-prompts.csv**
  and **all-prompts.txt**
- Success popup after every completed batch
- Local browser history of recent generations

### Admin Panel (`/admin`)
| Section | Controls |
| --- | --- |
| Dashboard | Generation stats, recent activity, quick links |
| Site Settings | Site name, description, footer text |
| Page Content | Hero badge/headline/sub-headline, feature cards, How-it-works steps, About text — everything public-facing |
| Branding | Logo & favicon upload (Supabase Storage), brand colors |
| Theme | Light/Dark/System default, preset colors, custom HEX colors |
| Generator Settings | Title/description/keyword bounds, category list, language, extra instructions, batch size (up to 200), hourly rate limit (**0 = unlimited**) |
| AI Providers | Toggle which of the 13 providers users can add |
| AI Status | Read-only status of the server env fallback key |
| Master Prompts | CRUD for the Auto Engine's master prompts (title, description, system prompt, active toggle) |
| Adobe Tracker | Tool access, daily quota, results per search, key-source routing, site API key pool with per-key test |
| Admins | Add (by Google email), disable, remove admins — last-active-admin protection |
| Usage | System generation log (no personal data) |

Everything above is stored in the database — changes apply to the live site
immediately, no redeploy needed.

## Tools

Every tool lives under `/tools` (header **Tools** dropdown, `/tools`
index) and shares the same admin-only access:

| Tool | Route | What it does |
| --- | --- | --- |
| Metadata Generator | `/generator` | Two modes: **Metadata** (titles/descriptions/keywords/categories → per-platform CSV) and **Image-to-Prompt** (`/generator?mode=img2prompt`) |
| Prompt Generator | `/tools/prompt-generator` | **Manual Engine**: AI keyword research, reference-image description, IP/copyright audit, stock-safe prompt compilation with TXT/CSV export. `/tools/prompt-generator/auto` adds the guided **Auto Engine** driven by admin-managed master prompts |
| EPS/AI to JPG | `/tools/eps-to-jpg` | Batch-convert EPS, AI, PS and PDF to 150 PPI JPGs entirely in the browser (Ghostscript WASM) with previews and ZIP download |
| File Converter | `/tools/converter` | Image→Image (quality control), Images→PDF (size/orientation/margins), PDF→Images (72/150/300 DPI) and a smart Compressor — all in the browser |
| Adobe Tracker | `/tools/adobe-tracker` | Keyword & contributor research on Adobe Stock: per-asset downloads/views/categories/keywords, content-type & generative-AI filters, CSV/TXT export, moodboard, CSV Tree parity deep-links (`?mode=&q=`) |

The Adobe Tracker ships with a zero-config **mock provider** (sample
data). Point it at live data via env vars (`ADOBE_TRACKER_PROVIDER`,
`APIFY_TOKEN`, `ADOBE_API_KEY`) or manage keys and limits centrally in
**Admin → Tools → Adobe Tracker** (shared key pool with per-key test and
failover, daily quota, BYO popup copy). A browser-stored own Apify key
is also supported in the tool's API panel — keys entered there never
reach the server or database.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 16 (App Router) + TypeScript |
| Styling | Tailwind CSS v4 |
| Database | Supabase PostgreSQL (+ Row Level Security) |
| Auth | Supabase Auth — Google provider + email/password (admin-only) |
| Storage | Supabase Storage (branding assets) |
| Hosting | Vercel |

## Requirements

- GitHub account
- [Supabase](https://supabase.com) account (free tier works)
- [Vercel](https://vercel.com) account (free tier works)
- Node.js 20+ (only for local development)
- At least one AI provider API key (see [BYOK](#ai-api-keys-byok))

## Fork Instructions

1. Open the official repository on GitHub → **Fork → Create fork**.
2. Everything below uses *your* Supabase project and *your* keys.
   Never commit real secrets — `.env*` files are git-ignored
   (`.env.example` documents what is needed).
3. Continue with [Local Installation](#local-installation) or jump straight
   to [Supabase Project Setup](#supabase-project-setup) if you deploy first.

## Local Installation

```bash
git clone https://github.com/<your-username>/microstock-metadata-generator.git
cd microstock-metadata-generator
npm install
cp .env.example .env.local    # then fill it in - see next section
```

Useful commands:

```bash
npm run dev       # http://localhost:3000
npm run lint      # ESLint
npx tsc --noEmit  # TypeScript check
npm run build     # production build
```

## Environment Variables

Copy `.env.example` to `.env.local`:

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL (Settings → API) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon key (Settings → API) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Server-only secret (Settings → API). Never expose to the browser. |
| `ADMIN_EMAIL` | optional | Bootstrap allowlist for the very first admin |
| `AI_PROVIDER` | optional | Server fallback: groq/openai/gemini/openrouter/mistral/custom |
| `AI_API_KEY` | optional | Server fallback key when no personal keys exist |
| `AI_MODEL` | optional | Override the default model |
| `AI_BASE_URL` | optional | Custom OpenAI-compatible base URL (`AI_PROVIDER=custom`) |
| `ADOBE_TRACKER_PROVIDER` | optional | `mock` (default sample data), `apify` or `adobe` |
| `APIFY_TOKEN` | optional | Apify actor token for live Adobe Tracker data (the Admin key pool takes precedence) |
| `APIFY_ACTOR` | optional | Override the default Apify actor (e.g. `igolaizola~adobe-stock-scraper`) |
| `ADOBE_API_KEY` | optional | Official Adobe Stock API key (metadata only — no download counts) |
| `ADOBE_TRACKER_CACHE_TTL` | optional | Adobe Tracker response cache TTL in seconds (default 21600 = 6h) |
| `NEXT_PUBLIC_APP_URL` | recommended | Your final URL (localhost or production domain) |

> The server AI key is a **fallback only**. The intended flow is adding your
> personal keys from the generator's **API Keys** modal — they never touch
> the server or database.

## Supabase Project Setup

1. [supabase.com](https://supabase.com) → **New project** (name, strong DB
   password, region near you).
2. When ready open **Project Settings → API** and copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - anon public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - service_role key → `SUPABASE_SERVICE_ROLE_KEY`

## Database Migrations

All tables ship as versioned SQL in `supabase/migrations/`:

```
0001_admin_users.sql            admin authorization table
0002_site_settings.sql          branding/theme/site settings (single row)
0003_generator_settings.sql     generator defaults (single row)
0004_usage_logs.sql             system generation log
0005_rls.sql                    row level security policies
0006_storage.sql                storage buckets + policies
0007_unlimited_generation.sql   rate limit 0 = unlimited, batch cap 200
0008_raise_batch_limit.sql      raises existing rows to the new cap
0009_page_content.sql           editable hero/features/steps/about content
0010_enabled_providers.sql      admin-selected AI providers
0011_master_prompts.sql         Auto Engine master prompts (CRUD)
0012_adobe_tracker.sql          Adobe Tracker cache/settings/keys/quota
```

Run them **in order** using either method:

**Option A — SQL Editor (easiest):**
Supabase dashboard → SQL Editor → paste the full contents of each file →
**Run** (repeat for every migration, oldest first).

**Option B — Supabase CLI:**

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

Future updates ship as new numbered files — run those the same way.
Check `version.json` to see which release you are on.

## Storage

Migration `0006_storage.sql` creates both buckets automatically:

- `branding-assets` (**public**) — logo/favicon uploads from Admin Panel.
  The upload API also re-asserts public visibility defensively.
- `generator-images` (private) — reserved for future features.

Generator image processing is transient (in-memory base64); nothing piles
up in storage.

## Google OAuth Setup

1. [console.cloud.google.com](https://console.cloud.google.com) → create or
   select a project.
2. **APIs & Services → Credentials → Create Credentials → OAuth client ID
   → Web application.**
3. Authorized redirect URI (only one needed):
   ```
   https://<your-project-ref>.supabase.co/auth/v1/callback
   ```
4. Copy the Client ID and Secret into **Supabase → Authentication →
   Providers → Google → Enable**, then Save.
5. **Authentication → URL Configuration**:
   - **Site URL:** your final URL (`http://localhost:3000` while developing,
     your production domain after deploy).
   - **Redirect URLs** (add all you use):
     ```
     https://<your-project-ref>.supabase.co/auth/v1/callback
     http://localhost:3000/**
     https://<your-app>.vercel.app/**
     https://<your-custom-domain>/**        (if used)
     ```

There is no user-registration flow anywhere — this allowlist is what makes
the site admin-only.

## First Admin Setup

**Method A — bootstrap email (recommended)**

1. Set `ADMIN_EMAIL=you@gmail.com` in `.env.local` (and later in Vercel).
2. Open `/login` → **Continue with Google** using that exact account.
3. The app detects the matching email, creates an active `admin_users` row
   automatically and lets you in. You may remove the env var afterwards.

**Method B — SQL**

1. Log in once via Google (this creates the Auth user).
2. Supabase → Authentication → Users → copy the UID.
3. SQL Editor:
   ```sql
   insert into public.admin_users (user_id, email, status)
   values ('<paste-uid>', 'you@gmail.com', 'active');
   ```
4. Log in again → `/admin` opens.

**Email/password login:** after your account exists in Supabase Auth
(e.g. from the first Google sign-in), click **Forgot password** on
`/login` — the emailed recovery link lets you set a password, after
which you can sign in with email + password instead of Google. Both
methods still require an active `admin_users` row.

**More admins afterwards:** no SQL needed — use **Admin Panel → Admins →
Add by Google email**. The person must have signed in via Google at least
once so their account exists.

Revoke access any time from the same page (Disable / Remove). The panel
refuses to disable/remove the last active admin.

## AI API Keys (BYOK)

1. Sign in and open the **Generator**.
2. Click **API Keys** in the controls sidebar.
3. Every enabled provider has a **? tutorial button** — step-by-step
   instructions in English and Bangla, with dashboard links and free-tier
   info. Recommended starter: **Groq** (free, fast).
4. Paste the key → **Add**. Repeat for other providers you want as
   automatic fallbacks.

Behaviour (CSV Tree parity):

- The active provider is tried first; on failure/quota the next saved
  provider takes over automatically (toast shows the fallback).
- Multiple keys per provider rotate; failed keys cool down ~5 min (quota
  errors ~1 h) then recover.
- Requests-per-minute throttling respects each provider's free tier.
- Keys live in that browser's localStorage only — never in the database.

Which providers appear here is controlled by **Admin → AI Providers**.

## Vercel Deployment

1. Push your fork to GitHub (everything lives on `main`).
2. Vercel → **Add New → Project** → import the forked repo.
3. Framework auto-detects (Next.js). Add all environment variables from
   the table above in **Settings → Environment Variables**.
4. **Deploy.**
5. After first deploy set `NEXT_PUBLIC_APP_URL` to the final URL and
   redeploy once more.
6. Update **Supabase → Authentication → URL Configuration**: Site URL and
   Redirect URLs must include the deployed domain (see OAuth section).

Every push to `main` triggers an automatic deployment.

## Custom Domain

1. Vercel → Project → **Domains** → add your domain, follow the DNS
   instructions (usually `A` → `76.76.21.21` or `CNAME` →
   `cname.vercel-dns.com`).
2. Update `NEXT_PUBLIC_APP_URL` and redeploy.
3. **Important:** add the new domain to Supabase redirect URLs
   (`https://yourdomain.com/**`) and set it as Site URL — otherwise login
   silently redirects back to the old URL. See Troubleshooting.
4. Custom domains also bypass ISP-level blocks some networks apply to
   `*.vercel.app`.

## Admin Panel Guide

Open `/admin` (or log in through `/login`). Highlights:

- **Dashboard** — totals, last-24h generations, recent activity.
- **Site Settings** — site name/description/footer.
- **Page Content** — edit every public page section (see below).
- **Branding** — logo/favicon upload, primary & secondary colors.
- **Theme** — default light/dark/system, presets, custom HEX colors.
- **Generator Settings** — output bounds, category list, language, extra
  instructions, max batch size, hourly rate limit (**0 = unlimited**).
- **AI Providers** — choose which providers users can add.
- **Master Prompts** — manage the prompts the Auto Engine offers.
- **Adobe Tracker** — enable the tool, set the daily quota and results
  per search, choose the key source (admin pool / user BYO / env) and
  manage the site Apify key pool (label, active toggle, per-key test).
- **Admins** — manage who has access.
- **Usage** — system-level generation log.

## Editing Page Content

**Admin → Page Content** edits everything visitors see without code:

- Home hero: badge pill, headline, sub-headline
- Feature cards (add/remove up to 8)
- "How it works" steps
- About-page title and body (blank line = new paragraph)

Save → changes are live immediately (all pages render dynamically).

## Branding & Theme

Nothing public is hard-coded. Logo, favicon, site name, colors, footer and
default theme load from the `site_settings` table on every request.
Visitors can additionally override light/dark locally via the header toggle.

## Updating the Project

Forks stay up to date **automatically**:

- This repo ships a GitHub Action (`.github/workflows/auto-sync.yml`) that
  runs **daily in every fork**, merging new official releases into the
  fork's `main` branch.
- The merge push triggers Vercel, so updates deploy themselves.
- If the run reports a conflict (because core files were customized),
  open the fork on GitHub → **Sync fork → Update branch** and resolve
  conflicts once manually.

### In-site update notifications

Every release also ships a `updates.json` file at the repo root. The site
reads it and shows:

- A **bell icon** in the nav with a pulsing dot whenever a new version
  arrives (click to preview, opens the changelog).
- A full **`/updates` timeline**: what changed per version, which bugs were
  fixed, which SQL migrations must be run and an explicit action guide when
  any manual step is needed.

Because `updates.json` travels with the code, forked sites display the new
entry automatically right after each auto-sync — no database writes, no
manual announcements.

Manual alternatives:

```bash
# Option A - GitHub UI: repo page -> "Sync fork" -> "Update branch"

# Option B - git CLI
git remote add upstream https://github.com/<official-owner>/<repo>.git
git fetch upstream
git merge upstream/main
npm install                      # if package.json changed
```

Then run any **new** migrations from `supabase/migrations/` in the SQL
Editor (files numbered higher than what you already ran).

## Community Feed

The `/community` page is a social space for marketplace news, platform
rule changes and tips - maintained **exclusively in the official
repository**:

1. Edit `community.json` at the repo root:
   ```json
   {
     "posts": [
       {
         "id": "adobe-rules-2026-09",
         "date": "2026-09-01",
         "pinned": true,
         "title": "Adobe Stock updates keyword rules",
         "body": "First paragraph...\n\nSecond paragraph...",
         "linkUrl": "https://helpx.adobe.com/...",
         "linkLabel": "Official announcement"
       }
     ]
   }
   ```
2. Commit to `main` on the official repo.
3. Auto-sync delivers it to every fork within the hour; Vercel redeploys.

Like `announcement.json`, this cannot be edited from any Admin Panel -
fork owners receive the same feed as everyone else.

## Troubleshooting

**Login loops back to `/login?next=...`**
Your Google account has no active `admin_users` row — follow
[First Admin Setup](#first-admin-setup).

**Login broken on a custom domain**
Supabase only redirects to allowlisted URLs. After adding a domain:
1. Supabase → Authentication → URL Configuration → add
   `https://yourdomain.com/**` and set the Site URL.
2. Update `NEXT_PUBLIC_APP_URL` in Vercel and redeploy.
3. Test in incognito. Google Cloud Console needs no change (its callback
   points at Supabase, not your domain).

**Site only loads with a VPN**
Some ISPs intermittently block `*.vercel.app`. Quick fix: switch device DNS
to `1.1.1.1` / `8.8.8.8` and flush DNS. Permanent fix: attach a custom
domain.

**"AI Provider: Not connected" in the health widget**
No personal BYOK keys in this browser AND no server `AI_API_KEY`.
Add a key via Generator → API Keys (recommended), or set the env vars.

**Generation returns 429**
Hourly per-IP limit reached. Set Rate Limit = 0 (unlimited) in
Admin → Generator Settings, or wait.

**"Batch limit reached (N images)"**
Raise Max Images / Batch in Admin → Generator Settings (up to 200).

**Favicon doesn't change**
Browsers cache favicons aggressively — reopen the tab or test in
incognito after saving in Admin → Branding.

**Database errors about missing tables/constraints**
You skipped migrations. Run all files in `supabase/migrations/` in order.

**Admin Panel save shows a relation/table error**
Migrations not fully applied — see previous item.

## Security Notes

- Admin-only access: Google OAuth **or** email/password via Supabase
  Auth; no public signup exists anywhere.
- Authorization = valid session **AND** active `admin_users` row, enforced
  server-side on every page and API route (middleware gates the whole site).
- RLS everywhere: anonymous clients can't write anything; `usage_logs` is
  server-only; users can read only their own admin row.
- `SUPABASE_SERVICE_ROLE_KEY` and any server AI key stay server-side.
- BYOK keys live in localStorage only and travel per-request over HTTPS to
  your own deployment, which forwards them solely to the chosen provider.
- Adobe Tracker: site Apify keys live only in the `adobe_tracker_keys`
  table (service-role access only), are masked in the admin UI, and are
  never logged; a personal tracker key added in the tool stays in
  that browser's localStorage and travels only in the `x-tracker-key`
  request header.
- Generation validates image type/size and rate-limits per IP (optional).
- Uploaded generator images are processed in memory — never persisted.
- Usage logs store a salted IP hash, never raw IPs.
- **Attribution license:** the required Plickify credit
  (`lib/core/license.ts`) is verified at runtime by both the root layout
  and the generation API. Removing or editing it breaks rendering and all
  generation. It is intentionally not editable from the Admin Panel.

---

Made by [Plickify](https://www.plickifyacademy.com/) ·
[facebook.com/plickify](https://fb.com/plickify)
