import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';

interface Metric {
  id: string;
  name: string;
  description: string;
  current_value: number;
  target_value: number;
  unit: string;
  data_source_name?: string;
  is_auto_aggregated?: boolean;
}

interface MetricSelectorProps {
  organizationId: string;
  selectedMetrics: Metric[];
  onMetricsChange: (metrics: Metric[]) => void;
  onClose: () => void;
}

export default function MetricSelector({ 
  organizationId, 
  selectedMetrics, 
  onMetricsChange, 
  onClose 
}: MetricSelectorProps) {
  const [availableMetrics, setAvailableMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(true);
  const [tempSelected, setTempSelected] = useState<Metric[]>(selectedMetrics);

  useEffect(() => {
    fetchMetrics();
  }, [organizationId]);

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
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

      if (error) throw error;

      const processedMetrics = (data || []).map(metric => ({
        ...metric,
        data_source_name: metric.data_sources?.name
      }));

      setAvailableMetrics(processedMetrics);
    } catch (error) {
      console.error('Error fetching metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleMetric = (metric: Metric) => {
    const isSelected = tempSelected.some(m => m.id === metric.id);
    
    if (isSelected) {
      setTempSelected(tempSelected.filter(m => m.id !== metric.id));
    } else {
      setTempSelected([...tempSelected, metric]);
    }
  };

  const handleSave = () => {
    onMetricsChange(tempSelected);
    onClose();
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      ></div>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Select Metrics for DMAIC Analysis</h2>
              <p className="text-sm text-gray-600 mt-1">
                Choose metrics to use throughout all DMAIC phases. Selected: {tempSelected.length}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
            >
              <i className="ri-close-line text-2xl text-gray-500"></i>
            </button>
          </div>

          <div className="p-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
              </div>
            ) : availableMetrics.length === 0 ? (
              <div className="text-center py-12">
                <i className="ri-database-2-line text-6xl text-gray-400 mb-4"></i>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No Metrics Available</h3>
                <p className="text-gray-600 mb-6">
                  You need to create metrics first. Go to the Metrics page to add or import metrics.
                </p>
                <a
                  href="/dashboard/metrics"
                  className="inline-flex items-center px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors whitespace-nowrap"
                >
                  <i className="ri-add-line mr-2"></i>
                  Go to Metrics Page
                </a>
              </div>
            ) : (
              <>
                <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <i className="ri-information-line text-blue-600 text-xl"></i>
                    <div>
                      <h4 className="font-semibold text-blue-900 text-sm mb-1">How Metrics Work in DMAIC</h4>
                      <ul className="text-sm text-blue-800 space-y-1">
                        <li>• <strong>Measure Phase:</strong> Use metric data for MSA studies and baseline analysis</li>
                        <li>• <strong>Analyze Phase:</strong> Run statistical tests and root cause analysis on metric data</li>
                        <li>• <strong>Improve Phase:</strong> Track improvement impact on selected metrics</li>
                        <li>• <strong>Control Phase:</strong> Monitor metrics with control charts and alerts</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {availableMetrics.map((metric) => {
                    const isSelected = tempSelected.some(m => m.id === metric.id);
                    
                    return (
                      <div
                        key={metric.id}
                        onClick={() => handleToggleMetric(metric)}
                        className={`p-4 rounded-lg border-2 transition-all cursor-pointer ${
                          isSelected
                            ? 'border-indigo-600 bg-indigo-50'
                            : 'border-gray-200 hover:border-indigo-300 bg-white'
                        }`}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold text-gray-900">{metric.name}</h3>
                              {metric.is_auto_aggregated && (
                                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">
                                  Auto
                                </span>
                              )}
                            </div>
                            {metric.data_source_name && (
                              <div className="flex items-center gap-1 text-xs text-gray-600 mb-2">
                                <i className="ri-database-2-line"></i>
                                <span>Source: {metric.data_source_name}</span>
                              </div>
                            )}
                            {metric.description && (
                              <p className="text-sm text-gray-600 line-clamp-2">{metric.description}</p>
                            )}
                          </div>
                          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ml-3 ${
                            isSelected
                              ? 'border-indigo-600 bg-indigo-600'
                              : 'border-gray-300'
                          }`}>
                            {isSelected && <i className="ri-check-line text-white text-sm"></i>}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-200">
                          <div>
                            <div className="text-xs text-gray-600 mb-1">Current</div>
                            <div className="text-sm font-bold text-gray-900">
                              {metric.current_value} {metric.unit}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-600 mb-1">Target</div>
                            <div className="text-sm font-semibold text-gray-700">
                              {metric.target_value} {metric.unit}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {availableMetrics.length > 0 && (
            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 p-6 flex items-center justify-between">
              <div className="text-sm text-gray-600">
                {tempSelected.length} metric{tempSelected.length !== 1 ? 's' : ''} selected
              </div>
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition-colors whitespace-nowrap cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <i className="ri-save-line mr-2"></i>
                  Save Selection
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
