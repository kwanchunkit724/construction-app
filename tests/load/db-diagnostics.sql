-- Backend health diagnostics. Paste into Supabase Dashboard → SQL Editor.
-- Re-run any time to watch growth. Read-only.

-- 1) Database size vs free-tier 1 GB ceiling
select pg_size_pretty(pg_database_size(current_database())) as db_size;

-- 2) Biggest tables by rows + disk + index count
select relname as table, n_live_tup as rows,
       pg_size_pretty(pg_total_relation_size(relid)) as total_size,
       (select count(*) from pg_indexes i where i.tablename = t.relname) as indexes
from pg_stat_user_tables t
order by pg_total_relation_size(relid) desc
limit 25;

-- 3) How many tables broadcast realtime changes (fan-out surface).
--    Each one × every subscribed client = message volume. Free tier:
--    ~200 concurrent realtime connections, 2M messages/month.
select count(*) as realtime_tables,
       string_agg(tablename, ', ' order by tablename) as tables
from pg_publication_tables
where pubname = 'supabase_realtime';

-- 4) Tables WITHOUT an index on common filter columns (project_id / created_at).
--    Anything listed = a future seq-scan risk once that table grows.
select t.relname as table, c.column_name
from pg_stat_user_tables t
join information_schema.columns c
  on c.table_name = t.relname and c.column_name in ('project_id','created_at','user_id','status')
where not exists (
  select 1 from pg_indexes i
  where i.tablename = t.relname and i.indexdef ilike '%(' || c.column_name || '%'
)
order by t.relname, c.column_name;

-- 5) Sequential vs index scans per table (high seq_scan on a growing table = missing index)
select relname as table, seq_scan, idx_scan, n_live_tup as rows
from pg_stat_user_tables
where seq_scan > 0
order by seq_scan desc
limit 25;

-- 6) Slowest statements (needs pg_stat_statements; enable under Database → Extensions).
-- select calls, round(mean_exec_time::numeric, 1) as avg_ms,
--        round(total_exec_time::numeric, 0) as total_ms, query
-- from pg_stat_statements order by total_exec_time desc limit 20;
