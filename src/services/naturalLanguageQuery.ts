import { supabase } from '../lib/supabase';

// ====================
// Type definitions
// ====================

export interface QueryResult {
  success: boolean;
  data: any[];
  visualization?: 'table' | 'chart' | 'metric' | 'list';
  chartType?: 'line' | 'bar' | 'pie' | 'area';
  summary: string;
  sql?: string;
  confidence: number;
}

interface QueryIntent {
  entity: string;
  action: string;
  filters?: {
    status?: string;
    severity?: string;
    timeRange?: string;
    category?: string;
  };
  aggregation?: string;
  confidence: number;
}

/**
 * Parse natural language query to extract intent
 */
function parseQuery(query: string): QueryIntent {
  const lowerQuery = query.toLowerCase();
  
  // Determine entity type
  let entity = 'general';
  if (lowerQuery.includes('metric') || lowerQuery.includes('kpi')) {
    entity = 'metrics';
  } else if (lowerQuery.includes('alert') || lowerQuery.includes('notification')) {
    entity = 'alerts';
  } else if (lowerQuery.includes('project') || lowerQuery.includes('dmaic')) {
    entity = 'projects';
  } else if (lowerQuery.includes('team') || lowerQuery.includes('member')) {
    entity = 'team';
  } else if (lowerQuery.includes('quality') || lowerQuery.includes('data quality')) {
    entity = 'data_quality';
  }

  // Determine action
  let action = 'list';
  if (lowerQuery.includes('compare') || lowerQuery.includes('comparison')) {
    action = 'compare';
  } else if (lowerQuery.includes('trend') || lowerQuery.includes('analyze')) {
    action = 'analyze';
  } else if (lowerQuery.includes('count') || lowerQuery.includes('how many')) {
    action = 'count';
  }

  // Extract filters
  const filters: any = {};
  
  // Status filters
  if (lowerQuery.includes('active')) filters.status = 'active';
  if (lowerQuery.includes('completed')) filters.status = 'completed';
  if (lowerQuery.includes('in progress') || lowerQuery.includes('in-progress')) filters.status = 'in_progress';
  
  // Severity filters
  if (lowerQuery.includes('critical')) filters.severity = 'critical';
  if (lowerQuery.includes('high')) filters.severity = 'high';
  if (lowerQuery.includes('medium')) filters.severity = 'medium';
  if (lowerQuery.includes('low')) filters.severity = 'low';
  
  // Time range filters
  if (lowerQuery.includes('today')) filters.timeRange = 'today';
  if (lowerQuery.includes('this week') || lowerQuery.includes('week')) filters.timeRange = 'week';
  if (lowerQuery.includes('this month') || lowerQuery.includes('month')) filters.timeRange = 'month';
  if (lowerQuery.includes('this year') || lowerQuery.includes('year')) filters.timeRange = 'year';

  return {
    entity,
    action,
    filters: Object.keys(filters).length > 0 ? filters : undefined,
    aggregation: action === 'count' ? 'count' : undefined,
    confidence: 0.8
  };
}

/**
 * Get date from time range string
 */
function getDateFromTimeRange(timeRange: string): Date {
  const now = new Date();
  
  switch (timeRange) {
    case 'today':
      now.setHours(0, 0, 0, 0);
      return now;
    case 'week':
      now.setDate(now.getDate() - 7);
      return now;
    case 'month':
      now.setMonth(now.getMonth() - 1);
      return now;
    case 'year':
      now.setFullYear(now.getFullYear() - 1);
      return now;
    default:
      return now;
  }
}

/**
 * Main function to execute natural language queries
 */
