import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { useToast } from '../../hooks/useToast';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { Link } from 'react-router-dom';
import InsightSummary from '../../components/common/InsightSummary';

interface RootCauseAnalysis {
  id: string;
  title: string;
  problem_statement: string;
  analysis_type: string;
  categories: any;
  causes: any;
  root_causes: any;
  action_items: any;
  status: string;
  priority: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  impact_score?: number;
  effort_score?: number;
  tags?: string[];
  team_members?: string[];
  ai_insights?: any;
  risk_assessment?: any;
  financial_impact?: any;
  timeline_data?: any;
}

interface ActionItem {
  id: string;
  title: string;
  description: string;
  assignee: string;
  due_date: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  estimated_hours?: number;
  completion_date?: string;
}

interface FishboneCause {
  id: string;
  category: string;
  title: string;
  description: string;
  impact: number;
  likelihood: number;
  effort_to_fix?: number;
  cost_impact?: number;
  evidence?: string;
  validated?: boolean;
}

interface AIInsight {
  type: 'pattern' | 'recommendation' | 'risk' | 'opportunity';
  title: string;
  description: string;
  confidence: number;
  impact: 'low' | 'medium' | 'high';
  actionable: boolean;
}

interface AnomalyCandidate {
  id: string;
  metric_id: string | null;
  anomaly_type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  detected_at: string;
  value: number;
  expected_value: number | null;
  deviation: number | null;
  confidence_score: number | null;
  status: string;
  metadata: any;
  metric?: { name: string; unit: string };
}

