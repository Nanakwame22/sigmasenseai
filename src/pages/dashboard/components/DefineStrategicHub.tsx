import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';
import { exportToPDF } from '../../../utils/exportUtils';
import { ConfirmDialog } from '../../../components/common/ConfirmDialog';

interface DefineStrategicHubProps {
  projectId?: string;
  projectData?: any;
  onSave?: () => Promise<boolean>;
  onPhaseComplete?: () => void;
}

interface CTQNode {
  id: string;
  level: number;
  label: string;
  baseline?: number;
  current?: number;
  target?: number;
  variance?: number;
  dataSource?: string;
  children?: CTQNode[];
}

interface Stakeholder {
  id: string;
  name: string;
  role: string;
  influence: 'low' | 'medium' | 'high';
  interest: 'low' | 'medium' | 'high';
  raci: 'responsible' | 'accountable' | 'consulted' | 'informed';
}

interface Risk {
  id: string;
  description: string;
  probability: number;
  impact: number;
  mitigation: string;
  owner: string;
  linkedKPI?: string;
  riskScore?: number;
  severity?: 'critical' | 'high' | 'medium' | 'low';
}

interface ProjectCharter {
  businessCase: string;
  problemStatement: string;
  goalStatement: string;
  scope: string;
  outOfScope: string;
  constraints: string;
  assumptions: string;
  successCriteria: string;
  timeline: string;
  budget: string;
}

interface SIPOCDiagram {
  suppliers: string[];
  inputs: string[];
  process: string[];
  outputs: string[];
  customers: string[];
}

interface FinancialImpact {
  copq: number;
  projectedSavings: number;
  roi: number;
  paybackPeriod: number;
}

interface KPIMetric {
  id: string;
  name: string;
  description?: string;
  current_value?: number;
  target_value?: number;
  unit?: string;
  type: 'kpi' | 'metric';
  category?: string;
  variance?: number;
  status?: string;
}

interface RACIAssignment {
  stakeholderId: string;
  define: 'R' | 'A' | 'C' | 'I' | '';
  measure: 'R' | 'A' | 'C' | 'I' | '';
  analyze: 'R' | 'A' | 'C' | 'I' | '';
  improve: 'R' | 'A' | 'C' | 'I' | '';
  control: 'R' | 'A' | 'C' | 'I' | '';
}

// Toast Notification Component
const Toast: React.FC<{
  message: string;
  type: 'success' | 'error' | 'info';
  onClose: () => void;
}> = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColor =
    type === 'success'
      ? 'bg-green-600'
      : type === 'error'
      ? 'bg-red-600'
      : 'bg-blue-600';
  const icon =
    type === 'success'
      ? 'ri-checkbox-circle-line'
      : type === 'error'
      ? 'ri-error-warning-line'
      : 'ri-information-line';

  return (
    <div
      className={`fixed top-4 right-4 z-50 ${bgColor} text-white px-6 py-4 rounded-lg shadow-lg flex items-center gap-3 animate-[slideInRight_0.3s_ease-out]`}
    >
      <i className={`${icon} text-2xl`}></i>
      <span className="font-medium">{message}</span>
      <button
        onClick={onClose}
        className="ml-4 hover:bg-white/20 rounded p-1"
      >
        <i className="ri-close-line text-xl"></i>
      </button>
    </div>
  );
};

