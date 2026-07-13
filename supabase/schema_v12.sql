-- v12: per-speech notes on ballots
alter table ballots add column if not exists speech_notes jsonb not null default '{}'::jsonb;
