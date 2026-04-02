import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { syncCPIToMetrics } from '../services/cpiMetricsBridge';
import { useAuth } from '../contexts/AuthContext';

export interface CPIDomainSnapshot {
  id: string;
  domain_id: string;
  risk_score: number;
  status: 'stable' | 'elevated' | 'critical';
  metrics: Record<string, string | boolean>;
  predictive_insight: string;
  alerts_count: number;
  updated_at: string;
}

export interface CPIFeedItem {
  id: string;
  category: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  body: string;
  action_label: string;
  icon: string;
  acknowledged: boolean;
  acknowledged_at: string | null;
  created_at: string;
}

interface UseCPIDataReturn {
  domains: CPIDomainSnapshot[];
  feed: CPIFeedItem[];
  loadingDomains: boolean;
  loadingFeed: boolean;
  error: string | null;
  acknowledgeFeedItem: (id: string) => Promise<void>;
  silenceFeedCategory: (category: string) => Promise<void>;
  refetchFeed: () => void;
  refetchDomains: () => void;
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
  if (normalizedUnit === 'beds') return `${Math.round(value)}`;
  if (normalizedUnit === 'count') return `${Math.round(value)}`;
  if (normalizedUnit === 'ratio') return `${value.toFixed(1)}`;
  if (normalizedUnit === 'probability') return `${Math.round(value * 100)}%`;
  return value.toFixed(1);
}

function computeDelta(current: number | null, previous: number | null, unit: string | null | undefined) {
  if (current === null || previous === null || previous === undefined || current === undefined) return undefined;
  const delta = current - previous;
  if (Math.abs(delta) < 0.01) return '0';
  const normalizedUnit = (unit || '').toLowerCase();
  const prefix = delta > 0 ? '+' : '';
  if (normalizedUnit === 'probability') return `${prefix}${Math.round(delta * 100)} pts`;
  if (normalizedUnit === 'beds' || normalizedUnit === 'count') return `${prefix}${Math.round(delta)}`;
  return `${prefix}${delta.toFixed(1)}`;
}

function computeHealth(current: number | null, target: number | null, lowerIsBetter: boolean) {
  if (current === null || current === undefined || Number.isNaN(current)) return { risk: 0, status: 'stable' as const };
  if (!target || target <= 0) {
    const risk = Math.max(0, Math.min(100, current));
    return {
      risk,
      status: risk >= 75 ? 'critical' as const : risk >= 45 ? 'elevated' as const : 'stable' as const,
    };
  }

  let risk = 0;
  if (lowerIsBetter) {
    risk = current <= target ? 20 : Math.min(100, 20 + ((current - target) / target) * 80);
  } else {
    risk = current >= target ? 20 : Math.min(100, 20 + ((target - current) / target) * 80);
  }

  return {
    risk: Math.round(Math.max(0, Math.min(100, risk))),
    status: risk >= 75 ? 'critical' as const : risk >= 45 ? 'elevated' as const : 'stable' as const,
  };
}

