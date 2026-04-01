# SigmaSense AI - Metric Intelligence Engine Implementation Guide

## 🎯 Overview

This guide explains how to deploy and use the **Centralized Metric Intelligence Engine** that transforms your DMAIC system from isolated modules into a **living Continuous Intelligence platform**.

---

## 📋 Architecture Summary

### Core Components

1. **Metrics Registry** - Single source of truth for all KPIs, CTQs, and metrics
2. **Metric Observations** - Time-series fact data storage
3. **Statistical Artifacts** - Versioned analysis outputs (baselines, regressions, projections)
4. **Control Rules** - Automated monitoring and alerting
5. **Workflow Executions** - Complete audit trail
6. **Phase Sync Status** - Cross-phase coordination tracker

### Key Principles

✅ **No Isolated Phases** - All DMAIC phases share the same metric objects  
✅ **Automatic Synchronization** - Changes propagate across phases instantly  
✅ **Backend Computation** - All calculations happen server-side, never in UI  
✅ **Full Versioning** - Every change is tracked and auditable  
✅ **Continuous Intelligence** - System operates as a living monitoring engine

---

## 🚀 Deployment Steps

### Step 1: Deploy Database Schema

1. Open your **Supabase Dashboard**
2. Navigate to **SQL Editor**
3. Copy the entire contents of `DATABASE_SCHEMA.sql`
4. Paste and execute
5. Verify all tables are created:
   - `metrics_registry`
   - `metric_observations`
   - `statistical_artifacts`
   - `control_rules`
   - `workflow_executions`
   - `metric_version_history`
   - `phase_sync_status`

### Step 2: Verify RLS Policies

Ensure Row Level Security is enabled on all tables:

```sql
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN (
  'metrics_registry', 
  'metric_observations', 
  'statistical_artifacts',
  'control_rules',
  'workflow_executions',
  'metric_version_history',
  'phase_sync_status'
);
```

All should show `rowsecurity = true`.

### Step 3: Test Database Functions

Verify automatic triggers are working:

```sql
-- Test metric version increment
UPDATE metrics_registry 
SET baseline_value = 100 
WHERE id = 'YOUR_METRIC_ID';

-- Check version history was created
SELECT * FROM metric_version_history 
WHERE metric_id = 'YOUR_METRIC_ID';
```

---

## 🔄 Workflow Automations

### Workflow 1: Dataset Ingestion → Metric Recalculation

**Trigger:** New dataset uploaded

**Actions:**
1. Validate dataset quality
2. Recalculate metric values using formulas
3. Insert new observations
4. Update baseline if needed
5. Emit "Metrics Updated" event

**Usage:**
```typescript
import { MetricIntelligenceEngine } from './services/metricIntelligenceEngine';

await MetricIntelligenceEngine.executeDatasetIngestionWorkflow(
  projectId,
  datasetId,
  [metricId1, metricId2],
  userId
);
```

### Workflow 2: Measure Phase Baseline Engine

**Trigger:** Metric observations updated

**Actions:**
1. Calculate mean, std dev, variance
2. Compute sigma level and DPMO
3. Store baseline artifact
4. Update metric registry
5. Sync to Define phase

**Usage:**
```typescript
await MetricIntelligenceEngine.executeMeasureBaselineWorkflow(
  projectId,
  metricId,
  userId
);
```

### Workflow 3: Analyze Phase Model Execution

**Trigger:** User clicks "Run Model"

**Actions:**
1. Pull metric observations
2. Execute regression/statistical model
3. Store coefficients and diagnostics
4. Update driver importance
5. Sync results to Improve phase

**Usage:**
```typescript
await MetricIntelligenceEngine.executeAnalyzeModelWorkflow(
  projectId,
  metricId,
  'regression',
  ['input_var_1', 'input_var_2'],
  userId
);
```

### Workflow 4: Improve Simulation Engine

**Trigger:** User adjusts intervention parameters

**Actions:**
1. Pull latest regression artifact
2. Compute predicted CTQ outcome
3. Calculate projected ROI
4. Store improvement projection
5. Flag readiness for Control

**Usage:**
```typescript
await MetricIntelligenceEngine.executeImproveSimulationWorkflow(
  projectId,
  metricId,
  { input_var_1: 50, input_var_2: 75 },
  userId
);
```

### Workflow 5: Continuous Control Monitoring

**Trigger:** Metric observations updated (automatic)

**Actions:**
1. Evaluate all active control rules
2. Create alerts if violations detected
3. Recalculate drift risk score
4. Store drift analysis artifact
5. Update Control dashboard

