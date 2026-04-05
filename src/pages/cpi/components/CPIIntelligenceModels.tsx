import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import AddModelModal from './AddModelModal';
import EditModelPanel from './EditModelPanel';
import type { ModelEditFields } from './EditModelPanel';

// ── Types ──────────────────────────────────────────────────────────────────

interface CPIModel {
  id: string;
  model_key: string;
  name: string;
  icon: string;
  category: string;
  accuracy: number;
  status: 'running' | 'training' | 'paused';
  last_run_at: string | null;
  predictions: string | null;
  impact: string | null;
  description: string | null;
  features: string[];
  run_count_today: number;
  prediction_confidence: number | null;
  alert_count: number;
  learn_count: number;
  last_learned_at: string | null;
  updated_at: string;
}

interface RunResult {
  success: boolean;
  alert_fired: boolean;
  severity?: 'critical' | 'warning';
  risk_score?: number;
  prediction?: string;
  display_metrics?: Array<{ label: string; value: string }>;
  message: string;
  latency_ms: number;
  timestamp: string;
  error?: string;
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

// ── Helpers ────────────────────────────────────────────────────────────────

function formatLastRun(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diffSec = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diffSec < 5) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffH = Math.floor(diffMin / 60);
  return `${diffH}h ago`;
}

// ── Status config ──────────────────────────────────────────────────────────

const statusConfig: Record<CPIModel['status'], {
  dot: string; badge: string; label: string; ring: string;
}> = {
  running: {
    dot: 'bg-emerald-500 animate-pulse',
    badge: 'bg-emerald-100 text-emerald-700',
    label: 'Running',
    ring: 'ring-1 ring-emerald-100',
  },
  training: {
    dot: 'bg-amber-400 animate-pulse',
    badge: 'bg-amber-100 text-amber-700',
    label: 'Training',
    ring: 'ring-1 ring-amber-100',
  },
  paused: {
    dot: 'bg-slate-300',
    badge: 'bg-slate-100 text-slate-500',
    label: 'Paused',
    ring: '',
  },
};

// Models with wired edge functions
const SMART_MODELS = new Set(['ed-surge', 'readmission', 'lab-escalation', 'lab']);

// Feed category mapped from model_key
const MODEL_KEY_TO_FEED_CATEGORY: Record<string, string> = {
  'ed-surge': 'ed',
  'readmission': 'readmission',
  'lab-escalation': 'lab',
  'lab': 'lab',
};

const LIVE_METRIC_PRIORITY = [
  'ED Wait Time',
  'Available Beds',
  'Occupied Beds',
  'Patients Per Nurse',
  'Readmission Risk',
  'Discharges Pending',
  'LOS Average Hours',
  'Critical Labs Unacknowledged',
];

function normalizeName(value: string) {
  return value.trim().toLowerCase();
}

function formatMetricValue(value: number | null | undefined, unit: string | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const normalizedUnit = (unit || '').toLowerCase();
  if (normalizedUnit === 'minutes' || normalizedUnit === 'min') return `${value.toFixed(1)}m`;
  if (normalizedUnit === 'hours' || normalizedUnit === 'hour' || normalizedUnit === 'h') return `${value.toFixed(1)}h`;
  if (normalizedUnit === 'beds' || normalizedUnit === 'count') return `${Math.round(value)}`;
  if (normalizedUnit === 'ratio') return `${value.toFixed(1)}`;
  if (normalizedUnit === 'probability') return `${Math.round(value * 100)}%`;
  return `${value.toFixed(1)}`;
}

function deriveConfidence(pointCount: number, riskMagnitude: number) {
  const depthBoost = Math.min(18, pointCount * 0.8);
  const signalBoost = Math.min(10, riskMagnitude * 0.1);
  return Math.max(62, Math.min(96, 68 + depthBoost + signalBoost));
}

