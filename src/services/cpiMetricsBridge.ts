import { supabase } from '../lib/supabase';
import type { CPIDomainSnapshot } from '../hooks/useCPIData';

// ─── CPI metric definitions — one primary risk score per domain,
//     plus key sub-metrics extracted from the JSON blob ─────────────────────

export interface CPIMetricDef {
  key: string;           // stable identifier used as a tag to find/upsert
  domain: string;        // matches cpi_domain_snapshots.domain_id
  name: string;
  description: string;
  unit: string;
  category: string;
  target_value: number;
  upper_threshold: number;
  lower_threshold: number;
  // KPI thresholds
  kpi_critical: number;
  kpi_at_risk: number;
  kpi_on_track: number;
}

export const CPI_METRIC_DEFS: CPIMetricDef[] = [
  // ── Patient Flow ──────────────────────────────────────────────────────────
  {
    key: 'cpi_ed_risk_score',
    domain: 'ed',
    name: 'ED Patient Flow Risk Score',
    description: 'Composite CPI risk score for emergency department patient flow. Derived from wait times, throughput, and bed occupancy.',
    unit: 'score',
    category: 'Clinical - Patient Flow',
    target_value: 65,
    upper_threshold: 80,
    lower_threshold: 0,
    kpi_critical: 85,
    kpi_at_risk: 75,
    kpi_on_track: 65,
  },
  {
    key: 'cpi_ed_wait_time',
    domain: 'ed',
    name: 'ED Average Wait Time',
    description: 'Average minutes from patient arrival to first clinical contact in the emergency department.',
    unit: 'min',
    category: 'Clinical - Patient Flow',
    target_value: 30,
    upper_threshold: 45,
    lower_threshold: 0,
    kpi_critical: 60,
    kpi_at_risk: 45,
    kpi_on_track: 30,
  },
  {
    key: 'cpi_bed_occupancy',
    domain: 'ed',
    name: 'Bed Occupancy Rate',
    description: 'Percentage of licensed beds currently occupied across monitored units.',
    unit: '%',
    category: 'Clinical - Patient Flow',
    target_value: 82,
    upper_threshold: 92,
    lower_threshold: 0,
    kpi_critical: 95,
    kpi_at_risk: 90,
    kpi_on_track: 82,
  },

  // ── Laboratory ───────────────────────────────────────────────────────────
  {
    key: 'cpi_lab_risk_score',
    domain: 'lab',
    name: 'Laboratory Risk Score',
    description: 'Composite CPI risk score for laboratory operations. Derived from TAT, critical value notifications, and sample rejection rates.',
    unit: 'score',
    category: 'Clinical - Laboratory',
    target_value: 65,
    upper_threshold: 80,
    lower_threshold: 0,
    kpi_critical: 85,
    kpi_at_risk: 75,
    kpi_on_track: 65,
  },
  {
    key: 'cpi_lab_tat',
    domain: 'lab',
    name: 'Lab Turnaround Time',
    description: 'Average minutes from specimen receipt to resulted report for priority lab orders.',
    unit: 'min',
    category: 'Clinical - Laboratory',
    target_value: 45,
    upper_threshold: 60,
    lower_threshold: 0,
    kpi_critical: 90,
    kpi_at_risk: 65,
    kpi_on_track: 45,
  },
  {
    key: 'cpi_lab_critical_rate',
    domain: 'lab',
    name: 'Critical Value Notification Rate',
    description: 'Percentage of critical lab values communicated to ordering providers within required timeframe.',
    unit: '%',
    category: 'Clinical - Laboratory',
    target_value: 98,
    upper_threshold: 100,
    lower_threshold: 85,
    kpi_critical: 85,
    kpi_at_risk: 92,
    kpi_on_track: 98,
  },

  // ── Readmissions ─────────────────────────────────────────────────────────
  {
    key: 'cpi_readmission_risk_score',
    domain: 'readmission',
    name: 'Readmission Prevention Risk Score',
    description: 'Composite CPI risk score for 30-day readmission prevention. Derived from readmission rates, high-risk patient volumes, and care transition quality.',
    unit: 'score',
    category: 'Clinical - Readmissions',
    target_value: 65,
    upper_threshold: 80,
    lower_threshold: 0,
    kpi_critical: 85,
    kpi_at_risk: 75,
    kpi_on_track: 65,
  },
  {
    key: 'cpi_readmission_rate_30d',
    domain: 'readmission',
    name: '30-Day Readmission Rate',
    description: 'Percentage of discharged patients readmitted within 30 days of discharge.',
    unit: '%',
    category: 'Clinical - Readmissions',
    target_value: 8,
    upper_threshold: 15,
    lower_threshold: 0,
    kpi_critical: 18,
    kpi_at_risk: 12,
    kpi_on_track: 8,
  },

  // ── Staffing ─────────────────────────────────────────────────────────────
  {
    key: 'cpi_staffing_risk_score',
    domain: 'staffing',
    name: 'Staffing Optimization Risk Score',
    description: 'Composite CPI risk score for staffing and workforce optimization. Derived from utilization rates, overtime, and vacancy data.',
    unit: 'score',
    category: 'Clinical - Staffing',
    target_value: 65,
    upper_threshold: 80,
    lower_threshold: 0,
    kpi_critical: 85,
    kpi_at_risk: 75,
    kpi_on_track: 65,
  },
  {
    key: 'cpi_staff_utilization',
    domain: 'staffing',
    name: 'Staff Utilization Rate',
    description: 'Percentage of scheduled staff hours actively utilized for direct patient care.',
    unit: '%',
    category: 'Clinical - Staffing',
    target_value: 85,
    upper_threshold: 95,
    lower_threshold: 70,
    kpi_critical: 97,
    kpi_at_risk: 92,
    kpi_on_track: 85,
  },

  // ── Biomedical ───────────────────────────────────────────────────────────
  {
    key: 'cpi_biomedical_risk_score',
    domain: 'biomedical',
    name: 'Biomedical Systems Risk Score',
    description: 'Composite CPI risk score for biomedical equipment and device management. Derived from uptime, maintenance compliance, and downtime events.',
    unit: 'score',
    category: 'Clinical - Biomedical',
    target_value: 65,
    upper_threshold: 80,
    lower_threshold: 0,
    kpi_critical: 85,
    kpi_at_risk: 75,
    kpi_on_track: 65,
  },
  {
    key: 'cpi_equipment_uptime',
    domain: 'biomedical',
    name: 'Critical Equipment Uptime Rate',
    description: 'Percentage of scheduled operational time that critical medical devices are fully functional.',
    unit: '%',
    category: 'Clinical - Biomedical',
    target_value: 99,
    upper_threshold: 100,
    lower_threshold: 95,
    kpi_critical: 93,
    kpi_at_risk: 96,
    kpi_on_track: 99,
  },

  // ── Patient Experience ───────────────────────────────────────────────────
  {
    key: 'cpi_experience_risk_score',
    domain: 'care',
    name: 'Patient Experience Risk Score',
    description: 'Composite CPI risk score for patient experience and satisfaction. Derived from HCAHPS scores, complaint rates, and care quality indicators.',
    unit: 'score',
    category: 'Clinical - Patient Experience',
    target_value: 65,
    upper_threshold: 80,
    lower_threshold: 0,
    kpi_critical: 85,
    kpi_at_risk: 75,
    kpi_on_track: 65,
  },
  {
    key: 'cpi_patient_satisfaction',
    domain: 'care',
    name: 'Patient Satisfaction Score',
    description: 'Aggregate patient satisfaction score from HCAHPS surveys and real-time feedback collection.',
    unit: '%',
    category: 'Clinical - Patient Experience',
    target_value: 90,
    upper_threshold: 100,
    lower_threshold: 75,
    kpi_critical: 70,
    kpi_at_risk: 80,
    kpi_on_track: 90,
  },
];

