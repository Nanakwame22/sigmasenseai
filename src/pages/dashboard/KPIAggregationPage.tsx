import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/useToast';

interface Metric {
  id: string;
  name: string;
  unit: string;
  value_type: string;
  status: string;
  created_at: string;
  dataset_id?: string;
  source_type?: string;
  category?: string;
}

interface AggregationJob {
  id: string;
  name: string;
  description: string;
  source_metrics: string[];
  aggregation_type: string;
  schedule: string;
  status: string;
  created_at: string;
  last_run?: string;
  next_run?: string;
}

interface DataSource {
  id: string;
  name: string;
  type: string;
  status: string;
}

export default function KPIAggregationPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Data state
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [jobs, setJobs] = useState<AggregationJob[]>([]);
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  
  // UI state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isMetricDropdownOpen, setIsMetricDropdownOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [scheduleFilter, setScheduleFilter] = useState('all');
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    data_source_id: '',
    target_metric_id: '',
    aggregation_type: 'sum',
    schedule: 'daily',
    weights: {},
    custom_formula: '',
    filters: {}
  });
  
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);

  // Fetch organization ID
  useEffect(() => {
    const fetchOrganizationId = async () => {
      if (!user?.id) return;
      
      const { data, error } = await supabase
        .from('user_organizations')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();
      
      if (data && !error) {
        setOrganizationId(data.organization_id);
      }
    };
    
    fetchOrganizationId();
  }, [user?.id]);

  // Fetch data
  useEffect(() => {
    if (organizationId) {
      fetchData();
    }
  }, [organizationId]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsMetricDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchData = async () => {
    if (!organizationId) return;

    setLoading(true);
    try {
      // Fetch metrics
      const { data: metricsData, error: metricsError } = await supabase
        .from('metrics')
        .select('*')
        .eq('organization_id', organizationId)
        .order('name');

      if (metricsError) throw metricsError;
      setMetrics(metricsData || []);

      // Fetch data sources
      const { data: dataSourcesData, error: dataSourcesError } = await supabase
        .from('data_sources')
        .select('id, name, type, status')
        .eq('organization_id', organizationId)
        .order('name');

      if (dataSourcesError) throw dataSourcesError;
      setDataSources(dataSourcesData || []);

      // Fetch aggregation jobs
      const { data: jobsData, error: jobsError } = await supabase
        .from('kpi_aggregation_jobs')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (jobsError) throw jobsError;
      setJobs(jobsData || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      data_source_id: '',
      target_metric_id: '',
      aggregation_type: 'sum',
      schedule: 'daily',
      weights: {},
      custom_formula: '',
      filters: {}
    });
    setSelectedMetrics([]);
  };

  const getScheduleInterval = (schedule: string): number => {
    const intervals: Record<string, number> = {
      'hourly': 60 * 60 * 1000,
      'daily': 24 * 60 * 60 * 1000,
      'weekly': 7 * 24 * 60 * 60 * 1000,
      'monthly': 30 * 24 * 60 * 60 * 1000,
    };
    return intervals[schedule] || intervals['daily'];
  };

  const handleCreateJob = async () => {
    if (!user || !organizationId) {
      showToast('User or organization not found. Please log in again.', 'error');
      return;
    }

    if (!selectedDataSource) {
      showToast('Please select a data source', 'warning');
      return;
    }

    if (selectedMetrics.length === 0) {
      showToast('Please select at least one metric', 'warning');
      return;
    }

    if (!formData.name.trim()) {
      showToast('Please enter a job name', 'warning');
      return;
    }

    try {
      // Map schedule to valid aggregation_level (hourly/daily/weekly only)
      const aggregationLevelMap: Record<string, string> = {
        'hourly': 'hourly',
        'daily': 'daily',
        'weekly': 'weekly',
        'monthly': 'weekly', // Map monthly to weekly for the constraint
        'real-time': 'hourly' // Map real-time to hourly for the constraint
      };

      const aggregationLevel = aggregationLevelMap[formData.schedule] || 'daily';

      const jobData = {
        user_id: user.id,
        organization_id: organizationId,
        data_source_id: selectedDataSource.id,
        data_source_name: selectedDataSource.name,
        name: formData.name,
        description: formData.description || null,
        kpi_count: selectedMetrics.length,
        aggregation_level: aggregationLevel, // Use mapped value
        aggregation_type: formData.aggregation_type,
        schedule: formData.schedule, // Keep original schedule
        source_metrics: selectedMetrics,
        target_metric_id: formData.target_metric_id || null,
        weights: formData.weights || null,
        custom_formula: formData.custom_formula || null,
        filters: formData.filters || null,
        status: 'pending',
        config: {
          actual_schedule: formData.schedule, // Store the actual schedule in config
          aggregation_type: formData.aggregation_type,
          created_via: 'ui'
        }
      };

      const { data, error } = await supabase
        .from('kpi_aggregation_jobs')
        .insert([jobData])
        .select()
        .single();

      if (error) {
        throw new Error(`Job creation error: ${JSON.stringify(error)}`);
      }

      showToast(
        `Aggregation job created successfully!\n\nJob: ${formData.name}\nData Source: ${selectedDataSource.name}\nSource Metrics: ${selectedMetrics.length}\nAggregation Type: ${formData.aggregation_type}\nSchedule: ${formData.schedule}`,
        'success'
      );
      setShowCreateModal(false);
      resetForm();
      fetchData();
    } catch (err: any) {
      const message = err?.message ?? 'An unknown error occurred while creating the job.';
      showToast('Error creating job: ' + message, 'error');
      console.error('Job creation error:', err);
    }
  };

  const toggleMetricSelection = (metricId: string) => {
    setSelectedMetrics(prev => 
      prev.includes(metricId) 
        ? prev.filter(id => id !== metricId)
        : [...prev, metricId]
    );
  };

  // Computed values
  const categories = Array.from(new Set(metrics.map(m => m.category).filter(Boolean)));
  
  const selectedDataSource = dataSources.find(ds => ds.id === formData.data_source_id);
  
  const filteredMetrics = metrics.filter(metric => {
    const matchesSearch = metric.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || metric.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const filteredJobs = jobs.filter(job => {
    const matchesSearch = job.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         job.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || job.status === statusFilter;
    const matchesSchedule = scheduleFilter === 'all' || job.schedule === scheduleFilter;
    return matchesSearch && matchesStatus && matchesSchedule;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">KPI Aggregation Manager</h1>
          <p className="mt-2 text-gray-600">Create and manage automated KPI aggregation jobs</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-6 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-2 whitespace-nowrap"
        >
          <i className="ri-add-line text-xl"></i>
          Create Aggregation Job
        </button>
      </div>

      {/* Debug Banner (Development Only) */}
      {import.meta.env.MODE === 'development' && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <i className="ri-bug-line text-yellow-600 text-xl mt-0.5"></i>
            <div className="flex-1">
              <h3 className="font-semibold text-yellow-900 mb-1">Debug Info</h3>
              <div className="text-sm text-yellow-800 space-y-1">
                <p>Loaded {metrics.length} metrics for org {organizationId}</p>
                <p>Query filters: status IN (active, draft), is_archived = false</p>
                <p>Selected metrics: {selectedMetrics.length}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Jobs</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{jobs.length}</p>
            </div>
            <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center">
              <i className="ri-stack-line text-teal-600 text-2xl"></i>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active Jobs</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {jobs.filter(j => j.status === 'active').length}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <i className="ri-play-circle-line text-green-600 text-2xl"></i>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Available Metrics</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{metrics.length}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <i className="ri-dashboard-line text-blue-600 text-2xl"></i>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Paused Jobs</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {jobs.filter(j => j.status === 'paused').length}
              </p>
            </div>
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <i className="ri-pause-circle-line text-orange-600 text-2xl"></i>
            </div>
          </div>
        </div>
      </div>

      {/* Jobs List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-900">Aggregation Jobs</h2>
        </div>
        <div className="p-6">
          {jobs.length === 0 ? (
            <div className="text-center py-12">
              <i className="ri-stack-line text-gray-300 text-6xl mb-4"></i>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No aggregation jobs yet</h3>
              <p className="text-gray-600 mb-6">Create your first aggregation job to start combining metrics</p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-6 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
              >
                Create First Job
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredJobs.map(job => (
                <div key={job.id} className="border border-gray-200 rounded-lg p-4 hover:border-teal-300 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">{job.name}</h3>
                      <p className="text-sm text-gray-600 mt-1">{job.description}</p>
                      <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <i className="ri-dashboard-line"></i>
                          {job.source_metrics?.length || 0} metrics
                        </span>
                        <span className="flex items-center gap-1">
                          <i className="ri-function-line"></i>
                          {job.aggregation_type}
                        </span>
                        <span className="flex items-center gap-1">
                          <i className="ri-time-line"></i>
                          {job.schedule}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        job.status === 'active' ? 'bg-green-100 text-green-700' :
                        job.status === 'paused' ? 'bg-orange-100 text-orange-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {job.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create Job Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-2xl font-bold text-gray-900">Create Aggregation Job</h2>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  resetForm();
                }}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
              >
                <i className="ri-close-line text-2xl"></i>
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Job Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Job Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Weekly Revenue Aggregation"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe what this aggregation does..."
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                />
              </div>

              {/* Data Source Selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Data Source *
                </label>
                <select
                  value={formData.data_source_id}
                  onChange={(e) => setFormData({ ...formData, data_source_id: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                >
                  <option value="">Select data source...</option>
                  {dataSources.map(ds => (
                    <option key={ds.id} value={ds.id}>
                      {ds.name} ({ds.type})
                    </option>
                  ))}
                </select>
                {dataSources.length === 0 && (
                  <p className="mt-2 text-xs text-amber-600 flex items-center gap-1">
                    <i className="ri-alert-line"></i>
                    No data sources available. Please create a data source first.
                  </p>
                )}
              </div>

              {/* Source Metrics Multi-Select */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Source Metrics * ({selectedMetrics.length} selected)
                </label>
                <div className="relative" ref={dropdownRef}>
                  <button
                    type="button"
                    onClick={() => setIsMetricDropdownOpen(!isMetricDropdownOpen)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm text-left flex items-center justify-between bg-white hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-gray-700">
                      {selectedMetrics.length === 0 
                        ? 'Select metrics to aggregate...' 
                        : `${selectedMetrics.length} metric${selectedMetrics.length > 1 ? 's' : ''} selected`}
                    </span>
                    <i className={`ri-arrow-${isMetricDropdownOpen ? 'up' : 'down'}-s-line text-gray-400`}></i>
                  </button>

                  {isMetricDropdownOpen && (
                    <div className="absolute z-10 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-y-auto">
                      {/* Search */}
                      <div className="p-3 border-b border-gray-100 sticky top-0 bg-white">
                        <input
                          type="text"
                          placeholder="Search metrics..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                        />
                      </div>

                      {/* Category Filter */}
                      {categories.length > 0 && (
                        <div className="p-3 border-b border-gray-100 bg-gray-50">
                          <select
                            value={categoryFilter}
                            onChange={(e) => setCategoryFilter(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                          >
                            <option value="all">All Categories</option>
                            {categories.map(cat => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Metrics List */}
                      <div className="p-2">
                        {filteredMetrics.length === 0 ? (
                          <div className="text-center py-8 text-gray-500">
                            <i className="ri-inbox-line text-4xl mb-2"></i>
                            <p className="text-sm">No metrics available</p>
                            {metrics.length > 0 && (
                              <p className="text-xs mt-1">Try adjusting your filters</p>
                            )}
                          </div>
                        ) : (
                          filteredMetrics.map(metric => (
                            <label
                              key={metric.id}
                              className="flex items-start gap-3 p-3 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors"
                            >
                              <input
                                type="checkbox"
                                checked={selectedMetrics.includes(metric.id)}
                                onChange={() => toggleMetricSelection(metric.id)}
                                className="mt-1 w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-gray-900 text-sm">{metric.name}</span>
                                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                    metric.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                                  }`}>
                                    {metric.status}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                                  <span>{metric.unit}</span>
                                  {metric.category && <span>• {metric.category}</span>}
                                  {metric.source_type && <span>• {metric.source_type}</span>}
                                </div>
                              </div>
                            </label>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Aggregation Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Aggregation Type *
                </label>
                <select
                  value={formData.aggregation_type}
                  onChange={(e) => setFormData({ ...formData, aggregation_type: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                >
                  <option value="sum">Sum</option>
                  <option value="avg">Average</option>
                  <option value="median">Median</option>
                  <option value="min">Minimum</option>
                  <option value="max">Maximum</option>
                  <option value="p90">90th Percentile</option>
                  <option value="p95">95th Percentile</option>
                  <option value="weighted_avg">Weighted Average</option>
                </select>
              </div>

              {/* Schedule */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Schedule *
                </label>
                <select
                  value={formData.schedule}
                  onChange={(e) => setFormData({ ...formData, schedule: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                >
                  <option value="hourly">Hourly</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="real-time">Real-time</option>
                </select>
              </div>

              {/* Target Metric */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Target Metric * (where to store result)
                </label>
                <select
                  value={formData.target_metric_id}
                  onChange={(e) => setFormData({ ...formData, target_metric_id: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                >
                  <option value="">Select target metric...</option>
                  {metrics.map(metric => (
                    <option key={metric.id} value={metric.id}>
                      {metric.name} ({metric.unit})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-100 flex items-center justify-end gap-3 sticky bottom-0 bg-white">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  resetForm();
                }}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateJob}
                className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
              >
                Create Job
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
