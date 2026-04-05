import { supabase } from '../lib/supabase';
import { summarizeAIMRecommendations } from './aimWorkSummary';

export interface Recommendation {
  id: string;
  user_id: string;
  organization_id?: string;
  title: string;
  description: string;
  category: 'performance' | 'quality' | 'efficiency' | 'cost' | 'risk';
  priority: 'critical' | 'high' | 'medium' | 'low';
  impact_score: number;
  effort_score: number;
  confidence_score: number;
  status: 'pending' | 'in_progress' | 'completed' | 'dismissed';
  source_data?: any;
  recommended_actions?: string[];
  expected_impact?: string;
  actual_impact?: string;
  implementation_notes?: string;
  assigned_to?: string;
  due_date?: string;
  completed_at?: string;
  dismissed_at?: string;
  dismissed_reason?: string;
  created_at: string;
  updated_at: string;
}

interface RecommendationLifecycleEvent {
  event: 'generated' | 'started' | 'completed' | 'dismissed';
  at: string;
  actor_id?: string;
  note?: string;
}

interface RecommendationSourceDataShape {
  pattern_type?: string;
  signature?: string;
  evidence_strength?: number;
  generated_from?: string[];
  refresh_timestamp?: string | null;
  review_after?: string;
  expires_at?: string;
  canonical_kind?: 'recommendation_signal';
  lifecycle?: RecommendationLifecycleEvent[];
  raw?: any;
  [key: string]: any;
}

interface DataPattern {
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  data: any;
  insight: string;
}

const RECOMMENDATION_REVIEW_WINDOW_DAYS = 14;
const RECOMMENDATION_EXPIRY_WINDOW_DAYS = 30;
const RECOMMENDATION_RECENT_DUPLICATE_WINDOW_DAYS = 21;
const RECOMMENDATION_DISMISS_COOLDOWN_DAYS = 10;

function normalizePatternNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function addDaysIso(days: number) {
  const next = new Date();
  next.setDate(next.getDate() + days);
  return next.toISOString();
}

function getPatternRefreshTimestamp(pattern: DataPattern): string | null {
  if (pattern.type === 'metric_below_target' || pattern.type === 'metric_declining' || pattern.type === 'high_variability') {
    return pattern.data?.values?.[0]?.timestamp ?? null;
  }
  if (pattern.type === 'negative_forecast' || pattern.type === 'positive_forecast') {
    return pattern.data?.forecast?.created_at ?? null;
  }
  if (pattern.type === 'recurring_anomalies') {
    return pattern.data?.anomalies?.[0]?.detected_at ?? null;
  }
  return null;
}

function getPatternEvidenceStrength(pattern: DataPattern): number {
  switch (pattern.type) {
    case 'metric_below_target':
      return Math.min(100, 55 + Number(pattern.data?.gap || 0) * 1.2 + ((pattern.data?.values?.length || 0) >= 20 ? 10 : 0));
    case 'metric_declining':
      return Math.min(100, 58 + Number(pattern.data?.decline || 0) * 1.1);
    case 'high_variability':
      return Math.min(100, 50 + Number(pattern.data?.cv || 0) * 0.7);
    case 'recurring_anomalies':
      return Math.min(100, 62 + Number(pattern.data?.count || 0) * 6);
    case 'negative_forecast':
      return Math.min(100, 60 + Number(pattern.data?.decline || 0) * 0.9 + ((pattern.data?.predictions?.length || 0) >= 12 ? 8 : 0));
    case 'positive_forecast':
      return Math.min(100, 45 + Number(pattern.data?.growth || 0) * 0.6);
    default:
      return 0;
  }
}

