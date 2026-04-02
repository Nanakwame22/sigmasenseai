import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';

// ── Types ──────────────────────────────────────────────────────────────────

interface Workflow {
  id: string;
  name: string;
  icon: string;
  category: string;
  trigger: string;
  actions: string[];
  defaultStatus: 'active' | 'paused';
  staticRunsToday: number;
  staticLastRun: string;
  timeSaved: string;
  isLive?: boolean;
  feedCategory?: string; // maps to cpi_feed.category
  edgeFunctionUrl?: string;
  edgeFunctionDescription?: string;
}

type ResultType = 'alert_fired' | 'no_trigger' | 'already_exists' | 'disabled' | 'error';

interface WorkflowResult {
  type: ResultType;
  message: string;
}

interface WorkflowState {
  enabled: boolean;
  runsToday: number;
  lastRun: string;
  loading: boolean;
  acting: boolean;
  result: WorkflowResult | null;
}

interface FeedStats {
  lastTriggered: string | null; // ISO timestamp of most recent feed alert
  unackedCount: number;
}

interface MetricRecord {
  id: string;
  name: string;
  unit: string | null;
  current_value: number | null;
  target_value: number | null;
}

interface MetricPointRecord {
  metric_id: string;
  value: number;
  timestamp: string;
}

interface WorkflowSignal {
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  lastSeen: string | null;
  suggestedAction: string;
}

// ── Static workflow definitions ───────────────────────────────────────────

const SUPABASE_FN_BASE = 'https://znhfwyawhjdsxnluvbfc.supabase.co/functions/v1';

const workflows: Workflow[] = [
  {
    id: 'discharge-coord',
    name: 'Discharge Coordination Pipeline',
    icon: 'ri-door-open-line',
    category: 'Patient Flow',
    trigger: 'Patient marked Ready-to-Go (RTG) in EHR',
    actions: [
      'Notify pharmacy to prioritize discharge medications',
      'Alert transport team with estimated ready time',
      'Ping family contact if designated driver needed',
      'Flag bed for housekeeping once discharge confirmed',
    ],
    defaultStatus: 'active',
    staticRunsToday: 41,
    staticLastRun: '4 min ago',
    timeSaved: '~2.1h daily',
  },
  {
    id: 'ed-surge',
    name: 'ED Surge Detection & Escalation',
    icon: 'ri-heart-pulse-line',
    category: 'Emergency',
    trigger: 'ED occupancy or wait-time threshold breach detected',
    actions: [
      'Fire surge alert into Command Center feed for immediate review',
      'Notify ED charge nurse and bed management supervisor',
      'Trigger fast-track diversion protocol assessment',
      'Re-evaluate hourly until census normalises',
    ],
    defaultStatus: 'active',
    staticRunsToday: 12,
    staticLastRun: '8 min ago',
    timeSaved: '~1.5h daily',
    isLive: true,
    feedCategory: 'ed',
    edgeFunctionUrl: `${SUPABASE_FN_BASE}/cpi-ed-surge-check`,
    edgeFunctionDescription:
      'Evaluates ED domain risk score and occupancy metrics against surge thresholds. When a breach is detected it inserts a critical-severity ED alert into the Command Center feed for immediate clinician action.',
  },
  {
    id: 'lab-escalation',
    name: 'Critical Lab Auto-Escalation',
    icon: 'ri-test-tube-line',
    category: 'Diagnostics',
    trigger: 'Critical lab result unacknowledged for 30+ minutes',
    actions: [
      'Escalate to covering physician via secure message',
      'CC charge nurse on affected unit',
      'Log escalation event to audit trail',
      'Follow up again at 45-min mark if still unread',
    ],
    defaultStatus: 'active',
    staticRunsToday: 7,
    staticLastRun: '19 min ago',
    timeSaved: '~45m daily',
    isLive: true,
    feedCategory: 'lab',
    edgeFunctionUrl: `${SUPABASE_FN_BASE}/cpi-lab-escalation-check`,
    edgeFunctionDescription:
      'Checks cpi_feed for unacknowledged critical lab results older than 30 minutes and the lab domain risk score. Fires a physician escalation alert into the Command Center feed.',
  },
  {
    id: 'bed-cleaning',
    name: 'Bed Cleaning Trigger Automation',
    icon: 'ri-hotel-bed-line',
    category: 'Bed Management',
    trigger: 'Patient discharge or transfer confirmed in ADT feed',
    actions: [
      'Alert housekeeping team with bed location and priority',
      'Assign cleaning crew based on current workload',
      'Update bed status to Dirty in bed board',
      'Trigger cleaning confirmation request after 25 min',
    ],
    defaultStatus: 'active',
    staticRunsToday: 38,
    staticLastRun: '11 min ago',
    timeSaved: '~1.8h daily',
  },
  {
    id: 'patient-transfer',
    name: 'Patient Transfer Flow',
    icon: 'ri-exchange-line',
    category: 'Patient Flow',
    trigger: 'Transfer order placed + receiving unit bed confirmed',
    actions: [
      'Notify transport with patient weight and mobility status',
      'Send care summary bundle to receiving nurse',
      'Update bed availability on both sending and receiving units',
      'Alert physician if transfer delayed beyond 60 min',
    ],
    defaultStatus: 'active',
    staticRunsToday: 22,
    staticLastRun: '7 min ago',
    timeSaved: '~1.2h daily',
  },
  {
    id: 'staffing-realloc',
    name: 'Staffing Reallocation Automation',
    icon: 'ri-user-2-line',
    category: 'Workforce',
    trigger: 'RN-to-patient ratio falls below 1:5 threshold in any unit',
    actions: [
      'Identify float pool nurses available within 30 min',
      'Send reallocation request to charge nurse',
      'Notify staffing office for immediate coverage',
      'Escalate to house supervisor if unresolved in 20 min',
    ],
    defaultStatus: 'active',
    staticRunsToday: 3,
    staticLastRun: '1.2h ago',
    timeSaved: '~35m daily',
  },
  {
    id: 'readmission-nav',
    name: 'Readmission Prevention Trigger',
    icon: 'ri-refresh-alert-line',
    category: 'Post-Discharge',
    trigger: 'Readmission risk score exceeds 75th percentile at discharge',
    actions: [
      'Assign care transition navigator to patient',
      'Schedule 48-hour post-discharge follow-up call',
      'Share medication reconciliation checklist with patient',
      'Flag for 7-day and 30-day outcome tracking',
    ],
    defaultStatus: 'paused',
    staticRunsToday: 0,
    staticLastRun: '2 days ago',
    timeSaved: '~20m/patient',
    isLive: true,
    feedCategory: 'readmission',
    edgeFunctionUrl: `${SUPABASE_FN_BASE}/cpi-readmission-check`,
    edgeFunctionDescription:
      'Checks the readmission domain risk score against the 55-point threshold. When high-risk patients are identified, inserts a care transition navigator alert directly into the Command Center feed.',
  },
];

