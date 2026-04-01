import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storage: window.localStorage,
    storageKey: 'sigmasense-auth',
  },
  global: {
    headers: {
      'x-client-info': 'sigmasense-ai',
    },
  },
  db: {
    schema: 'public',
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

// Test connection on initialization
export const testSupabaseConnection = async (): Promise<boolean> => {
  try {
    const { error } = await supabase.from('organizations').select('count').limit(1);
    if (error) {
      console.error('Supabase connection test failed:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Supabase connection error:', err);
    return false;
  }
};

export type UserRole = 'admin' | 'org_leader' | 'process_owner' | 'team_member';

export interface Organization {
  id: string;
  name: string;
  industry: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserOrganization {
  id: string;
  user_id: string;
  organization_id: string;
  role: UserRole;
  created_at: string;
}

export interface Location {
  id: string;
  organization_id: string;
  name: string;
  department: string | null;
  address: string | null;
  created_at: string;
}

export interface Metric {
  id: string;
  organization_id: string;
  location_id: string | null;
  name: string;
  description: string | null;
  unit: string | null;
  target_value: number | null;
  upper_threshold: number | null;
  lower_threshold: number | null;
  created_at: string;
}

export interface MetricData {
  id: string;
  metric_id: string;
  value: number;
  timestamp: string;
  source: string | null;
  created_at: string;
}

export interface Alert {
  id: string;
  organization_id: string;
  metric_id: string | null;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface DMAICProject {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  phase: 'define' | 'measure' | 'analyze' | 'improve' | 'control';
  status: 'active' | 'completed' | 'on_hold';
  define_data: any;
  measure_data: any;
  analyze_data: any;
  improve_data: any;
  control_data: any;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RootCauseAnalysis {
  id: string;
  organization_id: string;
  metric_id: string | null;
  dataset_name: string | null;
  analysis_date: string;
  results: any;
  created_by: string | null;
  created_at: string;
}

export interface Simulation {
  id: string;
  organization_id: string;
  metric_id: string | null;
  name: string;
  description: string | null;
  parameters: any;
  predicted_impact: number | null;
  risk_index: number | null;
  cost_benefit_score: number | null;
  created_by: string | null;
  created_at: string;
}
