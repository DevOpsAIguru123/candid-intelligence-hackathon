-- Speaker Signal & Conference Intelligence PostgreSQL Initial Migration
-- Schema: speaker_signal

CREATE SCHEMA IF NOT EXISTS speaker_signal;

-- Migration Version Tracking
CREATE TABLE IF NOT EXISTS speaker_signal.schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO speaker_signal.schema_migrations (version)
VALUES ('001_speaker_signal')
ON CONFLICT (version) DO NOTHING;

-- Conferences Table
CREATE TABLE IF NOT EXISTS speaker_signal.conferences (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  location TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  source_mode TEXT NOT NULL CHECK (source_mode IN ('live', 'firecrawl', 'demo')),
  ingestion_status TEXT NOT NULL CHECK (ingestion_status IN ('idle', 'fetching', 'extracting', 'scoring', 'sequencing', 'complete', 'failed')),
  last_ingested_at TIMESTAMPTZ NOT NULL
);

-- Speakers Table
CREATE TABLE IF NOT EXISTS speaker_signal.speakers (
  id TEXT PRIMARY KEY,
  conference_id TEXT NOT NULL REFERENCES speaker_signal.conferences(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  session_title TEXT NOT NULL,
  score INTEGER NOT NULL,
  score_reasons JSONB NOT NULL,
  dedupe_key TEXT NOT NULL
);

-- Conference Sessions Table
CREATE TABLE IF NOT EXISTS speaker_signal.conference_sessions (
  id TEXT PRIMARY KEY,
  conference_id TEXT NOT NULL REFERENCES speaker_signal.conferences(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  starts_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ends_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  location TEXT NOT NULL DEFAULT '',
  track TEXT NOT NULL DEFAULT '',
  session_type TEXT NOT NULL DEFAULT ''
);

ALTER TABLE speaker_signal.conference_sessions ADD COLUMN IF NOT EXISTS source_id TEXT NOT NULL DEFAULT '';
ALTER TABLE speaker_signal.conference_sessions ADD COLUMN IF NOT EXISTS source_url TEXT NOT NULL DEFAULT '';
ALTER TABLE speaker_signal.conference_sessions ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE speaker_signal.conference_sessions ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE speaker_signal.conference_sessions ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE speaker_signal.conference_sessions ADD COLUMN IF NOT EXISTS location TEXT NOT NULL DEFAULT '';
ALTER TABLE speaker_signal.conference_sessions ADD COLUMN IF NOT EXISTS track TEXT NOT NULL DEFAULT '';
ALTER TABLE speaker_signal.conference_sessions ADD COLUMN IF NOT EXISTS session_type TEXT NOT NULL DEFAULT '';

-- Session Speakers Junction Table
CREATE TABLE IF NOT EXISTS speaker_signal.session_speakers (
  session_id TEXT NOT NULL REFERENCES speaker_signal.conference_sessions(id) ON DELETE CASCADE,
  speaker_id TEXT NOT NULL REFERENCES speaker_signal.speakers(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT '',
  evidence_url TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (session_id, speaker_id)
);

ALTER TABLE speaker_signal.session_speakers ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT '';
ALTER TABLE speaker_signal.session_speakers ADD COLUMN IF NOT EXISTS evidence_url TEXT NOT NULL DEFAULT '';

-- Sequence Steps Table
CREATE TABLE IF NOT EXISTS speaker_signal.sequence_steps (
  id TEXT PRIMARY KEY,
  speaker_id TEXT NOT NULL REFERENCES speaker_signal.speakers(id) ON DELETE CASCADE,
  offset_days INTEGER NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'in_person')),
  status TEXT NOT NULL CHECK (status IN ('drafted', 'pending', 'complete')),
  subject TEXT NOT NULL,
  message TEXT NOT NULL
);

-- Funnel Events Table
CREATE TABLE IF NOT EXISTS speaker_signal.funnel_events (
  id TEXT PRIMARY KEY,
  speaker_id TEXT NOT NULL REFERENCES speaker_signal.speakers(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('identified', 'qualified', 'contacted', 'replied', 'meeting_scheduled', 'met_at_event', 'follow_up_sent', 'conversation_booked')),
  occurred_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT uq_funnel_events_speaker_stage UNIQUE (speaker_id, stage)
);

-- Ingestion Coverage Table
CREATE TABLE IF NOT EXISTS speaker_signal.ingestion_coverage (
  conference_id TEXT PRIMARY KEY REFERENCES speaker_signal.conferences(id) ON DELETE CASCADE,
  expected_session_pages INTEGER NOT NULL DEFAULT 0,
  fetched_session_pages INTEGER NOT NULL DEFAULT 0,
  expected_sessions INTEGER NOT NULL DEFAULT 0,
  extracted_sessions INTEGER NOT NULL DEFAULT 0,
  expected_speaker_pages INTEGER NOT NULL DEFAULT 0,
  fetched_speaker_pages INTEGER NOT NULL DEFAULT 0,
  expected_indexed_speakers INTEGER NOT NULL DEFAULT 0,
  extracted_indexed_speakers INTEGER NOT NULL DEFAULT 0,
  structured_agenda_speakers INTEGER NOT NULL DEFAULT 0,
  description_only_speakers INTEGER NOT NULL DEFAULT 0,
  total_speakers INTEGER NOT NULL DEFAULT 0
);

-- Research Tasks Table
CREATE TABLE IF NOT EXISTS speaker_signal.research_tasks (
  id TEXT PRIMARY KEY,
  conference_id TEXT NOT NULL REFERENCES speaker_signal.conferences(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES speaker_signal.conference_sessions(id) ON DELETE CASCADE,
  target_url TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'complete', 'failed')),
  priority INTEGER NOT NULL DEFAULT 0,
  instructions TEXT NOT NULL,
  claimed_by TEXT NULL,
  claimed_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  output JSONB NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_speakers_conference ON speaker_signal.speakers(conference_id);
CREATE INDEX IF NOT EXISTS idx_speakers_dedupe ON speaker_signal.speakers(conference_id, dedupe_key);
CREATE INDEX IF NOT EXISTS idx_sessions_conference ON speaker_signal.conference_sessions(conference_id);
CREATE INDEX IF NOT EXISTS idx_session_speakers_speaker ON speaker_signal.session_speakers(speaker_id);
CREATE INDEX IF NOT EXISTS idx_sequence_steps_speaker ON speaker_signal.sequence_steps(speaker_id);
CREATE INDEX IF NOT EXISTS idx_funnel_events_speaker ON speaker_signal.funnel_events(speaker_id);
CREATE INDEX IF NOT EXISTS idx_research_tasks_conf ON speaker_signal.research_tasks(conference_id);
CREATE INDEX IF NOT EXISTS idx_research_tasks_status ON speaker_signal.research_tasks(status);

-- Row Level Security (RLS) enabled on public Supabase tables without anonymous policies
ALTER TABLE speaker_signal.schema_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE speaker_signal.conferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE speaker_signal.speakers ENABLE ROW LEVEL SECURITY;
ALTER TABLE speaker_signal.conference_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE speaker_signal.session_speakers ENABLE ROW LEVEL SECURITY;
ALTER TABLE speaker_signal.sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE speaker_signal.funnel_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE speaker_signal.ingestion_coverage ENABLE ROW LEVEL SECURITY;
ALTER TABLE speaker_signal.research_tasks ENABLE ROW LEVEL SECURITY;
