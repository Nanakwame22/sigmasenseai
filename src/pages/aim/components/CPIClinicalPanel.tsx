import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';

interface ClinicalMetricRow {
  id: string;
  name: string;
  current_value: number | null;
  target_value: number | null;
  upper_threshold: number | null;
  category: string | null;
  tags: string[] | null;
  unit: string | null;
}

interface DomainStatus {
  domain: string;
  label: string;
  icon: string;
  riskScore: number | null;
  status: 'on_track' | 'at_risk' | 'critical' | 'unknown';
  unit: string;
  subMetrics: Array<{ name: string; value: number | null; unit: string }>;
  lastUpdated: string | null;
}

const DOMAIN_META: Record<string, { label: string; icon: string; color: string; bg: string; border: string }> = {
  'Clinical - Patient Flow':  { label: 'Patient Flow',     icon: 'ri-walk-line',          color: 'text-teal-700',   bg: 'bg-teal-50',   border: 'border-teal-200'  },
  'Clinical - Laboratory':    { label: 'Laboratory',       icon: 'ri-test-tube-line',     color: 'text-violet-700', bg: 'bg-violet-50', border: 'border-violet-200'},
  'Clinical - Readmissions':  { label: 'Readmissions',     icon: 'ri-hospital-line',      color: 'text-rose-700',   bg: 'bg-rose-50',   border: 'border-rose-200'  },
  'Clinical - Staffing':      { label: 'Staffing',         icon: 'ri-team-line',          color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200' },
  'Clinical - Biomedical':    { label: 'Biomedical',       icon: 'ri-stethoscope-line',   color: 'text-cyan-700',   bg: 'bg-cyan-50',   border: 'border-cyan-200'  },
  'Clinical - Patient Experience': { label: 'Patient Exp', icon: 'ri-heart-line',         color: 'text-pink-700',   bg: 'bg-pink-50',   border: 'border-pink-200'  },
};

function getStatus(riskScore: number | null, upper: number | null): DomainStatus['status'] {
  if (riskScore === null) return 'unknown';
  if (upper && riskScore >= upper) return 'critical';
  if (riskScore >= 75) return 'at_risk';
  if (riskScore >= 55) return 'at_risk';
  return 'on_track';
}

const STATUS_CFG = {
  on_track: { label: 'On Track',  dot: 'bg-emerald-400', text: 'text-emerald-700', bar: 'bg-emerald-500' },
  at_risk:  { label: 'At Risk',   dot: 'bg-amber-400',   text: 'text-amber-700',   bar: 'bg-amber-500'   },
  critical: { label: 'Critical',  dot: 'bg-rose-500',    text: 'text-rose-700',    bar: 'bg-rose-500'    },
  unknown:  { label: 'No Data',   dot: 'bg-gray-300',    text: 'text-gray-500',    bar: 'bg-gray-300'    },
};

export default function CPIClinicalPanel() {
  const { organization } = useAuth();
  const [domains, setDomains] = useState<DomainStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [totalClinicalAlerts, setTotalClinicalAlerts] = useState(0);

  const loadClinicalData = useCallback(async () => {
    if (!organization?.id) return;

    try {
      // Load all CPI-bridge metrics
      const { data: metrics } = await supabase
        .from('metrics')
        .select('id, name, current_value, target_value, upper_threshold, category, tags, unit')
        .eq('organization_id', organization.id)
        .contains('tags', ['cpi-bridge']);

      if (!metrics || metrics.length === 0) {
        setLoading(false);
        return;
      }

      // Find the most recent metric_data point for sync timestamp
      const metricIds = metrics.map((m: ClinicalMetricRow) => m.id);
      const { data: latestData } = await supabase
        .from('metric_data')
        .select('timestamp')
        .in('metric_id', metricIds)
        .eq('source', 'cpi-bridge')
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestData?.timestamp) setLastSynced(latestData.timestamp);

      // Count clinical alerts
      const { count: clinicalAlertCount } = await supabase
        .from('alerts')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organization.id)
        .eq('category', 'clinical')
        .in('status', ['new', 'acknowledged']);

      setTotalClinicalAlerts(clinicalAlertCount ?? 0);

      // Group metrics by category into domain cards
      const grouped: Record<string, ClinicalMetricRow[]> = {};
      for (const m of metrics as ClinicalMetricRow[]) {
        const cat = m.category ?? 'Unknown';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(m);
      }

      const domainList: DomainStatus[] = Object.entries(grouped).map(([cat, rows]) => {
        const meta = DOMAIN_META[cat];
        // Risk score metric is the one with '_risk_score' in its tags
        const riskRow = rows.find(r => r.tags?.some(t => t.endsWith('_risk_score')));
        const subRows = rows.filter(r => r.id !== riskRow?.id);

        const status = getStatus(riskRow?.current_value ?? null, riskRow?.upper_threshold ?? null);

        return {
          domain: cat,
          label: meta?.label ?? cat.replace('Clinical - ', ''),
          icon: meta?.icon ?? 'ri-heart-pulse-line',
          riskScore: riskRow?.current_value ?? null,
          status,
          unit: riskRow?.unit ?? 'score',
          subMetrics: subRows.map(r => ({
            name: r.name,
            value: r.current_value,
            unit: r.unit ?? '',
          })),
          lastUpdated: null,
        };
      });

      // Sort: critical → at_risk → on_track → unknown
      const order = { critical: 0, at_risk: 1, on_track: 2, unknown: 3 };
      domainList.sort((a, b) => order[a.status] - order[b.status]);

      setDomains(domainList);
    } catch (err) {
      console.error('CPIClinicalPanel error:', err);
    } finally {
      setLoading(false);
    }
  }, [organization?.id]);

  useEffect(() => {
    loadClinicalData();
  }, [loadClinicalData]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-teal-50 rounded-lg animate-pulse"></div>
          <div className="h-5 w-48 bg-gray-200 rounded animate-pulse"></div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="h-24 bg-gray-100 rounded-lg animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  if (domains.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-dashed border-teal-200 p-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 bg-teal-50 rounded-lg flex items-center justify-center">
            <i className="ri-heart-pulse-line text-teal-500 text-lg"></i>
          </div>
          <h3 className="text-base font-bold text-gray-900">Clinical Intelligence</h3>
        </div>
        <p className="text-sm text-gray-500 mb-3">
          No clinical data synced yet. Visit the CPI page to activate the bridge — domain snapshots will appear here automatically.
        </p>
        <Link
          to="/dashboard/cpi"
          className="inline-flex items-center gap-2 text-sm font-semibold text-teal-600 hover:text-teal-800 transition-colors cursor-pointer"
        >
          <i className="ri-heart-pulse-line"></i>
          Go to CPI Dashboard →
        </Link>
      </div>
    );
  }

  const criticalCount = domains.filter(d => d.status === 'critical').length;
  const atRiskCount = domains.filter(d => d.status === 'at_risk').length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-teal-50 to-slate-50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-teal-600 rounded-lg flex items-center justify-center">
            <i className="ri-heart-pulse-line text-white text-lg"></i>
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900">Clinical Intelligence</h3>
            <p className="text-xs text-gray-500">
              Live CPI data flowing into analytics engine
              {lastSynced && (
                <span className="ml-1.5 text-teal-600 font-medium">
                  · synced {new Date(lastSynced).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {totalClinicalAlerts > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-rose-50 border border-rose-200 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
              <span className="text-xs font-bold text-rose-700">{totalClinicalAlerts} active alert{totalClinicalAlerts !== 1 ? 's' : ''}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 px-3 py-1 bg-white border border-gray-200 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-xs font-semibold text-gray-600">Bridge Active</span>
          </div>
          <Link
            to="/dashboard/cpi"
            className="text-xs font-semibold text-teal-600 hover:text-teal-800 flex items-center gap-1 cursor-pointer whitespace-nowrap transition-colors"
          >
            View CPI <i className="ri-arrow-right-s-line"></i>
          </Link>
        </div>
      </div>

      {/* Summary bar */}
      {(criticalCount > 0 || atRiskCount > 0) && (
        <div className={`px-6 py-2.5 flex items-center gap-4 text-xs font-medium border-b ${
          criticalCount > 0 ? 'bg-rose-50 border-rose-100' : 'bg-amber-50 border-amber-100'
        }`}>
          <i className={`ri-alarm-warning-line ${criticalCount > 0 ? 'text-rose-600' : 'text-amber-600'}`}></i>
          <span className={criticalCount > 0 ? 'text-rose-700' : 'text-amber-700'}>
            {criticalCount > 0 && <><strong>{criticalCount}</strong> clinical domain{criticalCount !== 1 ? 's' : ''} critical — </>}
            {atRiskCount > 0 && <><strong>{atRiskCount}</strong> at risk — </>}
            review predictive alerts and forecasts for clinical metrics
          </span>
        </div>
      )}

      {/* Domain Grid */}
      <div className="p-4 grid grid-cols-2 lg:grid-cols-3 gap-3">
        {domains.map((d) => {
          const meta = DOMAIN_META[d.domain];
          const sCfg = STATUS_CFG[d.status];
          const pct = d.riskScore !== null ? Math.min(d.riskScore, 100) : 0;

          return (
            <div
              key={d.domain}
              className={`relative rounded-xl p-4 border ${meta?.bg ?? 'bg-gray-50'} ${meta?.border ?? 'border-gray-200'} transition-all hover:shadow-sm`}
            >
              {/* Status dot */}
              <span className={`absolute top-3 right-3 w-2 h-2 rounded-full ${sCfg.dot} ${d.status === 'critical' ? 'animate-pulse' : ''}`}></span>

              {/* Icon + label */}
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 flex items-center justify-center">
                  <i className={`${d.icon} ${meta?.color ?? 'text-gray-600'} text-base`}></i>
                </div>
                <span className={`text-xs font-bold ${meta?.color ?? 'text-gray-700'}`}>{d.label}</span>
              </div>

              {/* Risk score */}
              <div className="mb-2">
                {d.riskScore !== null ? (
                  <>
                    <span className="text-2xl font-bold text-gray-900">{d.riskScore}</span>
                    <span className="text-xs text-gray-500 ml-1">{d.unit}</span>
                  </>
                ) : (
                  <span className="text-sm text-gray-400 italic">No data</span>
                )}
              </div>

              {/* Risk bar */}
              {d.riskScore !== null && (
                <div className="w-full bg-white/70 rounded-full h-1.5 mb-2">
                  <div
                    className={`h-1.5 rounded-full transition-all ${sCfg.bar}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}

              {/* Status pill */}
              <span className={`inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide ${sCfg.text}`}>
                {sCfg.label}
              </span>

              {/* Sub-metrics */}
              {d.subMetrics.length > 0 && (
                <div className="mt-2.5 pt-2.5 border-t border-white/50 space-y-1">
                  {d.subMetrics.slice(0, 2).map((sm, idx) => (
                    <div key={idx} className="flex items-center justify-between">
                      <span className="text-xs text-gray-500 truncate max-w-[70%]">{sm.name.replace(/^(ED |Lab |30-Day |Staff |Critical |Patient )/i, '')}</span>
                      <span className="text-xs font-semibold text-gray-700 whitespace-nowrap">
                        {sm.value !== null ? `${sm.value} ${sm.unit}`.trim() : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <i className="ri-arrow-left-right-line text-teal-500"></i>
          <span>Clinical metrics are available in <strong className="text-gray-700">Forecasting</strong>, <strong className="text-gray-700">Alerts</strong>, and <strong className="text-gray-700">KPI Manager</strong></span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <span className="w-1.5 h-1.5 rounded-full bg-teal-400"></span>
          {domains.length} domains tracked
        </div>
      </div>
    </div>
  );
}