function meetsRecommendationGate(pattern: DataPattern): boolean {
  const evidenceStrength = getPatternEvidenceStrength(pattern);

  switch (pattern.type) {
    case 'metric_below_target':
      return evidenceStrength >= 62 && normalizePatternNumber(pattern.data?.gap) >= 8;
    case 'metric_declining':
      return evidenceStrength >= 65 && normalizePatternNumber(pattern.data?.decline) >= 10;
    case 'high_variability':
      return evidenceStrength >= 60 && normalizePatternNumber(pattern.data?.cv) >= 35;
    case 'recurring_anomalies':
      return evidenceStrength >= 70 && normalizePatternNumber(pattern.data?.count) >= 3;
    case 'negative_forecast':
      return evidenceStrength >= 66 && normalizePatternNumber(pattern.data?.decline) >= 10;
    case 'positive_forecast':
      return evidenceStrength >= 72 && normalizePatternNumber(pattern.data?.growth) >= 20;
    default:
      return false;
  }
}

function buildRecommendationSignature(pattern: DataPattern): string {
  switch (pattern.type) {
    case 'metric_below_target':
    case 'metric_declining':
    case 'high_variability':
      return `${pattern.type}::${pattern.data?.metric?.id || pattern.data?.metric?.name || 'metricless'}`;
    case 'recurring_anomalies':
      return `${pattern.type}::${pattern.data?.metricId || pattern.data?.metricName || 'unknown'}`;
    case 'negative_forecast':
    case 'positive_forecast':
      return `${pattern.type}::${pattern.data?.forecast?.metric_id || pattern.data?.forecast?.metric_name || 'forecastless'}`;
    default:
      return `${pattern.type}::generic`;
  }
}

function getPatternGeneratedFrom(pattern: DataPattern): string[] {
  switch (pattern.type) {
    case 'metric_below_target':
    case 'metric_declining':
    case 'high_variability':
      return ['metrics', 'metric_data'];
    case 'recurring_anomalies':
      return ['anomalies'];
    case 'negative_forecast':
    case 'positive_forecast':
      return ['forecasts', 'metrics'];
    default:
      return ['aim'];
  }
}

function appendLifecycleEvent(
  sourceData: RecommendationSourceDataShape | undefined,
  event: RecommendationLifecycleEvent
): RecommendationSourceDataShape {
  const safeSourceData: RecommendationSourceDataShape = {
    ...(sourceData || {})
  };

  return {
    ...safeSourceData,
    lifecycle: [...(safeSourceData.lifecycle || []), event]
  };
}

export class RecommendationsEngine {
  private userId: string;
  private organizationId: string | null = null;

  constructor(userId: string, organizationId?: string | null) {
    this.userId = userId;
    this.organizationId = organizationId ?? null;
  }

  private async getOrganizationId(): Promise<string | null> {
    if (this.organizationId) return this.organizationId;

    const { data } = await supabase
      .from('user_profiles')
      .select('organization_id')
      .eq('id', this.userId)
      .maybeSingle();

    if (data?.organization_id) {
      this.organizationId = data.organization_id;
      return this.organizationId;
    }

    const { data: membership } = await supabase
      .from('user_organizations')
      .select('organization_id')
      .eq('user_id', this.userId)
      .limit(1)
      .maybeSingle();

    this.organizationId = membership?.organization_id || null;
    return this.organizationId;
  }

