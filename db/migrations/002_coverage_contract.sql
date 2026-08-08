-- Expanded ingestion coverage contract

ALTER TABLE speaker_signal.ingestion_coverage
  ADD COLUMN IF NOT EXISTS expected_description_only_speakers INTEGER NOT NULL DEFAULT 0;
ALTER TABLE speaker_signal.ingestion_coverage
  ADD COLUMN IF NOT EXISTS expected_total_speakers INTEGER NOT NULL DEFAULT 0;
ALTER TABLE speaker_signal.ingestion_coverage
  ADD COLUMN IF NOT EXISTS expected_research_tasks INTEGER NOT NULL DEFAULT 0;
ALTER TABLE speaker_signal.ingestion_coverage
  ADD COLUMN IF NOT EXISTS extracted_research_tasks INTEGER NOT NULL DEFAULT 0;

DROP TABLE IF EXISTS speaker_signal.research_targets;

INSERT INTO speaker_signal.schema_migrations (version)
VALUES ('002_coverage_contract')
ON CONFLICT (version) DO NOTHING;
