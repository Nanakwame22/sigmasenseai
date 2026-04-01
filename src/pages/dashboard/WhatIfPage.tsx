import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';
import { useToast } from '../../hooks/useToast';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { Link } from 'react-router-dom';

interface WhatIfScenario {
  id: string;
  name: string;
  description: string | null;
  base_metric_id: string | null;
  variables: any;
  assumptions: any;
  results: any;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  tags?: string[];
  confidence_level?: number;
  risk_assessment?: any;
}

interface Metric {
  id: string;
  name: string;
}

const SCENARIO_TEMPLATES = [
  {
    name: 'Revenue Growth Analysis',
    description: 'Analyze impact of price and volume changes on revenue',
    variables: [
      { name: 'Price', current: 100, scenario: 110, unit: '$', weight: 0.4 },
      { name: 'Volume', current: 1000, scenario: 1200, unit: 'units', weight: 0.4 },
      { name: 'Market Share', current: 15, scenario: 18, unit: '%', weight: 0.2 }
    ]
  },
  {
    name: 'Cost Optimization',
    description: 'Model cost reduction initiatives and their profit impact',
    variables: [
      { name: 'Material Cost', current: 50, scenario: 45, unit: '$/unit', weight: 0.5 },
      { name: 'Labor Cost', current: 30, scenario: 28, unit: '$/hour', weight: 0.3 },
      { name: 'Overhead', current: 20000, scenario: 18000, unit: '$/month', weight: 0.2 }
    ]
  },
  {
    name: 'Market Expansion',
    description: 'Evaluate new market entry scenarios',
    variables: [
      { name: 'Market Size', current: 0, scenario: 50000, unit: 'customers', weight: 0.4 },
      { name: 'Penetration Rate', current: 0, scenario: 5, unit: '%', weight: 0.3 },
      { name: 'Investment Required', current: 0, scenario: 100000, unit: '$', weight: 0.3 }
    ]
  }
];

const CONFIDENCE_LEVELS = [
  { value: 0.9, label: 'High Confidence (90%)', color: 'text-green-600' },
  { value: 0.7, label: 'Medium Confidence (70%)', color: 'text-yellow-600' },
  { value: 0.5, label: 'Low Confidence (50%)', color: 'text-red-600' }
];

const RISK_FACTORS = [
  'Market volatility',
  'Competitive response',
  'Economic conditions',
  'Regulatory changes',
  'Technology disruption',
  'Supply chain issues'
];

