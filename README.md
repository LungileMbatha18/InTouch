# IN TOUCH. — proposal website

A responsive, single-page romantic proposal website with public, account-free forms. The visual website is implemented in Next.js; private submissions are handled by a server route and stored in Supabase before email/WhatsApp notifications are attempted.

## Included
- Editorial paper-inspired design using the supplied palette and DM Serif Display / Manrope fonts.
- Opening, letter, introduction, four appreciation sections, Apple Music link, song suggestion form, proposal responses, date planner, and personal note form.
- No visitor accounts, passwords, or sign-in flow.
- Server-only Resend and Meta WhatsApp Cloud API integrations. Email and WhatsApp are attempted independently.
- Database schema with private RLS, idempotency keys, and a database-backed hourly rate limit.
- Honest client messages: a form only reports saved after the server confirms the database save; notification statuses are shown separately.

## Run locally
1. Install Node.js 20+.
2. Copy `.env.example` to `.env.local` and fill in the settings below.
3. Create a Supabase project and run `supabase/schema.sql` in its SQL Editor.
4. Run `npm install`, then `npm run dev`.
5. Open `http://localhost:3000`.

Without the server credentials, the page renders but submissions deliberately return a configuration error rather than pretending to save.

## Required production configuration
- **Supabase:** Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `RATE_LIMIT_SECRET`. The service-role key is used only by the server. Never expose it in a `NEXT_PUBLIC_` variable. Run the schema SQL.
- **Resend email:** Set `RESEND_API_KEY` and `EMAIL_FROM`. Verify the sender domain/address in Resend. `NOTIFY_EMAIL` defaults to `mbatha_asl@icloud.com`.
- **WhatsApp:** Set `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, and `WHATSAPP_TO` (defaults to `27614519705`, international format without `+`). The recipient number must be able to receive messages from the configured WhatsApp Business Platform number, and Meta business/app setup and permissions must be complete.
- **Hosting:** Deploy to a Node-compatible host such as Vercel, set the same environment variables in its server-side environment settings, and redeploy. Configure the custom domain if desired.

## Important implementation notes
- A row is inserted before notification calls. Email and WhatsApp are attempted independently; a failed notification does not erase the saved submission.
- Notification status is persisted when the follow-up database update succeeds. Provider API acceptance is reported as `sent`; this is not a guarantee that the message reached the inbox/phone.
- Date suggestions are labelled `suggested_not_confirmed` in the database and are never described as confirmed.
- Public clients have no read policy. Only the server service role can read or update stored submissions.
- Rate limiting is per hashed client IP and hourly window, with an 8-submission limit. Set `RATE_LIMIT_SECRET` to a long random value. Ensure the host supplies a trustworthy `x-forwarded-for` header; adapt the IP extraction to the chosen host if necessary.
- The browser sends an idempotency key per submission. The database unique constraint prevents a repeated key from creating a duplicate row. A deliberate repeat submission creates a new key and a new row.
- Song suggestions are stored and forwarded; they are not added to Apple Music automatically.

## Test checklist before sharing publicly
- [ ] Run `npm install` and `npm run build` with the target Node version.
- [ ] Test all four submission types against a configured Supabase project.
- [ ] Confirm rows exist in Supabase and anonymous/visitor roles cannot read them.
- [ ] Test rate limiting and duplicate idempotency keys.
- [ ] Confirm a Resend email reaches `mbatha_asl@icloud.com`.
- [ ] Confirm a WhatsApp message arrives at `+27614519705` using the configured business sender.
- [ ] Test each notification failing independently and ensure saved rows remain.
- [ ] Test the date picker on desktop and mobile, including a past date.
- [ ] Check responsive layouts at phone, tablet, and desktop widths.
- [ ] Deploy and test the production URL over HTTPS before sending it.

No production deployment or live provider delivery tests have been performed by this project generator.
