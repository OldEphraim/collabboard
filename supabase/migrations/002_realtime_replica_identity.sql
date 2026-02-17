-- Fix: REPLICA IDENTITY FULL is required for Supabase Realtime
-- postgres_changes filtered subscriptions (e.g. filter by board_id)
-- to work correctly. Without this, filtered events may not be delivered.
ALTER TABLE board_objects REPLICA IDENTITY FULL;
