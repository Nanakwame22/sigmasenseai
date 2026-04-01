-- Phase 1 ETL hardening support objects
-- Run this in Supabase SQL Editor before enabling richer ingestion event logging.

CREATE TABLE IF NOT EXISTS etl_ingestion_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  pipeline_id UUID REFERENCES etl_pipelines(id) ON DELETE CASCADE,
  run_id UUID REFERENCES etl_pipeline_runs(id) ON DELETE CASCADE,
  source_id UUID REFERENCES data_sources(id) ON DELETE SET NULL,
  level TEXT NOT NULL CHECK (level IN ('info', 'warning', 'error')),
  stage TEXT NOT NULL CHECK (stage IN (
    'queued',
    'startup',
    'fetch',
    'transform',
    'load',
    'complete',
    'failure'
  )),
  message TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_etl_ingestion_events_pipeline_created
  ON etl_ingestion_events(pipeline_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_etl_ingestion_events_run_created
  ON etl_ingestion_events(run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_etl_ingestion_events_org_created
  ON etl_ingestion_events(organization_id, created_at DESC);