export async function executeNaturalLanguageQuery(query: string, organizationId: string): Promise<QueryResult> {
  try {
    // Parse the query to understand intent
    const intent = parseQuery(query);
    
    // Execute based on entity type
    switch (intent.entity) {
      case 'metrics':
        return await queryMetricsIntent(intent, organizationId);
      case 'alerts':
        return await queryAlertsIntent(intent, organizationId);
      case 'projects':
        return await queryProjectsIntent(intent, organizationId);
      case 'team':
        return await queryTeamIntent(intent, organizationId);
      case 'data_quality':
        return await queryDataQualityIntent(intent, organizationId);
      default:
        return {
          success: false,
          data: [],
          summary: "I'm not sure how to help with that. Try asking about metrics, alerts, projects, team, or data quality.",
          confidence: 0
        };
    }
  } catch (error) {
    console.error('Error executing query:', error);
    return {
      success: false,
      data: [],
      summary: 'An error occurred while processing your query. Please try again.',
      confidence: 0
    };
  }
}

/**
 * Get query suggestions based on context
 */
export function getQuerySuggestions(context: string = 'general'): string[] {
  const suggestions = {
    general: [
      "Show all critical alerts",
      "What are my quality metrics?",
      "Compare metrics by category",
      "Show alerts from this week",
      "How many active projects?",
      "Analyze efficiency trends"
    ],
    metrics: [
      "Show all metrics",
      "What metrics are declining?",
      "Compare metrics by category",
      "Show quality metrics",
      "Analyze metric trends"
    ],
    alerts: [
      "Show all critical alerts",
      "What alerts are active?",
      "Show alerts from this week",
      "Find high severity alerts"
    ],
    projects: [
      "How many active projects?",
      "Show in-progress projects",
      "What projects are behind schedule?",
      "Compare projects by status"
    ]
  };

  return suggestions[context as keyof typeof suggestions] || suggestions.general;
}

/**
 * Generate AI response text based on query result
 */
export function generateAIResponse(result: QueryResult, originalQuery: string): string {
  if (!result.success) {
    return result.summary;
  }

  const count = result.data.length;
  
  if (count === 0) {
    return "I couldn't find any results matching your query. Try adjusting your search criteria.";
  }

  // Generate contextual response
  if (originalQuery.toLowerCase().includes('critical')) {
    return `I found ${count} critical ${count === 1 ? 'item' : 'items'} that need your attention. ${result.summary}`;
  }
  
  if (originalQuery.toLowerCase().includes('compare')) {
    return `Here's a comparison showing ${count} ${count === 1 ? 'item' : 'items'}. ${result.summary}`;
  }
  
  if (originalQuery.toLowerCase().includes('trend') || originalQuery.toLowerCase().includes('analyze')) {
    return `I've analyzed the data and found ${count} ${count === 1 ? 'result' : 'results'}. ${result.summary}`;
  }

  return `${result.summary} I found ${count} ${count === 1 ? 'result' : 'results'} for you.`;
}

/**
 * Query metrics intent
 */
async function queryMetricsIntent(intent: QueryIntent, organizationId: string): Promise<QueryResult> {
  let query = supabase.from('metrics').select('*').eq('organization_id', organizationId);

  // Apply filters
  if (intent.filters?.category) {
    query = query.eq('category', intent.filters.category);
  }

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;

  const result = data || [];
  let summary = intent.aggregation === 'count'
    ? `Found ${result.length} metrics`
    : `Showing ${result.length} metrics`;

  if (intent.filters?.category) {
    summary += ` in ${intent.filters.category} category`;
  }

  return {
    success: true,
    data: result,
    visualization: 'table',
    summary,
    confidence: intent.confidence,
  };
}

/**
 * Query alerts (intent version)
 */
async function queryAlertsIntent(intent: QueryIntent, organizationId: string): Promise<QueryResult> {
  let query = supabase.from('alerts').select('*').eq('organization_id', organizationId);

  // Apply filters
  if (intent.filters?.status) {
    query = query.eq('status', intent.filters.status);
  }
  if (intent.filters?.severity) {
    query = query.eq('severity', intent.filters.severity);
  }
  if (intent.filters?.timeRange) {
    const date = getDateFromTimeRange(intent.filters.timeRange);
    query = query.gte('created_at', date.toISOString());
  }

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;

  const result = data || [];
  let summary = intent.aggregation === 'count'
    ? `Found ${result.length} alerts`
    : `Showing ${result.length} alerts`;

  if (intent.filters?.severity) {
    summary += ` with ${intent.filters.severity} severity`;
  }
  if (intent.filters?.status) {
    summary += ` (${intent.filters.status})`;
  }
  if (intent.filters?.timeRange) {
    summary += ` from ${intent.filters.timeRange}`;
  }

  return {
    success: true,
    data: result,
    visualization: 'list',
    summary,
    confidence: intent.confidence,
  };
}