**Usage:**
```typescript
// This runs automatically, but can be triggered manually:
await MetricIntelligenceEngine.executeContinuousControlWorkflow(
  projectId,
  metricId
);
```

---

## 🔗 Cross-Phase Integration

### How Phases Stay Synchronized

Every metric has a `phase_sync_status` record that tracks when each phase last accessed it:

```typescript
{
  project_id: "uuid",
  metric_id: "uuid",
  define_synced_at: "2024-01-15T10:30:00Z",
  measure_synced_at: "2024-01-15T11:45:00Z",
  analyze_synced_at: "2024-01-15T14:20:00Z",
  improve_synced_at: "2024-01-15T16:00:00Z",
  control_synced_at: "2024-01-15T17:30:00Z",
  last_sync_trigger: "metric_update"
}
```

### Data Flow Example

1. **Define Phase** sets `target_value = 15` for "Patient Wait Time"
2. **Measure Phase** uploads dataset → Workflow 1 executes → `baseline_value = 45` calculated
3. **Analyze Phase** runs regression → Workflow 3 stores coefficients → syncs to Improve
4. **Improve Phase** simulates intervention → Workflow 4 predicts `outcome = 18` → flags Control readiness
5. **Control Phase** monitors live data → Workflow 5 detects drift → creates alert

All phases reference the **same metric object** in `metrics_registry`.

---

## 📊 Usage Examples

### Register a New Metric

```typescript
const metric = await MetricIntelligenceEngine.registerMetric({
  project_id: projectId,
  metric_code: 'CTQ_001',
  metric_name: 'Patient Wait Time',
  metric_type: 'CTQ',
  unit_of_measure: 'minutes',
  target_value: 15,
  calculation_formula: 'AVG(wait_time_minutes)'
});
```

### Update Metric with Version History

```typescript
await MetricIntelligenceEngine.updateMetric(
  metricId,
  { baseline_value: 42 },
  'Updated after Q1 data collection',
  userId
);
```

### Get Metric with Full Context

```typescript
const context = await MetricIntelligenceEngine.getMetricWithContext(metricId);

console.log(context.metric);        // Metric registry entry
console.log(context.observations);  // Last 100 observations
console.log(context.artifacts);     // Active statistical artifacts
console.log(context.rules);         // Active control rules
console.log(context.syncStatus);    // Phase sync timestamps
```

### View Workflow Execution History

```typescript
const executions = await MetricIntelligenceEngine.getWorkflowExecutions(projectId);

executions.forEach(exec => {
  console.log(`${exec.workflow_name}: ${exec.status} (${exec.execution_time_ms}ms)`);
});
```

### Check Metric Version History

```typescript
const history = await MetricIntelligenceEngine.getMetricVersionHistory(metricId);

history.forEach(version => {
  console.log(`Version ${version.version}:`, version.changed_fields);
});
```

---

## 🎨 UI Integration

### Define Phase

```typescript
// Pull baseline and target from metrics_registry
const { data: metrics } = await supabase
  .from('metrics_registry')
  .select('metric_name, baseline_value, target_value, sigma_level')
  .eq('project_id', projectId);
```

### Measure Phase

```typescript
// After uploading dataset, trigger workflow
await MetricIntelligenceEngine.executeDatasetIngestionWorkflow(
  projectId,
  datasetId,
  metricIds,
  userId
);

// Display updated baseline
const { data: metric } = await supabase
  .from('metrics_registry')
  .select('baseline_value, sigma_level, dpmo')
  .eq('id', metricId)
  .single();
```

### Analyze Phase

```typescript
// Run model and store results
await MetricIntelligenceEngine.executeAnalyzeModelWorkflow(
  projectId,
  metricId,
  'regression',
  inputVariables,
  userId
);

// Retrieve regression artifact
const { data: artifact } = await supabase
  .from('statistical_artifacts')
  .select('artifact_data')
  .eq('metric_id', metricId)
  .eq('artifact_type', 'regression')
  .eq('is_active', true)
  .single();

console.log(artifact.artifact_data.coefficients);
```

### Improve Phase

```typescript
// Simulate intervention
await MetricIntelligenceEngine.executeImproveSimulationWorkflow(
  projectId,
  metricId,
  interventionParams,
  userId
);

// Get projection
const { data: projection } = await supabase
  .from('statistical_artifacts')
  .select('artifact_data')
  .eq('metric_id', metricId)
  .eq('artifact_type', 'improvement_projection')
  .eq('is_active', true)
  .order('created_at', { ascending: false })
  .limit(1)
  .single();

console.log(projection.artifact_data.predicted_outcome);
```