// Reverse-lookup: cpi_feed.category → workflow id (built once after workflows array)
const FEED_CATEGORY_TO_WORKFLOW_ID: Record<string, string> = Object.fromEntries(
  workflows
    .filter(w => w.feedCategory)
    .map(w => [w.feedCategory as string, w.id])
);

// ── Helpers ────────────────────────────────────────────────────────────────

const statusCfg = {
  active: { dot: 'bg-emerald-500 animate-pulse', badge: 'bg-emerald-100 text-emerald-700', label: 'Active' },
  paused: { dot: 'bg-slate-300', badge: 'bg-slate-100 text-slate-600', label: 'Paused' },
};

const resultStyles: Record<ResultType, string> = {
  alert_fired:    'bg-rose-50 border-rose-100 text-rose-700',
  no_trigger:     'bg-emerald-50 border-emerald-100 text-emerald-700',
  already_exists: 'bg-amber-50 border-amber-100 text-amber-700',
  disabled:       'bg-slate-50 border-slate-100 text-slate-600',
  error:          'bg-rose-50 border-rose-100 text-rose-700',
};

const resultIcons: Record<ResultType, string> = {
  alert_fired:    'ri-flashlight-line',
  no_trigger:     'ri-shield-check-line',
  already_exists: 'ri-information-line',
  disabled:       'ri-pause-circle-line',
  error:          'ri-error-warning-line',
};

