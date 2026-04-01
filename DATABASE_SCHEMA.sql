-- ============================================================================
-- SIGMASENSE AI - CENTRALIZED METRIC INTELLIGENCE ENGINE
-- Database Schema for Cross-Phase DMAIC Integration
-- ============================================================================

-- This schema must be executed in your Supabase SQL Editor
-- It creates the foundation for a unified, metric-driven DMAIC system

-- ============================================================================
-- 1. CORE METRIC INTELLIGENCE REGISTRY
-- ============================================================================

CREATE TABLE IF NOT EXISTS metrics_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES dmaic_projects(id) ON DELETE CASCADE,
  metric_code TEXT NOT NULL UNIQUE, -- e.g., "CTQ_001", "KPI_CYCLE_TIME"
  metric_name TEXT NOT NULL,
  metric_type TEXT NOT NULL CHECK (metric_type IN ('CTQ', 'KPI', 'Input', 'Output', 'Process')),
  unit_of_measure TEXT,
  calculation_formula TEXT, -- SQL-like or JSON formula
  target_value NUMERIC,
  baseline_value NUMERIC,
  current_value NUMERIC,
  sigma_level NUMERIC,
  dpmo NUMERIC,
  data_source_id UUID REFERENCES data_sources(id),
  owner_id UUID REFERENCES user_profiles(id),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deprecated')),
  version INTEGER DEFAULT 1,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_metrics_registry_project ON metrics_registry(project_id);
CREATE INDEX idx_metrics_registry_code ON metrics_registry(metric_code);
CREATE INDEX idx_metrics_registry_type ON metrics_registry(metric_type);

-- ============================================================================
-- 2. TIME-SERIES METRIC OBSERVATIONS (FACT TABLE)
-- ============================================================================

CREATE TABLE IF NOT EXISTS metric_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_id UUID REFERENCES metrics_registry(id) ON DELETE CASCADE,
  project_id UUID REFERENCES dmaic_projects(id) ON DELETE CASCADE,
  observation_date TIMESTAMPTZ NOT NULL,
  observed_value NUMERIC NOT NULL,
  sample_size INTEGER,
  subgroup_id TEXT, -- For control charts
  data_source_id UUID REFERENCES data_sources(id),
  dataset_id UUID REFERENCES uploaded_files(id),
  quality_score NUMERIC, -- 0-100
  is_outlier BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_metric_obs_metric ON metric_observations(metric_id);
CREATE INDEX idx_metric_obs_project ON metric_observations(project_id);
CREATE INDEX idx_metric_obs_date ON metric_observations(observation_date);
CREATE INDEX idx_metric_obs_dataset ON metric_observations(dataset_id);

