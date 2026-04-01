import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { RadialBarChart, RadialBar, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { exportToPDF, exportToCSV, exportToExcel, exportChartAsImage, downloadTemplate } from '../../utils/exportUtils';
import { useToast } from '../../hooks/useToast';
import ConfirmDialog from '../../components/common/ConfirmDialog';

interface Metric {
  id: string;
  name: string;
  unit: string;
  current_value?: number;
}

interface KPI {
  id: string;
  name: string;
  description: string;
}

interface ScorecardMetric {
  id: string;
  metric_id: string;
  metric_name?: string;
  metric_unit?: string;
  weight: number;
  target_value: number;
  threshold_red: number;
  threshold_yellow: number;
  threshold_green: number;
  current_value?: number;
  display_order: number;
}

interface Scorecard {
  id: string;
  name: string;
  description: string;
  category: string;
  status: 'active' | 'inactive' | 'archived';
  owner_id: string;
  owner_name?: string;
  created_at: string;
  metrics?: ScorecardMetric[];
}

export default function KPIScorecards() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [scorecards, setScorecards] = useState<Scorecard[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showMetricModal, setShowMetricModal] = useState(false);
  const [editingScorecard, setEditingScorecard] = useState<Scorecard | null>(null);
  const [selectedScorecard, setSelectedScorecard] = useState<Scorecard | null>(null);
  const [organizationId, setOrganizationId] = useState<string>('');

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    target_kpi_id: '',
    status: 'active' as const,
  });

  const [metricFormData, setMetricFormData] = useState({
    metric_id: '',
    weight: 1,
    target_value: 0,
    threshold_red: 0,
    threshold_yellow: 0,
    threshold_green: 0,
  });

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;

    try {
      setLoading(true);

      const { data: orgData } = await supabase
        .from('user_organizations')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      console.log('🔍 Step 1 - User ID:', user.id);
      console.log('🔍 Step 2 - Organization Data:', orgData);

      if (!orgData) {
        console.error('❌ No organization found for user');
        return;
      }
      setOrganizationId(orgData.organization_id);

      // Load KPIs with debug logging
      const { data: kpisData, error: kpisError } = await supabase
        .from('kpis')
        .select('id, name, description')
        .eq('organization_id', orgData.organization_id)
        .order('name');

      console.log('🔍 Step 3 - KPI Query Details:');
      console.log('  - Organization ID used:', orgData.organization_id);
      console.log('  - KPIs returned:', kpisData?.length || 0);
      console.log('  - KPIs data:', kpisData);
      console.log('  - Query error:', kpisError);

      // Let's also check ALL KPIs in the table (for debugging)
      const { data: allKpis, error: allKpisError } = await supabase
        .from('kpis')
        .select('id, name, organization_id');
      
      console.log('🔍 Step 4 - ALL KPIs in database:', allKpis);
      console.log('  - Total KPIs in table:', allKpis?.length || 0);
      console.log('  - Error:', allKpisError);

      if (kpisData) setKpis(kpisData);

      // Load metrics
      const { data: metricsData } = await supabase
        .from('metrics')
        .select('id, name, unit')
        .eq('organization_id', orgData.organization_id)
        .order('name');

      if (metricsData) setMetrics(metricsData);

      // Load scorecards
      await loadScorecards(orgData.organization_id);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadScorecards = async (orgId: string) => {
    const { data, error } = await supabase
      .from('kpi_scorecards')
      .select(`
        *,
        owner:user_profiles!kpi_scorecards_owner_id_fkey(full_name)
      `)
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading scorecards:', error);
      return;
    }

    // Load metrics for each scorecard
    const scorecardsWithMetrics = await Promise.all(
      data.map(async (scorecard: any) => {
        const { data: metricsData } = await supabase
          .from('kpi_scorecard_metrics')
          .select(`
            *,
            metric:metrics(name, unit)
          `)
          .eq('scorecard_id', scorecard.id)
          .order('display_order');

        // Get current values for metrics
        const metricsWithValues = await Promise.all(
          (metricsData || []).map(async (m: any) => {
            const { data: latestData } = await supabase
              .from('metric_data')
              .select('value')
              .eq('metric_id', m.metric_id)
              .order('timestamp', { ascending: false })
              .limit(1)
              .single();

            return {
              ...m,
              metric_name: m.metric?.name,
              metric_unit: m.metric?.unit,
              current_value: latestData?.value,
            };
          })
        );

        return {
          ...scorecard,
          owner_name: scorecard.owner?.full_name || 'Unknown',
          metrics: metricsWithValues,
        };
      })
    );

    setScorecards(scorecardsWithMetrics);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !organizationId) return;

    try {
      const scorecardData = {
        name: formData.name,
        description: formData.description,
        target_kpi_id: formData.target_kpi_id,
        status: formData.status,
        organization_id: organizationId,
        owner_id: user.id,
        category: formData.target_kpi_id, // Keep for backward compatibility
      };

      if (editingScorecard) {
        const { error } = await supabase
          .from('kpi_scorecards')
          .update(scorecardData)
          .eq('id', editingScorecard.id);

        if (error) throw error;
        showToast('Scorecard updated successfully', 'success');
      } else {
        const { error } = await supabase
          .from('kpi_scorecards')
          .insert([scorecardData]);

        if (error) throw error;
        showToast('Scorecard created successfully', 'success');
      }

      await loadScorecards(organizationId);
      resetForm();
    } catch (error) {
      console.error('Error saving scorecard:', error);
      showToast('Failed to save scorecard', 'error');
    }
  };

  const handleAddMetric = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedScorecard) return;

    try {
      const { error } = await supabase
        .from('kpi_scorecard_metrics')
        .insert([{
          scorecard_id: selectedScorecard.id,
          ...metricFormData,
        }]);

      if (error) throw error;

      showToast('Metric added to scorecard successfully', 'success');
      await loadScorecards(organizationId);
      resetMetricForm();
    } catch (error) {
      console.error('Error adding metric:', error);
      showToast('Failed to add metric to scorecard', 'error');
    }
  };

  const handleRemoveMetric = async (metricId: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Remove Metric',
      message: 'Are you sure you want to remove this metric from the scorecard?',
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from('kpi_scorecard_metrics')
            .delete()
            .eq('id', metricId);

          if (error) throw error;

          showToast('Metric removed successfully', 'success');
          await loadScorecards(organizationId);
        } catch (error) {
          console.error('Error removing metric:', error);
          showToast('Failed to remove metric', 'error');
        }
        setConfirmDialog({ ...confirmDialog, isOpen: false });
      }
    });
  };

  const handleDelete = async (id: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Scorecard',
      message: 'Are you sure you want to delete this scorecard? This action cannot be undone.',
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from('kpi_scorecards')
            .delete()
            .eq('id', id);

          if (error) throw error;

          showToast('Scorecard deleted successfully', 'success');
          setScorecards(scorecards.filter((s) => s.id !== id));
        } catch (error) {
          console.error('Error deleting scorecard:', error);
          showToast('Failed to delete scorecard', 'error');
        }
        setConfirmDialog({ ...confirmDialog, isOpen: false });
      }
    });
  };

  const handleEdit = (scorecard: Scorecard) => {
    setEditingScorecard(scorecard);
    setFormData({
      name: scorecard.name,
      description: scorecard.description || '',
      target_kpi_id: scorecard.category || '',
      status: scorecard.status,
    });
    setShowModal(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      target_kpi_id: '',
      status: 'active',
    });
    setEditingScorecard(null);
    setShowModal(false);
  };

  const resetMetricForm = () => {
    setMetricFormData({
      metric_id: '',
      weight: 1,
      target_value: 0,
      threshold_red: 0,
      threshold_yellow: 0,
      threshold_green: 0,
    });
    setShowMetricModal(false);
  };

  const calculateScore = (metric: ScorecardMetric): number => {
    if (!metric.current_value) return 0;
    
    const value = metric.current_value;
    if (value >= metric.threshold_green) return 100;
    if (value >= metric.threshold_yellow) return 75;
    if (value >= metric.threshold_red) return 50;
    return 25;
  };

  const getPerformanceColor = (score: number): string => {
    if (score >= 90) return 'text-green-600';
    if (score >= 75) return 'text-yellow-600';
    if (score >= 50) return 'text-orange-600';
    return 'text-red-600';
  };

  const getStatusColor = (metric: ScorecardMetric): string => {
    if (!metric.current_value) return 'bg-gray-200';
    
    const value = metric.current_value;
    if (value >= metric.threshold_green) return 'bg-green-500';
    if (value >= metric.threshold_yellow) return 'bg-yellow-500';
    if (value >= metric.threshold_red) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const calculateOverallScore = (scorecard: Scorecard): number => {
    if (!scorecard.metrics || scorecard.metrics.length === 0) return 0;
    
    const totalWeight = scorecard.metrics.reduce((sum, m) => sum + m.weight, 0);
    const weightedScore = scorecard.metrics.reduce((sum, m) => {
      return sum + (calculateScore(m) * m.weight);
    }, 0);
    
    return totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 0;
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return '#10B981';
    if (score >= 60) return '#F59E0B';
    return '#EF4444';
  };

  const getScoreData = (score: number) => [
    {
      name: 'Score',
      value: score,
      fill: getScoreColor(score)
    }
  ];

  const handleExportPDF = () => {
    const exportData = scorecards.flatMap(scorecard => 
      (scorecard.metrics || []).map(metric => ({
        scorecard_name: scorecard.name,
        metric_name: metric.metric_name,
        current_value: metric.current_value?.toFixed(2) || 'N/A',
        target_value: metric.target_value,
        weight: metric.weight,
        score: calculateScore(metric),
        status: metric.current_value && metric.current_value >= metric.threshold_green ? 'Green' :
                metric.current_value && metric.current_value >= metric.threshold_yellow ? 'Yellow' :
                metric.current_value && metric.current_value >= metric.threshold_red ? 'Orange' : 'Red'
      }))
    );

    exportToPDF(
      'KPI Scorecards Report',
      exportData,
      [
        { header: 'Scorecard', dataKey: 'scorecard_name' },
        { header: 'Metric', dataKey: 'metric_name' },
        { header: 'Current', dataKey: 'current_value' },
        { header: 'Target', dataKey: 'target_value' },
        { header: 'Weight', dataKey: 'weight' },
        { header: 'Score', dataKey: 'score' },
        { header: 'Status', dataKey: 'status' },
      ],
      {
        orientation: 'landscape',
        includeDate: true,
        includeStats: [
          { label: 'Total Scorecards', value: scorecards.length.toString() },
          { label: 'Total Metrics', value: exportData.length.toString() },
          { label: 'Average Score', value: exportData.length > 0 ? Math.round(exportData.reduce((sum, m) => sum + m.score, 0) / exportData.length).toString() : '0' },
        ]
      }
    );
  };

  const handleExportCSV = () => {
    const exportData = scorecards.flatMap(scorecard => 
      (scorecard.metrics || []).map(metric => ({
        scorecard_name: scorecard.name,
        scorecard_category: scorecard.category,
        metric_name: metric.metric_name,
        current_value: metric.current_value,
        target_value: metric.target_value,
        weight: metric.weight,
        threshold_red: metric.threshold_red,
        threshold_yellow: metric.threshold_yellow,
        threshold_green: metric.threshold_green,
        score: calculateScore(metric),
      }))
    );
    exportToCSV(exportData, 'kpi_scorecards');
  };

  const handleExportExcel = () => {
    const exportData = scorecards.flatMap(scorecard => 
      (scorecard.metrics || []).map(metric => ({
        scorecard_name: scorecard.name,
        scorecard_category: scorecard.category,
        scorecard_owner: scorecard.owner_name,
        metric_name: metric.metric_name,
        metric_unit: metric.metric_unit,
        current_value: metric.current_value,
        target_value: metric.target_value,
        weight: metric.weight,
        threshold_red: metric.threshold_red,
        threshold_yellow: metric.threshold_yellow,
        threshold_green: metric.threshold_green,
        score: calculateScore(metric),
        overall_score: calculateOverallScore(scorecard),
      }))
    );

    exportToExcel(
      exportData,
      'KPI_Scorecards',
      'KPI Scorecards',
      {
        includeStats: [
          { label: 'Total Scorecards', value: scorecards.length.toString() },
          { label: 'Total Metrics', value: exportData.length.toString() },
          { label: 'Average Score', value: exportData.length > 0 ? Math.round(exportData.reduce((sum, m) => sum + m.score, 0) / exportData.length).toString() : '0' },
        ],
        columns: ['scorecard_name', 'scorecard_category', 'metric_name', 'current_value', 'target_value', 'weight', 'score', 'overall_score']
      }
    );
  };

  const handleExportScorecardChart = async (scorecardId: string, scorecardName: string) => {
    const chartElement = document.querySelector(`#scorecard-chart-${scorecardId}`);
    if (chartElement) {
      await exportChartAsImage(chartElement as HTMLElement, `scorecard_${scorecardName.replace(/\s+/g, '_')}`);
    }
  };

  const handleDownloadTemplate = () => {
    downloadTemplate(
      'KPI_Scorecard_Import_Template',
      [
        { name: 'scorecard_name', description: 'Scorecard name (required)', example: 'Emergency Department Performance' },
        { name: 'target_kpi_id', description: 'Target KPI ID from KPI Manager (required)', example: 'abc123...' },
        { name: 'owner', description: 'Owner name', example: 'Dr. Sarah Johnson' },
        { name: 'metric_name', description: 'Metric name (required)', example: 'Door-to-Doctor Time' },
        { name: 'current_value', description: 'Current value (number)', example: '25' },
        { name: 'target_value', description: 'Target value (number)', example: '15' },
        { name: 'weight', description: 'Metric weight percentage (0-100)', example: '30' },
        { name: 'unit', description: 'Unit of measurement', example: 'minutes' }
      ]
    );
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Debug Info Banner */}
      {import.meta.env.MODE === 'development' && (
        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="text-sm font-mono">
            <div><strong>Debug Info:</strong></div>
            <div>Organization ID: {organizationId || 'Not loaded'}</div>
            <div>KPIs Available: {kpis.length}</div>
            <div>Metrics Available: {metrics.length}</div>
            {kpis.length > 0 && (
              <div className="mt-2">
                <strong>Available KPIs:</strong>
                <ul className="list-disc list-inside">
                  {kpis.map(kpi => (
                    <li key={kpi.id}>{kpi.name} (ID: {kpi.id.substring(0, 8)}...)</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">KPI Scorecards</h1>
          <p className="text-gray-600 mt-1">Track and monitor key performance indicators</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Export Buttons */}
          {scorecards.length > 0 && (
            <>
              <button
                onClick={handleDownloadTemplate}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors whitespace-nowrap flex items-center"
              >
                <i className="ri-download-2-line mr-2"></i>
                <span className="hidden sm:inline">Download Template</span>
                <span className="sm:hidden">Template</span>
              </button>
              
              <button
                onClick={handleExportPDF}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap flex items-center"
              >
                <i className="ri-file-pdf-line mr-2"></i>
                <span className="hidden sm:inline">Export PDF</span>
                <span className="sm:hidden">PDF</span>
              </button>
              <button
                onClick={handleExportCSV}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 whitespace-nowrap"
                title="Export to CSV"
              >
                <i className="ri-file-excel-line"></i>
                <span className="hidden sm:inline">CSV</span>
              </button>
              <button
                onClick={handleExportExcel}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 whitespace-nowrap"
                title="Export to Excel"
              >
                <i className="ri-file-excel-2-line"></i>
                <span className="hidden sm:inline">Excel</span>
              </button>
            </>
          )}
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap flex items-center gap-2"
          >
            <i className="ri-add-line"></i>
            New Scorecard
          </button>
        </div>
      </div>

      {/* Scorecards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {scorecards.map((scorecard) => {
          const overallScore = calculateOverallScore(scorecard);
          
          return (
            <div key={scorecard.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              {/* Scorecard Header */}
              <div className="p-6 border-b border-gray-200" id={`scorecard-chart-${scorecard.id}`}>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-gray-900">{scorecard.name}</h3>
                    {scorecard.description && (
                      <p className="text-sm text-gray-600 mt-1">{scorecard.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs text-gray-500">
                        <i className="ri-folder-line mr-1"></i>
                        {scorecard.category}
                      </span>
                      <span className="text-xs text-gray-500">
                        <i className="ri-user-line mr-1"></i>
                        {scorecard.owner_name}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleExportScorecardChart(scorecard.id, scorecard.name)}
                      className="p-2 text-gray-600 hover:bg-gray-100 rounded transition-colors"
                      title="Export Chart"
                    >
                      <i className="ri-download-line text-lg"></i>
                    </button>
                    <button
                      onClick={() => {
                        setSelectedScorecard(scorecard);
                        setShowMetricModal(true);
                      }}
                      className="p-2 text-teal-600 hover:bg-teal-50 rounded"
                      title="Add Metric"
                    >
                      <i className="ri-add-circle-line text-lg"></i>
                    </button>
                    <button
                      onClick={() => handleEdit(scorecard)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                      title="Edit"
                    >
                      <i className="ri-edit-line text-lg"></i>
                    </button>
                    <button
                      onClick={() => handleDelete(scorecard.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded"
                      title="Delete"
                    >
                      <i className="ri-delete-bin-line text-lg"></i>
                    </button>
                  </div>
                </div>

                {/* Overall Score */}
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="text-sm text-gray-600 mb-1">Overall Score</div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 bg-gray-200 rounded-full h-3">
                        <div
                          className={`h-3 rounded-full transition-all ${
                            overallScore >= 90 ? 'bg-green-500' :
                            overallScore >= 75 ? 'bg-yellow-500' :
                            overallScore >= 50 ? 'bg-orange-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${overallScore}%` }}
                        ></div>
                      </div>
                      <span className={`text-2xl font-bold ${getPerformanceColor(overallScore)}`}>
                        {overallScore}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Metrics List */}
              <div className="p-6">
                {scorecard.metrics && scorecard.metrics.length > 0 ? (
                  <div className="space-y-4">
                    {scorecard.metrics.map((metric) => (
                      <div key={metric.id} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="font-medium text-gray-900">{metric.metric_name}</div>
                            <div className="text-sm text-gray-600 mt-1">
                              Weight: {metric.weight}x | Target: {metric.target_value} {metric.metric_unit}
                            </div>
                          </div>
                          <button
                            onClick={() => handleRemoveMetric(metric.id)}
                            className="p-1 text-red-600 hover:bg-red-50 rounded"
                            title="Remove"
                          >
                            <i className="ri-close-line"></i>
                          </button>
                        </div>

                        {/* Current Value & Status */}
                        <div className="flex items-center gap-3 mb-2">
                          <div className={`w-3 h-3 rounded-full ${getStatusColor(metric)}`}></div>
                          <span className="text-lg font-bold text-gray-900">
                            {metric.current_value?.toFixed(2) || 'N/A'} {metric.metric_unit}
                          </span>
                          <span className="text-sm text-gray-600">
                            Score: {calculateScore(metric)}
                          </span>
                        </div>

                        {/* Thresholds */}
                        <div className="flex items-center gap-2 text-xs text-gray-600">
                          <span className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full bg-red-500"></div>
                            &lt; {metric.threshold_red}
                          </span>
                          <span className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                            &lt; {metric.threshold_yellow}
                          </span>
                          <span className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                            &lt; {metric.threshold_green}
                          </span>
                          <span className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                            ≥ {metric.threshold_green}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <i className="ri-bar-chart-line text-4xl mb-2"></i>
                    <p>No metrics added yet</p>
                    <button
                      onClick={() => {
                        setSelectedScorecard(scorecard);
                        setShowMetricModal(true);
                      }}
                      className="mt-3 text-teal-600 hover:text-teal-700 text-sm font-medium"
                    >
                      Add your first metric
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {scorecards.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <i className="ri-dashboard-line text-6xl text-gray-400 mb-4"></i>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No Scorecards Yet</h3>
          <p className="text-gray-600 mb-4">Create your first KPI scorecard to start tracking performance</p>
          <button
            onClick={() => setShowModal(true)}
            className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
          >
            Create Scorecard
          </button>
        </div>
      )}

      {/* Scorecard Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-lg w-full">
            <div className="p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                {editingScorecard ? 'Edit Scorecard' : 'New Scorecard'}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Target KPI *</label>
                  <select
                    required
                    value={formData.target_kpi_id}
                    onChange={(e) => setFormData({ ...formData, target_kpi_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="">Select a KPI</option>
                    {kpis.map((kpi) => (
                      <option key={kpi.id} value={kpi.id}>
                        {kpi.name}
                      </option>
                    ))}
                  </select>
                  {kpis.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">
                      <i className="ri-information-line mr-1"></i>
                      No KPIs found. Create KPIs in the KPI Manager first.
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
                <div className="flex gap-3 pt-4">
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
                  >
                    {editingScorecard ? 'Update' : 'Create'}
                  </button>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors whitespace-nowrap"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Add Metric Modal */}
      {showMetricModal && selectedScorecard && (
        <div className="fixed inset-0 bg-black bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-lg w-full">
            <div className="p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                Add Metric to {selectedScorecard.name}
              </h2>
              <form onSubmit={handleAddMetric} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Metric *</label>
                  <select
                    required
                    value={metricFormData.metric_id}
                    onChange={(e) => setMetricFormData({ ...metricFormData, metric_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="">Select a metric</option>
                    {metrics.map((metric) => (
                      <option key={metric.id} value={metric.id}>
                        {metric.name} ({metric.unit})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Weight</label>
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    required
                    value={metricFormData.weight}
                    onChange={(e) => setMetricFormData({ ...metricFormData, weight: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Target Value</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={metricFormData.target_value}
                    onChange={(e) => setMetricFormData({ ...metricFormData, target_value: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-red-700 mb-1">Red Threshold</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={metricFormData.threshold_red}
                      onChange={(e) => setMetricFormData({ ...metricFormData, threshold_red: parseFloat(e.target.value) })}
                      className="w-full px-3 py-2 border border-red-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-yellow-700 mb-1">Yellow Threshold</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={metricFormData.threshold_yellow}
                      onChange={(e) => setMetricFormData({ ...metricFormData, threshold_yellow: parseFloat(e.target.value) })}
                      className="w-full px-3 py-2 border border-yellow-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-green-700 mb-1">Green Threshold</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={metricFormData.threshold_green}
                      onChange={(e) => setMetricFormData({ ...metricFormData, threshold_green: parseFloat(e.target.value) })}
                      className="w-full px-3 py-2 border border-green-300 rounded-lg text-sm"
                    />
                  </div>
                </div>
                <div className="flex gap-3 pt-4">
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
                  >
                    Add Metric
                  </button>
                  <button
                    type="button"
                    onClick={resetMetricForm}
                    className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors whitespace-nowrap"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
      />
    </div>
  );
}