import { useState } from 'react';
import { useCPIData } from '../../../hooks/useCPIData';
import type { CPIDomainSnapshot } from '../../../hooks/useCPIData';
import DomainActionModal from './DomainActionModal';

interface DomainConfig {
  name: string;
  icon: string;
  statusLabels: Record<string, string>;
  metricDefs: Array<{ label: string; valueKey: string; deltaKey: string; positiveKey: string }>;
}

const domainConfigs: Record<string, DomainConfig> = {
  ed: {
    name: 'Emergency Department',
    icon: 'ri-hospital-line',
    statusLabels: { stable: 'Normal Flow', elevated: 'Moderate Strain', critical: 'High Congestion' },
    metricDefs: [
      { label: 'Current Patients', valueKey: 'current_patients', deltaKey: 'current_patients_delta', positiveKey: 'current_patients_positive' },
      { label: 'Avg Wait Time', valueKey: 'avg_wait_time', deltaKey: 'avg_wait_time_delta', positiveKey: 'avg_wait_time_positive' },
      { label: 'Left Without Seen', valueKey: 'lwbs', deltaKey: 'lwbs_delta', positiveKey: 'lwbs_positive' },
    ],
  },
  inpatient: {
    name: 'Inpatient Flow',
    icon: 'ri-user-heart-line',
    statusLabels: { stable: 'Smooth Flow', elevated: 'Moderate Strain', critical: 'Bottleneck Risk' },
    metricDefs: [
      { label: 'ADT Velocity', valueKey: 'adt_velocity', deltaKey: 'adt_velocity_delta', positiveKey: 'adt_velocity_positive' },
      { label: 'Avg LOS', valueKey: 'avg_los', deltaKey: 'avg_los_delta', positiveKey: 'avg_los_positive' },
      { label: 'Pending Transfers', valueKey: 'pending_transfers', deltaKey: 'pending_transfers_delta', positiveKey: 'pending_transfers_positive' },
    ],
  },
  beds: {
    name: 'Bed Management',
    icon: 'ri-hotel-bed-line',
    statusLabels: { stable: 'Adequate Supply', elevated: 'Tightening', critical: 'Shortage Risk' },
    metricDefs: [
      { label: 'Available Beds', valueKey: 'available_beds', deltaKey: 'available_beds_delta', positiveKey: 'available_beds_positive' },
      { label: 'Cleaning Queue', valueKey: 'cleaning_queue', deltaKey: 'cleaning_queue_delta', positiveKey: 'cleaning_queue_positive' },
      { label: 'Dirty Turn Time', valueKey: 'dirty_turn_time', deltaKey: 'dirty_turn_time_delta', positiveKey: 'dirty_turn_time_positive' },
    ],
  },
  lab: {
    name: 'Lab & Diagnostics',
    icon: 'ri-test-tube-line',
    statusLabels: { stable: 'On Schedule', elevated: 'Escalation Pending', critical: 'Critical Backlog' },
    metricDefs: [
      { label: 'Avg TAT', valueKey: 'avg_tat', deltaKey: 'avg_tat_delta', positiveKey: 'avg_tat_positive' },
      { label: 'Pending Results', valueKey: 'pending_results', deltaKey: 'pending_results_delta', positiveKey: 'pending_results_positive' },
      { label: 'Critical Unread', valueKey: 'critical_unread', deltaKey: 'critical_unread_delta', positiveKey: 'critical_unread_positive' },
    ],
  },
  care: {
    name: 'Care Coordination',
    icon: 'ri-team-line',
    statusLabels: { stable: 'Operating Normally', elevated: 'Gaps Detected', critical: 'Critical Gaps' },
    metricDefs: [
      { label: 'Handoff Compliance', valueKey: 'handoff_compliance', deltaKey: 'handoff_compliance_delta', positiveKey: 'handoff_compliance_positive' },
      { label: 'Care Plan Updates', valueKey: 'care_plan_updates', deltaKey: 'care_plan_updates_delta', positiveKey: 'care_plan_updates_positive' },
      { label: 'Escalations Open', valueKey: 'escalations_open', deltaKey: 'escalations_open_delta', positiveKey: 'escalations_open_positive' },
    ],
  },
  staffing: {
    name: 'Staffing & Capacity',
    icon: 'ri-user-2-line',
    statusLabels: { stable: 'Fully Staffed', elevated: 'Imbalance Detected', critical: 'Critical Shortage' },
    metricDefs: [
      { label: 'RN Coverage', valueKey: 'rn_coverage', deltaKey: 'rn_coverage_delta', positiveKey: 'rn_coverage_positive' },
      { label: 'Overtime Hours', valueKey: 'overtime_hours', deltaKey: 'overtime_hours_delta', positiveKey: 'overtime_hours_positive' },
      { label: 'Open Shifts', valueKey: 'open_shifts', deltaKey: 'open_shifts_delta', positiveKey: 'open_shifts_positive' },
    ],
  },
  readmission: {
    name: 'Readmission Risk',
    icon: 'ri-refresh-alert-line',
    statusLabels: { stable: 'Low Risk', elevated: 'Cluster Identified', critical: 'High Risk Surge' },
    metricDefs: [
      { label: '30-day Risk Score', valueKey: 'risk_score_30d', deltaKey: 'risk_score_30d_delta', positiveKey: 'risk_score_30d_positive' },
      { label: 'High-Risk Patients', valueKey: 'high_risk_patients', deltaKey: 'high_risk_patients_delta', positiveKey: 'high_risk_patients_positive' },
      { label: 'Interventions Active', valueKey: 'interventions_active', deltaKey: 'interventions_active_delta', positiveKey: 'interventions_active_positive' },
    ],
  },
  discharge: {
    name: 'Discharge Operations',
    icon: 'ri-door-open-line',
    statusLabels: { stable: 'On Track', elevated: 'Delays Increasing', critical: 'Severe Backlog' },
    metricDefs: [
      { label: 'Discharge Before Noon', valueKey: 'discharge_before_noon', deltaKey: 'discharge_before_noon_delta', positiveKey: 'discharge_before_noon_positive' },
      { label: 'Ready-to-Go Waiting', valueKey: 'ready_waiting', deltaKey: 'ready_waiting_delta', positiveKey: 'ready_waiting_positive' },
      { label: 'Avg Discharge Delay', valueKey: 'avg_discharge_delay', deltaKey: 'avg_discharge_delay_delta', positiveKey: 'avg_discharge_delay_positive' },
    ],
  },
};