-- ============================================================================
-- 3. STATISTICAL ARTIFACTS (VERSIONED ANALYSIS OUTPUTS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS statistical_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES dmaic_projects(id) ON DELETE CASCADE,
  metric_id UUID REFERENCES metrics_registry(id) ON DELETE CASCADE,
  artifact_type TEXT NOT NULL CHECK (artifact_type IN (
    'baseline', 'regression', 'hypothesis_test', 'control_chart',
    'improvement_projection', 'drift_analysis', 'root_cause', 'simulation'
  )),
  phase TEXT NOT NULL CHECK (phase IN ('define', 'measure', 'analyze', 'improve', 'control')),
  version INTEGER DEFAULT 1,
  artifact_data JSONB NOT NULL, -- Stores coefficients, p-values, diagnostics, etc.
  confidence_score NUMERIC, -- 0-100
  created_by UUID REFERENCES user_profiles(id),
  is_active BOOLEAN DEFAULT TRUE,
  parent_artifact_id UUID REFERENCES statistical_artifacts(id), -- For versioning chain
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_artifacts_project ON statistical_artifacts(project_id);
CREATE INDEX idx_artifacts_metric ON statistical_artifacts(metric_id);
CREATE INDEX idx_artifacts_type ON statistical_artifacts(artifact_type);
CREATE INDEX idx_artifacts_phase ON statistical_artifacts(phase);
CREATE INDEX idx_artifacts_active ON statistical_artifacts(is_active);

-- ============================================================================
-- 4. CONTROL RULES ENGINE
-- ============================================================================

CREATE TABLE IF NOT EXISTS control_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES dmaic_projects(id) ON DELETE CASCADE,
  metric_id UUID REFERENCES metrics_registry(id) ON DELETE CASCADE,
  rule_name TEXT NOT NULL,
  rule_type TEXT NOT NULL CHECK (rule_type IN (
    'threshold', 'trend', 'western_electric', 'drift', 'variance_shift'
  )),
  condition_logic JSONB NOT NULL, -- e.g., {"operator": ">", "threshold": 100}
  severity TEXT DEFAULT 'moderate' CHECK (severity IN ('low', 'moderate', 'critical')),
  escalation_threshold INTEGER DEFAULT 1, -- Number of violations before alert
  notification_enabled BOOLEAN DEFAULT TRUE,
  owner_id UUID REFERENCES user_profiles(id),
  is_active BOOLEAN DEFAULT TRUE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_control_rules_project ON control_rules(project_id);
CREATE INDEX idx_control_rules_metric ON control_rules(metric_id);
CREATE INDEX idx_control_rules_active ON control_rules(is_active);

-- ============================================================================
-- 5. WORKFLOW EXECUTION LOG (AUDIT TRAIL)
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflow_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_name TEXT NOT NULL,
  trigger_type TEXT NOT NULL, -- 'dataset_upload', 'metric_update', 'manual', 'scheduled'
  project_id UUID REFERENCES dmaic_projects(id) ON DELETE CASCADE,
  metric_id UUID REFERENCES metrics_registry(id),
  input_data JSONB,
  output_data JSONB,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  error_message TEXT,
  execution_time_ms INTEGER,
  triggered_by UUID REFERENCES user_profiles(id),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_workflow_exec_project ON workflow_executions(project_id);
CREATE INDEX idx_workflow_exec_status ON workflow_executions(status);
CREATE INDEX idx_workflow_exec_started ON workflow_executions(started_at);

-- ============================================================================
-- 6. METRIC VERSION HISTORY (GOVERNANCE)
-- ============================================================================

CREATE TABLE IF NOT EXISTS metric_version_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_id UUID REFERENCES metrics_registry(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  changed_fields JSONB NOT NULL, -- {"baseline_value": {"old": 85, "new": 92}}
  change_reason TEXT,
  changed_by UUID REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_metric_history_metric ON metric_version_history(metric_id);
CREATE INDEX idx_metric_history_version ON metric_version_history(version);

-- ============================================================================
-- 7. PHASE SYNCHRONIZATION STATUS
-- ============================================================================

CREATE TABLE IF NOT EXISTS phase_sync_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES dmaic_projects(id) ON DELETE CASCADE,
  metric_id UUID REFERENCES metrics_registry(id) ON DELETE CASCADE,
  define_synced_at TIMESTAMPTZ,
  measure_synced_at TIMESTAMPTZ,
  analyze_synced_at TIMESTAMPTZ,
  improve_synced_at TIMESTAMPTZ,
  control_synced_at TIMESTAMPTZ,
  last_sync_trigger TEXT,
  sync_metadata JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_phase_sync_project ON phase_sync_status(project_id);
CREATE INDEX idx_phase_sync_metric ON phase_sync_status(metric_id);

-- ============================================================================
-- 8. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE metrics_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE metric_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE statistical_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE control_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE metric_version_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase_sync_status ENABLE ROW LEVEL SECURITY;

-- Metrics Registry Policies
CREATE POLICY "Users can view metrics in their organization projects"
  ON metrics_registry FOR SELECT
  USING (
    project_id IN (
      SELECT dp.id FROM dmaic_projects dp
      JOIN user_profiles up ON up.organization_id = dp.organization_id
      WHERE up.id = auth.uid()
    )
  );

CREATE POLICY "Users can insert metrics in their organization projects"
  ON metrics_registry FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT dp.id FROM dmaic_projects dp
      JOIN user_profiles up ON up.organization_id = dp.organization_id
      WHERE up.id = auth.uid()
    )
  );

CREATE POLICY "Users can update metrics in their organization projects"
  ON metrics_registry FOR UPDATE
  USING (
    project_id IN (
      SELECT dp.id FROM dmaic_projects dp
      JOIN user_profiles up ON up.organization_id = dp.organization_id
      WHERE up.id = auth.uid()
    )
  );

-- Metric Observations Policies
CREATE POLICY "Users can view observations in their organization projects"
  ON metric_observations FOR SELECT
  USING (
    project_id IN (
      SELECT dp.id FROM dmaic_projects dp
      JOIN user_profiles up ON up.organization_id = dp.organization_id
      WHERE up.id = auth.uid()
    )
  );

CREATE POLICY "Users can insert observations in their organization projects"
  ON metric_observations FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT dp.id FROM dmaic_projects dp
      JOIN user_profiles up ON up.organization_id = dp.organization_id
      WHERE up.id = auth.uid()
    )
  );

-- Statistical Artifacts Policies
CREATE POLICY "Users can view artifacts in their organization projects"
  ON statistical_artifacts FOR SELECT
  USING (
    project_id IN (
      SELECT dp.id FROM dmaic_projects dp
      JOIN user_profiles up ON up.organization_id = dp.organization_id
      WHERE up.id = auth.uid()
    )
  );

CREATE POLICY "Users can insert artifacts in their organization projects"
  ON statistical_artifacts FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT dp.id FROM dmaic_projects dp
      JOIN user_profiles up ON up.organization_id = dp.organization_id
      WHERE up.id = auth.uid()
    )
  );

CREATE POLICY "Users can update artifacts in their organization projects"
  ON statistical_artifacts FOR UPDATE
  USING (
    project_id IN (
      SELECT dp.id FROM dmaic_projects dp
      JOIN user_profiles up ON up.organization_id = dp.organization_id
      WHERE up.id = auth.uid()
    )
  );