function formatLastRun(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diff < 2) return 'Just now';
  if (diff < 60) return `${diff} min ago`;
  const h = Math.floor(diff / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function classifyResult(data: Record<string, unknown>, action: 'enable' | 'disable' | 'check'): WorkflowResult {
  if (action === 'disable') return { type: 'disabled', message: String(data.message ?? 'Workflow paused.') };
  if (data.alert_fired)     return { type: 'alert_fired', message: String(data.message) };
  const msg = String(data.message ?? '');
  if (msg.includes('already') || msg.includes('already exists')) return { type: 'already_exists', message: msg };
  return { type: 'no_trigger', message: msg };
}

function defaultState(): WorkflowState {
  return { enabled: false, runsToday: 0, lastRun: '—', loading: true, acting: false, result: null };
}

function normalizeName(value: string) {
  return value.trim().toLowerCase();
}

function formatMetricValue(value: number | null | undefined, unit: string | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const normalizedUnit = (unit || '').toLowerCase();
  if (normalizedUnit === 'minutes' || normalizedUnit === 'min') return `${value.toFixed(1)} minutes`;
  if (normalizedUnit === 'hours' || normalizedUnit === 'hour' || normalizedUnit === 'h') return `${value.toFixed(1)} hours`;
  if (normalizedUnit === 'beds' || normalizedUnit === 'count') return `${Math.round(value)}`;
  if (normalizedUnit === 'ratio') return `${value.toFixed(1)}`;
  if (normalizedUnit === 'probability') return `${Math.round(value * 100)}%`;
  return `${value.toFixed(1)}`;
}

function buildWorkflowSignals(metrics: MetricRecord[], metricPoints: MetricPointRecord[]) {
  const metricsByName = new Map(metrics.map((metric) => [normalizeName(metric.name), metric]));
  const pointMap = new Map<string, MetricPointRecord[]>();
  metricPoints.forEach((point) => {
    const existing = pointMap.get(point.metric_id) || [];
    existing.push(point);
    pointMap.set(point.metric_id, existing);
  });

  const getMetricBundle = (name: string) => {
    const metric = metricsByName.get(normalizeName(name));
    if (!metric) return { metric: null as MetricRecord | null, current: null as number | null, previous: null as number | null, latestAt: null as string | null };
    const points = [...(pointMap.get(metric.id) || [])].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return {
      metric,
      current: points[0]?.value ?? metric.current_value ?? null,
      previous: points[1]?.value ?? points[0]?.value ?? null,
      latestAt: points[0]?.timestamp ?? null,
    };
  };

  const wait = getMetricBundle('ED Wait Time');
  const discharges = getMetricBundle('Discharges Pending');
  const bedsAvailable = getMetricBundle('Available Beds');
  const criticalLabs = getMetricBundle('Critical Labs Unacknowledged');
  const patientsPerNurse = getMetricBundle('Patients Per Nurse');
  const readmission = getMetricBundle('Readmission Risk');

  const signalFor = (severity: WorkflowSignal['severity'], title: string, detail: string, lastSeen: string | null, suggestedAction: string): WorkflowSignal => ({
    severity,
    title,
    detail,
    lastSeen,
    suggestedAction,
  });

  return {
    'discharge-coord': signalFor(
      (discharges.current || 0) > 6 ? 'warning' : 'info',
      'Discharge readiness signal',
      discharges.current !== null
        ? `${Math.round(discharges.current)} patients are pending discharge completion${(discharges.current || 0) > 6 ? ', so coordination should be prioritized.' : '.'}`
        : 'No live discharge backlog signal is currently available.',
      discharges.latestAt,
      'Prioritize pharmacy, transport, and discharge paperwork blockers first.'
    ),
    'bed-cleaning': signalFor(
      (bedsAvailable.current || 0) < 8 ? 'warning' : 'info',
      'Bed turnover readiness',
      bedsAvailable.current !== null
        ? `${formatMetricValue(bedsAvailable.current, bedsAvailable.metric?.unit)} are available. ${((bedsAvailable.current || 0) < 8) ? 'Faster room turnover may be needed to restore safe bed buffer.' : 'Current bed buffer is acceptable.'}`
        : 'No live bed turnover signal is currently available.',
      bedsAvailable.latestAt,
      'Coordinate discharge completion and housekeeping handoff for the highest-demand units.'
    ),
    'patient-transfer': signalFor(
      (bedsAvailable.current || 0) < 8 || (discharges.current || 0) > 6 ? 'warning' : 'info',
      'Transfer flow check',
      bedsAvailable.current !== null && discharges.current !== null
        ? `Available beds: ${formatMetricValue(bedsAvailable.current, bedsAvailable.metric?.unit)}. Pending discharges: ${Math.round(discharges.current)}. Transfer velocity will matter if pressure keeps rising.`
        : 'No live transfer pressure signal is currently available.',
      bedsAvailable.latestAt ?? discharges.latestAt,
      'Review receiving-unit readiness and move the clearest transfer candidates first.'
    ),
    'staffing-realloc': signalFor(
      (patientsPerNurse.current || 0) > 5 ? 'warning' : 'info',
      'Staffing load signal',
      patientsPerNurse.current !== null
        ? `Patients per nurse is ${formatMetricValue(patientsPerNurse.current, patientsPerNurse.metric?.unit)}${(patientsPerNurse.current || 0) > 5 ? ', which suggests reallocation pressure.' : ', which is within preferred range.'}`
        : 'No live staffing load signal is currently available.',
      patientsPerNurse.latestAt,
      'Check float coverage and rebalance the highest-load unit first.'
    ),
    'readmission-nav': signalFor(
      (readmission.current || 0) > 0.12 ? 'warning' : 'info',
      'Readmission follow-up signal',
      readmission.current !== null
        ? `Readmission risk is ${formatMetricValue(readmission.current, readmission.metric?.unit)}${(readmission.current || 0) > 0.12 ? ', so follow-up intervention is recommended.' : ', which is within the current threshold.'}`
        : 'No live readmission risk signal is currently available.',
      readmission.latestAt,
      'Prioritize the highest-risk discharges for navigator outreach.'
    ),
    'ed-surge': signalFor(
      (wait.current || 0) > 45 ? 'critical' : (wait.current || 0) > 30 ? 'warning' : 'info',
      'ED surge watch',
      wait.current !== null
        ? `ED wait time is ${formatMetricValue(wait.current, wait.metric?.unit)}${(wait.current || 0) > 45 ? ', which indicates acute congestion pressure.' : '.'}`
        : 'No live ED surge signal is currently available.',
      wait.latestAt,
      'Review intake and throughput bottlenecks before diversion thresholds are crossed.'
    ),
    'lab-escalation': signalFor(
      (criticalLabs.current || 0) > 0 ? 'critical' : 'info',
      'Critical lab escalation watch',
      criticalLabs.current !== null
        ? `${Math.round(criticalLabs.current)} critical lab result${criticalLabs.current === 1 ? '' : 's'} remain unacknowledged${(criticalLabs.current || 0) > 0 ? ', which needs escalation.' : '.'}`
        : 'No live lab escalation signal is currently available.',
      criticalLabs.latestAt,
      'Escalate to the covering clinician if acknowledgement does not clear quickly.'
    ),
  } as Record<string, WorkflowSignal>;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function CPIAutomationWorkflows() {
  const { organizationId } = useAuth();
  const [expanded, setExpanded] = useState<string | null>(null);

  const [states, setStates] = useState<Record<string, WorkflowState>>(
    Object.fromEntries(workflows.map(w => [w.id, defaultState()]))
  );

  // Per feed-category stats: last alert timestamp + unacked count
  const [feedStats, setFeedStats] = useState<Record<string, FeedStats>>({});
  const [workflowSignals, setWorkflowSignals] = useState<Record<string, WorkflowSignal>>({});

  // Flash indicator: workflow ids that recently received a new feed alert
  const [recentlyFired, setRecentlyFired] = useState<Record<string, boolean>>({});

  const updateState = useCallback(
    (id: string, patch: Partial<WorkflowState>) =>
      setStates(prev => ({ ...prev, [id]: { ...prev[id], ...patch } })),
    []
  );

  // ── Load feed stats for all live workflow categories ───────────────────
  const loadFeedStats = useCallback(async () => {
    const liveCategories = workflows
      .filter(w => w.feedCategory)
      .map(w => w.feedCategory as string);

    if (!liveCategories.length) return;

    const { data } = await supabase
      .from('cpi_feed')
      .select('category, acknowledged, created_at')
      .in('category', liveCategories)
      .order('created_at', { ascending: false });

    if (!data) return;

    const stats: Record<string, FeedStats> = {};
    for (const cat of liveCategories) {
      const rows = data.filter(r => r.category === cat);
      const latest = rows[0]?.created_at ?? null;
      const unacked = rows.filter(r => !r.acknowledged).length;
      stats[cat] = { lastTriggered: latest, unackedCount: unacked };
    }
    setFeedStats(stats);
  }, []);

  const loadWorkflowSignals = useCallback(async () => {
    if (!organizationId) return;

    const metricNames = [
      'ED Wait Time',
      'Available Beds',
      'Discharges Pending',
      'Critical Labs Unacknowledged',
      'Patients Per Nurse',
      'Readmission Risk',
    ];

    const { data: metricRows, error: metricsError } = await supabase
      .from('metrics')
      .select('id, name, unit, current_value, target_value')
      .eq('organization_id', organizationId)
      .in('name', metricNames);

    if (metricsError || !metricRows || metricRows.length === 0) return;

    const metricIds = metricRows.map((metric) => metric.id);
    const { data: pointRows, error: pointsError } = await supabase
      .from('metric_data')
      .select('metric_id, value, timestamp')
      .in('metric_id', metricIds)
      .order('timestamp', { ascending: false })
      .limit(300);

    if (pointsError) return;

    const nextSignals = buildWorkflowSignals(metricRows as MetricRecord[], (pointRows as MetricPointRecord[]) || []);
    setWorkflowSignals(nextSignals);
  }, [organizationId]);

  // ── Load ALL workflow states from Supabase on mount ────────────────────
  const loadAllSettings = useCallback(async () => {
    const allIds = workflows.map(w => w.id);
    const { data } = await supabase
      .from('cpi_workflow_settings')
      .select('workflow_id, enabled, runs_today, last_run_at')
      .in('workflow_id', allIds);

    if (data) {
      data.forEach(row => {
        updateState(row.workflow_id, {
          enabled: row.enabled ?? false,
          runsToday: row.runs_today ?? 0,
          lastRun: formatLastRun(row.last_run_at),
          loading: false,
        });
      });
    }

    setStates(prev => {
      const updated = { ...prev };
      workflows.forEach(w => {
        if (updated[w.id].loading) {
          updated[w.id] = {
            ...updated[w.id],
            enabled: w.defaultStatus === 'active',
            loading: false,
          };
        }
      });
      return updated;
    });
  }, [updateState]);

  // ── Real-time subscriptions ────────────────────────────────────────────
  useEffect(() => {
    loadAllSettings();
    loadFeedStats();
    loadWorkflowSignals();

    // Workflow settings changes
    const wfChannel = supabase
      .channel('all_workflow_settings')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cpi_workflow_settings' },
        (payload) => {
          const row = payload.new as {
            workflow_id: string;
            enabled: boolean;
            runs_today: number;
            last_run_at: string;
          };
          if (!row?.workflow_id) return;
          updateState(row.workflow_id, {
            enabled: row.enabled ?? false,
            runsToday: row.runs_today ?? 0,
            lastRun: formatLastRun(row.last_run_at),
          });
        }
      )
      .subscribe();

    // Feed changes — refresh stats on any INSERT or UPDATE
    const feedChannel = supabase
      .channel('workflow_feed_stats')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'cpi_feed' },
        (payload) => {
          loadFeedStats();

          // Optimistically increment the matching workflow's run count
          const insertedCategory = (payload.new as { category?: string }).category;
          if (insertedCategory) {
            const workflowId = FEED_CATEGORY_TO_WORKFLOW_ID[insertedCategory];
            if (workflowId) {
              // Increment runs + mark last run
              setStates(prev => ({
                ...prev,
                [workflowId]: {
                  ...prev[workflowId],
                  runsToday: (prev[workflowId]?.runsToday ?? 0) + 1,
                  lastRun: 'Just now',
                },
              }));

              // Flash the counter for 3 s then clear
              setRecentlyFired(prev => ({ ...prev, [workflowId]: true }));
              setTimeout(() => {
                setRecentlyFired(prev => ({ ...prev, [workflowId]: false }));
              }, 3000);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'cpi_feed' },
        () => { loadFeedStats(); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(wfChannel);
      supabase.removeChannel(feedChannel);
    };
  }, [loadAllSettings, loadFeedStats, loadWorkflowSignals, updateState]);

  // ── Toggle demo (non-live) workflow ────────────────────────────────────
  const toggleDemoWorkflow = useCallback(async (id: string, currentEnabled: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    const newEnabled = !currentEnabled;
    updateState(id, { enabled: newEnabled, acting: true });

    await supabase
      .from('cpi_workflow_settings')
      .upsert(
        { workflow_id: id, enabled: newEnabled, updated_at: new Date().toISOString() },
        { onConflict: 'workflow_id' }
      );

    updateState(id, { acting: false });
  }, [updateState]);

  // ── Toggle live workflow via edge function ─────────────────────────────
  const toggleLiveWorkflow = useCallback(
    async (wf: Workflow, action: 'enable' | 'disable' | 'check', e: React.MouseEvent) => {
      e.stopPropagation();
      if (!wf.edgeFunctionUrl) return;

      updateState(wf.id, { acting: true, result: null });

      try {
        const res = await fetch(wf.edgeFunctionUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        });
        const data: Record<string, unknown> = await res.json();

        if (!data.success) throw new Error(String(data.error ?? 'Edge function returned an error.'));

        const result = classifyResult(data, action);
        const currentState = states[wf.id];

        const patch: Partial<WorkflowState> = { result };
        if (action === 'disable') {
          patch.enabled = false;
        } else {
          patch.enabled = true;
          if (data.alert_fired) {
            patch.runsToday = (currentState?.runsToday ?? 0) + 1;
            patch.lastRun = 'Just now';
          }
        }
        updateState(wf.id, patch);
      } catch (err) {
        updateState(wf.id, {
          result: {
            type: 'error',
            message: err instanceof Error ? err.message : 'Failed to contact edge function.',
          },
        });
      } finally {
        updateState(wf.id, { acting: false });
      }
    },
    [states, updateState]
  );

  // ── Summary counts ─────────────────────────────────────────────────────
  const activeCount = Object.values(states).filter(st => st.enabled).length;
  const totalRunsToday = Object.values(states).reduce((s, st) => s + st.runsToday, 0);

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Healthcare Automation &amp; Workflows</h2>
          <p className="text-sm text-slate-500 mt-0.5">Trigger-based automations embedded into clinical workflows</p>
        </div>
        <div className="flex items-center space-x-2">
          <div className="px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-lg">
            <span className="text-xs font-semibold text-slate-600">{totalRunsToday} executions today</span>
          </div>
          <div className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-100 rounded-lg">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-xs font-semibold text-emerald-700">{activeCount} active</span>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {workflows.map((wf) => {
          const ws = states[wf.id];
          const isLive = !!wf.isLive;
          const currentStatus: 'active' | 'paused' = ws?.enabled ? 'active' : 'paused';
          const cfg = statusCfg[currentStatus];
          const isOpen = expanded === wf.id;

          const signal = workflowSignals[wf.id];
          // Feed-linked stats (only for live workflows with a feedCategory)
          const stats = wf.feedCategory ? feedStats[wf.feedCategory] : undefined;
          const unackedCount = stats?.unackedCount ?? 0;
          const lastTriggeredStr = stats?.lastTriggered ? formatLastRun(stats.lastTriggered) : null;

          return (
            <div
              key={wf.id}
              className={`bg-white rounded-xl border transition-all duration-200 overflow-hidden ${
                isLive
                  ? unackedCount > 0
                    ? 'border-rose-200 ring-1 ring-rose-100'
                    : 'border-teal-100 ring-1 ring-teal-100'
                  : 'border-slate-100 hover:border-slate-200'
              }`}
            >
              {/* Unacked alert banner — live workflows only */}
              {isLive && unackedCount > 0 && (
                <div className="flex items-center justify-between px-5 py-2 bg-rose-50 border-b border-rose-100">
                  <div className="flex items-center space-x-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></div>
                    <span className="text-xs font-semibold text-rose-700">
                      {unackedCount} unacknowledged alert{unackedCount > 1 ? 's' : ''} in feed
                    </span>
                  </div>
                  <span className="text-xs text-rose-500">Check Real-Time Feed to acknowledge</span>
                </div>
              )}

              {/* Row header */}
              <div
                className="flex items-center px-5 py-4 cursor-pointer"
                onClick={() => setExpanded(isOpen ? null : wf.id)}
              >
                <div className={`w-9 h-9 flex items-center justify-center rounded-xl mr-4 flex-shrink-0 border ${
                  isLive && unackedCount > 0
                    ? 'bg-rose-50 border-rose-100'
                    : isLive
                    ? 'bg-teal-50 border-teal-100'
                    : 'bg-slate-50 border-slate-100'
                }`}>
                  <i className={`${wf.icon} text-base ${
                    isLive && unackedCount > 0 ? 'text-rose-500' : isLive ? 'text-teal-600' : 'text-slate-600'
                  }`}></i>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 mb-1 flex-wrap gap-y-1">
                    <h4 className="text-sm font-bold text-slate-900 truncate">{wf.name}</h4>
                    <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full whitespace-nowrap">{wf.category}</span>
                    {isLive && (
                      <span className="text-xs px-2 py-0.5 bg-teal-50 text-teal-600 border border-teal-100 rounded-full font-semibold whitespace-nowrap">
                        Live
                      </span>
                    )}
                    {/* Unacked alert count badge */}
                    {isLive && unackedCount > 0 && (
                      <span className="flex items-center space-x-1 text-xs px-2 py-0.5 bg-rose-100 text-rose-700 rounded-full font-semibold whitespace-nowrap">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse inline-block"></span>
                        <span>{unackedCount} active</span>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center space-x-3 text-xs text-slate-500">
                    <span className="flex items-center space-x-1.5">
                      <i className="ri-flashlight-line text-xs"></i>
                      <span className="truncate">Trigger: {wf.trigger}</span>
                    </span>
                    {/* Last triggered pill — live workflows only */}
                    {isLive && lastTriggeredStr && (
                      <span className="flex items-center space-x-1 text-xs text-slate-400 whitespace-nowrap flex-shrink-0">
                        <i className="ri-time-line text-xs"></i>
                        <span>Triggered {lastTriggeredStr}</span>
                      </span>
                    )}
                    {isLive && !lastTriggeredStr && (
                      <span className="flex items-center space-x-1 text-xs text-slate-300 whitespace-nowrap flex-shrink-0">
                        <i className="ri-time-line text-xs"></i>
                        <span>No feed alerts yet</span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-4 ml-4 flex-shrink-0">
                  <div className="text-right">
                    <div className={`text-xs font-bold transition-colors duration-300 ${
                      recentlyFired[wf.id] ? 'text-teal-600 scale-110' : 'text-slate-900'
                    }`}>
                      {ws?.loading ? (
                        <span className="inline-block w-4 h-3 bg-slate-100 rounded animate-pulse"></span>
                      ) : (
                        <span className={recentlyFired[wf.id] ? 'animate-pulse' : ''}>
                          {ws?.runsToday}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400">
                      {recentlyFired[wf.id] ? (
                        <span className="text-teal-500 font-semibold">+1 just fired</span>
                      ) : 'runs today'}
                    </div>
                  </div>
                  <div className="text-right hidden xl:block">
                    <div className="text-xs font-semibold text-emerald-600">{wf.timeSaved}</div>
                    <div className="text-xs text-slate-400">time saved</div>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    {ws?.loading ? (
                      <div className="w-16 h-5 bg-slate-100 rounded-full animate-pulse"></div>
                    ) : (
                      <>
                        <div className={`w-2 h-2 rounded-full ${cfg.dot}`}></div>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.badge}`}>{cfg.label}</span>
                      </>
                    )}
                  </div>
                  <i className={`ri-arrow-${isOpen ? 'up' : 'down'}-s-line text-slate-400`}></i>
                </div>
              </div>

              {/* Expanded panel */}
              {isOpen && (
                <div className="px-5 pb-5 border-t border-slate-100 pt-4">

                  {/* Feed stats row — live workflows only */}
                  {isLive && wf.feedCategory && (
                    <div className="flex items-center space-x-3 mb-4 p-3 bg-slate-50 rounded-lg border border-slate-100">
                      <div className="flex items-center space-x-2 flex-1">
                        <div className={`w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0 ${
                          unackedCount > 0 ? 'bg-rose-100' : 'bg-slate-100'
                        }`}>
                          <i className={`ri-notification-3-line text-xs ${unackedCount > 0 ? 'text-rose-600' : 'text-slate-500'}`}></i>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-700">
                            {unackedCount > 0
                              ? `${unackedCount} unacknowledged alert${unackedCount > 1 ? 's' : ''}`
                              : 'No active alerts'}
                          </p>
                          <p className="text-xs text-slate-400">in Command Center feed · {wf.feedCategory.toUpperCase()} channel</p>
                        </div>
                      </div>
                      <div className="border-l border-slate-200 pl-3">
                        <p className="text-xs font-semibold text-slate-700">
                          {lastTriggeredStr ?? '—'}
                        </p>
                        <p className="text-xs text-slate-400">last triggered</p>
                      </div>
                    </div>
                  )}

                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Automated Action Steps</p>
                  <div className="space-y-2 mb-4">
                    {wf.actions.map((action, i) => (
                      <div key={i} className="flex items-start space-x-3">
                        <div className="w-5 h-5 flex items-center justify-center bg-teal-50 border border-teal-100 rounded-full flex-shrink-0 mt-0.5">
                          <span className="text-xs font-bold text-teal-600">{i + 1}</span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">{action}</p>
                      </div>
                    ))}
                  </div>

                  {/* Edge Function info banner — live workflows only */}
                  {isLive && wf.edgeFunctionDescription && (
                    <div className="flex items-start space-x-2 p-2.5 bg-teal-50 border border-teal-100 rounded-lg mb-3">
                      <i className="ri-cpu-line text-teal-500 text-xs mt-0.5 flex-shrink-0"></i>
                      <p className="text-xs text-teal-700">{wf.edgeFunctionDescription}</p>
                    </div>
                  )}

                  {signal && (
                    <div className={`flex items-start space-x-2 p-2.5 rounded-lg border mb-3 ${
                      signal.severity === 'critical'
                        ? 'bg-rose-50 border-rose-100'
                        : signal.severity === 'warning'
                        ? 'bg-amber-50 border-amber-100'
                        : 'bg-emerald-50 border-emerald-100'
                    }`}>
                      <i className={`text-xs mt-0.5 flex-shrink-0 ${
                        signal.severity === 'critical'
                          ? 'ri-alarm-warning-line text-rose-500'
                          : signal.severity === 'warning'
                          ? 'ri-alert-line text-amber-500'
                          : 'ri-checkbox-circle-line text-emerald-500'
                      }`}></i>
                      <div className="min-w-0">
                        <p className={`text-xs font-semibold ${
                          signal.severity === 'critical'
                            ? 'text-rose-700'
                            : signal.severity === 'warning'
                            ? 'text-amber-700'
                            : 'text-emerald-700'
                        }`}>
                          {signal.title}
                        </p>
                        <p className="text-xs text-slate-600 mt-0.5">{signal.detail}</p>
                        <p className="text-xs text-slate-500 mt-1">
                          Suggested action: {signal.suggestedAction}
                          {signal.lastSeen ? ` · Updated ${formatLastRun(signal.lastSeen)}` : ''}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Result feedback banner — live workflows only */}
                  {isLive && ws?.result && (
                    <div className={`flex items-start space-x-2.5 p-3 rounded-lg border mb-3 ${resultStyles[ws.result.type]}`}>
                      <i className={`${resultIcons[ws.result.type]} text-sm flex-shrink-0 mt-0.5`}></i>
                      <p className="text-xs font-medium leading-relaxed">{ws.result.message}</p>
                    </div>
                  )}

                  {/* Footer row: last run + action buttons */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">
                      Last workflow run: {ws?.loading ? '...' : ws?.lastRun}
                    </span>
                    <div className="flex items-center space-x-2">

                      {isLive ? (
                        <>
                          <button
                            onClick={(e) =>
                              toggleLiveWorkflow(wf, ws?.enabled ? 'disable' : 'enable', e)
                            }
                            disabled={ws?.acting || ws?.loading}
                            className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60 ${
                              ws?.enabled
                                ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                : 'bg-teal-600 text-white hover:bg-teal-700'
                            }`}
                          >
                            {ws?.acting ? (
                              <>
                                <i className="ri-loader-4-line text-xs animate-spin"></i>
                                <span>{ws?.enabled ? 'Pausing...' : 'Activating...'}</span>
                              </>
                            ) : ws?.enabled ? (
                              <>
                                <i className="ri-pause-line text-xs"></i>
                                <span>Pause</span>
                              </>
                            ) : (
                              <>
                                <i className="ri-play-line text-xs"></i>
                                <span>Enable</span>
                              </>
                            )}
                          </button>

                          {ws?.enabled && (
                            <button
                              onClick={(e) => toggleLiveWorkflow(wf, 'check', e)}
                              disabled={ws?.acting}
                              className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-teal-200 text-teal-600 text-xs font-semibold rounded-lg hover:bg-teal-50 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60"
                            >
                              <i className="ri-search-eye-line text-xs"></i>
                              <span>Run Check</span>
                            </button>
                          )}
                        </>
                      ) : (
                        ws?.enabled ? (
                          <button
                            onClick={(e) => toggleDemoWorkflow(wf.id, true, e)}
                            disabled={ws?.acting || ws?.loading}
                            className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-100 text-slate-600 text-xs font-semibold rounded-lg hover:bg-slate-200 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60"
                          >
                            {ws?.acting ? (
                              <>
                                <i className="ri-loader-4-line text-xs animate-spin"></i>
                                <span>Saving...</span>
                              </>
                            ) : (
                              <>
                                <i className="ri-pause-line text-xs"></i>
                                <span>Pause</span>
                              </>
                            )}
                          </button>
                        ) : (
                          <button
                            onClick={(e) => toggleDemoWorkflow(wf.id, false, e)}
                            disabled={ws?.acting || ws?.loading}
                            className="flex items-center space-x-1.5 px-3 py-1.5 bg-teal-600 text-white text-xs font-semibold rounded-lg hover:bg-teal-700 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60"
                          >
                            {ws?.acting ? (
                              <>
                                <i className="ri-loader-4-line text-xs animate-spin"></i>
                                <span>Saving...</span>
                              </>
                            ) : (
                              <>
                                <i className="ri-play-line text-xs"></i>
                                <span>Enable</span>
                              </>
                            )}
                          </button>
                        )
                      )}

                      <button className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 text-xs font-semibold rounded-lg hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap">
                        <i className="ri-settings-4-line text-xs"></i>
                        <span>Configure</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
