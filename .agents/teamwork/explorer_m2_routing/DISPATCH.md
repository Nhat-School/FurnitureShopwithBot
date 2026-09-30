## 2026-09-29T16:38:16Z

You are an Explorer designing the Google OAuth 2.0 PKCE flow in Cloudflare Pages Functions for Milestone 2.
Your working directory is: /Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/explorer_m2_routing
Parent conversation ID: 2b9ce9ab-84d4-452b-a6f9-ba8a04f45219
Read ORIGINAL_REQUEST.md at: /Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/ORIGINAL_REQUEST.md
Read PROJECT.md at: /Users/nhaterik/CloudflareProjects/Furproject/PROJECT.md
Read FlashCardWeb Auth Report at: /Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/explorer_flashcard_auth/auth_pattern_report.md
Read current Pages Functions code at: /Users/nhaterik/CloudflareProjects/Furproject/functions/api/[[path]].js
Read migration file at: /Users/nhaterik/CloudflareProjects/Furproject/migrations/0002_domain_schema.sql

Task:
Design the implementation plan for:
1. `GET /api/auth/google`:
   - Generate cryptographically secure `state` (32 bytes base64url) and PKCE `code_verifier` (64 bytes base64url).
   - Compute SHA-256 `code_challenge` (base64url).
   - Set short-lived cookies: `fur_google_oauth_state` and `fur_google_oauth_verifier` with `Path=/api/auth/google/callback; HttpOnly; SameSite=Lax; Max-Age=600`.
   - Build authorization URL to `https://accounts.google.com/o/oauth2/v2/auth` with `client_id`, `redirect_uri`, `response_type=code`, `scope=openid email profile`, `state`, `code_challenge`, `code_challenge_method=S256`, `prompt=select_account`.
   - Return 302 redirect.
2. `GET /api/auth/google/callback`:
   - Extract `code` and `state` from URL query string.
   - Validate `state` against cookie using `timingSafeEqual`.
   - Exchange authorization code with Google token endpoint `https://oauth2.googleapis.com/token` using `code_verifier`.
   - Fetch userinfo from `https://openidconnect.googleapis.com/v1/userinfo` with access token. Verify `email_verified === true`.
   - Decompose name into `display_name`, `first_name`, `mid_name`, `last_name`.
   - Upsert user into D1 `users` table: match on `(auth_provider = 'google' AND provider_subject = ?)` or existing email.
   - Upsert customer record into `customers` table linked to user ID.
   - Issue signed session token (cookie `fur_session`) and clear OAuth cookies. Redirect 302 to `/?auth=success`.

Deliverables:
Write implementation plan and exact code drafts to:
/Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/explorer_m2_routing/oauth_routing_plan.md
Also write handoff.md in your working directory.
When finished, send a message to parent (2b9ce9ab-84d4-452b-a6f9-ba8a04f45219).