function overlayLiveModelSignals(models: CPIModel[], metrics: MetricRecord[], metricPoints: MetricPointRecord[]) {
  if (!metrics.length) return models;

  const metricsByName = new Map(metrics.map((metric) => [normalizeName(metric.name), metric]));
  const pointMap = new Map<string, MetricPointRecord[]>();
  metricPoints.forEach((point) => {
    const existing = pointMap.get(point.metric_id) || [];
    existing.push(point);
    pointMap.set(point.metric_id, existing);
  });

  const getMetricBundle = (name: string) => {
    const metric = metricsByName.get(normalizeName(name));
    if (!metric) return { metric: null as MetricRecord | null, current: null as number | null, previous: null as number | null, count: 0 };
    const points = [...(pointMap.get(metric.id) || [])].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return {
      metric,
      current: points[0]?.value ?? metric.current_value ?? null,
      previous: points[1]?.value ?? points[0]?.value ?? null,
      count: points.length,
    };
  };

  const wait = getMetricBundle('ED Wait Time');
  const bedsAvailable = getMetricBundle('Available Beds');
  const bedsOccupied = getMetricBundle('Occupied Beds');
  const patientsPerNurse = getMetricBundle('Patients Per Nurse');
  const readmission = getMetricBundle('Readmission Risk');
  const discharges = getMetricBundle('Discharges Pending');
  const los = getMetricBundle('LOS Average Hours');
  const criticalLabs = getMetricBundle('Critical Labs Unacknowledged');

  const totalBeds = (bedsOccupied.current || 0) + (bedsAvailable.current || 0);
  const occupancyPct = totalBeds > 0 ? Math.round(((bedsOccupied.current || 0) / totalBeds) * 100) : 0;

  return models.map((model) => {
    const key = model.model_key;

    const apply = (overrides: Partial<CPIModel>) => ({
      ...model,
      ...overrides,
    });

    if (key === 'ed-surge') {
      const risk = wait.current !== null && (wait.metric?.target_value ?? 30) > 0
        ? Math.max(0, ((wait.current - (wait.metric?.target_value ?? 30)) / (wait.metric?.target_value ?? 30)) * 100)
        : 0;
      return apply({
        accuracy: Math.max(72, Math.min(96, 88 - Math.min(18, risk / 4))),
        prediction_confidence: deriveConfidence(wait.count, risk),
        predictions: wait.current !== null
          ? `ED wait time is ${formatMetricValue(wait.current, wait.metric?.unit)}${wait.previous !== null ? `, ${wait.current > wait.previous ? 'trending up' : 'trending down'}` : ''}.`
          : model.predictions,
        impact: occupancyPct > 85 ? `Capacity tight at ${occupancyPct}% occupancy` : 'Throughput within operating range',
        description: 'Monitors ED throughput using live wait-time and capacity signals from the imported healthcare KPI stream.',
        features: ['ED Wait Time', 'Occupied Beds', 'Available Beds', 'Discharges Pending'],
      });
    }

    if (key === 'readmission') {
      const riskValue = readmission.current ?? 0;
      return apply({
        accuracy: Math.max(74, Math.min(95, 90 - Math.max(0, (riskValue - 0.12) * 120))),
        prediction_confidence: deriveConfidence(readmission.count, riskValue * 100),
        predictions: readmission.current !== null
          ? `Average readmission risk is ${formatMetricValue(readmission.current, readmission.metric?.unit)} against a ${formatMetricValue(readmission.metric?.target_value ?? 0.12, readmission.metric?.unit)} target.`
          : model.predictions,
        impact: riskValue > 0.12 ? 'Intervention review recommended' : 'Within expected threshold',
        description: 'Assesses readmission pressure using the imported risk KPI alongside discharge conditions.',
        features: ['Readmission Risk', 'Discharges Pending', 'LOS Average Hours'],
      });
    }

    if (key === 'lab-escalation' || key === 'lab') {
      const backlog = criticalLabs.current ?? 0;
      return apply({
        accuracy: Math.max(76, Math.min(95, 92 - backlog * 3)),
        prediction_confidence: deriveConfidence(criticalLabs.count, backlog * 20),
        predictions: criticalLabs.current !== null
          ? `${Math.round(backlog)} critical lab result${backlog === 1 ? '' : 's'} remain unacknowledged.`
          : model.predictions,
        impact: backlog > 0 ? 'Escalation queue active' : 'No live lab backlog',
        description: 'Tracks critical result acknowledgement risk from the imported lab backlog KPI.',
        features: ['Critical Labs Unacknowledged', 'LOS Average Hours'],
      });
    }

    if (key === 'bed-forecast') {
      const available = bedsAvailable.current ?? 0;
      const risk = available > 0 ? Math.max(0, (10 - available) * 8) : occupancyPct;
      return apply({
        accuracy: Math.max(73, Math.min(95, 90 - risk / 3)),
        prediction_confidence: deriveConfidence(bedsAvailable.count + bedsOccupied.count, risk),
        predictions: bedsAvailable.current !== null
          ? `${formatMetricValue(bedsAvailable.current, bedsAvailable.metric?.unit)} available beds with ${occupancyPct}% occupancy.`
          : model.predictions,
        impact: available < 8 ? 'Bed shortage risk building' : 'Capacity buffer intact',
        description: 'Forecasts capacity strain using live available-bed, occupied-bed, and discharge backlog signals.',
        features: ['Available Beds', 'Occupied Beds', 'Discharges Pending'],
      });
    }

    if (key === 'staffing-demand') {
      const load = patientsPerNurse.current ?? 0;
      return apply({
        accuracy: Math.max(74, Math.min(94, 89 - Math.max(0, load - 4) * 6)),
        prediction_confidence: deriveConfidence(patientsPerNurse.count, load * 12),
        predictions: patientsPerNurse.current !== null
          ? `Patients per nurse is ${formatMetricValue(load, patientsPerNurse.metric?.unit)}${load > 4 ? ', above preferred range' : ', within preferred range'}.`
          : model.predictions,
        impact: load > 5 ? 'Rebalancing may be needed' : 'Coverage stable',
        description: 'Monitors staffing strain using the imported patients-per-nurse KPI and downstream discharge pressure.',
        features: ['Patients Per Nurse', 'Discharges Pending', 'Available Beds'],
      });
    }

    if (key === 'deterioration') {
      const composite = ((criticalLabs.current || 0) * 10) + Math.max(0, (los.current || 0) - 24);
      return apply({
        accuracy: Math.max(70, Math.min(93, 88 - composite * 0.4)),
        prediction_confidence: deriveConfidence((criticalLabs.count + los.count), composite),
        predictions: composite > 12
          ? 'Escalation patterns suggest a higher need for clinical surveillance across inpatient flow.'
          : 'No elevated deterioration signal is visible from current inpatient and escalation indicators.',
        impact: composite > 12 ? 'Closer clinical surveillance advised' : 'No elevated deterioration signal',
        description: 'Infers deterioration surveillance needs from inpatient LOS friction and critical lab escalation backlog.',
        features: ['LOS Average Hours', 'Critical Labs Unacknowledged'],
      });
    }

    return model;
  });
}

