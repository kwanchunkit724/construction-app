-- =============================================================
-- v2 Promote to admin
-- Run AFTER signing up phone 91234567 via the app.
-- =============================================================

update user_profiles
set global_role = 'admin'
where phone = '91234567';
