import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import IntegrationConfigModal from './IntegrationConfigModal';
import {
  type OracleSmartConnectionResult,
  readSmartConnectionResult,
} from '../../../services/oracleHealthSmart';
import { syncOraclePlatformArtifacts } from '../../../services/oracleIngestionBridge';

interface DomainSnapshot {
  domain_id: string;
  risk_score: number;
  status: string;
  metrics: Record<string, string | number | boolean>;
  alerts_count: number;
  updated_at: string;
}

interface Integration {
  id: string;
  name: string;
  category: string;
  icon: string;
  protocol: string;
  dataFlow: string;
  description: string;
  domainIds: string[];
  baseMins: number;
}

interface IntegrationConfigRow {
  integration_id: string;
  status: string | null;
  last_test_at: string | null;
  last_test_result: {
    latency_ms?: number;
    message?: string;
    protocol?: string;
  } | null;
}

const INTEGRATIONS: Integration[] = [
  {
    id: 'ehr-epic',
    name: 'Epic EHR',
    category: 'EHR System',
    icon: 'ri-health-book-line',
    protocol: 'FHIR R4',
    dataFlow: 'ADT, vitals, orders, results',
    description: 'Full bidirectional integration via FHIR R4 — ADT events, clinical observations, medication orders, and lab results from the ED.',
    domainIds: ['ed'],
    baseMins: 200,
  },
  {
    id: 'ehr-cerner',
    name: 'Cerner Oracle Health',
    category: 'EHR System',
    icon: 'ri-health-book-line',
    protocol: 'HL7 v2.5 + FHIR',
    dataFlow: 'ADT, clinical docs, care plans',
    description: 'HL7 ADT and ORM message streams combined with FHIR clinical document bundles for readmission and care coordination.',
    domainIds: ['readmission', 'care'],
    baseMins: 100,
  },
  {
    id: 'lab-lis',
    name: 'Sunquest LIS',
    category: 'Lab Information System',
    icon: 'ri-test-tube-line',
    protocol: 'HL7 v2.4 ORU',
    dataFlow: 'Results, alerts, TAT tracking',
    description: 'Real-time lab result streaming with critical value escalation and TAT monitoring.',
    domainIds: ['lab'],
    baseMins: 50,
  },
  {
    id: 'bed-mgmt',
    name: 'Teletracking UXT',
    category: 'Bed Management',
    icon: 'ri-hotel-bed-line',
    protocol: 'REST API',
    dataFlow: 'Bed status, dirty/clean events',
    description: 'Real-time bed status feed including cleaning queue, placement requests, and housekeeping events.',
    domainIds: ['beds'],
    baseMins: 20,
  },
  {
    id: 'scheduling',
    name: 'Kronos Workforce',
    category: 'Staff Scheduling',
    icon: 'ri-calendar-check-line',
    protocol: 'REST API / SFTP',
    dataFlow: 'Shifts, coverage, overtime',
    description: 'Staff scheduling data including shift assignments, float pool coverage, and overtime tracking.',
    domainIds: ['staffing'],
    baseMins: 5,
  },
  {
    id: 'adt-real',
    name: 'ADT Real-Time Feed',
    category: 'Patient Flow',
    icon: 'ri-exchange-line',
    protocol: 'HL7 v2.3 ADT',
    dataFlow: 'Admissions, transfers, discharges',
    description: 'High-frequency ADT event stream for real-time patient movement tracking across all units.',
    domainIds: ['inpatient', 'discharge'],
    baseMins: 80,
  },
  {
    id: 'fhir-gateway',
    name: 'Azure FHIR Gateway',
    category: 'Data Hub',
    icon: 'ri-cloud-line',
    protocol: 'FHIR R4 / SMART',
    dataFlow: 'Unified clinical data bus',
    description: 'Centralized FHIR-compliant data gateway normalizing all clinical data streams to FHIR R4 standard.',
    domainIds: ['ed', 'lab', 'beds', 'inpatient', 'readmission', 'care', 'staffing', 'discharge'],
    baseMins: 300,
  },
  {
    id: 'biomedical',
    name: 'Biomedical Device Feed',
    category: 'IoMT / Devices',
    icon: 'ri-pulse-line',
    protocol: 'IEEE 11073 / HL7 POCD',
    dataFlow: 'Vitals, ventilator, monitors',
    description: 'Medical device integration for continuous vital sign streaming from bedside monitors and ventilators.',
    domainIds: [],
    baseMins: 0,
  },
];