// ─── Sub-metric extractors: pull numeric values out of the metrics JSON ──────
//     domain_id → (metricKey → CPIMetricDef key)

const SUB_METRIC_EXTRACTORS: Record<string, Record<string, string>> = {
  ed: {
    'Average Wait Time': 'cpi_ed_wait_time',
    'Avg Wait Time': 'cpi_ed_wait_time',
    'Wait Time': 'cpi_ed_wait_time',
    'Bed Occupancy': 'cpi_bed_occupancy',
    'Bed Occupancy Rate': 'cpi_bed_occupancy',
  },
  lab: {
    'Avg TAT': 'cpi_lab_tat',
    'TAT': 'cpi_lab_tat',
    'Turnaround Time': 'cpi_lab_tat',
    'Critical Value Rate': 'cpi_lab_critical_rate',
    'Critical Notification': 'cpi_lab_critical_rate',
  },
  readmission: {
    '30-Day Rate': 'cpi_readmission_rate_30d',
    'Readmission Rate': 'cpi_readmission_rate_30d',
  },
  staffing: {
    'Staff Utilization': 'cpi_staff_utilization',
    'Utilization': 'cpi_staff_utilization',
  },
  biomedical: {
    'Equipment Uptime': 'cpi_equipment_uptime',
    'Uptime': 'cpi_equipment_uptime',
  },
  care: {
    'Satisfaction': 'cpi_patient_satisfaction',
    'HCAHPS Score': 'cpi_patient_satisfaction',
    'Patient Satisfaction': 'cpi_patient_satisfaction',
  },
};

