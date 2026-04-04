import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { exportToCSV } from '../../../utils/exportUtils';
import { addToast } from '../../../hooks/useToast';
import { AIMEmptyState, AIMMetricTiles, AIMPanel, AIMSectionIntro } from './AIMSectionSystem';

interface Action {
  id: string;
  sourceId: string;
  sourceType: 'action_item' | 'dmaic_project' | 'kaizen_item';
  title: string;
  type: 'Task' | 'DMAIC' | 'Kaizen';
  status: 'Not Started' | 'In Progress' | 'Completed' | 'On Hold';
  priority: 'High' | 'Medium' | 'Low';
  owner: string;
  ownerId: string | null;
  dueDate: string;
  progress: number;
  impact: string;
  impactValue: number;
  createdFrom: string;
}

const STATUS_THEME: Record<string, { badge: string; bar: string }> = {
  Completed: { badge: 'bg-emerald-100 text-emerald-700', bar: 'from-emerald-500 to-teal-600' },
  'In Progress': { badge: 'bg-blue-100 text-blue-700', bar: 'from-blue-500 to-indigo-600' },
  'On Hold': { badge: 'bg-amber-100 text-amber-700', bar: 'from-amber-500 to-orange-500' },
  'Not Started': { badge: 'bg-slate-100 text-slate-700', bar: 'from-slate-400 to-slate-500' },
};

const PRIORITY_THEME: Record<string, string> = {
  High: 'bg-red-100 text-red-700',
  Medium: 'bg-amber-100 text-amber-700',
  Low: 'bg-slate-100 text-slate-700',
};

const TYPE_THEME: Record<string, string> = {
  Task: 'bg-blue-100 text-blue-700',
  DMAIC: 'bg-violet-100 text-violet-700',
  Kaizen: 'bg-emerald-100 text-emerald-700',
};

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

