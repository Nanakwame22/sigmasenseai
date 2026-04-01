import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { syncCPIToMetrics } from '../services/cpiMetricsBridge';

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

export function useCPIData(): UseCPIDataReturn {
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

    if (err) {
      setError(err.message);
    } else {
      const snapshots = (data as CPIDomainSnapshot[]) ?? [];
      setDomains(snapshots);
      // Bridge: propagate CPI data to the main analytics engine
      // Runs async — does not block CPI page rendering
      syncCPIToMetrics(snapshots).catch(() => undefined);
    }
    setLoadingDomains(false);
  }, []);

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
