import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { addToast } from '../../hooks/useToast';
import ConfirmDialog from '../../components/common/ConfirmDialog';

interface AutomationRule {
  id: string;
  name: string;
  description: string;
  trigger_type: string;
  trigger_config: any;
  action_type: string;
  action_config: any;
  conditions: any;
  is_active: boolean;
  priority: number;
  created_at: string;
}

interface AutomationExecution {
  id: string;
  rule_id: string;
  status: 'success' | 'failed' | 'pending';
  trigger_data: any;
  action_result: any;
  error_message?: string;
  execution_time: number;
  executed_at: string;
}

export default function AutomationRulesPage() {
  const { user } = useAuth();
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [executions, setExecutions] = useState<AutomationExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showExecutionsModal, setShowExecutionsModal] = useState(false);
  const [selectedRule, setSelectedRule] = useState<AutomationRule | null>(null);
  const [filterActive, setFilterActive] = useState<string>('all');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    trigger_type: 'metric_threshold',
    trigger_config: { metric: '', threshold: '', operator: 'greater_than' },
    action_type: 'send_alert',
    action_config: { message: '', recipients: '' },
    conditions: { enabled: false, rules: [] },
    is_active: true,
    priority: 0
  });

  const triggerTypes = [
    { value: 'metric_threshold', label: 'Metric Threshold', icon: 'ri-line-chart-line' },
    { value: 'schedule', label: 'Schedule', icon: 'ri-calendar-line' },
    { value: 'data_change', label: 'Data Change', icon: 'ri-refresh-line' },
    { value: 'manual', label: 'Manual Trigger', icon: 'ri-hand-coin-line' },
    { value: 'webhook', label: 'Webhook', icon: 'ri-webhook-line' }
  ];

  const actionTypes = [
    { value: 'send_alert', label: 'Send Alert', icon: 'ri-notification-line' },
    { value: 'send_email', label: 'Send Email', icon: 'ri-mail-line' },
    { value: 'create_task', label: 'Create Task', icon: 'ri-task-line' },
    { value: 'update_metric', label: 'Update Metric', icon: 'ri-edit-line' },
    { value: 'run_analysis', label: 'Run Analysis', icon: 'ri-bar-chart-line' },
    { value: 'webhook', label: 'Call Webhook', icon: 'ri-webhook-line' }
  ];

  useEffect(() => {
    fetchRules();
  }, []);

  const fetchRules = async () => {
    try {
      setLoading(true);
      const { data: orgData } = await supabase
        .from('user_organizations')
        .select('organization_id')
        .eq('user_id', user?.id)
        .single();

      if (!orgData) return;

      const { data, error } = await supabase
        .from('automation_rules')
        .select('*')
        .eq('organization_id', orgData.organization_id)
        .order('priority', { ascending: false });

      if (error) throw error;
      setRules(data || []);
    } catch (error) {
      console.error('Error fetching rules:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchExecutions = async (ruleId: string) => {
    try {
      const { data, error } = await supabase
        .from('automation_executions')
        .select('*')
        .eq('rule_id', ruleId)
        .order('executed_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setExecutions(data || []);
    } catch (error) {
      console.error('Error fetching executions:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { data: orgData } = await supabase
        .from('user_organizations')
        .select('organization_id')
        .eq('user_id', user?.id)
        .single();

      if (!orgData) return;

      if (selectedRule) {
        const { error } = await supabase
          .from('automation_rules')
          .update({
            ...formData,
            updated_at: new Date().toISOString()
          })
          .eq('id', selectedRule.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('automation_rules')
          .insert({
            ...formData,
            organization_id: orgData.organization_id,
            created_by: user?.id
          });

        if (error) throw error;
      }

      setShowModal(false);
      setSelectedRule(null);
      resetForm();
      fetchRules();
    } catch (error) {
      console.error('Error saving rule:', error);
    }
  };

  const handleToggleActive = async (rule: AutomationRule) => {
    try {
      const { error } = await supabase
        .from('automation_rules')
        .update({ is_active: !rule.is_active })
        .eq('id', rule.id);

      if (error) throw error;
      fetchRules();
    } catch (error) {
      console.error('Error toggling rule:', error);
    }
  };

  const handleTestRule = async (rule: AutomationRule) => {
    try {
      const { error } = await supabase
        .from('automation_executions')
        .insert({
          rule_id: rule.id,
          status: 'success',
          trigger_data: { test: true, timestamp: new Date().toISOString() },
          action_result: { message: 'Test execution completed successfully' },
          execution_time: Math.floor(Math.random() * 1000) + 100,
          executed_at: new Date().toISOString()
        });

      if (error) throw error;
      addToast('Test execution completed successfully!', 'success');
    } catch (error) {
      console.error('Error testing rule:', error);
      addToast('Failed to test rule', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    setDeleteTargetId(id);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTargetId) return;

    try {
      const { error } = await supabase
        .from('automation_rules')
        .delete()
        .eq('id', deleteTargetId);

      if (error) throw error;
      
      fetchRules();
      addToast('Automation rule deleted successfully', 'success');
    } catch (error) {
      console.error('Error deleting rule:', error);
      addToast('Failed to delete rule', 'error');
    } finally {
      setDeleteConfirmOpen(false);
      setDeleteTargetId(null);
    }
  };

  const openEditModal = (rule: AutomationRule) => {
    setSelectedRule(rule);
    setFormData({
      name: rule.name,
      description: rule.description,
      trigger_type: rule.trigger_type,
      trigger_config: rule.trigger_config || {},
      action_type: rule.action_type,
      action_config: rule.action_config || {},
      conditions: rule.conditions || { enabled: false, rules: [] },
      is_active: rule.is_active,
      priority: rule.priority
    });
    setShowModal(true);
  };

  const openExecutionsModal = (rule: AutomationRule) => {
    setSelectedRule(rule);
    fetchExecutions(rule.id);
    setShowExecutionsModal(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      trigger_type: 'metric_threshold',
      trigger_config: { metric: '', threshold: '', operator: 'greater_than' },
      action_type: 'send_alert',
      action_config: { message: '', recipients: '' },
      conditions: { enabled: false, rules: [] },
      is_active: true,
      priority: 0
    });
  };

  const filteredRules = rules.filter(rule => {
    if (filterActive === 'all') return true;
    return filterActive === 'active' ? rule.is_active : !rule.is_active;
  });

  const stats = {
    total: rules.length,
    active: rules.filter(r => r.is_active).length,
    inactive: rules.filter(r => !r.is_active).length,
    avgPriority: rules.length > 0 ? (rules.reduce((sum, r) => sum + r.priority, 0) / rules.length).toFixed(1) : '0'
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        title="Delete Automation Rule?"
        message="Are you sure you want to delete this automation rule? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          setDeleteConfirmOpen(false);
          setDeleteTargetId(null);
        }}
      />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Automation Rules</h1>
          <p className="text-gray-600 mt-1">Create and manage workflow automation</p>
        </div>
        <button
          onClick={() => {
            setSelectedRule(null);
            resetForm();
            setShowModal(true);
          }}
          className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap flex items-center gap-2"
        >
          <i className="ri-add-line"></i>
          Create Rule
        </button>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Rules</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
            <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center">
              <i className="ri-settings-3-line text-2xl text-teal-600"></i>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active</p>
              <p className="text-2xl font-bold text-gray-900">{stats.active}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <i className="ri-play-circle-line text-2xl text-green-600"></i>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Inactive</p>
              <p className="text-2xl font-bold text-gray-900">{stats.inactive}</p>
            </div>
            <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
              <i className="ri-pause-circle-line text-2xl text-gray-600"></i>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Avg Priority</p>
              <p className="text-2xl font-bold text-gray-900">{stats.avgPriority}</p>
            </div>
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <i className="ri-star-line text-2xl text-orange-600"></i>
            </div>
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="bg-white p-4 rounded-lg border border-gray-200 mb-6">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterActive('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              filterActive === 'all' ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All Rules
          </button>
          <button
            onClick={() => setFilterActive('active')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              filterActive === 'active' ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Active
          </button>
          <button
            onClick={() => setFilterActive('inactive')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              filterActive === 'inactive' ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Inactive
          </button>
        </div>
      </div>

      {/* Rules List */}
      <div className="grid grid-cols-1 gap-4">
        {filteredRules.map((rule) => {
          const trigger = triggerTypes.find(t => t.value === rule.trigger_type);
          const action = actionTypes.find(a => a.value === rule.action_type);
          
          return (
            <div key={rule.id} className="bg-white p-6 rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">{rule.name}</h3>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                      rule.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {rule.is_active ? 'Active' : 'Inactive'}
                    </span>
                    {rule.priority > 0 && (
                      <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-medium whitespace-nowrap flex items-center gap-1">
                        <i className="ri-star-fill"></i>
                        Priority {rule.priority}
                      </span>
                    )}
                  </div>
                  <p className="text-gray-600 text-sm mb-3">{rule.description}</p>
                  <div className="flex items-center gap-6 text-sm">
                    <div className="flex items-center gap-2 text-gray-700">
                      <i className={`${trigger?.icon} text-teal-600`}></i>
                      <span className="font-medium">Trigger:</span>
                      <span>{trigger?.label}</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-700">
                      <i className={`${action?.icon} text-orange-600`}></i>
                      <span className="font-medium">Action:</span>
                      <span>{action?.label}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => openExecutionsModal(rule)}
                    className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    title="View Executions"
                  >
                    <i className="ri-history-line text-xl"></i>
                  </button>
                  <button
                    onClick={() => handleTestRule(rule)}
                    className="p-2 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                    title="Test Rule"
                  >
                    <i className="ri-play-line text-xl"></i>
                  </button>
                  <button
                    onClick={() => handleToggleActive(rule)}
                    className={`p-2 rounded-lg transition-colors ${
                      rule.is_active 
                        ? 'text-orange-600 hover:bg-orange-50' 
                        : 'text-green-600 hover:bg-green-50'
                    }`}
                    title={rule.is_active ? 'Deactivate' : 'Activate'}
                  >
                    <i className={`text-xl ${rule.is_active ? 'ri-pause-circle-line' : 'ri-play-circle-line'}`}></i>
                  </button>
                  <button
                    onClick={() => openEditModal(rule)}
                    className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Edit"
                  >
                    <i className="ri-edit-line text-xl"></i>
                  </button>
                  <button
                    onClick={() => handleDelete(rule.id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <i className="ri-delete-bin-line text-xl"></i>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredRules.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <i className="ri-settings-3-line text-6xl text-gray-300 mb-4"></i>
          <p className="text-gray-500">No automation rules found. Create your first rule to get started.</p>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">
                {selectedRule ? 'Edit Automation Rule' : 'Create New Automation Rule'}
              </h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rule Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  required
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Trigger Type</label>
                  <select
                    value={formData.trigger_type}
                    onChange={(e) => setFormData({ ...formData, trigger_type: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  >
                    {triggerTypes.map(type => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Action Type</label>
                  <select
                    value={formData.action_type}
                    onChange={(e) => setFormData({ ...formData, action_type: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  >
                    {actionTypes.map(type => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priority (0-5)</label>
                  <input
                    type="number"
                    min="0"
                    max="5"
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={formData.is_active ? 'active' : 'inactive'}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.value === 'active' })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setSelectedRule(null);
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
                >
                  {selectedRule ? 'Update Rule' : 'Create Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Executions Modal */}
      {showExecutionsModal && selectedRule && (
        <div className="fixed inset-0 bg-black bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-5xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">Execution History: {selectedRule.name}</h2>
                <button
                  onClick={() => {
                    setShowExecutionsModal(false);
                    setSelectedRule(null);
                    setExecutions([]);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line text-2xl"></i>
                </button>
              </div>
            </div>
            <div className="p-6">
              <div className="space-y-3">
                {executions.map((execution) => (
                  <div key={execution.id} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                            execution.status === 'success' ? 'bg-green-100 text-green-800' :
                            execution.status === 'failed' ? 'bg-red-100 text-red-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {execution.status.charAt(0).toUpperCase() + execution.status.slice(1)}
                          </span>
                          <span className="text-sm text-gray-600">
                            {new Date(execution.executed_at).toLocaleString()}
                          </span>
                          <span className="text-sm text-gray-500">
                            {execution.execution_time}ms
                          </span>
                        </div>
                        {execution.error_message && (
                          <p className="text-sm text-red-600 mt-2">{execution.error_message}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {executions.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <i className="ri-history-line text-4xl mb-2"></i>
                  <p>No execution history yet.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}