// Extract numeric value from a string like "47 min", "82%", "98.3"
function extractNumeric(val: string | boolean | undefined): number | null {
  if (typeof val === 'boolean') return null;
  if (typeof val !== 'string') return null;
  const match = val.match(/[\d.]+/);
  return match ? parseFloat(match[0]) : null;
}

// ─── Main bridge class ────────────────────────────────────────────────────────

export class CPIMetricsBridge {
  private orgId: string;
  // metric key → metric uuid in the metrics table
  private metricIdMap: Map<string, string> = new Map();

  constructor(orgId: string) {
    this.orgId = orgId;
  }

  // ── Step 1: Upsert all CPI metric definitions into `metrics` ──────────────
  async ensureMetricsRegistered(): Promise<void> {
    // Fetch existing CPI metrics for this org (tagged 'cpi-bridge')
    const { data: existing } = await supabase
      .from('metrics')
      .select('id, tags')
      .eq('organization_id', this.orgId)
      .contains('tags', ['cpi-bridge']);

    const existingKeys = new Set<string>();
    if (existing) {
      for (const row of existing) {
        const tags: string[] = row.tags ?? [];
        const keyTag = tags.find((t: string) => t.startsWith('cpi-key:'));
        if (keyTag) {
          existingKeys.add(keyTag.replace('cpi-key:', ''));
          this.metricIdMap.set(keyTag.replace('cpi-key:', ''), row.id);
        }
      }
    }

    // Insert any missing metric definitions
    const toInsert = CPI_METRIC_DEFS.filter(d => !existingKeys.has(d.key));

    if (toInsert.length > 0) {
      const rows = toInsert.map(def => ({
        organization_id: this.orgId,
        name: def.name,
        description: def.description,
        unit: def.unit,
        category: def.category,
        target_value: def.target_value,
        upper_threshold: def.upper_threshold,
        lower_threshold: def.lower_threshold,
        metric_type: 'clinical',
        aggregation: 'avg',
        time_grain: 'hourly',
        tags: ['cpi-bridge', `cpi-key:${def.key}`, `cpi-domain:${def.domain}`],
        current_value: null,
        actual_value: null,
      }));

      const { data: inserted, error } = await supabase
        .from('metrics')
        .insert(rows)
        .select('id, tags');

      if (!error && inserted) {
        for (const row of inserted) {
          const tags: string[] = row.tags ?? [];
          const keyTag = tags.find((t: string) => t.startsWith('cpi-key:'));
          if (keyTag) {
            this.metricIdMap.set(keyTag.replace('cpi-key:', ''), row.id);
          }
        }
      }
    }
  }

