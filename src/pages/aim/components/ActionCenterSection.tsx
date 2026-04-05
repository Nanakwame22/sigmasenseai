import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { exportToCSV } from '../../../utils/exportUtils';
import { addToast } from '../../../hooks/useToast';
import { AIMEmptyState, AIMMetricTiles, AIMPanel, AIMSectionIntro } from './AIMSectionSystem';
import { summarizeAIMTrackedWorkItems } from '../../../services/aimTrackedWorkSummary';
import type { CanonicalTrackedWorkItem } from '../../../services/intelligenceObjects';

interface Action extends CanonicalTrackedWorkItem {
  id: string;
  sourceId: string;
  sourceType: 'action_item' | 'dmaic_project' | 'kaizen_item';
  title: string;
  workType: 'Task' | 'DMAIC' | 'Kaizen';
  owner: string;
  ownerId: string | null;
  progress: number;
  impact: string;
  createdFrom: string;
  sourceSignalLabel: string;
  sourceSignalDetail: string;
}

const STATUS_THEME: Record<string, { badge: string; bar: string }> = {
  Completed: { badge: 'bg-emerald-100 text-emerald-700', bar: 'from-emerald-500 to-ai-600' },
  'In Progress': { badge: 'bg-sapphire-100 text-sapphire-700', bar: 'from-sapphire-500 to-indigo-600' },
  'On Hold': { badge: 'bg-amber-100 text-amber-700', bar: 'from-amber-500 to-orange-500' },
  'Not Started': { badge: 'bg-brand-100 text-brand-700', bar: 'from-brand-400 to-brand-500' },
};

const PRIORITY_THEME: Record<string, string> = {
  Critical: 'bg-red-100 text-red-700',
  High: 'bg-red-100 text-red-700',
  Medium: 'bg-amber-100 text-amber-700',
  Low: 'bg-brand-100 text-brand-700',
};

const TYPE_THEME: Record<string, string> = {
  Task: 'bg-sapphire-100 text-sapphire-700',
  DMAIC: 'bg-violet-100 text-violet-700',
  Kaizen: 'bg-emerald-100 text-emerald-700',
};

const OUTCOME_THEME: Record<Action['outcomeState'], string> = {
  Captured: 'bg-emerald-100 text-emerald-700',
  'Awaiting Verification': 'bg-amber-100 text-amber-700',
  Monitoring: 'bg-sky-100 text-sky-700',
  'At Risk': 'bg-rose-100 text-rose-700',
  'Baseline Ready': 'bg-brand-100 text-brand-700',
};

const formatShortDate = (value?: string | null) => {
  if (!value) return 'No date';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'No date';
  return parsed.toISOString().split('T')[0];
};

function getOutcomeStateFromTags(tags: string[] | null | undefined): Action['outcomeState'] | null {
  if (!Array.isArray(tags)) return null;
  if (tags.includes('aim-outcome:captured')) return 'Captured';
  if (tags.includes('aim-outcome:awaiting_verification')) return 'Awaiting Verification';
  if (tags.includes('aim-outcome:monitoring')) return 'Monitoring';
  if (tags.includes('aim-outcome:at_risk')) return 'At Risk';
  if (tags.includes('aim-outcome:baseline_ready')) return 'Baseline Ready';
  return null;
}

function getOutcomeDetailFromTags(tags: string[] | null | undefined): string | null {
  if (!Array.isArray(tags)) return null;
  if (tags.includes('aim-outcome:captured')) {
    return 'AIM has a recorded result for this execution path. Review the captured impact to understand what worked.';
  }
  if (tags.includes('aim-outcome:awaiting_verification')) {
    return 'Execution is complete, but AIM is still waiting for KPI confirmation or realized impact notes.';
  }
  if (tags.includes('aim-outcome:monitoring')) {
    return 'Execution is underway. AIM is monitoring for the first measurable shift against the expected impact.';
  }
  if (tags.includes('aim-outcome:at_risk')) {
    return 'This linked action is blocked, overdue, or dismissed. Reconfirm ownership before the signal deteriorates further.';
  }
  if (tags.includes('aim-outcome:baseline_ready')) {
    return 'This item is linked to AIM and ready to start. Capture baseline context before execution begins.';
  }
  return null;
}