const ActionCenterSection: React.FC = () => {
  const { user } = useAuth();
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
  }, [user]);

  const loadActions = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      
      const orgId = await getOrganizationId(user.id);
      if (!orgId) {
        setLoading(false);
        return;
      }

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
          const progress = item.status === 'completed' ? 100 : 
                          item.status === 'in_progress' ? 50 : 0;
          
          const impactValue = item.impact_score || 0;
          
          allActions.push({
            id: `action-${item.id}`,
            sourceId: item.id,
            sourceType: 'action_item',
            title: item.title,
            type: 'Task',
            status: item.status === 'completed' ? 'Completed' :
                   item.status === 'in_progress' ? 'In Progress' :
                   item.status === 'on_hold' ? 'On Hold' : 'Not Started',
            priority: item.priority === 'high' ? 'High' :
                     item.priority === 'medium' ? 'Medium' : 'Low',
            owner: item.user_profiles?.full_name || 'Unassigned',
            ownerId: item.assigned_to,
            dueDate: item.due_date ? new Date(item.due_date).toISOString().split('T')[0] : 'No date',
            progress,
            impact: impactValue > 0 ? `$${Math.round(impactValue / 1000)}K` : '$0K',
            impactValue,
            createdFrom: 'Action Item'
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
          
          allActions.push({
            id: `dmaic-${project.id}`,
            sourceId: project.id,
            sourceType: 'dmaic_project',
            title: project.title,
            type: 'DMAIC',
            status: project.status === 'completed' ? 'Completed' :
                   project.status === 'on_hold' ? 'On Hold' : 'In Progress',
            priority: project.priority === 'high' ? 'High' :
                     project.priority === 'medium' ? 'Medium' : 'Low',
            owner: project.user_profiles?.full_name || 'Unassigned',
            ownerId: project.owner_id,
            dueDate: project.target_completion_date ? new Date(project.target_completion_date).toISOString().split('T')[0] : 'No date',
            progress,
            impact: impactValue > 0 ? `$${Math.round(impactValue / 1000)}K` : '$0K',
            impactValue,
            createdFrom: 'DMAIC Project'
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
          
          allActions.push({
            id: `kaizen-${item.id}`,
            sourceId: item.id,
            sourceType: 'kaizen_item',
            title: item.title,
            type: 'Kaizen',
            status: item.status === 'completed' ? 'Completed' :
                   item.status === 'in_progress' ? 'In Progress' :
                   item.status === 'rejected' ? 'On Hold' : 'Not Started',
            priority: item.priority === 'high' ? 'High' :
                     item.priority === 'medium' ? 'Medium' : 'Low',
            owner: item.user_profiles?.full_name || 'Unassigned',
            ownerId: item.submitted_by,
            dueDate: item.target_date ? new Date(item.target_date).toISOString().split('T')[0] : 'No date',
            progress,
            impact: impactValue > 0 ? `$${Math.round(impactValue / 1000)}K` : '$0K',
            impactValue,
            createdFrom: 'Kaizen Initiative'
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
      const orgId = await getOrganizationId(user.id);
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
    .filter(action => filterType === 'all' || action.type === filterType)
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
      Type: action.type,
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

  const stats = {
    total: actions.length,
    inProgress: actions.filter(a => a.status === 'In Progress').length,
    completed: actions.filter(a => a.status === 'Completed').length,
    notStarted: actions.filter(a => a.status === 'Not Started').length,
    totalImpact: actions.reduce((sum, a) => sum + a.impactValue, 0)
  };
  const hasTrackedExecution = stats.total > 0;
  const queueIsFilteredEmpty = hasTrackedExecution && filteredActions.length === 0;
  const readinessCounts = {
    tasks: actions.filter((action) => action.type === 'Task').length,
    dmaic: actions.filter((action) => action.type === 'DMAIC').length,
    kaizen: actions.filter((action) => action.type === 'Kaizen').length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading actions...</p>
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
              className="px-4 py-2 bg-gradient-to-r from-teal-500 to-cyan-600 text-white text-sm font-semibold rounded-lg hover:shadow-lg transition-all whitespace-nowrap flex items-center gap-2"
            >
              <i className="ri-add-line"></i>
              Create New Action
            </button>
            <button 
              onClick={handleExportActions}
              className="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap flex items-center gap-2"
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
          { label: 'In Progress', value: stats.inProgress, accent: 'text-blue-600' },
          { label: 'Completed', value: stats.completed, accent: 'text-emerald-600' },
          { label: 'Not Started', value: stats.notStarted, accent: 'text-slate-900' },
          {
            label: 'Total Impact',
            value: stats.totalImpact >= 1000000 ? `$${(stats.totalImpact / 1000000).toFixed(1)}M` : `$${Math.round(stats.totalImpact / 1000)}K`,
            accent: 'text-teal-600'
          },
        ]}
      />

      {/* Filters */}
      <AIMPanel
        title="Action Filters"
        description="Slice the execution queue by work type, status, and urgency."
        icon="ri-filter-3-line"
        accentClass="from-slate-700 to-slate-900"
      >
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-700">Type:</span>
            <div className="flex gap-2">
              {['all', 'Task', 'DMAIC', 'Kaizen'].map(type => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
                    filterType === type
                      ? 'bg-gradient-to-r from-teal-500 to-cyan-600 text-white'
                      : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {type === 'all' ? 'All' : type}
                </button>
              ))}
            </div>
          </div>

          <div className="h-6 w-px bg-slate-200"></div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-700">Status:</span>
            <div className="flex gap-2">
              {['all', 'Not Started', 'In Progress', 'Completed', 'On Hold'].map(status => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
                    filterStatus === status
                      ? 'bg-gradient-to-r from-teal-500 to-cyan-600 text-white'
                      : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {status === 'all' ? 'All' : status}
                </button>
              ))}
            </div>
          </div>

          <div className="h-6 w-px bg-slate-200"></div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-700">Priority:</span>
            <div className="flex gap-2">
              {['all', 'High', 'Medium', 'Low'].map(priority => (
                <button
                  key={priority}
                  onClick={() => setFilterPriority(priority)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
                    filterPriority === priority
                      ? 'bg-gradient-to-r from-teal-500 to-cyan-600 text-white'
                      : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
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
        <div className="bg-gradient-to-r from-teal-500 to-cyan-600 rounded-xl p-4 text-white">
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
      <div className="bg-white rounded-[28px] border border-slate-200 overflow-hidden shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
        {filteredActions.length === 0 ? (
          <div className="p-6">
            {queueIsFilteredEmpty ? (
              <div className="space-y-4">
                <div className="rounded-[24px] border border-slate-200 bg-white p-6">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600">
                      <i className="ri-links-line text-2xl text-white"></i>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">Tracked execution is active</h3>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                        AIM is already linked to tracked work, but the current filters are hiding it. Clear the queue filters to bring live
                        action items, DMAIC work, and Kaizen initiatives back into view.
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-3">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Task Items</div>
                      <div className="mt-2 text-2xl font-bold text-slate-900">{readinessCounts.tasks}</div>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">DMAIC Work</div>
                      <div className="mt-2 text-2xl font-bold text-slate-900">{readinessCounts.dmaic}</div>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Kaizen Items</div>
                      <div className="mt-2 text-2xl font-bold text-slate-900">{readinessCounts.kaizen}</div>
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
              <thead className="bg-slate-50 border-b border-slate-200">
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
                  <th className="py-3 px-4 text-left text-sm font-semibold text-slate-700">Action</th>
                  <th className="py-3 px-4 text-center text-sm font-semibold text-slate-700">Type</th>
                  <th className="py-3 px-4 text-center text-sm font-semibold text-slate-700">Status</th>
                  <th className="py-3 px-4 text-center text-sm font-semibold text-slate-700">Priority</th>
                  <th className="py-3 px-4 text-left text-sm font-semibold text-slate-700">Owner</th>
                  <th className="py-3 px-4 text-center text-sm font-semibold text-slate-700">Due Date</th>
                  <th className="py-3 px-4 text-center text-sm font-semibold text-slate-700">Progress</th>
                  <th className="py-3 px-4 text-center text-sm font-semibold text-slate-700">Impact</th>
                </tr>
              </thead>
              <tbody>
                {filteredActions.map((action) => (
                  <tr
                    key={action.id}
                    className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${
                      selectedActions.includes(action.id) ? 'bg-teal-50' : ''
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
                        <div className="font-semibold text-slate-900 mb-1">{action.title}</div>
                        <div className="text-xs text-slate-500">From: {action.createdFrom}</div>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <span className={`px-3 py-1 text-xs font-semibold rounded-full whitespace-nowrap ${TYPE_THEME[action.type] || TYPE_THEME.Task}`}>
                        {action.type}
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
                        <div className="w-8 h-8 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                          {action.owner.split(' ').map(n => n[0]).join('')}
                        </div>
                        <span className="text-sm text-slate-700">{action.owner}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <span className="text-sm text-slate-700">{action.dueDate}</span>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full bg-gradient-to-r ${STATUS_THEME[action.status]?.bar || STATUS_THEME['Not Started'].bar} rounded-full transition-all`}
                            style={{ width: `${action.progress}%` }}
                          ></div>
                        </div>
                        <span className="text-xs font-semibold text-slate-700 w-10">{action.progress}%</span>
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
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-lg flex items-center justify-center">
              <i className="ri-team-line text-xl text-white"></i>
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Team Workload</h2>
              <p className="text-sm text-slate-600">Current action assignments by team member</p>
            </div>
          </div>

          <div className="grid grid-cols-5 gap-4">
            {teamMembers.slice(0, 5).map((member) => (
              <div key={member.id} className="p-4 border border-slate-200 rounded-xl hover:shadow-lg transition-all cursor-pointer">
                <div className="flex flex-col items-center text-center">
                  <div className="w-16 h-16 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-full flex items-center justify-center text-white text-xl font-bold mb-3">
                    {member.avatar}
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 mb-1">{member.name}</h3>
                  <p className="text-xs text-slate-600 mb-3">{member.role}</p>
                  <div className="w-full pt-3 border-t border-slate-200">
                    <div className="text-2xl font-bold text-teal-600">{member.activeActions}</div>
                    <div className="text-xs text-slate-500">Active Actions</div>
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
            <h3 className="text-xl font-bold text-slate-900 mb-4">Assign Owner</h3>
            <div className="space-y-3 mb-6 max-h-96 overflow-y-auto">
              {teamMembers.map((member) => (
                <button
                  key={member.id}
                  onClick={() => assignOwner(member.id)}
                  className="w-full flex items-center gap-3 p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                    {member.avatar}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-semibold text-slate-900">{member.name}</div>
                    <div className="text-xs text-slate-600">{member.role}</div>
                  </div>
                  <div className="text-sm text-slate-500">{member.activeActions} active</div>
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowAssignModal(false)}
                className="flex-1 px-4 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap"
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