  async generateRecommendations(): Promise<Recommendation[]> {
    const patterns = await this.analyzeDataPatterns();
    const orgId = await this.getOrganizationId();
    if (!orgId) return [];
    const recommendations: Recommendation[] = [];

    for (const pattern of patterns) {
      const recommendation = this.createRecommendation(pattern, orgId);
      if (recommendation) {
        recommendations.push(recommendation);
      }
    }

    if (recommendations.length > 0) {
      const signatures = recommendations
        .map((rec) => rec.source_data?.signature)
        .filter(Boolean);
      const cutoffIso = new Date(
        Date.now() - RECOMMENDATION_RECENT_DUPLICATE_WINDOW_DAYS * 24 * 60 * 60 * 1000
      ).toISOString();

      const { data: existing } = await supabase
        .from('recommendations')
        .select('id, title, status, created_at, dismissed_at, completed_at, source_data')
        .eq('organization_id', orgId)
        .gte('created_at', cutoffIso);

      const activeSignatures = new Set(
        (existing || [])
          .filter((rec) => ['pending', 'in_progress'].includes(rec.status))
          .map((rec) => rec.source_data?.signature)
          .filter(Boolean)
      );

      const coolingDismissedSignatures = new Set(
        (existing || [])
          .filter((rec) => {
            if (rec.status !== 'dismissed') return false;
            const dismissedAt = rec.dismissed_at || rec.updated_at || rec.created_at;
            return Date.now() - new Date(dismissedAt).getTime() <= RECOMMENDATION_DISMISS_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
          })
          .map((rec) => rec.source_data?.signature)
          .filter(Boolean)
      );

      const recentlyCompletedSignatures = new Set(
        (existing || [])
          .filter((rec) => rec.status === 'completed')
          .map((rec) => rec.source_data?.signature)
          .filter(Boolean)
      );

      const seenSignatures = new Set<string>();
      const uniqueRecommendations = recommendations.filter((rec) => {
        const signature = rec.source_data?.signature;
        if (!signature) return true;
        if (seenSignatures.has(signature)) return false;
        seenSignatures.add(signature);
        if (activeSignatures.has(signature)) return false;
        if (coolingDismissedSignatures.has(signature)) return false;
        if (recentlyCompletedSignatures.has(signature)) return false;
        return true;
      });

      if (uniqueRecommendations.length === 0) {
        return [];
      }

      const { data, error } = await supabase
        .from('recommendations')
        .insert(uniqueRecommendations)
        .select();

      if (error) {
        console.error('Error saving recommendations:', error);
        return [];
      }

      return data || [];
    }

    return [];
  }

  private async analyzeDataPatterns(): Promise<DataPattern[]> {
    const patterns: DataPattern[] = [];

    const metricPatterns = await this.analyzeMetrics();
    patterns.push(...metricPatterns);

    const anomalyPatterns = await this.analyzeAnomalies();
    patterns.push(...anomalyPatterns);

    const forecastPatterns = await this.analyzeForecasts();
    patterns.push(...forecastPatterns);

    return patterns;
  }