  // ── Step 2: Sync current domain risk scores + sub-metrics → metric_data ────
  async syncDomainSnapshots(domains: CPIDomainSnapshot[]): Promise<void> {
    if (this.metricIdMap.size === 0) await this.ensureMetricsRegistered();

    const dataPoints: Array<{
      metric_id: string;
      value: number;
      timestamp: string;
      source: string;
      quality_score: number;
      aggregation_level: string;
      organization_id: string;
    }> = [];

    const metricCurrentValues: Array<{ id: string; current_value: number; actual_value: number }> = [];

    for (const domain of domains) {
      const now = domain.updated_at ?? new Date().toISOString();

      // ── Risk score ──────────────────────────────────────────────────────
      const riskKey = `cpi_${domain.domain_id}_risk_score`;
      const riskMetricId = this.metricIdMap.get(riskKey);
      if (riskMetricId) {
        dataPoints.push({
          metric_id: riskMetricId,
          value: domain.risk_score,
          timestamp: now,
          source: 'cpi-bridge',
          quality_score: 95,
          aggregation_level: 'raw',
          organization_id: this.orgId,
        });
        metricCurrentValues.push({
          id: riskMetricId,
          current_value: domain.risk_score,
          actual_value: domain.risk_score,
        });
      }

      // ── Sub-metrics extracted from the JSON blob ────────────────────────
      const extractors = SUB_METRIC_EXTRACTORS[domain.domain_id] ?? {};
      const metricsJson = domain.metrics ?? {};

      for (const [jsonKey, defKey] of Object.entries(extractors)) {
        const rawVal = metricsJson[jsonKey];
        const numeric = extractNumeric(rawVal as string | boolean | undefined);
        if (numeric === null) continue;

        const metricId = this.metricIdMap.get(defKey);
        if (!metricId) continue;

        dataPoints.push({
          metric_id: metricId,
          value: numeric,
          timestamp: now,
          source: 'cpi-bridge',
          quality_score: 90,
          aggregation_level: 'raw',
          organization_id: this.orgId,
        });
        metricCurrentValues.push({
          id: metricId,
          current_value: numeric,
          actual_value: numeric,
        });
      }
    }

    // Write data points
    if (dataPoints.length > 0) {
      await supabase.from('metric_data').insert(dataPoints);
    }

    // Update current_value on each metric row
    for (const upd of metricCurrentValues) {
      await supabase
        .from('metrics')
        .update({ current_value: upd.current_value, actual_value: upd.actual_value })
        .eq('id', upd.id)
        .eq('organization_id', this.orgId);
    }
  }

  // ── Step 3: Upsert CPI KPIs (one per domain risk score metric) ────────────
  async ensureKPIsRegistered(userId: string): Promise<void> {
    if (this.metricIdMap.size === 0) await this.ensureMetricsRegistered();

    // Only create KPIs for the primary risk-score metrics (one per domain)
    const riskScoreDefs = CPI_METRIC_DEFS.filter(d => d.key.endsWith('_risk_score'));

    for (const def of riskScoreDefs) {
      const metricId = this.metricIdMap.get(def.key);
      if (!metricId) continue;

      // Check if KPI already exists for this metric
      const { data: existing } = await supabase
        .from('kpis')
        .select('id')
        .eq('organization_id', this.orgId)
        .eq('metric_id', metricId)
        .maybeSingle();

      if (existing) continue;

      await supabase.from('kpis').insert({
        organization_id: this.orgId,
        metric_id: metricId,
        name: def.name,
        description: def.description,
        owner_id: userId,
        target_value: def.target_value,
        threshold_critical: def.kpi_critical,
        threshold_at_risk: def.kpi_at_risk,
        threshold_on_track: def.kpi_on_track,
        unit: def.unit,
        status: 'on_track',
        last_value: null,
        last_updated: new Date().toISOString(),
      });
    }

    // Update KPI last_value and status from current domain data
    await this.refreshKPIStatuses();
  }