export default function WhatIfPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [scenarios, setScenarios] = useState<WhatIfScenario[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState<WhatIfScenario | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'created_at' | 'name' | 'confidence'>('created_at');
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [scenarioToDelete, setScenarioToDelete] = useState<string | null>(null);
  const [metricsWithData, setMetricsWithData] = useState<Array<{ id: string; name: string; dataCount: number }>>([]);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    base_metric_id: '',
    variables: [
      { name: 'Price', current: 100, scenario: 110, unit: '$', weight: 0.33 },
      { name: 'Volume', current: 1000, scenario: 1200, unit: 'units', weight: 0.33 },
      { name: 'Cost', current: 60, scenario: 55, unit: '$', weight: 0.34 }
    ],
    tags: [] as string[],
    confidence_level: 0.7,
    risk_factors: [] as string[],
    time_horizon: 12
  });

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;

    try {
      const orgId = localStorage.getItem('current_organization_id');
      if (!orgId) {
        console.warn('No organization selected');
        setLoading(false);
        return;
      }

      const [scenariosRes, metricsRes] = await Promise.all([
        supabase
          .from('what_if_scenarios')
          .select('*')
          .eq('organization_id', orgId)
          .order('created_at', { ascending: false }),
        supabase
          .from('metrics')
          .select('id, name')
          .eq('organization_id', orgId)
      ]);

      if (scenariosRes.data) setScenarios(scenariosRes.data);
      if (metricsRes.data) {
        setMetrics(metricsRes.data);
        
        // Fetch data point counts for each metric
        const metricsWithCounts = await Promise.all(
          metricsRes.data.map(async (metric) => {
            const { count } = await supabase
              .from('metric_data')
              .select('*', { count: 'exact', head: true })
              .eq('metric_id', metric.id);
            
            return {
              id: metric.id,
              name: metric.name,
              dataCount: count || 0
            };
          })
        );
        
        setMetricsWithData(metricsWithCounts);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateAdvancedScenario = (variables: any[], timeHorizon: number = 12, confidenceLevel: number = 0.7) => {
    const results = {
      current: {
        revenue: 0,
        cost: 0,
        profit: 0,
        margin: 0,
        roi: 0
      },
      scenario: {
        revenue: 0,
        cost: 0,
        profit: 0,
        margin: 0,
        roi: 0
      },
      changes: {
        revenue: 0,
        cost: 0,
        profit: 0,
        margin: 0,
        roi: 0
      },
      sensitivity: {} as any,
      risk_assessment: {
        overall_risk: 'medium',
        risk_factors: [],
        probability_success: confidenceLevel
      }
    };

    // Advanced calculations with weighted impact
    const price = variables.find(v => v.name.toLowerCase().includes('price'));
    const volume = variables.find(v => v.name.toLowerCase().includes('volume'));
    const cost = variables.find(v => v.name.toLowerCase().includes('cost'));

    if (price && volume && cost) {
      // Current scenario
      results.current.revenue = price.current * volume.current;
      results.current.cost = cost.current * volume.current;
      results.current.profit = results.current.revenue - results.current.cost;
      results.current.margin = (results.current.profit / results.current.revenue) * 100;
      results.current.roi = (results.current.profit / results.current.cost) * 100;

      // Scenario with confidence adjustments
      const confidenceAdjustment = 0.5 + (confidenceLevel * 0.5);
      results.scenario.revenue = price.scenario * volume.scenario * confidenceAdjustment;
      results.scenario.cost = cost.scenario * volume.scenario * confidenceAdjustment;
      results.scenario.profit = results.scenario.revenue - results.scenario.cost;
      results.scenario.margin = (results.scenario.profit / results.scenario.revenue) * 100;
      results.scenario.roi = (results.scenario.profit / results.scenario.cost) * 100;

      // Changes calculation
      Object.keys(results.changes).forEach(key => {
        if (results.current[key as keyof typeof results.current] !== 0) {
          results.changes[key as keyof typeof results.changes] = 
            ((results.scenario[key as keyof typeof results.scenario] - results.current[key as keyof typeof results.current]) / 
             results.current[key as keyof typeof results.current]) * 100;
        }
      });

      // Sensitivity analysis
      results.sensitivity = variables.reduce((acc, variable) => {
        const impact = ((variable.scenario - variable.current) / variable.current) * (variable.weight || 1);
        acc[variable.name] = {
          impact: impact * 100,
          weight: variable.weight || 1,
          contribution: impact * (variable.weight || 1) * results.changes.profit
        };
        return acc;
      }, {});
    }

    // Generate enhanced projection with multiple scenarios
    const projection = [];
    const monthlyGrowthRate = Math.pow(1.02, 1); // 2% monthly base growth
    
    for (let month = 0; month <= timeHorizon; month++) {
      const optimistic = results.scenario.profit * Math.pow(monthlyGrowthRate * 1.1, month);
      const realistic = results.scenario.profit * Math.pow(monthlyGrowthRate, month);
      const pessimistic = results.scenario.profit * Math.pow(monthlyGrowthRate * 0.9, month);
      const current = results.current.profit * Math.pow(monthlyGrowthRate * 0.98, month);

      projection.push({
        month: month === 0 ? 'Now' : `M${month}`,
        current: Math.round(current),
        realistic: Math.round(realistic),
        optimistic: Math.round(optimistic),
        pessimistic: Math.round(pessimistic),
        cumulative_difference: Math.round((realistic - current) * month)
      });
    }

    // Risk assessment
    const totalChange = Math.abs(results.changes.profit || 0);
    if (totalChange > 50) {
      results.risk_assessment.overall_risk = 'high';
    } else if (totalChange > 20) {
      results.risk_assessment.overall_risk = 'medium';
    } else {
      results.risk_assessment.overall_risk = 'low';
    }

    return { ...results, projection };
  };

  const handleCreate = async () => {
    if (!user || !formData.name.trim()) return;

    try {
      const orgId = localStorage.getItem('current_organization_id');
      if (!orgId) {
        showToast('Please select an organization first', 'warning');
        return;
      }

      const results = calculateAdvancedScenario(
        formData.variables, 
        formData.time_horizon, 
        formData.confidence_level
      );

      const assumptions = formData.variables.map(v => ({
        variable: v.name,
        assumption: `${v.name} changes from ${v.current} to ${v.scenario} ${v.unit}`,
        impact: ((v.scenario - v.current) / v.current * 100).toFixed(1) + '%',
        weight: v.weight || 1,
        confidence: formData.confidence_level
      }));

      const { error } = await supabase.from('what_if_scenarios').insert({
        organization_id: orgId,
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        base_metric_id: formData.base_metric_id || null,
        variables: formData.variables,
        assumptions,
        results,
        status: 'completed',
        created_by: user.id,
        tags: formData.tags,
        confidence_level: formData.confidence_level,
        risk_assessment: {
          risk_factors: formData.risk_factors,
          overall_risk: results.risk_assessment.overall_risk,
          time_horizon: formData.time_horizon
        }
      });

      if (error) {
        console.error('Error creating scenario:', error);
        showToast('Failed to create scenario', 'error');
        return;
      }

      setShowCreateModal(false);
      resetForm();
      loadData();
      showToast('Scenario created successfully!', 'success');
    } catch (error) {
      console.error('Error creating scenario:', error);
      showToast('An error occurred', 'error');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      base_metric_id: '',
      variables: [
        { name: 'Price', current: 100, scenario: 110, unit: '$', weight: 0.33 },
        { name: 'Volume', current: 1000, scenario: 1200, unit: 'units', weight: 0.33 },
        { name: 'Cost', current: 60, scenario: 55, unit: '$', weight: 0.34 }
      ],
      tags: [],
      confidence_level: 0.7,
      risk_factors: [],
      time_horizon: 12
    });
    setSelectedTemplate(null);
    setShowAdvancedOptions(false);
  };

  const handleDelete = async (id: string) => {
    setScenarioToDelete(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!scenarioToDelete) return;

    try {
      const { error } = await supabase.from('what_if_scenarios').delete().eq('id', scenarioToDelete);
      if (error) {
        console.error('Error deleting scenario:', error);
        showToast('Failed to delete scenario', 'error');
        return;
      }
      loadData();
      showToast('Scenario deleted successfully', 'success');
    } catch (error) {
      console.error('Error deleting scenario:', error);
      showToast('An error occurred while deleting', 'error');
    } finally {
      setShowDeleteConfirm(false);
      setScenarioToDelete(null);
    }
  };

  const duplicateScenario = async (scenario: WhatIfScenario) => {
    try {
      const orgId = localStorage.getItem('current_organization_id');
      if (!orgId) return;

      const { error } = await supabase.from('what_if_scenarios').insert({
        organization_id: orgId,
        name: `${scenario.name} (Copy)`,
        description: scenario.description,
        base_metric_id: scenario.base_metric_id,
        variables: scenario.variables,
        assumptions: scenario.assumptions,
        results: scenario.results,
        status: 'completed',
        created_by: user!.id,
        tags: scenario.tags || [],
        confidence_level: scenario.confidence_level || 0.7
      });

      if (!error) {
        loadData();
      }
    } catch (error) {
      console.error('Error duplicating scenario:', error);
    }
  };

  const exportScenario = (scenario: WhatIfScenario) => {
    const exportData = {
      name: scenario.name,
      description: scenario.description,
      variables: scenario.variables,
      results: scenario.results,
      created_at: scenario.created_at
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${scenario.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_scenario.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const updateVariable = (index: number, field: string, value: any) => {
    const newVariables = [...formData.variables];
    newVariables[index] = { ...newVariables[index], [field]: value };
    
    // Auto-balance weights
    if (field === 'weight') {
      const totalWeight = newVariables.reduce((sum, v, i) => sum + (i === index ? value : v.weight), 0);
      if (totalWeight > 1) {
        const excess = totalWeight - 1;
        newVariables.forEach((v, i) => {
          if (i !== index && v.weight > 0) {
            v.weight = Math.max(0.01, v.weight - (excess * v.weight / (totalWeight - value)));
          }
        });
      }
    }
    
    setFormData({ ...formData, variables: newVariables });
  };

  const addVariable = () => {
    const newWeight = 1 / (formData.variables.length + 1);
    const adjustedVariables = formData.variables.map(v => ({ ...v, weight: v.weight * (1 - newWeight) }));
    
    setFormData({
      ...formData,
      variables: [...adjustedVariables, { name: '', current: 0, scenario: 0, unit: '', weight: newWeight }]
    });
  };

  const removeVariable = (index: number) => {
    if (formData.variables.length <= 1) return;
    
    const newVariables = formData.variables.filter((_, i) => i !== index);
    // Redistribute weights
    const totalWeight = newVariables.reduce((sum, v) => sum + v.weight, 0);
    if (totalWeight > 0) {
      newVariables.forEach(v => v.weight = v.weight / totalWeight);
    }
    
    setFormData({ ...formData, variables: newVariables });
  };

  const applyTemplate = (templateIndex: number) => {
    const template = SCENARIO_TEMPLATES[templateIndex];
    setFormData({
      ...formData,
      name: template.name,
      description: template.description,
      variables: [...template.variables]
    });
    setSelectedTemplate(templateIndex);
  };

  const addTag = (tag: string) => {
    if (tag.trim() && !formData.tags.includes(tag.trim())) {
      setFormData({ ...formData, tags: [...formData.tags, tag.trim()] });
    }
  };

  const removeTag = (tagIndex: number) => {
    setFormData({ ...formData, tags: formData.tags.filter((_, i) => i !== tagIndex) });
  };

  const toggleRiskFactor = (factor: string) => {
    const current = formData.risk_factors;
    const updated = current.includes(factor)
      ? current.filter(f => f !== factor)
      : [...current, factor];
    setFormData({ ...formData, risk_factors: updated });
  };

  // Filter and sort scenarios
  const filteredAndSortedScenarios = scenarios
    .filter(s => {
      const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           (s.description && s.description.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesStatus = filterStatus === 'all' || s.status === filterStatus;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'confidence':
          return (b.confidence_level || 0) - (a.confidence_level || 0);
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
        <span className="ml-3 text-gray-600">Loading scenarios...</span>
      </div>
    );
  }

  const metricsWithSufficientData = metricsWithData.filter(m => m.dataCount >= 3);

  return (
    <div className="space-y-6">
      {/* Enhanced Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">What-If Analysis</h1>
          <p className="text-sm text-gray-600 mt-1">Advanced scenario modeling with risk assessment and sensitivity analysis</p>
          <div className="flex items-center gap-4 mt-2">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <i className="ri-line-chart-line"></i>
              <span>{scenarios.length} scenarios</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <i className="ri-shield-check-line"></i>
              <span>Risk assessment enabled</span>
            </div>
          </div>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-2 whitespace-nowrap"
        >
          <i className="ri-add-line"></i>
          New Scenario
        </button>
      </div>

      {/* Warning Banner for Metrics Data */}
      {metricsWithData.length === 0 ? (
        <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-lg">
          <div className="flex items-start">
            <i className="ri-information-line text-blue-600 text-xl mr-3 mt-0.5"></i>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-blue-900 mb-1">Connect to Your Metrics</h3>
              <p className="text-sm text-blue-800 mb-3">
                What-If Analysis can be linked to your metrics for data-driven scenario modeling. While you can create scenarios without metrics, connecting them provides more accurate baseline data.
              </p>
              <Link
                to="/dashboard/metrics"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
              >
                <i className="ri-add-line"></i>
                Create Metrics
              </Link>
            </div>
          </div>
        </div>
      ) : metricsWithSufficientData.length === 0 ? (
        <div className="bg-orange-50 border-l-4 border-orange-400 p-4 rounded-lg">
          <div className="flex items-start">
            <i className="ri-alert-line text-orange-600 text-xl mr-3 mt-0.5"></i>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-orange-900 mb-1">Add Data for Better Scenarios</h3>
              <p className="text-sm text-orange-800 mb-2">
                Your metrics need data points to provide accurate baseline values for scenario modeling. Add at least 3 data points per metric.
              </p>
              <ul className="text-sm text-orange-800 mb-3 space-y-1">
                {metricsWithData.slice(0, 5).map(m => (
                  <li key={m.id} className="flex items-center gap-2">
                    <i className="ri-close-circle-line text-orange-600"></i>
                    <span><strong>{m.name}</strong>: {m.dataCount} data {m.dataCount === 1 ? 'point' : 'points'}</span>
                  </li>
                ))}
                {metricsWithData.length > 5 && (
                  <li className="text-orange-700">...and {metricsWithData.length - 5} more</li>
                )}
              </ul>
              <Link
                to="/dashboard/metrics"
                className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700 transition-colors"
              >
                <i className="ri-add-circle-line"></i>
                Add Data Points
              </Link>
            </div>
          </div>
        </div>
      ) : metricsWithSufficientData.length < metricsWithData.length ? (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-lg">
          <div className="flex items-start">
            <i className="ri-information-line text-yellow-600 text-xl mr-3 mt-0.5"></i>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-yellow-900 mb-1">Metrics Data Status</h3>
              <p className="text-sm text-yellow-800 mb-2">
                <strong>{metricsWithSufficientData.length}</strong> of <strong>{metricsWithData.length}</strong> metrics have sufficient data for accurate baseline modeling.
              </p>
              <Link
                to="/dashboard/metrics"
                className="text-sm text-yellow-900 underline hover:text-yellow-700"
              >
                Add more data points for better scenario accuracy →
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {/* Enhanced Filters */}
      <div className="flex flex-col sm:flex-row gap-4 bg-white p-4 rounded-lg border border-gray-200">
        <div className="flex-1 relative">
          <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
          <input
            type="text"
            placeholder="Search scenarios..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          >
            <option value="all">All Status</option>
            <option value="completed">Completed</option>
            <option value="draft">Draft</option>
          </select>
          
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          >
            <option value="created_at">Latest First</option>
            <option value="name">Name A-Z</option>
            <option value="confidence">Confidence</option>
          </select>
          
          <div className="flex bg-gray-100 rounded-lg">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-2 rounded-lg text-sm transition-colors ${viewMode === 'grid' ? 'bg-white shadow-sm' : ''}`}
            >
              <i className="ri-grid-line"></i>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-2 rounded-lg text-sm transition-colors ${viewMode === 'list' ? 'bg-white shadow-sm' : ''}`}
            >
              <i className="ri-list-check-2"></i>
            </button>
          </div>
        </div>
      </div>

      {/* Scenarios Display */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredAndSortedScenarios.map((scenario) => (
            <div key={scenario.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900">{scenario.name}</h3>
                    {scenario.confidence_level && (
                      <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                        scenario.confidence_level >= 0.8 ? 'bg-green-100 text-green-700' :
                        scenario.confidence_level >= 0.6 ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {Math.round(scenario.confidence_level * 100)}%
                      </div>
                    )}
                  </div>
                  {scenario.description && (
                    <p className="text-sm text-gray-600 mb-2">{scenario.description}</p>
                  )}
                  {scenario.tags && scenario.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {scenario.tags.slice(0, 3).map((tag, idx) => (
                        <span key={idx} className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                          {tag}
                        </span>
                      ))}
                      {scenario.tags.length > 3 && (
                        <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                          +{scenario.tags.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 ml-2">
                  <button
                    onClick={() => setSelectedScenario(scenario)}
                    className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors cursor-pointer"
                    title="View Details"
                  >
                    <i className="ri-eye-line"></i>
                  </button>
                  <button
                    onClick={() => duplicateScenario(scenario)}
                    className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                    title="Duplicate"
                  >
                    <i className="ri-file-copy-line"></i>
                  </button>
                  <button
                    onClick={() => exportScenario(scenario)}
                    className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors cursor-pointer"
                    title="Export"
                  >
                    <i className="ri-download-line"></i>
                  </button>
                  <button
                    onClick={() => handleDelete(scenario.id)}
                    className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                    title="Delete"
                  >
                    <i className="ri-delete-bin-line"></i>
                  </button>
                </div>
              </div>

              {/* Key Results Grid */}
              {scenario.results && (
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-blue-50 rounded-lg p-3">
                    <div className="text-xs text-blue-600 mb-1">Revenue Impact</div>
                    <div className={`text-lg font-semibold ${scenario.results.changes?.revenue >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {scenario.results.changes?.revenue >= 0 ? '+' : ''}{scenario.results.changes?.revenue?.toFixed(1) || '0.0'}%
                    </div>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-3">
                    <div className="text-xs text-purple-600 mb-1">Profit Impact</div>
                    <div className={`text-lg font-semibold ${scenario.results.changes?.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {scenario.results.changes?.profit >= 0 ? '+' : ''}{scenario.results.changes?.profit?.toFixed(1) || '0.0'}%
                    </div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3">
                    <div className="text-xs text-green-600 mb-1">ROI Change</div>
                    <div className={`text-lg font-semibold ${scenario.results.changes?.roi >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {scenario.results.changes?.roi >= 0 ? '+' : ''}{scenario.results.changes?.roi?.toFixed(1) || '0.0'}%
                    </div>
                  </div>
                  <div className="bg-orange-50 rounded-lg p-3">
                    <div className="text-xs text-orange-600 mb-1">Risk Level</div>
                    <div className={`text-sm font-semibold ${
                      scenario.risk_assessment?.overall_risk === 'low' ? 'text-green-600' :
                      scenario.risk_assessment?.overall_risk === 'medium' ? 'text-yellow-600' :
                      'text-red-600'
                    }`}>
                      {scenario.risk_assessment?.overall_risk?.toUpperCase() || 'MED'}
                    </div>
                  </div>
                </div>
              )}

              <div className="text-xs text-gray-500 pt-3 border-t border-gray-100 flex items-center justify-between">
                <span>Created {new Date(scenario.created_at).toLocaleDateString()}</span>
                <div className="flex items-center gap-1">
                  <i className="ri-bar-chart-line"></i>
                  <span>{scenario.variables?.length || 0} variables</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="grid grid-cols-12 gap-4 text-sm font-medium text-gray-500">
              <div className="col-span-4">Scenario</div>
              <div className="col-span-2 text-center">Confidence</div>
              <div className="col-span-2 text-center">Revenue Impact</div>
              <div className="col-span-2 text-center">Profit Impact</div>
              <div className="col-span-1 text-center">Risk</div>
              <div className="col-span-1 text-center">Actions</div>
            </div>
          </div>
          <div className="divide-y divide-gray-200">
            {filteredAndSortedScenarios.map((scenario) => (
              <div key={scenario.id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                <div className="grid grid-cols-12 gap-4 items-center text-sm">
                  <div className="col-span-4">
                    <div className="font-semibold text-gray-900">{scenario.name}</div>
                    {scenario.description && (
                      <div className="text-gray-600 text-xs mt-1">{scenario.description}</div>
                    )}
                  </div>
                  <div className="col-span-2 text-center">
                    <div className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                      (scenario.confidence_level || 0) >= 0.8 ? 'bg-green-100 text-green-700' :
                      (scenario.confidence_level || 0) >= 0.6 ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {Math.round((scenario.confidence_level || 0.7) * 100)}%
                    </div>
                  </div>
                  <div className="col-span-2 text-center">
                    <div className={`font-semibold ${scenario.results?.changes?.revenue >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {scenario.results?.changes?.revenue >= 0 ? '+' : ''}{scenario.results?.changes?.revenue?.toFixed(1) || '0.0'}%
                    </div>
                  </div>
                  <div className="col-span-2 text-center">
                    <div className={`font-semibold ${scenario.results?.changes?.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {scenario.results?.changes?.profit >= 0 ? '+' : ''}{scenario.results?.changes?.profit?.toFixed(1) || '0.0'}%
                    </div>
                  </div>
                  <div className="col-span-1 text-center">
                    <div className={`text-xs font-semibold ${
                      scenario.risk_assessment?.overall_risk === 'low' ? 'text-green-600' :
                      scenario.risk_assessment?.overall_risk === 'medium' ? 'text-yellow-600' :
                      'text-red-600'
                    }`}>
                      {scenario.risk_assessment?.overall_risk?.toUpperCase() || 'MED'}
                    </div>
                  </div>
                  <div className="col-span-1 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => setSelectedScenario(scenario)}
                        className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-teal-600 rounded cursor-pointer"
                        title="View"
                      >
                        <i className="ri-eye-line text-sm"></i>
                      </button>
                      <button
                        onClick={() => exportScenario(scenario)}
                        className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-green-600 rounded cursor-pointer"
                        title="Export"
                      >
                        <i className="ri-download-line text-sm"></i>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {filteredAndSortedScenarios.length === 0 && (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
          <i className="ri-lightbulb-line text-4xl text-gray-300 mb-3"></i>
          <p className="text-gray-500 mb-2">No scenarios found</p>
          <p className="text-sm text-gray-400">Create your first what-if scenario to start modeling</p>
        </div>
      )}

      {/* Enhanced Create Modal with Metric Selection */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Create What-If Scenario</h2>
                <p className="text-sm text-gray-600 mt-1">Build advanced scenario models with risk assessment</p>
              </div>
              <button
                onClick={() => { setShowCreateModal(false); resetForm(); }}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>

            {/* Templates Section */}
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="font-semibold text-gray-900 mb-3">Quick Start Templates</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {SCENARIO_TEMPLATES.map((template, index) => (
                  <button
                    key={index}
                    onClick={() => applyTemplate(index)}
                    className={`p-3 text-left rounded-lg border-2 transition-all cursor-pointer ${
                      selectedTemplate === index 
                        ? 'border-teal-500 bg-teal-50' 
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="font-medium text-sm text-gray-900">{template.name}</div>
                    <div className="text-xs text-gray-600 mt-1">{template.description}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column - Basic Info */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Scenario Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                    placeholder="e.g., Q2 Price Optimization"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                    placeholder="Describe what you're testing and why..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Base Metric (Optional)</label>
                  <select
                    value={formData.base_metric_id}
                    onChange={(e) => setFormData({ ...formData, base_metric_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  >
                    <option value="">Select metric to track</option>
                    {metricsWithSufficientData.map((metric) => (
                      <option key={metric.id} value={metric.id}>
                        {metric.name} ({metric.dataCount} data points)
                      </option>
                    ))}
                  </select>
                  {metricsWithData.length > 0 && metricsWithSufficientData.length === 0 && (
                    <p className="text-xs text-orange-600 mt-1">
                      No metrics with sufficient data. Add 3+ data points to metrics to use them as baseline.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {formData.tags.map((tag, index) => (
                      <span key={index} className="inline-flex items-center gap-1 px-2 py-1 bg-teal-100 text-teal-700 text-xs rounded">
                        {tag}
                        <button
                          onClick={() => removeTag(index)}
                          className="hover:text-teal-900 cursor-pointer"
                        >
                          <i className="ri-close-line"></i>
                        </button>
                      </span>
                    ))}
                  </div>
                  <input
                    type="text"
                    placeholder="Add tag and press Enter"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addTag(e.currentTarget.value);
                        e.currentTarget.value = '';
                      }
                    }}
                  />
                </div>
              </div>

              {/* Right Column - Advanced Options */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Confidence Level</label>
                  <div className="space-y-2">
                    {CONFIDENCE_LEVELS.map((level) => (
                      <label key={level.value} className="flex items-center cursor-pointer">
                        <input
                          type="radio"
                          name="confidence"
                          value={level.value}
                          checked={formData.confidence_level === level.value}
                          onChange={(e) => setFormData({ ...formData, confidence_level: parseFloat(e.target.value) })}
                          className="mr-3 text-teal-600 focus:ring-teal-500"
                        />
                        <span className={`text-sm ${level.color}`}>{level.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Time Horizon (Months)</label>
                  <input
                    type="number"
                    min="3"
                    max="60"
                    value={formData.time_horizon}
                    onChange={(e) => setFormData({ ...formData, time_horizon: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Risk Factors</label>
                  <div className="grid grid-cols-1 gap-2 max-h-32 overflow-y-auto">
                    {RISK_FACTORS.map((factor) => (
                      <label key={factor} className="flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.risk_factors.includes(factor)}
                          onChange={() => toggleRiskFactor(factor)}
                          className="mr-2 text-teal-600 focus:ring-teal-500"
                        />
                        <span className="text-sm text-gray-700">{factor}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Variables Section */}
            <div className="mt-6">
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-gray-700">Variables & Inputs</label>
                <button
                  onClick={addVariable}
                  className="text-sm text-teal-600 hover:text-teal-700 flex items-center gap-1 cursor-pointer"
                >
                  <i className="ri-add-line"></i>
                  Add Variable
                </button>
              </div>

              <div className="space-y-3">
                {formData.variables.map((variable, index) => (
                  <div key={index} className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <input
                        type="text"
                        value={variable.name}
                        onChange={(e) => updateVariable(index, 'name', e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium"
                        placeholder="Variable name"
                      />
                      {formData.variables.length > 1 && (
                        <button
                          onClick={() => removeVariable(index)}
                          className="ml-3 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                        >
                          <i className="ri-delete-bin-line"></i>
                        </button>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Current Value</label>
                        <input
                          type="number"
                          value={variable.current}
                          onChange={(e) => updateVariable(index, 'current', parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-2 border border-gray-200 rounded text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Scenario Value</label>
                        <input
                          type="number"
                          value={variable.scenario}
                          onChange={(e) => updateVariable(index, 'scenario', parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-2 border border-gray-200 rounded text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Unit</label>
                        <input
                          type="text"
                          value={variable.unit}
                          onChange={(e) => updateVariable(index, 'unit', e.target.value)}
                          className="w-full px-2 py-2 border border-gray-200 rounded text-sm"
                          placeholder="$, %, units"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Weight ({Math.round((variable.weight || 0) * 100)}%)</label>
                        <input
                          type="range"
                          min="0.01"
                          max="1"
                          step="0.01"
                          value={variable.weight || 0}
                          onChange={(e) => updateVariable(index, 'weight', parseFloat(e.target.value))}
                          className="w-full"
                        />
                      </div>
                    </div>

                    {/* Impact Preview */}
                    <div className="mt-3 p-2 bg-white rounded border border-gray-200">
                      <div className="text-xs text-gray-500">Impact Preview:</div>
                      <div className="text-sm font-medium">
                        {variable.current && variable.scenario && (
                          <span className={`${((variable.scenario - variable.current) / variable.current * 100) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {((variable.scenario - variable.current) / variable.current * 100) >= 0 ? '+' : ''}
                            {(((variable.scenario - variable.current) / variable.current) * 100).toFixed(1)}% change
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Weight Balance Indicator */}
              <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-blue-700">Total Weight Distribution:</span>
                  <span className={`font-semibold ${Math.abs(formData.variables.reduce((sum, v) => sum + (v.weight || 0), 0) - 1) < 0.01 ? 'text-green-600' : 'text-orange-600'}`}>
                    {Math.round(formData.variables.reduce((sum, v) => sum + (v.weight || 0), 0) * 100)}%
                  </span>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6 pt-6 border-t border-gray-200">
              <button
                onClick={() => { setShowCreateModal(false); resetForm(); }}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!formData.name.trim() || formData.variables.length === 0 || formData.variables.some(v => !v.name.trim())}
                className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap flex items-center justify-center gap-2"
              >
                <i className="ri-play-line"></i>
                Run Analysis
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Enhanced Detail Modal */}
      {selectedScenario && selectedScenario.results && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-6xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-xl font-bold text-gray-900">{selectedScenario.name}</h2>
                  {selectedScenario.confidence_level && (
                    <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                      selectedScenario.confidence_level >= 0.8 ? 'bg-green-100 text-green-700' :
                      selectedScenario.confidence_level >= 0.6 ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {Math.round(selectedScenario.confidence_level * 100)}% Confidence
                    </div>
                  )}
                  <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                    selectedScenario.risk_assessment?.overall_risk === 'low' ? 'bg-green-100 text-green-700' :
                    selectedScenario.risk_assessment?.overall_risk === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {selectedScenario.risk_assessment?.overall_risk?.toUpperCase() || 'MEDIUM'} Risk
                  </div>
                </div>
                {selectedScenario.description && (
                  <p className="text-sm text-gray-600">{selectedScenario.description}</p>
                )}
                {selectedScenario.tags && selectedScenario.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {selectedScenario.tags.map((tag, idx) => (
                      <span key={idx} className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 ml-4">
                <button
                  onClick={() => exportScenario(selectedScenario)}
                  className="px-3 py-2 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <i className="ri-download-line"></i>
                  Export
                </button>
                <button
                  onClick={() => setSelectedScenario(null)}
                  className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>
            </div>

            {/* Key Metrics Overview */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="text-xs text-blue-600 mb-1">Revenue Change</div>
                <div className={`text-2xl font-bold ${selectedScenario.results.changes?.revenue >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {selectedScenario.results.changes?.revenue >= 0 ? '+' : ''}{selectedScenario.results.changes?.revenue?.toFixed(1) || '0.0'}%
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  ${selectedScenario.results.scenario?.revenue?.toLocaleString() || '0'}
                </div>
              </div>
              <div className="bg-purple-50 rounded-lg p-4">
                <div className="text-xs text-purple-600 mb-1">Profit Change</div>
                <div className={`text-2xl font-bold ${selectedScenario.results.changes?.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {selectedScenario.results.changes?.profit >= 0 ? '+' : ''}{selectedScenario.results.changes?.profit?.toFixed(1) || '0.0'}%
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  ${selectedScenario.results.scenario?.profit?.toLocaleString() || '0'}
                </div>
              </div>
              <div className="bg-green-50 rounded-lg p-4">
                <div className="text-xs text-green-600 mb-1">ROI Change</div>
                <div className={`text-2xl font-bold ${selectedScenario.results.changes?.roi >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {selectedScenario.results.changes?.roi >= 0 ? '+' : ''}{selectedScenario.results.changes?.roi?.toFixed(1) || '0.0'}%
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  {selectedScenario.results.scenario?.roi?.toFixed(1) || '0.0'}% ROI
                </div>
              </div>
              <div className="bg-orange-50 rounded-lg p-4">
                <div className="text-xs text-orange-600 mb-1">Margin Change</div>
                <div className={`text-2xl font-bold ${selectedScenario.results.changes?.margin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {selectedScenario.results.changes?.margin >= 0 ? '+' : ''}{selectedScenario.results.changes?.margin?.toFixed(1) || '0.0'}pp
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  {selectedScenario.results.scenario?.margin?.toFixed(1) || '0.0'}% margin
                </div>
              </div>
            </div>

            {/* Current vs Scenario Comparison */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <i className="ri-line-chart-line"></i>
                  Current State
                </h3>
                <div className="space-y-3">
                  {Object.entries(selectedScenario.results.current).map(([key, value]) => (
                    <div key={key} className="flex justify-between items-center">
                      <span className="text-sm text-gray-600 capitalize">
                        {key.replace('_', ' ')}:
                      </span>
                      <span className="text-sm font-semibold text-gray-900">
                        {key.includes('margin') || key.includes('roi') 
                          ? `${(value as number).toFixed(1)}%`
                          : `$${(value as number).toLocaleString()}`
                        }
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-teal-50 rounded-lg p-4">
                <h3 className="font-semibold text-teal-900 mb-3 flex items-center gap-2">
                  <i className="ri-trending-up-line"></i>
                  Scenario State
                </h3>
                <div className="space-y-3">
                  {Object.entries(selectedScenario.results.scenario).map(([key, value]) => (
                    <div key={key} className="flex justify-between items-center">
                      <span className="text-sm text-teal-700 capitalize">
                        {key.replace('_', ' ')}:
                      </span>
                      <div className="text-right">
                        <span className="text-sm font-semibold text-teal-900">
                          {key.includes('margin') || key.includes('roi') 
                            ? `${(value as number).toFixed(1)}%`
                            : `$${(value as number).toLocaleString()}`
                          }
                        </span>
                        <div className={`text-xs ${selectedScenario.results.changes[key] >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ({selectedScenario.results.changes[key] >= 0 ? '+' : ''}{selectedScenario.results.changes[key]?.toFixed(1)}
                          {key.includes('margin') ? 'pp' : '%'})
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Projection Chart */}
            {selectedScenario.results.projection && (
              <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
                <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <i className="ri-line-chart-line"></i>
                  {selectedScenario.risk_assessment?.time_horizon || 12}-Month Projection
                </h3>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={selectedScenario.results.projection} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                      <XAxis dataKey="month" stroke="#6B7280" tick={{ fontSize: 12 }} />
                      <YAxis stroke="#6B7280" tick={{ fontSize: 12 }} tickFormatter={(value) => `$${value.toLocaleString()}`} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#FFF', border: '1px solid #E5E7EB', borderRadius: '8px' }}
                        formatter={(value: any, name: string) => [`$${value.toLocaleString()}`, name.charAt(0).toUpperCase() + name.slice(1)]}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="current" stroke="#6B7280" strokeWidth={2} strokeDasharray="5 5" name="Current" />
                      <Line type="monotone" dataKey="realistic" stroke="#14B8A6" strokeWidth={3} name="Realistic" />
                      <Line type="monotone" dataKey="optimistic" stroke="#10B981" strokeWidth={2} strokeDasharray="3 3" name="Optimistic" />
                      <Line type="monotone" dataKey="pessimistic" stroke="#EF4444" strokeWidth={2} strokeDasharray="3 3" name="Pessimistic" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Sensitivity Analysis */}
            {selectedScenario.results.sensitivity && (
              <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
                <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <i className="ri-pulse-line"></i>
                  Sensitivity Analysis
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(selectedScenario.results.sensitivity).map(([variable, data]: [string, any]) => (
                    <div key={variable} className="bg-gray-50 rounded-lg p-3">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium text-gray-900">{variable}</span>
                        <span className="text-sm text-gray-500">Weight: {Math.round((data.weight || 0) * 100)}%</span>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Direct Impact:</span>
                          <span className={`font-semibold ${data.impact >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {data.impact >= 0 ? '+' : ''}{data.impact?.toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Contribution:</span>
                          <span className={`font-semibold ${data.contribution >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {data.contribution >= 0 ? '+' : ''}{data.contribution?.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                      {/* Visual impact bar */}
                      <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full ${Math.abs(data.impact) > 20 ? 'bg-red-500' : Math.abs(data.impact) > 10 ? 'bg-yellow-500' : 'bg-green-500'}`}
                          style={{ width: `${Math.min(Math.abs(data.impact), 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Variables & Risk Assessment */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <i className="ri-settings-line"></i>
                  Variables & Assumptions
                </h3>
                <div className="space-y-3">
                  {selectedScenario.variables.map((variable: any, idx: number) => (
                    <div key={idx} className="bg-white rounded-lg p-3 border border-gray-200">
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-medium text-gray-900">{variable.name}</span>
                        <span className="text-xs text-gray-500">Weight: {Math.round((variable.weight || 0) * 100)}%</span>
                      </div>
                      <div className="flex justify-between text-sm text-gray-600">
                        <span>Current: {variable.current} {variable.unit}</span>
                        <span>→</span>
                        <span>Scenario: {variable.scenario} {variable.unit}</span>
                      </div>
                      <div className="mt-1">
                        <span className={`text-xs font-medium ${
                          ((variable.scenario - variable.current) / variable.current * 100) >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {((variable.scenario - variable.current) / variable.current * 100) >= 0 ? '+' : ''}
                          {(((variable.scenario - variable.current) / variable.current) * 100).toFixed(1)}% change
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {selectedScenario.risk_assessment && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <i className="ri-shield-check-line"></i>
                    Risk Assessment
                  </h3>
                  <div className="space-y-3">
                    <div className="bg-white rounded-lg p-3 border border-gray-200">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm text-gray-600">Overall Risk Level:</span>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          selectedScenario.risk_assessment.overall_risk === 'low' ? 'bg-green-100 text-green-700' :
                          selectedScenario.risk_assessment.overall_risk === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {selectedScenario.risk_assessment.overall_risk?.toUpperCase()}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Success Probability:</span>
                        <span className="text-sm font-semibold text-gray-900">
                          {Math.round((selectedScenario.confidence_level || 0.7) * 100)}%
                        </span>
                      </div>
                    </div>

                    {selectedScenario.risk_assessment.risk_factors && selectedScenario.risk_assessment.risk_factors.length > 0 && (
                      <div className="bg-white rounded-lg p-3 border border-gray-200">
                        <div className="text-sm text-gray-600 mb-2">Key Risk Factors:</div>
                        <div className="flex flex-wrap gap-1">
                          {selectedScenario.risk_assessment.risk_factors.map((factor: string, idx: number) => (
                            <span key={idx} className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded">
                              {factor}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="bg-white rounded-lg p-3 border border-gray-200">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Time Horizon:</span>
                        <span className="text-sm font-semibold text-gray-900">
                          {selectedScenario.risk_assessment.time_horizon || 12} months
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 mt-6 pt-6 border-t border-gray-200">
              <button
                onClick={() => duplicateScenario(selectedScenario)}
                className="px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer"
              >
                <i className="ri-file-copy-line"></i>
                Duplicate Scenario
              </button>
              <button
                onClick={() => exportScenario(selectedScenario)}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer"
              >
                <i className="ri-download-line"></i>
                Export Analysis
              </button>
              <div className="flex-1"></div>
              <button
                onClick={() => setSelectedScenario(null)}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors whitespace-nowrap cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete Scenario"
        message="Are you sure you want to delete this scenario? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmDelete}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setScenarioToDelete(null);
        }}
        variant="danger"
      />
    </div>
  );
}