import { supabase } from '../lib/supabase';

export interface QueryResult {
  success: boolean;
  data?: any[];
  visualization?: 'table' | 'line' | 'bar' | 'pie' | 'metric';
  summary?: string;
  sql?: string;
  error?: string;
}

export interface QueryHistory {
  id: string;
  query: string;
  result: QueryResult;
  timestamp: Date;
}

// ─── Schema context sent to the AI ───────────────────────────────────────────
const SCHEMA_CONTEXT = `
You are a SQL expert for a Supabase PostgreSQL database.
Generate ONLY the SQL SELECT query — no explanations, no markdown fences.

Available tables (all use organization_id for multi-tenancy):
- metrics: id, organization_id, name, description, unit, target_value, upper_threshold, lower_threshold, category, created_at
- metric_data: id, metric_id, value, timestamp, source, created_at
- alerts: id, organization_id, metric_id, severity (low/medium/high/critical), message, status (active/resolved), is_read, created_at
- anomalies: id, organization_id, metric_id, severity, anomaly_type, observed_value, expected_value, deviation_percent, confidence, status, detected_at
- dmaic_projects: id, organization_id, name, description, phase, status, created_at
- action_items: id, organization_id, title, description, status, priority, due_date, assigned_to, created_at
- recommendations: id, organization_id, title, description, priority, status, category, created_at
- root_cause_analyses: id, organization_id, title, problem_statement, status, priority, created_at
- forecasts: id, organization_id, metric_id, forecast_date, predicted_value, confidence_interval_lower, confidence_interval_upper, created_at
- kpis: id, organization_id, name, description, unit, target_value, current_value, status, created_at
- kaizen_items: id, organization_id, title, description, status, priority, created_at
- benchmarks: id, organization_id, metric_id, benchmark_value, industry, created_at
- data_sources: id, organization_id, name, type, status, created_at
- uploaded_files: id, organization_id, filename, row_count, column_names, created_at
- simulations: id, organization_id, name, description, parameters, predicted_impact, created_at
- hypothesis_tests: id, organization_id, name, test_type, status, result, created_at

Rules:
1. Always filter by organization_id = '<ORG_ID>'
2. Use SELECT only — no INSERT/UPDATE/DELETE/DROP
3. LIMIT results to 100 rows max
4. Return meaningful column aliases where helpful
5. For time queries use proper date arithmetic
`;

// ─── Intent-based direct query engine (no AI key needed) ─────────────────────
interface ParsedIntent {
  table: string;
  filters: Record<string, any>;
  orderBy?: string;
  orderAsc?: boolean;
  limit: number;
  visualization: 'table' | 'line' | 'bar' | 'pie' | 'metric';
  summaryTemplate: string;
}

