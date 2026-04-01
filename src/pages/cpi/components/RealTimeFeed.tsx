import { useState, useEffect, useCallback, useRef } from 'react';
import { useCPIData, CPIFeedItem } from '../../../hooks/useCPIData';
import { supabase } from '../../../lib/supabase';

// ─── Config ───────────────────────────────────────────────────────────────────

const severityConfig = {
  critical: {
    bg: 'bg-rose-50',
    border: 'border-l-rose-500',
    badge: 'bg-rose-100 text-rose-700',
    action: 'bg-rose-600 hover:bg-rose-700 text-white',
    icon: 'text-rose-500',
  },
  warning: {
    bg: 'bg-amber-50',
    border: 'border-l-amber-500',
    badge: 'bg-amber-100 text-amber-700',
    action: 'bg-amber-600 hover:bg-amber-700 text-white',
    icon: 'text-amber-500',
  },
  info: {
    bg: 'bg-teal-50',
    border: 'border-l-teal-500',
    badge: 'bg-teal-100 text-teal-700',
    action: 'bg-teal-600 hover:bg-teal-700 text-white',
    icon: 'text-teal-500',
  },
};

const sourceConfig: Record<string, {
  label: string; color: string; dot: string; iconBg: string;
  badgeBg: string; borderColor: string; silenceHover: string;
  divider: string; confirmText: string; confirmBtn: string;
}> = {
  ed: {
    label: 'ED Surge',
    color: 'bg-rose-100 text-rose-700 border border-rose-200',
    dot: 'bg-rose-500',
    iconBg: 'bg-rose-50',
    badgeBg: 'bg-rose-50 border-rose-100',
    borderColor: 'border-rose-200',
    silenceHover: 'hover:bg-rose-100 text-rose-600',
    divider: 'border-rose-200',
    confirmText: 'text-rose-700',
    confirmBtn: 'bg-rose-500 hover:bg-rose-600',
  },
  readmission: {
    label: 'Readmission',
    color: 'bg-amber-100 text-amber-700 border border-amber-200',
    dot: 'bg-amber-500',
    iconBg: 'bg-amber-50',
    badgeBg: 'bg-amber-50 border-amber-100',
    borderColor: 'border-amber-200',
    silenceHover: 'hover:bg-amber-100 text-amber-600',
    divider: 'border-amber-200',
    confirmText: 'text-amber-700',
    confirmBtn: 'bg-amber-500 hover:bg-amber-600',
  },
  lab: {
    label: 'Lab',
    color: 'bg-violet-100 text-violet-700 border border-violet-200',
    dot: 'bg-violet-500',
    iconBg: 'bg-violet-50',
    badgeBg: 'bg-violet-50 border-violet-100',
    borderColor: 'border-violet-200',
    silenceHover: 'hover:bg-violet-100 text-violet-600',
    divider: 'border-violet-200',
    confirmText: 'text-violet-700',
    confirmBtn: 'bg-violet-500 hover:bg-violet-600',
  },
};

