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

export class RecommendationGenerationError extends Error {
  code: 'persistence_failed' | 'reactivation_failed';
  diagnostics: Record<string, unknown>;

  constructor(
    code: 'persistence_failed' | 'reactivation_failed',
    message: string,
    diagnostics: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'RecommendationGenerationError';
    this.code = code;
    this.diagnostics = diagnostics;
  }
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
const RECOMMENDATION_DISMISS_COOLDOWN_DAYS = 2;
const RECOMMENDATION_COMPLETE_COOLDOWN_DAYS = 3;

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
  if (pattern.type === 'active_alert_pressure') {
    return pattern.data?.alert?.created_at ?? null;
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
    case 'active_alert_pressure':
      return Math.min(
        100,
        52 +
          normalizePatternNumber(pattern.data?.alert?.confidence) * 0.35 +
          (normalizePatternNumber(pattern.data?.alert?.days_until) > 0
            ? Math.max(0, 30 - normalizePatternNumber(pattern.data?.alert?.days_until)) * 0.8
            : 0) +
          (pattern.severity === 'critical' ? 12 : pattern.severity === 'high' ? 8 : 0)
      );
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
      return evidenceStrength >= 60 && normalizePatternNumber(pattern.data?.decline) >= 8;
    case 'positive_forecast':
      return evidenceStrength >= 72 && normalizePatternNumber(pattern.data?.growth) >= 20;
    case 'active_alert_pressure':
      return (
        evidenceStrength >= 55 &&
        (
          normalizePatternNumber(pattern.data?.alert?.confidence) >= 60 ||
          normalizePatternNumber(pattern.data?.alert?.days_until) <= 30 ||
          pattern.severity === 'critical' ||
          pattern.severity === 'high' ||
          (
            pattern.severity === 'medium' &&
            normalizePatternNumber(pattern.data?.alert?.days_until) > 0 &&
            normalizePatternNumber(pattern.data?.alert?.days_until) <= 45
          )
        )
      );
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
    case 'active_alert_pressure':
      return `${pattern.type}::${pattern.data?.alert?.metric_id || pattern.data?.alert?.title || 'alertless'}::${pattern.data?.alert?.alert_type || 'signal'}`;
    default:
      return `${pattern.type}::generic`;
  }
}