// ── Skeleton card ──────────────────────────────────────────────────────────

function ModelSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-slate-100 p-5 animate-pulse">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-slate-100 rounded-xl"></div>
          <div>
            <div className="h-3.5 bg-slate-100 rounded w-36 mb-1.5"></div>
            <div className="h-2.5 bg-slate-100 rounded w-20"></div>
          </div>
        </div>
        <div className="w-16 h-5 bg-slate-100 rounded-full"></div>
      </div>
      <div className="mb-4">
        <div className="flex justify-between mb-1.5">
          <div className="h-2.5 bg-slate-100 rounded w-24"></div>
          <div className="h-2.5 bg-slate-100 rounded w-10"></div>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full"></div>
      </div>
      <div className="h-10 bg-slate-50 rounded-lg mb-3"></div>
      <div className="flex justify-between">
        <div className="h-2.5 bg-slate-100 rounded w-40"></div>
        <div className="h-2.5 bg-slate-100 rounded w-20"></div>
      </div>
    </div>
  );
}

// ── Run Result Panel ───────────────────────────────────────────────────────

function RunResultPanel({ result, onDismiss }: { result: RunResult; onDismiss: () => void }) {
  const isFail = !result.success;
  const isCritical = result.alert_fired && result.severity === 'critical';
  const isWarning = result.alert_fired && result.severity === 'warning';

  const colorScheme = isFail
    ? { bg: 'bg-rose-50', border: 'border-rose-100', dot: 'bg-rose-500', text: 'text-rose-700', bar: 'from-rose-400 to-rose-600', chip: 'bg-rose-50 border-rose-100' }
    : isCritical
    ? { bg: 'bg-rose-50', border: 'border-rose-100', dot: 'bg-rose-500', text: 'text-rose-700', bar: 'from-rose-400 to-rose-600', chip: 'bg-white border-rose-100' }
    : isWarning
    ? { bg: 'bg-amber-50', border: 'border-amber-100', dot: 'bg-amber-500', text: 'text-amber-700', bar: 'from-amber-400 to-amber-500', chip: 'bg-white border-amber-100' }
    : { bg: 'bg-teal-50', border: 'border-teal-100', dot: 'bg-teal-500', text: 'text-teal-700', bar: 'from-teal-400 to-teal-500', chip: 'bg-white border-teal-100' };

  const statusLabel = isFail
    ? 'Run Failed'
    : isCritical
    ? 'Critical Alert Fired'
    : isWarning
    ? 'Warning Alert Fired'
    : result.alert_fired
    ? 'Alert Fired'
    : 'Monitoring Active — No Alert';

  return (
    <div className={`mt-3 rounded-xl border p-3.5 ${colorScheme.bg} ${colorScheme.border}`}>
      {/* Header row */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${colorScheme.dot} ${result.alert_fired ? 'animate-pulse' : ''}`}></div>
          <span className={`text-xs font-bold ${colorScheme.text}`}>{statusLabel}</span>
        </div>
        <div className="flex items-center space-x-2.5">
          <span className="text-xs text-slate-400 tabular-nums">{result.latency_ms}ms</span>
          <span className="text-xs text-slate-400">{formatLastRun(result.timestamp)}</span>
          <button
            onClick={onDismiss}
            className={`w-4 h-4 flex items-center justify-center rounded ${colorScheme.text} opacity-60 hover:opacity-100 cursor-pointer transition-opacity`}
          >
            <i className="ri-close-line text-xs"></i>
          </button>
        </div>
      </div>

      {/* Risk score bar */}
      {result.risk_score != null && (
        <div className="mb-2.5">
          <div className="flex justify-between text-xs mb-1">
            <span className={`${colorScheme.text} opacity-70`}>Risk Score</span>
            <span className={`font-bold tabular-nums ${colorScheme.text}`}>{result.risk_score}/100</span>
          </div>
          <div className="h-1.5 bg-white/60 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 bg-gradient-to-r ${colorScheme.bar}`}
              style={{ width: `${result.risk_score}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Display metrics chips */}
      {result.display_metrics && result.display_metrics.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2.5">
          {result.display_metrics.map((m, i) => (
            <div
              key={i}
              className={`inline-flex items-center space-x-1 text-xs px-2 py-1 rounded-lg border ${colorScheme.chip}`}
            >
              <span className="text-slate-500">{m.label}:</span>
              <span className="font-semibold text-slate-700">{m.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Message */}
      <p className={`text-xs leading-relaxed ${colorScheme.text}`}>
        {result.error ?? result.message}
      </p>
    </div>
  );
}

// ── Model card ─────────────────────────────────────────────────────────────

interface ModelCardProps {
  model: CPIModel;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onRunCheck: (model: CPIModel) => Promise<void>;
  onTogglePause: (model: CPIModel) => Promise<void>;
  onSaveEdit: (id: string, updates: ModelEditFields) => Promise<void>;
  tickLabel: string;
  running: boolean;
  runResult?: RunResult;
  onDismissResult: () => void;
  unackedAlertCount: number;
}

function ModelCard({
  model,
  isSelected,
  onSelect,
  onRunCheck,
  onTogglePause,
  onSaveEdit,
  tickLabel,
  running,
  runResult,
  onDismissResult,
  unackedAlertCount,
}: ModelCardProps) {
  const cfg = statusConfig[model.status];
  const isSmart = SMART_MODELS.has(model.model_key);
  const [editMode, setEditMode] = useState(false);
  const hasAlert = unackedAlertCount > 0;

  // Reset edit mode when card collapses
  useEffect(() => {
    if (!isSelected) setEditMode(false);
  }, [isSelected]);

  // "recently learned" = last_learned_at within the last hour
  const recentlyLearned = model.last_learned_at
    ? (Date.now() - new Date(model.last_learned_at).getTime()) < 3600_000
    : false;

  return (
    <div
      onClick={() => onSelect(model.id)}
      className={`bg-white rounded-xl border transition-all duration-300 cursor-pointer hover:-translate-y-0.5 ${
        hasAlert
          ? `border-rose-200 ring-2 ring-rose-50 ${isSelected ? 'ring-rose-100' : ''}`
          : isSelected
          ? `border-teal-200 ${cfg.ring}`
          : 'border-slate-100 hover:border-slate-200'
      }`}
    >
      <div className="p-5">
        {/* Alert active banner — only when alerts pending */}
        {hasAlert && (
          <div className="flex items-center justify-between px-3 py-1.5 mb-3 bg-rose-50 border border-rose-100 rounded-lg">
            <div className="flex items-center space-x-2">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse inline-block"></span>
              <span className="text-xs font-bold text-rose-700">
                {unackedAlertCount} unacknowledged alert{unackedAlertCount !== 1 ? 's' : ''} in feed
              </span>
            </div>
            <i className="ri-alarm-warning-line text-rose-400 text-sm"></i>
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className={`w-10 h-10 flex items-center justify-center rounded-xl border ${
              hasAlert ? 'bg-rose-50 border-rose-200'
              : model.status === 'running' ? 'bg-teal-50 border-teal-100'
              : model.status === 'training' ? 'bg-amber-50 border-amber-100'
              : 'bg-slate-50 border-slate-100'
            }`}>
              <i className={`${model.icon} text-lg ${
                hasAlert ? 'text-rose-500'
                : model.status === 'running' ? 'text-teal-600'
                : model.status === 'training' ? 'text-amber-600'
                : 'text-slate-500'
              }`}></i>
            </div>
            <div>
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <h4 className="text-sm font-bold text-slate-900 leading-tight">{model.name}</h4>
                {recentlyLearned && (
                  <span className="flex items-center space-x-1 text-xs px-1.5 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full font-semibold whitespace-nowrap">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block"></span>
                    <span>New learning</span>
                  </span>
                )}
                {isSmart && (
                  <span className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full font-medium whitespace-nowrap">
                    <i className="ri-flashlight-line mr-1"></i>Edge Fn
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-1.5 mt-0.5">
                <span className="text-xs text-slate-400">{model.category}</span>
                {model.alert_count > 0 && (
                  <span className="text-xs font-bold px-1.5 py-0.5 bg-rose-100 text-rose-600 rounded-full">
                    {model.alert_count} alerts
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Status badge + alert count pill stacked */}
          <div className="flex flex-col items-end space-y-1.5 flex-shrink-0">
            <div className="flex items-center space-x-1.5">
              <div className={`w-2 h-2 rounded-full ${hasAlert ? 'bg-rose-500 animate-pulse' : cfg.dot}`}></div>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${hasAlert ? 'bg-rose-100 text-rose-700' : cfg.badge}`}>
                {hasAlert ? 'Alert Active' : cfg.label}
              </span>
            </div>
            {hasAlert && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${cfg.badge}`}>
                {cfg.label}
              </span>
            )}
          </div>
        </div>

          {/* Reliability bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center space-x-2">
              <span className="text-xs text-slate-500">
                {isSmart ? 'Signal Reliability' : 'Derived Signal Strength'}
              </span>
              {model.prediction_confidence != null && (
                <span className="text-xs text-slate-400">
                  · {model.prediction_confidence.toFixed(1)}% confidence
                </span>
              )}
            </div>
            <span className="text-sm font-bold text-teal-600 tabular-nums">
              {model.accuracy.toFixed(1)}%
            </span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                model.accuracy >= 88 ? 'bg-gradient-to-r from-teal-400 to-teal-600'
                : model.accuracy >= 80 ? 'bg-gradient-to-r from-amber-400 to-amber-500'
                : 'bg-gradient-to-r from-rose-400 to-rose-500'
              }`}
              style={{ width: `${model.accuracy}%` }}
            ></div>
          </div>
        </div>

        {/* Prediction */}
        <div className="flex items-start space-x-2 p-3 bg-slate-50 rounded-lg mb-3">
          <i className="ri-sparkling-2-line text-teal-500 text-sm mt-0.5 flex-shrink-0"></i>
          <p className="text-xs font-medium text-slate-700 leading-relaxed">
            {model.predictions ?? 'No active prediction'}
          </p>
        </div>

        {/* Footer row */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center space-x-1.5 text-emerald-600">
            <i className="ri-arrow-up-circle-line text-sm"></i>
            <span className="font-medium">{model.impact ?? '—'}</span>
          </div>
          <div className="flex items-center space-x-3 text-slate-400 tabular-nums">
            {model.learn_count > 0 && (
              <span className="flex items-center space-x-1 text-emerald-600 font-medium">
                <i className="ri-loop-left-line text-xs"></i>
                <span>{model.learn_count} case{model.learn_count !== 1 ? 's' : ''} learned</span>
              </span>
            )}
            <span>{model.run_count_today} runs today</span>
            <span>{tickLabel}</span>
          </div>
        </div>

        {/* Expanded detail */}
        {isSelected && (
          <>
            {editMode ? (
              <EditModelPanel
                model={model}
                onSave={onSaveEdit}
                onCancel={() => setEditMode(false)}
              />
            ) : (
              <div className="mt-4 pt-4 border-t border-slate-100">
                {/* Alert feed link strip when expanded */}
                {hasAlert && (
                  <div className="flex items-center space-x-2 px-3 py-2 mb-4 bg-rose-50 border border-rose-100 rounded-lg">
                    <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></div>
                    <p className="text-xs font-semibold text-rose-700">
                      {unackedAlertCount} active alert{unackedAlertCount !== 1 ? 's' : ''} — check the Real-Time Feed to acknowledge
                    </p>
                  </div>
                )}

                <p className="text-xs text-slate-600 leading-relaxed mb-4">
                  {model.description ?? 'No description available.'}
                </p>

                {model.features.length > 0 && (
                  <>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                      Input Features
                    </p>
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {model.features.map((f, i) => (
                        <span
                          key={i}
                          className="text-xs px-2 py-1 bg-teal-50 text-teal-700 rounded-lg font-medium border border-teal-100 whitespace-nowrap"
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  </>
                )}

                {model.learn_count > 0 && (
                  <div className="flex items-center space-x-3 p-3 bg-emerald-50 border border-emerald-100 rounded-lg mb-4">
                    <div className="w-7 h-7 flex items-center justify-center bg-emerald-100 rounded-lg flex-shrink-0">
                      <i className="ri-loop-left-line text-emerald-600 text-sm"></i>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-emerald-800">
                        {model.learn_count} resolved case{model.learn_count !== 1 ? 's' : ''} learned
                      </p>
                      {model.last_learned_at && (
                        <p className="text-xs text-emerald-600 mt-0.5">
                          Last fed {formatLastRun(model.last_learned_at)} via Decision Support
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center space-x-2 flex-wrap gap-y-1.5">
                    {model.status === 'running' && (
                      <button
                        onClick={() => onRunCheck(model)}
                        disabled={running}
                        className="flex items-center space-x-1.5 px-3 py-1.5 bg-teal-600 text-white text-xs font-semibold rounded-lg hover:bg-teal-700 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60"
                      >
                        {running ? (
                          <>
                            <i className="ri-loader-4-line text-xs animate-spin"></i>
                            <span>{isSmart ? 'Calling function...' : 'Running...'}</span>
                          </>
                        ) : (
                          <>
                            <i className={`${isSmart ? 'ri-flashlight-line' : 'ri-play-circle-line'} text-xs`}></i>
                            <span>{isSmart ? 'Run Prediction Check' : 'Run Check Now'}</span>
                          </>
                        )}
                      </button>
                    )}
                    <button
                      onClick={() => onTogglePause(model)}
                      disabled={running}
                      className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60 ${
                        model.status === 'paused'
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      <i className={`${model.status === 'paused' ? 'ri-play-line' : 'ri-pause-line'} text-xs`}></i>
                      <span>{model.status === 'paused' ? 'Enable' : 'Pause'}</span>
                    </button>

                    {/* Edit button */}
                    <button
                      onClick={() => setEditMode(true)}
                      disabled={running}
                      className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60"
                    >
                      <i className="ri-edit-2-line text-xs"></i>
                      <span>Edit</span>
                    </button>
                  </div>

                  {isSmart && !runResult && model.status === 'running' && (
                    <p className="text-xs text-slate-400 pl-0.5">
                      <i className="ri-information-line mr-1"></i>
                      Calls a live edge check using current domain snapshots, feed state, and learned case history
                    </p>
                  )}

                  {runResult && (
                    <RunResultPanel result={runResult} onDismiss={onDismissResult} />
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function CPIIntelligenceModels() {
  const { organizationId } = useAuth();
  const [models, setModels] = useState<CPIModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [tickLabels, setTickLabels] = useState<Record<string, string>>({});
  const [heartbeatActive, setHeartbeatActive] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [runResults, setRunResults] = useState<Record<string, RunResult>>({});
  const [unackedByCategory, setUnackedByCategory] = useState<Record<string, number>>({});
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const modelsRef = useRef<CPIModel[]>([]);

  useEffect(() => { modelsRef.current = models; }, [models]);

  // ── Fetch models ─────────────────────────────────────────────────────────
  const fetchModels = useCallback(async () => {
    const { data, error } = await supabase
      .from('cpi_models')
      .select('*')
      .order('created_at', { ascending: true });

    if (!error && data) {
      let rows = data.map((r) => ({
        ...r,
        features: Array.isArray(r.features) ? r.features : [],
        accuracy: parseFloat(r.accuracy),
        prediction_confidence: r.prediction_confidence != null
          ? parseFloat(r.prediction_confidence)
          : null,
        learn_count: r.learn_count ?? 0,
        last_learned_at: r.last_learned_at ?? null,
      })) as CPIModel[];

      if (organizationId) {
        const { data: metricRows, error: metricsError } = await supabase
          .from('metrics')
          .select('id, name, unit, current_value, target_value')
          .eq('organization_id', organizationId)
          .in('name', LIVE_METRIC_PRIORITY);

        if (!metricsError && metricRows && metricRows.length > 0) {
          const metricIds = metricRows.map((metric) => metric.id);
          const { data: pointRows, error: pointsError } = await supabase
            .from('metric_data')
            .select('metric_id, value, timestamp')
            .in('metric_id', metricIds)
            .order('timestamp', { ascending: false })
            .limit(500);

          if (!pointsError) {
            rows = overlayLiveModelSignals(rows, metricRows as MetricRecord[], (pointRows as MetricPointRecord[]) || []);
          }
        }
      }
      setModels(rows);
    }
    setLoading(false);
  }, [organizationId]);

  // ── Fetch unacked counts per feed category ───────────────────────────────
  const fetchUnackedCounts = useCallback(async () => {
    const { data } = await supabase
      .from('cpi_feed')
      .select('category')
      .eq('acknowledged', false);

    if (data) {
      const counts: Record<string, number> = {};
      data.forEach((item: { category: string }) => {
        counts[item.category] = (counts[item.category] ?? 0) + 1;
      });
      setUnackedByCategory(counts);
    }
  }, []);

  // ── Tick labels (updates every 10s without hitting DB) ───────────────────
  const rebuildTicks = useCallback((rows: CPIModel[]) => {
    const labels: Record<string, string> = {};
    rows.forEach((m) => {
      labels[m.id] = `Last run: ${formatLastRun(m.last_run_at)}`;
    });
    setTickLabels(labels);
  }, []);

  useEffect(() => {
    fetchModels();
    fetchUnackedCounts();
  }, [fetchModels, fetchUnackedCounts]);

  useEffect(() => {
    if (models.length === 0) return;
    rebuildTicks(models);
    tickRef.current = setInterval(() => rebuildTicks(modelsRef.current), 5_000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [models, rebuildTicks]);

  // ── Live refresh pulse ───────────────────────────────────────────────────
  useEffect(() => {
    const runRefresh = async () => {
      setHeartbeatActive(true);
      await fetchModels();
      setTimeout(() => setHeartbeatActive(false), 900);
    };
    const initialDelay = setTimeout(runRefresh, 3_000);
    heartbeatRef.current = setInterval(runRefresh, 60_000);
    return () => {
      clearTimeout(initialDelay);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [fetchModels]);

  // ── Real-time: models subscription ──────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('cpi_models_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cpi_models' },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            const updated = payload.new as CPIModel;
            const normalized: CPIModel = {
              ...updated,
              features: Array.isArray(updated.features) ? updated.features : [],
              accuracy: parseFloat(String(updated.accuracy)),
              prediction_confidence:
                updated.prediction_confidence != null
                  ? parseFloat(String(updated.prediction_confidence))
                  : null,
            };
            setModels((prev) =>
              prev.map((m) => (m.id === normalized.id ? normalized : m))
            );
          } else if (payload.eventType === 'INSERT') {
            fetchModels();
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchModels]);

  // ── Real-time: feed subscription for unacked counts ──────────────────────
  useEffect(() => {
    const feedChannel = supabase
      .channel('cpi_feed_for_models_badge')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cpi_feed' },
        () => {
          // Refetch lightweight count on any feed change
          fetchUnackedCounts();
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(feedChannel); };
  }, [fetchUnackedCounts]);

  // ── Run Check — smart dispatch ───────────────────────────────────────────
  const handleRunCheck = useCallback(async (model: CPIModel) => {
    setActingId(model.id);
    const t0 = Date.now();

    try {
      let result: Partial<RunResult> = {};

      if (model.model_key === 'ed-surge') {
        const { data, error } = await supabase.functions.invoke('cpi-ed-surge-check', {
          body: { action: 'check' },
        });
        if (error) throw new Error(error.message);
        result = data ?? {};
      } else if (model.model_key === 'readmission') {
        const { data, error } = await supabase.functions.invoke('cpi-readmission-check', {
          body: { action: 'model_check' },
        });
        if (error) throw new Error(error.message);
        result = data ?? {};
      } else if (model.model_key === 'lab-escalation' || model.model_key === 'lab') {
        const { data, error } = await supabase.functions.invoke('cpi-lab-escalation-check', {
          body: { action: 'model_check' },
        });
        if (error) throw new Error(error.message);
        result = data ?? {};
      } else {
        await supabase.from('cpi_models').update({
          last_run_at: new Date().toISOString(),
          run_count_today: model.run_count_today + 1,
          updated_at: new Date().toISOString(),
        }).eq('id', model.id);
        await fetchModels();
        result = {
          success: true,
          alert_fired: false,
          message: model.predictions ?? 'Model check completed using the latest healthcare KPI inputs.',
          display_metrics: [
            { label: 'Accuracy', value: `${model.accuracy.toFixed(1)}%` },
            { label: 'Confidence', value: model.prediction_confidence != null ? `${model.prediction_confidence.toFixed(1)}%` : '—' },
          ],
        };
      }

      const finalResult: RunResult = {
        success: result.success ?? true,
        alert_fired: result.alert_fired ?? false,
        severity: result.severity,
        risk_score: result.risk_score,
        prediction: result.prediction,
        display_metrics: result.display_metrics,
        message: result.message ?? 'Check completed.',
        error: result.error,
        latency_ms: Date.now() - t0,
        timestamp: new Date().toISOString(),
      };

      setRunResults((prev) => ({ ...prev, [model.id]: finalResult }));

      setTimeout(() => {
        setRunResults((prev) => {
          const next = { ...prev };
          delete next[model.id];
          return next;
        });
      }, 90_000);

    } catch (err) {
      setRunResults((prev) => ({
        ...prev,
        [model.id]: {
          success: false,
          alert_fired: false,
          message: err instanceof Error ? err.message : 'Unknown error',
          latency_ms: Date.now() - t0,
          timestamp: new Date().toISOString(),
        },
      }));
    }

    setActingId(null);
  }, [fetchModels]);

  // ── Toggle pause ─────────────────────────────────────────────────────────
  const handleTogglePause = useCallback(async (model: CPIModel) => {
    setActingId(model.id);
    const newStatus: CPIModel['status'] = model.status === 'paused' ? 'running' : 'paused';
    await supabase.from('cpi_models').update({
      status: newStatus,
      updated_at: new Date().toISOString(),
    }).eq('id', model.id);
    setActingId(null);
  }, []);

  // ── Save edit ────────────────────────────────────────────────────────────
  const handleSaveEdit = useCallback(async (id: string, updates: ModelEditFields) => {
    await supabase.from('cpi_models').update({
      predictions: updates.predictions.trim() || null,
      impact: updates.impact.trim() || null,
      description: updates.description.trim() || null,
      features: updates.features,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
  }, []);

  const dismissResult = useCallback((modelId: string) => {
    setRunResults((prev) => {
      const next = { ...prev };
      delete next[modelId];
      return next;
    });
  }, []);

  // ── Stats ────────────────────────────────────────────────────────────────
  const runningCount = models.filter((m) => m.status === 'running').length;
  const trainingCount = models.filter((m) => m.status === 'training').length;
  const totalRunsToday = models.reduce((s, m) => s + m.run_count_today, 0);
  const avgAccuracy = models.length > 0
    ? (models.reduce((s, m) => s + m.accuracy, 0) / models.length).toFixed(1)
    : '—';
  const totalAlerts = models.reduce((s, m) => s + m.alert_count, 0);
  const totalLearnCount = models.reduce((s, m) => s + m.learn_count, 0);
  const totalFeedAlerts = Object.values(unackedByCategory).reduce((s, n) => s + n, 0);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Healthcare Intelligence Models</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Clinical prediction models aligned to live healthcare operations data
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {/* Heartbeat indicator */}
          <div className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border transition-all duration-500 ${
            heartbeatActive
              ? 'bg-teal-100 border-teal-300'
              : 'bg-teal-50 border-teal-100'
          }`}>
            <div className={`w-2 h-2 rounded-full bg-teal-500 ${heartbeatActive ? 'scale-125' : 'animate-pulse'} transition-transform duration-200`}></div>
            <span className="text-xs font-semibold text-teal-700 whitespace-nowrap">
              {heartbeatActive ? 'Refreshing...' : 'Live refresh'}
            </span>
          </div>
          {trainingCount > 0 && (
            <div className="flex items-center space-x-1.5 px-3 py-1.5 bg-amber-50 border border-amber-100 rounded-lg">
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></div>
              <span className="text-xs font-semibold text-amber-700">{trainingCount} training</span>
            </div>
          )}
          <div className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-100 rounded-lg">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-xs font-semibold text-emerald-700">{runningCount} models live</span>
          </div>
          {totalFeedAlerts > 0 && (
            <div className="flex items-center space-x-1.5 px-3 py-1.5 bg-rose-50 border border-rose-200 rounded-lg">
              <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></div>
              <span className="text-xs font-bold text-rose-700">{totalFeedAlerts} feed alert{totalFeedAlerts !== 1 ? 's' : ''}</span>
            </div>
          )}
          <div className="px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-lg">
            <span className="text-xs font-semibold text-slate-600 tabular-nums">{totalRunsToday.toLocaleString()} runs today</span>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-teal-600 text-white text-xs font-semibold rounded-lg hover:bg-teal-700 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-add-line text-sm"></i>
            <span>Add Model</span>
          </button>
        </div>
      </div>

      {/* Summary strip */}
      {!loading && models.length > 0 && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Avg Accuracy',     value: `${avgAccuracy}%`,                  icon: 'ri-line-chart-line',   color: 'text-teal-600' },
            { label: 'Models Running',   value: String(runningCount),               icon: 'ri-cpu-line',          color: 'text-emerald-600' },
            { label: 'Total Runs Today', value: totalRunsToday.toLocaleString(),    icon: 'ri-loop-right-line',   color: 'text-slate-700' },
            {
              label: totalLearnCount > 0 ? 'Cases Learned' : 'Active Alerts',
              value: String(totalLearnCount > 0 ? totalLearnCount : totalAlerts),
              icon: totalLearnCount > 0 ? 'ri-loop-left-line' : 'ri-alarm-warning-line',
              color: totalLearnCount > 0 ? 'text-emerald-600' : (totalAlerts > 0 ? 'text-rose-500' : 'text-slate-400'),
            },
          ].map((stat, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-100 px-4 py-3 flex items-center space-x-3">
              <div className="w-8 h-8 flex items-center justify-center bg-slate-50 rounded-lg">
                <i className={`${stat.icon} text-sm ${stat.color}`}></i>
              </div>
              <div>
                <div className={`text-lg font-bold tabular-nums ${stat.color}`}>{stat.value}</div>
                <div className="text-xs text-slate-400">{stat.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Model grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => <ModelSkeleton key={i} />)
          : models.map((model) => {
              const feedCategory = MODEL_KEY_TO_FEED_CATEGORY[model.model_key];
              const unackedAlertCount = feedCategory ? (unackedByCategory[feedCategory] ?? 0) : 0;
              return (
                <ModelCard
                  key={model.id}
                  model={model}
                  isSelected={selected === model.id}
                  onSelect={(id) => setSelected(selected === id ? null : id)}
                  onRunCheck={handleRunCheck}
                  onTogglePause={handleTogglePause}
                  onSaveEdit={handleSaveEdit}
                  tickLabel={tickLabels[model.id] ?? `Last run: ${formatLastRun(model.last_run_at)}`}
                  running={actingId === model.id}
                  runResult={runResults[model.id]}
                  onDismissResult={() => dismissResult(model.id)}
                  unackedAlertCount={unackedAlertCount}
                />
              );
            })}
      </div>

      {!loading && models.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 flex items-center justify-center bg-slate-100 rounded-2xl mb-4">
            <i className="ri-brain-line text-2xl text-slate-400"></i>
          </div>
          <p className="text-sm font-semibold text-slate-600 mb-1">No models found</p>
          <p className="text-xs text-slate-400">Models will appear here once registered in the cpi_models table</p>
        </div>
      )}

      {/* Live data note */}
      {!loading && models.length > 0 && (
        <div className="mt-4 flex items-center space-x-2 px-4 py-2.5 bg-teal-50 border border-teal-100 rounded-xl">
          <div className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse flex-shrink-0"></div>
          <p className="text-xs text-teal-700">
            <strong>Live monitoring active</strong> — <strong>ED Surge</strong>, <strong>Lab Escalation</strong>, and <strong>Readmission</strong> invoke dedicated Supabase edge checks that recompute from live domain snapshots, feed pressure, and learned case history. The remaining cards are explicitly <strong>derived</strong> from the imported healthcare KPI layer rather than separate predictive services.
            All cards receive real-time alert badges from the feed, refresh against the latest operational metrics, and incorporate resolved decision cases as feedback through the full Sense → Analyze → Decide → Act → <strong>Learn</strong> loop.
          </p>
        </div>
      )}

      {/* Add Model Modal */}
      {showAddModal && (
        <AddModelModal
          onClose={() => setShowAddModal(false)}
          onAdded={fetchModels}
        />
      )}
    </div>
  );
}