export default function RootCausePage() {
  const { user, organizationId } = useAuth();
  const { showToast } = useToast();
  const [analyses, setAnalyses] = useState<RootCauseAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedAnalysis, setSelectedAnalysis] = useState<RootCauseAnalysis | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [editingAnalysis, setEditingAnalysis] = useState<RootCauseAnalysis | null>(null);
  const [showActionModal, setShowActionModal] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showCollaborationModal, setShowCollaborationModal] = useState(false);
  const [showAIInsights, setShowAIInsights] = useState(false);
  const [aiInsights, setAiInsights] = useState<AIInsight[]>([]);
  const [generatingInsights, setGeneratingInsights] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [analysisToDelete, setAnalysisToDelete] = useState<string | null>(null);
  const [metricsCount, setMetricsCount] = useState(0);
  const [metricsWithDataCount, setMetricsWithDataCount] = useState(0);

  const [anomalyCandidates, setAnomalyCandidates] = useState<AnomalyCandidate[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [dismissedCandidates, setDismissedCandidates] = useState<Set<string>>(new Set());
  const [showAllCandidates, setShowAllCandidates] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    problem_statement: '',
    analysis_type: 'fishbone',
    priority: 'medium',
    tags: [] as string[],
    team_members: [] as string[],
    impact_score: 5,
    effort_score: 5,
    financial_impact: '',
    deadline: ''
  });

  const [newAction, setNewAction] = useState({
    title: '',
    description: '',
    assignee: '',
    due_date: '',
    priority: 'medium' as const,
    estimated_hours: 0
  });

  const [newCause, setNewCause] = useState({
    category: '',
    title: '',
    description: '',
    impact: 3,
    likelihood: 3,
    effort_to_fix: 3,
    cost_impact: 3,
    evidence: ''
  });

  const [newTag, setNewTag] = useState('');
  const [newTeamMember, setNewTeamMember] = useState('');

  // Add missing functions
  const addTag = () => {
    if (!newTag.trim()) return;
    if (!formData.tags.includes(newTag.trim())) {
      setFormData({ 
        ...formData, 
        tags: [...formData.tags, newTag.trim()] 
      });
    }
    setNewTag('');
  };

  const removeTag = (tagToRemove: string) => {
    setFormData({ 
      ...formData, 
      tags: formData.tags.filter(tag => tag !== tagToRemove) 
    });
  };

  const addTeamMember = () => {
    if (!newTeamMember.trim()) return;
    if (!formData.team_members.includes(newTeamMember.trim())) {
      setFormData({ 
        ...formData, 
        team_members: [...formData.team_members, newTeamMember.trim()] 
      });
    }
    setNewTeamMember('');
  };

  const removeTeamMember = (memberToRemove: string) => {
    setFormData({ 
      ...formData, 
      team_members: formData.team_members.filter(member => member !== memberToRemove) 
    });
  };

  // Premium templates for different industries and scenarios
  const analysisTemplates = [
    {
      id: 'manufacturing_defect',
      name: 'Manufacturing Defect Analysis',
      description: 'Template for analyzing production defects and quality issues',
      type: 'fishbone',
      priority: 'high',
      categories: ['Machine', 'Method', 'Material', 'Manpower', 'Measurement', 'Environment'],
      sample_causes: [
        { category: 'Machine', title: 'Equipment malfunction', impact: 4, likelihood: 3 },
        { category: 'Method', title: 'Process deviation', impact: 3, likelihood: 4 },
        { category: 'Material', title: 'Raw material quality', impact: 4, likelihood: 2 }
      ]
    },
    {
      id: 'customer_complaint',
      name: 'Customer Service Issue',
      description: 'Template for analyzing customer complaints and service failures',
      type: '5whys',
      priority: 'medium',
      sample_whys: [
        'Why did the customer complain?',
        'Why was the service delayed?',
        'Why was the process not followed?',
        'Why was training inadequate?',
        'Why was there no oversight?'
      ]
    },
    {
      id: 'financial_loss',
      name: 'Financial Loss Analysis',
      description: 'Template for analyzing revenue loss and cost overruns',
      type: 'pareto',
      priority: 'critical',
      sample_causes: [
        { cause: 'Process inefficiency', frequency: 45, cost: 120000 },
        { cause: 'Resource waste', frequency: 30, cost: 85000 },
        { cause: 'Quality issues', frequency: 20, cost: 65000 }
      ]
    },
    {
      id: 'safety_incident',
      name: 'Safety Incident Analysis',
      description: 'Template for investigating workplace safety incidents',
      type: 'fishbone',
      priority: 'critical',
      categories: ['Personnel', 'Procedures', 'Plant/Equipment', 'Policies', 'Environment', 'Materials']
    },
    {
      id: 'it_system_failure',
      name: 'IT System Failure',
      description: 'Template for analyzing system outages and technical failures',
      type: 'fishbone',
      priority: 'high',
      categories: ['Hardware', 'Software', 'Network', 'Security', 'Process', 'Human Factors']
    }
  ];

  useEffect(() => {
    loadAnalyses();
    checkMetricsStatus();
    loadAnomalyCandidates();
  }, [user, organizationId]);

  const checkMetricsStatus = async () => {
    if (!organizationId) return;

    try {
      // Get total metrics count
      const { count: totalCount } = await supabase
        .from('metrics')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId);

      setMetricsCount(totalCount || 0);

      // Get metrics with data
      const { data: metrics } = await supabase
        .from('metrics')
        .select('id')
        .eq('organization_id', organizationId);

      if (metrics) {
        let countWithData = 0;
        for (const metric of metrics) {
          const { count } = await supabase
            .from('metric_data')
            .select('*', { count: 'exact', head: true })
            .eq('metric_id', metric.id);
          
          if ((count || 0) >= 3) {
            countWithData++;
          }
        }
        setMetricsWithDataCount(countWithData);
      }
    } catch (error) {
      console.error('Error checking metrics status:', error);
    }
  };

  const loadAnalyses = async () => {
    if (!user || !organizationId) return;

    try {
      const { data, error } = await supabase
        .from('root_cause_analyses')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Supabase query error:', error);
        return;
      }

      if (data) setAnalyses(data);
    } catch (error) {
      console.error('Error loading analyses:', error);
    } finally {
      setLoading(false);
    }
  };

  const generatePremiumFishboneData = (template?: any) => {
    const categories = template?.categories || ['People', 'Process', 'Equipment', 'Materials', 'Environment', 'Management'];
    return {
      categories: categories.map((name: string, index: number) => ({
        name,
        color: ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#EF4444'][index % 6],
        causes: template?.sample_causes?.filter((c: any) => c.category === name) || []
      }))
    };
  };

  const generateAdvanced5WhysData = (template?: any) => {
    const questions = template?.sample_whys || [
      'Why did the problem occur?',
      'Why did that happen?',
      'Why did that happen?',
      'Why did that happen?',
      'Why did that happen?'
    ];
    
    return {
      whys: questions.map((question: string, index: number) => ({
        level: index + 1,
        question,
        answer: '',
        evidence: '',
        validation_status: 'pending',
        impact_score: 0,
        confidence: 0
      }))
    };
  };

  const generateAdvancedParetoData = (template?: any) => {
    const defaultCauses = template?.sample_causes || [
      { cause: 'Defective Materials', frequency: 45, percentage: 35, cost: 125000 },
      { cause: 'Machine Malfunction', frequency: 30, percentage: 58, cost: 95000 },
      { cause: 'Operator Error', frequency: 20, percentage: 74, cost: 65000 },
      { cause: 'Poor Training', frequency: 15, percentage: 85, cost: 45000 },
      { cause: 'Environmental Factors', frequency: 10, percentage: 93, cost: 25000 },
      { cause: 'Other', frequency: 9, percentage: 100, cost: 15000 }
    ];
    return { causes: defaultCauses };
  };

  const generateAIInsights = async (analysis: RootCauseAnalysis) => {
    setGeneratingInsights(true);
    
    // Simulate AI analysis with realistic insights
    const insights: AIInsight[] = [
      {
        type: 'pattern',
        title: 'Recurring Pattern Detected',
        description: 'Similar issues have occurred 3 times in the past 6 months, suggesting a systematic problem.',
        confidence: 85,
        impact: 'high',
        actionable: true
      },
      {
        type: 'recommendation',
        title: 'Process Improvement Opportunity',
        description: 'Implementing automated quality checks could prevent 70% of similar issues.',
        confidence: 78,
        impact: 'medium',
        actionable: true
      },
      {
        type: 'risk',
        title: 'Escalation Risk',
        description: 'Without immediate action, this issue could impact customer satisfaction by 15%.',
        confidence: 92,
        impact: 'high',
        actionable: true
      },
      {
        type: 'opportunity',
        title: 'Cost Savings Potential',
        description: 'Addressing root causes could save approximately $50,000 annually.',
        confidence: 73,
        impact: 'medium',
        actionable: true
      }
    ];

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    setAiInsights(insights);
    setGeneratingInsights(false);
  };

  const calculateRiskScore = (causes: FishboneCause[]) => {
    if (!causes || causes.length === 0) return 0;
    const totalRisk = causes.reduce((sum, cause) => sum + (cause.impact * cause.likelihood), 0);
    return Math.round(totalRisk / causes.length);
  };

  const calculateROI = (analysis: RootCauseAnalysis) => {
    const costOfProblem = parseFloat(analysis.financial_impact || '0');
    const estimatedSavings = costOfProblem * 0.7; // Assume 70% reduction
    const implementationCost = analysis.action_items?.reduce((sum: number, item: ActionItem) => 
      sum + (item.estimated_hours || 0) * 50, 0) || 0; // $50/hour estimate
    
    if (implementationCost === 0) return 0;
    return ((estimatedSavings - implementationCost) / implementationCost * 100);
  };

  const getRootCauseNarrative = (analysis: RootCauseAnalysis) => {
    const causes =
      analysis.analysis_type === 'fishbone'
        ? analysis.categories?.flatMap((category: any) => category.causes || []) || []
        : analysis.analysis_type === 'pareto'
          ? analysis.causes?.causes || []
          : analysis.causes?.whys || [];
    const actionItems = analysis.action_items || [];
    const completedActions = actionItems.filter((item: ActionItem) => item.status === 'completed').length;
    const riskScore = analysis.categories
      ? calculateRiskScore(analysis.categories.flatMap((category: any) => category.causes || []))
      : 0;
    const roi = Math.round(calculateROI(analysis));
    const impactScore = analysis.impact_score || 5;
    const effortScore = analysis.effort_score || 5;
    const validatedCauses = causes.filter((cause: any) => cause?.validated || cause?.validation_status === 'validated').length;

    let summary = 'This analysis is still being shaped, so use it as a working investigation rather than a final answer.';
    if (impactScore >= 8 && effortScore <= 4) {
      summary = 'This looks like a high-value improvement opportunity: the problem appears serious, but the estimated effort to address it is still manageable.';
    } else if (impactScore >= 8 && effortScore > 4) {
      summary = 'This issue appears important, but solving it may require a larger cross-functional effort or a phased rollout.';
    } else if (impactScore <= 4 && effortScore <= 4) {
      summary = 'This looks like a contained issue, which makes it a good candidate for a quick corrective action rather than a major transformation project.';
    }

    const driver =
      analysis.analysis_type === 'fishbone'
        ? `You have ${causes.length} suspected causes across ${analysis.categories?.length || 0} categories, with ${validatedCauses} already validated and a current risk score of ${riskScore}/25.`
        : analysis.analysis_type === 'pareto'
          ? `The Pareto view currently tracks ${causes.length} contributing causes, which helps you focus on the few issues likely driving most of the impact.`
          : `The 5 Whys chain currently contains ${causes.length} reasoning steps, which helps show whether the team has drilled down to a concrete root cause yet.`;

    const guidance =
      actionItems.length === 0
        ? 'The next step is to turn the strongest suspected causes into a small action plan so the analysis leads to operational change.'
        : completedActions === actionItems.length
          ? `All ${actionItems.length} action items are marked complete, so the next step is to confirm the problem metric actually improved and then standardize the fix.`
          : roi > 0
            ? `${completedActions} of ${actionItems.length} action items are done. Keep pushing the highest-impact actions first, especially the ones most likely to unlock the estimated ${roi}% return.`
            : `${completedActions} of ${actionItems.length} action items are done. Prioritize actions that reduce risk fastest, even if the financial return is still uncertain.`;

    return { summary, driver, guidance };
  };

  const createFromTemplate = (template: any) => {
    setFormData({
      ...formData,
      title: template.name,
      problem_statement: template.description,
      analysis_type: template.type,
      priority: template.priority
    });
    setShowTemplateModal(false);
    setShowCreateModal(true);
  };

  const handleCreate = async () => {
    if (!user || !formData.title.trim() || !formData.problem_statement.trim()) {
      showToast('Please fill in all required fields (Title and Problem Statement)', 'warning');
      return;
    }

    if (!organizationId) {
      showToast('Please select an organization first', 'warning');
      return;
    }

    setCreating(true);

    try {
      let analysisData: any = {};
      const selectedTemplate = analysisTemplates.find(t => t.name === formData.title);
      
      if (formData.analysis_type === 'fishbone') {
        analysisData = generatePremiumFishboneData(selectedTemplate);
      } else if (formData.analysis_type === '5whys') {
        analysisData = generateAdvanced5WhysData(selectedTemplate);
      } else if (formData.analysis_type === 'pareto') {
        analysisData = generateAdvancedParetoData(selectedTemplate);
      }

      const { data, error } = await supabase.from('root_cause_analyses').insert({
        organization_id: organizationId,
        title: formData.title.trim(),
        problem_statement: formData.problem_statement.trim(),
        analysis_type: formData.analysis_type,
        categories: analysisData.categories || null,
        causes: analysisData.causes || analysisData.whys || null,
        root_causes: [],
        action_items: [],
        status: 'in_progress',
        priority: formData.priority,
        created_by: user.id,
        tags: formData.tags,
        team_members: formData.team_members,
        impact_score: formData.impact_score,
        effort_score: formData.effort_score,
        financial_impact: formData.financial_impact
      }).select();

      if (error) {
        console.error('Error creating analysis:', error);
        showToast(`Failed to create analysis: ${error.message}`, 'error');
        return;
      }

      if (data && data.length > 0) {
        setShowSuccessMessage(true);
        setTimeout(() => setShowSuccessMessage(false), 3000);
        
        setShowCreateModal(false);
        setFormData({
          title: '',
          problem_statement: '',
          analysis_type: 'fishbone',
          priority: 'medium',
          tags: [],
          team_members: [],
          impact_score: 5,
          effort_score: 5,
          financial_impact: '',
          deadline: ''
        });
        
        await loadAnalyses();
        setSelectedAnalysis(data[0]);
        showToast('Premium analysis created successfully!', 'success');
      }
    } catch (error) {
      console.error('Error creating analysis:', error);
      showToast('An unexpected error occurred', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    setAnalysisToDelete(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!analysisToDelete) return;

    try {
      await supabase.from('root_cause_analyses').delete().eq('id', analysisToDelete);
      loadAnalyses();
      if (selectedAnalysis?.id === analysisToDelete) {
        setSelectedAnalysis(null);
      }
      showToast('Analysis deleted successfully', 'success');
    } catch (error) {
      console.error('Error deleting analysis:', error);
      showToast('Failed to delete analysis', 'error');
    } finally {
      setShowDeleteConfirm(false);
      setAnalysisToDelete(null);
    }
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      await supabase
        .from('root_cause_analyses')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id);
      loadAnalyses();
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const handleAddCause = async (category: string) => {
    if (!editingAnalysis || !newCause.title) return;

    const updatedCategories = editingAnalysis.categories.map((cat: any) => {
      if (cat.name === category) {
        return {
          ...cat,
          causes: [...(cat.causes || []), {
            id: Date.now().toString(),
            title: newCause.title,
            description: newCause.description,
            impact: newCause.impact,
            likelihood: newCause.likelihood,
            effort_to_fix: newCause.effort_to_fix,
            cost_impact: newCause.cost_impact,
            evidence: newCause.evidence,
            validated: false
          }]
        };
      }
      return cat;
    });

    try {
      const { error } = await supabase
        .from('root_cause_analyses')
        .update({ 
          categories: updatedCategories,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingAnalysis.id);

      if (!error) {
        const updated = { ...editingAnalysis, categories: updatedCategories };
        setEditingAnalysis(updated);
        setSelectedAnalysis(updated);
        setNewCause({ 
          category: '', 
          title: '', 
          description: '', 
          impact: 3, 
          likelihood: 3,
          effort_to_fix: 3,
          cost_impact: 3,
          evidence: ''
        });
        loadAnalyses();
      }
    } catch (error) {
      console.error('Error adding cause:', error);
    }
  };

  const handleUpdateWhy = async (level: number, answer: string) => {
    if (!editingAnalysis || editingAnalysis.analysis_type !== '5whys') return;

    const updatedWhys = editingAnalysis.causes.whys.map((why: any) => 
      why.level === level ? { ...why, answer } : why
    );

    try {
      const { error } = await supabase
        .from('root_cause_analyses')
        .update({ 
          causes: { whys: updatedWhys },
          updated_at: new Date().toISOString()
        })
        .eq('id', editingAnalysis.id);

      if (!error) {
        const updated = { ...editingAnalysis, causes: { whys: updatedWhys } };
        setEditingAnalysis(updated);
        setSelectedAnalysis(updated);
        loadAnalyses();
      }
    } catch (error) {
      console.error('Error updating why:', error);
    }
  };

  const handleAddActionItem = async () => {
    if (!selectedAnalysis || !newAction.title) return;

    const newActionItem: ActionItem = {
      id: Date.now().toString(),
      title: newAction.title,
      description: newAction.description,
      assignee: newAction.assignee,
      due_date: newAction.due_date,
      status: 'pending',
      priority: newAction.priority,
      estimated_hours: newAction.estimated_hours
    };

    const updatedActionItems = [...(selectedAnalysis.action_items || []), newActionItem];

    try {
      // Update the root_cause_analyses table with the new action item
      const { error: rcaError } = await supabase
        .from('root_cause_analyses')
        .update({ 
          action_items: updatedActionItems,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedAnalysis.id);

      if (rcaError) {
        console.error('Error updating RCA:', rcaError);
        showToast('Failed to add action item', 'error');
        return;
      }

      // Also insert into the action_items table for Action Tracker
      const { error: actionError } = await supabase
        .from('action_items')
        .insert({
          organization_id: organizationId,
          title: newAction.title,
          description: newAction.description,
          assignee: newAction.assignee,
          due_date: newAction.due_date || null,
          status: 'pending',
          priority: newAction.priority,
          source_type: 'root_cause_analysis',
          source_id: selectedAnalysis.id,
          metadata: {
            rca_action_id: newActionItem.id,
            estimated_hours: newAction.estimated_hours
          }
        });

      if (actionError) {
        console.error('Error inserting action item:', actionError);
        // Don't fail the whole operation if action_items insert fails
      }

      const updated = { ...selectedAnalysis, action_items: updatedActionItems };
      setSelectedAnalysis(updated);
      setNewAction({
        title: '',
        description: '',
        assignee: '',
        due_date: '',
        priority: 'medium',
        estimated_hours: 0
      });
      setShowActionModal(false);
      loadAnalyses();
      showToast('Action item added successfully', 'success');
    } catch (error) {
      console.error('Error adding action item:', error);
      showToast('Failed to add action item', 'error');
    }
  };

  const handleUpdateActionStatus = async (actionId: string, status: string) => {
    if (!selectedAnalysis) return;

    const updatedActionItems = selectedAnalysis.action_items.map((action: ActionItem) =>
      action.id === actionId ? { 
        ...action, 
        status,
        completion_date: status === 'completed' ? new Date().toISOString() : undefined
      } : action
    );

    try {
      // Update the root_cause_analyses table
      const { error: rcaError } = await supabase
        .from('root_cause_analyses')
        .update({ 
          action_items: updatedActionItems,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedAnalysis.id);

      if (rcaError) {
        console.error('Error updating RCA:', rcaError);
        showToast('Failed to update action status', 'error');
        return;
      }

      // Also update the action_items table
      const { error: actionError } = await supabase
        .from('action_items')
        .update({
          status,
          completed_at: status === 'completed' ? new Date().toISOString() : null
        })
        .eq('source_id', selectedAnalysis.id)
        .eq('metadata->rca_action_id', actionId);

      if (actionError) {
        console.error('Error updating action item:', actionError);
        // Don't fail the whole operation
      }

      const updated = { ...selectedAnalysis, action_items: updatedActionItems };
      setSelectedAnalysis(updated);
      loadAnalyses();
      showToast('Action status updated successfully', 'success');
    } catch (error) {
      console.error('Error updating action status:', error);
      showToast('Failed to update action status', 'error');
    }
  };

  const exportAdvancedReport = (analysis: RootCauseAnalysis) => {
    const riskScore = analysis.categories ? 
      calculateRiskScore(analysis.categories.flatMap((cat: any) => cat.causes || [])) : 0;
    const roi = calculateROI(analysis);
    
    let reportContent = `ADVANCED ROOT CAUSE ANALYSIS REPORT\n`;
    reportContent += `=========================================\n\n`;
    reportContent += `Analysis Title: ${analysis.title}\n`;
    reportContent += `Problem Statement: ${analysis.problem_statement}\n`;
    reportContent += `Analysis Type: ${analysis.analysis_type.toUpperCase()}\n`;
    reportContent += `Priority: ${analysis.priority.toUpperCase()}\n`;
    reportContent += `Status: ${analysis.status.replace('_', ' ').toUpperCase()}\n`;
    reportContent += `Created: ${new Date(analysis.created_at).toLocaleDateString()}\n`;
    reportContent += `Impact Score: ${analysis.impact_score || 5}/10\n`;
    reportContent += `Effort Score: ${analysis.effort_score || 5}/10\n`;
    reportContent += `Risk Score: ${riskScore}/25\n`;
    reportContent += `Estimated ROI: ${roi.toFixed(1)}%\n\n`;

    if (analysis.tags && analysis.tags.length > 0) {
      reportContent += `Tags: ${analysis.tags.join(', ')}\n`;
    }

    if (analysis.team_members && analysis.team_members.length > 0) {
      reportContent += `Team Members: ${analysis.team_members.join(', ')}\n`;
    }

    reportContent += `\nEXECUTIVE SUMMARY\n`;
    reportContent += `================\n`;
    reportContent += `This analysis identifies key root causes and provides actionable recommendations.\n`;
    reportContent += `Financial Impact: $${analysis.financial_impact || 'Not specified'}\n`;
    reportContent += `Risk Level: ${riskScore < 10 ? 'LOW' : riskScore < 18 ? 'MEDIUM' : 'HIGH'}\n\n`;

    // Add detailed analysis based on type
    if (analysis.analysis_type === 'fishbone' && analysis.categories) {
      reportContent += `FISHBONE ANALYSIS DETAILS\n`;
      reportContent += `========================\n`;
      analysis.categories.forEach((cat: any) => {
        reportContent += `\n${cat.name.toUpperCase()}:\n`;
        if (cat.causes && cat.causes.length > 0) {
          cat.causes.forEach((cause: any) => {
            reportContent += `  • ${cause.title}\n`;
            reportContent += `    Description: ${cause.description}\n`;
            reportContent += `    Impact: ${cause.impact}/5, Likelihood: ${cause.likelihood}/5\n`;
            reportContent += `    Risk Score: ${cause.impact * cause.likelihood}/25\n`;
            if (cause.evidence) {
              reportContent += `    Evidence: ${cause.evidence}\n`;
            }
            reportContent += `\n`;
          });
        } else {
          reportContent += `  No causes identified yet\n\n`;
        }
      });
    }

    // Action items section
    if (analysis.action_items && analysis.action_items.length > 0) {
      reportContent += `ACTION PLAN\n`;
      reportContent += `===========\n`;
      analysis.action_items.forEach((action: ActionItem, index: number) => {
        reportContent += `\n${index + 1}. ${action.title}\n`;
        reportContent += `   Status: ${action.status.replace('_', ' ').toUpperCase()}\n`;
        reportContent += `   Priority: ${action.priority.toUpperCase()}\n`;
        reportContent += `   Assignee: ${action.assignee}\n`;
        reportContent += `   Due Date: ${action.due_date}\n`;
        if (action.estimated_hours) {
          reportContent += `   Estimated Hours: ${action.estimated_hours}\n`;
        }
        reportContent += `   Description: ${action.description}\n`;
      });
    }

    // Recommendations
    reportContent += `\nRECOMMendations\n`;
    reportContent += `===============\n`;
    reportContent += `1. Prioritize high-impact, low-effort solutions first\n`;
    reportContent += `2. Implement monitoring systems to prevent recurrence\n`;
    reportContent += `3. Regular review and update of this analysis\n`;
    reportContent += `4. Share learnings across the organization\n`;

    const blob = new Blob([reportContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `advanced-root-cause-report-${analysis.title.replace(/\s+/g, '-').toLowerCase()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportAnalysis = (analysis: RootCauseAnalysis) => {
    exportAdvancedReport(analysis);
  };

  const generateReport = (analysis: RootCauseAnalysis) => {
    exportAdvancedReport(analysis);
  };

  const filteredAnalyses = analyses.filter(a => {
    if (!a || !a.title || !a.problem_statement) return false;
    
    const matchesSearch = a.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         a.problem_statement.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (a.tags && a.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase())));
    const matchesType = filterType === 'all' || a.analysis_type === filterType;
    const matchesStatus = filterStatus === 'all' || a.status === filterStatus;
    return matchesSearch && matchesType && matchesStatus;
  });

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'fishbone': return 'ri-git-branch-line';
      case '5whys': return 'ri-question-line';
      case 'pareto': return 'ri-bar-chart-grouped-line';
      default: return 'ri-file-list-line';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'fishbone': return 'text-blue-600 bg-blue-50';
      case '5whys': return 'text-purple-600 bg-purple-50';
      case 'pareto': return 'text-teal-600 bg-teal-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'text-red-600 bg-red-50';
      case 'high': return 'text-orange-600 bg-orange-50';
      case 'medium': return 'text-yellow-600 bg-yellow-50';
      case 'low': return 'text-blue-600 bg-blue-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-600 bg-green-50';
      case 'in_progress': return 'text-yellow-600 bg-yellow-50';
      case 'pending': return 'text-gray-600 bg-gray-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getRiskScore = (impact: number, likelihood: number) => {
    return impact * likelihood;
  };

  const getRiskColor = (score: number) => {
    if (score >= 20) return 'text-red-600 bg-red-50';
    if (score >= 12) return 'text-orange-600 bg-orange-50';
    if (score >= 6) return 'text-yellow-600 bg-yellow-50';
    return 'text-green-600 bg-green-50';
  };

  const getEffortImpactColor = (impact: number, effort: number) => {
    if (impact >= 8 && effort <= 3) return 'text-green-600 bg-green-50'; // Quick wins
    if (impact >= 6 && effort <= 6) return 'text-blue-600 bg-blue-50'; // Major projects
    if (impact <= 4 && effort <= 3) return 'text-yellow-600 bg-yellow-50'; // Fill ins
    return 'text-red-600 bg-red-50'; // Thankless tasks
  };

  const loadAnomalyCandidates = async () => {
    if (!organizationId) return;
    setLoadingCandidates(true);
    try {
      const { data, error } = await supabase
        .from('anomalies')
        .select('*, metric:metrics(name, unit)')
        .eq('organization_id', organizationId)
        .in('status', ['new', 'acknowledged'])
        .in('severity', ['critical', 'high', 'medium'])
        .order('detected_at', { ascending: false })
        .limit(20);

      if (!error && data) {
        setAnomalyCandidates(data);
      }
    } catch (err) {
      console.error('Error loading anomaly candidates:', err);
    } finally {
      setLoadingCandidates(false);
    }
  };

  const launchInvestigation = (candidate: AnomalyCandidate) => {
    const metricName = candidate.metric?.name || 'Unknown Metric';
    const unit = candidate.metric?.unit || '';
    const deviationPct = candidate.expected_value && candidate.expected_value !== 0
      ? Math.abs(((candidate.value - candidate.expected_value) / candidate.expected_value) * 100).toFixed(1)
      : null;

    setFormData({
      title: `${candidate.anomaly_type === 'spike' ? 'Spike' : 'Drop'} in ${metricName} — Root Cause Investigation`,
      problem_statement: `An anomaly was detected in "${metricName}" on ${new Date(candidate.detected_at).toLocaleDateString()}. Observed value: ${candidate.value}${unit ? ' ' + unit : ''}${candidate.expected_value !== null ? `, expected: ${candidate.expected_value?.toFixed(2)}${unit ? ' ' + unit : ''}` : ''}${deviationPct ? ` (${deviationPct}% deviation)` : ''}. Severity: ${candidate.severity.toUpperCase()}. Investigate the root cause and define corrective actions.`,
      analysis_type: 'fishbone',
      priority: candidate.severity === 'critical' ? 'critical' : candidate.severity === 'high' ? 'high' : 'medium',
      tags: ['anomaly', candidate.severity, candidate.anomaly_type, metricName.toLowerCase().replace(/\s+/g, '-')],
      team_members: [],
      impact_score: candidate.severity === 'critical' ? 9 : candidate.severity === 'high' ? 7 : 5,
      effort_score: 5,
      financial_impact: '',
      deadline: ''
    });
    setShowCreateModal(true);
  };

  const dismissCandidate = (id: string) => {
    setDismissedCandidates(prev => new Set([...prev, id]));
  };

  const visibleCandidates = anomalyCandidates.filter(c => !dismissedCandidates.has(c.id));
  const displayedCandidates = showAllCandidates ? visibleCandidates : visibleCandidates.slice(0, 3);

  const getCandidateSeverityStyle = (severity: string) => {
    switch (severity) {
      case 'critical': return { border: 'border-red-200', bg: 'bg-red-50', badge: 'bg-red-100 text-red-700', icon: 'text-red-500', dot: 'bg-red-500' };
      case 'high': return { border: 'border-orange-200', bg: 'bg-orange-50', badge: 'bg-orange-100 text-orange-700', icon: 'text-orange-500', dot: 'bg-orange-500' };
      default: return { border: 'border-yellow-200', bg: 'bg-yellow-50', badge: 'bg-yellow-100 text-yellow-700', icon: 'text-yellow-500', dot: 'bg-yellow-500' };
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Success Message */}
      {showSuccessMessage && (
        <div className="fixed top-4 right-4 bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded-lg shadow-lg z-50 flex items-center gap-2">
          <i className="ri-checkbox-circle-line text-lg"></i>
          <span>Premium analysis created successfully!</span>
          <button 
            onClick={() => setShowSuccessMessage(false)}
            className="text-green-700 hover:text-green-900"
          >
            <i className="ri-close-line"></i>
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Premium Root Cause Analysis</h1>
          <p className="text-sm text-gray-600 mt-1">Advanced analytics with AI insights, templates, and collaboration</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowTemplateModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            <i className="ri-file-copy-line"></i>
            Templates
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            <i className="ri-add-line"></i>
            New Analysis
          </button>
        </div>
      </div>

      {/* ── ANOMALY CANDIDATES PANEL ── */}
      {visibleCandidates.length > 0 && (
        <div className="bg-white rounded-xl border border-red-200 shadow-sm overflow-hidden">
          {/* Panel header */}
          <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-red-50 to-orange-50 border-b border-red-100">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-red-100 text-red-600 flex items-center justify-center">
                <i className="ri-radar-line text-lg"></i>
              </div>
              <div>
                <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  Active Anomaly Candidates
                  <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-bold animate-pulse">
                    {visibleCandidates.length}
                  </span>
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">Anomalies detected by the system — click "Investigate" to start a root cause analysis</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                to="/dashboard/anomaly-detection"
                className="text-xs text-red-600 hover:text-red-700 font-medium flex items-center gap-1 whitespace-nowrap"
              >
                <i className="ri-external-link-line"></i>
                View All Anomalies
              </Link>
            </div>
          </div>

          {/* Candidate cards */}
          <div className="divide-y divide-gray-100">
            {displayedCandidates.map((candidate) => {
              const style = getCandidateSeverityStyle(candidate.severity);
              const metricName = candidate.metric?.name || 'Unknown Metric';
              const unit = candidate.metric?.unit || '';
              const deviationPct = candidate.expected_value && candidate.expected_value !== 0
                ? Math.abs(((candidate.value - candidate.expected_value) / candidate.expected_value) * 100).toFixed(1)
                : null;
              const alreadyInvestigated = analyses.some(a =>
                a.problem_statement?.includes(metricName) &&
                a.problem_statement?.includes(new Date(candidate.detected_at).toLocaleDateString())
              );

              return (
                <div key={candidate.id} className={`flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors`}>
                  {/* Severity dot */}
                  <div className="flex-shrink-0 flex flex-col items-center gap-1">
                    <div className={`w-2.5 h-2.5 rounded-full ${style.dot}`}></div>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900 text-sm">{metricName}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${style.badge}`}>
                        {candidate.severity.toUpperCase()}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 capitalize">
                        {candidate.anomaly_type}
                      </span>
                      {candidate.status === 'acknowledged' && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                          Acknowledged
                        </span>
                      )}
                      {alreadyInvestigated && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-700 flex items-center gap-1">
                          <i className="ri-checkbox-circle-line"></i>
                          Investigation started
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-gray-500 flex-wrap">
                      <span>
                        <span className="font-medium text-gray-700">Value:</span> {candidate.value.toFixed(2)}{unit ? ' ' + unit : ''}
                      </span>
                      {candidate.expected_value !== null && (
                        <span>
                          <span className="font-medium text-gray-700">Expected:</span> {candidate.expected_value?.toFixed(2)}{unit ? ' ' + unit : ''}
                        </span>
                      )}
                      {deviationPct && (
                        <span className={candidate.anomaly_type === 'spike' ? 'text-red-600 font-semibold' : 'text-blue-600 font-semibold'}>
                          {candidate.anomaly_type === 'spike' ? '▲' : '▼'} {deviationPct}% deviation
                        </span>
                      )}
                      {candidate.confidence_score !== null && (
                        <span>
                          <span className="font-medium text-gray-700">Confidence:</span> {Math.round(candidate.confidence_score * 100)}%
                        </span>
                      )}
                      <span>
                        <i className="ri-time-line mr-1"></i>
                        {new Date(candidate.detected_at).toLocaleDateString()} {new Date(candidate.detected_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => launchInvestigation(candidate)}
                      className="px-3 py-1.5 bg-teal-600 text-white text-xs font-medium rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <i className="ri-search-eye-line"></i>
                      Investigate
                    </button>
                    <button
                      onClick={() => dismissCandidate(candidate.id)}
                      className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                      title="Dismiss"
                    >
                      <i className="ri-close-line text-sm"></i>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Show more / less */}
          {visibleCandidates.length > 3 && (
            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
              <button
                onClick={() => setShowAllCandidates(v => !v)}
                className="text-xs text-teal-600 hover:text-teal-700 font-medium flex items-center gap-1 cursor-pointer"
              >
                <i className={`ri-arrow-${showAllCandidates ? 'up' : 'down'}-s-line`}></i>
                {showAllCandidates ? 'Show less' : `Show ${visibleCandidates.length - 3} more candidates`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* No active anomalies — subtle hint */}
      {!loadingCandidates && visibleCandidates.length === 0 && anomalyCandidates.length === 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-500">
          <i className="ri-radar-line text-gray-400"></i>
          <span>No active anomaly candidates right now. Run <Link to="/dashboard/anomaly-detection" className="text-teal-600 hover:underline font-medium">Anomaly Detection</Link> to surface issues automatically.</span>
        </div>
      )}

      {/* Warning Banner for Insufficient Data */}
      {metricsCount === 0 ? (
        <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-lg">
          <div className="flex items-start">
            <i className="ri-information-line text-blue-600 text-xl mr-3 mt-0.5"></i>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-blue-900 mb-1">No Metrics Available</h3>
              <p className="text-sm text-blue-800 mb-3">
                Root Cause Analysis works best when connected to your metrics data. Create metrics to track performance and identify issues.
              </p>
              <Link
                to="/dashboard/metrics"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
              >
                <i className="ri-add-line"></i>
                Create Your First Metric
              </Link>
            </div>
          </div>
        </div>
      ) : metricsWithDataCount === 0 ? (
        <div className="bg-orange-50 border-l-4 border-orange-400 p-4 rounded-lg">
          <div className="flex items-start">
            <i className="ri-alert-line text-orange-600 text-xl mr-3 mt-0.5"></i>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-orange-900 mb-1">Add Data to Your Metrics</h3>
              <p className="text-sm text-orange-800 mb-3">
                You have <strong>{metricsCount} {metricsCount === 1 ? 'metric' : 'metrics'}</strong>, but they need data points to enable data-driven root cause analysis. Add at least 3 data points per metric to unlock full analysis capabilities.
              </p>
              <Link
                to="/dashboard/metrics"
                className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700 transition-colors"
              >
                <i className="ri-add-circle-line"></i>
                Add Data Points to Metrics
              </Link>
            </div>
          </div>
        </div>
      ) : metricsWithDataCount < metricsCount ? (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-lg">
          <div className="flex items-start">
            <i className="ri-information-line text-yellow-600 text-xl mr-3 mt-0.5"></i>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-yellow-900 mb-1">Metrics Data Status</h3>
              <p className="text-sm text-yellow-800 mb-2">
                <strong>{metricsWithDataCount}</strong> of <strong>{metricsCount}</strong> metrics have sufficient data (3+ points) for comprehensive analysis.
              </p>
              <Link
                to="/dashboard/metrics"
                className="text-sm text-yellow-900 underline hover:text-yellow-700"
              >
                Add more data points to enable full analysis capabilities →
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {/* Enhanced Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <i className="ri-file-list-3-line text-lg"></i>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{analyses.length}</p>
              <p className="text-sm text-gray-600">Total Analyses</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-50 text-yellow-600 flex items-center justify-center">
              <i className="ri-time-line text-lg"></i>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {analyses.filter(a => a.status === 'in_progress').length}
              </p>
              <p className="text-sm text-gray-600">In Progress</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-50 text-green-600 flex items-center justify-center">
              <i className="ri-checkbox-circle-line text-lg"></i>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {analyses.filter(a => a.status === 'completed').length}
              </p>
              <p className="text-sm text-gray-600">Completed</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
              <i className="ri-alert-line text-lg"></i>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {analyses.filter(a => a.priority === 'critical').length}
              </p>
              <p className="text-sm text-gray-600">Critical</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <i className="ri-brain-line text-lg"></i>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {analyses.reduce((sum, a) => sum + (a.impact_score || 0), 0)}
              </p>
              <p className="text-sm text-gray-600">Impact Points</p>
            </div>
          </div>
        </div>
      </div>

      {/* Advanced Analytics Dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Priority Distribution */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Priority Distribution</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: 'Critical', value: analyses.filter(a => a.priority === 'critical').length, fill: '#EF4444' },
                    { name: 'High', value: analyses.filter(a => a.priority === 'high').length, fill: '#F97316' },
                    { name: 'Medium', value: analyses.filter(a => a.priority === 'medium').length, fill: '#EAB308' },
                    { name: 'Low', value: analyses.filter(a => a.priority === 'low').length, fill: '#3B82F6' }
                  ]}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label
                />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Impact vs Effort Matrix */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Impact vs Effort</h3>
          <div className="space-y-3">
            {['Quick Wins', 'Major Projects', 'Fill Ins', 'Thankless Tasks'].map((category, index) => {
              const colors = ['text-green-600 bg-green-50', 'text-blue-600 bg-blue-50', 'text-yellow-600 bg-yellow-50', 'text-red-600 bg-red-50'];
              let count = 0;
              if (category === 'Quick Wins') count = analyses.filter(a => (a.impact_score || 0) >= 8 && (a.effort_score || 0) <= 3).length;
              if (category === 'Major Projects') count = analyses.filter(a => (a.impact_score || 0) >= 6 && (a.effort_score || 0) <= 6 && !((a.impact_score || 0) >= 8 && (a.effort_score || 0) <= 3)).length;
              if (category === 'Fill Ins') count = analyses.filter(a => (a.impact_score || 0) <= 4 && (a.effort_score || 0) <= 3).length;
              if (category === 'Thankless Tasks') count = analyses.filter(a => !((a.impact_score || 0) >= 8 && (a.effort_score || 0) <= 3) && !((a.impact_score || 0) >= 6 && (a.effort_score || 0) <= 6) && !((a.impact_score || 0) <= 4 && (a.effort_score || 0) <= 3)).length;
              
              return (
                <div key={category} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">{category}</span>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[index]}`}>
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Completion Rate */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Progress Overview</h3>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Completion Rate</span>
                <span className="text-sm font-medium">
                  {analyses.length > 0 ? Math.round((analyses.filter(a => a.status === 'completed').length / analyses.length) * 100) : 0}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-green-600 h-2 rounded-full" 
                  style={{ 
                    width: `${analyses.length > 0 ? (analyses.filter(a => a.status === 'completed').length / analyses.length) * 100 : 0}%` 
                  }}
                ></div>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">In Progress</span>
                <span className="text-sm font-medium">
                  {analyses.length > 0 ? Math.round((analyses.filter(a => a.status === 'in_progress').length / analyses.length) * 100) : 0}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-yellow-600 h-2 rounded-full" 
                  style={{ 
                    width: `${analyses.length > 0 ? (analyses.filter(a => a.status === 'in_progress').length / analyses.length) * 100 : 0}%` 
                  }}
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced Filters */}
      <div className="flex gap-4 flex-wrap">
        <div className="flex-1 relative min-w-64">
          <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
          <input
            type="text"
            placeholder="Search analyses, tags, team members..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
          />
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
        >
          <option value="all">All Types</option>
          <option value="fishbone">Fishbone</option>
          <option value="5whys">5 Whys</option>
          <option value="pareto">Pareto</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
        >
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      {/* Premium Analyses Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredAnalyses.map((analysis) => {
          const riskScore = analysis.categories ? 
            calculateRiskScore(analysis.categories.flatMap((cat: any) => cat.causes || [])) : 0;
          const roi = calculateROI(analysis);
          
          return (
            <div key={analysis.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start gap-3 flex-1">
                  <div className={`w-10 h-10 rounded-lg ${getTypeColor(analysis.analysis_type)} flex items-center justify-center flex-shrink-0`}>
                    <i className={`${getTypeIcon(analysis.analysis_type)} text-lg`}></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900">{analysis.title}</h3>
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">{analysis.problem_statement}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-2">
                  <button
                    onClick={() => {
                      setSelectedAnalysis(analysis);
                      generateAIInsights(analysis);
                      setShowAIInsights(true);
                    }}
                    className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors cursor-pointer flex-shrink-0"
                    title="AI Insights"
                  >
                    <i className="ri-brain-line"></i>
                  </button>
                  <button
                    onClick={() => setSelectedAnalysis(analysis)}
                    className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors cursor-pointer flex-shrink-0"
                    title="View Details"
                  >
                    <i className="ri-eye-line"></i>
                  </button>
                  <button
                    onClick={() => exportAnalysis(analysis)}
                    className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer flex-shrink-0"
                    title="Export Premium Report"
                  >
                    <i className="ri-download-line"></i>
                  </button>
                  <button
                    onClick={() => handleDelete(analysis.id)}
                    className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer flex-shrink-0"
                    title="Delete Analysis"
                  >
                    <i className="ri-delete-bin-line"></i>
                  </button>
                </div>
              </div>

              {/* Premium Metrics */}
              <div className="grid grid-cols-4 gap-3 mb-4">
                <div className="text-center">
                  <div className="text-lg font-bold text-gray-900">{analysis.impact_score || 5}/10</div>
                  <div className="text-xs text-gray-500">Impact Score</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-gray-900">{analysis.effort_score || 5}/10</div>
                  <div className="text-xs text-gray-500">Effort Score</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-gray-900">
                    {analysis.categories ? 
                        calculateRiskScore(analysis.categories.flatMap((cat: any) => cat.causes || [])) 
                        : 0}/25
                  </div>
                  <div className="text-xs text-gray-500">Risk Score</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-gray-900">{roi.toFixed(0)}%</div>
                  <div className="text-xs text-gray-500">ROI</div>
                </div>
              </div>

              {/* Team & Tags */}
              {(analysis.tags?.length > 0 || analysis.team_members?.length > 0) && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {analysis.tags?.map((tag, idx) => (
                    <span key={idx} className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-600">
                      {tag}
                    </span>
                  ))}
                  {analysis.team_members?.map((member, idx) => (
                    <span key={idx} className="px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-600">
                      <i className="ri-user-line mr-1"></i>{member}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 mb-4">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(analysis.priority)} capitalize`}>
                  {analysis.priority}
                </span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(analysis.status)} capitalize`}>
                  {analysis.status.replace('_', ' ')}
                </span>
                <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 capitalize">
                  {analysis.analysis_type === '5whys' ? '5 Whys' : analysis.analysis_type}
                </span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getEffortImpactColor(analysis.impact_score || 5, analysis.effort_score || 5)}`}>
                  {(analysis.impact_score || 0) >= 8 && (analysis.effort_score || 0) <= 3 ? 'Quick Win' : 
                   (analysis.impact_score || 0) >= 6 && (analysis.effort_score || 0) <= 6 ? 'Major' : 
                   (analysis.impact_score || 0) <= 4 && (analysis.effort_score || 0) <= 3 ? 'Fill In' : 'Complex'}
                </span>
                {analysis.action_items && analysis.action_items.length > 0 && (
                  <span className="px-2 py-1 rounded-full text-xs font-medium bg-teal-100 text-teal-600">
                    {analysis.action_items.length} Actions
                  </span>
                )}
              </div>

              {/* Enhanced Analysis Preview */}
              {analysis.analysis_type === 'pareto' && analysis.causes?.causes && (
                <div className="h-32 mb-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analysis.causes.causes.slice(0, 4)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                      <XAxis dataKey="cause" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(value, name) => [`${value}${name === 'cost' ? ' USD' : ''}`, name === 'cost' ? 'Cost Impact' : 'Frequency']} />
                      <Bar dataKey="frequency" fill="#14B8A6" />
                      {analysis.causes.causes[0]?.cost && (
                        <Bar dataKey="cost" fill="#3B82F6" />
                      )}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {analysis.analysis_type === 'fishbone' && analysis.categories && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {analysis.categories.map((cat: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-1">
                      <span
                        className="px-2 py-1 rounded-lg text-xs font-medium"
                        style={{ backgroundColor: `${cat.color}20`, color: cat.color }}
                      >
                        {cat.name}
                      </span>
                      {cat.causes && cat.causes.length > 0 && (
                        <span className="text-xs text-gray-500">
                          ({cat.causes.length})
                          {cat.causes.some((c: any) => c.validated) && (
                            <i className="ri-checkbox-circle-line text-green-500 ml-1" title="Has validated causes"></i>
                          )}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {analysis.analysis_type === '5whys' && analysis.causes?.whys && (
                <div className="space-y-1 mb-4">
                  {analysis.causes.whys.slice(0, 3).map((why: any) => (
                    <div key={why.level} className="flex items-center gap-2 text-xs">
                      <span className="text-gray-500 font-medium">Why {why.level}:</span>
                      <span className="text-gray-600 truncate">
                        {why.answer || 'Not answered yet'}
                      </span>
                      {why.confidence > 0 && (
                        <span className="text-xs text-blue-500">({why.confidence}% confident)</span>
                      )}
                    </div>
                  ))}
                  {analysis.causes.whys.length > 3 && (
                    <div className="text-xs text-gray-500">
                      +{analysis.causes.whys.length - 3} more questions
                    </div>
                  )}
                </div>
              )}

              {/* Financial Impact */}
              {analysis.financial_impact && (
                <div className="bg-yellow-50 rounded-lg p-3 mb-4">
                  <div className="flex items-center gap-2">
                    <i className="ri-money-dollar-circle-line text-yellow-600"></i>
                    <span className="text-sm font-medium text-yellow-800">
                      Financial Impact: ${parseFloat(analysis.financial_impact).toLocaleString()}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                <span className="text-xs text-gray-500">
                  Created {new Date(analysis.created_at).toLocaleDateString()}
                </span>
                <select
                  value={analysis.status}
                  onChange={(e) => handleUpdateStatus(analysis.id, e.target.value)}
                  className="text-xs px-2 py-1 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent cursor-pointer"
                >
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>
          );
        })}
      </div>

      {filteredAnalyses.length === 0 && (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
          <i className="ri-git-branch-line text-4xl text-gray-300 mb-3"></i>
          <p className="text-gray-500">
            {searchTerm || filterType !== 'all' || filterStatus !== 'all'
              ? 'No analyses match your filters'
              : 'No analyses created yet'
            }
          </p>
          {!searchTerm && filterType === 'all' && filterStatus === 'all' && (
            <div className="flex gap-3 justify-center mt-4">
              <button
                onClick={() => setShowTemplateModal(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
              >
                Start with Template
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
              >
                Create from Scratch
              </button>
            </div>
          )}
        </div>
      )}

      {/* Premium Template Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Premium Analysis Templates</h2>
              <button
                onClick={() => setShowTemplateModal(false)}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {analysisTemplates.map((template) => (
                <div key={template.id} className="border border-gray-200 rounded-lg p-6 hover:border-teal-300 transition-colors cursor-pointer group">
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-lg ${getTypeColor(template.type)} flex items-center justify-center flex-shrink-0`}>
                      <i className={`${getTypeIcon(template.type)} text-xl`}></i>
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 mb-2 group-hover:text-teal-600">{template.name}</h3>
                      <p className="text-sm text-gray-600 mb-3">{template.description}</p>
                      
                      <div className="flex items-center gap-2 mb-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(template.priority)} capitalize`}>
                          {template.priority}
                        </span>
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 capitalize">
                          {template.type === '5whys' ? '5 Whys' : template.type}
                        </span>
                      </div>

                      {template.categories && (
                        <div className="mb-4">
                          <p className="text-xs text-gray-500 mb-2">Includes categories:</p>
                          <div className="flex flex-wrap gap-1">
                            {template.categories.slice(0, 3).map((cat, idx) => (
                              <span key={idx} className="px-2 py-1 rounded-lg text-xs bg-blue-50 text-blue-600">
                                {cat}
                              </span>
                            ))}
                            {template.categories.length > 3 && (
                              <span className="px-2 py-1 rounded-lg text-xs bg-gray-50 text-gray-600">
                                +{template.categories.length - 3} more
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      <button
                        onClick={() => createFromTemplate(template)}
                        className="w-full px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm whitespace-nowrap"
                      >
                        Use This Template
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-500">
                  Can't find what you need? <button className="text-teal-600 hover:underline">Request a custom template</button>
                </div>
                <button
                  onClick={() => {
                    setShowTemplateModal(false);
                    setShowCreateModal(true);
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm whitespace-nowrap"
                >
                  Create from Scratch
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Enhanced Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">New Premium Root Cause Analysis</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                disabled={creating}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    disabled={creating}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm disabled:opacity-50"
                    placeholder="Production Quality Issue Analysis"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Problem Statement *</label>
                  <textarea
                    value={formData.problem_statement}
                    onChange={(e) => setFormData({ ...formData, problem_statement: e.target.value })}
                    disabled={creating}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm disabled:opacity-50"
                    placeholder="Describe the specific problem you're analyzing..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Analysis Type</label>
                  <select
                    value={formData.analysis_type}
                    onChange={(e) => setFormData({ ...formData, analysis_type: e.target.value })}
                    disabled={creating}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm disabled:opacity-50"
                  >
                    <option value="fishbone">Fishbone (Ishikawa) Diagram</option>
                    <option value="5whys">5 Whys</option>
                    <option value="pareto">Pareto Analysis</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                    disabled={creating}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm disabled:opacity-50"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Financial Impact ($)</label>
                  <input
                    type="number"
                    value={formData.financial_impact}
                    onChange={(e) => setFormData({ ...formData, financial_impact: e.target.value })}
                    disabled={creating}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm disabled:opacity-50"
                    placeholder="50000"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Impact Score</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="1"
                      max="10"
                      value={formData.impact_score}
                      onChange={(e) => setFormData({ ...formData, impact_score: parseInt(e.target.value) })}
                      disabled={creating}
                      className="flex-1"
                    />
                    <span className="text-sm font-medium text-gray-900 w-8">{formData.impact_score}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">How significant is the impact? (1=Low, 10=High)</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Effort Score</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="1"
                      max="10"
                      value={formData.effort_score}
                      onChange={(e) => setFormData({ ...formData, effort_score: parseInt(e.target.value) })}
                      disabled={creating}
                      className="flex-1"
                    />
                    <span className="text-sm font-medium text-gray-900 w-8">{formData.effort_score}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">How much effort to resolve? (1=Easy, 10=Complex)</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="text"
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                      disabled={creating}
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm disabled:opacity-50"
                      placeholder="quality, production, customer"
                    />
                    <button
                      type="button"
                      onClick={addTag}
                      disabled={creating}
                      className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm whitespace-nowrap disabled:opacity-50"
                    >
                      <i className="ri-add-line"></i>
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {formData.tags.map((tag, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-600">
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeTag(tag)}
                          disabled={creating}
                          className="hover:text-blue-800 disabled:opacity-50"
                        >
                          <i className="ri-close-line"></i>
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Team Members</label>
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="text"
                      value={newTeamMember}
                      onChange={(e) => setNewTeamMember(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTeamMember())}
                      disabled={creating}
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm disabled:opacity-50"
                      placeholder="John Smith, Sarah Johnson"
                    />
                    <button
                      type="button"
                      onClick={addTeamMember}
                      disabled={creating}
                      className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm whitespace-nowrap disabled:opacity-50"
                    >
                      <i className="ri-user-add-line"></i>
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {formData.team_members.map((member, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-600">
                        <i className="ri-user-line"></i>
                        {member}
                        <button
                          type="button"
                          onClick={() => removeTeamMember(member)}
                          disabled={creating}
                          className="hover:text-purple-800 disabled:opacity-50"
                        >
                          <i className="ri-close-line"></i>
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                disabled={creating}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!formData.title.trim() || !formData.problem_statement.trim() || creating}
                className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap flex items-center justify-center gap-2"
              >
                {creating ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Creating Premium Analysis...
                  </>
                ) : (
                  <>
                    <i className="ri-magic-line"></i>
                    Create Premium Analysis
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Insights Modal */}
      {showAIInsights && selectedAnalysis && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center">
                  <i className="ri-brain-line text-lg"></i>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">AI-Powered Insights</h2>
                  <p className="text-sm text-gray-600">{selectedAnalysis.title}</p>
                </div>
              </div>
              <button
                onClick={() => setShowAIInsights(false)}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>

            {generatingInsights ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
                  <p className="text-gray-600">Analyzing patterns and generating insights...</p>
                  <p className="text-sm text-gray-500 mt-1">This may take a few moments</p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Insights Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {aiInsights.map((insight, idx) => (
                    <div key={idx} className="border border-gray-200 rounded-lg p-6">
                      <div className="flex items-start gap-3 mb-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          insight.type === 'pattern' ? 'bg-blue-100 text-blue-600' :
                          insight.type === 'recommendation' ? 'bg-green-100 text-green-600' :
                          insight.type === 'risk' ? 'bg-red-100 text-red-600' :
                          'bg-yellow-100 text-yellow-600'
                        }`}>
                          <i className={`${
                            insight.type === 'pattern' ? 'ri-pulse-line' :
                            insight.type === 'recommendation' ? 'ri-lightbulb-line' :
                            insight.type === 'risk' ? 'ri-alert-line' :
                            'ri-trophy-line'
                          }`}></i>
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-gray-900">{insight.title}</h3>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              insight.impact === 'high' ? 'bg-red-100 text-red-600' :
                              insight.impact === 'medium' ? 'bg-yellow-100 text-yellow-600' :
                              'bg-blue-100 text-blue-600'
                            }`}>
                              {insight.impact} impact
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mb-3">{insight.description}</p>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500">Confidence:</span>
                              <div className="w-16 bg-gray-200 rounded-full h-2">
                                <div 
                                  className="bg-purple-600 h-2 rounded-full" 
                                  style={{ width: `${insight.confidence}%` }}
                                ></div>
                              </div>
                              <span className="text-xs text-gray-600">{insight.confidence}%</span>
                            </div>
                            {insight.actionable && (
                              <span className="text-xs px-2 py-1 rounded-full bg-teal-100 text-teal-600">
                                Actionable
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* AI Recommendations Summary */}
                <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <i className="ri-magic-line text-purple-600"></i>
                    Smart Recommendations
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white rounded-lg p-4">
                      <div className="text-2xl font-bold text-green-600 mb-1">Priority 1</div>
                      <div className="text-sm text-gray-600">Focus on high-impact, validated causes first</div>
                    </div>
                    <div className="bg-white rounded-lg p-4">
                      <div className="text-2xl font-bold text-blue-600 mb-1">Monitor</div>
                      <div className="text-sm text-gray-600">Set up tracking for similar issues</div>
                    </div>
                    <div className="bg-white rounded-lg p-4">
                      <div className="text-2xl font-bold text-purple-600 mb-1">Optimize</div>
                      <div className="text-sm text-gray-600">Implement preventive measures</div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-4 border-t border-gray-200">
                  <button
                    onClick={() => generateAIInsights(selectedAnalysis)}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2 whitespace-nowrap"
                  >
                    <i className="ri-refresh-line"></i>
                    Refresh Insights
                  </button>
                  <button
                    onClick={() => exportAnalysis(selectedAnalysis)}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 whitespace-nowrap"
                  >
                    <i className="ri-download-line"></i>
                    Export with Insights
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Enhanced Detail Modal */}
      {selectedAnalysis && !showAIInsights && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-6xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{selectedAnalysis.title}</h2>
                <p className="text-sm text-gray-600 mt-1">{selectedAnalysis.problem_statement}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    generateAIInsights(selectedAnalysis);
                    setShowAIInsights(true);
                  }}
                  className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2 whitespace-nowrap text-sm"
                >
                  <i className="ri-brain-line"></i>
                  AI Insights
                </button>
                <button
                  onClick={() => setSelectedAnalysis(null)}
                  className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>
            </div>

            {/* Premium Tabs */}
            <div className="flex space-x-1 mb-6 bg-gray-100 rounded-lg p-1">
              {[
                { id: 'overview', label: 'Overview', icon: 'ri-dashboard-line' },
                { id: 'analysis', label: 'Analysis', icon: 'ri-git-branch-line' },
                { id: 'actions', label: 'Actions', icon: 'ri-task-line' },
                { id: 'insights', label: 'Insights', icon: 'ri-brain-line' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 px-4 py-2 rounded-lg flex items-center justify-center gap-2 text-sm font-medium transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'bg-white text-teal-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <i className={tab.icon}></i>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <InsightSummary
                  title="What This Means In Plain English"
                  summary={getRootCauseNarrative(selectedAnalysis).summary}
                  driver={getRootCauseNarrative(selectedAnalysis).driver}
                  guidance={getRootCauseNarrative(selectedAnalysis).guidance}
                />

                {/* Premium Metrics Dashboard */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="bg-blue-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-blue-600">{selectedAnalysis.impact_score || 5}/10</div>
                    <div className="text-sm text-blue-800">Impact Score</div>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-purple-600">{selectedAnalysis.effort_score || 5}/10</div>
                    <div className="text-sm text-purple-800">Effort Score</div>
                  </div>
                  <div className="bg-red-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-red-600">
                      {selectedAnalysis.categories ? 
                        calculateRiskScore(selectedAnalysis.categories.flatMap((cat: any) => cat.causes || [])) 
                        : 0}/25
                      </div>
                    <div className="text-sm text-red-800">Risk Score</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-green-600">{calculateROI(selectedAnalysis).toFixed(0)}%</div>
                    <div className="text-sm text-green-800">Est. ROI</div>
                  </div>
                  <div className="bg-yellow-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-yellow-600">
                      {selectedAnalysis.action_items?.filter((a: any) => a.status === 'completed').length || 0}/
                      {selectedAnalysis.action_items?.length || 0}
                    </div>
                    <div className="text-sm text-yellow-800">Actions Done</div>
                  </div>
                </div>

                {/* Financial Impact */}
                {selectedAnalysis.financial_impact && (
                  <div className="bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
                      <i className="ri-money-dollar-circle-line text-yellow-600"></i>
                      Financial Impact Analysis
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <div className="text-sm text-gray-600">Problem Cost</div>
                        <div className="text-2xl font-bold text-red-600">
                          ${parseFloat(selectedAnalysis.financial_impact).toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-600">Potential Savings</div>
                        <div className="text-2xl font-bold text-green-600">
                          ${Math.round(parseFloat(selectedAnalysis.financial_impact) * 0.7).toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-600">Implementation Cost</div>
                        <div className="text-2xl font-bold text-blue-600">
                          ${(selectedAnalysis.action_items?.reduce((sum: number, item: ActionItem) => 
                            sum + (item.estimated_hours || 0) * 50, 0) || 0).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Team & Tags */}
                {(selectedAnalysis.tags?.length > 0 || selectedAnalysis.team_members?.length > 0) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {selectedAnalysis.tags?.length > 0 && (
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-3">Tags</h3>
                        <div className="flex flex-wrap gap-2">
                          {selectedAnalysis.tags.map((tag, idx) => (
                            <span key={idx} className="px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-600">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {selectedAnalysis.team_members?.length > 0 && (
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-3">Team Members</h3>
                        <div className="space-y-2">
                          {selectedAnalysis.team_members.map((member, idx) => (
                            <div key={idx} className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg">
                              <div className="w-8 h-8 rounded-full bg-purple-200 flex items-center justify-center">
                                <i className="ri-user-line text-purple-600"></i>
                              </div>
                              <span className="text-gray-900 font-medium">{member}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'analysis' && (
              <div>
                <InsightSummary
                  title="How To Read This Analysis"
                  summary={getRootCauseNarrative(selectedAnalysis).summary}
                  driver={getRootCauseNarrative(selectedAnalysis).driver}
                  guidance={getRootCauseNarrative(selectedAnalysis).guidance}
                  className="mb-6"
                />

                {/* Enhanced Fishbone Diagram */}
                {selectedAnalysis.analysis_type === 'fishbone' && selectedAnalysis.categories && (
                  <div className="bg-gray-50 rounded-lg p-6">
                    <h3 className="font-semibold text-gray-900 mb-4">Enhanced Fishbone Analysis</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {selectedAnalysis.categories.map((cat: any, idx: number) => (
                        <div
                          key={idx}
                          className="bg-white rounded-lg p-4 border-2"
                          style={{ borderColor: cat.color }}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-4 h-4 rounded-full"
                                style={{ backgroundColor: cat.color }}
                              ></div>
                              <span className="font-medium text-gray-900">{cat.name}</span>
                            </div>
                            <span className="text-xs text-gray-500">
                              {cat.causes?.length || 0} causes
                            </span>
                          </div>
                          
                          <div className="space-y-3">
                            {cat.causes && cat.causes.length > 0 ? (
                              cat.causes.map((cause: any, causeIdx: number) => (
                                <div key={causeIdx} className="border border-gray-200 rounded-lg p-3">
                                  <div className="flex items-center justify-between mb-2">
                                    <h4 className="font-medium text-gray-900 text-sm">{cause.title}</h4>
                                    {cause.validated && (
                                      <i className="ri-checkbox-circle-line text-green-500" title="Validated"></i>
                                    )}
                                  </div>
                                  <p className="text-xs text-gray-600 mb-2">{cause.description}</p>
                                  
                                  <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div>
                                      <span className="text-gray-500">Impact:</span>
                                      <div className="flex items-center gap-1">
                                        <div className="flex">
                                          {[1,2,3,4,5].map((i) => (
                                            <i key={i} className={`ri-star-${i <= cause.impact ? 'fill' : 'line'} text-yellow-400`}></i>
                                          ))}
                                        </div>
                                        <span>{cause.impact}/5</span>
                                      </div>
                                    </div>
                                    <div>
                                      <span className="text-gray-500">Likelihood:</span>
                                      <div className="flex items-center gap-1">
                                        <div className="flex">
                                          {[1,2,3,4,5].map((i) => (
                                            <i key={i} className={`ri-star-${i <= cause.likelihood ? 'fill' : 'line'} text-blue-400`}></i>
                                          ))}
                                        </div>
                                        <span>{cause.likelihood}/5</span>
                                      </div>
                                    </div>
                                  </div>
                                  
                                  <div className="mt-2">
                                    <div className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${getRiskColor(cause.impact * cause.likelihood)}`}>
                                      Risk: {cause.impact * cause.likelihood}/25
                                    </div>
                                  </div>
                                  
                                  {cause.evidence && (
                                    <div className="mt-2 p-2 bg-blue-50 rounded text-xs">
                                      <span className="text-blue-600 font-medium">Evidence:</span>
                                      <span className="text-blue-800 ml-1">{cause.evidence}</span>
                                    </div>
                                  )}
                                </div>
                              ))
                            ) : (
                              <p className="text-sm text-gray-500 italic">No causes identified yet for this category</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Enhanced 5 Whys */}
                {selectedAnalysis.analysis_type === '5whys' && selectedAnalysis.causes?.whys && (
                  <div className="bg-gray-50 rounded-lg p-6">
                    <h3 className="font-semibold text-gray-900 mb-4">Advanced 5 Whys Analysis</h3>
                    <div className="space-y-4">
                      {selectedAnalysis.causes.whys.map((why: any) => (
                        <div key={why.level} className="bg-white rounded-lg p-4 border-l-4 border-teal-500">
                          <div className="flex items-center gap-4 mb-3">
                            <div className="w-10 h-10 rounded-full bg-teal-100 text-teal-600 flex items-center justify-center text-sm font-bold">
                              {why.level}
                            </div>
                            <div className="flex-1">
                              <h4 className="font-medium text-gray-900">{why.question}</h4>
                              {why.confidence > 0 && (
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-xs text-gray-500">Confidence:</span>
                                  <div className="w-20 bg-gray-200 rounded-full h-1.5">
                                    <div 
                                      className="bg-teal-600 h-1.5 rounded-full" 
                                      style={{ width: `${why.confidence}%` }}
                                    ></div>
                                  </div>
                                  <span className="text-xs text-gray-600">{why.confidence}%</span>
                                </div>
                              )}
                            </div>
                            <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                              why.validation_status === 'validated' ? 'bg-green-100 text-green-600' :
                              why.validation_status === 'needs_validation' ? 'bg-yellow-100 text-yellow-600' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {why.validation_status || 'pending'}
                            </div>
                          </div>
                          
                          <div className="ml-14">
                            <input
                              type="text"
                              defaultValue={why.answer}
                              placeholder="Enter your answer and evidence..."
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm mb-2"
                            />
                            
                            {why.evidence && (
                              <div className="p-2 bg-blue-50 rounded-lg">
                                <span className="text-xs font-medium text-blue-600">Supporting Evidence:</span>
                                <p className="text-xs text-blue-800 mt-1">{why.evidence}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Enhanced Pareto Analysis */}
                {selectedAnalysis.analysis_type === 'pareto' && selectedAnalysis.causes?.causes && (
                  <div className="bg-gray-50 rounded-lg p-6">
                    <h3 className="font-semibold text-gray-900 mb-4">Advanced Pareto Analysis</h3>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div>
                        <h4 className="font-medium text-gray-900 mb-3">Frequency & Cost Analysis</h4>
                        <div className="h-80">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={selectedAnalysis.causes.causes}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                              <XAxis dataKey="cause" tick={{ fontSize: 11 }} angle={-45} textAnchor="end" height={100} />
                              <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                              <Tooltip formatter={(value, name) => [
                                name === 'cost' ? `$${value.toLocaleString()}` : value,
                                name === 'cost' ? 'Cost Impact' : 'Frequency'
                              ]} />
                              <Bar yAxisId="left" dataKey="frequency" fill="#14B8A6" name="frequency" />
                              <Bar yAxisId="right" dataKey="cost" fill="#3B82F6" name="cost" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                      
                      <div>
                        <h4 className="font-medium text-gray-900 mb-3">80/20 Analysis</h4>
                        <div className="bg-white rounded-lg p-4">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-gray-200">
                                <th className="text-left py-2">Cause</th>
                                <th className="text-right py-2">Frequency</th>
                                <th className="text-right py-2">Cost</th>
                                <th className="text-right py-2">Cumulative %</th>
                                <th className="text-center py-2">Priority</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selectedAnalysis.causes.causes.map((cause: any, idx: number) => (
                                <tr key={idx} className="border-b border-gray-100">
                                  <td className="py-2">{cause.cause}</td>
                                  <td className="text-right py-2">{cause.frequency}</td>
                                  <td className="text-right py-2">${cause.cost?.toLocaleString() || 'N/A'}</td>
                                  <td className="text-right py-2">{cause.percentage}%</td>
                                  <td className="text-center py-2">
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                      cause.percentage <= 80 ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
                                    }`}>
                                      {cause.percentage <= 80 ? 'High' : 'Low'}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        
                        <div className="mt-4 p-4 bg-yellow-50 rounded-lg">
                          <h5 className="font-medium text-yellow-800 mb-2">Key Insights:</h5>
                          <ul className="text-sm text-yellow-700 space-y-1">
                            <li>• Top {selectedAnalysis.causes.causes.filter((c: any) => c.percentage <= 80).length} causes account for 80% of issues</li>
                            <li>• Focus efforts on high-frequency, high-cost items first</li>
                            <li>• Monitor low-frequency causes for trend changes</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'actions' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Action Plan</h3>
                  <button
                    onClick={() => setShowActionModal(true)}
                    className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-2 whitespace-nowrap text-sm"
                  >
                    <i className="ri-add-line"></i>
                    Add Action
                  </button>
                </div>

                {selectedAnalysis.action_items && selectedAnalysis.action_items.length > 0 ? (
                  <div className="space-y-4">
                    {selectedAnalysis.action_items.map((action: ActionItem) => (
                      <div key={action.id} className="bg-white border border-gray-200 rounded-lg p-6">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex-1">
                            <h4 className="font-semibold text-gray-900 mb-2">{action.title}</h4>
                            <p className="text-sm text-gray-600 mb-3">{action.description}</p>
                            
                            <div className="flex items-center gap-4 text-sm">
                              <div className="flex items-center gap-2">
                                <i className="ri-user-line text-gray-400"></i>
                                <span>{action.assignee || 'Unassigned'}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <i className="ri-calendar-line text-gray-400"></i>
                                <span>{action.due_date || 'No due date'}</span>
                              </div>
                              {action.estimated_hours > 0 && (
                                <div className="flex items-center gap-2">
                                  <i className="ri-time-line text-gray-400"></i>
                                  <span>{action.estimated_hours}h estimated</span>
                                </div>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${getPriorityColor(action.priority)} capitalize`}>
                              {action.priority}
                            </span>
                            <select
                              value={action.status}
                              onChange={(e) => handleUpdateActionStatus(action.id, e.target.value)}
                              className={`px-3 py-1 rounded-lg text-xs font-medium border-0 cursor-pointer ${getStatusColor(action.status)}`}
                            >
                              <option value="pending">Pending</option>
                              <option value="in_progress">In Progress</option>
                              <option value="completed">Completed</option>
                            </select>
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                          <div className="text-xs text-gray-500">
                            {action.completion_date ? 
                              `Completed on ${new Date(action.completion_date).toLocaleDateString()}` :
                              'Not completed yet'
                            }
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-xs text-gray-500">
                              Est. cost: ${(action.estimated_hours || 0) * 50}
                            </div>
                            <Link
                              to="/dashboard/action-tracker"
                              className="text-xs text-teal-600 hover:text-teal-700 font-medium flex items-center gap-1"
                            >
                              <i className="ri-external-link-line"></i>
                              View in Action Tracker
                            </Link>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 bg-gray-50 rounded-lg">
                    <i className="ri-task-line text-4xl text-gray-300 mb-3"></i>
                    <p className="text-gray-500 mb-4">No action items created yet</p>
                    <button
                      onClick={() => setShowActionModal(true)}
                      className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
                    >
                      Create First Action Item
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'insights' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Premium Insights</h3>
                  <button
                    onClick={() => {
                      generateAIInsights(selectedAnalysis);
                      setShowAIInsights(true);
                    }}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2 whitespace-nowrap text-sm"
                  >
                    <i className="ri-brain-line"></i>
                    Generate AI Insights
                  </button>
                </div>

                {/* Risk Assessment */}
                <div className="bg-gradient-to-r from-red-50 to-orange-50 rounded-lg p-6">
                  <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <i className="ri-shield-check-line text-red-600"></i>
                    Risk Assessment
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-red-600 mb-1">
                        {selectedAnalysis.categories ? 
                          calculateRiskScore(selectedAnalysis.categories.flatMap((cat: any) => cat.causes || [])) 
                          : 0}
                      </div>
                      <div className="text-sm text-red-800">Overall Risk Score</div>
                      <div className="text-xs text-gray-600">(Impact × Likelihood)</div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-orange-600 mb-1">
                        {selectedAnalysis.categories ? 
                          selectedAnalysis.categories.reduce((sum: number, cat: any) => 
                            sum + (cat.causes?.length || 0), 0)
                          : 0
                        }
                      </div>
                      <div className="text-sm text-orange-800">Total Causes</div>
                      <div className="text-xs text-gray-600">Identified Issues</div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-yellow-600 mb-1">
                        {selectedAnalysis.categories ? 
                          selectedAnalysis.categories.reduce((sum: number, cat: any) => 
                            sum + (cat.causes?.filter((c: any) => c.validated).length || 0), 0)
                          : 0
                        }
                      </div>
                      <div className="text-sm text-yellow-800">Validated</div>
                      <div className="text-xs text-gray-600">Confirmed Causes</div>
                    </div>
                  </div>
                </div>

                {/* Impact Matrix */}
                <div className="bg-white rounded-lg p-6 border border-gray-200">
                  <h4 className="text-lg font-semibold text-gray-900 mb-4">Impact vs Effort Matrix</h4>
                  <div className="grid grid-cols-2 gap-4 h-80">
                    <div className="border-2 border-green-200 rounded-lg p-4 bg-green-50">
                      <h5 className="font-medium text-green-800 mb-2">Quick Wins</h5>
                      <p className="text-sm text-green-600">High Impact, Low Effort</p>
                      <div className="text-2xl font-bold text-green-700 mt-2">
                        {(selectedAnalysis.impact_score || 0) >= 8 && (selectedAnalysis.effort_score || 0) <= 3 ? '✓' : '-'}
                      </div>
                    </div>
                    <div className="border-2 border-blue-200 rounded-lg p-4 bg-blue-50">
                      <h5 className="font-medium text-blue-800 mb-2">Major Projects</h5>
                      <p className="text-sm text-blue-600">High Impact, High Effort</p>
                      <div className="text-2xl font-bold text-blue-700 mt-2">
                        {(selectedAnalysis.impact_score || 0) >= 6 && (selectedAnalysis.effort_score || 0) > 6 ? '✓' : '-'}
                      </div>
                    </div>
                    <div className="border-2 border-yellow-200 rounded-lg p-4 bg-yellow-50">
                      <h5 className="font-medium text-yellow-800 mb-2">Fill Ins</h5>
                      <p className="text-sm text-yellow-600">Low Impact, Low Effort</p>
                      <div className="text-2xl font-bold text-yellow-700 mt-2">
                        {(selectedAnalysis.impact_score || 0) <= 4 && (selectedAnalysis.effort_score || 0) <= 3 ? '✓' : '-'}
                      </div>
                    </div>
                    <div className="border-2 border-red-200 rounded-lg p-4 bg-red-50">
                      <h5 className="font-medium text-red-800 mb-2">Thankless Tasks</h5>
                      <p className="text-sm text-red-600">Low Impact, High Effort</p>
                      <div className="text-2xl font-bold text-red-700 mt-2">
                        {(selectedAnalysis.impact_score || 0) <= 4 && (selectedAnalysis.effort_score || 0) > 6 ? '✓' : '-'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Recommendations */}
                <div className="bg-gradient-to-r from-teal-50 to-blue-50 rounded-lg p-6">
                  <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <i className="ri-lightbulb-line text-teal-600"></i>
                    Smart Recommendations
                  </h4>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 p-3 bg-white rounded-lg">
                      <div className="w-6 h-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center flex-shrink-0">
                        <i className="ri-number-1"></i>
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">Address High-Risk Causes First</div>
                        <div className="text-sm text-gray-600">Focus on causes with risk scores above 15 for maximum impact</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 bg-white rounded-lg">
                      <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
                        <i className="ri-number-2"></i>
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">Validate Assumptions</div>
                        <div className="text-sm text-gray-600">Collect evidence for unvalidated causes before taking action</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 bg-white rounded-lg">
                      <div className="w-6 h-6 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center flex-shrink-0">
                        <i className="ri-number-3"></i>
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">Implement Preventive Measures</div>
                        <div className="text-sm text-gray-600">Create monitoring systems to catch similar issues early</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3 mt-6 pt-6 border-t border-gray-200">
              <button
                onClick={() => exportAnalysis(selectedAnalysis)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 whitespace-nowrap"
              >
                <i className="ri-download-line"></i>
                Export Premium Report
              </button>
              <button
                onClick={() => generateReport(selectedAnalysis)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 whitespace-nowrap"
              >
                <i className="ri-file-text-line"></i>
                Generate Report
              </button>
              <button
                onClick={() => setSelectedAnalysis(null)}
                className="ml-auto px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Enhanced Action Modal */}
      {showActionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Add Action Item</h2>
              <button
                onClick={() => setShowActionModal(false)}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input
                  type="text"
                  value={newAction.title}
                  onChange={(e) => setNewAction({ ...newAction, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  placeholder="Implement quality checks"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={newAction.description}
                  onChange={(e) => setNewAction({ ...newAction, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  placeholder="Detailed description of the action to be taken..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Assignee</label>
                  <input
                    type="text"
                    value={newAction.assignee}
                    onChange={(e) => setNewAction({ ...newAction, assignee: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                    placeholder="John Smith"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                  <select
                    value={newAction.priority}
                    onChange={(e) => setNewAction({ ...newAction, priority: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={newAction.due_date}
                    onChange={(e) => setNewAction({ ...newAction, due_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Est. Hours</label>
                  <input
                    type="number"
                    value={newAction.estimated_hours}
                    onChange={(e) => setNewAction({ ...newAction, estimated_hours: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                    placeholder="8"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowActionModal(false)}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                onClick={handleAddActionItem}
                disabled={!newAction.title.trim()}
                className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                Add Action
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete Analysis"
        message="Are you sure you want to delete this analysis? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmDelete}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setAnalysisToDelete(null);
        }}
        variant="danger"
      />
    </div>
  );
}