/**
 * Query projects intent
 */
async function queryProjectsIntent(intent: QueryIntent, organizationId: string): Promise<QueryResult> {
  let query = supabase.from('dmaic_projects').select('*').eq('organization_id', organizationId);

  // Apply filters
  if (intent.filters?.status) {
    query = query.eq('status', intent.filters.status);
  }

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;

  const result = data || [];
  let summary = intent.aggregation === 'count'
    ? `Found ${result.length} projects`
    : `Showing ${result.length} projects`;

  if (intent.filters?.status) {
    summary += ` with ${intent.filters.status} status`;
  }

  return {
    success: true,
    data: result,
    visualization: 'table',
    summary,
    confidence: intent.confidence,
  };
}

/**
 * Query team intent
 */
async function queryTeamIntent(intent: QueryIntent, organizationId: string): Promise<QueryResult> {
  const { data, error } = await supabase
    .from('user_organizations')
    .select('*, user_profiles(*)')
    .eq('organization_id', organizationId);

  if (error) throw error;

  const result = data || [];
  const summary = intent.aggregation === 'count'
    ? `Found ${result.length} team members`
    : `Showing ${result.length} team members`;

  return {
    success: true,
    data: result,
    visualization: 'table',
    summary,
    confidence: intent.confidence,
  };
}

/**
 * Query data quality intent
 */
async function queryDataQualityIntent(intent: QueryIntent, organizationId: string): Promise<QueryResult> {
  const { data, error } = await supabase
    .from('data_quality_checks')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const result = data || [];
  const summary = intent.aggregation === 'count'
    ? `Found ${result.length} data quality checks`
    : `Showing ${result.length} data quality checks`;

  return {
    success: true,
    data: result,
    visualization: 'table',
    summary,
    confidence: intent.confidence,
  };
}

async function queryMetrics(intent: string, entities: any[]): Promise<QueryResult> {
  try {
    let query = supabase
      .from('metrics')
      .select('id, name, description, unit, target_value, upper_threshold, lower_threshold');

    // Apply filters based on entities
    entities.forEach(entity => {
      if (entity.type === 'metric_name') {
        query = query.ilike('name', `%${entity.value}%`);
      }
    });

    const { data, error } = await query;
    if (error) throw error;

    return {
      success: true,
      data: data || [],
      visualization: 'table',
      summary: `Found ${data?.length || 0} metrics`,
      confidence: 0.8
    };
  } catch (error) {
    console.error('Error querying metrics:', error);
    return {
      success: false,
      data: [],
      summary: 'Error loading metrics data',
      confidence: 0
    };
  }
}

async function compareMetrics(): Promise<QueryResult> {
  try {
    const { data, error } = await supabase
      .from('metrics')
      .select('id, name, target_value, unit');

    if (error) throw error;

    if (!data || data.length === 0) {
      return {
        success: false,
        data: [],
        summary: 'No metrics found to compare',
        confidence: 0
      };
    }

    // Group metrics by their first word (simple categorization)
    const grouped = data.reduce((acc: any, metric: any) => {
      const category = metric.name.split(' ')[0] || 'Other';
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(metric);
      return acc;
    }, {});

    const chartData = Object.entries(grouped).map(([category, metrics]: [string, any]) => ({
      category,
      count: metrics.length,
      avgTarget: metrics.reduce((sum: number, m: any) => sum + (m.target_value || 0), 0) / metrics.length
    }));

    return {
      success: true,
      data: chartData,
      visualization: 'chart',
      chartType: 'bar',
      summary: 'Metrics comparison by category',
      confidence: 0.8
    };
  } catch (error) {
    console.error('Error comparing metrics:', error);
    return {
      success: false,
      data: [],
      summary: 'Error comparing metrics',
      confidence: 0
    };
  }
}