function buildDirectionalWatchSignature(pattern: DataPattern): string {
  if (pattern.type === 'active_alert_pressure') {
    return `directional_watch_review::${pattern.data?.alert?.metric_id || pattern.data?.alert?.title || 'alertless'}::${pattern.data?.alert?.alert_type || 'signal'}`;
  }
  return `directional_watch_review::${pattern.type}`;
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
    case 'active_alert_pressure':
      return ['alerts', 'metrics'];
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

function replaceTags(existingTags: string[] | null | undefined, nextTags: string[], tagsToRemove: string[] = []) {
  const base = Array.isArray(existingTags) ? existingTags.filter((tag) => typeof tag === 'string') : [];
  const filtered = base.filter((tag) => !tagsToRemove.includes(tag) && !tag.startsWith('aim-outcome:') && !tag.startsWith('aim-verification:'));
  return Array.from(new Set([...filtered, ...nextTags]));
}

function isAlertPressureRecommendation(rec: Recommendation | { source_data?: any }) {
  return rec.source_data?.pattern_type === 'active_alert_pressure';
}

function canBypassCooldown(rec: Recommendation | { source_data?: any; confidence_score?: number }) {
  return isAlertPressureRecommendation(rec) && (rec.confidence_score || 0) >= 68;
}

function isRecommendationOrgColumnError(error: { message?: string } | null | undefined) {
  return typeof error?.message === 'string' && error.message.includes("organization_id");
}

function buildRecommendationInsertVariants(rec: Recommendation) {
  const fullPayload = { ...rec };
  const withoutId = { ...fullPayload };
  delete (withoutId as any).id;

  const withoutOrganizationId = { ...withoutId };
  delete (withoutOrganizationId as any).organization_id;

  const withoutRichMetadata = {
    user_id: rec.user_id,
    organization_id: rec.organization_id,
    title: rec.title,
    description: rec.description,
    category: rec.category,
    priority: rec.priority,
    impact_score: rec.impact_score,
    effort_score: rec.effort_score,
    confidence_score: rec.confidence_score,
    status: rec.status,
    created_at: rec.created_at,
    updated_at: rec.updated_at,
  };

  const withoutRichMetadataOrg = { ...withoutRichMetadata };
  delete (withoutRichMetadataOrg as any).organization_id;

  const minimalPayload = {
    user_id: rec.user_id,
    organization_id: rec.organization_id,
    title: rec.title,
    description: rec.description,
    status: rec.status,
    created_at: rec.created_at,
    updated_at: rec.updated_at,
  };

  const minimalPayloadOrg = { ...minimalPayload };
  delete (minimalPayloadOrg as any).organization_id;

  return [fullPayload, withoutId, withoutOrganizationId, withoutRichMetadata, withoutRichMetadataOrg, minimalPayload, minimalPayloadOrg];
}

export class RecommendationsEngine {
  private userId: string;
  private organizationId: string | null = null;
  private recommendationScope: 'organization' | 'user' = 'organization';

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

  private async syncLinkedActionItems(
    recommendationId: string,
    nextTags: string[],
    options?: {
      status?: string;
      progress?: number;
    }
  ) {
    const orgId = await this.getOrganizationId();
    if (!orgId) return;

    const recTag = `rec:${recommendationId}`;
    const { data: linkedItems } = await supabase
      .from('action_items')
      .select('id, tags')
      .eq('organization_id', orgId)
      .contains('tags', [recTag]);

    if (!linkedItems || linkedItems.length === 0) return;

    await Promise.all(
      linkedItems.map((item: any) =>
        supabase
          .from('action_items')
          .update({
            ...(options?.status ? { status: options.status } : {}),
            ...(typeof options?.progress === 'number' ? { progress: options.progress } : {}),
            tags: replaceTags(item.tags, [recTag, ...nextTags])
          })
          .eq('id', item.id)
          .eq('organization_id', orgId)
      )
    );
  }

  private recommendationQuery() {
    return supabase.from('recommendations').select('*');
  }

  private async getRecommendationsByScope(extra?: (query: any) => any): Promise<Recommendation[]> {
    const orgId = await this.getOrganizationId();
    if (!orgId && !this.userId) return [];

    const apply = (query: any) => (extra ? extra(query) : query);

    if (this.recommendationScope === 'organization' && orgId) {
      const { data, error } = await apply(this.recommendationQuery().eq('organization_id', orgId)).order('created_at', { ascending: false });
      if (!error) return (data || []) as Recommendation[];
      if (!isRecommendationOrgColumnError(error)) {
        console.error('Error fetching recommendations:', error);
        return [];
      }
      this.recommendationScope = 'user';
    }

    const { data, error } = await apply(this.recommendationQuery().eq('user_id', this.userId)).order('created_at', { ascending: false });
    if (error) {
      console.error('Error fetching recommendations:', error);
      return [];
    }
    return (data || []) as Recommendation[];
  }

  private async getRecommendationById(id: string): Promise<Recommendation | null> {
    const orgId = await this.getOrganizationId();

    if (this.recommendationScope === 'organization' && orgId) {
      const { data, error } = await supabase
        .from('recommendations')
        .select('*')
        .eq('id', id)
        .eq('organization_id', orgId)
        .maybeSingle();

      if (!error) return (data as Recommendation | null) || null;
      if (!isRecommendationOrgColumnError(error)) {
        console.error('Error fetching recommendation:', error);
        return null;
      }
      this.recommendationScope = 'user';
    }

    const { data, error } = await supabase
      .from('recommendations')
      .select('*')
      .eq('id', id)
      .eq('user_id', this.userId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching recommendation:', error);
      return null;
    }

    return (data as Recommendation | null) || null;
  }

  private async updateRecommendationById(id: string, updates: Record<string, any>) {
    const orgId = await this.getOrganizationId();

    if (this.recommendationScope === 'organization' && orgId) {
      const { data, error } = await supabase
        .from('recommendations')
        .update(updates)
        .eq('id', id)
        .eq('organization_id', orgId)
        .select()
        .maybeSingle();

      if (!error) return { data: (data as Recommendation | null) || null, error: null };
      if (!isRecommendationOrgColumnError(error)) {
        return { data: null, error };
      }
      this.recommendationScope = 'user';
    }

    const { data, error } = await supabase
      .from('recommendations')
      .update(updates)
      .eq('id', id)
      .eq('user_id', this.userId)
      .select()
      .maybeSingle();

    return { data: (data as Recommendation | null) || null, error };
  }

  async generateRecommendations(): Promise<Recommendation[]> {
    const patterns = await this.analyzeDataPatterns();
    const orgId = await this.getOrganizationId();
    if (!orgId) return [];
    const recommendations: Recommendation[] = [];
    const diagnostics = {
      patternsAnalyzed: patterns.length,
      alertPressurePatterns: patterns.filter((pattern) => pattern.type === 'active_alert_pressure').length,
      createdCandidates: 0,
      candidateRecommendations: 0,
      reactivated: 0,
      inserted: 0,
    };

    for (const pattern of patterns) {
      const recommendation = this.createRecommendation(pattern, orgId);
      if (recommendation) {
        recommendations.push(recommendation);
      }
    }
    diagnostics.createdCandidates = recommendations.length;

    if (recommendations.length === 0) {
      const directionalWatchPattern = [...patterns]
        .filter((pattern) => pattern.type === 'active_alert_pressure')
        .sort((a, b) => {
          const severityRank = { critical: 4, high: 3, medium: 2, low: 1 };
          const severityDelta = severityRank[b.severity] - severityRank[a.severity];
          if (severityDelta !== 0) return severityDelta;
          return getPatternEvidenceStrength(b) - getPatternEvidenceStrength(a);
        })[0];

      if (directionalWatchPattern) {
        const fallbackRecommendation = this.createDirectionalRecommendation(directionalWatchPattern, orgId);
        if (fallbackRecommendation) {
          recommendations.push(fallbackRecommendation);
        }
      }
    }

    if (recommendations.length > 0) {
      const cutoffIso = new Date(
        Date.now() - RECOMMENDATION_RECENT_DUPLICATE_WINDOW_DAYS * 24 * 60 * 60 * 1000
      ).toISOString();

      const recentExisting = await this.getRecommendationsByScope((query) => query.gte('created_at', cutoffIso));
      const allExisting = await this.getRecommendationsByScope((query) => query.limit(250));
      const existing = recentExisting || [];

      const activeSignatures = new Set(
        existing
          .filter((rec) => ['pending', 'in_progress'].includes(rec.status))
          .map((rec) => rec.source_data?.signature)
          .filter(Boolean)
      );

      const coolingDismissedSignatures = new Set(
        existing
          .filter((rec) => {
            if (rec.status !== 'dismissed') return false;
            const dismissedAt = rec.dismissed_at || rec.updated_at || rec.created_at;
            return Date.now() - new Date(dismissedAt).getTime() <= RECOMMENDATION_DISMISS_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
          })
          .map((rec) => rec.source_data?.signature)
          .filter(Boolean)
      );

      const recentlyCompletedSignatures = new Set(
        existing
          .filter((rec) => {
            if (rec.status !== 'completed') return false;
            const completedAt = rec.completed_at || rec.updated_at || rec.created_at;
            return Date.now() - new Date(completedAt).getTime() <= RECOMMENDATION_COMPLETE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
          })
          .map((rec) => rec.source_data?.signature)
          .filter(Boolean)
      );

      const seenSignatures = new Set<string>();
      const candidateRecommendations = recommendations.filter((rec) => {
        const signature = rec.source_data?.signature;
        if (!signature) return true;
        if (seenSignatures.has(signature)) return false;
        seenSignatures.add(signature);
        if (activeSignatures.has(signature)) return false;
        const allowAlertRepromotion = canBypassCooldown(rec);
        if (!allowAlertRepromotion && coolingDismissedSignatures.has(signature)) return false;
        if (!allowAlertRepromotion && recentlyCompletedSignatures.has(signature)) return false;
        return true;
      });
      diagnostics.candidateRecommendations = candidateRecommendations.length;

      if (candidateRecommendations.length === 0) {
        return [];
      }

      const reopenableBySignature = new Map<string, Recommendation>();
      const reopenableByTitle = new Map<string, Recommendation>();
      for (const rec of allExisting) {
        if (rec.status === 'pending' || rec.status === 'in_progress') continue;
        const signature = rec.source_data?.signature;
        if (signature && !reopenableBySignature.has(signature)) {
          reopenableBySignature.set(signature, rec);
        }
        if (rec.title && !reopenableByTitle.has(rec.title)) {
          reopenableByTitle.set(rec.title, rec);
        }
      }

      const recommendationsToReactivate: Array<{
        existing: Recommendation;
        next: Recommendation;
      }> = [];
      const recommendationsToInsert: Recommendation[] = [];

      for (const rec of candidateRecommendations) {
        const signature = rec.source_data?.signature;
        const existingMatch =
          (signature ? reopenableBySignature.get(signature) : undefined) ||
          reopenableByTitle.get(rec.title);

        if (existingMatch) {
          recommendationsToReactivate.push({ existing: existingMatch, next: rec });
          if (signature) reopenableBySignature.delete(signature);
          reopenableByTitle.delete(rec.title);
          continue;
        }

        recommendationsToInsert.push(rec);
      }

      const reactivatedResults: Recommendation[] = [];
      for (const item of recommendationsToReactivate) {
        const nextSourceData = appendLifecycleEvent(item.next.source_data, {
          event: 'generated',
          at: new Date().toISOString(),
          actor_id: this.userId,
          note: item.next.description,
        });

        const { data: reactivated, error: reactivateError } = await this.updateRecommendationById(item.existing.id, {
            title: item.next.title,
            description: item.next.description,
            category: item.next.category,
            priority: item.next.priority,
            impact_score: item.next.impact_score,
            effort_score: item.next.effort_score,
            confidence_score: item.next.confidence_score,
            status: 'pending',
            recommended_actions: item.next.recommended_actions,
            expected_impact: item.next.expected_impact,
            actual_impact: null,
            implementation_notes: null,
            assigned_to: null,
            due_date: null,
            completed_at: null,
            dismissed_at: null,
            dismissed_reason: null,
            updated_at: new Date().toISOString(),
            source_data: nextSourceData,
          });

        if (!reactivateError && reactivated) {
          reactivatedResults.push(reactivated as Recommendation);
        }
      }
      diagnostics.reactivated = reactivatedResults.length;

      let insertedResults: Recommendation[] = [];
      if (recommendationsToInsert.length > 0) {
        let insertErrorMessage = '';
        for (const recommendation of recommendationsToInsert) {
          let insertedRow: Recommendation | null = null;
          let lastError: any = null;

          for (const payload of buildRecommendationInsertVariants(recommendation)) {
            const { data, error } = await supabase
              .from('recommendations')
              .insert(payload)
              .select()
              .maybeSingle();

            if (!error && data) {
              insertedRow = data as Recommendation;
              break;
            }

            lastError = error;
          }

          if (insertedRow) {
            insertedResults.push(insertedRow);
            continue;
          }

          insertErrorMessage = lastError?.message || 'Unknown persistence error';
          console.error('Error saving recommendation:', lastError);
          if (reactivatedResults.length > 0 || insertedResults.length > 0) {
            return [...reactivatedResults, ...insertedResults];
          }
          throw new RecommendationGenerationError(
            'persistence_failed',
            'AIM found promotable recommendation signals but could not persist them.',
            {
              ...diagnostics,
              attemptedInsert: recommendationsToInsert.length,
              insertError: insertErrorMessage,
            }
          );
        }
      }
      diagnostics.inserted = insertedResults.length;

      if (
        candidateRecommendations.length > 0 &&
        reactivatedResults.length === 0 &&
        insertedResults.length === 0
      ) {
        throw new RecommendationGenerationError(
          'reactivation_failed',
          'AIM found promotable recommendation signals but could not activate any live recommendation records.',
          diagnostics
        );
      }

      return [...reactivatedResults, ...insertedResults];
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

    const alertPatterns = await this.analyzeAlertSignals();
    patterns.push(...alertPatterns);

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

  private async analyzeAlertSignals(): Promise<DataPattern[]> {
    const patterns: DataPattern[] = [];
    const orgId = await this.getOrganizationId();
    if (!orgId) return patterns;

    const { data: alerts } = await supabase
      .from('alerts')
      .select('id, metric_id, title, description, message, severity, alert_type, status, category, confidence, days_until, created_at')
      .eq('organization_id', orgId)
      .in('status', ['new', 'acknowledged'])
      .order('created_at', { ascending: false })
      .limit(30);

    if (!alerts || alerts.length === 0) return patterns;

    const seenKeys = new Set<string>();

    for (const alert of alerts) {
      const dedupeKey = `${alert.metric_id || alert.title || alert.id}::${alert.alert_type || alert.category || 'signal'}`;
      if (seenKeys.has(dedupeKey)) continue;
      seenKeys.add(dedupeKey);

      const severity = (['critical', 'high', 'medium', 'low'].includes(alert.severity)
        ? alert.severity
        : 'medium') as DataPattern['severity'];
      const confidence = normalizePatternNumber(alert.confidence);
      const daysUntil = normalizePatternNumber(alert.days_until);
      const shouldPromote =
        severity === 'critical' ||
        severity === 'high' ||
        confidence >= 60 ||
        (daysUntil > 0 && daysUntil <= 45);

      if (!shouldPromote) continue;

      patterns.push({
        type: 'active_alert_pressure',
        severity,
        data: {
          alert,
          confidence,
          daysUntil,
        },
        insight:
          alert.description ||
          alert.message ||
          `${alert.title} is showing enough sustained pressure to justify operator review and potential intervention.`,
      });
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

      case 'active_alert_pressure':
        return {
          ...baseRecommendation,
          id: crypto.randomUUID(),
          title: `Respond to ${pattern.data.alert.title}`,
          description:
            pattern.insight ||
            `${pattern.data.alert.title} is now strong enough to move from watch mode into guided operator response.`,
          category: 'risk',
          priority: pattern.severity,
          impact_score:
            pattern.severity === 'critical'
              ? 88
              : pattern.severity === 'high'
                ? 78
                : 68,
          effort_score:
            pattern.severity === 'critical'
              ? 58
              : pattern.severity === 'high'
                ? 52
                : 45,
          confidence_score: Math.max(68, Math.min(96, getPatternEvidenceStrength(pattern))),
          recommended_actions: [
            'Review the leading signal and validate the underlying source metric or workflow pressure.',
            'Assign an owner to confirm whether the condition is persistent or transient.',
            'Take the highest-leverage corrective step from the linked response actions.',
            'Recheck the signal after the next refresh cycle and capture whether conditions improved.'
          ],
          expected_impact:
            pattern.data.daysUntil > 0
              ? `Acting inside the ${pattern.data.daysUntil}-day lead window should reduce the chance of this signal becoming an operating incident.`
              : 'Acting now should reduce the chance of this alert family escalating into a larger operating incident.',
        };

      default:
        return null;
    }
  }

  private createDirectionalRecommendation(pattern: DataPattern, organizationId: string): Recommendation | null {
    if (pattern.type !== 'active_alert_pressure') return null;

    const nowIso = new Date().toISOString();
    const sourceData: RecommendationSourceDataShape = appendLifecycleEvent(
      {
        pattern_type: pattern.type,
        signature: buildDirectionalWatchSignature(pattern),
        evidence_strength: Math.max(50, getPatternEvidenceStrength(pattern) - 6),
        generated_from: [...getPatternGeneratedFrom(pattern), 'watch_signals'],
        refresh_timestamp: getPatternRefreshTimestamp(pattern),
        review_after: addDaysIso(7),
        expires_at: addDaysIso(21),
        canonical_kind: 'recommendation_signal',
        decision_state: 'directional',
        raw: pattern.data,
      },
      {
        event: 'generated',
        at: nowIso,
        actor_id: this.userId,
        note: `Directional watch signal promoted for operator review: ${pattern.insight}`,
      }
    );

    return {
      id: crypto.randomUUID(),
      user_id: this.userId,
      organization_id: organizationId,
      title: `Validate response for ${pattern.data.alert.title}`,
      description:
        `${pattern.data.alert.title} has not yet crossed the full action-ready threshold, but it has remained strong enough to justify an operator review and a response decision.`,
      category: 'risk',
      priority: pattern.severity === 'critical' ? 'high' : pattern.severity,
      impact_score: pattern.severity === 'critical' ? 78 : pattern.severity === 'high' ? 72 : 64,
      effort_score: 32,
      confidence_score: Math.max(60, Math.min(82, getPatternEvidenceStrength(pattern))),
      status: 'pending',
      recommended_actions: [
        'Confirm whether the signal is still active on the latest refresh cycle.',
        'Review the linked response actions and choose the lowest-risk intervention.',
        'Assign an owner to verify whether the pressure is persistent or transient.',
        'Promote this into a full corrective action only if the next refresh confirms continued pressure.'
      ],
      expected_impact:
        'This recommendation is intended to close the evidence gap quickly and decide whether the signal should become a full corrective action.',
      created_at: nowIso,
      updated_at: nowIso,
      source_data: sourceData,
    };
  }

  async getRecommendations(filters?: {
    status?: string;
    category?: string;
    priority?: string;
  }): Promise<Recommendation[]> {
    return this.getRecommendationsByScope((query) => {
      let next = query;
      if (filters?.status) next = next.eq('status', filters.status);
      if (filters?.category) next = next.eq('category', filters.category);
      if (filters?.priority) next = next.eq('priority', filters.priority);
      return next;
    });
  }

  async startRecommendation(id: string, assignedTo?: string): Promise<boolean> {
    const existing = await this.getRecommendationById(id);

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

    const { error } = await this.updateRecommendationById(id, updates);

    if (!error) {
      await this.syncLinkedActionItems(id, ['aim-source:recommendation', 'aim-outcome:monitoring', 'aim-verification:pending'], {
        status: 'in_progress',
        progress: 35,
      });
    }

    return !error;
  }

  async completeRecommendation(id: string, actualImpact?: string, notes?: string): Promise<boolean> {
    const existing = await this.getRecommendationById(id);

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

    const { error } = await this.updateRecommendationById(id, updates);

    if (!error) {
      await this.syncLinkedActionItems(
        id,
        [
          'aim-source:recommendation',
          actualImpact ? 'aim-outcome:captured' : 'aim-outcome:awaiting_verification',
          actualImpact ? 'aim-verification:complete' : 'aim-verification:pending',
        ],
        {
          status: 'completed',
          progress: 100,
        }
      );
    }

    return !error;
  }

  async dismissRecommendation(id: string, reason?: string): Promise<boolean> {
    const existing = await this.getRecommendationById(id);

    const { error } = await this.updateRecommendationById(id, {
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
      });

    if (!error) {
      await this.syncLinkedActionItems(id, ['aim-source:recommendation', 'aim-outcome:at_risk', 'aim-verification:pending'], {
        status: 'on_hold',
      });
    }

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
    if (!this.userId) {
      return {
        total: 0, open: 0, pending: 0, inProgress: 0, completed: 0, dismissed: 0,
        byCategory: {}, byPriority: {}, avgImpactScore: 0, avgEffortScore: 0
      };
    }

    const recommendations = await this.getRecommendationsByScope();

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
