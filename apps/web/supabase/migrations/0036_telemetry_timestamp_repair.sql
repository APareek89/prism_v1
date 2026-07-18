-- 0036_telemetry_timestamp_repair.sql
--
-- Codex can emit timeUnixNano="0" while still sending otherwise valid OTLP
-- metadata. Preserve the real provider evidence and repair only its timestamp from
-- the immutable database receive time. No score formula or measurement value changes.

update public.telemetry_events
set event_time = created_at
where event_time < timestamptz '2000-01-01 00:00:00+00';

with session_bounds as (
  select
    sessions.id,
    min(events.event_time) as first_event_at,
    max(events.event_time) as last_event_at
  from public.cc_sessions as sessions
  join public.telemetry_events as events
    on events.connection_id = sessions.connection_id
   and events.source_session_id = sessions.session_id
  where sessions.connection_id is not null
    and sessions.session_id is not null
  group by sessions.id
)
update public.cc_sessions as sessions
set
  ts = bounds.first_event_at,
  last_event_at = bounds.last_event_at,
  ingested_at = now()
from session_bounds as bounds
where sessions.id = bounds.id
  and (
    sessions.ts < timestamptz '2000-01-01 00:00:00+00'
    or sessions.last_event_at < timestamptz '2000-01-01 00:00:00+00'
  );
