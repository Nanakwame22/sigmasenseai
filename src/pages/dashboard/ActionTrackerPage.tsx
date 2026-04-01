import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line, Legend } from 'recharts';
import { downloadTemplate } from '../../utils/exportUtils';
import { addToast } from '../../hooks/useToast';
import ConfirmDialog from '../../components/common/ConfirmDialog';

interface ActionItem {
  id: string;
  title: string;
  description: string;
  assigned_to: string;
  assigned_to_name?: string;
  status: 'open' | 'in_progress' | 'completed' | 'blocked' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  due_date: string;
  progress: number;
  estimated_hours: number;
  actual_hours: number;
  tags: string[];
  created_at: string;
}

interface TeamMember {
  id: string;
  full_name: string;
  email: string;
}

export default function ActionTrackerPage() {
  const { user } = useAuth();
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAction, setEditingAction] = useState<ActionItem | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [organizationId, setOrganizationId] = useState<string>('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    assigned_to: '',
    status: 'open' as const,
    priority: 'medium' as const,
    category: '',
    due_date: '',
    progress: 0,
    estimated_hours: 0,
    tags: [] as string[],
  });

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;

    try {
      setLoading(true);

      // Get organization
      const { data: orgData } = await supabase
        .from('user_organizations')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (!orgData) return;
      setOrganizationId(orgData.organization_id);

      // Load team members
      const { data: members } = await supabase
        .from('user_organizations')
        .select('user_id, user_profiles(id, full_name, email)')
        .eq('organization_id', orgData.organization_id);

      if (members) {
        const teamList = members
          .map((m: any) => m.user_profiles)
          .filter(Boolean);
        setTeamMembers(teamList);
      }

      // Load actions
      await loadActions(orgData.organization_id);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadActions = async (orgId: string) => {
    const { data, error } = await supabase
      .from('action_items')
      .select(`
        *,
        assigned_to_profile:user_profiles!action_items_assigned_to_fkey(full_name)
      `)
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading actions:', error);
      return;
    }

    const actionsWithNames = data.map((action: any) => ({
      ...action,
      assigned_to_name: action.assigned_to_profile?.full_name || 'Unassigned',
    }));

    setActions(actionsWithNames);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !organizationId) return;

    try {
      const actionData = {
        ...formData,
        organization_id: organizationId,
        created_by: user.id,
        assigned_to: formData.assigned_to || null,
      };

      if (editingAction) {
        const { error } = await supabase
          .from('action_items')
          .update(actionData)
          .eq('id', editingAction.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('action_items')
          .insert([actionData]);

        if (error) throw error;
      }

      await loadActions(organizationId);
      resetForm();
      addToast(`Action ${editingAction ? 'updated' : 'created'} successfully`, 'success');
    } catch (error) {
      console.error('Error saving action:', error);
      addToast('Failed to save action item', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    setDeleteTargetId(id);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTargetId) return;

    const { error } = await supabase
      .from('action_items')
      .delete()
      .eq('id', deleteTargetId);

    if (error) {
      console.error('Error deleting action:', error);
      addToast('Failed to delete action', 'error');
    } else {
      setActions(actions.filter((a) => a.id !== deleteTargetId));
      addToast('Action deleted successfully', 'success');
    }

    setDeleteConfirmOpen(false);
    setDeleteTargetId(null);
  };

  const handleEdit = (action: ActionItem) => {
    setEditingAction(action);
    setFormData({
      title: action.title,
      description: action.description || '',
      assigned_to: action.assigned_to || '',
      status: action.status,
      priority: action.priority,
      category: action.category || '',
      due_date: action.due_date ? action.due_date.split('T')[0] : '',
      progress: action.progress,
      estimated_hours: action.estimated_hours || 0,
      tags: action.tags || [],
    });
    setShowModal(true);
  };

  const handleDownloadTemplate = () => {
    downloadTemplate(
      'Action_Items_Import_Template',
      [
        { name: 'title', description: 'Action item title (required)', example: 'Update patient intake process' },
        { name: 'description', description: 'Detailed description', example: 'Revise intake forms to reduce completion time' },
        { name: 'priority', description: 'low/medium/high/critical (required)', example: 'high' },
        { name: 'status', description: 'not_started/in_progress/completed/blocked', example: 'not_started' },
        { name: 'assigned_to', description: 'Assignee email', example: 'john.smith@company.com' },
        { name: 'due_date', description: 'Due date (YYYY-MM-DD)', example: '2024-12-31' },
        { name: 'category', description: 'Category/project name', example: 'Process Improvement' }
      ]
    );
  };

  const updateProgress = async (id: string, progress: number) => {
    const { error } = await supabase
      .from('action_items')
      .update({ progress })
      .eq('id', id);

    if (error) {
      console.error('Error updating progress:', error);
      return;
    }

    setActions(
      actions.map((a) => (a.id === id ? { ...a, progress } : a))
    );
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      assigned_to: '',
      status: 'open',
      priority: 'medium',
      category: '',
      due_date: '',
      progress: 0,
      estimated_hours: 0,
      tags: [],
    });
    setEditingAction(null);
    setShowModal(false);
  };

  const filteredActions = actions.filter((action) => {
    const matchesStatus = filterStatus === 'all' || action.status === filterStatus;
    const matchesPriority = filterPriority === 'all' || action.priority === filterPriority;
    const matchesSearch =
      action.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      action.description?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesPriority && matchesSearch;
  });

  const stats = {
    total: actions.length,
    open: actions.filter((a) => a.status === 'open').length,
    inProgress: actions.filter((a) => a.status === 'in_progress').length,
    completed: actions.filter((a) => a.status === 'completed').length,
    overdue: actions.filter(
      (a) => a.due_date && new Date(a.due_date) < new Date() && a.status !== 'completed'
    ).length,
  };

  const statusDistribution = [
    { name: 'Open', value: actions.filter(a => a.status === 'open').length, color: '#3B82F6' },
    { name: 'In Progress', value: actions.filter(a => a.status === 'in_progress').length, color: '#F59E0B' },
    { name: 'Completed', value: actions.filter(a => a.status === 'completed').length, color: '#10B981' },
    { name: 'Blocked', value: actions.filter(a => a.status === 'blocked').length, color: '#EF4444' },
    { name: 'Cancelled', value: actions.filter(a => a.status === 'cancelled').length, color: '#6B7280' }
  ];

  const priorityData = [
    { priority: 'Critical', count: actions.filter(a => a.priority === 'critical').length, color: '#EF4444' },
    { priority: 'High', count: actions.filter(a => a.priority === 'high').length, color: '#F59E0B' },
    { priority: 'Medium', count: actions.filter(a => a.priority === 'medium').length, color: '#3B82F6' },
    { priority: 'Low', count: actions.filter(a => a.priority === 'low').length, color: '#10B981' }
  ];

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-300';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'low': return 'bg-green-100 text-green-800 border-green-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'in_progress': return 'bg-blue-100 text-blue-800';
      case 'blocked': return 'bg-red-100 text-red-800';
      case 'cancelled': return 'bg-gray-100 text-gray-800';
      default: return 'bg-yellow-100 text-yellow-800';
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        title="Delete Action?"
        message="Are you sure you want to delete this action? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          setDeleteConfirmOpen(false);
          setDeleteTargetId(null);
        }}
      />

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-sm text-gray-600">Total Actions</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-sm text-gray-600">Open</div>
          <div className="text-2xl font-bold text-yellow-600 mt-1">{stats.open}</div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-sm text-gray-600">In Progress</div>
          <div className="text-2xl font-bold text-blue-600 mt-1">{stats.inProgress}</div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-sm text-gray-600">Completed</div>
          <div className="text-2xl font-bold text-green-600 mt-1">{stats.completed}</div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-sm text-gray-600">Overdue</div>
          <div className="text-2xl font-bold text-red-600 mt-1">{stats.overdue}</div>
        </div>
      </div>

      {/* NEW: Visualizations Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Completion Trend */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Action Completion Trend</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={getCompletionTrendData(actions)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="week" stroke="#6b7280" style={{ fontSize: '12px' }} />
              <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#fff', 
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Line type="monotone" dataKey="completed" stroke="#10b981" strokeWidth={2} name="Completed" />
              <Line type="monotone" dataKey="created" stroke="#3b82f6" strokeWidth={2} name="Created" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Priority vs Status */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Actions by Priority & Status</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={getPriorityStatusData(actions)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="priority" stroke="#6b7280" style={{ fontSize: '12px' }} />
              <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#fff', 
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar dataKey="open" fill="#3b82f6" radius={[8, 8, 0, 0]} name="Open" />
              <Bar dataKey="in_progress" fill="#f59e0b" radius={[8, 8, 0, 0]} name="In Progress" />
              <Bar dataKey="completed" fill="#10b981" radius={[8, 8, 0, 0]} name="Completed" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg border border-gray-200 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search actions..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="all">All Statuses</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="blocked">Blocked</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="all">All Priorities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>
      </div>

      {/* Actions List */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Title</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Assigned To</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Priority</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Progress</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Due Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredActions.map((action) => (
                <tr key={action.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{action.title}</div>
                    {action.description && (
                      <div className="text-sm text-gray-600 mt-1">{action.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">{action.assigned_to_name}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(action.status)}`}>
                      {action.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-xs font-medium rounded border ${getPriorityColor(action.priority)}`}>
                      {action.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-teal-600 h-2 rounded-full transition-all"
                          style={{ width: `${action.progress}%` }}
                        ></div>
                      </div>
                      <span className="text-sm text-gray-600 w-10">{action.progress}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {action.due_date ? new Date(action.due_date).toLocaleDateString() : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEdit(action)}
                        className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                        title="Edit"
                      >
                        <i className="ri-edit-line"></i>
                      </button>
                      <button
                        onClick={() => handleDelete(action.id)}
                        className="p-1 text-red-600 hover:bg-red-50 rounded"
                        title="Delete"
                      >
                        <i className="ri-delete-bin-line"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                {editingAction ? 'Edit Action' : 'New Action'}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
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
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Assigned To</label>
                    <select
                      value={formData.assigned_to}
                      onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      <option value="">Unassigned</option>
                      {teamMembers.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.full_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                    <input
                      type="text"
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      <option value="open">Open</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                      <option value="blocked">Blocked</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                    <select
                      value={formData.priority}
                      onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
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
                      value={formData.due_date}
                      onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Estimated Hours</label>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={formData.estimated_hours}
                      onChange={(e) => setFormData({ ...formData, estimated_hours: parseFloat(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Progress (%)</label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={formData.progress}
                    onChange={(e) => setFormData({ ...formData, progress: parseInt(e.target.value) })}
                    className="w-full"
                  />
                  <div className="text-center text-sm text-gray-600 mt-1">{formData.progress}%</div>
                </div>
                <div className="flex gap-3 pt-4">
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
                  >
                    {editingAction ? 'Update Action' : 'Create Action'}
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
    </div>
  );
}

// Helper function to get completion trend data from real action timestamps
function getCompletionTrendData(actions: any[]) {
  const now = new Date();
  const weeks: { week: string; start: Date; end: Date }[] = [];

  // Build last 8 weeks
  for (let i = 7; i >= 0; i--) {
    const end = new Date(now);
    end.setDate(now.getDate() - i * 7);
    end.setHours(23, 59, 59, 999);

    const start = new Date(end);
    start.setDate(end.getDate() - 6);
    start.setHours(0, 0, 0, 0);

    const label = `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    weeks.push({ week: label, start, end });
  }

  return weeks.map(({ week, start, end }) => {
    const created = actions.filter((a) => {
      const d = new Date(a.created_at);
      return d >= start && d <= end;
    }).length;

    const completed = actions.filter((a) => {
      if (!a.completed_at) return false;
      const d = new Date(a.completed_at);
      return d >= start && d <= end;
    }).length;

    return { week, created, completed };
  });
}

// Helper function to get priority vs status data using real action data
function getPriorityStatusData(actions: any[]) {
  const priorities = ['critical', 'high', 'medium', 'low'];

  return priorities.map((priority) => {
    const priorityActions = actions.filter((a) => a.priority === priority);
    return {
      priority: priority.charAt(0).toUpperCase() + priority.slice(1),
      open: priorityActions.filter((a) => a.status === 'open').length,
      in_progress: priorityActions.filter((a) => a.status === 'in_progress').length,
      completed: priorityActions.filter((a) => a.status === 'completed').length,
    };
  });
}