function deriveEventsPerMin(integration: Integration, snapshots: Record<string, DomainSnapshot>): number {
  if (integration.domainIds.length === 0) return 0;
  let total = integration.baseMins;
  for (const dId of integration.domainIds) {
    const snap = snapshots[dId];
    if (!snap) continue;
    if (dId === 'ed') {
      const pts = parseInt(String(snap.metrics.current_patients ?? 0));
      total += pts * 8;
    } else if (dId === 'lab') {
      const pending = parseInt(String(snap.metrics.pending_results ?? 0));
      total += pending * 2;
    } else if (dId === 'beds') {
      const cq = parseInt(String(snap.metrics.cleaning_queue ?? 0));
      const avail = parseInt(String(snap.metrics.available_beds ?? 0));
      total += cq * 4 + avail * 2;
    } else if (dId === 'staffing') {
      const shifts = parseInt(String(snap.metrics.open_shifts ?? 0));
      total += shifts * 2;
    } else if (dId === 'inpatient') {
      const transfers = parseInt(String(snap.metrics.pending_transfers ?? 0));
      total += transfers * 12;
    } else if (dId === 'discharge') {
      const waiting = parseInt(String(snap.metrics.ready_waiting ?? 0));
      total += waiting * 8;
    } else if (dId === 'readmission') {
      const high = parseInt(String(snap.metrics.high_risk_patients ?? 0));
      total += high * 15;
    } else if (dId === 'care') {
      const updates = parseInt(String(snap.metrics.care_plan_updates ?? 0));
      total += Math.floor(updates / 5);
    }
  }
  if (integration.id === 'fhir-gateway') {
    // Sum of all domain alerts * multiplier as proxy
    total += Object.values(snapshots).reduce((s, sn) => s + (sn.alerts_count ?? 0) * 30, 0);
  }
  return total;
}

function deriveStatus(
  integration: Integration,
  snapshots: Record<string, DomainSnapshot>,
  configs: Record<string, IntegrationConfigRow>
): 'connected' | 'syncing' | 'pending' {
  const cfg = configs[integration.id];
  if (!cfg) return integration.domainIds.length === 0 ? 'pending' : 'syncing';
  if (cfg.status === 'connected') return 'connected';
  if (cfg.status === 'syncing') return 'syncing';
  if (cfg.status === 'pending') return 'pending';
  const anySnap = integration.domainIds.some(d => snapshots[d]);
  return anySnap ? 'connected' : 'pending';
}

