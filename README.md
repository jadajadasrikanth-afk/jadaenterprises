# Field Data Collect — Setup Guide

Mobile-first PWA for collecting field user data (hotel details, ID proof,
shop photo, GPS) with a mobile-number + password login and a full admin
dashboard. Runs entirely on Supabase's free tier — no Google Cloud, no
second account, no credit card needed anywhere.

## What's in this project
```
supabase/
  schema.sql                     ← run once in Supabase SQL Editor
                                    (creates tables, RLS, and the private
                                    storage bucket for photos/documents)
  functions/
    _shared/authHelper.ts        ← JWT verification helper
    _shared/cors.ts              ← CORS headers (required for browser calls)
    admin-reset-password/        ← admin generates password reset link
    log-action/                  ← writes audit log + emails admin
    export-csv/                  ← admin-only CSV export (no ID docs)
frontend/                        ← React + TypeScript + Vite PWA
```

Photo/document uploads and downloads go straight from the browser to
Supabase Storage (`frontend/src/lib/storage.ts`) — no Edge Function needed
for that part, since Supabase Storage enforces the same Row Level Security
rules directly in the database.

## 1. Supabase project (the only account you need)
1. Create a free project at supabase.com.
2. SQL Editor → paste and run `supabase/schema.sql`. This creates the
   database tables **and** the private `user-documents` storage bucket
   with its access rules, all in one go.
3. Project Settings → API Keys → copy the **anon / public** key (for the
   frontend). Project Settings → Data API → copy the **Project URL**.
   Project Settings → API Keys → also copy the **service_role / secret**
   key (for Edge Functions only — never put this in frontend code).
4. **Authentication → Sign In / Providers → Email → turn OFF "Confirm
   email"** (exact label may read "Confirm sign up"). This is required —
   we log users in with a synthetic email (`mobile@fielddata.local`) that
   doesn't really exist, so Supabase can never deliver a confirmation
   email; leaving confirmation ON would lock every user out permanently.
5. **Authentication → URL Configuration** → set **Site URL** to your
   deployed frontend URL (e.g. `https://field-data.vercel.app`), and add
   the same URL + `/reset-password` to **Redirect URLs**. This is what
   makes the admin's generated password-reset links land on the right page.

## 2. Deploy the Edge Functions
Install the Supabase CLI, then from the project root:
```bash
supabase login
supabase link --project-ref YOUR-PROJECT-REF
supabase secrets set \
  SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
  FRONTEND_URL=https://field-data.vercel.app \
  RESEND_API_KEY=your-resend-key \
  ADMIN_ALERT_EMAIL=your-friend@example.com

supabase functions deploy admin-reset-password
supabase functions deploy log-action
supabase functions deploy export-csv
```
`RESEND_API_KEY` / `ADMIN_ALERT_EMAIL` are optional — without them,
`log-action` just skips the email and still writes the audit log.
Sign up free at resend.com (3,000 emails/month free) if you want alert emails.

## 3. Frontend
```bash
cd frontend
npm install
cp .env.example .env   # fill in your Supabase URL + anon key
npm run dev             # local test
npm run build            # production build → dist/
```

## 4. Deploy frontend (free)
Push to GitHub, then connect the repo on **Vercel** or **Netlify** (free
tier). Set the same two env vars (`VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`) in the hosting dashboard. You'll get a URL like
`https://field-data.vercel.app` — this is what you share via WhatsApp.

## 5. Create the first admin
1. Open the deployed app, sign up normally with your friend's own mobile
   number + password.
2. In Supabase SQL Editor, run:
   ```sql
   update public.profiles set is_admin = true where mobile_number = '9876543210';
   ```
3. Log out and back in — visiting `/admin` now shows the dashboard.

## 6. Add PWA icons
Drop `icon-192.png` and `icon-512.png` into `frontend/public/` (any square
logo works) — referenced by `vite.config.ts`'s PWA manifest.

## Security notes (already built in, listed for your awareness)
- RLS ensures a user can only `select`/`update` their own `profiles` row;
  only `is_admin = true` rows can see/edit others. A database trigger also
  blocks anyone (even via a direct API call) from granting themselves admin
  or re-enabling a disabled account.
- The `user-documents` storage bucket is private. Storage RLS policies mean
  a user can only read/write files under their own folder; only admins can
  read other users' files. This is enforced by the database, not by app code.
- Documents are fetched via short-lived (2 min) signed URLs, never public links.
- CSV export deliberately omits `id_proof_file_path` / `shop_photo_file_path`.
- Every login, save, update, and sensitive admin action (view document,
  disable, delete, export, password reset) is written to `audit_logs`.
- Password reset never emails/texts automatically from user input — the
  admin reviews the request and manually sends the generated link, keeping
  a human in the loop.

## What to test before real use
- Log in as User A, try to fetch User B's profile or documents directly —
  should fail (RLS).
- Try opening `/admin` as a non-admin — should redirect to `/profile`.
- Try a direct API call setting `is_admin: true` on your own row — should
  be rejected by the trigger.
- Confirm `.env` / secrets are not committed to git (`.gitignore` should
  include `.env`).
- Upload a test photo as a normal user, then view it from the admin
  dashboard — confirms Storage RLS and signed URLs both work end to end.