  // ── Step 4: Update KPI statuses based on current metric values ────────────
  async refreshKPIStatuses(): Promise<void> {
    if (this.metricIdMap.size === 0) return;

    const riskScoreDefs = CPI_METRIC_DEFS.filter(d => d.key.endsWith('_risk_score'));

    for (const def of riskScoreDefs) {
      const metricId = this.metricIdMap.get(def.key);
      if (!metricId) continue;

      const { data: metric } = await supabase
        .from('metrics')
        .select('current_value')
        .eq('id', metricId)
        .maybeSingle();

      if (!metric?.current_value) continue;

      const val = metric.current_value as number;
      let status = 'on_track';
      if (val >= def.kpi_critical) status = 'critical';
      else if (val >= def.kpi_at_risk) status = 'at_risk';

      await supabase
        .from('kpis')
        .update({
          last_value: val,
          status,
          last_updated: new Date().toISOString(),
        })
        .eq('organization_id', this.orgId)
        .eq('metric_id', metricId);
    }
  }

  // ── Step 5: Generate alerts for critical/elevated CPI domains ─────────────
  async syncAlerts(domains: CPIDomainSnapshot[]): Promise<void> {
    if (this.metricIdMap.size === 0) await this.ensureMetricsRegistered();

    const criticalOrElevated = domains.filter(
      d => d.status === 'critical' || d.status === 'elevated'
    );

    for (const domain of criticalOrElevated) {
      const riskKey = `cpi_${domain.domain_id}_risk_score`;
      const metricId = this.metricIdMap.get(riskKey);
      const def = CPI_METRIC_DEFS.find(d => d.key === riskKey);
      if (!def) continue;

      const severity = domain.status === 'critical' ? 'critical' : 'warning';

      // Check for recent duplicate alert (within last 2 hours)
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const { data: recent } = await supabase
        .from('alerts')
        .select('id')
        .eq('organization_id', this.orgId)
        .eq('category', 'clinical')
        .eq('severity', severity)
        .ilike('title', `%${def.name}%`)
        .gte('created_at', twoHoursAgo)
        .maybeSingle();

      if (recent) continue; // skip duplicate

      await supabase.from('alerts').insert({
        organization_id: this.orgId,
        metric_id: metricId ?? null,
        severity,
        title: `CPI Alert: ${def.name} ${domain.status === 'critical' ? 'Critical' : 'Elevated'}`,
        message: domain.predictive_insight ?? `${def.name} has reached ${domain.risk_score} — above threshold.`,
        description: `Risk score: ${domain.risk_score}/100. ${domain.predictive_insight ?? ''}`,
        alert_type: 'threshold',
        category: 'clinical',
        status: 'active',
        auto_generated: true,
        actions: [
          { label: 'View CPI Dashboard', url: '/dashboard/cpi' },
          { label: 'Acknowledge', action: 'acknowledge' },
        ],
      });
    }
  }

  // ── Public: run the full sync pipeline ───────────────────────────────────
  async runFullSync(domains: CPIDomainSnapshot[], userId: string): Promise<void> {
    try {
      await this.ensureMetricsRegistered();
      await Promise.all([
        this.syncDomainSnapshots(domains),
        this.ensureKPIsRegistered(userId),
      ]);
      await Promise.all([
        this.refreshKPIStatuses(),
        this.syncAlerts(domains),
      ]);
    } catch {
      // Bridge errors are non-fatal — CPI page still works without them
    }
  }
}

// ─── Singleton getter — resolves current user's org then runs sync ──────────

let bridgeInstance: CPIMetricsBridge | null = null;

export async function syncCPIToMetrics(domains: CPIDomainSnapshot[]): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: orgRow } = await supabase
      .from('user_organizations')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!orgRow?.organization_id) return;

    if (!bridgeInstance || bridgeInstance['orgId'] !== orgRow.organization_id) {
      bridgeInstance = new CPIMetricsBridge(orgRow.organization_id);
    }

    await bridgeInstance.runFullSync(domains, user.id);
  } catch {
    // Silent — bridge is enhancement, not core dependency
  }
}