const riskColors = {
  low: {
    bg: 'bg-emerald-50', border: 'border-emerald-100', badge: 'bg-emerald-100 text-emerald-700',
    bar: 'bg-emerald-500', icon: 'text-emerald-600',
  },
  medium: {
    bg: 'bg-amber-50', border: 'border-amber-100', badge: 'bg-amber-100 text-amber-700',
    bar: 'bg-amber-500', icon: 'text-amber-600',
  },
  high: {
    bg: 'bg-orange-50', border: 'border-orange-100', badge: 'bg-orange-100 text-orange-700',
    bar: 'bg-orange-500', icon: 'text-orange-600',
  },
  critical: {
    bg: 'bg-rose-50', border: 'border-rose-100', badge: 'bg-rose-100 text-rose-700',
    bar: 'bg-rose-500', icon: 'text-rose-600',
  },
};

const freshnessTone = {
  live: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  delayed: 'bg-amber-50 text-amber-700 border-amber-200',
  stale: 'bg-rose-50 text-rose-700 border-rose-200',
};

const sourceTone = {
  'Source-backed': 'bg-teal-50 text-teal-700 border-teal-200',
  Derived: 'bg-slate-100 text-slate-700 border-slate-200',
  Inferred: 'bg-violet-50 text-violet-700 border-violet-200',
};