function parseIntent(query: string, orgId: string): ParsedIntent {
  const q = query.toLowerCase();

  // Determine table
  let table = 'metrics';
  if (q.includes('alert') || q.includes('notification')) table = 'alerts';
  else if (q.includes('anomal')) table = 'anomalies';
  else if (q.includes('project') || q.includes('dmaic')) table = 'dmaic_projects';
  else if (q.includes('action') || q.includes('task')) table = 'action_items';
  else if (q.includes('recommend')) table = 'recommendations';
  else if (q.includes('root cause') || q.includes('rca')) table = 'root_cause_analyses';
  else if (q.includes('forecast') || q.includes('predict')) table = 'forecasts';
  else if (q.includes('kpi') || q.includes('scorecard')) table = 'kpis';
  else if (q.includes('kaizen')) table = 'kaizen_items';
  else if (q.includes('benchmark')) table = 'benchmarks';
  else if (q.includes('simulation')) table = 'simulations';
  else if (q.includes('hypothesis') || q.includes('test')) table = 'hypothesis_tests';
  else if (q.includes('file') || q.includes('upload') || q.includes('csv')) table = 'uploaded_files';
  else if (q.includes('data source') || q.includes('connection')) table = 'data_sources';
  else if (q.includes('metric') || q.includes('measure') || q.includes('kpi')) table = 'metrics';

  // Filters
  const filters: Record<string, any> = { organization_id: orgId };

  if (q.includes('active')) filters.status = 'active';
  else if (q.includes('resolved')) filters.status = 'resolved';
  else if (q.includes('completed')) filters.status = 'completed';
  else if (q.includes('in progress') || q.includes('in-progress')) filters.status = 'in_progress';
  else if (q.includes('open')) filters.status = 'open';

  if (q.includes('critical')) filters.severity = 'critical';
  else if (q.includes('high')) filters.severity = 'high';
  else if (q.includes('medium')) filters.severity = 'medium';
  else if (q.includes('low')) filters.severity = 'low';

  // Visualization
  let visualization: 'table' | 'line' | 'bar' | 'pie' | 'metric' = 'table';
  if (q.includes('trend') || q.includes('over time') || q.includes('history')) visualization = 'line';
  else if (q.includes('compare') || q.includes('by category') || q.includes('by type') || q.includes('breakdown')) visualization = 'bar';
  else if (q.includes('distribution') || q.includes('share') || q.includes('percentage') || q.includes('proportion')) visualization = 'pie';
  else if (q.includes('how many') || q.includes('count') || q.includes('total')) visualization = 'metric';

  const summaryTemplate = `Showing results from ${table.replace(/_/g, ' ')}`;

  return { table, filters, orderBy: 'created_at', orderAsc: false, limit: 100, visualization, summaryTemplate };
}

async function executeDirectQuery(intent: ParsedIntent): Promise<{ data: any[]; sql: string }> {
  let q = supabase.from(intent.table).select('*');

  for (const [key, val] of Object.entries(intent.filters)) {
    q = q.eq(key, val);
  }

  if (intent.orderBy) {
    q = q.order(intent.orderBy, { ascending: intent.orderAsc ?? false });
  }

  q = q.limit(intent.limit);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const filterDesc = Object.entries(intent.filters)
    .filter(([k]) => k !== 'organization_id')
    .map(([k, v]) => `${k} = '${v}'`)
    .join(' AND ');

  const sql = `SELECT * FROM ${intent.table}${filterDesc ? ` WHERE ${filterDesc}` : ''} ORDER BY created_at DESC LIMIT ${intent.limit}`;

  return { data: data ?? [], sql };
}

// ─── Try Edge Function (optional enhancement) ─────────────────────────────────
async function tryEdgeFunction(sql: string, token: string): Promise<any[] | null> {
  try {
    const url = `${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/execute-nl-query`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ sql }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;
    const json = await res.json();
    return json.data ?? null;
  } catch {
    return null;
  }
}

// ─── AI SQL generation ────────────────────────────────────────────────────────
async function generateSQLWithAI(
  query: string,
  orgId: string,
  apiKey: string,
  provider: 'openai' | 'anthropic'
): Promise<string | null> {
  const systemPrompt = SCHEMA_CONTEXT.replace('<ORG_ID>', orgId);
  const userPrompt = `Generate a SQL query for: "${query}"\n\nReturn ONLY the SQL, nothing else.`;

  try {
    if (provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.1,
          max_tokens: 600,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return null;
      const d = await res.json();
      return d.choices?.[0]?.message?.content?.trim().replace(/```sql\n?/g, '').replace(/```\n?/g, '').trim() ?? null;
    } else {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 600,
          messages: [{ role: 'user', content: `${systemPrompt}\n\n${userPrompt}` }],
          temperature: 0.1,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return null;
      const d = await res.json();
      return d.content?.[0]?.text?.trim().replace(/```sql\n?/g, '').replace(/```\n?/g, '').trim() ?? null;
    }
  } catch {
    return null;
  }
}

