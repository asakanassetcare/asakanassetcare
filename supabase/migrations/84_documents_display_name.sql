-- Migration 84: Optional display name for uploaded documents
-- Used for "other" attachments such as furniture photos while keeping
-- the original file_name for audit/download context.

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS display_name text;