function getRiskLevel(score: number): keyof typeof riskColors {
  if (score >= 75) return 'critical';
  if (score >= 55) return 'high';
  if (score >= 35) return 'medium';
  return 'low';
}

function DomainCard({ domain, config, onTakeAction }: { domain: CPIDomainSnapshot; config: DomainConfig; onTakeAction: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const riskLevel = getRiskLevel(domain.risk_score);
  const colors = riskColors[riskLevel];
  const statusLabel = config.statusLabels[domain.status] ?? domain.status;
  const updatedAt = new Date(domain.updated_at);
  const minutesAgo = Math.max(0, Math.floor((Date.now() - updatedAt.getTime()) / 60000));
  const timeLabel = minutesAgo === 0 ? 'Just now' : `${minutesAgo}m ago`;
  const freshnessState = domain.freshness_state || 'stale';
  const freshnessClasses = freshnessTone[freshnessState];
  const sourceClasses = domain.source_label ? sourceTone[domain.source_label] : '';

  return (
    <div
      onClick={() => setExpanded(!expanded)}
      className={`relative rounded-premium border transition-all duration-300 cursor-pointer hover:-translate-y-0.5 ${
        expanded
          ? `${colors.bg} ${colors.border} col-span-2 shadow-elevation-3`
          : 'bg-white border-border hover:border-brand-200 shadow-elevation-1 hover:shadow-elevation-2'
      }`}
    >
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center space-x-2.5">
            <div className={`w-9 h-9 flex items-center justify-center rounded-premium ${expanded ? `${colors.bg} border ${colors.border}` : 'bg-background border border-border'}`}>
              <i className={`${config.icon} text-lg ${expanded ? colors.icon : 'text-brand-500'}`}></i>
            </div>
            <div>
              <h3 className="text-sm font-bold text-brand-900 leading-tight">{config.name}</h3>
              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${colors.badge}`}>{statusLabel}</span>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {domain.alerts_count > 0 && (
              <div className="w-5 h-5 flex items-center justify-center bg-rose-100 rounded-full">
                <span className="text-xs font-bold text-rose-600">{domain.alerts_count}</span>
              </div>
            )}
            <i className={`ri-arrow-${expanded ? 'up' : 'down'}-s-line text-brand-300 text-sm`}></i>
          </div>
        </div>

        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-brand-400 font-medium">Risk Index</span>
            <span className={`text-sm font-bold ${colors.icon}`}>{domain.risk_score}</span>
          </div>
          <div className="h-1.5 bg-brand-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-700 ${colors.bar}`} style={{ width: `${domain.risk_score}%` }}></div>
          </div>
        </div>

        <div className="flex items-start space-x-2 p-2.5 bg-background rounded-premium border border-border">
          <i className="ri-sparkling-2-line text-ai-500 text-sm mt-0.5 flex-shrink-0"></i>
          <p className="text-xs text-brand-600 leading-relaxed">{domain.predictive_insight}</p>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${freshnessClasses}`}>
            {domain.freshness_label || `Updated ${timeLabel}`}
          </span>
          {domain.source_label && (
            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${sourceClasses}`}>
              {domain.source_label}
            </span>
          )}
        </div>

        {expanded && domain.evidence_summary && (
          <div className="mt-3 rounded-premium border border-border bg-white/80 p-3">
            <p className="text-[11px] font-bold uppercase tracking-widest text-brand-400">Evidence</p>
            <p className="mt-1 text-xs leading-relaxed text-brand-600">{domain.evidence_summary}</p>
          </div>
        )}

        {expanded && (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="grid grid-cols-3 gap-3">
              {config.metricDefs.map((def, i) => {
                const value = domain.metrics[def.valueKey] as string | undefined;
                const delta = domain.metrics[def.deltaKey] as string | undefined;
                const isPositive = domain.metrics[def.positiveKey] as boolean | undefined;
                return (
                  <div key={i} className="bg-white rounded-premium p-3 border border-border shadow-elevation-1">
                    <div className="text-xs text-brand-400 font-medium mb-1">{def.label}</div>
                    <div className="text-lg font-bold text-brand-900">{value ?? '—'}</div>
                    {delta && (
                      <div className={`flex items-center space-x-0.5 text-xs font-semibold ${isPositive ? 'text-emerald-600' : 'text-rose-500'}`}>
                        <i className={`${isPositive ? 'ri-arrow-up-line' : 'ri-arrow-down-line'} text-xs`}></i>
                        <span>{delta}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-brand-300">{domain.freshness_label || `Live · Updated ${timeLabel}`}</span>
              <button
                onClick={(e) => { e.stopPropagation(); onTakeAction(); }}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-gradient-to-r from-ai-500 to-ai-600 text-white text-xs font-bold rounded-premium hover:from-ai-600 hover:to-ai-700 transition-all shadow-glow-sm cursor-pointer whitespace-nowrap">
                <i className="ri-arrow-right-circle-line text-sm"></i>
                <span>Take Action</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function OperationalDomains() {
  const { domains, loadingDomains } = useCPIData();
  const [actionTarget, setActionTarget] = useState<{
    domain: CPIDomainSnapshot;
    name: string;
    icon: string;
  } | null>(null);

  const criticalCount = domains.filter(d => d.status === 'critical').length;
  const elevatedCount = domains.filter(d => d.status === 'elevated').length;
  const stableCount = domains.filter(d => d.status === 'stable').length;

  // Order domains by a fixed display order
  const order = ['ed', 'inpatient', 'beds', 'lab', 'care', 'staffing', 'readmission', 'discharge'];
  const sortedDomains = [...domains].sort((a, b) => order.indexOf(a.domain_id) - order.indexOf(b.domain_id));

  if (loadingDomains) {
    return (
      <div>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-bold text-brand-900">Operational Domains</h2>
            <p className="text-sm text-brand-400 mt-0.5">Loading live data...</p>
          </div>
        </div>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-white rounded-premium border border-border p-4 animate-pulse shadow-elevation-1">
              <div className="flex items-center space-x-2.5 mb-3">
                <div className="w-9 h-9 bg-brand-100 rounded-premium"></div>
                <div className="flex-1"><div className="h-3 bg-brand-100 rounded mb-1.5"></div><div className="h-2.5 bg-brand-100 rounded w-3/4"></div></div>
              </div>
              <div className="h-1.5 bg-brand-100 rounded-full mb-3"></div>
              <div className="h-10 bg-background rounded-premium"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-bold text-brand-900">Operational Domains</h2>
          <p className="text-sm text-brand-400 mt-0.5">Live status across all healthcare operational areas</p>
        </div>
        <div className="flex items-center space-x-2">
          {criticalCount > 0 && (
            <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-rose-50 border border-rose-100 rounded-full">
              <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></div>
              <span className="text-xs font-semibold text-rose-600">{criticalCount} Critical</span>
            </div>
          )}
          {elevatedCount > 0 && (
            <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-amber-50 border border-amber-100 rounded-full">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
              <span className="text-xs font-semibold text-amber-600">{elevatedCount} Elevated</span>
            </div>
          )}
          {stableCount > 0 && (
            <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-100 rounded-full">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
              <span className="text-xs font-semibold text-emerald-600">{stableCount} Stable</span>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {sortedDomains.map((domain) => {
          const config = domainConfigs[domain.domain_id];
          if (!config) return null;
          return <DomainCard
            key={domain.id}
            domain={domain}
            config={config}
            onTakeAction={() => setActionTarget({ domain, name: config.name, icon: config.icon })}
          />;
        })}
      </div>

      {actionTarget && (
        <DomainActionModal
          domain={actionTarget.domain}
          domainName={actionTarget.name}
          domainIcon={actionTarget.icon}
          onClose={() => setActionTarget(null)}
        />
      )}
    </div>
  );
}