async function getOrganizationId(userId: string): Promise<string | null> {
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('organization_id')
    .eq('id', userId)
    .maybeSingle();

  if (profile?.organization_id) {
    return profile.organization_id;
  }

  const { data: membership } = await supabase
    .from('user_organizations')
    .select('organization_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  return membership?.organization_id ?? null;
}

async function getRecommendationsForActionLinking(orgId: string, userId: string) {
  const orgQuery = await supabase
    .from('recommendations')
    .select('id, title, status, actual_impact, implementation_notes, updated_at, completed_at')
    .eq('organization_id', orgId);

  if (!orgQuery.error) {
    return orgQuery.data || [];
  }

  if (!orgQuery.error.message?.includes('organization_id')) {
    console.error('Error loading linked recommendations:', orgQuery.error);
    return [];
  }

  const userQuery = await supabase
    .from('recommendations')
    .select('id, title, status, actual_impact, implementation_notes, updated_at, completed_at')
    .eq('user_id', userId);

  if (userQuery.error) {
    console.error('Error loading linked recommendations:', userQuery.error);
    return [];
  }

  return userQuery.data || [];
}

const ActionCenterSection: React.FC = () => {
  const { user, organization } = useAuth();
  const navigate = useNavigate();
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [selectedActions, setSelectedActions] = useState<string[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [actions, setActions] = useState<Action[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadActions();
      loadTeamMembers();
    }
  }, [user, organization?.id]);

  const loadActions = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      
      const orgId = organization?.id ?? await getOrganizationId(user.id);
      if (!orgId) {
        setLoading(false);
        return;
      }

      const recommendations = await getRecommendationsForActionLinking(orgId, user.id);

      const recommendationMap = new Map(
        (recommendations || []).map((recommendation: any) => [recommendation.id, recommendation])
      );

      // Load action items
      const { data: actionItems } = await supabase
        .from('action_items')
        .select('*, user_profiles!action_items_assigned_to_fkey(id, full_name)')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });

      // Load DMAIC projects
      const { data: dmaicProjects } = await supabase
        .from('dmaic_projects')
        .select('*, user_profiles!dmaic_projects_owner_id_fkey(id, full_name)')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });

      // Load Kaizen items
      const { data: kaizenItems } = await supabase
        .from('kaizen_items')
        .select('*, user_profiles!kaizen_items_submitted_by_fkey(id, full_name)')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });

      const allActions: Action[] = [];

      // Convert action items
      if (actionItems) {
        actionItems.forEach(item => {
          const progress =
            typeof item.progress === 'number' && Number.isFinite(item.progress)
              ? item.progress
              : item.status === 'completed'
                ? 100
                : item.status === 'in_progress'
                  ? 50
                  : 0;
          
          const impactValue = item.impact_score || 0;
          const tags: string[] = Array.isArray(item.tags) ? item.tags : [];
          const linkedRecommendationId =
            tags.find((tag) => typeof tag === 'string' && tag.startsWith('rec:'))?.replace('rec:', '') || null;
          const linkedRecommendation = linkedRecommendationId ? recommendationMap.get(linkedRecommendationId) : null;
          const dueDateValue = item.due_date || null;
          const isOverdue =
            Boolean(dueDateValue) &&
            item.status !== 'completed' &&
            new Date(dueDateValue).getTime() < Date.now();

          let outcomeState: Action['outcomeState'] = 'Baseline Ready';
          let outcomeDetail = 'Execution has not started yet. Capture first movement to validate impact.';
          const persistedOutcomeState = getOutcomeStateFromTags(tags);
          const persistedOutcomeDetail = getOutcomeDetailFromTags(tags);

          if (persistedOutcomeState) {
            outcomeState = persistedOutcomeState;
            if (persistedOutcomeDetail) {
              outcomeDetail = persistedOutcomeDetail;
            }
          }

          if (linkedRecommendation?.actual_impact) {
            outcomeState = 'Captured';
            outcomeDetail = linkedRecommendation.actual_impact;
          } else if (!persistedOutcomeState && (item.status === 'completed' || linkedRecommendation?.status === 'completed')) {
            outcomeState = 'Awaiting Verification';
            outcomeDetail = linkedRecommendation?.implementation_notes
              ? linkedRecommendation.implementation_notes
              : 'Work is complete. Verify KPI movement or document realized impact to close the loop.';
          } else if (!persistedOutcomeState && isOverdue) {
            outcomeState = 'At Risk';
            outcomeDetail = `Past due since ${formatShortDate(dueDateValue)}. Reconfirm owner and next milestone.`;
          } else if (!persistedOutcomeState && item.status === 'in_progress') {
            outcomeState = 'Monitoring';
            outcomeDetail = linkedRecommendation
              ? `Linked to "${linkedRecommendation.title}". Monitor execution progress against expected impact.`
              : 'Execution is underway. Capture observed KPI movement as the work progresses.';
          }
          
          allActions.push({
            id: `action-${item.id}`,
            sourceId: item.id,
            sourceType: 'action_item',
            title: item.title,
            workType: 'Task',
            status: item.status === 'completed' ? 'Completed' :
                   item.status === 'in_progress' ? 'In Progress' :
                   item.status === 'on_hold' ? 'On Hold' : 'Not Started',
            priority:
              item.priority === 'critical'
                ? 'Critical'
                : item.priority === 'high'
                  ? 'High'
                  : item.priority === 'medium'
                    ? 'Medium'
                    : 'Low',
            owner: item.user_profiles?.full_name || 'Unassigned',
            ownerId: item.assigned_to,
            dueDate: formatShortDate(dueDateValue),
            progress,
            impact: impactValue > 0 ? `$${Math.round(impactValue / 1000)}K` : '$0K',
            impactValue,
            createdFrom: 'Action Item',
            sourceSignalLabel: linkedRecommendation ? 'Recommendation-linked' : 'Execution-only',
            sourceSignalDetail: linkedRecommendation
              ? linkedRecommendation.title
              : 'Created directly in the action tracker without a linked AIM recommendation.',
            linkedRecommendationId,
            outcomeState,
            outcomeDetail,
          });
        });
      }

      // Convert DMAIC projects
      if (dmaicProjects) {
        dmaicProjects.forEach(project => {
          const progress = project.status === 'completed' ? 100 :
                          project.status === 'control' ? 90 :
                          project.status === 'improve' ? 70 :
                          project.status === 'analyze' ? 50 :
                          project.status === 'measure' ? 30 :
                          project.status === 'define' ? 10 : 0;
          
          const impactValue = project.expected_savings || 0;
          const projectDueDate = project.target_completion_date || null;
          const isOverdue =
            Boolean(projectDueDate) &&
            project.status !== 'completed' &&
            new Date(projectDueDate).getTime() < Date.now();
          const outcomeState: Action['outcomeState'] =
            project.status === 'completed'
              ? 'Awaiting Verification'
              : isOverdue
                ? 'At Risk'
                : project.status === 'on_hold'
                  ? 'At Risk'
                  : 'Monitoring';
          const outcomeDetail =
            outcomeState === 'Awaiting Verification'
              ? 'DMAIC work is complete. Validate realized savings or KPI improvement to confirm outcome.'
              : outcomeState === 'At Risk'
                ? `Project needs intervention before ${formatShortDate(projectDueDate)} to protect the expected gain.`
                : `AIM is monitoring ${project.status} progress against the projected savings outlook.`;
          
          allActions.push({
            id: `dmaic-${project.id}`,
            sourceId: project.id,
            sourceType: 'dmaic_project',
            title: project.title,
            workType: 'DMAIC',
            status: project.status === 'completed' ? 'Completed' :
                   project.status === 'on_hold' ? 'On Hold' : 'In Progress',
            priority: project.priority === 'high' ? 'High' :
                     project.priority === 'medium' ? 'Medium' : 'Low',
            owner: project.user_profiles?.full_name || 'Unassigned',
            ownerId: project.owner_id,
            dueDate: formatShortDate(projectDueDate),
            progress,
            impact: impactValue > 0 ? `$${Math.round(impactValue / 1000)}K` : '$0K',
            impactValue,
            createdFrom: 'DMAIC Project',
            sourceSignalLabel: 'DMAIC delivery',
            sourceSignalDetail: `Phase: ${project.status || 'active'}`,
            linkedRecommendationId: null,
            outcomeState,
            outcomeDetail,
          });
        });
      }

      // Convert Kaizen items
      if (kaizenItems) {
        kaizenItems.forEach(item => {
          const progress = item.status === 'completed' ? 100 :
                          item.status === 'in_progress' ? 60 :
                          item.status === 'approved' ? 20 : 0;
          
          const impactValue = item.estimated_savings || 0;
          const targetDate = item.target_date || null;
          const isOverdue =
            Boolean(targetDate) &&
            item.status !== 'completed' &&
            new Date(targetDate).getTime() < Date.now();
          const outcomeState: Action['outcomeState'] =
            item.status === 'completed'
              ? 'Awaiting Verification'
              : isOverdue
                ? 'At Risk'
                : item.status === 'in_progress'
                  ? 'Monitoring'
                  : 'Baseline Ready';
          const outcomeDetail =
            outcomeState === 'Awaiting Verification'
              ? 'Kaizen work is complete. Capture observed savings or KPI improvement to confirm the result.'
              : outcomeState === 'At Risk'
                ? `Target date ${formatShortDate(targetDate)} is slipping. Reconfirm support and ownership.`
                : outcomeState === 'Monitoring'
                  ? 'Improvement is in motion. Track the first measurable shift to validate the idea.'
                  : 'Ready to start. Capture a baseline before execution begins.';
          
          allActions.push({
            id: `kaizen-${item.id}`,
            sourceId: item.id,
            sourceType: 'kaizen_item',
            title: item.title,
            workType: 'Kaizen',
            status: item.status === 'completed' ? 'Completed' :
                   item.status === 'in_progress' ? 'In Progress' :
                   item.status === 'rejected' ? 'On Hold' : 'Not Started',
            priority: item.priority === 'high' ? 'High' :
                     item.priority === 'medium' ? 'Medium' : 'Low',
            owner: item.user_profiles?.full_name || 'Unassigned',
            ownerId: item.submitted_by,
            dueDate: formatShortDate(targetDate),
            progress,
            impact: impactValue > 0 ? `$${Math.round(impactValue / 1000)}K` : '$0K',
            impactValue,
            createdFrom: 'Kaizen Initiative',
            sourceSignalLabel: 'Kaizen improvement',
            sourceSignalDetail: `Status: ${item.status || 'open'}`,
            linkedRecommendationId: null,
            outcomeState,
            outcomeDetail,
          });
        });
      }

      setActions(allActions);
    } catch (error) {
      console.error('Error loading actions:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTeamMembers = async () => {
    if (!user) return;
    
    try {
      const orgId = organization?.id ?? await getOrganizationId(user.id);
      if (!orgId) return;

      const { data } = await supabase
        .from('user_profiles')
        .select('id, full_name, role')
        .eq('organization_id', orgId)
        .order('full_name');

      if (data) {
        const members = data.map(u => ({
          id: u.id,
          name: u.full_name || 'Unknown',
          role: u.role || 'Team Member',
          avatar: u.full_name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U',
          activeActions: 0
        }));
        
        // Count active actions per member
        members.forEach(member => {
          member.activeActions = actions.filter(a => 
            a.ownerId === member.id && 
            (a.status === 'In Progress' || a.status === 'Not Started')
          ).length;
        });
        
        setTeamMembers(members);
      }
    } catch (error) {
      console.error('Error loading team members:', error);
    }
  };

  useEffect(() => {
    if (actions.length > 0) {
      loadTeamMembers();
    }
  }, [actions]);

  const filteredActions = actions
    .filter(action => filterType === 'all' || action.workType === filterType)
    .filter(action => filterStatus === 'all' || action.status === filterStatus)
    .filter(action => filterPriority === 'all' || action.priority === filterPriority);

  const toggleSelection = (id: string) => {
    setSelectedActions(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const assignOwner = async (memberId: string) => {
    try {
      const updates = selectedActions.map(async (actionId) => {
        const action = actions.find(a => a.id === actionId);
        if (!action) return;

        if (action.sourceType === 'action_item') {
          const { error } = await supabase
            .from('action_items')
            .update({ assigned_to: memberId })
            .eq('id', action.sourceId);
          if (error) throw error;
        } else if (action.sourceType === 'dmaic_project') {
          const { error } = await supabase
            .from('dmaic_projects')
            .update({ owner_id: memberId })
            .eq('id', action.sourceId);
          if (error) throw error;
        } else if (action.sourceType === 'kaizen_item') {
          const { error } = await supabase
            .from('kaizen_items')
            .update({ submitted_by: memberId })
            .eq('id', action.sourceId);
          if (error) throw error;
        }
      });

      await Promise.all(updates);

      setShowAssignModal(false);
      setSelectedActions([]);
      await loadActions();
      await loadTeamMembers();
      addToast('Owner assignment updated successfully', 'success');
    } catch (error) {
      console.error('Error assigning owner:', error);
      addToast('Failed to assign owner to one or more actions', 'error');
    }
  };

  const handleExportActions = () => {
    const exportData = filteredActions.map(action => ({
      Title: action.title,
      Type: action.workType,
      Status: action.status,
      Priority: action.priority,
      Owner: action.owner,
      'Due Date': action.dueDate,
      'Progress (%)': action.progress,
      'Impact': action.impact,
      'Created From': action.createdFrom
    }));

    exportToCSV(exportData, 'actions-export');
  };

  const stats = summarizeAIMTrackedWorkItems(actions);
  const hasTrackedExecution = stats.total > 0;
  const queueIsFilteredEmpty = hasTrackedExecution && filteredActions.length === 0;
  const readinessCounts = {
    tasks: actions.filter((action) => action.workType === 'Task').length,
    dmaic: actions.filter((action) => action.workType === 'DMAIC').length,
    kaizen: actions.filter((action) => action.workType === 'Kaizen').length,
  };
  const outcomeLoop = {
    linked: actions.filter((action) => action.linkedRecommendationId).length,
    captured: actions.filter((action) => action.outcomeState === 'Captured').length,
    awaitingVerification: actions.filter((action) => action.outcomeState === 'Awaiting Verification').length,
    atRisk: actions.filter((action) => action.outcomeState === 'At Risk').length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-ai-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-brand-600">Loading actions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AIMSectionIntro
        eyebrow="Execution Layer"
        title="Action Center"
        description="Track and manage the execution work AIM creates across action items, DMAIC projects, and Kaizen initiatives."
        actions={
          <>
            <button
              onClick={() => navigate('/dashboard/action-tracker')}
              className="px-4 py-2 bg-gradient-to-r from-ai-500 to-ai-600 text-white text-sm font-semibold rounded-lg hover:shadow-lg transition-all whitespace-nowrap flex items-center gap-2"
            >
              <i className="ri-add-line"></i>
              Create New Action
            </button>
            <button 
              onClick={handleExportActions}
              className="px-4 py-2 bg-white border border-brand-200 text-brand-700 text-sm font-medium rounded-lg hover:bg-brand-50 transition-colors whitespace-nowrap flex items-center gap-2"
            >
              <i className="ri-download-line"></i>
              Export Actions
            </button>
          </>
        }
      />

      {/* Stats Overview */}
      <AIMMetricTiles
        columns="grid-cols-1 md:grid-cols-2 xl:grid-cols-5"
        items={[
          { label: 'Total Actions', value: stats.total },
          { label: 'In Progress', value: stats.inProgress, accent: 'text-sapphire-600' },
          { label: 'Completed', value: stats.completed, accent: 'text-emerald-600' },
          { label: 'Not Started', value: stats.notStarted, accent: 'text-brand-900' },
          {
            label: 'Total Impact',
            value: stats.totalImpact >= 1000000 ? `$${(stats.totalImpact / 1000000).toFixed(1)}M` : `$${Math.round(stats.totalImpact / 1000)}K`,
            accent: 'text-ai-600'
          },
        ]}
      />

      <AIMPanel
        title="Outcome Loop"
        description="Connect execution back to recommendation sources and visible outcome capture so AIM can learn what actually worked."
        icon="ri-git-merge-line"
        accentClass="from-ai-500 to-ai-600"
      >
        <AIMMetricTiles
          columns="grid-cols-1 md:grid-cols-2 xl:grid-cols-4"
          items={[
            { label: 'Linked To AIM', value: outcomeLoop.linked, detail: 'Execution items with a direct recommendation link', accent: 'text-brand-900' },
            { label: 'Outcome Captured', value: outcomeLoop.captured, detail: 'Completed work with realized impact already recorded', accent: 'text-emerald-600' },
            { label: 'Awaiting Verification', value: outcomeLoop.awaitingVerification, detail: 'Work finished, but KPI impact still needs confirmation', accent: 'text-amber-600' },
            { label: 'At Risk', value: outcomeLoop.atRisk, detail: 'Execution items that are overdue or blocked', accent: 'text-rose-600' },
          ]}
        />
      </AIMPanel>

      {/* Filters */}
      <AIMPanel
        title="Action Filters"
        description="Slice the execution queue by work type, status, and urgency."
        icon="ri-filter-3-line"
        accentClass="from-brand-700 to-brand-900"
      >
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-brand-700">Type:</span>
            <div className="flex gap-2">
              {['all', 'Task', 'DMAIC', 'Kaizen'].map(type => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
                    filterType === type
                      ? 'bg-gradient-to-r from-ai-500 to-ai-600 text-white'
                      : 'bg-brand-50 text-brand-700 hover:bg-brand-100'
                  }`}
                >
                  {type === 'all' ? 'All' : type}
                </button>
              ))}
            </div>
          </div>

          <div className="h-6 w-px bg-brand-200"></div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-brand-700">Status:</span>
            <div className="flex gap-2">
              {['all', 'Not Started', 'In Progress', 'Completed', 'On Hold'].map(status => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
                    filterStatus === status
                      ? 'bg-gradient-to-r from-ai-500 to-ai-600 text-white'
                      : 'bg-brand-50 text-brand-700 hover:bg-brand-100'
                  }`}
                >
                  {status === 'all' ? 'All' : status}
                </button>
              ))}
            </div>
          </div>

          <div className="h-6 w-px bg-brand-200"></div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-brand-700">Priority:</span>
            <div className="flex gap-2">
              {['all', 'Critical', 'High', 'Medium', 'Low'].map(priority => (
                <button
                  key={priority}
                  onClick={() => setFilterPriority(priority)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
                    filterPriority === priority
                      ? 'bg-gradient-to-r from-ai-500 to-ai-600 text-white'
                      : 'bg-brand-50 text-brand-700 hover:bg-brand-100'
                  }`}
                >
                  {priority === 'all' ? 'All' : priority}
                </button>
              ))}
            </div>
          </div>
        </div>
      </AIMPanel>

      {/* Bulk Actions */}
      {selectedActions.length > 0 && (
        <div className="bg-gradient-to-r from-ai-500 to-ai-600 rounded-xl p-4 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <i className="ri-checkbox-multiple-line text-2xl"></i>
              <span className="font-semibold">{selectedActions.length} actions selected</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAssignModal(true)}
                className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
              >
                Assign Owner
              </button>
              <button
                onClick={() => setSelectedActions([])}
                className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
              >
                Clear Selection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Actions List */}
      <div className="bg-white rounded-[28px] border border-brand-200 overflow-hidden shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
        {filteredActions.length === 0 ? (
          <div className="p-6">
            {queueIsFilteredEmpty ? (
              <div className="space-y-4">
                <div className="rounded-[24px] border border-brand-200 bg-white p-6">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-ai-500 to-ai-600">
                      <i className="ri-links-line text-2xl text-white"></i>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-brand-900">Tracked execution is active</h3>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-brand-600">
                        AIM is already linked to tracked work, but the current filters are hiding it. Clear the queue filters to bring live
                        action items, DMAIC work, and Kaizen initiatives back into view.
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-3">
                    <div className="rounded-2xl bg-brand-50 p-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-500">Task Items</div>
                      <div className="mt-2 text-2xl font-bold text-brand-900">{readinessCounts.tasks}</div>
                    </div>
                    <div className="rounded-2xl bg-brand-50 p-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-500">DMAIC Work</div>
                      <div className="mt-2 text-2xl font-bold text-brand-900">{readinessCounts.dmaic}</div>
                    </div>
                    <div className="rounded-2xl bg-brand-50 p-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-500">Kaizen Items</div>
                      <div className="mt-2 text-2xl font-bold text-brand-900">{readinessCounts.kaizen}</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <AIMEmptyState
                icon="ri-task-line"
                title="No actions found"
                description="Adjust the current filters or create a new action to start tracking operational work."
              />
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-brand-50 border-b border-brand-200">
                <tr>
                  <th className="py-3 px-4 text-left">
                    <input
                      type="checkbox"
                      checked={selectedActions.length === filteredActions.length && filteredActions.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedActions(filteredActions.map(a => a.id));
                        } else {
                          setSelectedActions([]);
                        }
                      }}
                      className="w-4 h-4 cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-4 text-left text-sm font-semibold text-brand-700">Action</th>
                  <th className="py-3 px-4 text-center text-sm font-semibold text-brand-700">Type</th>
                  <th className="py-3 px-4 text-center text-sm font-semibold text-brand-700">Status</th>
                  <th className="py-3 px-4 text-center text-sm font-semibold text-brand-700">Priority</th>
                  <th className="py-3 px-4 text-left text-sm font-semibold text-brand-700">Owner</th>
                  <th className="py-3 px-4 text-center text-sm font-semibold text-brand-700">Due Date</th>
                  <th className="py-3 px-4 text-center text-sm font-semibold text-brand-700">Progress</th>
                  <th className="py-3 px-4 text-left text-sm font-semibold text-brand-700">Outcome Signal</th>
                  <th className="py-3 px-4 text-center text-sm font-semibold text-brand-700">Impact</th>
                </tr>
              </thead>
              <tbody>
                {filteredActions.map((action) => (
                  <tr
                    key={action.id}
                    className={`border-b border-brand-100 hover:bg-brand-50 transition-colors ${
                      selectedActions.includes(action.id) ? 'bg-ai-50' : ''
                    }`}
                  >
                    <td className="py-4 px-4">
                      <input
                        type="checkbox"
                        checked={selectedActions.includes(action.id)}
                        onChange={() => toggleSelection(action.id)}
                        className="w-4 h-4 cursor-pointer"
                      />
                    </td>
                    <td className="py-4 px-4">
                      <div>
                        <div className="font-semibold text-brand-900 mb-1">{action.title}</div>
                        <div className="text-xs text-brand-500">From: {action.createdFrom}</div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-brand-100 px-2.5 py-1 text-[11px] font-semibold text-brand-700">
                            {action.sourceSignalLabel}
                          </span>
                          <span className="text-xs text-brand-500">{action.sourceSignalDetail}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <span className={`px-3 py-1 text-xs font-semibold rounded-full whitespace-nowrap ${TYPE_THEME[action.workType] || TYPE_THEME.Task}`}>
                        {action.workType}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <span className={`px-3 py-1 text-xs font-semibold rounded-full whitespace-nowrap ${STATUS_THEME[action.status]?.badge || STATUS_THEME['Not Started'].badge}`}>
                        {action.status}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <span className={`px-3 py-1 text-xs font-semibold rounded-full whitespace-nowrap ${PRIORITY_THEME[action.priority] || PRIORITY_THEME.Low}`}>
                        {action.priority}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-gradient-to-br from-ai-500 to-ai-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                          {action.owner.split(' ').map(n => n[0]).join('')}
                        </div>
                        <span className="text-sm text-brand-700">{action.owner}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <span className="text-sm text-brand-700">{action.dueDate}</span>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-brand-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full bg-gradient-to-r ${STATUS_THEME[action.status]?.bar || STATUS_THEME['Not Started'].bar} rounded-full transition-all`}
                            style={{ width: `${action.progress}%` }}
                          ></div>
                        </div>
                        <span className="text-xs font-semibold text-brand-700 w-10">{action.progress}%</span>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="space-y-2">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${OUTCOME_THEME[action.outcomeState]}`}>
                          {action.outcomeState}
                        </span>
                        <div className="max-w-xs text-xs leading-5 text-brand-600">{action.outcomeDetail}</div>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <span className="text-emerald-600 font-bold">{action.impact}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Team Members */}
      {teamMembers.length > 0 && (
        <div className="bg-white rounded-xl border border-brand-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-gradient-to-br from-ai-500 to-ai-600 rounded-lg flex items-center justify-center">
              <i className="ri-team-line text-xl text-white"></i>
            </div>
            <div>
              <h2 className="text-xl font-bold text-brand-900">Team Workload</h2>
              <p className="text-sm text-brand-600">Current action assignments by team member</p>
            </div>
          </div>

          <div className="grid grid-cols-5 gap-4">
            {teamMembers.slice(0, 5).map((member) => (
              <div key={member.id} className="p-4 border border-brand-200 rounded-xl hover:shadow-lg transition-all cursor-pointer">
                <div className="flex flex-col items-center text-center">
                  <div className="w-16 h-16 bg-gradient-to-br from-ai-500 to-ai-600 rounded-full flex items-center justify-center text-white text-xl font-bold mb-3">
                    {member.avatar}
                  </div>
                  <h3 className="text-sm font-bold text-brand-900 mb-1">{member.name}</h3>
                  <p className="text-xs text-brand-600 mb-3">{member.role}</p>
                  <div className="w-full pt-3 border-t border-brand-200">
                    <div className="text-2xl font-bold text-ai-600">{member.activeActions}</div>
                    <div className="text-xs text-brand-500">Active Actions</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Assign Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="text-xl font-bold text-brand-900 mb-4">Assign Owner</h3>
            <div className="space-y-3 mb-6 max-h-96 overflow-y-auto">
              {teamMembers.map((member) => (
                <button
                  key={member.id}
                  onClick={() => assignOwner(member.id)}
                  className="w-full flex items-center gap-3 p-3 border border-brand-200 rounded-lg hover:bg-brand-50 transition-colors"
                >
                  <div className="w-10 h-10 bg-gradient-to-br from-ai-500 to-ai-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                    {member.avatar}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-semibold text-brand-900">{member.name}</div>
                    <div className="text-xs text-brand-600">{member.role}</div>
                  </div>
                  <div className="text-sm text-brand-500">{member.activeActions} active</div>
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowAssignModal(false)}
                className="flex-1 px-4 py-2 bg-brand-100 text-brand-700 text-sm font-medium rounded-lg hover:bg-brand-200 transition-colors whitespace-nowrap"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ActionCenterSection;