const CTQNode: React.FC<{
  node: any;
  level: number;
}> = ({ node, level }) => {
  const [isExpanded, setIsExpanded] = useState(level === 0);

  const getStatusColor = (variance: number) => {
    if (variance <= 5) return 'text-emerald-600 bg-emerald-50';
    if (variance <= 15) return 'text-amber-600 bg-amber-50';
    return 'text-rose-600 bg-rose-50';
  };

  const getStatusLabel = (variance: number) => {
    if (variance <= 5) return 'Healthy';
    if (variance <= 15) return 'At Risk';
    return 'Critical';
  };

  return (
    <div className={`ml-${level * 8}`}>
      <div
        className="mb-3 opacity-0 animate-[fadeInLeft_0.5s_ease-out_forwards]"
        style={{ animationDelay: `${level * 0.1}s` }}
      >
        <div
          className="bg-white rounded-lg border border-slate-200 p-4 hover:shadow-md transition-all duration-300 cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                {node.children && (
                  <i
                    className={`ri-arrow-${
                      isExpanded ? 'down' : 'right'
                    }-s-line text-slate-400 transition-transform duration-200`}
                    style={{
                      transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                    }}
                  />
                )}
                <h4 className="font-semibold text-slate-800">{node.name}</h4>
                {node.variance !== undefined && (
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(
                      node.variance,
                    )}`}
                  >
                    {getStatusLabel(node.variance)}
                  </span>
                )}
              </div>

              {node.description && (
                <p className="text-sm text-slate-600 mb-3">{node.description}</p>
              )}

              {node.baseline !== undefined && (
                <div className="grid grid-cols-4 gap-4 mt-3">
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Baseline</div>
                    <div className="font-semibold text-slate-700">
                      {node.baseline}
                      {node.unit}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Current</div>
                    <div className="font-semibold text-slate-700">
                      {node.current}
                      {node.unit}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Target</div>
                    <div className="font-semibold text-teal-600">
                      {node.target}
                      {node.unit}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Variance</div>
                    <div
                      className={`font-semibold ${
                        node.variance > 10
                          ? 'text-rose-600'
                          : 'text-emerald-600'
                      }`}
                    >
                      {node.variance > 0 ? '+' : ''}
                      {node.variance}%
                    </div>
                  </div>
                </div>
              )}

              {node.dataSource && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded text-xs font-medium">
                    <i className="ri-database-2-line mr-1" />
                    {node.dataSource}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {isExpanded && node.children && (
          <div
            className="mt-3 ml-6 border-l-2 border-slate-200 pl-4 overflow-hidden transition-all duration-300"
            style={{
              maxHeight: isExpanded ? '2000px' : '0',
              opacity: isExpanded ? 1 : 0,
            }}
          >
            {node.children.map((child: any, idx: number) => (
              <CTQNode key={idx} node={child} level={level + 1} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export const DefineStrategicHub: React.FC<DefineStrategicHubProps> = ({
  projectId,
  projectData,
  onSave,
  onPhaseComplete,
}) => {
  const { organization, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [activePanel, setActivePanel] =
    useState<'overview' | 'charter' | 'sipoc' | 'stakeholders' | 'ctq' | 'kpi-sync' | 'risks' | 'governance'>('charter');

  // Toast notification state
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  // Project Charter State
  const [projectCharter, setProjectCharter] = useState<ProjectCharter>({
    businessCase: '',
    problemStatement: '',
    goalStatement: '',
    scope: '',
    outOfScope: '',
    constraints: '',
    assumptions: '',
    successCriteria: '',
    timeline: '',
    budget: '',
  });

  // SIPOC State
  const [sipocDiagram, setSipocDiagram] = useState<SIPOCDiagram>({
    suppliers: [],
    inputs: [],
    process: [],
    outputs: [],
    customers: [],
  });

  // Stakeholders State
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([]);
  const [showStakeholderModal, setShowStakeholderModal] = useState(false);
  const [editingStakeholder, setEditingStakeholder] = useState<Stakeholder | null>(null);
  const [newStakeholder, setNewStakeholder] = useState<Partial<Stakeholder>>({
    name: '',
    role: '',
    influence: 'medium',
    interest: 'medium',
    raci: 'informed',
  });

  // SIPOC Modal State
  const [showSipocModal, setShowSipocModal] = useState(false);
  const [sipocCategory, setSipocCategory] = useState<keyof SIPOCDiagram>('suppliers');
  const [sipocItem, setSipocItem] = useState('');

  // Saving states
  const [savingCharter, setSavingCharter] = useState(false);
  const [savingSipoc, setSavingSipoc] = useState(false);

  // Current project ID from parent or fetch
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(projectId || null);

  // NEW: CTQ and KPI Sync State
  const [ctqTree, setCTQTree] = useState<any[]>([]);
  const [kpiSyncData, setKPISyncData] = useState<KPIMetric[]>([]);
  const [baselineSnapshot, setBaselineSnapshot] = useState<any>(null);
  const [financialImpact, setFinancialImpact] = useState<FinancialImpact>({
    copq: 0,
    projectedSavings: 0,
    roi: 0,
    paybackPeriod: 0,
  });
  const [showAddCTQModal, setShowAddCTQModal] = useState(false);
  const [newCTQ, setNewCTQ] = useState({
    name: '',
    description: '',
    target_value: '',
    unit: '',
    category: 'CTQ',
  });
  const [savingFinancial, setSavingFinancial] = useState(false);

  // NEW: Risk Register State
  const [risks, setRisks] = useState<any[]>([]);
  const [isAddRiskModalOpen, setIsAddRiskModalOpen] = useState(false);
  const [editingRisk, setEditingRisk] = useState<any>(null);
  const [riskFormData, setRiskFormData] = useState({
    description: '',
    probability: 5,
    impact: 5,
    mitigation: '',
    owner: '',
    linked_kpi_id: ''
  });
  const [deleteRiskId, setDeleteRiskId] = useState<string | null>(null);

  // NEW: Governance State
  const [governanceTab, setGovernanceTab] = useState<'raci' | 'readiness'>(
    'raci',
  );
  const [raciMatrix, setRaciMatrix] = useState<RACIAssignment[]>([]);

  // NEW: Phase Completion State
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [completingPhase, setCompletingPhase] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Confirm dialog state for stakeholder deletion
  const [deleteStakeholderId, setDeleteStakeholderId] = useState<string | null>(null);

  // Load data on mount
  useEffect(() => {
    loadDefinePhaseData();
  }, [organization?.id, currentProjectId]);

  const loadDefinePhaseData = async () => {
    if (!organization?.id) return;

    try {
      setLoading(true);

      // Get current project if not provided
      let activeProjectId = currentProjectId;

      if (!activeProjectId) {
        const { data: projects } = await supabase
          .from('dmaic_projects')
          .select('id')
          .eq('organization_id', organization.id)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (projects) {
          activeProjectId = projects.id;
          setCurrentProjectId(activeProjectId);
        }
      }

      if (!activeProjectId) {
        showToast(
          'No active project found. Please create a project first.',
          'info',
        );
        setLoading(false);
        return;
      }

      // Load Define phase data from project_data
      const { data: projectData, error } = await supabase
        .from('dmaic_projects')
        .select('project_data')
        .eq('id', activeProjectId)
        .maybeSingle();

      if (error) throw error;

      if (projectData?.project_data?.define) {
        const defineData = projectData.project_data.define;

        // Load Charter
        if (defineData.charter) {
          setProjectCharter(defineData.charter);
        }

        // Load SIPOC
        if (defineData.sipoc) {
          setSipocDiagram(defineData.sipoc);
        }

        // Load Stakeholders
        if (defineData.stakeholders) {
          setStakeholders(defineData.stakeholders);
        }

        // Load Financial Impact
        if (defineData.financial_impact) {
          setFinancialImpact(defineData.financial_impact);
        }

        // Load Risks
        if (defineData.risks) {
          setRisks(defineData.risks);
        }

        // Load RACI Matrix
        if (defineData.raci_matrix) {
          setRaciMatrix(defineData.raci_matrix);
        }
      }

      // Load CTQ tree and KPI sync data
      await loadCTQTreeData();
      await loadKPISyncData();
    } catch (error) {
      console.error('Error loading Define phase data:', error);
      showToast('Failed to load Define phase data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadCTQTreeData = async () => {
    if (!organization?.id) return;

    try {
      // Load KPIs and Metrics from organization
      const { data: kpisData } = await supabase
        .from('kpis')
        .select('*')
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: false });

      const { data: metricsData } = await supabase
        .from('metrics')
        .select('*')
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: false });

      // Build CTQ tree structure
      const ctqNodes: any[] = [];

      // Group by category
      const categories = new Set<string>();

      kpisData?.forEach((k) => {
        if (k.category) categories.add(k.category);
      });

      metricsData?.forEach((m) => {
        if (m.category) categories.add(m.category);
      });

      // Build tree with categories as parent nodes
      categories.forEach((category) => {
        const categoryKPIs =
          kpisData?.filter((k) => k.category === category) || [];
        const categoryMetrics =
          metricsData?.filter((m) => m.category === category) || [];

        const children = [
          ...categoryKPIs.map((kpi) => ({
            id: kpi.id,
            name: kpi.name,
            description: kpi.description,
            baseline: kpi.last_value || 0,
            current: kpi.last_value || 0,
            target: kpi.target_value || 0,
            variance: kpi.target_value
              ? ((kpi.last_value || 0) - kpi.target_value) /
                kpi.target_value *
                100
              : 0,
            unit: kpi.unit || '',
            dataSource: 'KPI Registry',
            type: 'kpi',
          })),
          ...categoryMetrics.map((metric) => ({
            id: metric.id,
            name: metric.name,
            description: metric.description,
            baseline: metric.current_value || 0,
            current: metric.current_value || 0,
            target: metric.target_value || 0,
            variance: metric.target_value
              ? ((metric.current_value || 0) - metric.target_value) /
                metric.target_value *
                100
              : 0,
            unit: metric.unit || '',
            dataSource: 'Metrics Registry',
            type: 'metric',
          })),
        ];

        if (children.length > 0) {
          ctqNodes.push({
            id: category,
            name: category,
            description: `${children.length} metrics tracked`,
            children: children,
          });
        }
      });

      // Add uncategorized items
      const uncategorizedKPIs =
        kpisData?.filter((k) => !k.category) || [];
      const uncategorizedMetrics =
        metricsData?.filter((m) => !m.category) || [];

      if (
        uncategorizedKPIs.length > 0 ||
        uncategorizedMetrics.length > 0
      ) {
        ctqNodes.push({
          id: 'uncategorized',
          name: 'Uncategorized',
          description: `${uncategorizedKPIs.length + uncategorizedMetrics.length} metrics`,
          children: [
            ...uncategorizedKPIs.map((kpi) => ({
              id: kpi.id,
              name: kpi.name,
              description: kpi.description,
              baseline: kpi.last_value || 0,
              current: kpi.last_value || 0,
              target: kpi.target_value || 0,
              variance: kpi.target_value
                ? ((kpi.last_value || 0) - kpi.target_value) /
                  kpi.target_value *
                  100
                : 0,
              unit: kpi.unit || '',
              dataSource: 'KPI Registry',
              type: 'kpi',
            })),
            ...uncategorizedMetrics.map((metric) => ({
              id: metric.id,
              name: metric.name,
              description: metric.description,
              baseline: metric.current_value || 0,
              current: metric.current_value || 0,
              target: metric.target_value || 0,
              variance: metric.target_value
                ? ((metric.current_value || 0) - metric.target_value) /
                  metric.target_value *
                  100
                : 0,
              unit: metric.unit || '',
              dataSource: 'Metrics Registry',
              type: 'metric',
            })),
          ],
        });
      }

      setCTQTree(ctqNodes);
    } catch (error) {
      console.error('Error loading CTQ tree:', error);
    }
  };

  const loadKPISyncData = async () => {
    if (!organization?.id) return;

    try {
      const { data: kpisData } = await supabase
        .from('kpis')
        .select('*')
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: false });

      const { data: metricsData } = await supabase
        .from('metrics')
        .select('*')
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: false });

      const allKPIs: KPIMetric[] = [
        ...(kpisData || []).map((k) => {
          const current = k.last_value || 0;
          const target = k.target_value || 0;
          const variance = target
            ? ((current - target) / target) * 100
            : 0;
          const status = getKPIStatus(current, target);

          return {
            id: k.id,
            name: k.name,
            description: k.description,
            current_value: current,
            target_value: target,
            unit: k.unit,
            type: 'kpi',
            category: k.category,
            variance: variance,
            status: status,
          };
        }),
        ...(metricsData || []).map((m) => {
          const current = m.current_value || 0;
          const target = m.target_value || 0;
          const variance = target
            ? ((current - target) / target) * 100
            : 0;
          const status = getKPIStatus(current, target);

          return {
            id: m.id,
            name: m.name,
            description: m.description,
            current_value: current,
            target_value: target,
            unit: m.unit,
            type: 'metric',
            category: m.category,
            variance: variance,
            status: status,
          };
        }),
      ];

      setKPISyncData(allKPIs);

      // Load baseline snapshot for first metric with data
      if (allKPIs.length > 0) {
        await loadBaselineSnapshot(
          allKPIs[0].id,
          allKPIs[0].type,
        );
      }
    } catch (error) {
      console.error('Error loading KPI sync data:', error);
    }
  };

  const loadBaselineSnapshot = async (
    metricId: string,
    metricType: 'kpi' | 'metric',
  ) => {
    try {
      // Load last 30 observations from metric_data
      const { data: observations } = await supabase
        .from('metric_data')
        .select('*')
        .eq('metric_id', metricId)
        .order('timestamp', { ascending: false })
        .limit(30);

      if (!observations || observations.length === 0) {
        setBaselineSnapshot(null);
        return;
      }

      // Calculate statistics
      const values = observations.map((o) => o.value);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce(
        (sum, val) => sum + Math.pow(val - mean, 2),
        0,
      ) / values.length;
      const stdDev = Math.sqrt(variance);

      // Calculate sigma level (assuming USL/LSL based on target ±30%)
      const metric = kpiSyncData.find((k) => k.id === metricId);
      const target = metric?.target_value || mean;
      const usl = target * 1.3;
      const lsl = target * 0.7;
      const sigmaLevel = Math.min(
        (usl - mean) / stdDev,
        (mean - lsl) / stdDev,
      );

      // Calculate DPMO
      const defects = values.filter(
        (v) => v > usl || v < lsl,
      ).length;
      const dpmo = (defects / values.length) * 1000000;

      // Prepare trend chart data
      const trendData = observations
        .reverse()
        .map((o) => ({
          date: new Date(o.timestamp).toLocaleDateString(),
          value: o.value,
        }));

      setBaselineSnapshot({
        metricName: metric?.name || 'Unknown Metric',
        mean: mean.toFixed(2),
        stdDev: stdDev.toFixed(2),
        variance: variance.toFixed(2),
        sigmaLevel: sigmaLevel.toFixed(2),
        dpmo: Math.round(dpmo),
        sampleSize: observations.length,
        trendData: trendData,
      });
    } catch (error) {
      console.error('Error loading baseline snapshot:', error);
    }
  };

  const showToast = (
    message: string,
    type: 'success' | 'error' | 'info',
  ) => {
    setToast({ message, type });
  };

  const saveDefinePhaseData = async () => {
    if (!currentProjectId) {
      showToast('No active project found', 'error');
      return false;
    }

    try {
      // Get existing project data
      const { data: existingProject } = await supabase
        .from('dmaic_projects')
        .select('project_data')
        .eq('id', currentProjectId)
        .maybeSingle();

      const existingData = existingProject?.project_data || {};

      // Update Define phase data
      const updatedProjectData = {
        ...existingData,
        define: {
          ...existingData.define,
          charter: projectCharter,
          sipoc: sipocDiagram,
          stakeholders: stakeholders,
          financial_impact: financialImpact,
          risks: risks,
          raci_matrix: raciMatrix,
          lastUpdated: new Date().toISOString(),
        },
      };

      const { error } = await supabase
        .from('dmaic_projects')
        .update({
          project_data: updatedProjectData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', currentProjectId);

      if (error) throw error;

      if (onSave) onSave();
      return true;
    } catch (error) {
      console.error('Error saving Define phase data:', error);
      return false;
    }
  };

  const handleSaveCharter = async () => {
    if (!projectCharter.businessCase?.trim()) {
      showToast('Business Case is required', 'error');
      return;
    }

    if (!projectCharter.problemStatement?.trim()) {
      showToast('Problem Statement is required', 'error');
      return;
    }

    if (!projectCharter.goalStatement?.trim()) {
      showToast('Goal Statement is required', 'error');
      return;
    }

    if (!projectCharter.scope?.trim()) {
      showToast('Project Scope is required', 'error');
      return;
    }

    if (!projectCharter.successCriteria?.trim()) {
      showToast('Success Criteria is required', 'error');
      return;
    }

    setSavingCharter(true);

    try {
      const saved = await saveDefinePhaseData();
      if (saved) {
        showToast('Project Charter saved successfully!', 'success');
      } else {
        showToast('Failed to save charter. Please try again.', 'error');
      }
    } catch (error) {
      console.error('Error saving charter:', error);
      showToast('An error occurred while saving', 'error');
    } finally {
      setSavingCharter(false);
    }
  };

  const handleSaveSipoc = async () => {
    const totalItems = Object.values(sipocDiagram).reduce(
      (sum, arr) => sum + arr.length,
      0,
    );

    if (totalItems === 0) {
      showToast('Please add at least one item to the SIPOC diagram', 'error');
      return;
    }

    const categoriesWithItems = Object.values(sipocDiagram).filter(
      (arr) => arr.length > 0,
    ).length;
    if (categoriesWithItems < 3) {
      showToast(
        'Please add items to at least 3 categories',
        'error',
      );
      return;
    }

    setSavingSipoc(true);

    try {
      const saved = await saveDefinePhaseData();
      if (saved) {
        showToast('SIPOC diagram saved successfully!', 'success');
      } else {
        showToast('Failed to save SIPOC. Please try again.', 'error');
      }
    } catch (error) {
      console.error('Error saving SIPOC:', error);
      showToast('An error occurred while saving', 'error');
    } finally {
      setSavingSipoc(false);
    }
  };

  const handleAddSipocItem = () => {
    if (!sipocItem.trim()) return;

    setSipocDiagram((prev) => ({
      ...prev,
      [sipocCategory]: [...prev[sipocCategory], sipocItem.trim()],
    }));
    setSipocItem('');
    showToast(`Added to ${sipocCategory}`, 'success');
  };

  const handleRemoveSipocItem = (
    category: keyof SIPOCDiagram,
    index: number,
  ) => {
    setSipocDiagram((prev) => ({
      ...prev,
      [category]: prev[category].filter((_, i) => i !== index),
    }));
    showToast('Item removed', 'info');
  };

  const handleAddStakeholder = async () => {
    if (!newStakeholder.name?.trim() || !newStakeholder.role?.trim()) {
      showToast('Name and Role are required', 'error');
      return;
    }

    const stakeholder: Stakeholder = {
      id: Date.now().toString(),
      name: newStakeholder.name,
      role: newStakeholder.role,
      influence: newStakeholder.influence || 'medium',
      interest: newStakeholder.interest || 'medium',
      raci: newStakeholder.raci || 'informed',
    };

    setStakeholders((prev) => [...prev, stakeholder]);
    setShowStakeholderModal(false);
    setNewStakeholder({
      name: '',
      role: '',
      influence: 'medium',
      interest: 'medium',
      raci: 'informed',
    });

    // Auto-save
    setTimeout(async () => {
      const saved = await saveDefinePhaseData();
      if (saved) {
        showToast('Stakeholder added successfully!', 'success');
      }
    }, 100);
  };

  const handleDeleteStakeholder = async (id: string) => {
    setStakeholders((prev) => prev.filter((s) => s.id !== id));

    setTimeout(async () => {
      const saved = await saveDefinePhaseData();
      if (saved) {
        showToast('Stakeholder removed', 'info');
      }
    }, 100);
  };

  // NEW: Financial Impact handlers
  const handleSaveFinancialImpact = async () => {
    setSavingFinancial(true);
    try {
      const saved = await saveDefinePhaseData();
      if (saved) {
        showToast('Financial Impact saved successfully!', 'success');
      } else {
        showToast('Failed to save financial impact', 'error');
      }
    } catch (error) {
      console.error('Error saving financial impact:', error);
      showToast('An error occurred while saving', 'error');
    } finally {
      setSavingFinancial(false);
    }
  };

  // NEW: Add CTQ Node handler
  const handleAddCTQNode = async () => {
    if (!newCTQ.name?.trim()) {
      showToast('CTQ name is required', 'error');
      return;
    }

    if (
      !newCTQ.target_value ||
      isNaN(parseFloat(newCTQ.target_value))
    ) {
      showToast('Valid target value is required', 'error');
      return;
    }

    try {
      // Insert into KPIs table
      const { data, error } = await supabase
        .from('kpis')
        .insert({
          organization_id: organization?.id,
          metric_id: crypto.randomUUID(),
          name: newCTQ.name,
          description: newCTQ.description,
          target_value: parseFloat(newCTQ.target_value),
          unit: newCTQ.unit,
          threshold_critical: parseFloat(newCTQ.target_value) * 0.7,
          threshold_at_risk: parseFloat(newCTQ.target_value) * 0.85,
          threshold_on_track: parseFloat(newCTQ.target_value) * 0.95,
          status: 'active',
        })
        .select()
        .single();

      if (error) throw error;

      showToast('CTQ node added successfully!', 'success');
      setShowAddCTQModal(false);
      setNewCTQ({
        name: '',
        description: '',
        target_value: '',
        unit: '',
        category: 'CTQ',
      });

      // Reload CTQ tree
      await loadCTQTreeData();
      await loadKPISyncData();
    } catch (error) {
      console.error('Error adding CTQ node:', error);
      showToast('Failed to add CTQ node', 'error');
    }
  };

  // NEW: Risk Management Functions
  const calculateRiskScore = (
    probability: number,
    impact: number,
  ): number => {
    return probability * impact;
  };

  const getRiskSeverity = (riskScore: number): Risk['severity'] => {
    if (riskScore >= 75) return 'critical';
    if (riskScore >= 50) return 'high';
    if (riskScore >= 25) return 'medium';
    return 'low';
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 text-red-700 border-red-300';
      case 'high':
        return 'bg-orange-100 text-orange-700 border-orange-300';
      case 'medium':
        return 'bg-yellow-100 text-yellow-700 border-yellow-300';
      case 'low':
        return 'bg-green-100 text-green-700 border-green-300';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  // NEW: Save risks to project data
  const saveRisks = async (updatedRisks: any[]) => {
    setRisks(updatedRisks);

    if (!currentProjectId) {
      showToast('No active project found', 'error');
      return;
    }

    try {
      const { data: existingProject } = await supabase
        .from('dmaic_projects')
        .select('project_data')
        .eq('id', currentProjectId)
        .maybeSingle();

      const existingData = existingProject?.project_data || {};

      const { error } = await supabase
        .from('dmaic_projects')
        .update({
          project_data: {
            ...existingData,
            define: {
              ...existingData.define,
              risks: updatedRisks,
              lastUpdated: new Date().toISOString(),
            },
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', currentProjectId);

      if (error) throw error;

      showToast('Risk register saved successfully!', 'success');
    } catch (error) {
      console.error('Error saving risks:', error);
      showToast('Failed to save risks. Please try again.', 'error');
    }
  };

  const handleAddRisk = async () => {
    if (!riskFormData.description.trim()) {
      showToast('Risk description is required', 'error');
      return;
    }

    const newRisk = {
      id: Date.now().toString(),
      ...riskFormData,
      risk_score: riskFormData.probability * riskFormData.impact,
      created_at: new Date().toISOString()
    };

    const updatedRisks = [...risks, newRisk];
    await saveRisks(updatedRisks);
    
    setIsAddRiskModalOpen(false);
    setRiskFormData({
      description: '',
      probability: 5,
      impact: 5,
      mitigation: '',
      owner: '',
      linked_kpi_id: ''
    });
  };

  const handleEditRisk = async () => {
    if (!riskFormData.description.trim()) {
      showToast('Risk description is required', 'error');
      return;
    }

    const updatedRisks = risks.map(risk =>
      risk.id === editingRisk.id
        ? {
            ...risk,
            ...riskFormData,
            risk_score: riskFormData.probability * riskFormData.impact,
            updated_at: new Date().toISOString()
          }
        : risk
    );

    await saveRisks(updatedRisks);
    
    setEditingRisk(null);
    setRiskFormData({
      description: '',
      probability: 5,
      impact: 5,
      mitigation: '',
      owner: '',
      linked_kpi_id: ''
    });
  };

  const handleDeleteRisk = async (riskId: string) => {
    const updatedRisks = risks.filter(risk => risk.id !== riskId);
    await saveRisks(updatedRisks);
    setDeleteRiskId(null);
  };

  const openEditRiskModal = (risk: any) => {
    setEditingRisk(risk);
    setRiskFormData({
      description: risk.description,
      probability: risk.probability,
      impact: risk.impact,
      mitigation: risk.mitigation || '',
      owner: risk.owner || '',
      linked_kpi_id: risk.linked_kpi_id || ''
    });
  };

  const getSeverityBadge = (score: number) => {
    if (score >= 75) return { label: 'Critical', color: 'bg-red-100 text-red-700 border-red-300' };
    if (score >= 50) return { label: 'High', color: 'bg-orange-100 text-orange-700 border-orange-300' };
    if (score >= 25) return { label: 'Medium', color: 'bg-yellow-100 text-yellow-700 border-yellow-300' };
    return { label: 'Low', color: 'bg-green-100 text-green-700 border-green-300' };
  };

  const getAIRiskAlert = () => {
    if (risks.length === 0) return null;

    const highestRisk = risks.reduce((max, risk) => 
      risk.risk_score > max.risk_score ? risk : max
    , risks[0]);

    const severity = getSeverityBadge(highestRisk.risk_score);

    return {
      risk: highestRisk,
      severity: severity.label,
      message: `AI Alert: Highest risk identified is "${highestRisk.description}" with a ${severity.label.toLowerCase()} severity score of ${highestRisk.risk_score}/100. ${highestRisk.mitigation ? `Recommended mitigation: ${highestRisk.mitigation}` : 'No mitigation strategy defined yet.'}`
    };
  };

  // NEW: Governance Readiness Calculations
  const calculateCharterCompleteness = (): number => {
    const fields = Object.values(projectCharter);
    const completed = fields.filter((f) => f && f.trim().length > 0).length;
    return Math.round((completed / fields.length) * 100);
  };

  const calculateStakeholderEngagement = (): number => {
    if (stakeholders.length === 0) return 0;
    
    // Calculate based on:
    // - Number of stakeholders (max 50 points for 5+ stakeholders)
    // - RACI assignments completeness (max 50 points)
    const stakeholderScore = Math.min(50, stakeholders.length * 10);
    
    const totalCells = stakeholders.length * 5; // 5 DMAIC phases
    const filledCells = raciMatrix.reduce((sum, r) => {
      return sum + [r.define, r.measure, r.analyze, r.improve, r.control].filter(v => v !== '').length;
    }, 0);
    const raciScore = totalCells > 0 ? Math.round((filledCells / totalCells) * 50) : 0;

    return Math.min(100, stakeholderScore + raciScore);
  };

  const calculateRiskMitigation = (): number => {
    if (risks.length === 0) return 0;
    
    const mitigatedRisks = risks.filter(r => r.mitigation && r.mitigation.trim().length > 0);
    const ownedRisks = risks.filter(r => r.owner && r.owner.trim().length > 0);
    
    const mitigationScore = (mitigatedRisks.length / risks.length) * 60;
    const ownershipScore = (ownedRisks.length / risks.length) * 40;
    
    return Math.round(mitigationScore + ownershipScore);
  };

  const calculateCTQAlignment = (): number => {
    const totalMetrics = ctqTree.reduce((sum, node) => sum + (node.children?.length || 0), 0);
    
    if (totalMetrics === 0) return 0;
    
    // Calculate based on:
    // - Number of metrics (max 40 points for 4+ metrics)
    // - Metrics with targets set (max 30 points)
    // - Metrics with baseline data (max 30 points)
    const metricsScore = Math.min(40, totalMetrics * 10);
    
    let metricsWithTargets = 0;
    let metricsWithBaseline = 0;
    
    ctqTree.forEach(node => {
      node.children?.forEach((child: any) => {
        if (child.target && child.target > 0) metricsWithTargets++;
        if (child.baseline && child.baseline > 0) metricsWithBaseline++;
      });
    });
    
    const targetScore = totalMetrics > 0 ? (metricsWithTargets / totalMetrics) * 30 : 0;
    const baselineScore = totalMetrics > 0 ? (metricsWithBaseline / totalMetrics) * 30 : 0;
    
    return Math.round(metricsScore + targetScore + baselineScore);
  };

  const calculateOverallReadiness = (): number => {
    const charter = calculateCharterCompleteness();
    const stakeholder = calculateStakeholderEngagement();
    const risk = calculateRiskMitigation();
    const ctq = calculateCTQAlignment();
    
    return Math.round((charter + stakeholder + risk + ctq) / 4);
  };

  const getReadinessColor = (score: number): string => {
    if (score >= 80) return 'bg-green-100 text-green-700 border-green-300';
    if (score >= 60) return 'bg-yellow-100 text-yellow-700 border-yellow-300';
    return 'bg-red-100 text-red-700 border-red-300';
  };

  const getReadinessBarColor = (score: number): string => {
    if (score >= 80) return 'bg-green-600';
    if (score >= 60) return 'bg-yellow-600';
    return 'bg-red-600';
  };

  const getReadinessRecommendations = (): string[] => {
    const recommendations: string[] = [];
    
    const charter = calculateCharterCompleteness();
    const stakeholder = calculateStakeholderEngagement();
    const risk = calculateRiskMitigation();
    const ctq = calculateCTQAlignment();
    
    if (charter < 60) {
      recommendations.push('Complete all required Project Charter fields to improve charter completeness');
    }
    
    if (stakeholder < 60) {
      recommendations.push('Add more stakeholders and complete RACI assignments for all DMAIC phases');
    }
    
    if (risk < 60) {
      recommendations.push('Define mitigation strategies and assign owners for all identified risks');
    }
    
    if (ctq < 60) {
      recommendations.push('Link more CTQ/KPI metrics and ensure all have target and baseline values');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('All readiness metrics are above 60%. Great job! Consider completing remaining items to reach 80%+');
    }
    
    return recommendations;
  };

  const exportGovernanceReport = async () => {
    const reportContent = `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h1 style="color: #4f46e5; margin-bottom: 20px;">Governance Report</h1>
        
        <h2 style="color: #6366f1; margin-top: 30px;">Readiness Scores</h2>
        <ul style="list-style: none; padding: 0;">
          <li style="margin: 10px 0;"><strong>Charter Completeness:</strong> ${calculateCharterCompleteness()}%</li>
          <li style="margin: 10px 0;"><strong>Stakeholder Engagement:</strong> ${calculateStakeholderEngagement()}%</li>
          <li style="margin: 10px 0;"><strong>Risk Mitigation:</strong> ${calculateRiskMitigation()}%</li>
          <li style="margin: 10px 0;"><strong>CTQ Alignment:</strong> ${calculateCTQAlignment()}%</li>
          <li style="margin: 10px 0;"><strong>Overall Readiness:</strong> ${calculateOverallReadiness()}%</li>
        </ul>
        
        <h2 style="color: #6366f1; margin-top: 30px;">Recommendations</h2>
        <ul>
          ${getReadinessRecommendations().map(r => `<li style="margin: 10px 0;">${r}</li>`).join('')}
        </ul>
        
        <h2 style="color: #6366f1; margin-top: 30px;">RACI Matrix</h2>
        <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
          <thead>
            <tr style="background-color: #f3f4f6;">
              <th style="border: 1px solid #d1d5db; padding: 8px; text-align: left;">Stakeholder</th>
              <th style="border: 1px solid #d1d5db; padding: 8px; text-align: center;">Define</th>
              <th style="border: 1px solid #d1d5db; padding: 8px; text-align: center;">Measure</th>
              <th style="border: 1px solid #d1d5db; padding: 8px; text-align: center;">Analyze</th>
              <th style="border: 1px solid #d1d5db; padding: 8px; text-align: center;">Improve</th>
              <th style="border: 1px solid #d1d5db; padding: 8px; text-align: center;">Control</th>
            </tr>
          </thead>
          <tbody>
            ${stakeholders.map(s => {
              const assignment = raciMatrix.find(r => r.stakeholderId === s.id);
              return `
                <tr>
                  <td style="border: 1px solid #d1d5db; padding: 8px;">${s.name}</td>
                  <td style="border: 1px solid #d1d5db; padding: 8px; text-align: center;">${assignment?.define || '-'}</td>
                  <td style="border: 1px solid #d1d5db; padding: 8px; text-align: center;">${assignment?.measure || '-'}</td>
                  <td style="border: 1px solid #d1d5db; padding: 8px; text-align: center;">${assignment?.analyze || '-'}</td>
                  <td style="border: 1px solid #d1d5db; padding: 8px; text-align: center;">${assignment?.improve || '-'}</td>
                  <td style="border: 1px solid #d1d5db; padding: 8px; text-align: center;">${assignment?.control || '-'}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
    
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = reportContent;
    tempDiv.style.position = 'absolute';
    tempDiv.style.left = '-9999px';
    document.body.appendChild(tempDiv);
    
    await exportToPDF(
      tempDiv,
      `Governance_Report_${new Date().toISOString().split('T')[0]}.pdf`
    );
    
    document.body.removeChild(tempDiv);
    showToast('Governance Report exported to PDF', 'success');
  };

  const getKPIStatus = (current: number, target: number): string => {
    if (!target) return 'unknown';
    const variance = Math.abs(((current - target) / target) * 100);
    if (variance < 5) return 'healthy';
    if (variance < 15) return 'at-risk';
    return 'critical';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-100 text-green-700 border-green-300';
      case 'at-risk':
        return 'bg-yellow-100 text-yellow-700 border-yellow-300';
      case 'critical':
        return 'bg-red-100 text-red-700 border-red-300';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  // NEW: Calculate Define Phase Completion Percentage
  const calculateDefineCompletion = (): number => {
    let totalScore = 0;
    const maxScore = 100;

    // Charter completeness (40 points)
    const charterComplete = calculateCharterCompleteness();
    totalScore += (charterComplete / 100) * 40;

    // Stakeholders (20 points)
    const stakeholderScore = Math.min(20, stakeholders.length * 4);
    totalScore += stakeholderScore;

    // CTQ/KPI linked (20 points)
    const ctqCount = ctqTree.reduce(
      (sum, node) => sum + (node.children?.length || 0),
      0,
    );
    const ctqScore = Math.min(20, ctqCount * 5);
    totalScore += ctqScore;

    // SIPOC (10 points)
    const sipocItems = Object.values(sipocDiagram).reduce(
      (sum, arr) => sum + arr.length,
      0,
    );
    const sipocScore = Math.min(10, sipocItems * 0.5);
    totalScore += sipocScore;

    // Risks (10 points)
    const riskScore = Math.min(10, risks.length * 2);
    totalScore += riskScore;

    return Math.round(totalScore);
  };

  // NEW: Validate Define Phase Completion
  const validateDefinePhase = (): {
    isValid: boolean;
    errors: string[];
  } => {
    const errors: string[] = [];

    // Required Charter Fields
    if (!projectCharter.businessCase?.trim()) {
      errors.push('Business Case is required');
    }
    if (!projectCharter.problemStatement?.trim()) {
      errors.push('Problem Statement is required');
    }
    if (!projectCharter.goalStatement?.trim()) {
      errors.push('Goal Statement is required');
    }
    if (!projectCharter.scope?.trim()) {
      errors.push('Project Scope is required');
    }
    if (!projectCharter.successCriteria?.trim()) {
      errors.push('Success Criteria is required');
    }

    // At least 1 CTQ/KPI linked
    const ctqCount = ctqTree.reduce(
      (sum, node) => sum + (node.children?.length || 0),
      0,
    );
    if (ctqCount === 0) {
      errors.push('At least 1 CTQ or KPI must be linked to the project');
    }

    // At least 1 stakeholder
    if (stakeholders.length === 0) {
      errors.push('At least 1 stakeholder must be added');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  };

  // NEW: Handle Complete Define Phase
  const handleCompleteDefinePhase = async () => {
    // Validate phase completion
    const validation = validateDefinePhase();

    if (!validation.isValid) {
      setValidationErrors(validation.errors);
      setShowCompletionModal(true);
      return;
    }

    setValidationErrors([]);
    setShowCompletionModal(true);
  };

  // NEW: Confirm and Execute Phase Completion
  const executePhaseCompletion = async () => {
    if (!currentProjectId) {
      showToast('No active project found', 'error');
      return;
    }

    setCompletingPhase(true);

    try {
      // Step 1: Save all Define phase data
      const saved = await saveDefinePhaseData();
      if (!saved) {
        throw new Error('Failed to save Define phase data');
      }

      // Step 2: Cross-phase sync - Write target values to linked KPIs/Metrics
      await syncTargetValuesToMetrics();

      // Step 3: Update project phase to 'measure'
      const { error: phaseError } = await supabase
        .from('dmaic_projects')
        .update({
          phase: 'measure',
          updated_at: new Date().toISOString(),
        })
        .eq('id', currentProjectId);

      if (phaseError) throw phaseError;

      // Step 4: Log phase completion
      await logPhaseCompletion();

      showToast(
        '✅ Define Phase completed successfully! Moving to Measure Phase...',
        'success',
      );

      // Close modal and trigger parent callback
      setTimeout(() => {
        setShowCompletionModal(false);
        if (onPhaseComplete) {
          onPhaseComplete();
        }
      }, 2000);
    } catch (error) {
      console.error('Error completing Define phase:', error);
      showToast(
        'Failed to complete Define phase. Please try again.',
        'error',
      );
    } finally {
      setCompletingPhase(false);
    }
  };

  // NEW: Sync target values and financial impact to KPIs/Metrics tables
  const syncTargetValuesToMetrics = async () => {
    if (!organization?.id) return;

    try {
      // Get all CTQ nodes from the tree
      const allCTQNodes: any[] = [];
      ctqTree.forEach((node) => {
        if (node.children) {
          allCTQNodes.push(...node.children);
        }
      });

      // Update each KPI/Metric with target values and financial impact
      for (const node of allCTQNodes) {
        if (node.type === 'kpi') {
          await supabase
            .from('kpis')
            .update({
              target_value: node.target,
              baseline_value: node.baseline,
              financial_impact:
                financialImpact.copq > 0
                  ? {
                      copq: financialImpact.copq,
                      projected_savings: financialImpact.projectedSavings,
                      roi: financialImpact.roi,
                      payback_period: financialImpact.paybackPeriod,
                    }
                  : null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', node.id);
        } else if (node.type === 'metric') {
          await supabase
            .from('metrics')
            .update({
              target_value: node.target,
              baseline_value: node.baseline,
              financial_impact:
                financialImpact.copq > 0
                  ? {
                      copq: financialImpact.copq,
                      projected_savings: financialImpact.projectedSavings,
                      roi: financialImpact.roi,
                      payback_period: financialImpact.paybackPeriod,
                    }
                  : null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', node.id);
        }
      }

      console.log('✅ Target values synced to KPIs/Metrics tables');
    } catch (error) {
      console.error('Error syncing target values:', error);
      throw error;
    }
  };

  // NEW: Log phase completion for audit trail
  const logPhaseCompletion = async () => {
    try {
      const completionSummary = {
        phase: 'define',
        completed_at: new Date().toISOString(),
        completed_by: user?.id,
        completion_percentage: calculateDefineCompletion(),
        charter_completeness: calculateCharterCompleteness(),
        stakeholders_count: stakeholders.length,
        ctq_count: ctqTree.reduce(
          (sum, node) => sum + (node.children?.length || 0),
          0,
        ),
        risks_count: risks.length,
        sipoc_items: Object.values(sipocDiagram).reduce(
          (sum, arr) => sum + arr.length,
          0,
        ),
        financial_impact: financialImpact,
      };

      // Store in project_data.define.completion_log
      const { data: existingProject } = await supabase
        .from('dmaic_projects')
        .select('project_data')
        .eq('id', currentProjectId)
        .maybeSingle();

      const existingData = existingProject?.project_data || {};

      await supabase
        .from('dmaic_projects')
        .update({
          project_data: {
            ...existingData,
            define: {
              ...existingData.define,
              completion_log: completionSummary,
            },
          },
        })
        .eq('id', currentProjectId);

      console.log('✅ Phase completion logged');
    } catch (error) {
      console.error('Error logging phase completion:', error);
    }
  };

  // NEW: RACI Matrix Functions
  const initializeRACIMatrix = () => {
    const newMatrix: RACIAssignment[] = stakeholders.map(s => ({
      stakeholderId: s.id,
      define: '',
      measure: '',
      analyze: '',
      improve: '',
      control: '',
    }));
    setRaciMatrix(newMatrix);
  };

  useEffect(() => {
    if (stakeholders.length > 0 && raciMatrix.length === 0) {
      initializeRACIMatrix();
    }
  }, [stakeholders]);

  const updateRACICell = async (
    stakeholderId: string,
    phase: keyof Omit<RACIAssignment, 'stakeholderId'>,
    value: 'R' | 'A' | 'C' | 'I' | ''
  ) => {
    setRaciMatrix(prev => {
      const existing = prev.find(r => r.stakeholderId === stakeholderId);
      if (existing) {
        return prev.map(r =>
          r.stakeholderId === stakeholderId ? { ...r, [phase]: value } : r
        );
      } else {
        return [
          ...prev,
          {
            stakeholderId,
            define: phase === 'define' ? value : '',
            measure: phase === 'measure' ? value : '',
            analyze: phase === 'analyze' ? value : '',
            improve: phase === 'improve' ? value : '',
            control: phase === 'control' ? value : '',
          },
        ];
      }
    });

    // Auto-save
    setTimeout(async () => {
      await saveDefinePhaseData();
    }, 500);
  };

  const getRACIValue = (stakeholderId: string, phase: keyof Omit<RACIAssignment, 'stakeholderId'>): string => {
    const assignment = raciMatrix.find(r => r.stakeholderId === stakeholderId);
    return assignment ? assignment[phase] : '';
  };

  const getRACIColor = (role: string) => {
    switch (role) {
      case 'R':
        return 'bg-indigo-100 text-indigo-700 border-indigo-300';
      case 'A':
        return 'bg-purple-100 text-purple-700 border-purple-300';
      case 'C':
        return 'bg-teal-100 text-teal-700 border-teal-300';
      case 'I':
        return 'bg-gray-100 text-gray-700 border-gray-300';
      default:
        return 'bg-white text-gray-400 border-gray-200';
    }
  };

  const exportRACIMatrixToPDF = async () => {
    await exportToPDF(
      'raci-matrix-table',
      `RACI_Matrix_${new Date().toISOString().split('T')[0]}.pdf`
    );
    showToast('RACI Matrix exported to PDF', 'success');
  };

  const exportRACIMatrixToCSV = () => {
    const headers = ['Stakeholder', 'Role', 'Define', 'Measure', 'Analyze', 'Improve', 'Control'];
    const rows = stakeholders.map(s => {
      const assignment = raciMatrix.find(r => r.stakeholderId === s.id);
      return [
        s.name,
        s.role,
        assignment?.define || '',
        assignment?.measure || '',
        assignment?.analyze || '',
        assignment?.improve || '',
        assignment?.control || '',
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `RACI_Matrix_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    showToast('RACI Matrix exported to CSV', 'success');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <i className="ri-loader-4-line text-4xl text-indigo-600 animate-spin"></i>
          <p className="text-gray-600">Loading Define Phase...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* NEW: Phase Completion Progress Bar - Always Visible at Top */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-6 text-white shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xl font-bold mb-1">Define Phase Progress</h3>
            <p className="text-sm text-indigo-100">
              Complete all requirements to proceed to Measure Phase
            </p>
          </div>
          <div className="text-5xl font-bold">{calculateDefineCompletion()}%</div>
        </div>

        <div className="w-full bg-white/20 rounded-full h-4 mb-4">
          <div
            className="bg-white h-4 rounded-full transition-all duration-500 shadow-lg"
            style={{ width: `${calculateDefineCompletion()}%` }}
          ></div>
        </div>

        <div className="grid grid-cols-5 gap-3 mb-4">
          <div className="bg-white/10 rounded-lg p-3 text-center backdrop-blur-sm">
            <div className="text-xs opacity-80 mb-1">Charter</div>
            <div className="text-lg font-bold">{calculateCharterCompleteness()}%</div>
          </div>
          <div className="bg-white/10 rounded-lg p-3 text-center backdrop-blur-sm">
            <div className="text-xs opacity-80 mb-1">Stakeholders</div>
            <div className="text-lg font-bold">{stakeholders.length}</div>
          </div>
          <div className="bg-white/10 rounded-lg p-3 text-center backdrop-blur-sm">
            <div className="text-xs opacity-80 mb-1">CTQ/KPIs</div>
            <div className="text-lg font-bold">{ctqTree.reduce((sum, node) => sum + (node.children?.length || 0), 0)}</div>
          </div>
          <div className="bg-white/10 rounded-lg p-3 text-center backdrop-blur-sm">
            <div className="text-xs opacity-80 mb-1">SIPOC Items</div>
            <div className="text-lg font-bold">{Object.values(sipocDiagram).reduce((sum, arr) => sum + arr.length, 0)}</div>
          </div>
          <div className="bg-white/10 rounded-lg p-3 text-center backdrop-blur-sm">
            <div className="text-xs opacity-80 mb-1">Risks</div>
            <div className="text-lg font-bold">{risks.length}</div>
          </div>
        </div>

        <button
          onClick={handleCompleteDefinePhase}
          disabled={calculateDefineCompletion() < 60}
          className="w-full px-6 py-4 bg-white text-indigo-600 rounded-lg font-bold text-lg hover:bg-indigo-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl flex items-center justify-center gap-3 whitespace-nowrap"
        >
          <i className="ri-checkbox-circle-line text-2xl"></i>
          <span>Complete Define Phase &amp; Move to Measure</span>
          <i className="ri-arrow-right-line text-2xl"></i>
        </button>

        {calculateDefineCompletion() < 60 && (
          <p className="text-xs text-white/80 text-center mt-3">
            <i className="ri-information-line mr-1"></i>
            Complete at least 60% of Define phase requirements to proceed
          </p>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="border-b border-gray-200">
          <div className="flex space-x-1 px-6 overflow-x-auto">
            {[
              { id: 'charter', label: 'Project Charter', icon: 'ri-file-text-line' },
              { id: 'sipoc', label: 'SIPOC Diagram', icon: 'ri-flow-chart' },
              { id: 'stakeholders', label: 'Stakeholders', icon: 'ri-team-line' },
              { id: 'ctq', label: 'CTQ Tree', icon: 'ri-node-tree' },
              { id: 'kpi-sync', label: 'KPI Sync Dashboard', icon: 'ri-dashboard-line' },
              { id: 'risks', label: 'Risk Register', icon: 'ri-alert-line' },
              { id: 'governance', label: 'Governance', icon: 'ri-shield-check-line' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActivePanel(tab.id as any)}
                className={`flex items-center space-x-2 px-6 py-4 font-semibold transition-all whitespace-nowrap ${
                  activePanel === tab.id
                    ? 'text-indigo-600 border-b-2 border-indigo-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <i className={`${tab.icon} text-lg`}></i>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="p-8">
          {/* Project Charter Panel */}
          {activePanel === 'charter' && (
            <div className="space-y-6">
              {/* Completeness Progress Bar */}
              <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl border border-indigo-200 p-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Charter Completeness
                  </h3>
                  <span className="text-2xl font-bold text-indigo-600">
                    {calculateCharterCompleteness()}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className="bg-gradient-to-r from-indigo-600 to-purple-600 h-3 rounded-full transition-all duration-500"
                    style={{
                      width: `${calculateCharterCompleteness()}%`,
                    }}
                  ></div>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  {calculateCharterCompleteness() === 100
                    ? '✅ Charter is complete and ready for review'
                    : `${10 -
                        Object.values(projectCharter).filter(
                          (f) => f && f.trim().length > 0,
                        ).length}{' '}
                      fields remaining`}
                </p>
              </div>

              {/* Charter Form */}
              <div className="grid grid-cols-1 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Business Case *
                  </label>
                  <textarea
                    value={projectCharter.businessCase}
                    onChange={(e) =>
                      setProjectCharter({
                        ...projectCharter,
                        businessCase: e.target.value,
                      })
                    }
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    rows={4}
                    placeholder="Why is this project important? What business problem does it solve?"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Problem Statement *
                  </label>
                  <textarea
                    value={projectCharter.problemStatement}
                    onChange={(e) =>
                      setProjectCharter({
                        ...projectCharter,
                        problemStatement: e.target.value,
                      })
                    }
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    rows={3}
                    placeholder="What is the specific problem? Include current state and impact."
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Goal Statement (SMART) *
                  </label>
                  <textarea
                    value={projectCharter.goalStatement}
                    onChange={(e) =>
                      setProjectCharter({
                        ...projectCharter,
                        goalStatement: e.target.value,
                      })
                    }
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    rows={3}
                    placeholder="Specific, Measurable, Achievable, Relevant, Time-bound goal"
                  />
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                      In Scope *
                    </label>
                    <textarea
                      value={projectCharter.scope}
                      onChange={(e) =>
                        setProjectCharter({
                          ...projectCharter,
                          scope: e.target.value,
                        })
                      }
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      rows={4}
                      placeholder="What is included in this project?"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                      Out of Scope
                    </label>
                    <textarea
                      value={projectCharter.outOfScope}
                      onChange={(e) =>
                        setProjectCharter({
                          ...projectCharter,
                          outOfScope: e.target.value,
                        })
                      }
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      rows={4}
                      placeholder="What is explicitly excluded?"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                      Constraints
                    </label>
                    <textarea
                      value={projectCharter.constraints}
                      onChange={(e) =>
                        setProjectCharter({
                          ...projectCharter,
                          constraints: e.target.value,
                        })
                      }
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      rows={3}
                      placeholder="Budget, time, resource limitations"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                      Assumptions
                    </label>
                    <textarea
                      value={projectCharter.assumptions}
                      onChange={(e) =>
                        setProjectCharter({
                          ...projectCharter,
                          assumptions: e.target.value,
                        })
                      }
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      rows={3}
                      placeholder="What are we assuming to be true?"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Success Criteria *
                  </label>
                  <textarea
                    value={projectCharter.successCriteria}
                    onChange={(e) =>
                      setProjectCharter({
                        ...projectCharter,
                        successCriteria: e.target.value,
                      })
                    }
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    rows={3}
                    placeholder="How will we measure success? What are the key deliverables?"
                  />
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                      Timeline
                    </label>
                    <input
                      type="text"
                      value={projectCharter.timeline}
                      onChange={(e) =>
                        setProjectCharter({
                          ...projectCharter,
                          timeline: e.target.value,
                        })
                      }
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      placeholder="e.g., 6 months, Q1 2024"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                      Budget
                    </label>
                    <input
                      type="text"
                      value={projectCharter.budget}
                      onChange={(e) =>
                        setProjectCharter({
                          ...projectCharter,
                          budget: e.target.value,
                        })
                      }
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      placeholder="e.g., $50,000"
                    />
                  </div>
                </div>
              </div>

              {/* Save Button */}
              <div className="flex justify-end pt-4 border-t border-gray-200">
                <button
                  onClick={handleSaveCharter}
                  disabled={savingCharter}
                  className="px-8 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
                >
                  {savingCharter ? (
                    <>
                      <i className="ri-loader-4-line animate-spin"></i>
                      Saving...
                    </>
                  ) : (
                    <>
                      <i className="ri-save-line"></i>
                      Save Charter
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Other panels (SIPOC, Stakeholders, CTQ, KPI Sync, Risks, Governance) */}
          {/* SIPOC Diagram Panel */}
          {activePanel === 'sipoc' && (
            <div className="space-y-6">
              {/* Header with Actions */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900">SIPOC Diagram</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Map your process from Suppliers to Customers
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={async () => {
                      await exportToPDF(
                        'sipoc-diagram',
                        `SIPOC_Diagram_${new Date().toISOString().split('T')[0]}.pdf`
                      );
                      showToast('SIPOC exported to PDF', 'success');
                    }}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors flex items-center gap-2 whitespace-nowrap"
                  >
                    <i className="ri-file-pdf-line"></i>
                    Export to PDF
                  </button>
                  <button
                    onClick={handleSaveSipoc}
                    disabled={savingSipoc}
                    className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
                  >
                    {savingSipoc ? (
                      <>
                        <i className="ri-loader-4-line animate-spin"></i>
                        Saving...
                      </>
                    ) : (
                      <>
                        <i className="ri-save-line"></i>
                        Save SIPOC
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Empty State */}
              {Object.values(sipocDiagram).every(arr => arr.length === 0) && (
                <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
                  <i className="ri-flow-chart text-6xl text-gray-300 mb-4 block"></i>
                  <h4 className="text-lg font-semibold text-gray-900 mb-2">
                    Start Building Your SIPOC Diagram
                  </h4>
                  <p className="text-sm text-gray-600 max-w-md mx-auto">
                    Add items to each column by typing in the input fields below and pressing Enter.
                    Map your entire process flow from suppliers to customers.
                  </p>
                </div>
              )}

              {/* SIPOC 5-Column Layout */}
              <div id="sipoc-diagram" className="bg-gradient-to-br from-slate-50 to-gray-50 rounded-xl border border-gray-200 p-6">
                <div className="grid grid-cols-5 gap-3">

                  {/* Suppliers Column */}
                  <div className="space-y-3">
                    <div className="bg-blue-600 text-white rounded-lg p-3 text-center">
                      <div className="flex items-center justify-center gap-2 mb-1">
                        <i className="ri-truck-line text-lg"></i>
                        <h4 className="font-bold">Suppliers</h4>
                      </div>
                      <div className="text-xs opacity-90">Who provides inputs?</div>
                      <div className="mt-1 bg-white/20 rounded-full px-2 py-0.5 text-xs font-semibold inline-block">
                        {sipocDiagram.suppliers.length} items
                      </div>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Type &amp; press Enter..."
                        className="w-full px-3 py-2 pr-8 border-2 border-blue-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                            setSipocDiagram(prev => ({
                              ...prev,
                              suppliers: [...prev.suppliers, e.currentTarget.value.trim()]
                            }));
                            e.currentTarget.value = '';
                            showToast('Supplier added', 'success');
                          }
                        }}
                      />
                      <i className="ri-add-line absolute right-2 top-2.5 text-blue-500 pointer-events-none text-sm"></i>
                    </div>
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                      {sipocDiagram.suppliers.map((item, idx) => (
                        <div key={idx} className="bg-white border border-blue-200 rounded-lg p-2 group hover:shadow-sm transition-all flex items-start justify-between gap-1">
                          <span className="text-sm text-gray-800 break-words flex-1">{item}</span>
                          <button
                            onClick={() => handleRemoveSipocItem('suppliers', idx)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-red-50 rounded text-red-500 flex-shrink-0"
                          >
                            <i className="ri-close-line text-sm"></i>
                          </button>
                        </div>
                      ))}
                    </div>
                    {sipocDiagram.suppliers.length > 0 && (
                      <button
                        onClick={() => {
                          setSipocDiagram(prev => ({ ...prev, suppliers: [] }));
                          showToast('All suppliers cleared', 'info');
                        }}
                        className="w-full px-2 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-medium hover:bg-red-100 transition-colors whitespace-nowrap"
                      >
                        <i className="ri-delete-bin-line mr-1"></i>Clear All
                      </button>
                    )}
                  </div>

                  {/* Inputs Column */}
                  <div className="space-y-3">
                    <div className="bg-green-600 text-white rounded-lg p-3 text-center">
                      <div className="flex items-center justify-center gap-2 mb-1">
                        <i className="ri-inbox-line text-lg"></i>
                        <h4 className="font-bold">Inputs</h4>
                      </div>
                      <div className="text-xs opacity-90">What goes in?</div>
                      <div className="mt-1 bg-white/20 rounded-full px-2 py-0.5 text-xs font-semibold inline-block">
                        {sipocDiagram.inputs.length} items
                      </div>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Type &amp; press Enter..."
                        className="w-full px-3 py-2 pr-8 border-2 border-green-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                            setSipocDiagram(prev => ({
                              ...prev,
                              inputs: [...prev.inputs, e.currentTarget.value.trim()]
                            }));
                            e.currentTarget.value = '';
                            showToast('Input added', 'success');
                          }
                        }}
                      />
                      <i className="ri-add-line absolute right-2 top-2.5 text-green-500 pointer-events-none text-sm"></i>
                    </div>
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                      {sipocDiagram.inputs.map((item, idx) => (
                        <div key={idx} className="bg-white border border-green-200 rounded-lg p-2 group hover:shadow-sm transition-all flex items-start justify-between gap-1">
                          <span className="text-sm text-gray-800 break-words flex-1">{item}</span>
                          <button
                            onClick={() => handleRemoveSipocItem('inputs', idx)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-red-50 rounded text-red-500 flex-shrink-0"
                          >
                            <i className="ri-close-line text-sm"></i>
                          </button>
                        </div>
                      ))}
                    </div>
                    {sipocDiagram.inputs.length > 0 && (
                      <button
                        onClick={() => {
                          setSipocDiagram(prev => ({ ...prev, inputs: [] }));
                          showToast('All inputs cleared', 'info');
                        }}
                        className="w-full px-2 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-medium hover:bg-red-100 transition-colors whitespace-nowrap"
                      >
                        <i className="ri-delete-bin-line mr-1"></i>Clear All
                      </button>
                    )}
                  </div>

                  {/* Process Column */}
                  <div className="space-y-3">
                    <div className="bg-purple-600 text-white rounded-lg p-3 text-center">
                      <div className="flex items-center justify-center gap-2 mb-1">
                        <i className="ri-settings-3-line text-lg"></i>
                        <h4 className="font-bold">Process</h4>
                      </div>
                      <div className="text-xs opacity-90">What happens?</div>
                      <div className="mt-1 bg-white/20 rounded-full px-2 py-0.5 text-xs font-semibold inline-block">
                        {sipocDiagram.process.length} steps
                      </div>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Type &amp; press Enter..."
                        className="w-full px-3 py-2 pr-8 border-2 border-purple-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                            setSipocDiagram(prev => ({
                              ...prev,
                              process: [...prev.process, e.currentTarget.value.trim()]
                            }));
                            e.currentTarget.value = '';
                            showToast('Process step added', 'success');
                          }
                        }}
                      />
                      <i className="ri-add-line absolute right-2 top-2.5 text-purple-500 pointer-events-none text-sm"></i>
                    </div>
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                      {sipocDiagram.process.map((item, idx) => (
                        <div key={idx} className="bg-white border border-purple-200 rounded-lg p-2 group hover:shadow-sm transition-all flex items-start justify-between gap-1">
                          <span className="text-sm text-gray-800 break-words flex-1">
                            <span className="font-semibold text-purple-600 mr-1">{idx + 1}.</span>{item}
                          </span>
                          <button
                            onClick={() => handleRemoveSipocItem('process', idx)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-red-50 rounded text-red-500 flex-shrink-0"
                          >
                            <i className="ri-close-line text-sm"></i>
                          </button>
                        </div>
                      ))}
                    </div>
                    {sipocDiagram.process.length > 0 && (
                      <button
                        onClick={() => {
                          setSipocDiagram(prev => ({ ...prev, process: [] }));
                          showToast('All process steps cleared', 'info');
                        }}
                        className="w-full px-2 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-medium hover:bg-red-100 transition-colors whitespace-nowrap"
                      >
                        <i className="ri-delete-bin-line mr-1"></i>Clear All
                      </button>
                    )}
                  </div>

                  {/* Outputs Column */}
                  <div className="space-y-3">
                    <div className="bg-orange-600 text-white rounded-lg p-3 text-center">
                      <div className="flex items-center justify-center gap-2 mb-1">
                        <i className="ri-archive-line text-lg"></i>
                        <h4 className="font-bold">Outputs</h4>
                      </div>
                      <div className="text-xs opacity-90">What comes out?</div>
                      <div className="mt-1 bg-white/20 rounded-full px-2 py-0.5 text-xs font-semibold inline-block">
                        {sipocDiagram.outputs.length} items
                      </div>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Type &amp; press Enter..."
                        className="w-full px-3 py-2 pr-8 border-2 border-orange-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                            setSipocDiagram(prev => ({
                              ...prev,
                              outputs: [...prev.outputs, e.currentTarget.value.trim()]
                            }));
                            e.currentTarget.value = '';
                            showToast('Output added', 'success');
                          }
                        }}
                      />
                      <i className="ri-add-line absolute right-2 top-2.5 text-orange-500 pointer-events-none text-sm"></i>
                    </div>
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                      {sipocDiagram.outputs.map((item, idx) => (
                        <div key={idx} className="bg-white border border-orange-200 rounded-lg p-2 group hover:shadow-sm transition-all flex items-start justify-between gap-1">
                          <span className="text-sm text-gray-800 break-words flex-1">{item}</span>
                          <button
                            onClick={() => handleRemoveSipocItem('outputs', idx)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-red-50 rounded text-red-500 flex-shrink-0"
                          >
                            <i className="ri-close-line text-sm"></i>
                          </button>
                        </div>
                      ))}
                    </div>
                    {sipocDiagram.outputs.length > 0 && (
                      <button
                        onClick={() => {
                          setSipocDiagram(prev => ({ ...prev, outputs: [] }));
                          showToast('All outputs cleared', 'info');
                        }}
                        className="w-full px-2 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-medium hover:bg-red-100 transition-colors whitespace-nowrap"
                      >
                        <i className="ri-delete-bin-line mr-1"></i>Clear All
                      </button>
                    )}
                  </div>

                  {/* Customers Column */}
                  <div className="space-y-3">
                    <div className="bg-teal-600 text-white rounded-lg p-3 text-center">
                      <div className="flex items-center justify-center gap-2 mb-1">
                        <i className="ri-user-star-line text-lg"></i>
                        <h4 className="font-bold">Customers</h4>
                      </div>
                      <div className="text-xs opacity-90">Who receives outputs?</div>
                      <div className="mt-1 bg-white/20 rounded-full px-2 py-0.5 text-xs font-semibold inline-block">
                        {sipocDiagram.customers.length} items
                      </div>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Type &amp; press Enter..."
                        className="w-full px-3 py-2 pr-8 border-2 border-teal-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                            setSipocDiagram(prev => ({
                              ...prev,
                              customers: [...prev.customers, e.currentTarget.value.trim()]
                            }));
                            e.currentTarget.value = '';
                            showToast('Customer added', 'success');
                          }
                        }}
                      />
                      <i className="ri-add-line absolute right-2 top-2.5 text-teal-500 pointer-events-none text-sm"></i>
                    </div>
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                      {sipocDiagram.customers.map((item, idx) => (
                        <div key={idx} className="bg-white border border-teal-200 rounded-lg p-2 group hover:shadow-sm transition-all flex items-start justify-between gap-1">
                          <span className="text-sm text-gray-800 break-words flex-1">{item}</span>
                          <button
                            onClick={() => handleRemoveSipocItem('customers', idx)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-red-50 rounded text-red-500 flex-shrink-0"
                          >
                            <i className="ri-close-line text-sm"></i>
                          </button>
                        </div>
                      ))}
                    </div>
                    {sipocDiagram.customers.length > 0 && (
                      <button
                        onClick={() => {
                          setSipocDiagram(prev => ({ ...prev, customers: [] }));
                          showToast('All customers cleared', 'info');
                        }}
                        className="w-full px-2 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-medium hover:bg-red-100 transition-colors whitespace-nowrap"
                      >
                        <i className="ri-delete-bin-line mr-1"></i>Clear All
                      </button>
                    )}
                  </div>

                </div>

                {/* Flow Arrow Row */}
                <div className="grid grid-cols-5 gap-3 mt-3">
                  {['Suppliers', 'Inputs', 'Process', 'Outputs', 'Customers'].map((label, idx) => (
                    <div key={label} className="flex items-center justify-center">
                      {idx < 4 ? (
                        <i className="ri-arrow-right-line text-2xl text-gray-400"></i>
                      ) : (
                        <i className="ri-flag-line text-2xl text-teal-400"></i>
                      )}
                    </div>
                  ))}
                </div>

                {/* SIPOC Summary Stats */}
                <div className="grid grid-cols-5 gap-3 mt-3">
                  <div className="bg-blue-50 rounded-lg border border-blue-200 p-3 text-center">
                    <div className="text-xl font-bold text-blue-600">{sipocDiagram.suppliers.length}</div>
                    <div className="text-xs text-gray-600">Suppliers</div>
                  </div>
                  <div className="bg-green-50 rounded-lg border border-green-200 p-3 text-center">
                    <div className="text-xl font-bold text-green-600">{sipocDiagram.inputs.length}</div>
                    <div className="text-xs text-gray-600">Inputs</div>
                  </div>
                  <div className="bg-purple-50 rounded-lg border border-purple-200 p-3 text-center">
                    <div className="text-xl font-bold text-purple-600">{sipocDiagram.process.length}</div>
                    <div className="text-xs text-gray-600">Process Steps</div>
                  </div>
                  <div className="bg-orange-50 rounded-lg border border-orange-200 p-3 text-center">
                    <div className="text-xl font-bold text-orange-600">{sipocDiagram.outputs.length}</div>
                    <div className="text-xs text-gray-600">Outputs</div>
                  </div>
                  <div className="bg-teal-50 rounded-lg border border-teal-200 p-3 text-center">
                    <div className="text-xl font-bold text-teal-600">{sipocDiagram.customers.length}</div>
                    <div className="text-xs text-gray-600">Customers</div>
                  </div>
                </div>

                {/* Validation Warning */}
                {Object.values(sipocDiagram).reduce((sum, arr) => sum + arr.length, 0) > 0 &&
                  Object.values(sipocDiagram).filter(arr => arr.length > 0).length < 3 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3 mt-4">
                      <i className="ri-error-warning-line text-yellow-600 text-xl mt-0.5"></i>
                      <div className="flex-1">
                        <div className="font-semibold text-yellow-900 mb-1">Validation Required</div>
                        <div className="text-sm text-yellow-800">
                          Please add items to at least 3 categories to save the SIPOC diagram.
                        </div>
                      </div>
                    </div>
                  )}
              </div>
            </div>
          )}

          {/* Placeholder for other panels */}
          {activePanel === 'stakeholders' && (
            <div className="space-y-6">
              {/* Header with Add Button */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900">Stakeholder Management</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Identify and manage project stakeholders with influence/interest analysis
                  </p>
                </div>
                <button
                  onClick={() => {
                    setEditingStakeholder(null);
                    setNewStakeholder({
                      name: '',
                      role: '',
                      influence: 'medium',
                      interest: 'medium',
                      raci: 'informed',
                    });
                    setShowStakeholderModal(true);
                  }}
                  className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors flex items-center gap-2 whitespace-nowrap"
                >
                  <i className="ri-user-add-line text-lg"></i>
                  Add Stakeholder
                </button>
              </div>

              {/* Stakeholder Count Badge */}
              <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl border border-indigo-200 p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-indigo-600 rounded-full flex items-center justify-center">
                      <i className="ri-team-line text-white text-2xl"></i>
                    </div>
                    <div>
                      <div className="text-3xl font-bold text-gray-900">{stakeholders.length}</div>
                      <div className="text-sm text-gray-600">Total Stakeholders</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-4">
                    <div className="text-center">
                      <div className="text-xl font-bold text-red-600">
                        {stakeholders.filter(s => s.influence === 'high' && s.interest === 'high').length}
                      </div>
                      <div className="text-xs text-gray-600">Manage Closely</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xl font-bold text-orange-600">
                        {stakeholders.filter(s => s.influence === 'high' && s.interest !== 'high').length}
                      </div>
                      <div className="text-xs text-gray-600">Keep Satisfied</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xl font-bold text-blue-600">
                        {stakeholders.filter(s => s.influence !== 'high' && s.interest === 'high').length}
                      </div>
                      <div className="text-xs text-gray-600">Keep Informed</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xl font-bold text-gray-600">
                        {stakeholders.filter(s => s.influence !== 'high' && s.interest !== 'high').length}
                      </div>
                      <div className="text-xs text-gray-600">Monitor</div>
                    </div>
                  </div>
                </div>
              </div>

              {stakeholders.length === 0 ? (
                // Empty State
                <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
                  <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i className="ri-team-line text-4xl text-gray-400"></i>
                  </div>
                  <h4 className="text-xl font-bold text-gray-900 mb-2">No Stakeholders Yet</h4>
                  <p className="text-gray-600 mb-6 max-w-md mx-auto">
                    Start building your stakeholder registry by adding key individuals and groups who have influence or interest in this project.
                  </p>
                  <button
                    onClick={() => {
                      setEditingStakeholder(null);
                      setNewStakeholder({
                        name: '',
                        role: '',
                        influence: 'medium',
                        interest: 'medium',
                        raci: 'informed',
                      });
                      setShowStakeholderModal(true);
                    }}
                    className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors inline-flex items-center gap-2 whitespace-nowrap"
                  >
                    <i className="ri-user-add-line text-lg"></i>
                    Add Your First Stakeholder
                  </button>
                </div>
              ) : (
                <>
                  {/* Influence/Interest Matrix Visualization */}
                  <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <i className="ri-grid-line text-indigo-600"></i>
                      Influence/Interest Matrix
                    </h4>
                    <div className="relative">
                      {/* Matrix Grid */}
                      <div className="grid grid-cols-3 gap-0 border-2 border-gray-300 rounded-lg overflow-hidden">
                        {/* Top Row - High Interest */}
                        <div className="bg-gray-100 border-r border-b border-gray-300 p-3 text-center">
                          <div className="text-xs font-semibold text-gray-600">Low Influence</div>
                          <div className="text-xs text-gray-500">High Interest</div>
                        </div>
                        <div className="bg-gray-100 border-r border-b border-gray-300 p-3 text-center">
                          <div className="text-xs font-semibold text-gray-600">Medium Influence</div>
                          <div className="text-xs text-gray-500">High Interest</div>
                        </div>
                        <div className="bg-gray-100 border-b border-gray-300 p-3 text-center">
                          <div className="text-xs font-semibold text-gray-600">High Influence</div>
                          <div className="text-xs text-gray-500">High Interest</div>
                        </div>

                        {/* Middle Row - Medium Interest */}
                        <div className="bg-gray-50 border-r border-b border-gray-300 p-3 text-center">
                          <div className="text-xs font-semibold text-gray-600">Low Influence</div>
                          <div className="text-xs text-gray-500">Medium Interest</div>
                        </div>
                        <div className="bg-gray-50 border-r border-b border-gray-300 p-3 text-center">
                          <div className="text-xs font-semibold text-gray-600">Medium Influence</div>
                          <div className="text-xs text-gray-500">Medium Interest</div>
                        </div>
                        <div className="bg-gray-50 border-b border-gray-300 p-3 text-center">
                          <div className="text-xs font-semibold text-gray-600">High Influence</div>
                          <div className="text-xs text-gray-500">Medium Interest</div>
                        </div>

                        {/* Bottom Row - Low Interest */}
                        <div className="bg-white border-r border-gray-300 p-3 text-center">
                          <div className="text-xs font-semibold text-gray-600">Low Influence</div>
                          <div className="text-xs text-gray-500">Low Interest</div>
                        </div>
                        <div className="bg-white border-r border-gray-300 p-3 text-center">
                          <div className="text-xs font-semibold text-gray-600">Medium Influence</div>
                          <div className="text-xs text-gray-500">Low Interest</div>
                        </div>
                        <div className="bg-white border-gray-300 p-3 text-center">
                          <div className="text-xs font-semibold text-gray-600">High Influence</div>
                          <div className="text-xs text-gray-500">Low Interest</div>
                        </div>
                      </div>

                      {/* Quadrant Labels Overlay */}
                      <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
                        {/* Keep Informed - Top Left */}
                        <div className="col-start-1 row-start-1 flex items-center justify-center p-4">
                          <div className="bg-blue-500/90 text-white px-3 py-2 rounded-lg text-xs font-bold shadow-lg">
                            Keep Informed
                            <div className="text-xs font-normal mt-0.5">
                              ({stakeholders.filter(s => s.influence === 'low' && s.interest === 'high').length})
                            </div>
                          </div>
                        </div>

                        {/* Manage Closely - Top Right */}
                        <div className="col-start-3 row-start-1 flex items-center justify-center p-4">
                          <div className="bg-red-500/90 text-white px-3 py-2 rounded-lg text-xs font-bold shadow-lg">
                            Manage Closely
                            <div className="text-xs font-normal mt-0.5">
                              ({stakeholders.filter(s => s.influence === 'high' && s.interest === 'high').length})
                            </div>
                          </div>
                        </div>

                        {/* Monitor - Bottom Left */}
                        <div className="col-start-1 row-start-3 flex items-center justify-center p-4">
                          <div className="bg-gray-500/90 text-white px-3 py-2 rounded-lg text-xs font-bold shadow-lg">
                            Monitor
                            <div className="text-xs font-normal mt-0.5">
                              ({stakeholders.filter(s => s.influence === 'low' && s.interest === 'low').length})
                            </div>
                          </div>
                        </div>

                        {/* Keep Satisfied - Bottom Right */}
                        <div className="col-start-3 row-start-3 flex items-center justify-center p-4">
                          <div className="bg-orange-500/90 text-white px-3 py-2 rounded-lg text-xs font-bold shadow-lg">
                            Keep Satisfied
                            <div className="text-xs font-normal mt-0.5">
                              ({stakeholders.filter(s => s.influence === 'high' && s.interest === 'low').length})
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Axis Labels */}
                      <div className="mt-4 flex items-center justify-between text-xs text-gray-600">
                        <div className="flex items-center gap-2">
                          <i className="ri-arrow-right-line"></i>
                          <span className="font-semibold">Influence Level</span>
                          <span className="text-gray-400">(Low → High)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <i className="ri-arrow-up-line"></i>
                          <span className="font-semibold">Interest Level</span>
                          <span className="text-gray-400">(Low → High)</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Stakeholder Table/Grid */}
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                              Name
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                              Role
                            </th>
                            <th className="px-6 py-4 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">
                              Influence
                            </th>
                            <th className="px-6 py-4 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">
                              Interest
                            </th>
                            <th className="px-6 py-4 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">
                              RACI
                            </th>
                            <th className="px-6 py-4 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">
                              Strategy
                            </th>
                            <th className="px-6 py-4 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {stakeholders.map((stakeholder) => {
                            // Determine strategy based on influence × interest
                            let strategy = 'Monitor';
                            let strategyColor = 'bg-gray-100 text-gray-700 border-gray-300';
                            
                            if (stakeholder.influence === 'high' && stakeholder.interest === 'high') {
                              strategy = 'Manage Closely';
                              strategyColor = 'bg-red-100 text-red-700 border-red-300';
                            } else if (stakeholder.influence === 'high' && stakeholder.interest !== 'high') {
                              strategy = 'Keep Satisfied';
                              strategyColor = 'bg-orange-100 text-orange-700 border-orange-300';
                            } else if (stakeholder.influence !== 'high' && stakeholder.interest === 'high') {
                              strategy = 'Keep Informed';
                              strategyColor = 'bg-blue-100 text-blue-700 border-blue-300';
                            }

                            // Influence badge color
                            const influenceColor = 
                              stakeholder.influence === 'high' ? 'bg-red-100 text-red-700 border-red-300' :
                              stakeholder.influence === 'medium' ? 'bg-yellow-100 text-yellow-700 border-yellow-300' :
                              'bg-green-100 text-green-700 border-green-300';

                            // Interest badge color
                            const interestColor = 
                              stakeholder.interest === 'high' ? 'bg-purple-100 text-purple-700 border-purple-300' :
                              stakeholder.interest === 'medium' ? 'bg-blue-100 text-blue-700 border-blue-300' :
                              'bg-gray-100 text-gray-700 border-gray-300';

                            // RACI badge color
                            const raciColor = 
                              stakeholder.raci === 'responsible' ? 'bg-indigo-100 text-indigo-700 border-indigo-300' :
                              stakeholder.raci === 'accountable' ? 'bg-purple-100 text-purple-700 border-purple-300' :
                              stakeholder.raci === 'consulted' ? 'bg-teal-100 text-teal-700 border-teal-300' :
                              'bg-gray-100 text-gray-700 border-gray-300';

                            return (
                              <tr key={stakeholder.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                                      <span className="text-indigo-700 font-bold text-sm">
                                        {stakeholder.name.charAt(0).toUpperCase()}
                                      </span>
                                    </div>
                                    <div className="font-semibold text-gray-900">{stakeholder.name}</div>
                                  </div>
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-700">{stakeholder.role}</td>
                                <td className="px-6 py-4 text-center">
                                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${influenceColor} capitalize`}>
                                    {stakeholder.influence}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-center">
                                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${interestColor} capitalize`}>
                                    {stakeholder.interest}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-center">
                                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${raciColor} uppercase`}>
                                    {(stakeholder.raci || '').charAt(0)}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-center">
                                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${strategyColor}`}>
                                    {strategy}
                                  </span>
                                </td>
                                <td className="px-6 py-4">
                                  <div className="flex items-center justify-center gap-2">
                                    <button
                                      onClick={() => {
                                        setEditingStakeholder(stakeholder);
                                        setNewStakeholder({
                                          name: stakeholder.name,
                                          role: stakeholder.role,
                                          influence: stakeholder.influence,
                                          interest: stakeholder.interest,
                                          raci: stakeholder.raci,
                                        });
                                        setShowStakeholderModal(true);
                                      }}
                                      className="p-2 hover:bg-indigo-50 rounded-lg text-indigo-600 transition-colors"
                                      title="Edit stakeholder"
                                    >
                                      <i className="ri-edit-line text-lg"></i>
                                    </button>
                                    <button
                                      onClick={() => setDeleteStakeholderId(stakeholder.id)}
                                      className="p-2 hover:bg-red-50 rounded-lg text-red-600 transition-colors"
                                      title="Delete stakeholder"
                                    >
                                      <i className="ri-delete-bin-line text-lg"></i>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Strategy Legend */}
                  <div className="bg-gradient-to-br from-slate-50 to-gray-50 rounded-xl border border-gray-200 p-6">
                    <h4 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <i className="ri-information-line text-indigo-600"></i>
                      Engagement Strategy Guide
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-white rounded-lg border border-red-200 p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                          <div className="font-bold text-sm text-gray-900">Manage Closely</div>
                        </div>
                        <div className="text-xs text-gray-600">
                          High influence, high interest. Engage actively and ensure satisfaction.
                        </div>
                      </div>
                      <div className="bg-white rounded-lg border border-orange-200 p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                          <div className="font-bold text-sm text-gray-900">Keep Satisfied</div>
                        </div>
                        <div className="text-xs text-gray-600">
                          High influence, lower interest. Keep satisfied but don't overwhelm.
                        </div>
                      </div>
                      <div className="bg-white rounded-lg border border-blue-200 p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                          <div className="font-bold text-sm text-gray-900">Keep Informed</div>
                        </div>
                        <div className="text-xs text-gray-600">
                          Lower influence, high interest. Keep adequately informed.
                        </div>
                      </div>
                      <div className="bg-white rounded-lg border border-gray-200 p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-3 h-3 bg-gray-500 rounded-full"></div>
                          <div className="font-bold text-sm text-gray-900">Monitor</div>
                        </div>
                        <div className="text-xs text-gray-600">
                          Lower influence and interest. Monitor with minimal effort.
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Add/Edit Stakeholder Modal */}
          {showStakeholderModal && (
            <>
              <div className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm"></div>
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                  <div className="sticky top-0 bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-6 rounded-t-2xl">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                          <i className="ri-user-add-line text-2xl"></i>
                        </div>
                        <div>
                          <h2 className="text-xl font-bold">
                            {editingStakeholder ? 'Edit Stakeholder' : 'Add New Stakeholder'}
                          </h2>
                          <p className="text-sm text-indigo-100 mt-1">
                            {editingStakeholder ? 'Update stakeholder information' : 'Add a new stakeholder to your project'}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setShowStakeholderModal(false);
                          setEditingStakeholder(null);
                        }}
                        className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                      >
                        <i className="ri-close-line text-2xl"></i>
                      </button>
                    </div>
                  </div>

                  <div className="p-6 space-y-6">
                    {/* Name Field */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-2">
                        Name *
                      </label>
                      <input
                        type="text"
                        value={newStakeholder.name}
                        onChange={(e) => setNewStakeholder({ ...newStakeholder, name: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="e.g., John Smith"
                      />
                    </div>

                    {/* Role Field */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-2">
                        Role *
                      </label>
                      <input
                        type="text"
                        value={newStakeholder.role}
                        onChange={(e) => setNewStakeholder({ ...newStakeholder, role: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="e.g., Project Sponsor, Department Head, End User"
                      />
                    </div>

                    {/* Influence Level */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-3">
                        Influence Level *
                      </label>
                      <div className="grid grid-cols-3 gap-3">
                        {(['low', 'medium', 'high'] as const).map((level) => (
                          <button
                            key={level}
                            onClick={() => setNewStakeholder({ ...newStakeholder, influence: level })}
                            className={`px-4 py-3 rounded-lg border-2 font-semibold transition-all capitalize ${
                              newStakeholder.influence === level
                                ? level === 'high'
                                  ? 'bg-red-100 border-red-500 text-red-700'
                                  : level === 'medium'
                                  ? 'bg-yellow-100 border-yellow-500 text-yellow-700'
                                  : 'bg-green-100 border-green-500 text-green-700'
                                : 'bg-white border-gray-300 text-gray-700 hover:border-gray-400'
                            }`}
                          >
                            {level}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-gray-600 mt-2">
                        <i className="ri-information-line mr-1"></i>
                        Ability to impact project decisions and outcomes
                      </p>
                    </div>

                    {/* Interest Level */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-3">
                        Interest Level *
                      </label>
                      <div className="grid grid-cols-3 gap-3">
                        {(['low', 'medium', 'high'] as const).map((level) => (
                          <button
                            key={level}
                            onClick={() => setNewStakeholder({ ...newStakeholder, interest: level })}
                            className={`px-4 py-3 rounded-lg border-2 font-semibold transition-all capitalize ${
                              newStakeholder.interest === level
                                ? level === 'high'
                                  ? 'bg-purple-100 border-purple-500 text-purple-700'
                                  : level === 'medium'
                                  ? 'bg-blue-100 border-blue-500 text-blue-700'
                                  : 'bg-gray-100 border-gray-500 text-gray-700'
                                : 'bg-white border-gray-300 text-gray-700 hover:border-gray-400'
                            }`}
                          >
                            {level}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-gray-600 mt-2">
                        <i className="ri-information-line mr-1"></i>
                        Level of concern about project outcomes
                      </p>
                    </div>

                    {/* RACI Role */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-3">
                        RACI Role *
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { value: 'responsible', label: 'Responsible', desc: 'Does the work', color: 'indigo' },
                          { value: 'accountable', label: 'Accountable', desc: 'Owns the outcome', color: 'purple' },
                          { value: 'consulted', label: 'Consulted', desc: 'Provides input', color: 'teal' },
                          { value: 'informed', label: 'Informed', desc: 'Kept updated', color: 'gray' },
                        ].map((role) => (
                          <button
                            key={role.value}
                            onClick={() => setNewStakeholder({ ...newStakeholder, raci: role.value as any })}
                            className={`px-4 py-3 rounded-lg border-2 text-left transition-all ${
                              newStakeholder.raci === role.value
                                ? `bg-${role.color}-100 border-${role.color}-500 text-${role.color}-700`
                                : 'bg-white border-gray-300 text-gray-700 hover:border-gray-400'
                            }`}
                          >
                            <div className="font-bold text-sm">{role.label}</div>
                            <div className="text-xs opacity-75 mt-1">{role.desc}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Engagement Strategy Preview */}
                    {newStakeholder.influence && newStakeholder.interest && (
                      <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl border border-indigo-200 p-4">
                        <div className="flex items-start gap-3">
                          <i className="ri-lightbulb-line text-indigo-600 text-xl mt-0.5"></i>
                          <div className="flex-1">
                            <div className="font-semibold text-gray-900 mb-1">
                              Recommended Strategy: {
                                newStakeholder.influence === 'high' && newStakeholder.interest === 'high' ? 'Manage Closely' :
                                newStakeholder.influence === 'high'
                                ? 'Keep Satisfied'
                                : newStakeholder.interest === 'high'
                                ? 'Keep Informed'
                                : 'Monitor'
                              }
                            </div>
                            <div className="text-sm text-gray-700">
                              {newStakeholder.influence === 'high' && newStakeholder.interest === 'high' 
                                ? 'Engage actively with regular updates and involve in key decisions.'
                                : newStakeholder.influence === 'high'
                                ? 'Keep satisfied with periodic updates but avoid overwhelming with details.'
                                : newStakeholder.interest === 'high'
                                ? 'Keep adequately informed with regular communications.'
                                : 'Monitor with minimal effort and occasional updates.'}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-3 pt-4 border-t border-gray-200">
                      <button
                        onClick={() => {
                          setShowStakeholderModal(false);
                          setEditingStakeholder(null);
                        }}
                        className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition-colors whitespace-nowrap"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          if (editingStakeholder) {
                            // Update existing stakeholder
                            setStakeholders(prev => 
                              prev.map(s => s.id === editingStakeholder.id 
                                ? {
                                    ...s,
                                    name: newStakeholder.name || s.name,
                                    role: newStakeholder.role || s.role,
                                    influence: newStakeholder.influence || s.influence,
                                    interest: newStakeholder.interest || s.interest,
                                    raci: newStakeholder.raci || s.raci,
                                  }
                                : s
                              )
                            );
                            setShowStakeholderModal(false);
                            setEditingStakeholder(null);
                            
                            // Auto-save
                            setTimeout(async () => {
                              const saved = await saveDefinePhaseData();
                              if (saved) {
                                showToast('Stakeholder updated successfully!', 'success');
                              }
                            }, 100);
                          } else {
                            // Add new stakeholder
                            handleAddStakeholder();
                          }
                        }}
                        disabled={!newStakeholder.name?.trim() || !newStakeholder.role?.trim()}
                        className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 whitespace-nowrap"
                      >
                        <i className={`${editingStakeholder ? 'ri-save-line' : 'ri-user-add-line'} text-lg`}></i>
                        {editingStakeholder ? 'Update Stakeholder' : 'Add Stakeholder'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* CTQ Tree Panel */}
          {activePanel === 'ctq' && (
            <div className="space-y-6">
              {/* Header with Add CTQ Button */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900">CTQ Tree</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Critical to-Quality metrics hierarchy with baseline, current, and target values
                  </p>
                </div>
                <button
                  onClick={() => setShowAddCTQModal(true)}
                  className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors flex items-center gap-2 whitespace-nowrap"
                >
                  <i className="ri-add-line text-lg"></i>
                  Add CTQ Node
                </button>
              </div>

              {ctqTree.length === 0 ? (
                // Empty State
                <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
                  <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i className="ri-node-tree text-4xl text-gray-400"></i>
                  </div>
                  <h4 className="text-xl font-bold text-gray-900 mb-2">No CTQ Metrics Yet</h4>
                  <p className="text-gray-600 mb-6 max-w-md mx-auto">
                    Start building your Critical to-Quality tree by adding KPIs and metrics that are essential to project success.
                  </p>
                  <button
                    onClick={() => setShowAddCTQModal(true)}
                    className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors inline-flex items-center gap-2 whitespace-nowrap"
                  >
                    <i className="ri-add-line text-lg"></i>
                    Add Your First CTQ Node
                  </button>
                </div>
              ) : (
                <>
                  {/* CTQ Tree Summary Stats */}
                  <div className="grid grid-cols-4 gap-4">
                    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl border border-indigo-200 p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center">
                          <i className="ri-node-tree text-white text-2xl"></i>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-gray-900">
                            {ctqTree.reduce((sum, node) => sum + (node.children?.length || 0), 0)}
                          </div>
                          <div className="text-xs text-gray-600">Total Metrics</div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border border-green-200 p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-green-600 rounded-xl flex items-center justify-center">
                          <i className="ri-checkbox-circle-line text-white text-2xl"></i>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-gray-900">
                            {ctqTree.reduce((sum, node) => {
                              return sum + (node.children?.filter((c: any) => c.variance <= 5).length || 0);
                            }, 0)}
                          </div>
                          <div className="text-xs text-gray-600">Healthy</div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-gradient-to-br from-yellow-50 to-amber-50 rounded-xl border border-yellow-200 p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-yellow-600 rounded-xl flex items-center justify-center">
                          <i className="ri-error-warning-line text-white text-2xl"></i>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-gray-900">
                            {ctqTree.reduce((sum, node) => {
                              return sum + (node.children?.filter((c: any) => c.variance > 5 && c.variance <= 15).length || 0);
                            }, 0)}
                          </div>
                          <div className="text-xs text-gray-600">At Risk</div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-gradient-to-br from-red-50 to-rose-50 rounded-xl border border-red-200 p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-red-600 rounded-xl flex items-center justify-center">
                          <i className="ri-alert-line text-white text-2xl"></i>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-gray-900">
                            {ctqTree.reduce((sum, node) => {
                              return sum + (node.children?.filter((c: any) => c.variance > 15).length || 0);
                            }, 0)}
                          </div>
                          <div className="text-xs text-gray-600">Critical</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Hierarchical CTQ Tree View */}
                  <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <i className="ri-organization-chart text-indigo-600"></i>
                      Hierarchical CTQ Tree
                    </h4>
                    <div className="space-y-4">
                      {ctqTree.map((node, idx) => (
                        <CTQNode key={idx} node={node} level={0} />
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Add CTQ Node Modal */}
              {showAddCTQModal && (
                <>
                  <div className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm"></div>
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                      <div className="sticky top-0 bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-6 rounded-t-2xl">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                              <i className="ri-add-circle-line text-2xl"></i>
                            </div>
                            <div>
                              <h2 className="text-xl font-bold">Add CTQ Node</h2>
                              <p className="text-sm text-indigo-100 mt-1">
                                Create a new Critical to-Quality metric
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              setShowAddCTQModal(false);
                              setNewCTQ({
                                name: '',
                                description: '',
                                target_value: '',
                                unit: '',
                                category: 'CTQ',
                              });
                            }}
                            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                          >
                            <i className="ri-close-line text-2xl"></i>
                          </button>
                        </div>
                      </div>

                      <div className="p-6 space-y-6">
                        {/* Name Field */}
                        <div>
                          <label className="block text-sm font-semibold text-gray-900 mb-2">
                            CTQ Name *
                          </label>
                          <input
                            type="text"
                            value={newCTQ.name}
                            onChange={(e) => setNewCTQ({ ...newCTQ, name: e.target.value })}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            placeholder="e.g., Patient Wait Time, Defect Rate, Customer Satisfaction"
                          />
                        </div>

                        {/* Description Field */}
                        <div>
                          <label className="block text-sm font-semibold text-gray-900 mb-2">
                            Description
                          </label>
                          <textarea
                            value={newCTQ.description}
                            onChange={(e) => setNewCTQ({ ...newCTQ, description: e.target.value })}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            rows={3}
                            placeholder="Describe what this metric measures and why it's critical"
                          />
                        </div>

                        {/* Target Value and Unit */}
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-semibold text-gray-900 mb-2">
                              Target Value *
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              value={newCTQ.target_value}
                              onChange={(e) => setNewCTQ({ ...newCTQ, target_value: e.target.value })}
                              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                              placeholder="e.g., 15"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-semibold text-gray-900 mb-2">
                              Unit
                            </label>
                            <input
                              type="text"
                              value={newCTQ.unit}
                              onChange={(e) => setNewCTQ({ ...newCTQ, unit: e.target.value })}
                              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                              placeholder="e.g., minutes, %, count"
                            />
                          </div>
                        </div>

                        {/* Category Field */}
                        <div>
                          <label className="block text-sm font-semibold text-gray-900 mb-2">
                            Category
                          </label>
                          <select
                            value={newCTQ.category}
                            onChange={(e) => setNewCTQ({ ...newCTQ, category: e.target.value })}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                          >
                            <option value="CTQ">CTQ (Critical to Quality)</option>
                            <option value="CTC">CTC (Critical to Cost)</option>
                            <option value="CTD">CTD (Critical to Delivery)</option>
                            <option value="CTS">CTS (Critical to Safety)</option>
                            <option value="Performance">Performance</option>
                            <option value="Quality">Quality</option>
                            <option value="Efficiency">Efficiency</option>
                            <option value="Customer Satisfaction">Customer Satisfaction</option>
                          </select>
                        </div>

                        {/* Info Box */}
                        <div className="bg-blue-50 rounded-lg border border-blue-200 p-4">
                          <div className="flex items-start gap-3">
                            <i className="ri-information-line text-blue-600 text-xl mt-0.5"></i>
                            <div className="flex-1">
                              <div className="font-semibold text-blue-900 text-sm mb-1">
                                CTQ Metrics
                              </div>
                              <div className="text-sm text-blue-800">
                                Critical to-Quality metrics are key performance indicators that directly impact customer satisfaction and project success. They will be tracked throughout all DMAIC phases.
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-3 pt-4 border-t border-gray-200">
                          <button
                            onClick={() => {
                              setShowAddCTQModal(false);
                              setNewCTQ({
                                name: '',
                                description: '',
                                target_value: '',
                                unit: '',
                                category: 'CTQ',
                              });
                            }}
                            className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition-colors whitespace-nowrap"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleAddCTQNode}
                            disabled={!newCTQ.name?.trim() || !newCTQ.target_value}
                            className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 whitespace-nowrap"
                          >
                            <i className="ri-add-line text-lg"></i>
                            Add CTQ Node
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* KPI Sync Dashboard Panel */}
          {activePanel === 'kpi-sync' && (
            <div className="space-y-6">
              {/* Header */}
              <div>
                <h3 className="text-2xl font-bold text-gray-900">KPI Sync Dashboard</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Monitor KPI/Metric performance with baseline snapshots and financial impact tracking
                </p>
              </div>

              {kpiSyncData.length === 0 ? (
                // Empty State
                <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
                  <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i className="ri-dashboard-line text-4xl text-gray-400"></i>
                  </div>
                  <h4 className="text-xl font-bold text-gray-900 mb-2">No KPIs/Metrics Available</h4>
                  <p className="text-gray-600 mb-6 max-w-md mx-auto">
                    Create KPIs or metrics first to track their performance and sync with Define phase targets.
                  </p>
                  <div className="flex items-center justify-center gap-3">
                    <a
                      href="/dashboard/kpi-manager"
                      className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors inline-flex items-center gap-2 whitespace-nowrap"
                    >
                      <i className="ri-add-line text-lg"></i>
                      Create KPI
                    </a>
                    <a
                      href="/dashboard/metrics"
                      className="px-6 py-3 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition-colors inline-flex items-center gap-2 whitespace-nowrap"
                    >
                      <i className="ri-add-line text-lg"></i>
                      Create Metric
                    </a>
                  </div>
                </div>
              ) : (
                <>
                  {/* KPI/Metric Cards Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {kpiSyncData.map((kpi) => {
                      const statusColor = getStatusColor(kpi.status || 'unknown');
                      const varianceColor = Math.abs(kpi.variance || 0) < 5 
                        ? 'text-green-600' 
                        : Math.abs(kpi.variance || 0) < 15 
                        ? 'text-yellow-600' 
                        : 'text-red-600';

                      return (
                        <div
                          key={kpi.id}
                          className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg transition-all cursor-pointer"
                          onClick={() => loadBaselineSnapshot(kpi.id, kpi.type)}
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <h4 className="font-bold text-gray-900 mb-1">{kpi.name}</h4>
                              {kpi.description && (
                                <p className="text-xs text-gray-600 line-clamp-2">{kpi.description}</p>
                              )}
                            </div>
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${statusColor} capitalize whitespace-nowrap ml-2`}>
                              {kpi.status}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-3 mb-3">
                            <div>
                              <div className="text-xs text-gray-500 mb-1">Current</div>
                              <div className="text-lg font-bold text-gray-900">
                                {kpi.current_value?.toFixed(1) || 0} {kpi.unit}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-500 mb-1">Target</div>
                              <div className="text-lg font-semibold text-indigo-600">
                                {kpi.target_value?.toFixed(1) || 0} {kpi.unit}
                              </div>
                            </div>
                          </div>

                          <div className="pt-3 border-t border-gray-200">
                            <div className="flex items-center justify-between">
                              <div className="text-xs text-gray-600">Variance</div>
                              <div className={`text-sm font-bold ${varianceColor}`}>
                                {kpi.variance > 0 ? '+' : ''}{kpi.variance?.toFixed(1) || 0}%
                              </div>
                            </div>
                          </div>

                          {kpi.category && (
                            <div className="mt-3">
                              <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
                                {kpi.category}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Baseline Snapshot Section */}
                  {baselineSnapshot && (
                    <div className="bg-white rounded-xl border border-gray-200 p-6">
                      <div className="flex items-center justify-between mb-6">
                        <div>
                          <h4 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                            <i className="ri-line-chart-line text-indigo-600"></i>
                            Baseline Snapshot: {baselineSnapshot.metricName}
                          </h4>
                          <p className="text-sm text-gray-600 mt-1">
                            Statistical analysis of last {baselineSnapshot.sampleSize} observations
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            onChange={(e) => {
                              const selectedKPI = kpiSyncData.find(k => k.id === e.target.value);
                              if (selectedKPI) {
                                loadBaselineSnapshot(selectedKPI.id, selectedKPI.type);
                              }
                            }}
                            className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                          >
                            {kpiSyncData.map(kpi => (
                              <option key={kpi.id} value={kpi.id}>
                                {kpi.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Statistical Metrics Grid */}
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
                        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-200 p-4">
                          <div className="text-xs text-gray-600 mb-1">Mean</div>
                          <div className="text-xl font-bold text-gray-900">{baselineSnapshot.mean}</div>
                        </div>

                        <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg border border-purple-200 p-4">
                          <div className="text-xs text-gray-600 mb-1">Std Dev</div>
                          <div className="text-xl font-bold text-gray-900">{baselineSnapshot.stdDev}</div>
                        </div>

                        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border border-green-200 p-4">
                          <div className="text-xs text-gray-600 mb-1">Variance</div>
                          <div className="text-xl font-bold text-gray-900">{baselineSnapshot.variance}</div>
                        </div>

                        <div className="bg-gradient-to-br from-yellow-50 to-amber-50 rounded-lg border border-yellow-200 p-4">
                          <div className="text-xs text-gray-600 mb-1">Sigma Level</div>
                          <div className="text-xl font-bold text-gray-900">{baselineSnapshot.sigmaLevel}σ</div>
                        </div>

                        <div className="bg-gradient-to-br from-red-50 to-rose-50 rounded-lg border border-red-200 p-4">
                          <div className="text-xs text-gray-600 mb-1">DPMO</div>
                          <div className="text-xl font-bold text-gray-900">{baselineSnapshot.dpmo.toLocaleString()}</div>
                        </div>

                        <div className="bg-gradient-to-br from-gray-50 to-slate-50 rounded-lg border border-gray-200 p-4">
                          <div className="text-xs text-gray-600 mb-1">Sample Size</div>
                          <div className="text-xl font-bold text-gray-900">{baselineSnapshot.sampleSize}</div>
                        </div>
                      </div>

                      {/* Trend Sparkline Chart */}
                      <div className="bg-gradient-to-br from-slate-50 to-gray-50 rounded-lg border border-gray-200 p-4">
                        <h5 className="text-sm font-bold text-gray-900 mb-3">Trend Analysis</h5>
                        <ResponsiveContainer width="100%" height={200}>
                          <AreaChart data={baselineSnapshot.trendData}>
                            <defs>
                              <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis 
                              dataKey="date" 
                              tick={{ fontSize: 11, fill: '#6b7280' }}
                              stroke="#9ca3af"
                            />
                            <YAxis 
                              tick={{ fontSize: 11, fill: '#6b7280' }}
                              stroke="#9ca3af"
                            />
                            <Tooltip 
                              contentStyle={{ 
                                backgroundColor: '#fff', 
                                border: '1px solid #e5e7eb',
                                borderRadius: '8px',
                                fontSize: '12px'
                              }}
                            />
                            <Area 
                              type="monotone" 
                              dataKey="value" 
                              stroke="#6366f1" 
                              strokeWidth={2}
                              fillOpacity={1} 
                              fill="url(#colorValue)" 
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* Financial Impact Form */}
                  <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h4 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                          <i className="ri-money-dollar-circle-line text-green-600"></i>
                          Financial Impact
                        </h4>
                        <p className="text-sm text-gray-600 mt-1">
                          Track Cost of Poor Quality (COPQ) and projected savings
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* COPQ */}
                      <div>
                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                          Cost of Poor Quality (COPQ)
                        </label>
                        <div className="relative">
                          <span className="absolute left-4 top-3.5 text-gray-500">$</span>
                          <input
                            type="number"
                            step="1000"
                            value={financialImpact.copq}
                            onChange={(e) => setFinancialImpact({ ...financialImpact, copq: parseFloat(e.target.value) || 0 })}
                            className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            placeholder="0"
                          />
                        </div>
                        <p className="text-xs text-gray-600 mt-1">
                          Annual cost of current quality issues
                        </p>
                      </div>

                      {/* Projected Savings */}
                      <div>
                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                          Projected Savings
                        </label>
                        <div className="relative">
                          <span className="absolute left-4 top-3.5 text-gray-500">$</span>
                          <input
                            type="number"
                            step="1000"
                            value={financialImpact.projectedSavings}
                            onChange={(e) => setFinancialImpact({ ...financialImpact, projectedSavings: parseFloat(e.target.value) || 0 })}
                            className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            placeholder="0"
                          />
                        </div>
                        <p className="text-xs text-gray-600 mt-1">
                          Expected annual savings from improvements
                        </p>
                      </div>

                      {/* ROI */}
                      <div>
                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                          Return on Investment (ROI)
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            step="1"
                            value={financialImpact.roi}
                            onChange={(e) => setFinancialImpact({ ...financialImpact, roi: parseFloat(e.target.value) || 0 })}
                            className="w-full pr-10 pl-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            placeholder="0"
                          />
                          <span className="absolute right-4 top-3.5 text-gray-500">%</span>
                        </div>
                        <p className="text-xs text-gray-600 mt-1">
                          Expected return percentage
                        </p>
                      </div>

                      {/* Payback Period */}
                      <div>
                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                          Payback Period
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            step="0.1"
                            value={financialImpact.paybackPeriod}
                            onChange={(e) => setFinancialImpact({ ...financialImpact, paybackPeriod: parseFloat(e.target.value) || 0 })}
                            className="w-full pr-20 pl-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            placeholder="0"
                          />
                          <span className="absolute right-4 top-3.5 text-gray-500">months</span>
                        </div>
                        <p className="text-xs text-gray-600 mt-1">
                          Time to recover investment
                        </p>
                      </div>
                    </div>

                    {/* Financial Summary */}
                    {(financialImpact.copq > 0 || financialImpact.projectedSavings > 0) && (
                      <div className="mt-6 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border border-green-200 p-4">
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <div className="text-xs text-gray-600 mb-1">COPQ</div>
                            <div className="text-lg font-bold text-red-600">
                              ${financialImpact.copq.toLocaleString()}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-600 mb-1">Projected Savings</div>
                            <div className="text-lg font-bold text-green-600">
                              ${financialImpact.projectedSavings.toLocaleString()}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-600 mb-1">Net Benefit</div>
                            <div className="text-lg font-bold text-indigo-600">
                              ${(financialImpact.projectedSavings - (financialImpact.copq * 0.1)).toLocaleString()}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Save Button */}
                    <div className="flex justify-end mt-6 pt-6 border-t border-gray-200">
                      <button
                        onClick={handleSaveFinancialImpact}
                        disabled={savingFinancial}
                        className="px-8 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
                      >
                        {savingFinancial ? (
                          <>
                            <i className="ri-loader-4-line animate-spin"></i>
                            Saving...
                          </>
                        ) : (
                          <>
                            <i className="ri-save-line"></i>
                            Save Financial Impact
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Risk Register Panel */}
          {activePanel === 'risks' && (
            <div className="text-center py-12 text-gray-500">
              <i className="ri-alert-line text-6xl mb-4"></i>
              <p>Risk Register Panel - Coming in next plan</p>
            </div>
          )}

          {/* Governance Panel */}
          {activePanel === 'governance' && (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900">Governance</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    RACI Matrix and Readiness Score tracking for Define Phase
                  </p>
                </div>
                <button
                  onClick={exportGovernanceReport}
                  className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors flex items-center gap-2 whitespace-nowrap"
                >
                  <i className="ri-file-pdf-line text-lg"></i>
                  Export Governance Report
                </button>
              </div>

              {/* Sub-tabs */}
              <div className="bg-white rounded-xl border border-gray-200">
                <div className="border-b border-gray-200">
                  <div className="flex space-x-1 px-6">
                    <button
                      onClick={() => setGovernanceTab('raci')}
                      className={`flex items-center space-x-2 px-6 py-4 font-semibold transition-all whitespace-nowrap ${
                        governanceTab === 'raci'
                          ? 'text-indigo-600 border-b-2 border-indigo-600'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      <i className="ri-organization-chart text-lg"></i>
                      <span>RACI Matrix</span>
                    </button>
                    <button
                      onClick={() => setGovernanceTab('readiness')}
                      className={`flex items-center space-x-2 px-6 py-4 font-semibold transition-all whitespace-nowrap ${
                        governanceTab === 'readiness'
                          ? 'text-indigo-600 border-b-2 border-indigo-600'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      <i className="ri-dashboard-3-line text-lg"></i>
                      <span>Readiness Score</span>
                    </button>
                  </div>
                </div>

                <div className="p-8">
                  {/* RACI Matrix Tab */}
                  {governanceTab === 'raci' && (
                    <div className="space-y-6">
                      {stakeholders.length === 0 ? (
                        // Empty State
                        <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
                          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <i className="ri-organization-chart text-4xl text-gray-400"></i>
                          </div>
                          <h4 className="text-xl font-bold text-gray-900 mb-2">No Stakeholders Available</h4>
                          <p className="text-gray-600 mb-6 max-w-md mx-auto">
                            Add stakeholders first to create RACI assignments for each DMAIC phase.
                          </p>
                          <button
                            onClick={() => setActivePanel('stakeholders')}
                            className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors inline-flex items-center gap-2 whitespace-nowrap"
                          >
                            <i className="ri-user-add-line text-lg"></i>
                            Go to Stakeholders
                          </button>
                        </div>
                      ) : (
                        <>
                          {/* Export Buttons */}
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="text-lg font-bold text-gray-900">RACI Responsibility Matrix</h4>
                              <p className="text-sm text-gray-600 mt-1">
                                Assign roles for each stakeholder across all DMAIC phases
                              </p>
                            </div>
                            <div className="flex items-center gap-3">
                              <button
                                onClick={exportRACIMatrixToPDF}
                                className="px-4 py-2 bg-red-50 text-red-700 rounded-lg font-medium hover:bg-red-100 transition-colors flex items-center gap-2 whitespace-nowrap"
                              >
                                <i className="ri-file-pdf-line"></i>
                                Export to PDF
                              </button>
                              <button
                                onClick={exportRACIMatrixToCSV}
                                className="px-4 py-2 bg-green-50 text-green-700 rounded-lg font-medium hover:bg-green-100 transition-colors flex items-center gap-2 whitespace-nowrap"
                              >
                                <i className="ri-file-excel-line"></i>
                                Export to CSV
                              </button>
                            </div>
                          </div>

                          {/* RACI Legend */}
                          <div className="bg-gradient-to-br from-slate-50 to-gray-50 rounded-xl border border-gray-200 p-6">
                            <h5 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                              <i className="ri-information-line text-indigo-600"></i>
                              RACI Roles Legend
                            </h5>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              <div className="bg-white rounded-lg border border-indigo-200 p-4">
                                <div className="flex items-center gap-2 mb-2">
                                  <div className="w-8 h-8 bg-indigo-100 text-indigo-700 border border-indigo-300 rounded-lg flex items-center justify-center font-bold text-sm">
                                    R
                                  </div>
                                  <div className="font-bold text-sm text-gray-900">Responsible</div>
                                </div>
                                <div className="text-xs text-gray-600">
                                  Does the work to complete the task
                                </div>
                              </div>
                              <div className="bg-white rounded-lg border border-purple-200 p-4">
                                <div className="flex items-center gap-2 mb-2">
                                  <div className="w-8 h-8 bg-purple-100 text-purple-700 border border-purple-300 rounded-lg flex items-center justify-center font-bold text-sm">
                                    A
                                  </div>
                                  <div className="font-bold text-sm text-gray-900">Accountable</div>
                                </div>
                                <div className="text-xs text-gray-600">
                                  Ultimately answerable for the outcome
                                </div>
                              </div>
                              <div className="bg-white rounded-lg border border-teal-200 p-4">
                                <div className="flex items-center gap-2 mb-2">
                                  <div className="w-8 h-8 bg-teal-100 text-teal-700 border border-teal-300 rounded-lg flex items-center justify-center font-bold text-sm">
                                    C
                                  </div>
                                  <div className="font-bold text-sm text-gray-900">Consulted</div>
                                </div>
                                <div className="text-xs text-gray-600">
                                  Provides input and expertise
                                </div>
                              </div>
                              <div className="bg-white rounded-lg border border-gray-200 p-4">
                                <div className="flex items-center gap-2 mb-2">
                                  <div className="w-8 h-8 bg-gray-100 text-gray-700 border border-gray-300 rounded-lg flex items-center justify-center font-bold text-sm">
                                    I
                                  </div>
                                  <div className="font-bold text-sm text-gray-900">Informed</div>
                                </div>
                                <div className="text-xs text-gray-600">
                                  Kept updated on progress
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* RACI Matrix Table */}
                          <div id="raci-matrix-table" className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                            <div className="overflow-x-auto">
                              <table className="w-full">
                                <thead className="bg-gradient-to-r from-indigo-50 to-purple-50 border-b-2 border-indigo-200">
                                  <tr>
                                    <th className="px-6 py-4 text-left text-sm font-bold text-gray-900 uppercase tracking-wider w-64">
                                      Stakeholder
                                    </th>
                                    <th className="px-6 py-4 text-left text-sm font-bold text-gray-900 uppercase tracking-wider w-48">
                                      Role
                                    </th>
                                    <th className="px-6 py-4 text-center text-sm font-bold text-gray-900 uppercase tracking-wider">
                                      Define
                                    </th>
                                    <th className="px-6 py-4 text-center text-sm font-bold text-gray-900 uppercase tracking-wider">
                                      Measure
                                    </th>
                                    <th className="px-6 py-4 text-center text-sm font-bold text-gray-900 uppercase tracking-wider">
                                      Analyze
                                    </th>
                                    <th className="px-6 py-4 text-center text-sm font-bold text-gray-900 uppercase tracking-wider">
                                      Improve
                                    </th>
                                    <th className="px-6 py-4 text-center text-sm font-bold text-gray-900 uppercase tracking-wider">
                                      Control
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                  {stakeholders.map((stakeholder) => (
                                    <tr key={stakeholder.id} className="hover:bg-gray-50 transition-colors">
                                      <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                          <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                                            <span className="text-indigo-700 font-bold text-sm">
                                              {stakeholder.name.charAt(0).toUpperCase()}
                                            </span>
                                          </div>
                                          <div className="font-semibold text-gray-900">{stakeholder.name}</div>
                                        </div>
                                      </td>
                                      <td className="px-6 py-4 text-sm text-gray-700">{stakeholder.role}</td>
                                      {(['define', 'measure', 'analyze', 'improve', 'control'] as const).map((phase) => (
                                        <td key={phase} className="px-6 py-4 text-center">
                                          <select
                                            value={getRACIValue(stakeholder.id, phase)}
                                            onChange={(e) => updateRACICell(stakeholder.id, phase, e.target.value as any)}
                                            className={`w-16 h-16 text-center font-bold text-sm border-2 rounded-lg cursor-pointer transition-all hover:shadow-md ${getRACIColor(
                                              getRACIValue(stakeholder.id, phase)
                                            )}`}
                                          >
                                            <option value="">-</option>
                                            <option value="R">R</option>
                                            <option value="A">A</option>
                                            <option value="C">C</option>
                                            <option value="I">I</option>
                                          </select>
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>

                          {/* RACI Validation */}
                          <div className="bg-blue-50 rounded-lg border border-blue-200 p-4">
                            <div className="flex items-start gap-3">
                              <i className="ri-information-line text-blue-600 text-xl mt-0.5"></i>
                              <div className="flex-1">
                                <div className="font-semibold text-blue-900 text-sm mb-1">
                                  RACI Best Practices
                                </div>
                                <ul className="text-sm text-blue-800 space-y-1">
                                  <li>• Each phase should have exactly one Accountable (A) person</li>
                                  <li>• Multiple people can be Responsible (R) for execution</li>
                                  <li>• Consult (C) with experts and stakeholders as needed</li>
                                  <li>• Keep relevant parties Informed (I) of progress</li>
                                </ul>
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Readiness Score Tab */}
                  {governanceTab === 'readiness' && (
                    <div className="space-y-6">
                      {/* Overall Readiness Score Card */}
                      <div className="bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl p-8 text-white shadow-xl">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-lg font-semibold text-indigo-100 mb-2">
                              Overall Define Phase Readiness
                            </h4>
                            <div className="text-6xl font-bold mb-2">
                              {calculateOverallReadiness()}%
                            </div>
                            <p className="text-sm text-indigo-100">
                              {calculateOverallReadiness() >= 80
                                ? '✅ Excellent! Ready to proceed to Measure Phase'
                                : calculateOverallReadiness() >= 60
                                ? '⚠️ Good progress. Complete remaining items to reach 80%+'
                                : '❌ More work needed. Focus on recommendations below'}
                            </p>
                          </div>
                          <div className="w-32 h-32 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                            <i className="ri-shield-check-line text-7xl"></i>
                          </div>
                        </div>
                      </div>

                      {/* Individual Gauge Metrics */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Charter Completeness */}
                        <div className="bg-white rounded-xl border border-gray-200 p-6">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                                <i className="ri-file-text-line text-blue-600 text-2xl"></i>
                              </div>
                              <div>
                                <h5 className="font-bold text-gray-900">Charter Completeness</h5>
                                <p className="text-xs text-gray-600">Project charter fields filled</p>
                              </div>
                            </div>
                            <div className="text-3xl font-bold text-gray-900">
                              {calculateCharterCompleteness()}%
                            </div>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-4">
                            <div
                              className={`h-4 rounded-full transition-all duration-500 ${getReadinessBarColor(
                                calculateCharterCompleteness()
                              )}`}
                              style={{ width: `${calculateCharterCompleteness()}%` }}
                            ></div>
                          </div>
                          <div className="mt-3">
                            <span
                              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${getReadinessColor(
                                calculateCharterCompleteness()
                              )}`}
                            >
                              {calculateCharterCompleteness() >= 80
                                ? 'Excellent'
                                : calculateCharterCompleteness() >= 60
                                ? 'Good'
                                : 'Needs Improvement'}
                            </span>
                          </div>
                        </div>

                        {/* Stakeholder Engagement */}
                        <div className="bg-white rounded-xl border border-gray-200 p-6">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                                <i className="ri-team-line text-purple-600 text-2xl"></i>
                              </div>
                              <div>
                                <h5 className="font-bold text-gray-900">Stakeholder Engagement</h5>
                                <p className="text-xs text-gray-600">Stakeholders and RACI assignments</p>
                              </div>
                            </div>
                            <div className="text-3xl font-bold text-gray-900">
                              {calculateStakeholderEngagement()}%
                            </div>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-4">
                            <div
                              className={`h-4 rounded-full transition-all duration-500 ${getReadinessBarColor(
                                calculateStakeholderEngagement()
                              )}`}
                              style={{ width: `${calculateStakeholderEngagement()}%` }}
                            ></div>
                          </div>
                          <div className="mt-3">
                            <span
                              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${getReadinessColor(
                                calculateStakeholderEngagement()
                              )}`}
                            >
                              {calculateStakeholderEngagement() >= 80
                                ? 'Excellent'
                                : calculateStakeholderEngagement() >= 60
                                ? 'Good'
                                : 'Needs Improvement'}
                            </span>
                          </div>
                        </div>

                        {/* Risk Mitigation */}
                        <div className="bg-white rounded-xl border border-gray-200 p-6">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
                                <i className="ri-alert-line text-orange-600 text-2xl"></i>
                              </div>
                              <div>
                                <h5 className="font-bold text-gray-900">Risk Mitigation</h5>
                                <p className="text-xs text-gray-600">Risks with mitigation and owners</p>
                              </div>
                            </div>
                            <div className="text-3xl font-bold text-gray-900">
                              {calculateRiskMitigation()}%
                            </div>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-4">
                            <div
                              className={`h-4 rounded-full transition-all duration-500 ${getReadinessBarColor(
                                calculateRiskMitigation()
                              )}`}
                              style={{ width: `${calculateRiskMitigation()}%` }}
                            ></div>
                          </div>
                          <div className="mt-3">
                            <span
                              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${getReadinessColor(
                                calculateRiskMitigation()
                              )}`}
                            >
                              {calculateRiskMitigation() >= 80
                                ? 'Excellent'
                                : calculateRiskMitigation() >= 60
                                ? 'Good'
                                : 'Needs Improvement'}
                            </span>
                          </div>
                        </div>

                        {/* CTQ Alignment */}
                        <div className="bg-white rounded-xl border border-gray-200 p-6">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <div className="w-12 h-12 bg-teal-100 rounded-xl flex items-center justify-center">
                                <i className="ri-node-tree text-teal-600 text-2xl"></i>
                              </div>
                              <div>
                                <h5 className="font-bold text-gray-900">CTQ Alignment</h5>
                                <p className="text-xs text-gray-600">Metrics with targets and baselines</p>
                              </div>
                            </div>
                            <div className="text-3xl font-bold text-gray-900">
                              {calculateCTQAlignment()}%
                            </div>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-4">
                            <div
                              className={`h-4 rounded-full transition-all duration-500 ${getReadinessBarColor(
                                calculateCTQAlignment()
                              )}`}
                              style={{ width: `${calculateCTQAlignment()}%` }}
                            ></div>
                          </div>
                          <div className="mt-3">
                            <span
                              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${getReadinessColor(
                                calculateCTQAlignment()
                              )}`}
                            >
                              {calculateCTQAlignment() >= 80
                                ? 'Excellent'
                                : calculateCTQAlignment() >= 60
                                ? 'Good'
                                : 'Needs Improvement'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Recommendations List */}
                      <div className="bg-white rounded-xl border border-gray-200 p-6">
                        <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                          <i className="ri-lightbulb-line text-yellow-600"></i>
                          Recommendations to Improve Readiness
                        </h4>
                        <div className="space-y-3">
                          {getReadinessRecommendations().map((recommendation, idx) => (
                            <div
                              key={idx}
                              className="flex items-start gap-3 p-4 bg-gradient-to-r from-yellow-50 to-amber-50 rounded-lg border border-yellow-200"
                            >
                              <div className="w-6 h-6 bg-yellow-600 text-white rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm">
                                {idx + 1}
                              </div>
                              <p className="text-sm text-gray-800 flex-1">{recommendation}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Readiness Summary */}
                      <div className="bg-gradient-to-br from-slate-50 to-gray-50 rounded-xl border border-gray-200 p-6">
                        <h4 className="text-lg font-bold text-gray-900 mb-4">Readiness Summary</h4>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                          <div className="text-center">
                            <div className="text-2xl font-bold text-blue-600 mb-1">
                              {calculateCharterCompleteness()}%
                            </div>
                            <div className="text-xs text-gray-600">Charter</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-purple-600 mb-1">
                              {calculateStakeholderEngagement()}%
                            </div>
                            <div className="text-xs text-gray-600">Stakeholders</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-orange-600 mb-1">
                              {calculateRiskMitigation()}%
                            </div>
                            <div className="text-xs text-gray-600">Risks</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-teal-600 mb-1">
                              {calculateCTQAlignment()}%
                            </div>
                            <div className="text-xs text-gray-600">CTQ</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-indigo-600 mb-1">
                              {calculateOverallReadiness()}%
                            </div>
                            <div className="text-xs text-gray-600">Overall</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Phase Completion Modal */}
      {showCompletionModal && (
        <>
          <div className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm"></div>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-6 rounded-t-2xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                      <i className="ri-checkbox-circle-line text-3xl"></i>
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold">
                        Complete Define Phase
                      </h2>
                      <p className="text-sm text-indigo-100 mt-1">
                        Review completion status and proceed to Measure Phase
                      </p>
                    </div>
                  </div>
                  {!completingPhase && (
                    <button
                      onClick={() => setShowCompletionModal(false)}
                      className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                    >
                      <i className="ri-close-line text-2xl"></i>
                    </button>
                  )}
                </div>
              </div>

              <div className="p-6">
                {validationErrors.length > 0 ? (
                  // Validation Errors View
                  <div className="space-y-6">
                    <div className="bg-red-50 rounded-xl border-2 border-red-200 p-6">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center flex-shrink-0">
                          <i className="ri-error-warning-line text-white text-2xl"></i>
                        </div>
                        <div className="flex-1">
                          <h3 className="text-lg font-bold text-red-900 mb-2">
                            Phase Completion Requirements Not Met
                          </h3>
                          <p className="text-sm text-red-700 mb-4">
                            Please complete the following requirements before
                            proceeding:
                          </p>
                          <ul className="space-y-2">
                            {validationErrors.map((error, idx) => (
                              <li
                                key={idx}
                                className="flex items-start gap-2 text-sm text-red-800"
                              >
                                <i className="ri-close-circle-line text-red-600 mt-0.5"></i>
                                <span>{error}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => setShowCompletionModal(false)}
                        className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors whitespace-nowrap"
                      >
                        <i className="ri-arrow-left-line mr-2"></i>
                        Back to Define Phase
                      </button>
                    </div>
                  </div>
                ) : (
                  // Success View - Ready to Complete
                  <div className="space-y-6">
                    {/* Completion Summary */}
                    <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border-2 border-green-200 p-6">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 bg-green-600 rounded-full flex items-center justify-center flex-shrink-0">
                          <i className="ri-checkbox-circle-line text-white text-2xl"></i>
                        </div>
                        <div className="flex-1">
                          <h3 className="text-lg font-bold text-green-900 mb-2">
                            ✅ All Requirements Met!
                          </h3>
                          <p className="text-sm text-green-700">
                            Your Define Phase is complete and ready for
                            transition to Measure Phase.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Completion Checklist */}
                    <div className="bg-white rounded-xl border border-gray-200 p-6">
                      <h3 className="text-lg font-bold text-gray-900 mb-4">
                        Completion Checklist
                      </h3>
                      <div className="space-y-3">
                        <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                          <i className="ri-checkbox-circle-fill text-green-600 text-xl"></i>
                          <div className="flex-1">
                            <div className="font-semibold text-gray-900">
                              Project Charter
                            </div>
                            <div className="text-sm text-gray-600">
                              {calculateCharterCompleteness()}% complete -
                              All required fields filled
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                          <i className="ri-checkbox-circle-fill text-green-600 text-xl"></i>
                          <div className="flex-1">
                            <div className="font-semibold text-gray-900">
                              Stakeholders
                            </div>
                            <div className="text-sm text-gray-600">
                              {stakeholders.length} stakeholder
                              {stakeholders.length !== 1 ? 's' : ''} identified and
                              documented
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                          <i className="ri-checkbox-circle-fill text-green-600 text-xl"></i>
                          <div className="flex-1">
                            <div className="font-semibold text-gray-900">
                              CTQ/KPI Metrics
                            </div>
                            <div className="text-sm text-gray-600">
                              {ctqTree.reduce(
                                (sum, node) => sum + (node.children?.length || 0),
                                0,
                              )}{' '}
                              metric
                              {ctqTree.reduce(
                                (sum, node) => sum + (node.children?.length || 0),
                                0,
                              ) !== 1
                                ? 's'
                                : ''}{' '}
                              linked to project
                            </div>
                          </div>
                        </div>

                        {Object.values(sipocDiagram).reduce(
                          (sum, arr) => sum + arr.length,
                          0,
                        ) > 0 && (
                          <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                            <i className="ri-checkbox-circle-fill text-green-600 text-xl"></i>
                            <div className="flex-1">
                              <div className="font-semibold text-gray-900">
                                SIPOC Diagram
                              </div>
                              <div className="text-sm text-gray-600">
                                {Object.values(sipocDiagram).reduce(
                                  (sum, arr) => sum + arr.length,
                                  0,
                                )}{' '}
                                items documented
                              </div>
                            </div>
                          </div>
                        )}

                        {risks.length > 0 && (
                          <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                            <i className="ri-checkbox-circle-fill text-green-600 text-xl"></i>
                            <div className="flex-1">
                              <div className="font-semibold text-gray-900">
                                Risk Register
                              </div>
                              <div className="text-sm text-gray-600">
                                {risks.length} risk
                                {risks.length !== 1 ? 's' : ''} identified and
                                mitigated
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* What Happens Next */}
                    <div className="bg-blue-50 rounded-xl border border-blue-200 p-6">
                      <h3 className="text-lg font-bold text-gray-900 mb-3">
                        <i className="ri-information-line text-blue-600 mr-2"></i>
                        What Happens Next?
                      </h3>
                      <ul className="space-y-2 text-sm text-gray-700">
                        <li className="flex items-start gap-2">
                          <i className="ri-arrow-right-s-line text-blue-600 mt-0.5"></i>
                          <span>All Define phase data will be saved to the project</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <i className="ri-arrow-right-s-line text-blue-600 mt-0.5"></i>
                          <span>
                            Target values and financial impact will be synced to
                            linked KPIs/Metrics
                          </span>
                        </li>
                        <li className="flex items-start gap-2">
                          <i className="ri-arrow-right-s-line text-blue-600 mt-0.5"></i>
                          <span>
                            Project phase will be updated to <strong>Measure</strong>
                          </span>
                        </li>
                        <li className="flex items-start gap-2">
                          <i className="ri-arrow-right-s-line text-blue-600 mt-0.5"></i>
                          <span>Measure Phase will have access to all Define phase data</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <i className="ri-arrow-right-s-line text-blue-600 mt-0.5"></i>
                          <span>Phase completion will be logged for audit trail</span>
                        </li>
                      </ul>
                    </div>

                    {/* Completion Summary Stats */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
                        <div className="text-3xl font-bold text-indigo-600 mb-1">
                          {calculateDefineCompletion()}%
                        </div>
                        <div className="text-xs text-gray-600">Overall Completion</div>
                      </div>
                      <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
                        <div className="text-3xl font-bold text-purple-600 mb-1">
                          {ctqTree.reduce(
                            (sum, node) => sum + (node.children?.length || 0),
                            0,
                          )}
                        </div>
                        <div className="text-xs text-gray-600">Metrics to Track</div>
                      </div>
                      <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
                        <div className="text-3xl font-bold text-teal-600 mb-1">
                          {stakeholders.length}
                        </div>
                        <div className="text-xs text-gray-600">Stakeholders Engaged</div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3 pt-4 border-t border-gray-200">
                      <button
                        onClick={() => setShowCompletionModal(false)}
                        disabled={completingPhase}
                        className="flex-1 px-6 py-4 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition-colors disabled:opacity-50 whitespace-nowrap"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={executePhaseCompletion}
                        disabled={completingPhase}
                        className="flex-1 px-6 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg font-bold hover:from-indigo-700 hover:to-purple-700 transition-all disabled:opacity-50 shadow-lg hover:shadow-xl flex items-center justify-center gap-2 whitespace-nowrap"
                      >
                        {completingPhase ? (
                          <>
                            <i className="ri-loader-4-line animate-spin text-xl"></i>
                            <span>Completing Phase...</span>
                          </>
                        ) : (
                          <>
                            <i className="ri-check-double-line text-xl"></i>
                            <span>Confirm &amp; Complete Define Phase</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Confirm Dialog for Stakeholder Deletion */}
      <ConfirmDialog
        isOpen={!!deleteStakeholderId}
        title="Remove Stakeholder"
        message={`Are you sure you want to remove ${stakeholders.find(s => s.id === deleteStakeholderId)?.name} from the stakeholder list?`}
        confirmText="Remove"
        cancelText="Cancel"
        confirmVariant="danger"
        onConfirm={() => {
          if (deleteStakeholderId) {
            handleDeleteStakeholder(deleteStakeholderId);
            setDeleteStakeholderId(null);
          }
        }}
        onCancel={() => setDeleteStakeholderId(null)}
      />
    </div>
  );
};