  private async analyzeMetrics(): Promise<DataPattern[]> {
    const patterns: DataPattern[] = [];
    const orgId = await this.getOrganizationId();
    if (!orgId) return patterns;

    const { data: metrics } = await supabase
      .from('metrics')
      .select('id, name, current_value, target_value, unit')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (!metrics) return patterns;

    for (const metric of metrics) {
      const { data: recentData } = await supabase
        .from('metric_data')
        .select('value, timestamp')
        .eq('metric_id', metric.id)
        .order('timestamp', { ascending: false })
        .limit(30);

      if (!recentData || recentData.length < 5) continue;

      const values = recentData.map((d: any) => d.value);
      const avg = values.reduce((a: number, b: number) => a + b, 0) / values.length;
      const target = metric.target_value;

      // Pattern 1: Metric below target
      if (target && avg < target * 0.9) {
        const gap = ((target - avg) / target * 100).toFixed(1);
        patterns.push({
          type: 'metric_below_target',
          severity: avg < target * 0.7 ? 'critical' : avg < target * 0.8 ? 'high' : 'medium',
          data: { metric, avg, target, gap, values: recentData },
          insight: `${metric.name} is ${gap}% below target (${avg.toFixed(2)} vs ${target})`
        });
      }

      // Pattern 2: Declining trend
      if (values.length >= 10) {
        const firstHalf = values.slice(0, Math.floor(values.length / 2));
        const secondHalf = values.slice(Math.floor(values.length / 2));
        const firstAvg = firstHalf.reduce((a: number, b: number) => a + b, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((a: number, b: number) => a + b, 0) / secondHalf.length;

        if (secondAvg < firstAvg * 0.85) {
          const decline = ((firstAvg - secondAvg) / firstAvg * 100).toFixed(1);
          patterns.push({
            type: 'metric_declining',
            severity: 'high',
            data: { metric, firstAvg, secondAvg, decline, values: recentData },
            insight: `${metric.name} has declined ${decline}% in recent period`
          });
        }
      }

      // Pattern 3: High variability
      const mean = avg;
      const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
      const stdDev = Math.sqrt(variance);
      const cv = (stdDev / mean) * 100; // Coefficient of variation

      if (cv > 30) {
        patterns.push({
          type: 'high_variability',
          severity: cv > 50 ? 'high' : 'medium',
          data: { metric, mean, stdDev, cv: cv.toFixed(1), values: recentData },
          insight: `${metric.name} shows high variability (CV: ${cv.toFixed(1)}%) - process is unstable`
        });
      }
    }

    return patterns;
  }

  private async analyzeAnomalies(): Promise<DataPattern[]> {
    const patterns: DataPattern[] = [];
    const orgId = await this.getOrganizationId();
    if (!orgId) return patterns;

    const { data: anomalies } = await supabase
      .from('anomalies')
      .select('*')
      .eq('organization_id', orgId)
      .eq('status', 'open')
      .gte('detected_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('detected_at', { ascending: false });

    if (!anomalies || anomalies.length === 0) return patterns;

    // Group by metric
    const anomalyGroups = anomalies.reduce((acc: any, anomaly) => {
      const key = anomaly.metric_id || 'unknown';
      if (!acc[key]) acc[key] = [];
      acc[key].push(anomaly);
      return acc;
    }, {});

    for (const [metricId, metricAnomalies] of Object.entries(anomalyGroups)) {
      const count = (metricAnomalies as any[]).length;
      const firstAnomaly = (metricAnomalies as any[])[0];
      
      if (count >= 3) {
        patterns.push({
          type: 'recurring_anomalies',
          severity: count >= 5 ? 'critical' : 'high',
          data: { 
            metricId, 
            metricName: firstAnomaly.metric_name,
            count, 
            anomalies: metricAnomalies 
          },
          insight: `${firstAnomaly.metric_name} has ${count} unresolved anomalies - indicates systemic issue`
        });
      }
    }

    return patterns;
  }

  private async analyzeForecasts(): Promise<DataPattern[]> {
    const patterns: DataPattern[] = [];
    const orgId = await this.getOrganizationId();
    if (!orgId) return patterns;

    const { data: forecasts } = await supabase
      .from('forecasts')
      .select('*')
      .eq('organization_id', orgId)
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false });

    if (!forecasts) return patterns;

    for (const forecast of forecasts) {
      const predictions = forecast.predictions || [];
      if (predictions.length === 0) continue;

      const values = predictions.map((p: any) => p.value);
      const firstValue = values[0];
      const lastValue = values[values.length - 1];

      // Pattern: Negative forecast trend
      if (lastValue < firstValue * 0.85) {
        const decline = ((firstValue - lastValue) / firstValue * 100).toFixed(1);
        patterns.push({
          type: 'negative_forecast',
          severity: 'high',
          data: { forecast, decline, firstValue, lastValue, predictions },
          insight: `${forecast.metric_name} forecast shows ${decline}% decline over next ${predictions.length} periods`
        });
      }

      // Pattern: Positive forecast trend (sustain opportunity)
      if (lastValue > firstValue * 1.15) {
        const growth = ((lastValue - firstValue) / firstValue * 100).toFixed(1);
        patterns.push({
          type: 'positive_forecast',
          severity: 'low',
          data: { forecast, growth, firstValue, lastValue, predictions },
          insight: `${forecast.metric_name} forecast shows ${growth}% growth - opportunity to sustain momentum`
        });
      }
    }

    return patterns;
  }

