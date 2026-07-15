-- =============================================================
-- v74-issue-photos-private.sql   (Final-upgrade Tier 1.5 server — STAGED, Wave 4)
-- =============================================================
-- ⚠️ DO NOT APPLY until the signed-URL read shim is LIVE in clients
-- (src/lib/issuePhotos.ts + src/components/IssuePhoto.tsx + uploadPhoto storing a
-- path, shipped Wave 3 / web deploy). Flipping the bucket private BEFORE the shim
-- is live would 404 every photo (old rows hold full PUBLIC urls). The shim signs
-- both old (full-url) and new (path) values, so once it is deployed this flip is
-- safe — for the WEB cohort on the next Vercel deploy, and for native on the next
-- app build. (Bucket flip is web-deploy-gated, NOT native-gated.)
--
-- DEFECT: issue-photos is the only PUBLIC evidence bucket — defect/site/face photos
-- across all projects are world-readable by guessable URL, and every view bills
-- free-tier egress with no auth gate (v4-issues-schema.sql:126-127,135-137).
--
-- FIX: make the bucket private + require an authenticated session to read (via
-- short-lived signed URLs). NOTE on scope: object paths are "<uploaderId>/<file>"
-- and do NOT encode the project, so true per-project (can_view_project) scoping is
-- not expressible from the path without re-pathing every existing object. This
-- migration therefore lands the high-value 90%: private + AUTHENTICATED-read
-- (no anonymous/guessable access, no un-authed egress). Tightening to per-project
-- requires a path migration and is deferred (documented in FINAL-UPGRADE-PLAN R-notes).
-- Idempotent.
-- =============================================================

update storage.buckets set public = false where id = 'issue-photos';

-- Replace the anonymous public-read with an authenticated-read (signed URLs +
-- createSignedUrl both require the caller to pass this SELECT gate).
drop policy if exists "Public read issue photos" on storage.objects;
drop policy if exists "Authenticated read issue photos" on storage.objects;
create policy "Authenticated read issue photos"
  on storage.objects for select to authenticated
  using (bucket_id = 'issue-photos');

-- (Existing "Authenticated upload issue photos" + "Owner deletes issue photos"
--  policies are unchanged.)

-- =============================================================
-- Verify (EXECUTE, not source) AFTER the client shim is live:
--   select public from storage.buckets where id='issue-photos';        -- false
--   -- as an authenticated user: createSignedUrl on an existing path -> 200 + image loads
--   -- anonymous GET of the old public URL -> 400/404 (no longer world-readable)
-- =============================================================
