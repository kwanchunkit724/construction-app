-- =============================================================
-- v105-ai-enabled-default-on.sql
-- =============================================================
-- Drop the AI "pilot opt-in" gate. v56 shipped projects.ai_enabled DEFAULT
-- false so AI 站長 was per-project opt-in during the pilot. The pilot is over —
-- AI is live and wanted on every 工地. Flip the default to true and backfill
-- existing projects so AI is on everywhere.
--
-- The per-project flag + set_project_ai_enabled() RPC are KEPT (admin/PM can
-- still disable AI for a specific project for cost control); only the DEFAULT
-- changes from opt-in to opt-out. Global app_config.ai_assistant_enabled and
-- the 助理 module switch remain the other two gates (see ai_enabled_for_project).
--
-- Additive / backwards-compatible: no column/table dropped. Applied + verified
-- by execution on 2026-06-23 (apply 201; default 'true'; 19/19 projects enabled;
-- 古洞 9ab73b8e-… ai_enabled=true).
-- =============================================================

alter table projects alter column ai_enabled set default true;

update projects set ai_enabled = true where ai_enabled is distinct from true;

-- =============================================================
-- Post-apply verification (execute, not source):
--   select column_default from information_schema.columns
--     where table_name='projects' and column_name='ai_enabled';        -> 'true'
--   select count(*) total, count(*) filter (where ai_enabled) enabled
--     from projects;                                                    -> total = enabled
--   -- a brand-new project (no ai_enabled supplied) is born true:
--   --   insert into projects(name,...) values('x',...) returning ai_enabled; -> true
-- =============================================================
