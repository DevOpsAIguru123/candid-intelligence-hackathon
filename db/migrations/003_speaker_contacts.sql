-- Additive speaker contact fields; existing speaker records retain every prior value.

ALTER TABLE speaker_signal.speakers
  ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';
ALTER TABLE speaker_signal.speakers
  ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';
ALTER TABLE speaker_signal.speakers
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT NOT NULL DEFAULT '';
ALTER TABLE speaker_signal.speakers
  ADD COLUMN IF NOT EXISTS profile_url TEXT NOT NULL DEFAULT '';
ALTER TABLE speaker_signal.speakers
  ADD COLUMN IF NOT EXISTS company_domain TEXT;

INSERT INTO speaker_signal.schema_migrations (version)
VALUES ('003_speaker_contacts')
ON CONFLICT (version) DO NOTHING;