  private createRecommendation(pattern: DataPattern, organizationId: string): Recommendation | null {
    if (!meetsRecommendationGate(pattern)) {
      return null;
    }

    const signature = buildRecommendationSignature(pattern);
    const evidenceStrength = getPatternEvidenceStrength(pattern);
    const refreshTimestamp = getPatternRefreshTimestamp(pattern);
    const nowIso = new Date().toISOString();
    const sourceData: RecommendationSourceDataShape = appendLifecycleEvent(
      {
        pattern_type: pattern.type,
        signature,
        evidence_strength: evidenceStrength,
        generated_from: getPatternGeneratedFrom(pattern),
        refresh_timestamp: refreshTimestamp,
        review_after: addDaysIso(RECOMMENDATION_REVIEW_WINDOW_DAYS),
        expires_at: addDaysIso(RECOMMENDATION_EXPIRY_WINDOW_DAYS),
        canonical_kind: 'recommendation_signal',
        raw: pattern.data
      },
      {
        event: 'generated',
        at: nowIso,
        actor_id: this.userId,
        note: pattern.insight
      }
    );

    const baseRecommendation = {
      user_id: this.userId,
      organization_id: organizationId,
      status: 'pending' as const,
      created_at: nowIso,
      updated_at: nowIso,
      source_data: sourceData
    };

    switch (pattern.type) {
      case 'metric_below_target':
        return {
          ...baseRecommendation,
          id: crypto.randomUUID(),
          title: `Improve ${pattern.data.metric.name} to Target`,
          description: `${pattern.data.metric.name} is currently ${pattern.data.gap}% below target. Current average: ${pattern.data.avg.toFixed(2)} ${pattern.data.metric.unit || ''}, Target: ${pattern.data.target} ${pattern.data.metric.unit || ''}. Closing this gap is critical for meeting performance goals.`,
          category: 'performance',
          priority: pattern.severity,
          impact_score: 85,
          effort_score: 60,
          confidence_score: 90,
          recommended_actions: [
            'Conduct root cause analysis to identify performance bottlenecks',
            'Review recent process changes that may have impacted results',
            'Set up daily monitoring dashboard to track improvement progress',
            'Create detailed action plan with specific milestones and owners',
            'Implement quick wins to show immediate improvement'
          ],
          expected_impact: `Closing this ${pattern.data.gap}% gap could bring ${pattern.data.metric.name} back to target levels, improving overall operational performance.`
        };

      case 'metric_declining':
        return {
          ...baseRecommendation,
          id: crypto.randomUUID(),
          title: `Reverse Declining Trend in ${pattern.data.metric.name}`,
          description: `${pattern.data.metric.name} has declined ${pattern.data.decline}% in the recent period (from ${pattern.data.firstAvg.toFixed(2)} to ${pattern.data.secondAvg.toFixed(2)}). Early intervention can prevent further deterioration.`,
          category: 'performance',
          priority: 'high',
          impact_score: 80,
          effort_score: 50,
          confidence_score: 85,
          recommended_actions: [
            'Analyze what changed during the decline period (people, process, materials, equipment)',
            'Compare current performance with historical benchmarks',
            'Interview frontline staff about recent challenges or changes',
            'Implement corrective actions to reverse the trend',
            'Set up weekly reviews until performance stabilizes'
          ],
          expected_impact: `Reversing this trend could recover ${pattern.data.decline}% performance loss and prevent further decline.`
        };

      case 'high_variability':
        return {
          ...baseRecommendation,
          id: crypto.randomUUID(),
          title: `Reduce Variability in ${pattern.data.metric.name}`,
          description: `${pattern.data.metric.name} shows high variability (Coefficient of Variation: ${pattern.data.cv}%). High variability indicates an unstable process that produces inconsistent results.`,
          category: 'quality',
          priority: pattern.severity,
          impact_score: 75,
          effort_score: 65,
          confidence_score: 88,
          recommended_actions: [
            'Identify and eliminate special causes of variation',
            'Standardize work procedures to reduce process variation',
            'Implement statistical process control (SPC) charts',
            'Train operators on consistent execution methods',
            'Review and update process documentation'
          ],
          expected_impact: 'Reducing variability will improve process predictability, quality consistency, and customer satisfaction.'
        };

      case 'recurring_anomalies':
        return {
          ...baseRecommendation,
          id: crypto.randomUUID(),
          title: `Fix Systemic Issue Causing ${pattern.data.metricName} Anomalies`,
          description: `${pattern.data.metricName} has ${pattern.data.count} unresolved anomalies in the last 30 days. This pattern suggests an underlying systemic issue rather than random variation.`,
          category: 'quality',
          priority: pattern.severity,
          impact_score: 90,
          effort_score: 70,
          confidence_score: 95,
          recommended_actions: [
            'Map the end-to-end process flow for this metric',
            'Identify common factors across all anomaly occurrences',
            'Use fishbone diagram and 5 Whys to find root cause',
            'Implement process controls to prevent recurrence',
            'Document lessons learned and update SOPs'
          ],
          expected_impact: `Fixing the root cause could eliminate ${pattern.data.count}+ anomalies per month and improve process stability by 40-60%.`
        };

      case 'negative_forecast':
        return {
          ...baseRecommendation,
          id: crypto.randomUUID(),
          title: `Prevent Predicted Decline in ${pattern.data.forecast.metric_name}`,
          description: `Forecasts predict a ${pattern.data.decline}% decline in ${pattern.data.forecast.metric_name} over the next ${pattern.data.predictions.length} periods. Taking proactive action now can change this trajectory.`,
          category: 'risk',
          priority: 'high',
          impact_score: 85,
          effort_score: 65,
          confidence_score: 80,
          recommended_actions: [
            'Develop contingency plan for predicted decline scenario',
            'Identify leading indicators to monitor for early warning signs',
            'Launch preventive initiatives immediately to change trajectory',
            'Allocate additional resources to high-impact improvement areas',
            'Review forecast weekly and adjust strategy based on actual results'
          ],
          expected_impact: `Proactive intervention could prevent ${pattern.data.decline}% decline and maintain or improve current performance levels.`
        };

      case 'positive_forecast':
        return {
          ...baseRecommendation,
          id: crypto.randomUUID(),
          title: `Sustain Positive Momentum in ${pattern.data.forecast.metric_name}`,
          description: `Forecasts predict ${pattern.data.growth}% growth in ${pattern.data.forecast.metric_name}. This is an opportunity to sustain and accelerate positive momentum.`,
          category: 'performance',
          priority: 'low',
          impact_score: 70,
          effort_score: 40,
          confidence_score: 75,
          recommended_actions: [
            'Document what is working well to replicate success',
            'Share best practices across teams and departments',
            'Invest in resources that are driving positive results',
            'Set stretch goals to accelerate improvement',
            'Recognize and reward teams contributing to success'
          ],
          expected_impact: `Sustaining this momentum could achieve ${pattern.data.growth}%+ improvement and establish new performance baseline.`
        };

      default:
        return null;
    }
  }