function getSourceConfig(category: string) {
  return sourceConfig[category] ?? {
    label: category.charAt(0).toUpperCase() + category.slice(1),
    color: 'bg-slate-100 text-slate-600 border border-slate-200',
    dot: 'bg-slate-400',
    iconBg: 'bg-slate-50',
    badgeBg: 'bg-slate-50 border-slate-100',
    borderColor: 'border-slate-200',
    silenceHover: 'hover:bg-slate-100 text-slate-500',
    divider: 'border-slate-200',
    confirmText: 'text-slate-700',
    confirmBtn: 'bg-slate-500 hover:bg-slate-600',
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function timeAgo(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

// ─── SilenceButton ────────────────────────────────────────────────────────────

interface SilenceButtonProps {
  count: number;
  category: string;
  silencing: boolean;
  onSilence: () => Promise<void>;
  compact?: boolean;
}

function SilenceButton({ count, category, silencing, onSilence, compact = false }: SilenceButtonProps) {
  const src = getSourceConfig(category);
  const [confirmMode, setConfirmMode] = useState(false);
  const [silenced, setSilenced] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset silenced flash when new alerts arrive
  useEffect(() => {
    if (count > 0) setSilenced(false);
  }, [count]);

  // Auto-cancel confirm after 4s
  const startTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setConfirmMode(false), 4000);
  };

  const handleFirstClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (silencing || count === 0) return;
    setConfirmMode(true);
    startTimer();
  };

  const handleConfirm = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (timerRef.current) clearTimeout(timerRef.current);
    setConfirmMode(false);
    await onSilence();
    setSilenced(true);
    setTimeout(() => setSilenced(false), 3500);
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (timerRef.current) clearTimeout(timerRef.current);
    setConfirmMode(false);
  };

  if (silenced) {
    return (
      <span className={`flex items-center space-x-1 text-xs font-semibold text-emerald-600 ${compact ? 'px-1.5' : 'px-2.5 py-1.5'}`}>
        <i className="ri-check-double-line text-xs"></i>
        <span>Silenced</span>
      </span>
    );
  }

  if (confirmMode) {
    return (
      <div className="flex items-center space-x-1.5 px-2 py-1">
        <span className={`text-xs font-semibold whitespace-nowrap ${src.confirmText}`}>
          Silence {count}?
        </span>
        <button
          onClick={handleConfirm}
          className={`w-5 h-5 flex items-center justify-center text-white rounded text-xs cursor-pointer transition-colors ${src.confirmBtn}`}
        >
          <i className="ri-check-line"></i>
        </button>
        <button
          onClick={handleCancel}
          className="w-5 h-5 flex items-center justify-center bg-slate-200 hover:bg-slate-300 text-slate-600 rounded text-xs cursor-pointer transition-colors"
        >
          <i className="ri-close-line"></i>
        </button>
      </div>
    );
  }

  if (silencing) {
    return (
      <span className={`flex items-center space-x-1 text-xs text-slate-500 ${compact ? 'px-1.5' : 'px-2.5 py-1.5'}`}>
        <i className="ri-loader-4-line text-xs animate-spin"></i>
        <span>Silencing…</span>
      </span>
    );
  }

  return (
    <button
      onClick={handleFirstClick}
      disabled={count === 0}
      className={`flex items-center space-x-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap disabled:opacity-30 disabled:cursor-not-allowed ${src.silenceHover} ${compact ? 'px-1.5 py-0.5' : 'px-2.5 py-1.5'}`}
    >
      <i className="ri-volume-mute-line text-xs"></i>
      <span>{compact ? `Silence ${count}` : `Silence all ${count}`}</span>
    </button>
  );
}

// ─── SourceBadge ─────────────────────────────────────────────────────────────

interface SourceBadgeProps {
  category: string;
  icon: string;
  unacked: number;
  total: number;
  silencing: boolean;
  onSilence: () => Promise<void>;
}

