import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';

interface KPI {
  id: string;
  name: string;
  description: string;
  category: string;
  target_value: number;
  current_value?: number;
  unit: string;
  frequency: string;
  data_source_name?: string;
}

interface KPISelectorProps {
  organizationId: string;
  selectedKPI: KPI | null;
  onKPIChange: (kpi: KPI | null) => void;
  onClose: () => void;
}

export default function KPISelector({ 
  organizationId, 
  selectedKPI, 
  onKPIChange, 
  onClose 
}: KPISelectorProps) {
  const [availableKPIs, setAvailableKPIs] = useState<KPI[]>([]);
  const [availableMetrics, setAvailableMetrics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'kpis' | 'metrics'>('kpis');

  useEffect(() => {
    fetchData();
  }, [organizationId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch KPIs
      const { data: kpisData, error: kpisError } = await supabase
        .from('kpis')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (kpisError) throw kpisError;
      setAvailableKPIs(kpisData || []);

      // Fetch Metrics
      const { data: metricsData, error: metricsError } = await supabase
        .from('metrics')
        .select(`
          *,
          data_sources (
            name,
            type
          )
        `)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (metricsError) throw metricsError;

      const processedMetrics = (metricsData || []).map(metric => ({
        ...metric,
        data_source_name: metric.data_sources?.name
      }));

      setAvailableMetrics(processedMetrics);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (item: any) => {
    onKPIChange(item);
    onClose();
  };

  const allItems = activeTab === 'kpis' ? availableKPIs : availableMetrics;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      ></div>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 bg-white border-b border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Select KPI/Metric for MSA</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Choose which KPI or metric to validate with Measurement System Analysis
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
              >
                <i className="ri-close-line text-2xl text-gray-500"></i>
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('kpis')}
                className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                  activeTab === 'kpis'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <i className="ri-dashboard-line mr-2"></i>
                KPIs ({availableKPIs.length})
              </button>
              <button
                onClick={() => setActiveTab('metrics')}
                className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                  activeTab === 'metrics'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <i className="ri-line-chart-line mr-2"></i>
                Metrics ({availableMetrics.length})
              </button>
            </div>
          </div>

          <div className="p-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
              </div>
            ) : allItems.length === 0 ? (
              <div className="text-center py-12">
                <i className="ri-database-2-line text-6xl text-gray-400 mb-4"></i>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  No {activeTab === 'kpis' ? 'KPIs' : 'Metrics'} Available
                </h3>
                <p className="text-gray-600 mb-6">
                  Create {activeTab === 'kpis' ? 'KPIs' : 'metrics'} first to use them in MSA analysis
                </p>
                <a
                  href={activeTab === 'kpis' ? '/dashboard/kpi-manager' : '/dashboard/metrics'}
                  className="inline-flex items-center px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors whitespace-nowrap"
                >
                  <i className="ri-add-line mr-2"></i>
                  Go to {activeTab === 'kpis' ? 'KPI Manager' : 'Metrics'} Page
                </a>
              </div>
            ) : (
              <>
                <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <i className="ri-information-line text-blue-600 text-xl"></i>
                    <div>
                      <h4 className="font-semibold text-blue-900 text-sm mb-1">MSA Purpose</h4>
                      <p className="text-sm text-blue-800">
                        Measurement System Analysis validates that your measurement system is reliable and accurate 
                        before collecting data for analysis. Select the KPI/metric you want to validate.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {allItems.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleSelect(item)}
                      className="p-4 rounded-lg border-2 border-gray-200 hover:border-indigo-600 hover:bg-indigo-50 transition-all cursor-pointer"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-gray-900">{item.name}</h3>
                            {item.is_auto_aggregated && (
                              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">
                                Auto
                              </span>
                            )}
                            {item.category && (
                              <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full font-medium">
                                {item.category}
                              </span>
                            )}
                          </div>
                          {item.data_source_name && (
                            <div className="flex items-center gap-1 text-xs text-gray-600 mb-2">
                              <i className="ri-database-2-line"></i>
                              <span>Source: {item.data_source_name}</span>
                            </div>
                          )}
                          {item.description && (
                            <p className="text-sm text-gray-600 line-clamp-2">{item.description}</p>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-200">
                        <div>
                          <div className="text-xs text-gray-600 mb-1">
                            {item.current_value !== undefined ? 'Current' : 'Target'}
                          </div>
                          <div className="text-sm font-bold text-gray-900">
                            {item.current_value !== undefined ? item.current_value : item.target_value} {item.unit}
                          </div>
                        </div>
                        {item.target_value && (
                          <div>
                            <div className="text-xs text-gray-600 mb-1">Target</div>
                            <div className="text-sm font-semibold text-gray-700">
                              {item.target_value} {item.unit}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
