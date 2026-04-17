-- AI evaluation registry
-- Durable audit storage for model, recommendation, forecast, and decision evaluation events.

CREATE TABLE IF NOT EXISTS ai_evaluation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,
  subject_type TEXT NOT NULL CHECK (subject_type IN (
    'recommendation',
    'forecast',
    'cpi_model',
    'aim_alert',
    'decision'
  )),
  subject_id TEXT NOT NULL,
  subject_key TEXT NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN (
    'generated',
    'started',
    'outcome_positive',
    'outcome_negative',
    'backtest',
    'drift_check'
  )),
  promotion_stage TEXT NOT NULL CHECK (promotion_stage IN (
    'shadow',
    'advisory',
    'supervised',
    'autonomous',
    'blocked'
  )),
  autonomy_level TEXT NOT NULL CHECK (autonomy_level IN (
    'Autonomous',
    'Supervised',
    'Advisory',
    'Blocked'
  )),
  evaluation_score INTEGER NOT NULL CHECK (evaluation_score >= 0 AND evaluation_score <= 100),
  confidence_score NUMERIC NOT NULL DEFAULT 0,
  evidence_coverage INTEGER NOT NULL DEFAULT 0 CHECK (evidence_coverage >= 0 AND evidence_coverage <= 100),
  source_label TEXT NOT NULL,
  freshness_state TEXT NOT NULL CHECK (freshness_state IN ('live', 'delayed', 'stale')),
  outcome TEXT NOT NULL CHECK (outcome IN ('pending', 'positive', 'negative', 'inconclusive')),
  drift_state TEXT NOT NULL CHECK (drift_state IN ('stable', 'watch', 'drift')),
  can_auto_act BOOLEAN NOT NULL DEFAULT FALSE,
  can_create_work BOOLEAN NOT NULL DEFAULT FALSE,
  can_recommend BOOLEAN NOT NULL DEFAULT FALSE,
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  required_controls JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ai_evaluation_events
  ALTER COLUMN subject_id TYPE TEXT USING subject_id::text;

ALTER TABLE ai_evaluation_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view organization AI evaluation events" ON ai_evaluation_events;
CREATE POLICY "Users can view organization AI evaluation events"
  ON ai_evaluation_events
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id
      FROM user_organizations
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can create organization AI evaluation events" ON ai_evaluation_events;
CREATE POLICY "Users can create organization AI evaluation events"
  ON ai_evaluation_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id
      FROM user_organizations
      WHERE user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_ai_evaluation_events_org_evaluated
  ON ai_evaluation_events(organization_id, evaluated_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_evaluation_events_subject_evaluated
  ON ai_evaluation_events(subject_type, subject_id, evaluated_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_evaluation_events_stage
  ON ai_evaluation_events(promotion_stage, drift_state, evaluated_at DESC);