function SourceBadge({ category, icon, unacked, total, silencing, onSilence }: SourceBadgeProps) {
  const src = getSourceConfig(category);
  return (
    <div className={`flex items-center rounded-lg border overflow-hidden ${src.badgeBg}`}>
      {/* Left: label + count */}
      <div className="flex items-center space-x-1.5 px-2.5 py-1.5">
        <i className={`${icon} text-xs`} style={{ color: 'inherit' }}></i>
        <span className="text-xs font-semibold" style={{ color: 'inherit' }}>
          {src.label}
        </span>
        {unacked > 0 ? (
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center ${src.confirmBtn.replace('hover:bg-', '').split(' ')[0]} text-white`}>
            {unacked}
          </span>
        ) : (
          <span className="text-xs font-medium opacity-60">{total}</span>
        )}
      </div>
      {/* Right: silence button, only when unacked > 0 */}
      {unacked > 0 && (
        <div className={`border-l ${src.divider} flex-shrink-0`}>
          <SilenceButton
            count={unacked}
            category={category}
            silencing={silencing}
            onSilence={onSilence}
            compact
          />
        </div>
      )}
    </div>
  );
}

// ─── QuickFireButton ──────────────────────────────────────────────────────────

interface FireResult {
  success: boolean;
  alert_fired: boolean;
  message: string;
  risk_score?: number;
  severity?: string;
}

interface QuickFireButtonProps {
  label: string;
  icon: string;
  color: string;
  firing: boolean;
  lastFired: Date | null;
  lastResult: FireResult | null;
  onFire: () => void;
}

function QuickFireButton({ label, icon, color, firing, lastFired, lastResult, onFire }: QuickFireButtonProps) {
  const [showResult, setShowResult] = useState(false);

  useEffect(() => {
    if (lastResult) {
      setShowResult(true);
      const t = setTimeout(() => setShowResult(false), 5000);
      return () => clearTimeout(t);
    }
  }, [lastResult]);

  return (
    <div className="flex flex-col items-end space-y-1">
      <button
        onClick={onFire}
        disabled={firing}
        className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap disabled:opacity-60 ${color}`}
      >
        {firing ? (
          <>
            <i className="ri-loader-4-line text-xs animate-spin"></i>
            <span>Firing…</span>
          </>
        ) : (
          <>
            <i className={`${icon} text-xs`}></i>
            <span>{label}</span>
          </>
        )}
      </button>
      {lastFired && !showResult && (
        <span className="text-xs text-slate-400">{timeAgo(lastFired)}</span>
      )}
      {showResult && lastResult && (
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
          !lastResult.success
            ? 'bg-rose-100 text-rose-700'
            : lastResult.alert_fired
              ? lastResult.severity === 'critical' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
              : 'bg-teal-100 text-teal-700'
        }`}>
          {!lastResult.success ? 'Error' : lastResult.alert_fired ? 'Alert fired!' : 'Monitoring active'}
        </span>
      )}
    </div>
  );
}

// ─── FeedCard ─────────────────────────────────────────────────────────────────

function FeedCard({ item, onAcknowledge, isNew }: {
  item: CPIFeedItem;
  onAcknowledge: (id: string) => void;
  isNew: boolean;
}) {
  const cfg = severityConfig[item.severity] ?? severityConfig.info;
  const src = getSourceConfig(item.category);
  const [acknowledging, setAcknowledging] = useState(false);

  const handleAck = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setAcknowledging(true);
    await onAcknowledge(item.id);
    setAcknowledging(false);
  }, [item.id, onAcknowledge]);

  return (
    <div className={`px-5 py-4 border-l-4 transition-all duration-500 ${cfg.border} ${
      item.acknowledged ? 'bg-white opacity-55' : cfg.bg
    } ${isNew ? 'ring-1 ring-teal-300/40' : ''}`}>
      <div className="flex items-start space-x-3">
        <div className={`w-8 h-8 flex items-center justify-center rounded-lg border border-slate-100 flex-shrink-0 ${cfg.icon} ${src.iconBg}`}>
          <i className={`${item.icon} text-sm`}></i>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center flex-wrap gap-1.5 mb-1">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cfg.badge}`}>
              {item.severity.toUpperCase()}
            </span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex items-center space-x-1 ${src.color}`}>
              <span className={`w-1 h-1 rounded-full ${src.dot} inline-block`}></span>
              <span>{src.label}</span>
            </span>
            <span className="text-xs text-slate-400 font-mono">{formatTime(item.created_at)}</span>
            {item.acknowledged && (
              <span className="text-xs text-slate-400 flex items-center space-x-0.5">
                <i className="ri-check-line text-xs"></i>
                <span>Acknowledged</span>
              </span>
            )}
            {isNew && !item.acknowledged && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 flex items-center space-x-0.5">
                <span className="w-1 h-1 rounded-full bg-teal-500 animate-pulse inline-block"></span>
                <span>NEW</span>
              </span>
            )}
          </div>
          <h4 className="text-sm font-semibold text-slate-900 mb-1">{item.title}</h4>
          <p className="text-xs text-slate-600 leading-relaxed mb-2">{item.body}</p>
          {!item.acknowledged && (
            <div className="flex items-center space-x-2">
              <button
                onClick={handleAck}
                disabled={acknowledging}
                className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${cfg.action} disabled:opacity-60`}
              >
                <i className="ri-flashlight-line text-xs"></i>
                <span>{acknowledging ? 'Acting...' : item.action_label}</span>
              </button>
              <button
                onClick={handleAck}
                disabled={acknowledging}
                className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60"
              >
                Acknowledge
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── GlobalSilenceButton ──────────────────────────────────────────────────────

interface GlobalSilenceButtonProps {
  count: number;
  silencing: boolean;
  onSilence: () => Promise<void>;
}

function GlobalSilenceButton({ count, silencing, onSilence }: GlobalSilenceButtonProps) {
  const [confirmMode, setConfirmMode] = useState(false);
  const [silenced, setSilenced] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (count > 0) setSilenced(false);
  }, [count]);

  const handleFirstClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (silencing || count === 0) return;
    setConfirmMode(true);
    timerRef.current = setTimeout(() => setConfirmMode(false), 4000);
  };

  const handleConfirm = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (timerRef.current) clearTimeout(timerRef.current);
    setConfirmMode(false);
    await onSilence();
    setSilenced(true);
    setTimeout(() => setSilenced(false), 3500);
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (timerRef.current) clearTimeout(timerRef.current);
    setConfirmMode(false);
  };

  if (silenced) {
    return (
      <span className="text-xs font-semibold text-emerald-600 flex items-center space-x-1 px-2 py-0.5">
        <i className="ri-check-double-line text-xs"></i>
        <span>All silenced</span>
      </span>
    );
  }

  if (confirmMode) {
    return (
      <div className="flex items-center space-x-1.5">
        <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">
          Silence all {count}?
        </span>
        <button
          onClick={handleConfirm}
          className="w-5 h-5 flex items-center justify-center bg-slate-700 hover:bg-slate-900 text-white rounded text-xs cursor-pointer transition-colors"
        >
          <i className="ri-check-line"></i>
        </button>
        <button
          onClick={handleCancel}
          className="w-5 h-5 flex items-center justify-center bg-slate-200 hover:bg-slate-300 text-slate-600 rounded text-xs cursor-pointer transition-colors"
        >
          <i className="ri-close-line"></i>
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleFirstClick}
      disabled={silencing || count === 0}
      className="flex items-center space-x-1.5 px-2.5 py-1 text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-full transition-colors cursor-pointer whitespace-nowrap disabled:opacity-40"
    >
      {silencing ? (
        <>
          <i className="ri-loader-4-line text-xs animate-spin"></i>
          <span>Silencing…</span>
        </>
      ) : (
        <>
          <i className="ri-volume-mute-line text-xs"></i>
          <span>Silence all {count}</span>
        </>
      )}
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type SeverityFilter = 'all' | 'critical' | 'warning' | 'info';
type SourceFilter = 'all' | 'ed' | 'readmission' | 'lab' | 'other';

const KNOWN_SOURCES: Array<{ id: SourceFilter; label: string; dot: string }> = [
  { id: 'all', label: 'All', dot: '' },
  { id: 'ed', label: 'ED Surge', dot: 'bg-rose-500' },
  { id: 'readmission', label: 'Readmission', dot: 'bg-amber-500' },
  { id: 'lab', label: 'Lab', dot: 'bg-violet-500' },
  { id: 'other', label: 'Other', dot: 'bg-slate-400' },
];

export default function RealTimeFeed() {
  const { feed, loadingFeed, acknowledgeFeedItem, silenceFeedCategory } = useCPIData();
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const newIdsRef = useRef<Set<string>>(new Set());
  const prevFeedLengthRef = useRef(0);

  // Silence tracking
  const [silencingCategory, setSilencingCategory] = useState<string | null>(null);
  const [silencingAll, setSilencingAll] = useState(false);

  // Quick-fire state
  const [firingEd, setFiringEd] = useState(false);
  const [firingReadmission, setFiringReadmission] = useState(false);
  const [firingLab, setFiringLab] = useState(false);
  const [lastEdFired, setLastEdFired] = useState<Date | null>(null);
  const [lastReadmissionFired, setLastReadmissionFired] = useState<Date | null>(null);
  const [lastLabFired, setLastLabFired] = useState<Date | null>(null);
  const [edResult, setEdResult] = useState<FireResult | null>(null);
  const [readmissionResult, setReadmissionResult] = useState<FireResult | null>(null);
  const [labResult, setLabResult] = useState<FireResult | null>(null);

  // Track newly inserted items
  useEffect(() => {
    if (feed.length > prevFeedLengthRef.current) {
      const added = feed.slice(0, feed.length - prevFeedLengthRef.current);
      added.forEach(item => newIdsRef.current.add(item.id));
      setTimeout(() => {
        added.forEach(item => newIdsRef.current.delete(item.id));
      }, 8000);
    }
    prevFeedLengthRef.current = feed.length;
  }, [feed]);

  // ── Silence handlers ─────────────────────────────────────────────────────
  const handleSilenceCategory = useCallback(async (category: string) => {
    setSilencingCategory(category);
    await silenceFeedCategory(category);
    setSilencingCategory(null);
  }, [silenceFeedCategory]);

  const handleSilenceAll = useCallback(async () => {
    setSilencingAll(true);
    // Silence each known category sequentially
    const cats = ['ed', 'readmission', 'lab'];
    for (const cat of cats) {
      await silenceFeedCategory(cat);
    }
    // Silence any remaining "other" items
    const unackedOther = feed.filter(f =>
      !f.acknowledged && !cats.includes(f.category)
    );
    for (const item of unackedOther) {
      await silenceFeedCategory(item.category);
    }
    setSilencingAll(false);
  }, [silenceFeedCategory, feed]);

  // ── Edge Function Invocations ────────────────────────────────────────────
  const handleFireEdSurge = useCallback(async () => {
    setFiringEd(true);
    setEdResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('cpi-ed-surge-check', { body: {} });
      if (error) throw error;
      setEdResult(data as FireResult);
      setLastEdFired(new Date());
    } catch (e) {
      setEdResult({ success: false, alert_fired: false, message: String(e) });
    } finally {
      setFiringEd(false);
    }
  }, []);

  const handleFireReadmission = useCallback(async () => {
    setFiringReadmission(true);
    setReadmissionResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('cpi-readmission-check', {
        body: { action: 'model_check' },
      });
      if (error) throw error;
      setReadmissionResult(data as FireResult);
      setLastReadmissionFired(new Date());
    } catch (e) {
      setReadmissionResult({ success: false, alert_fired: false, message: String(e) });
    } finally {
      setFiringReadmission(false);
    }
  }, []);

  const handleFireLab = useCallback(async () => {
    setFiringLab(true);
    setLabResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('cpi-lab-escalation-check', {
        body: { action: 'check' },
      });
      if (error) throw error;
      setLabResult(data as FireResult);
      setLastLabFired(new Date());
    } catch (e) {
      setLabResult({ success: false, alert_fired: false, message: String(e) });
    } finally {
      setFiringLab(false);
    }
  }, []);

  // ── Counts ───────────────────────────────────────────────────────────────
  const unackedTotal = feed.filter(f => !f.acknowledged).length;
  const edUnacked = feed.filter(f => f.category === 'ed' && !f.acknowledged).length;
  const readmissionUnacked = feed.filter(f => f.category === 'readmission' && !f.acknowledged).length;
  const labUnacked = feed.filter(f => f.category === 'lab' && !f.acknowledged).length;
  const edTotal = feed.filter(f => f.category === 'ed').length;
  const readmissionTotal = feed.filter(f => f.category === 'readmission').length;
  const labTotal = feed.filter(f => f.category === 'lab').length;
  const otherTotal = feed.filter(f => !['ed', 'readmission', 'lab'].includes(f.category)).length;
  const otherUnacked = feed.filter(f => !['ed', 'readmission', 'lab'].includes(f.category) && !f.acknowledged).length;
  const criticalCount = feed.filter(f => f.severity === 'critical' && !f.acknowledged).length;

  // Unacked for currently selected source
  const activeSourceUnacked =
    sourceFilter === 'all' ? unackedTotal :
    sourceFilter === 'ed' ? edUnacked :
    sourceFilter === 'readmission' ? readmissionUnacked :
    sourceFilter === 'lab' ? labUnacked :
    sourceFilter === 'other' ? otherUnacked : 0;

  // ── Filter logic ─────────────────────────────────────────────────────────
  const filtered = feed.filter(item => {
    const matchSev = severityFilter === 'all' || item.severity === severityFilter;
    const matchSrc =
      sourceFilter === 'all' ||
      (sourceFilter === 'other'
        ? !['ed', 'readmission', 'lab'].includes(item.category)
        : item.category === sourceFilter);
    return matchSev && matchSrc;
  });

  // ── Loading skeleton ─────────────────────────────────────────────────────
  if (loadingFeed) {
    return (
      <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <div className="h-4 bg-slate-100 rounded w-48 animate-pulse mb-1"></div>
          <div className="h-3 bg-slate-100 rounded w-72 animate-pulse"></div>
        </div>
        <div className="divide-y divide-slate-50">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="px-5 py-4 animate-pulse">
              <div className="flex space-x-3">
                <div className="w-8 h-8 bg-slate-100 rounded-lg flex-shrink-0"></div>
                <div className="flex-1">
                  <div className="h-3 bg-slate-100 rounded w-32 mb-2"></div>
                  <div className="h-4 bg-slate-100 rounded w-48 mb-2"></div>
                  <div className="h-3 bg-slate-100 rounded w-full mb-1"></div>
                  <div className="h-3 bg-slate-100 rounded w-4/5"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-100 overflow-hidden flex flex-col">

      {/* ── Header ── */}
      <div className="px-5 py-4 border-b border-slate-100">

        {/* Title row */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 flex items-center justify-center bg-slate-900 rounded-lg flex-shrink-0">
              <i className="ri-rss-line text-teal-400 text-sm"></i>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Real-Time Intelligence Feed</h3>
              <p className="text-xs text-slate-500">Live signals from edge functions · {feed.length} events</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-100 rounded-full">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-xs font-semibold text-emerald-600">Live</span>
            </div>
            {unackedTotal > 0 && (
              <div className="flex items-center space-x-1.5 pl-2.5 pr-1 py-1 bg-rose-50 border border-rose-100 rounded-full">
                <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></div>
                <span className="text-xs font-bold text-rose-600">{unackedTotal} unread</span>
                {/* Global silence all */}
                <div className="border-l border-rose-200 ml-1 pl-1">
                  <GlobalSilenceButton
                    count={unackedTotal}
                    silencing={silencingAll}
                    onSilence={handleSilenceAll}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Source badges with inline silence buttons ── */}
        <div className="flex items-center space-x-2 mb-3 flex-wrap gap-y-1.5">
          <SourceBadge
            category="ed"
            icon="ri-hospital-line"
            unacked={edUnacked}
            total={edTotal}
            silencing={silencingCategory === 'ed'}
            onSilence={() => handleSilenceCategory('ed')}
          />
          <SourceBadge
            category="readmission"
            icon="ri-refresh-alert-line"
            unacked={readmissionUnacked}
            total={readmissionTotal}
            silencing={silencingCategory === 'readmission'}
            onSilence={() => handleSilenceCategory('readmission')}
          />
          <SourceBadge
            category="lab"
            icon="ri-test-tube-line"
            unacked={labUnacked}
            total={labTotal}
            silencing={silencingCategory === 'lab'}
            onSilence={() => handleSilenceCategory('lab')}
          />
        </div>

        {/* ── Quick-fire buttons ── */}
        <div className="flex items-start space-x-2 flex-wrap gap-y-1.5">
          <QuickFireButton
            label="Run ED Surge"
            icon="ri-hospital-line"
            color="bg-rose-600 hover:bg-rose-700 text-white"
            firing={firingEd}
            lastFired={lastEdFired}
            lastResult={edResult}
            onFire={handleFireEdSurge}
          />
          <QuickFireButton
            label="Run Readmission"
            icon="ri-refresh-alert-line"
            color="bg-amber-600 hover:bg-amber-700 text-white"
            firing={firingReadmission}
            lastFired={lastReadmissionFired}
            lastResult={readmissionResult}
            onFire={handleFireReadmission}
          />
          <QuickFireButton
            label="Run Lab Check"
            icon="ri-test-tube-line"
            color="bg-violet-600 hover:bg-violet-700 text-white"
            firing={firingLab}
            lastFired={lastLabFired}
            lastResult={labResult}
            onFire={handleFireLab}
          />
        </div>
      </div>

      {/* ── Source filter tabs ── */}
      <div className="px-5 py-2 border-b border-slate-100 bg-slate-50/60 flex items-center space-x-1 overflow-x-auto">
        <span className="text-xs text-slate-400 font-medium mr-2 whitespace-nowrap">Source:</span>
        {KNOWN_SOURCES.map(({ id, label, dot }) => {
          const count =
            id === 'all' ? feed.length :
            id === 'ed' ? edTotal :
            id === 'readmission' ? readmissionTotal :
            id === 'lab' ? labTotal : otherTotal;
          return (
            <button
              key={id}
              onClick={() => setSourceFilter(id)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                sourceFilter === id
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
              }`}
            >
              {dot && <span className={`w-1.5 h-1.5 rounded-full ${dot} inline-block`}></span>}
              <span>{label}</span>
              <span className={`px-1 rounded-full text-xs ${sourceFilter === id ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Severity filter + contextual silence bar ── */}
      <div className="px-5 py-2 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center space-x-1">
          <span className="text-xs text-slate-400 font-medium mr-2">Severity:</span>
          {(['all', 'critical', 'warning', 'info'] as const).map(f => (
            <button
              key={f}
              onClick={() => setSeverityFilter(f)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                severityFilter === f ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
              {f === 'critical' && criticalCount > 0 && (
                <span className="ml-1.5 bg-rose-500 text-white text-xs px-1.5 py-0.5 rounded-full">{criticalCount}</span>
              )}
            </button>
          ))}
        </div>

        {/* Contextual source-level silence — only when a specific source is active */}
        {sourceFilter !== 'all' && activeSourceUnacked > 0 && (
          <SilenceButton
            count={activeSourceUnacked}
            category={sourceFilter}
            silencing={silencingCategory === sourceFilter}
            onSilence={() => handleSilenceCategory(sourceFilter)}
          />
        )}
      </div>

      {/* ── Feed items ── */}
      <div className="divide-y divide-slate-50 max-h-[460px] overflow-y-auto flex-1">
        {filtered.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <i className="ri-check-double-line text-2xl text-emerald-400 mb-2 block"></i>
            <p className="text-sm text-slate-500">
              No {sourceFilter !== 'all' ? (sourceConfig[sourceFilter]?.label ?? sourceFilter) : ''}{' '}
              {severityFilter !== 'all' ? severityFilter : ''} signals at this time
            </p>
            <div className="flex items-center justify-center space-x-2 mt-3">
              {(sourceFilter === 'ed' || sourceFilter === 'all') && (
                <button
                  onClick={handleFireEdSurge}
                  disabled={firingEd}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap disabled:opacity-60 transition-colors"
                >
                  {firingEd ? 'Checking…' : 'Run ED Surge'}
                </button>
              )}
              {(sourceFilter === 'lab' || sourceFilter === 'all') && (
                <button
                  onClick={handleFireLab}
                  disabled={firingLab}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap disabled:opacity-60 transition-colors"
                >
                  {firingLab ? 'Checking…' : 'Run Lab Check'}
                </button>
              )}
            </div>
          </div>
        ) : (
          filtered.map((item) => (
            <FeedCard
              key={item.id}
              item={item}
              onAcknowledge={acknowledgeFeedItem}
              isNew={newIdsRef.current.has(item.id)}
            />
          ))
        )}
      </div>

      {/* ── Footer breakdown ── */}
      <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center space-x-3 text-xs text-slate-400 flex-wrap gap-y-1">
          <span className="flex items-center space-x-1">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block"></span>
            <span>ED: {edTotal}</span>
          </span>
          <span className="text-slate-200">·</span>
          <span className="flex items-center space-x-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block"></span>
            <span>Readmission: {readmissionTotal}</span>
          </span>
          <span className="text-slate-200">·</span>
          <span className="flex items-center space-x-1">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-500 inline-block"></span>
            <span>Lab: {labTotal}</span>
          </span>
          <span className="text-slate-200">·</span>
          <span className="flex items-center space-x-1">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block"></span>
            <span>Other: {otherTotal}</span>
          </span>
        </div>
        <div className="flex items-center space-x-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
          <span className="text-xs text-emerald-600 font-medium">Supabase real-time active</span>
        </div>
      </div>
    </div>
  );
}