// ─── AI summary generation ────────────────────────────────────────────────────
async function generateSummaryWithAI(
  query: string,
  data: any[],
  apiKey: string,
  provider: 'openai' | 'anthropic'
): Promise<string> {
  const preview = JSON.stringify(data.slice(0, 5), null, 2);
  const prompt = `Summarize this query result in 1-2 concise sentences:\n\nQuery: "${query}"\nRows: ${data.length}\nSample:\n${preview}`;

  try {
    if (provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 150,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const d = await res.json();
        return d.choices?.[0]?.message?.content?.trim() ?? '';
      }
    } else {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 150,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const d = await res.json();
        return d.content?.[0]?.text?.trim() ?? '';
      }
    }
  } catch {
    // fall through
  }

  return `Found ${data.length} result${data.length !== 1 ? 's' : ''}.`;
}

// ─── Main service class ───────────────────────────────────────────────────────
class NaturalLanguageQueryService {
  private apiKey: string | null = null;
  private provider: 'openai' | 'anthropic' = 'openai';

  setApiKey(key: string, provider: 'openai' | 'anthropic' = 'openai') {
    this.apiKey = key;
    this.provider = provider;
    localStorage.setItem('nl_query_api_key', key);
    localStorage.setItem('nl_query_provider', provider);
  }

  getApiKey(): string | null {
    if (!this.apiKey) {
      this.apiKey = localStorage.getItem('nl_query_api_key');
      const saved = localStorage.getItem('nl_query_provider');
      if (saved) this.provider = saved as 'openai' | 'anthropic';
    }
    return this.apiKey;
  }

  clearApiKey() {
    this.apiKey = null;
    localStorage.removeItem('nl_query_api_key');
    localStorage.removeItem('nl_query_provider');
  }

  getSuggestedQuestions(): string[] {
    return [
      'Show me all active alerts',
      'What anomalies were detected recently?',
      'List all my metrics',
      'Show critical severity anomalies',
      'What are my active recommendations?',
      'Show open action items',
      'List all DMAIC projects',
      'Show recent forecasts',
      'What KPIs are below target?',
      'Show unresolved root cause analyses',
    ];
  }

  async executeQuery(naturalLanguageQuery: string): Promise<QueryResult> {
    try {
      // 1. Get authenticated user + org
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated. Please sign in.');

      // Resolve organization_id
      const { data: userOrg } = await supabase
        .from('user_organizations')
        .select('organization_id')
        .eq('user_id', user.id)
        .maybeSingle();

      const orgId = userOrg?.organization_id ?? user.id;

      const apiKey = this.getApiKey();

      // 2. If AI key available → try AI-generated SQL path
      if (apiKey) {
        const generatedSQL = await generateSQLWithAI(naturalLanguageQuery, orgId, apiKey, this.provider);

        if (generatedSQL) {
          // Try Edge Function first with AI SQL
          const { data: { session } } = await supabase.auth.getSession();
          let data: any[] | null = null;

          if (session?.access_token) {
            data = await tryEdgeFunction(generatedSQL, session.access_token);
          }

          // If Edge Function failed, fall back to direct Supabase query
          if (!data) {
            const intent = parseIntent(naturalLanguageQuery, orgId);
            const result = await executeDirectQuery(intent);
            data = result.data;
          }

          const summary = await generateSummaryWithAI(naturalLanguageQuery, data, apiKey, this.provider);
          const visualization = this.determineVisualization(naturalLanguageQuery, data);

          return {
            success: true,
            data,
            visualization,
            summary: summary || `Found ${data.length} result${data.length !== 1 ? 's' : ''}.`,
            sql: generatedSQL,
          };
        }
      }

      // 3. No AI key (or AI failed) → direct intent-based query
      const intent = parseIntent(naturalLanguageQuery, orgId);
      const { data, sql } = await executeDirectQuery(intent);

      const count = data.length;
      const tableName = intent.table.replace(/_/g, ' ');
      let summary = `Found ${count} ${tableName} record${count !== 1 ? 's' : ''}`;

      const activeFilters = Object.entries(intent.filters)
        .filter(([k]) => k !== 'organization_id')
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
      if (activeFilters) summary += ` (${activeFilters})`;
      summary += '.';

      if (count === 0) {
        summary = `No ${tableName} records found${activeFilters ? ` matching ${activeFilters}` : ''}.`;
      }

      return {
        success: true,
        data,
        visualization: intent.visualization,
        summary,
        sql,
      };
    } catch (err: any) {
      const message =
        err instanceof Error ? err.message :
        typeof err === 'string' ? err :
        'An unexpected error occurred. Please try again.';

      console.error('NL Query error:', message);
      return { success: false, error: message };
    }
  }

