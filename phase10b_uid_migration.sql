-- PHASE 10b: Add UID field to contacts
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS uid TEXT DEFAULT '';