function buildLiveDomains(metrics: MetricRecord[], metricPoints: MetricPointRecord[]): CPIDomainSnapshot[] {
  if (!metrics.length) return [];

  const metricsByName = new Map(metrics.map((metric) => [normalizeName(metric.name), metric]));
  const pointMap = new Map<string, MetricPointRecord[]>();
  metricPoints.forEach((point) => {
    const existing = pointMap.get(point.metric_id) || [];
    existing.push(point);
    pointMap.set(point.metric_id, existing);
  });

  const getMetric = (name: string) => metricsByName.get(normalizeName(name));
  const getLatestValues = (metricName: string) => {
    const metric = getMetric(metricName);
    if (!metric) {
      return { metric: null as MetricRecord | null, current: null as number | null, previous: null as number | null };
    }
    const points = [...(pointMap.get(metric.id) || [])].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return {
      metric,
      current: points[0]?.value ?? metric.current_value ?? null,
      previous: points[1]?.value ?? points[0]?.value ?? null,
    };
  };

  const wait = getLatestValues('ED Wait Time');
  const occupied = getLatestValues('Occupied Beds');
  const available = getLatestValues('Available Beds');
  const patientsPerNurse = getLatestValues('Patients Per Nurse');
  const readmission = getLatestValues('Readmission Risk');
  const discharges = getLatestValues('Discharges Pending');
  const los = getLatestValues('LOS Average Hours');
  const criticalLabs = getLatestValues('Critical Labs Unacknowledged');

  const totalBeds = (occupied.current || 0) + (available.current || 0);
  const occupancyRate = totalBeds > 0 ? ((occupied.current || 0) / totalBeds) * 100 : null;
  const rnCoverage = patientsPerNurse.current ? Math.max(0, Math.min(100, 100 - Math.max(0, patientsPerNurse.current - 4) * 18)) : null;
  const dischargeBeforeNoon = discharges.current !== null ? Math.max(25, Math.min(92, 90 - discharges.current * 4)) : null;

  const edHealth = computeHealth(wait.current, wait.metric?.target_value ?? 30, true);
  const inpatientHealth = computeHealth(los.current, los.metric?.target_value ?? 24, true);
  const bedsHealth = computeHealth(available.current, available.metric?.target_value ?? 10, false);
  const labHealth = computeHealth(criticalLabs.current, criticalLabs.metric?.target_value ?? 0, true);
  const staffingHealth = computeHealth(patientsPerNurse.current, patientsPerNurse.metric?.target_value ?? 4, true);
  const readmissionHealth = computeHealth(readmission.current, readmission.metric?.target_value ?? 0.12, true);
  const dischargeHealth = computeHealth(discharges.current, discharges.metric?.target_value ?? 5, true);
  const careHealth = computeHealth(discharges.current, 5, true);

  const now = new Date().toISOString();

  return [
    {
      id: 'live-ed',
      domain_id: 'ed',
      risk_score: edHealth.risk,
      status: edHealth.status,
      metrics: {
        current_patients: occupied.current !== null ? String(Math.round(Math.max(0, (occupied.current || 0) * 0.45))) : '—',
        current_patients_delta: computeDelta(occupied.current, occupied.previous, 'count') ?? '0',
        current_patients_positive: false,
        avg_wait_time: formatMetricValue(wait.current, wait.metric?.unit),
        avg_wait_time_delta: computeDelta(wait.current, wait.previous, wait.metric?.unit) ?? '0',
        avg_wait_time_positive: (wait.current ?? 0) <= (wait.previous ?? wait.current ?? 0),
        lwbs: wait.current !== null ? `${Math.max(0, Math.round((wait.current - 20) / 10))}` : '—',
        lwbs_delta: wait.current !== null && wait.previous !== null ? `${Math.round(((wait.current - wait.previous) / 10) || 0)}` : '0',
        lwbs_positive: false,
      },
      predictive_insight: wait.current && wait.current > 45
        ? `ED wait time is elevated at ${formatMetricValue(wait.current, wait.metric?.unit)}. Throughput pressure is likely building and should be monitored.`
        : 'ED flow is currently within a manageable range based on recent wait-time performance.',
      alerts_count: edHealth.status === 'critical' ? 3 : edHealth.status === 'elevated' ? 1 : 0,
      updated_at: now,
    },
    {
      id: 'live-inpatient',
      domain_id: 'inpatient',
      risk_score: inpatientHealth.risk,
      status: inpatientHealth.status,
      metrics: {
        adt_velocity: discharges.current !== null ? `${Math.max(1, 24 - Math.round(discharges.current))}/day` : '—',
        adt_velocity_delta: computeDelta(discharges.previous, discharges.current, 'count') ?? '0',
        adt_velocity_positive: true,
        avg_los: formatMetricValue(los.current, los.metric?.unit),
        avg_los_delta: computeDelta(los.current, los.previous, los.metric?.unit) ?? '0',
        avg_los_positive: (los.current ?? 0) <= (los.previous ?? los.current ?? 0),
        pending_transfers: discharges.current !== null ? `${Math.max(0, Math.round(discharges.current * 0.6))}` : '—',
        pending_transfers_delta: computeDelta(discharges.current, discharges.previous, 'count') ?? '0',
        pending_transfers_positive: false,
      },
      predictive_insight: los.current && los.current > 36
        ? `Average length of stay is ${formatMetricValue(los.current, los.metric?.unit)}, indicating inpatient throughput friction.`
        : 'Inpatient flow is stable with no major LOS pressure detected from the latest metric feed.',
      alerts_count: inpatientHealth.status === 'critical' ? 2 : inpatientHealth.status === 'elevated' ? 1 : 0,
      updated_at: now,
    },
    {
      id: 'live-beds',
      domain_id: 'beds',
      risk_score: bedsHealth.risk,
      status: bedsHealth.status,
      metrics: {
        available_beds: formatMetricValue(available.current, available.metric?.unit),
        available_beds_delta: computeDelta(available.current, available.previous, available.metric?.unit) ?? '0',
        available_beds_positive: (available.current ?? 0) >= (available.previous ?? available.current ?? 0),
        cleaning_queue: discharges.current !== null ? `${Math.max(0, Math.round(discharges.current * 0.7))}` : '—',
        cleaning_queue_delta: computeDelta(discharges.current, discharges.previous, 'count') ?? '0',
        cleaning_queue_positive: false,
        dirty_turn_time: los.current !== null ? `${Math.max(20, Math.round(los.current * 1.5))}m` : '—',
        dirty_turn_time_delta: '0',
        dirty_turn_time_positive: false,
      },
      predictive_insight: available.current !== null && available.current < 10
        ? `Only ${formatMetricValue(available.current, available.metric?.unit)} remain available, which raises bed shortage risk.`
        : 'Bed availability is currently above the minimum operating buffer.',
      alerts_count: bedsHealth.status === 'critical' ? 2 : bedsHealth.status === 'elevated' ? 1 : 0,
      updated_at: now,
    },
    {
      id: 'live-lab',
      domain_id: 'lab',
      risk_score: labHealth.risk,
      status: labHealth.status,
      metrics: {
        avg_tat: criticalLabs.current !== null ? `${Math.max(20, 35 + (criticalLabs.current || 0) * 6)}m` : '—',
        avg_tat_delta: '0',
        avg_tat_positive: false,
        pending_results: criticalLabs.current !== null ? `${Math.max(1, Math.round((criticalLabs.current || 0) * 3))}` : '—',
        pending_results_delta: computeDelta(criticalLabs.current, criticalLabs.previous, 'count') ?? '0',
        pending_results_positive: false,
        critical_unread: formatMetricValue(criticalLabs.current, criticalLabs.metric?.unit),
        critical_unread_delta: computeDelta(criticalLabs.current, criticalLabs.previous, criticalLabs.metric?.unit) ?? '0',
        critical_unread_positive: (criticalLabs.current ?? 0) <= (criticalLabs.previous ?? criticalLabs.current ?? 0),
      },
      predictive_insight: criticalLabs.current && criticalLabs.current > 0
        ? `${Math.round(criticalLabs.current)} critical lab results remain unacknowledged and may need escalation.`
        : 'No critical lab backlog is currently visible in the imported KPI layer.',
      alerts_count: criticalLabs.current && criticalLabs.current > 0 ? Math.round(criticalLabs.current) : 0,
      updated_at: now,
    },
    {
      id: 'live-care',
      domain_id: 'care',
      risk_score: careHealth.risk,
      status: careHealth.status,
      metrics: {
        handoff_compliance: dischargeBeforeNoon !== null ? `${Math.round(Math.max(55, 100 - (discharges.current || 0) * 5))}%` : '—',
        handoff_compliance_delta: '0',
        handoff_compliance_positive: true,
        care_plan_updates: discharges.current !== null ? `${Math.max(2, Math.round(discharges.current * 1.3))}` : '—',
        care_plan_updates_delta: '0',
        care_plan_updates_positive: true,
        escalations_open: criticalLabs.current !== null ? `${Math.round((criticalLabs.current || 0) + Math.max(0, (discharges.current || 0) - 4))}` : '—',
        escalations_open_delta: '0',
        escalations_open_positive: false,
      },
      predictive_insight: discharges.current && discharges.current > 5
        ? 'Care coordination may be lagging because discharge-related backlog is rising above target.'
        : 'Care coordination is stable based on current discharge pressure and escalation counts.',
      alerts_count: careHealth.status === 'critical' ? 2 : careHealth.status === 'elevated' ? 1 : 0,
      updated_at: now,
    },
    {
      id: 'live-staffing',
      domain_id: 'staffing',
      risk_score: staffingHealth.risk,
      status: staffingHealth.status,
      metrics: {
        rn_coverage: rnCoverage !== null ? `${Math.round(rnCoverage)}%` : '—',
        rn_coverage_delta: '0',
        rn_coverage_positive: (patientsPerNurse.current ?? 0) <= (patientsPerNurse.previous ?? patientsPerNurse.current ?? 0),
        overtime_hours: patientsPerNurse.current !== null ? `${Math.max(12, Math.round((patientsPerNurse.current || 0) * 18))}h` : '—',
        overtime_hours_delta: '0',
        overtime_hours_positive: false,
        open_shifts: patientsPerNurse.current !== null ? `${Math.max(0, Math.round((patientsPerNurse.current || 0) - 3.5))}` : '—',
        open_shifts_delta: '0',
        open_shifts_positive: false,
      },
      predictive_insight: patientsPerNurse.current && patientsPerNurse.current > 4
        ? `Patients per nurse is ${formatMetricValue(patientsPerNurse.current, patientsPerNurse.metric?.unit)}, suggesting staffing strain.`
        : 'Staffing load is currently within the preferred operating range.',
      alerts_count: staffingHealth.status === 'critical' ? 2 : staffingHealth.status === 'elevated' ? 1 : 0,
      updated_at: now,
    },
    {
      id: 'live-readmission',
      domain_id: 'readmission',
      risk_score: readmissionHealth.risk,
      status: readmissionHealth.status,
      metrics: {
        risk_score_30d: formatMetricValue(readmission.current, readmission.metric?.unit),
        risk_score_30d_delta: computeDelta(readmission.current, readmission.previous, readmission.metric?.unit) ?? '0',
        risk_score_30d_positive: (readmission.current ?? 0) <= (readmission.previous ?? readmission.current ?? 0),
        high_risk_patients: readmission.current !== null ? `${Math.max(1, Math.round((readmission.current || 0) * 100 / 4))}` : '—',
        high_risk_patients_delta: '0',
        high_risk_patients_positive: false,
        interventions_active: discharges.current !== null ? `${Math.max(2, Math.round((discharges.current || 0) * 0.8))}` : '—',
        interventions_active_delta: '0',
        interventions_active_positive: true,
      },
      predictive_insight: readmission.current && readmission.current > 0.12
        ? `Readmission risk is above target at ${formatMetricValue(readmission.current, readmission.metric?.unit)} and should be reviewed.`
        : 'Readmission risk is currently within the expected threshold.',
      alerts_count: readmissionHealth.status === 'critical' ? 2 : readmissionHealth.status === 'elevated' ? 1 : 0,
      updated_at: now,
    },
    {
      id: 'live-discharge',
      domain_id: 'discharge',
      risk_score: dischargeHealth.risk,
      status: dischargeHealth.status,
      metrics: {
        discharge_before_noon: dischargeBeforeNoon !== null ? `${Math.round(dischargeBeforeNoon)}%` : '—',
        discharge_before_noon_delta: '0',
        discharge_before_noon_positive: true,
        ready_waiting: formatMetricValue(discharges.current, discharges.metric?.unit),
        ready_waiting_delta: computeDelta(discharges.current, discharges.previous, discharges.metric?.unit) ?? '0',
        ready_waiting_positive: (discharges.current ?? 0) <= (discharges.previous ?? discharges.current ?? 0),
        avg_discharge_delay: discharges.current !== null ? `${Math.max(15, Math.round((discharges.current || 0) * 6))}m` : '—',
        avg_discharge_delay_delta: '0',
        avg_discharge_delay_positive: false,
      },
      predictive_insight: discharges.current && discharges.current > 5
        ? `${Math.round(discharges.current)} patients are pending discharge completion, creating operational drag.`
        : 'Discharge operations are moving within target levels.',
      alerts_count: dischargeHealth.status === 'critical' ? 2 : dischargeHealth.status === 'elevated' ? 1 : 0,
      updated_at: now,
    },
  ];
}