### Control Phase

```typescript
// Monitor continuously (runs automatically)
// Display current status
const { data: metric } = await supabase
  .from('metrics_registry')
  .select('current_value, target_value, metadata')
  .eq('id', metricId)
  .single();

const driftRisk = metric.metadata.drift_risk_score;

// Get active alerts
const { data: alerts } = await supabase
  .from('alerts')
  .select('*')
  .eq('metric_id', metricId)
  .eq('status', 'active');
```

---

## 🔐 Security & Governance

### Row Level Security

All tables enforce organization-based access:
- Users can only see metrics in their organization's projects
- System workflows can write to all tables
- Version history is automatically logged

### Audit Trail

Every action is logged in `workflow_executions`:
```typescript
const auditLog = await supabase
  .from('workflow_executions')
  .select('*')
  .eq('project_id', projectId)
  .order('started_at', { ascending: false });
```

### Version Control

Metrics maintain full version history:
```typescript
const versions = await supabase
  .from('metric_version_history')
  .select('*')
  .eq('metric_id', metricId)
  .order('version', { ascending: false });
```

---

## 🧪 Testing

### Test Workflow Execution

```typescript
// Test dataset ingestion
const result = await MetricIntelligenceEngine.executeDatasetIngestionWorkflow(
  'test-project-id',
  'test-dataset-id',
  ['test-metric-id'],
  'test-user-id'
);

console.assert(result.status === 'completed');
```

### Test Cross-Phase Sync

```typescript
// Update metric in Measure
await MetricIntelligenceEngine.updateMetric(
  metricId,
  { baseline_value: 50 }
);

// Verify Define sees the update
const { data: syncStatus } = await supabase
  .from('phase_sync_status')
  .select('measure_synced_at, last_sync_trigger')
  .eq('metric_id', metricId)
  .single();

console.assert(syncStatus.last_sync_trigger === 'metric_update');
```

---

## 📈 Performance Optimization

### Indexing Strategy

All critical queries are indexed:
- `metrics_registry`: project_id, metric_code, metric_type
- `metric_observations`: metric_id, project_id, observation_date
- `statistical_artifacts`: project_id, metric_id, artifact_type, phase
- `control_rules`: project_id, metric_id, is_active

### Caching Recommendations

Cache frequently accessed data:
```typescript
// Cache metric registry for 5 minutes
const cachedMetrics = await cache.get(`metrics:${projectId}`) || 
  await MetricIntelligenceEngine.getProjectMetrics(projectId);
```

---

## 🚨 Troubleshooting

### Workflow Fails

Check execution log:
```typescript
const { data: execution } = await supabase
  .from('workflow_executions')
  .select('error_message, input_data')
  .eq('id', workflowId)
  .single();

console.log(execution.error_message);
```

### Metrics Not Syncing

Verify phase sync status:
```typescript
const { data: syncStatus } = await supabase
  .from('phase_sync_status')
  .select('*')
  .eq('metric_id', metricId)
  .single();

console.log('Last sync:', syncStatus.last_sync_trigger);
```

### RLS Policy Issues

Test policy:
```sql
SELECT * FROM metrics_registry WHERE project_id = 'YOUR_PROJECT_ID';
-- If empty, check user's organization_id matches project's organization_id
```

---

## 🎓 Best Practices

1. **Always use workflows** - Never update metrics directly in UI
2. **Version everything** - Use `updateMetric()` with change reasons
3. **Monitor execution times** - Track `execution_time_ms` in workflows
4. **Set up alerts** - Configure control rules for critical metrics
5. **Regular audits** - Review `workflow_executions` and `metric_version_history`
6. **Test in staging** - Validate workflows before production deployment

---

## 📚 Additional Resources

- **Database Schema**: `DATABASE_SCHEMA.sql`
- **TypeScript Service**: `src/services/metricIntelligenceEngine.ts`
- **Supabase Docs**: https://supabase.com/docs

---

## ✅ System Verification Checklist

- [ ] All 7 tables created in Supabase
- [ ] RLS policies enabled and tested
- [ ] Database triggers working (version increment, history logging)
- [ ] Workflow 1 (Dataset Ingestion) tested
- [ ] Workflow 2 (Measure Baseline) tested
- [ ] Workflow 3 (Analyze Model) tested
- [ ] Workflow 4 (Improve Simulation) tested
- [ ] Workflow 5 (Control Monitoring) tested
- [ ] Cross-phase synchronization verified
- [ ] Audit trail logging confirmed
- [ ] UI components integrated with backend

---

**Your DMAIC system is now a Continuous Intelligence Engine! 🚀**