-- Control Rules Policies
CREATE POLICY "Users can view control rules in their organization projects"
  ON control_rules FOR SELECT
  USING (
    project_id IN (
      SELECT dp.id FROM dmaic_projects dp
      JOIN user_profiles up ON up.organization_id = dp.organization_id
      WHERE up.id = auth.uid()
    )
  );

CREATE POLICY "Users can manage control rules in their organization projects"
  ON control_rules FOR ALL
  USING (
    project_id IN (
      SELECT dp.id FROM dmaic_projects dp
      JOIN user_profiles up ON up.organization_id = dp.organization_id
      WHERE up.id = auth.uid()
    )
  );

-- Workflow Executions Policies
CREATE POLICY "Users can view workflow executions in their organization projects"
  ON workflow_executions FOR SELECT
  USING (
    project_id IN (
      SELECT dp.id FROM dmaic_projects dp
      JOIN user_profiles up ON up.organization_id = dp.organization_id
      WHERE up.id = auth.uid()
    )
  );

CREATE POLICY "System can insert workflow executions"
  ON workflow_executions FOR INSERT
  WITH CHECK (true);

-- Metric Version History Policies
CREATE POLICY "Users can view metric history in their organization"
  ON metric_version_history FOR SELECT
  USING (
    metric_id IN (
      SELECT mr.id FROM metrics_registry mr
      JOIN dmaic_projects dp ON dp.id = mr.project_id
      JOIN user_profiles up ON up.organization_id = dp.organization_id
      WHERE up.id = auth.uid()
    )
  );

CREATE POLICY "System can insert metric history"
  ON metric_version_history FOR INSERT
  WITH CHECK (true);

-- Phase Sync Status Policies
CREATE POLICY "Users can view phase sync status in their organization projects"
  ON phase_sync_status FOR SELECT
  USING (
    project_id IN (
      SELECT dp.id FROM dmaic_projects dp
      JOIN user_profiles up ON up.organization_id = dp.organization_id
      WHERE up.id = auth.uid()
    )
  );

CREATE POLICY "System can manage phase sync status"
  ON phase_sync_status FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 9. DATABASE FUNCTIONS FOR AUTOMATION
-- ============================================================================

-- Function to automatically update metric version on change
CREATE OR REPLACE FUNCTION increment_metric_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version = OLD.version + 1;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_increment_metric_version
  BEFORE UPDATE ON metrics_registry
  FOR EACH ROW
  EXECUTE FUNCTION increment_metric_version();

-- Function to log metric changes to version history
CREATE OR REPLACE FUNCTION log_metric_version_history()
RETURNS TRIGGER AS $$
DECLARE
  changed_fields JSONB := '{}'::JSONB;
BEGIN
  -- Compare old and new values
  IF OLD.baseline_value IS DISTINCT FROM NEW.baseline_value THEN
    changed_fields = changed_fields || jsonb_build_object(
      'baseline_value', jsonb_build_object('old', OLD.baseline_value, 'new', NEW.baseline_value)
    );
  END IF;
  
  IF OLD.target_value IS DISTINCT FROM NEW.target_value THEN
    changed_fields = changed_fields || jsonb_build_object(
      'target_value', jsonb_build_object('old', OLD.target_value, 'new', NEW.target_value)
    );
  END IF;
  
  IF OLD.current_value IS DISTINCT FROM NEW.current_value THEN
    changed_fields = changed_fields || jsonb_build_object(
      'current_value', jsonb_build_object('old', OLD.current_value, 'new', NEW.current_value)
    );
  END IF;

  -- Only insert if there are actual changes
  IF changed_fields != '{}'::JSONB THEN
    INSERT INTO metric_version_history (metric_id, version, changed_fields)
    VALUES (NEW.id, NEW.version, changed_fields);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_log_metric_version_history
  AFTER UPDATE ON metrics_registry
  FOR EACH ROW
  EXECUTE FUNCTION log_metric_version_history();

-- ============================================================================
-- 10. SAMPLE DATA FOR TESTING (OPTIONAL)
-- ============================================================================

-- Insert sample metric (uncomment to use)
/*
INSERT INTO metrics_registry (
  project_id, 
  metric_code, 
  metric_name, 
  metric_type, 
  unit_of_measure,
  target_value,
  baseline_value
) VALUES (
  'YOUR_PROJECT_ID_HERE',
  'CTQ_001',
  'Patient Wait Time',
  'CTQ',
  'minutes',
  15,
  45
);
*/

-- ============================================================================
-- DEPLOYMENT INSTRUCTIONS
-- ============================================================================

/*
1. Copy this entire SQL script
2. Go to your Supabase Dashboard → SQL Editor
3. Paste and execute this script
4. Verify all tables are created successfully
5. The TypeScript service (metricIntelligenceEngine.ts) will now work with this schema
6. All DMAIC phases will automatically sync through the centralized metric registry

This schema enables:
✅ Unified metric registry across all phases
✅ Time-series fact data storage
✅ Versioned statistical artifacts
✅ Automated control monitoring
✅ Complete audit trail
✅ Cross-phase synchronization
✅ Enterprise governance
*/
