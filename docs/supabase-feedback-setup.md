# Supabase Feedback setup

1. Create a Supabase project, then open **SQL Editor** and run [`supabase/migrations/001_feedback_reports.sql`](../supabase/migrations/001_feedback_reports.sql).
2. In **Project Settings → API**, copy the project URL and a server-only **Secret key**. A legacy service-role key also works, but neither key may be placed in frontend code.
3. Add these values to `.env`, then restart `npm run dev`:

   ```env
   SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   SUPABASE_SECRET_KEY=YOUR_SERVER_ONLY_SECRET
   SUPABASE_FEEDBACK_BUCKET=feedback-attachments
   ```

4. The Feedback tab changes from unavailable to ready. Reports and optional JPG, PNG, or WEBP screenshots (up to 6 MB) are stored privately in Supabase.

## CRM database cutover

The CRM migrations are PostgreSQL-compatible with Supabase. To use Supabase for CRM, set `CRM_DATABASE_URL` to the Supabase PostgreSQL connection string (or leave it empty and set `SUPABASE_DATABASE_URL`), then run:

```powershell
npm run crm:migrate
```

This only changes the CRM connection target. It intentionally does not copy the existing local SQLite operational database automatically; that needs a separately reviewed export, mapping, verification, and cutover to avoid changing live data unexpectedly.
