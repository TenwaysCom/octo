-- Base-field validation SQL for historical Meegle snapshots in project 4c3fv6.
--
-- This script does not touch platform:sync. Sprint, Version and other related
-- workitem fields require Meegle detail reads and are cleaned by
-- `pnpm --dir server platform:clean-meegle --apply`.

BEGIN;

WITH project_names(project_key, project_name) AS (
  VALUES ('4c3fv6'::text, 'Tenways Software R&D'::text)
), mapped AS (
  SELECT
    w.project_key,
    w.work_item_type_key,
    w.work_item_id,
    p.project_name,
    type_mapping.display_value AS work_item_type,
    COALESCE(w.status_key, w.status) AS source_status_key,
    status_mapping.display_value AS mapped_status,
    w.status AS raw_status
  FROM meegle_workitem_syncs AS w
  JOIN project_names AS p ON p.project_key = w.project_key
  LEFT JOIN meegle_sync_mappings AS type_mapping
    ON type_mapping.project_key = w.project_key
    AND type_mapping.work_item_type_key = w.work_item_type_key
    AND type_mapping.mapping_kind = 'workitem_type'
    AND type_mapping.source_key = w.work_item_type_key
  LEFT JOIN meegle_sync_mappings AS status_mapping
    ON status_mapping.project_key = w.project_key
    AND status_mapping.work_item_type_key = w.work_item_type_key
    AND status_mapping.mapping_kind = 'status'
    AND status_mapping.source_key = COALESCE(w.status_key, w.status)
)
SELECT
  COUNT(*) AS candidate_rows,
  COUNT(*) FILTER (WHERE project_name IS NULL) AS missing_project_name,
  COUNT(*) FILTER (WHERE work_item_type IS NULL) AS missing_work_item_type,
  COUNT(*) FILTER (WHERE COALESCE(mapped_status, raw_status) IS NULL) AS missing_display_status,
  COUNT(*) FILTER (WHERE mapped_status IS NOT NULL) AS rows_with_verified_status_key,
  COUNT(*) FILTER (WHERE mapped_status IS NULL AND raw_status IS NOT NULL) AS display_only_status_rows
FROM mapped;

WITH project_names(project_key, project_name) AS (
  VALUES ('4c3fv6'::text, 'Tenways Software R&D'::text)
), mapped AS (
  SELECT
    w.project_key,
    w.work_item_type_key,
    w.work_item_id,
    p.project_name,
    type_mapping.display_value AS work_item_type,
    CASE
      WHEN status_mapping.source_key IS NULL THEN NULL
      ELSE COALESCE(w.status_key, w.status)
    END AS status_key,
    COALESCE(status_mapping.display_value, w.status) AS status
  FROM meegle_workitem_syncs AS w
  JOIN project_names AS p ON p.project_key = w.project_key
  JOIN meegle_sync_mappings AS type_mapping
    ON type_mapping.project_key = w.project_key
    AND type_mapping.work_item_type_key = w.work_item_type_key
    AND type_mapping.mapping_kind = 'workitem_type'
    AND type_mapping.source_key = w.work_item_type_key
  LEFT JOIN meegle_sync_mappings AS status_mapping
    ON status_mapping.project_key = w.project_key
    AND status_mapping.work_item_type_key = w.work_item_type_key
    AND status_mapping.mapping_kind = 'status'
    AND status_mapping.source_key = COALESCE(w.status_key, w.status)
), updated AS (
  UPDATE meegle_workitem_syncs AS w
  SET
    project_name = mapped.project_name,
    work_item_type = mapped.work_item_type,
    status_key = mapped.status_key,
    status = mapped.status,
    sub_stage_key = NULL,
    sub_stage = NULL,
    synced_at = NOW()::text
  FROM mapped
  WHERE w.project_key = mapped.project_key
    AND w.work_item_type_key = mapped.work_item_type_key
    AND w.work_item_id = mapped.work_item_id
  RETURNING 1
)
SELECT COUNT(*) AS updated_rows FROM updated;

ROLLBACK;
