-- ============================================================
-- Migration 015: SDMO task optimization metadata alignment
-- Backfills canonical task columns from legacy metadata keys
-- and removes the duplicated metadata fields.
-- ============================================================

UPDATE tasks
SET
  last_optimized_at = COALESCE(
    last_optimized_at,
    NULLIF(metadata->>'last_optimized_at', '')::timestamptz
  ),
  sdmo_optimization_count = CASE
    WHEN COALESCE(sdmo_optimization_count, 0) > 0 THEN sdmo_optimization_count
    ELSE COALESCE(NULLIF(metadata->>'sdmo_optimization_count', '')::integer, 0)
  END,
  metadata = COALESCE(metadata, '{}'::jsonb)
    - 'last_optimized_at'
    - 'sdmo_optimization_count'
WHERE COALESCE(metadata, '{}'::jsonb) ? 'last_optimized_at'
   OR COALESCE(metadata, '{}'::jsonb) ? 'sdmo_optimization_count';