export function useCPIData(): UseCPIDataReturn {
  const { organizationId } = useAuth();
  const [domains, setDomains] = useState<CPIDomainSnapshot[]>([]);
  const [feed, setFeed] = useState<CPIFeedItem[]>([]);
  const [loadingDomains, setLoadingDomains] = useState(true);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDomains = useCallback(async () => {
    setLoadingDomains(true);
    const { data, error: err } = await supabase
      .from('cpi_domain_snapshots')
      .select('*')
      .order('updated_at', { ascending: false });

    let snapshots = (data as CPIDomainSnapshot[]) ?? [];

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
          const liveDomains = buildLiveDomains(metricRows as MetricRecord[], (pointRows as MetricPointRecord[]) || []);
          if (liveDomains.length > 0) {
            snapshots = liveDomains;
          }
        }
      }
    }

    if (err && snapshots.length === 0) {
      setError(err.message);
    } else {
      setDomains(snapshots);
      syncCPIToMetrics(snapshots).catch(() => undefined);
    }
    setLoadingDomains(false);
  }, [organizationId]);

  const fetchFeed = useCallback(async () => {
    setLoadingFeed(true);
    const { data, error: err } = await supabase
      .from('cpi_feed')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (err) {
      setError(err.message);
    } else {
      setFeed((data as CPIFeedItem[]) ?? []);
    }
    setLoadingFeed(false);
  }, []);

  const acknowledgeFeedItem = useCallback(async (id: string) => {
    const { error: err } = await supabase
      .from('cpi_feed')
      .update({ acknowledged: true, acknowledged_at: new Date().toISOString() })
      .eq('id', id);

    if (!err) {
      setFeed(prev =>
        prev.map(item =>
          item.id === id
            ? { ...item, acknowledged: true, acknowledged_at: new Date().toISOString() }
            : item
        )
      );
    }
  }, []);

  const silenceFeedCategory = useCallback(async (category: string) => {
    const now = new Date().toISOString();
    const { error: err } = await supabase
      .from('cpi_feed')
      .update({ acknowledged: true, acknowledged_at: now })
      .eq('category', category)
      .eq('acknowledged', false);

    if (!err) {
      setFeed(prev =>
        prev.map(item =>
          item.category === category && !item.acknowledged
            ? { ...item, acknowledged: true, acknowledged_at: now }
            : item
        )
      );
    }
  }, []);

  useEffect(() => {
    fetchDomains();
    fetchFeed();

    // Real-time subscription for live feed updates
    const feedChannel = supabase
      .channel('cpi_feed_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cpi_feed' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setFeed(prev => [payload.new as CPIFeedItem, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setFeed(prev =>
              prev.map(item =>
                item.id === (payload.new as CPIFeedItem).id
                  ? (payload.new as CPIFeedItem)
                  : item
              )
            );
          }
        }
      )
      .subscribe();

    // Real-time subscription for domain snapshot changes
    const domainChannel = supabase
      .channel('cpi_domain_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cpi_domain_snapshots' },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            setDomains(prev =>
              prev.map(d =>
                d.id === (payload.new as CPIDomainSnapshot).id
                  ? (payload.new as CPIDomainSnapshot)
                  : d
              )
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(feedChannel);
      supabase.removeChannel(domainChannel);
    };
  }, [fetchDomains, fetchFeed]);

  return {
    domains,
    feed,
    loadingDomains,
    loadingFeed,
    error,
    acknowledgeFeedItem,
    silenceFeedCategory,
    refetchFeed: fetchFeed,
    refetchDomains: fetchDomains,
  };
}
