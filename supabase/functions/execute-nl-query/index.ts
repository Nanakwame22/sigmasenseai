import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function extractErrorMessage(error: unknown): string {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message || 'Unknown error';
  if (typeof error === 'object') {
    const e = error as Record<string, unknown>;
    if (typeof e['message'] === 'string') return e['message'];
    if (typeof e['msg'] === 'string') return e['msg'];
    if (typeof e['error'] === 'string') return e['error'];
    try {
      const str = JSON.stringify(error);
      if (str && str !== '{}') return str;
    } catch { /* ignore */ }
  }
  return 'An unexpected error occurred';
}

// Tables that use organization_id
const ORG_TABLES = [
  'metrics', 'metric_data', 'alerts', 'anomalies', 'dmaic_projects',
  'action_items', 'recommendations', 'root_cause_analyses', 'forecasts',
  'kpis', 'kpi_scorecards', 'kpi_scorecard_metrics', 'kaizen_items',
  'benchmarks', 'data_sources', 'uploaded_files', 'simulations',
  'hypothesis_tests', 'data_quality_checks', 'data_quality_results',
  'data_cleaning_rules', 'data_cleaning_logs', 'etl_pipelines',
  'etl_pipeline_runs', 'classification_models', 'clustering_analyses',
  'what_if_scenarios', 'automation_rules', 'automation_executions',
  'api_keys', 'webhooks', 'webhook_logs', 'audit_logs',
  'alert_preferences', 'kpi_aggregation_jobs',
];

// Tables that use user_id
const USER_TABLES: string[] = [];

const ALL_TABLES = [...ORG_TABLES, ...USER_TABLES, 'organizations', 'user_organizations', 'user_profiles', 'locations'];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !supabaseAnonKey) {
      return new Response(
        JSON.stringify({ error: 'Supabase environment variables are not configured.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: ' + extractErrorMessage(userError) }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Resolve organization_id
    const adminClient = serviceRoleKey
      ? createClient(supabaseUrl, serviceRoleKey)
      : supabaseClient;

    const { data: userOrg } = await adminClient
      .from('user_organizations')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    const orgId = userOrg?.organization_id ?? user.id;

    // Parse body
    let body: { sql?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { sql } = body;
    if (!sql || typeof sql !== 'string' || !sql.trim()) {
      return new Response(
        JSON.stringify({ error: 'SQL query is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('User:', user.id, '| Org:', orgId, '| SQL:', sql.slice(0, 200));

    // Security: SELECT only
    const trimmedSql = sql.trim().toUpperCase();
    if (!trimmedSql.startsWith('SELECT')) {
      return new Response(
        JSON.stringify({ error: 'Only SELECT queries are allowed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const dangerousKeywords = ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'ALTER', 'CREATE', 'TRUNCATE', 'GRANT', 'REVOKE'];
    if (dangerousKeywords.some(kw => trimmedSql.includes(kw))) {
      return new Response(
        JSON.stringify({ error: 'Modification queries are not allowed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Identify table
    const fromMatch = sql.match(/\bfrom\s+["']?(\w+)["']?/i);
    if (!fromMatch) {
      return new Response(
        JSON.stringify({ error: 'Could not identify the table in your query.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tableName = fromMatch[1].toLowerCase();
    if (!ALL_TABLES.includes(tableName)) {
      return new Response(
        JSON.stringify({
          error: `Table '${tableName}' is not available. Available: ${ORG_TABLES.slice(0, 10).join(', ')}, and more.`,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build query
    const selectMatch = sql.match(/select\s+(.*?)\s+from/is);
    let selectColumns = selectMatch ? selectMatch[1].trim() : '*';
    if (selectColumns.toLowerCase().includes('(') || selectColumns.includes(';')) {
      selectColumns = '*';
    }

    let query = adminClient.from(tableName).select(selectColumns);

    // Apply org/user filter
    if (ORG_TABLES.includes(tableName)) {
      query = query.eq('organization_id', orgId);
    } else if (USER_TABLES.includes(tableName)) {
      query = query.eq('user_id', user.id);
    }

    // Parse WHERE clause (skip organization_id / user_id since we already applied them)
    const whereMatch = sql.match(/\bwhere\b(.*?)(?:\bgroup\s+by\b|\border\s+by\b|\blimit\b|$)/is);
    if (whereMatch?.[1]) {
      const whereClause = whereMatch[1].trim();
      const andConditions = whereClause.split(/\s+and\s+/i);

      for (const condition of andConditions) {
        const c = condition.trim();
        if (!c) continue;
        if (/organization_id|user_id/i.test(c)) continue; // already applied

        const eqStr = c.match(/^(\w+)\s*=\s*'([^']*)'$/i);
        if (eqStr) { query = query.eq(eqStr[1], eqStr[2]); continue; }

        const eqNum = c.match(/^(\w+)\s*=\s*(\d+(?:\.\d+)?)$/i);
        if (eqNum) { query = query.eq(eqNum[1], Number(eqNum[2])); continue; }

        const gte = c.match(/^(\w+)\s*>=\s*'?([^'\s]+)'?$/i);
        if (gte) { query = query.gte(gte[1], gte[2]); continue; }

        const lte = c.match(/^(\w+)\s*<=\s*'?([^'\s]+)'?$/i);
        if (lte) { query = query.lte(lte[1], lte[2]); continue; }

        const gt = c.match(/^(\w+)\s*>\s*'?([^'\s]+)'?$/i);
        if (gt) { query = query.gt(gt[1], gt[2]); continue; }

        const lt = c.match(/^(\w+)\s*<\s*'?([^'\s]+)'?$/i);
        if (lt) { query = query.lt(lt[1], lt[2]); continue; }

        const likeMatch = c.match(/^(\w+)\s+ilike\s+'([^']*)'/i);
        if (likeMatch) { query = query.ilike(likeMatch[1], likeMatch[2]); continue; }

        console.warn('Skipping unparseable condition:', c);
      }
    }

    // ORDER BY
    const orderMatch = sql.match(/\border\s+by\s+(\w+)(?:\s+(asc|desc))?/i);
    if (orderMatch) {
      const ascending = !orderMatch[2] || orderMatch[2].toLowerCase() === 'asc';
      query = query.order(orderMatch[1], { ascending });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    // LIMIT
    const limitMatch = sql.match(/\blimit\s+(\d+)/i);
    const limit = limitMatch ? Math.min(parseInt(limitMatch[1]), 1000) : 100;
    query = query.limit(limit);

    const { data, error: queryError } = await query;

    if (queryError) {
      const msg = extractErrorMessage(queryError);
      console.error('Query error:', msg);
      return new Response(
        JSON.stringify({ error: `Database query failed: ${msg}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Success — rows returned:', data?.length ?? 0);
    return new Response(
      JSON.stringify({ data: data ?? [] }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const msg = extractErrorMessage(error);
    console.error('Unhandled error:', msg);
    return new Response(
      JSON.stringify({ error: msg, hint: 'Try simplifying your query or check the available tables.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