function getLastSync(
  integration: Integration,
  snapshots: Record<string, DomainSnapshot>,
  configs: Record<string, IntegrationConfigRow>
): string {
  const cfg = configs[integration.id];
  if (cfg?.last_test_at) {
    const diffSec = Math.floor((Date.now() - new Date(cfg.last_test_at).getTime()) / 1000);
    if (diffSec < 60) return `${diffSec} seconds ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} min ago`;
    return `${Math.floor(diffMin / 60)}h ago`;
  }
  if (integration.domainIds.length === 0) return 'Pending setup';
  const times = integration.domainIds
    .map(d => snapshots[d]?.updated_at)
    .filter(Boolean)
    .map(t => new Date(t as string).getTime());
  if (times.length === 0) return 'Unknown';
  const mostRecent = Math.max(...times);
  const diffSec = Math.floor((Date.now() - mostRecent) / 1000);
  if (diffSec < 60) return `${diffSec} seconds ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  return `${Math.floor(diffMin / 60)}h ago`;
}

function getDomainMetricRows(integration: Integration, snapshots: Record<string, DomainSnapshot>): { label: string; value: string; positive?: boolean }[] {
  const rows: { label: string; value: string; positive?: boolean }[] = [];
  for (const dId of integration.domainIds.slice(0, 2)) {
    const snap = snapshots[dId];
    if (!snap) continue;
    const m = snap.metrics;
    if (dId === 'ed') {
      rows.push({ label: 'Current patients', value: String(m.current_patients ?? '—') });
      rows.push({ label: 'Avg wait time', value: String(m.avg_wait_time ?? '—'), positive: false });
      rows.push({ label: 'LWBS rate', value: String(m.lwbs ?? '—'), positive: m.lwbs_positive as boolean });
    } else if (dId === 'lab') {
      rows.push({ label: 'Pending results', value: String(m.pending_results ?? '—'), positive: false });
      rows.push({ label: 'Avg TAT', value: String(m.avg_tat ?? '—'), positive: false });
      rows.push({ label: 'Critical unread', value: String(m.critical_unread ?? '—'), positive: false });
    } else if (dId === 'beds') {
      rows.push({ label: 'Available beds', value: String(m.available_beds ?? '—'), positive: m.available_beds_positive as boolean });
      rows.push({ label: 'Cleaning queue', value: String(m.cleaning_queue ?? '—'), positive: m.cleaning_queue_positive as boolean });
    } else if (dId === 'staffing') {
      rows.push({ label: 'RN coverage', value: String(m.rn_coverage ?? '—'), positive: m.rn_coverage_positive as boolean });
      rows.push({ label: 'Open shifts', value: String(m.open_shifts ?? '—'), positive: m.open_shifts_positive as boolean });
    } else if (dId === 'inpatient') {
      rows.push({ label: 'Pending transfers', value: String(m.pending_transfers ?? '—'), positive: false });
      rows.push({ label: 'ADT velocity', value: String(m.adt_velocity ?? '—') + '/h' });
    } else if (dId === 'discharge') {
      rows.push({ label: 'Ready waiting', value: String(m.ready_waiting ?? '—'), positive: false });
      rows.push({ label: 'Avg delay', value: String(m.avg_discharge_delay ?? '—'), positive: false });
    } else if (dId === 'readmission') {
      rows.push({ label: 'High-risk patients', value: String(m.high_risk_patients ?? '—'), positive: false });
      rows.push({ label: '30-day risk', value: String(m.risk_score_30d ?? '—'), positive: false });
    } else if (dId === 'care') {
      rows.push({ label: 'Handoff compliance', value: String(m.handoff_compliance ?? '—'), positive: true });
      rows.push({ label: 'Care plan updates', value: String(m.care_plan_updates ?? '—'), positive: true });
    }
  }
  return rows.slice(0, 3);
}

const statusConfig = {
  connected: {
    dot: 'bg-emerald-500 animate-pulse',
    badge: 'bg-emerald-100 text-emerald-700',
    label: 'Connected',
  },
  syncing: {
    dot: 'bg-amber-500 animate-pulse',
    badge: 'bg-amber-100 text-amber-700',
    label: 'Syncing',
  },
  pending: {
    dot: 'bg-slate-300',
    badge: 'bg-slate-100 text-slate-600',
    label: 'Pending',
  },
};

export default function HealthcareIntegrations() {
  const { user, organizationId } = useAuth();
  const [snapshots, setSnapshots] = useState<Record<string, DomainSnapshot>>({});
  const [configs, setConfigs] = useState<Record<string, IntegrationConfigRow>>({});
  const [oracleConnection, setOracleConnection] = useState<OracleSmartConnectionResult | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [configuring, setConfiguring] = useState<Integration | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [tickEventsPerMin, setTickEventsPerMin] = useState<Record<string, number>>({});
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('cpi_domain_snapshots')
        .select('domain_id, risk_score, status, metrics, alerts_count, updated_at');
      if (data) {
        const map: Record<string, DomainSnapshot> = {};
        data.forEach((s: DomainSnapshot) => { map[s.domain_id] = s; });
        setSnapshots(map);
      }

      const { data: configRows } = await supabase
        .from('cpi_integration_configs')
        .select('integration_id, status, last_test_at, last_test_result');
      if (configRows) {
        const configMap: Record<string, IntegrationConfigRow> = {};
        configRows.forEach((row: IntegrationConfigRow) => { configMap[row.integration_id] = row; });
        setConfigs(configMap);
      }
      setLoading(false);
    };
    load();

    const channel = supabase
      .channel('integrations-domain-feed')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'cpi_domain_snapshots' }, (payload) => {
        const snap = payload.new as DomainSnapshot;
        setSnapshots(prev => ({ ...prev, [snap.domain_id]: snap }));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cpi_integration_configs' }, (payload) => {
        const row = payload.new as IntegrationConfigRow;
        if (!row?.integration_id) return;
        setConfigs(prev => ({ ...prev, [row.integration_id]: row }));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    const syncOracleConnection = () => {
      setOracleConnection(readSmartConnectionResult());
    };

    syncOracleConnection();
    window.addEventListener('focus', syncOracleConnection);
    window.addEventListener('storage', syncOracleConnection);

    return () => {
      window.removeEventListener('focus', syncOracleConnection);
      window.removeEventListener('storage', syncOracleConnection);
    };
  }, []);

  useEffect(() => {
    if (!organizationId || !user?.id || !oracleConnection) return;

    syncOraclePlatformArtifacts({
      organizationId,
      userId: user.id,
      connection: oracleConnection,
    }).catch((error) => {
      console.warn('Oracle platform sync did not complete from Healthcare Integrations:', error);
    });
  }, [organizationId, user?.id, oracleConnection?.connectedAt]);

  // Refresh events/min deterministically from live domain signals
  useEffect(() => {
    if (Object.keys(snapshots).length === 0) return;
    const base: Record<string, number> = {};
    INTEGRATIONS.forEach(i => { base[i.id] = deriveEventsPerMin(i, snapshots); });
    setTickEventsPerMin(base);

    tickRef.current = setInterval(() => {
      const next: Record<string, number> = {};
      INTEGRATIONS.forEach(integration => {
        next[integration.id] = deriveEventsPerMin(integration, snapshots);
      });
      setTickEventsPerMin(next);
    }, 3500);

    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [snapshots]);

  const categories = ['all', ...Array.from(new Set(INTEGRATIONS.map(i => i.category)))];
  const filtered = filter === 'all' ? INTEGRATIONS : INTEGRATIONS.filter(i => i.category === filter);

  const connectedCount = INTEGRATIONS.filter(i => deriveStatus(i, snapshots, configs) === 'connected').length;
  const totalEventsPerMin = INTEGRATIONS.reduce((sum, i) => sum + (tickEventsPerMin[i.id] ?? 0), 0);
  const oracleSummary = oracleConnection
    ? oracleConnection.resources.slice(0, 4).map((resource) => {
        const total = typeof resource.total === 'number' ? `${resource.total} total` : 'total unavailable';
        const ids = resource.sampleIds.length > 0 ? resource.sampleIds.join(', ') : 'no sample ids';
        return `${resource.resourceType}: ${total}, ${ids}`;
      })
    : [];
  const oracleConnectedAt = oracleConnection
    ? new Date(oracleConnection.connectedAt).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center space-x-3 text-slate-500">
          <i className="ri-loader-4-line animate-spin text-xl text-teal-500"></i>
          <span className="text-sm">Connecting to clinical systems...</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Healthcare System Integrations</h2>
          <p className="text-sm text-slate-500 mt-0.5">Connector health, interoperability status, and recent sync telemetry across clinical systems</p>
        </div>
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 px-3 py-1.5 bg-emerald-50 border border-emerald-100 rounded-lg">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-xs font-semibold text-emerald-700">{connectedCount} active</span>
          </div>
          <div className="px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-lg">
            <span className="text-xs font-semibold text-slate-600 tabular-nums">{totalEventsPerMin.toLocaleString()} events/min</span>
          </div>
          <div className="flex items-center space-x-1.5 px-3 py-1.5 bg-teal-50 border border-teal-100 rounded-lg">
            <i className="ri-database-2-line text-xs text-teal-600"></i>
            <span className="text-xs font-semibold text-teal-700">Live</span>
          </div>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Oracle Health Live Test</p>
            <h3 className="mt-2 text-lg font-bold text-slate-900">Oracle open-sandbox connection status</h3>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              This panel shows the latest Oracle Health sandbox result SigmaSense captured from the launch flow so you
              can verify live Oracle data inside the app instead of only on the launch page.
            </p>
          </div>
          <Link
            to="/integrations/oracle-health/launch"
            className="inline-flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-2.5 text-sm font-semibold text-teal-700 hover:border-teal-300"
          >
            <i className="ri-external-link-line" />
            Open Oracle Test Flow
          </Link>
        </div>

        {oracleConnection ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
              <div className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <p className="text-sm font-semibold text-emerald-800">
                  {oracleConnection.mode === 'open-sandbox' ? 'Open sandbox reachable' : 'SMART connection active'}
                </p>
              </div>
              <div className="mt-4 space-y-2 text-sm text-emerald-900">
                <p><span className="font-semibold">Source:</span> {oracleConnection.issuer}</p>
                <p><span className="font-semibold">Connection mode:</span> {oracleConnection.mode === 'open-sandbox' ? 'Public read-only Oracle sandbox' : 'Authenticated SMART on FHIR session'}</p>
                {oracleConnectedAt && <p><span className="font-semibold">Last verified:</span> {oracleConnectedAt}</p>}
                <p><span className="font-semibold">Resources captured:</span> {oracleConnection.resources.length}</p>
              </div>
              <div className="mt-4 rounded-xl border border-emerald-100 bg-white/80 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">What this means</p>
                <p className="mt-2 text-sm leading-6 text-emerald-900">
                  SigmaSense has already reached Oracle Health and pulled live FHIR data from the sandbox. The next step
                  is mapping those resources into CPI signals and healthcare integration workflows.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Latest Oracle resource summary</p>
              <div className="mt-3 space-y-2">
                {oracleSummary.map((item) => (
                  <div key={item} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-800">No Oracle Health sandbox result found yet</p>
            <p className="mt-1 text-sm leading-6 text-amber-900">
              Run the Oracle launch test once from the open-sandbox page, then come back here. SigmaSense will read the
              latest Oracle session result automatically.
            </p>
          </div>
        )}
      </div>

      {/* Data flow diagram */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-6 mb-6 overflow-hidden relative">
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: `radial-gradient(circle at 2px 2px, rgba(255,255,255,0.8) 1px, transparent 0)`,
          backgroundSize: '32px 32px',
        }}></div>
        <div className="relative">
          <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-4">Real-Time Data Flow Architecture</p>
          <div className="flex items-center justify-between">
            {/* Sources */}
            <div className="space-y-2">
              {INTEGRATIONS.filter(i => ['ehr-epic', 'ehr-cerner', 'lab-lis', 'bed-mgmt', 'adt-real'].includes(i.id)).map((intg) => {
                const st = deriveStatus(intg, snapshots, configs);
                const dotColor = st === 'connected' ? 'bg-emerald-400 animate-pulse' : st === 'syncing' ? 'bg-amber-400 animate-pulse' : 'bg-slate-500';
                return (
                  <div key={intg.id} className="flex items-center space-x-2 px-3 py-1.5 bg-white/8 border border-white/10 rounded-lg">
                    <div className={`w-1.5 h-1.5 rounded-full ${dotColor}`}></div>
                    <span className="text-xs text-white/70 whitespace-nowrap">{intg.name}</span>
                    {tickEventsPerMin[intg.id] != null && (
                      <span className="text-xs text-white/30 tabular-nums ml-1">{tickEventsPerMin[intg.id]}/m</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Flow arrows */}
            <div className="flex-1 flex items-center justify-center px-6">
              <div className="flex flex-col items-center space-y-1">
                <div className="flex items-center space-x-2 w-full">
                  <div className="h-px flex-1 bg-gradient-to-r from-teal-500/30 to-teal-500"></div>
                  <i className="ri-arrow-right-line text-teal-400 text-sm"></i>
                </div>
                <span className="text-xs text-teal-400 font-semibold whitespace-nowrap">HL7 / FHIR / REST</span>
                <div className="flex items-center space-x-2 w-full">
                  <div className="h-px flex-1 bg-gradient-to-r from-teal-500 to-teal-500/30"></div>
                  <i className="ri-arrow-right-line text-teal-400 text-sm"></i>
                </div>
              </div>
            </div>

            {/* CPI Core */}
            <div className="flex flex-col items-center">
              <div className="w-28 h-28 rounded-2xl bg-gradient-to-br from-teal-500 to-teal-600 flex flex-col items-center justify-center border-2 border-teal-400/50">
                <i className="ri-heart-pulse-line text-white text-2xl mb-1"></i>
                <span className="text-white text-xs font-bold">CPI Core</span>
                <span className="text-white/60 text-xs">Intelligence</span>
                <span className="text-teal-200 text-xs font-bold tabular-nums mt-0.5">{totalEventsPerMin.toLocaleString()}/m</span>
              </div>
            </div>

            {/* Right arrows */}
            <div className="flex-1 flex items-center justify-center px-6">
              <div className="flex flex-col items-center space-y-1">
                <div className="flex items-center space-x-2 w-full">
                  <i className="ri-arrow-right-line text-teal-400 text-sm"></i>
                  <div className="h-px flex-1 bg-gradient-to-r from-teal-500 to-teal-500/30"></div>
                </div>
                <span className="text-xs text-teal-400 font-semibold whitespace-nowrap">Alerts / Actions</span>
                <div className="flex items-center space-x-2 w-full">
                  <i className="ri-arrow-right-line text-teal-400 text-sm"></i>
                  <div className="h-px flex-1 bg-gradient-to-r from-teal-500/30 to-teal-500"></div>
                </div>
              </div>
            </div>

            {/* Outputs */}
            <div className="space-y-2">
              {['Nurses', 'Bed Managers', 'Lab Supervisors', 'Care Coordinators', 'Executives'].map((out, i) => (
                <div key={i} className="flex items-center space-x-2 px-3 py-1.5 bg-teal-500/15 border border-teal-500/20 rounded-lg">
                  <i className="ri-user-line text-teal-400 text-xs"></i>
                  <span className="text-xs text-white/70 whitespace-nowrap">{out}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Live domain risk strip */}
          <div className="mt-5 pt-4 border-t border-white/10 grid grid-cols-8 gap-2">
            {Object.values(snapshots).map(snap => {
              const riskColor = snap.risk_score >= 70 ? 'bg-red-500' : snap.risk_score >= 45 ? 'bg-amber-400' : 'bg-emerald-400';
              return (
                <div key={snap.domain_id} className="flex flex-col items-center space-y-1">
                  <div className="w-full bg-white/10 rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full ${riskColor}`} style={{ width: `${snap.risk_score}%` }}></div>
                  </div>
                  <span className="text-xs text-white/40 capitalize">{snap.domain_id}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center space-x-2 mb-4 overflow-x-auto pb-1">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
              filter === cat
                ? 'bg-slate-900 text-white'
                : 'bg-white border border-slate-100 text-slate-600 hover:border-slate-200 hover:text-slate-800'
            }`}
          >
            {cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}
      </div>

      {/* Integration grid */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {filtered.map((integration) => {
          const status = deriveStatus(integration, snapshots, configs);
          const cfg = statusConfig[status];
          const isSelected = selected === integration.id;
          const evPerMin = tickEventsPerMin[integration.id] ?? 0;
          const lastSync = getLastSync(integration, snapshots, configs);
          const metricRows = getDomainMetricRows(integration, snapshots);
          const config = configs[integration.id];
          const latency = config?.last_test_result?.latency_ms;
          const oracleIsLive = integration.id === 'ehr-cerner' && Boolean(oracleConnection);
          const lastMessage =
            oracleIsLive
              ? oracleConnection?.mode === 'open-sandbox'
                ? 'Oracle open sandbox is live in SigmaSense. Public FHIR reads succeeded and the latest resource summary is available above.'
                : 'Oracle SMART-on-FHIR session is active in SigmaSense and the latest verified resource summary is available above.'
              : config?.last_test_result?.message;
          const latencyLabel = oracleIsLive ? 'Live sandbox read' : latency != null ? `${latency} ms` : '—';

          return (
            <div
              key={integration.id}
              onClick={() => setSelected(isSelected ? null : integration.id)}
              className={`bg-white rounded-xl border transition-all duration-300 cursor-pointer hover:-translate-y-0.5 ${
                isSelected ? 'border-teal-200' : 'border-slate-100 hover:border-slate-200'
              }`}
            >
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 flex items-center justify-center bg-slate-50 border border-slate-100 rounded-xl">
                    <i className={`${integration.icon} text-lg text-slate-600`}></i>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <div className={`w-2 h-2 rounded-full ${cfg.dot}`}></div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.badge}`}>{cfg.label}</span>
                  </div>
                </div>

                <h4 className="text-sm font-bold text-slate-900 mb-0.5">{integration.name}</h4>
                <p className="text-xs text-slate-500 mb-3">{integration.category}</p>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Protocol</span>
                    <span className="text-xs font-semibold text-slate-700">{integration.protocol}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Events/min</span>
                    <span className={`text-xs font-bold tabular-nums ${evPerMin > 0 ? 'text-teal-600' : 'text-slate-400'}`}>
                      {evPerMin > 0 ? evPerMin.toLocaleString() : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Last sync</span>
                    <span className="text-xs text-slate-500">{lastSync}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Latency</span>
                    <span className="text-xs text-slate-500">{latencyLabel}</span>
                  </div>
                </div>

                {isSelected && (
                  <div className="mt-4 pt-3 border-t border-slate-100">
                    <p className="text-xs text-slate-600 leading-relaxed mb-3">{integration.description}</p>
                    <div className="flex items-center space-x-1.5 text-xs text-slate-500 mb-3">
                      <i className="ri-flow-chart text-xs"></i>
                      <span>{integration.dataFlow}</span>
                    </div>
                    {metricRows.length > 0 && (
                      <div className="space-y-1.5 bg-slate-50 rounded-lg p-3 mb-3">
                        <p className="text-xs font-semibold text-slate-600 mb-2">Live domain metrics</p>
                        {metricRows.map((row, idx) => (
                          <div key={idx} className="flex items-center justify-between">
                            <span className="text-xs text-slate-500">{row.label}</span>
                            <span className={`text-xs font-bold ${
                              row.positive === false ? 'text-red-500' : row.positive === true ? 'text-emerald-600' : 'text-slate-700'
                            }`}>{row.value}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {(lastMessage || config?.status) && (
                      <div className="space-y-1.5 bg-slate-50 rounded-lg p-3 mb-3">
                        <p className="text-xs font-semibold text-slate-600 mb-2">Connector health</p>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-500">Config status</span>
                          <span className={`text-xs font-semibold ${
                            oracleIsLive || status === 'connected' ? 'text-emerald-600' : status === 'syncing' ? 'text-amber-600' : 'text-slate-500'
                          }`}>
                            {oracleIsLive ? 'connected' : config?.status ?? status}
                          </span>
                        </div>
                        {lastMessage && (
                          <p className="text-xs text-slate-600 leading-relaxed">{lastMessage}</p>
                        )}
                      </div>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfiguring(integration); }}
                      className="w-full flex items-center justify-center space-x-1.5 px-3 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-700 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <i className="ri-settings-3-line text-xs"></i>
                      <span>Configure Integration</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {configuring && (
        <IntegrationConfigModal
          integration={configuring}
          onClose={() => setConfiguring(null)}
        />
      )}
    </div>
  );
}
