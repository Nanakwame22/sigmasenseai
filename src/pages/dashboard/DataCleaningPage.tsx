import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/useToast';
import ConfirmDialog from '../../components/common/ConfirmDialog';

interface CleaningRule {
  id: string;
  name: string;
  description: string;
  target_table: string;
  rule_type: string;
  conditions: any;
  action: any;
  status: string;
  priority: number;
  auto_apply: boolean;
  last_applied_at: string | null;
  records_affected: number;
  created_at: string;
}

interface CleaningLog {
  id: string;
  rule_id: string | null;
  operation_type: string;
  records_scanned: number;
  records_cleaned: number;
  records_removed: number;
  issues_found: any;
  actions_taken: any;
  status: string;
  error_message: string | null;
  executed_at: string;
}

type SupportedTargetRow =
  | {
      id: string;
      organization_id?: string;
      name?: string | null;
      unit?: string | null;
      category?: string | null;
      current_value?: number | null;
      target_value?: number | null;
      actual_value?: number | null;
    }
  | {
      id: string;
      metric_id: string;
      timestamp: string;
      value: number | null;
    };

export default function DataCleaningPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [rules, setRules] = useState<CleaningRule[]>([]);
  const [logs, setLogs] = useState<CleaningLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState<CleaningRule | null>(null);
  const [activeTab, setActiveTab] = useState<'rules' | 'logs'>('rules');
  const [filter, setFilter] = useState('all');

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
    target_table: 'metrics',
    rule_type: 'remove_duplicates',
    priority: 0,
    auto_apply: false,
    conditions: {
      field: '',
      operator: 'equals',
      value: ''
    },
    action: {
      type: 'remove',
      value: ''
    }
  });

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;

    try {
      const { data: userOrgs } = await supabase
        .from('user_organizations')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (!userOrgs) return;

      // Load rules
      const { data: rulesData, error: rulesError } = await supabase
        .from('data_cleaning_rules')
        .select('*')
        .eq('organization_id', userOrgs.organization_id)
        .order('priority', { ascending: false });

      if (rulesError) throw rulesError;
      setRules(rulesData || []);

      // Load logs
      const { data: logsData, error: logsError } = await supabase
        .from('data_cleaning_logs')
        .select('*')
        .eq('organization_id', userOrgs.organization_id)
        .order('executed_at', { ascending: false })
        .limit(50);

      if (logsError) throw logsError;
      setLogs(logsData || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      const { data: userOrgs } = await supabase
        .from('user_organizations')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (!userOrgs) return;

      const ruleData = {
        organization_id: userOrgs.organization_id,
        name: formData.name,
        description: formData.description,
        target_table: formData.target_table,
        rule_type: formData.rule_type,
        conditions: formData.conditions,
        action: formData.action,
        priority: formData.priority,
        auto_apply: formData.auto_apply,
        status: 'active',
        created_by: user.id
      };

      if (editingRule) {
        const { error } = await supabase
          .from('data_cleaning_rules')
          .update(ruleData)
          .eq('id', editingRule.id);

        if (error) throw error;
        showToast('Cleaning rule updated successfully', 'success');
      } else {
        const { error } = await supabase
          .from('data_cleaning_rules')
          .insert([ruleData]);

        if (error) throw error;
        showToast('Cleaning rule created successfully', 'success');
      }

      setShowModal(false);
      setEditingRule(null);
      resetForm();
      loadData();
    } catch (error) {
      console.error('Error saving rule:', error);
      showToast('Failed to save cleaning rule', 'error');
    }
  };

  const handleApplyRule = async (ruleId: string) => {
    if (!user) return;

    try {
      const { data: userOrgs } = await supabase
        .from('user_organizations')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (!userOrgs) return;

      const rule = rules.find(r => r.id === ruleId);
      if (!rule) return;

      const getRowsForTarget = async (): Promise<SupportedTargetRow[]> => {
        if (rule.target_table === 'metrics') {
          const { data, error } = await supabase
            .from('metrics')
            .select('id, organization_id, name, unit, category, current_value, target_value, actual_value')
            .eq('organization_id', userOrgs.organization_id);

          if (error) throw error;
          return (data || []) as SupportedTargetRow[];
        }

        if (rule.target_table === 'metric_data') {
          const { data: metricsData, error: metricsError } = await supabase
            .from('metrics')
            .select('id')
            .eq('organization_id', userOrgs.organization_id);

          if (metricsError) throw metricsError;

          const metricIds = (metricsData || []).map((metric) => metric.id);
          if (metricIds.length === 0) return [];

          const { data, error } = await supabase
            .from('metric_data')
            .select('id, metric_id, timestamp, value')
            .in('metric_id', metricIds);

          if (error) throw error;
          return (data || []) as SupportedTargetRow[];
        }

        throw new Error(`Unsupported target table "${rule.target_table}". Use metrics or metric_data.`);
      };

      const rows = await getRowsForTarget();
      const field = rule.conditions?.field || (rule.target_table === 'metrics' ? 'name' : 'value');
      const recordsScanned = rows.length;
      let recordsCleaned = 0;
      let recordsRemoved = 0;
      let duplicates = 0;
      let missingValues = 0;
      let invalidFormats = 0;
      let flagged = 0;

      const updateMetricsField = async (ids: string[], value: unknown) => {
        for (const id of ids) {
          const { error } = await supabase
            .from('metrics')
            .update({ [field]: value })
            .eq('id', id);
          if (error) throw error;
        }
      };

      const updateMetricDataField = async (ids: string[], value: unknown) => {
        for (const id of ids) {
          const { error } = await supabase
            .from('metric_data')
            .update({ [field]: value })
            .eq('id', id);
          if (error) throw error;
        }
      };

      if (rule.rule_type === 'remove_duplicates') {
        const seen = new Map<string, string>();
        const duplicateIds: string[] = [];

        rows.forEach((row) => {
          const duplicateKey =
            rule.target_table === 'metric_data'
              ? `${(row as any).metric_id}:${(row as any).timestamp}:${String((row as any)[field] ?? '')}`
              : String((row as any)[field] ?? '').trim().toLowerCase();

          if (!duplicateKey) return;
          if (seen.has(duplicateKey)) {
            duplicateIds.push(row.id);
          } else {
            seen.set(duplicateKey, row.id);
          }
        });

        duplicates = duplicateIds.length;
        if (duplicates > 0 && rule.action?.type === 'remove') {
          const tableName = rule.target_table === 'metric_data' ? 'metric_data' : 'metrics';
          const { error } = await supabase
            .from(tableName)
            .delete()
            .in('id', duplicateIds);

          if (error) throw error;
          recordsRemoved = duplicateIds.length;
          recordsCleaned = duplicateIds.length;
        } else {
          flagged = duplicates;
        }
      }

      if (rule.rule_type === 'fill_missing') {
        const missingIds = rows
          .filter((row) => {
            const value = (row as any)[field];
            return value === null || value === undefined || String(value).trim() === '';
          })
          .map((row) => row.id);

        missingValues = missingIds.length;
        if (missingIds.length > 0 && rule.action?.value !== undefined && rule.action?.value !== '') {
          if (rule.target_table === 'metrics') {
            await updateMetricsField(missingIds, rule.action.value);
          } else {
            await updateMetricDataField(missingIds, rule.action.value);
          }
          recordsCleaned += missingIds.length;
        } else {
          flagged += missingIds.length;
        }
      }

      if (rule.rule_type === 'standardize') {
        const normalizedRows = rows.filter((row) => {
          const value = (row as any)[field];
          return typeof value === 'string' && value.trim() !== value;
        });

        if (normalizedRows.length > 0) {
          const ids = normalizedRows.map((row) => row.id);
          if (rule.target_table === 'metrics') {
            for (const row of normalizedRows) {
              const { error } = await supabase
                .from('metrics')
                .update({ [field]: String((row as any)[field]).trim() })
                .eq('id', row.id);
              if (error) throw error;
            }
          } else {
            flagged += ids.length;
          }
          recordsCleaned += normalizedRows.length;
        }
      }

      if (rule.rule_type === 'validate') {
        const expectedType = String(rule.action?.value || '').toLowerCase();
        const invalidRows = rows.filter((row) => {
          const value = (row as any)[field];
          if (value === null || value === undefined || String(value).trim() === '') return true;
          if (expectedType === 'number') return Number.isNaN(Number(value));
          if (expectedType === 'date') return Number.isNaN(new Date(String(value)).getTime());
          return false;
        });

        invalidFormats = invalidRows.length;
        flagged += invalidRows.length;
      }

      if (rule.rule_type === 'transform') {
        const matchingRows = rows.filter((row) => {
          const value = (row as any)[field];
          if (rule.conditions?.operator === 'equals') return String(value ?? '') === String(rule.conditions?.value ?? '');
          if (rule.conditions?.operator === 'contains') return String(value ?? '').includes(String(rule.conditions?.value ?? ''));
          return true;
        });

        if (matchingRows.length > 0 && rule.action?.value !== undefined && rule.action?.value !== '') {
          const ids = matchingRows.map((row) => row.id);
          if (rule.target_table === 'metrics') {
            await updateMetricsField(ids, rule.action.value);
          } else {
            await updateMetricDataField(ids, rule.action.value);
          }
          recordsCleaned += ids.length;
        } else {
          flagged += matchingRows.length;
        }
      }

      const logData = {
        rule_id: ruleId,
        organization_id: userOrgs.organization_id,
        operation_type: rule.rule_type,
        records_scanned: recordsScanned,
        records_cleaned: recordsCleaned,
        records_removed: recordsRemoved,
        issues_found: {
          duplicates,
          missing_values: missingValues,
          invalid_formats: invalidFormats
        },
        actions_taken: {
          removed: recordsRemoved,
          updated: recordsCleaned - recordsRemoved,
          flagged
        },
        status: 'completed',
        executed_by: user.id
      };

      const { error: logError } = await supabase
        .from('data_cleaning_logs')
        .insert([logData]);

      if (logError) throw logError;

      // Update rule stats
      const { error: updateError } = await supabase
        .from('data_cleaning_rules')
        .update({
          last_applied_at: new Date().toISOString(),
          records_affected: rule.records_affected + recordsCleaned
        })
        .eq('id', ruleId);

      if (updateError) throw updateError;

      loadData();
      showToast(
        `Cleaning completed! ${recordsCleaned} records cleaned, ${recordsRemoved} records removed.`,
        'success'
      );
    } catch (error) {
      console.error('Error applying rule:', error);
      showToast('Failed to apply cleaning rule', 'error');
    }
  };

  const handleToggleStatus = async (rule: CleaningRule) => {
    try {
      const newStatus = rule.status === 'active' ? 'inactive' : 'active';
      const { error } = await supabase
        .from('data_cleaning_rules')
        .update({ status: newStatus })
        .eq('id', rule.id);

      if (error) throw error;
      loadData();
    } catch (error) {
      console.error('Error toggling rule status:', error);
    }
  };

  const handleDelete = async (id: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Cleaning Rule',
      message: 'Are you sure you want to delete this cleaning rule? This action cannot be undone.',
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from('data_cleaning_rules')
            .delete()
            .eq('id', id);

          if (error) throw error;
          
          showToast('Cleaning rule deleted successfully', 'success');
          loadData();
        } catch (error) {
          console.error('Error deleting rule:', error);
          showToast('Failed to delete cleaning rule', 'error');
        }
        setConfirmDialog({ ...confirmDialog, isOpen: false });
      }
    });
  };

  const handleEdit = (rule: CleaningRule) => {
    setEditingRule(rule);
    setFormData({
      name: rule.name,
      description: rule.description || '',
      target_table: rule.target_table,
      rule_type: rule.rule_type,
      priority: rule.priority,
      auto_apply: rule.auto_apply,
      conditions: rule.conditions || { field: '', operator: 'equals', value: '' },
      action: rule.action || { type: 'remove', value: '' }
    });
    setShowModal(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      target_table: 'metrics',
      rule_type: 'remove_duplicates',
      priority: 0,
      auto_apply: false,
      conditions: { field: '', operator: 'equals', value: '' },
      action: { type: 'remove', value: '' }
    });
  };

  const filteredRules = rules.filter(rule => {
    if (filter === 'all') return true;
    return rule.rule_type === filter;
  });

  const stats = {
    totalRules: rules.length,
    activeRules: rules.filter(r => r.status === 'active').length,
    totalCleaned: rules.reduce((sum, r) => sum + r.records_affected, 0),
    recentLogs: logs.filter(l => new Date(l.executed_at) > new Date(Date.now() - 86400000)).length
  };

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
          <h1 className="text-2xl font-bold text-gray-900">Data Cleaning</h1>
          <p className="text-sm text-gray-600 mt-1">Automated data cleansing and quality improvement</p>
        </div>
        <button
          onClick={() => {
            setEditingRule(null);
            resetForm();
            setShowModal(true);
          }}
          className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap flex items-center gap-2"
        >
          <i className="ri-add-line"></i>
          Create Rule
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Rules</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats.totalRules}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <i className="ri-file-list-3-line text-2xl text-blue-600"></i>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active Rules</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{stats.activeRules}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <i className="ri-checkbox-circle-line text-2xl text-green-600"></i>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Records Cleaned</p>
              <p className="text-2xl font-bold text-teal-600 mt-1">{stats.totalCleaned.toLocaleString()}</p>
            </div>
            <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center">
              <i className="ri-brush-line text-2xl text-teal-600"></i>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Today's Operations</p>
              <p className="text-2xl font-bold text-purple-600 mt-1">{stats.recentLogs}</p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <i className="ri-time-line text-2xl text-purple-600"></i>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('rules')}
            className={`px-4 py-2 border-b-2 font-medium transition-colors whitespace-nowrap ${
              activeTab === 'rules'
                ? 'border-teal-600 text-teal-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Cleaning Rules
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-4 py-2 border-b-2 font-medium transition-colors whitespace-nowrap ${
              activeTab === 'logs'
                ? 'border-teal-600 text-teal-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Operation Logs
          </button>
        </div>
      </div>

      {activeTab === 'rules' && (
        <>
          {/* Filters */}
          <div className="flex gap-2">
            {['all', 'remove_duplicates', 'fill_missing', 'standardize', 'validate', 'transform'].map((type) => (
              <button
                key={type}
                onClick={() => setFilter(type)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  filter === type
                    ? 'bg-teal-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {type === 'all' ? 'All' : type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </button>
            ))}
          </div>

          {/* Rules List */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rule</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Target</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Priority</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Records Affected</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Applied</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredRules.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                        <i className="ri-brush-line text-4xl mb-2"></i>
                        <p>No cleaning rules found</p>
                        <p className="text-sm mt-1">Create your first cleaning rule</p>
                      </td>
                    </tr>
                  ) : (
                    filteredRules.map((rule) => (
                      <tr key={rule.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div>
                            <p className="font-medium text-gray-900">{rule.name}</p>
                            {rule.description && (
                              <p className="text-xs text-gray-500 mt-1">{rule.description}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded">
                            {rule.rule_type.replace('_', ' ').toUpperCase()}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 capitalize">{rule.target_table}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 text-xs font-medium rounded ${
                            rule.status === 'active' ? 'bg-green-100 text-green-700' :
                            rule.status === 'testing' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {rule.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1">
                            {[...Array(5)].map((_, i) => (
                              <i
                                key={i}
                                className={`ri-star-${i < rule.priority ? 'fill' : 'line'} text-yellow-500`}
                              ></i>
                            ))}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">{rule.records_affected.toLocaleString()}</td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {rule.last_applied_at ? new Date(rule.last_applied_at).toLocaleString() : 'Never'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleApplyRule(rule.id)}
                              className="p-2 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                              title="Apply Rule"
                            >
                              <i className="ri-play-line"></i>
                            </button>
                            <button
                              onClick={() => handleToggleStatus(rule)}
                              className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                              title={rule.status === 'active' ? 'Deactivate' : 'Activate'}
                            >
                              <i className={`ri-${rule.status === 'active' ? 'pause' : 'play'}-circle-line`}></i>
                            </button>
                            <button
                              onClick={() => handleEdit(rule)}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Edit"
                            >
                              <i className="ri-edit-line"></i>
                            </button>
                            <button
                              onClick={() => handleDelete(rule.id)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete"
                            >
                              <i className="ri-delete-bin-line"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeTab === 'logs' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Recent Operations</h2>
          </div>
          <div className="divide-y divide-gray-200 max-h-[600px] overflow-y-auto">
            {logs.length === 0 ? (
              <div className="p-12 text-center text-gray-500">
                <i className="ri-file-list-line text-4xl mb-2"></i>
                <p>No operation logs yet</p>
              </div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-1 text-xs font-medium rounded ${
                          log.status === 'completed' ? 'bg-green-100 text-green-700' :
                          log.status === 'failed' ? 'bg-red-100 text-red-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>
                          {log.status}
                        </span>
                        <span className="text-xs text-gray-500 capitalize">{log.operation_type.replace('_', ' ')}</span>
                      </div>
                      <p className="text-sm text-gray-600">{new Date(log.executed_at).toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-4 mt-3">
                    <div>
                      <p className="text-xs text-gray-600">Scanned</p>
                      <p className="text-sm font-medium text-gray-900">{log.records_scanned.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Cleaned</p>
                      <p className="text-sm font-medium text-teal-600">{log.records_cleaned.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Removed</p>
                      <p className="text-sm font-medium text-red-600">{log.records_removed.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Success Rate</p>
                      <p className="text-sm font-medium text-green-600">
                        {log.records_scanned > 0
                          ? Math.round((log.records_cleaned / log.records_scanned) * 100)
                          : 0}%
                      </p>
                    </div>
                  </div>

                  {log.error_message && (
                    <p className="text-xs text-red-600 mt-2">{log.error_message}</p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">
                {editingRule ? 'Edit Cleaning Rule' : 'Create Cleaning Rule'}
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  placeholder="Remove duplicate entries"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  rows={2}
                  placeholder="Describe what this rule does..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Target Table</label>
                  <select
                    value={formData.target_table}
                    onChange={(e) => setFormData({ ...formData, target_table: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  >
                    <option value="metrics">Metrics</option>
                    <option value="metric_data">Metric Data</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rule Type</label>
                  <select
                    value={formData.rule_type}
                    onChange={(e) => setFormData({ ...formData, rule_type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  >
                    <option value="remove_duplicates">Remove Duplicates</option>
                    <option value="fill_missing">Fill Missing Values</option>
                    <option value="standardize">Standardize Format</option>
                    <option value="validate">Validate Data</option>
                    <option value="transform">Transform Values</option>
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  />
                </div>

                <div className="flex items-center pt-6">
                  <input
                    type="checkbox"
                    id="auto_apply"
                    checked={formData.auto_apply}
                    onChange={(e) => setFormData({ ...formData, auto_apply: e.target.checked })}
                    className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                  />
                  <label htmlFor="auto_apply" className="ml-2 text-sm text-gray-700">
                    Auto-apply this rule
                  </label>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditingRule(null);
                    resetForm();
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
                >
                  {editingRule ? 'Update Rule' : 'Create Rule'}
                </button>
              </div>
            </form>
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