  async getRecommendations(filters?: {
    status?: string;
    category?: string;
    priority?: string;
  }): Promise<Recommendation[]> {
    const orgId = await this.getOrganizationId();
    if (!orgId) return [];

    let query = supabase
      .from('recommendations')
      .select('*')
      .eq('organization_id', orgId);

    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.category) query = query.eq('category', filters.category);
    if (filters?.priority) query = query.eq('priority', filters.priority);

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching recommendations:', error);
      return [];
    }

    return data || [];
  }

  async startRecommendation(id: string, assignedTo?: string): Promise<boolean> {
    const orgId = await this.getOrganizationId();
    if (!orgId) return false;

    const { data: existing } = await supabase
      .from('recommendations')
      .select('source_data')
      .eq('id', id)
      .eq('organization_id', orgId)
      .maybeSingle();

    const updates: any = {
      status: 'in_progress',
      updated_at: new Date().toISOString(),
      source_data: appendLifecycleEvent(existing?.source_data, {
        event: 'started',
        at: new Date().toISOString(),
        actor_id: this.userId
      })
    };
    if (assignedTo) updates.assigned_to = assignedTo;

    const { error } = await supabase
      .from('recommendations')
      .update(updates)
      .eq('id', id)
      .eq('organization_id', orgId);

    return !error;
  }

  async completeRecommendation(id: string, actualImpact?: string, notes?: string): Promise<boolean> {
    const orgId = await this.getOrganizationId();
    if (!orgId) return false;

    const { data: existing } = await supabase
      .from('recommendations')
      .select('source_data')
      .eq('id', id)
      .eq('organization_id', orgId)
      .maybeSingle();

    const updates: any = {
      status: 'completed',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      source_data: appendLifecycleEvent(existing?.source_data, {
        event: 'completed',
        at: new Date().toISOString(),
        actor_id: this.userId,
        note: notes || actualImpact
      })
    };
    if (actualImpact) updates.actual_impact = actualImpact;
    if (notes) updates.implementation_notes = notes;

    const { error } = await supabase
      .from('recommendations')
      .update(updates)
      .eq('id', id)
      .eq('organization_id', orgId);

    return !error;
  }

  async dismissRecommendation(id: string, reason?: string): Promise<boolean> {
    const orgId = await this.getOrganizationId();
    if (!orgId) return false;

    const { data: existing } = await supabase
      .from('recommendations')
      .select('source_data')
      .eq('id', id)
      .eq('organization_id', orgId)
      .maybeSingle();

    const { error } = await supabase
      .from('recommendations')
      .update({
        status: 'dismissed',
        dismissed_at: new Date().toISOString(),
        dismissed_reason: reason,
        updated_at: new Date().toISOString(),
        source_data: appendLifecycleEvent(existing?.source_data, {
          event: 'dismissed',
          at: new Date().toISOString(),
          actor_id: this.userId,
          note: reason
        })
      })
      .eq('id', id)
      .eq('organization_id', orgId);

    return !error;
  }

  async getStatistics(): Promise<{
    total: number;
    open: number;
    pending: number;
    inProgress: number;
    completed: number;
    dismissed: number;
    byCategory: Record<string, number>;
    byPriority: Record<string, number>;
    avgImpactScore: number;
    avgEffortScore: number;
  }> {
    const orgId = await this.getOrganizationId();
    if (!orgId) {
      return {
        total: 0, open: 0, pending: 0, inProgress: 0, completed: 0, dismissed: 0,
        byCategory: {}, byPriority: {}, avgImpactScore: 0, avgEffortScore: 0
      };
    }

    const { data: recommendations } = await supabase
      .from('recommendations')
      .select('*')
      .eq('organization_id', orgId);

    if (!recommendations || recommendations.length === 0) {
      return {
        total: 0, open: 0, pending: 0, inProgress: 0, completed: 0, dismissed: 0,
        byCategory: {}, byPriority: {}, avgImpactScore: 0, avgEffortScore: 0
      };
    }

    const summary = summarizeAIMRecommendations(recommendations as Recommendation[]);

    const stats = {
      total: summary.total,
      open: summary.open,
      pending: summary.pending,
      inProgress: summary.inProgress,
      completed: summary.completed,
      dismissed: summary.dismissed,
      byCategory: {} as Record<string, number>,
      byPriority: {} as Record<string, number>,
      avgImpactScore: summary.avgImpactScore,
      avgEffortScore: summary.avgEffortScore
    };

    recommendations.forEach(r => {
      stats.byCategory[r.category] = (stats.byCategory[r.category] || 0) + 1;
      stats.byPriority[r.priority] = (stats.byPriority[r.priority] || 0) + 1;
    });

    return stats;
  }
}