  private determineVisualization(query: string, data: any[]): 'table' | 'line' | 'bar' | 'pie' | 'metric' {
    const q = query.toLowerCase();
    if (data.length === 1 && Object.keys(data[0]).length <= 3) return 'metric';
    if (q.includes('trend') || q.includes('over time') || q.includes('daily') || q.includes('monthly')) return 'line';
    if (q.includes('compare') || q.includes('by category') || q.includes('by type')) return 'bar';
    if (q.includes('distribution') || q.includes('breakdown') || q.includes('percentage') || q.includes('share')) return 'pie';
    return 'table';
  }

  async saveQueryHistory(query: string, result: QueryResult): Promise<void> {
    const history = this.getQueryHistory();
    const entry = { id: Date.now().toString(), query, result, timestamp: new Date() };
    const trimmed = [entry, ...history].slice(0, 50);
    localStorage.setItem('nl_query_history', JSON.stringify(trimmed));
  }

  getQueryHistory(): QueryHistory[] {
    const stored = localStorage.getItem('nl_query_history');
    if (!stored) return [];
    try {
      return JSON.parse(stored).map((item: any) => ({
        ...item,
        timestamp: new Date(item.timestamp),
      }));
    } catch {
      return [];
    }
  }

  clearQueryHistory(): void {
    localStorage.removeItem('nl_query_history');
  }

  async saveAsAIMInsight(
    query: string,
    result: QueryResult,
    orgId: string,
    userId: string
  ): Promise<void> {
    try {
      const tags = this.extractTags(query);
      const category = this.extractCategory(query);

      await supabase.from('aim_query_insights').insert({
        organization_id: orgId,
        user_id: userId,
        query_text: query,
        summary: result.summary ?? `Found ${result.data?.length ?? 0} result(s).`,
        visualization: result.visualization ?? 'table',
        row_count: result.data?.length ?? 0,
        sql_used: result.sql ?? null,
        data_snapshot: result.data ? result.data.slice(0, 20) : null,
        category,
        tags,
        is_pinned: false,
      });
    } catch (err) {
      console.error('Failed to save AIM insight:', err);
    }
  }

  private extractCategory(query: string): string {
    const q = query.toLowerCase();
    if (q.includes('alert') || q.includes('anomal')) return 'alerts';
    if (q.includes('metric') || q.includes('kpi') || q.includes('measure')) return 'metrics';
    if (q.includes('project') || q.includes('dmaic') || q.includes('kaizen')) return 'projects';
    if (q.includes('recommend') || q.includes('action')) return 'recommendations';
    if (q.includes('forecast') || q.includes('predict') || q.includes('trend')) return 'forecasts';
    if (q.includes('root cause') || q.includes('rca')) return 'root-cause';
    return 'general';
  }

  private extractTags(query: string): string[] {
    const tags: string[] = [];
    const q = query.toLowerCase();
    const keywords = [
      'metrics', 'alerts', 'anomalies', 'projects', 'kpis', 'forecasts',
      'recommendations', 'actions', 'trends', 'critical', 'high', 'active',
      'resolved', 'completed', 'in progress',
    ];
    keywords.forEach((kw) => {
      if (q.includes(kw)) tags.push(kw);
    });
    return tags.slice(0, 5);
  }
}

export const nlQueryService = new NaturalLanguageQueryService();
