import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { addToast } from '../../hooks/useToast';
import ConfirmDialog from '../../components/common/ConfirmDialog';

interface APIKey {
  id: string;
  name: string;
  key_value: string;
  permissions: string[];
  status: string;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  status: string;
  secret: string;
  retry_count: number;
  timeout: number;
  last_triggered_at: string | null;
  success_count: number;
  failure_count: number;
  created_at: string;
}

interface WebhookLog {
  id: string;
  webhook_id: string;
  event: string;
  response_status: number | null;
  duration_ms: number | null;
  success: boolean;
  error_message: string | null;
  created_at: string;
}

export default function APIWebhooksPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'api' | 'webhooks'>('api');
  const [apiKeys, setApiKeys] = useState<APIKey[]>([]);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [webhookLogs, setWebhookLogs] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAPIModal, setShowAPIModal] = useState(false);
  const [showWebhookModal, setShowWebhookModal] = useState(false);
  const [selectedWebhook, setSelectedWebhook] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'api' | 'webhook', id: string } | null>(null);

  const [apiFormData, setApiFormData] = useState({
    name: '',
    permissions: [] as string[],
    expires_at: ''
  });

  const [webhookFormData, setWebhookFormData] = useState({
    name: '',
    url: '',
    events: [] as string[],
    retry_count: 3,
    timeout: 30
  });

  const availablePermissions = ['read:metrics', 'write:metrics', 'read:alerts', 'write:alerts', 'read:projects', 'write:projects'];
  const availableEvents = ['metric.created', 'metric.updated', 'alert.triggered', 'project.completed', 'data.synced'];

  useEffect(() => {
    fetchData();
  }, [user, activeTab]);

  const fetchData = async () => {
    if (!user) return;

    try {
      const { data: orgData } = await supabase
        .from('user_organizations')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (!orgData) return;

      if (activeTab === 'api') {
        const { data, error } = await supabase
          .from('api_keys')
          .select('*')
          .eq('organization_id', orgData.organization_id)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setApiKeys(data || []);
      } else {
        const { data, error } = await supabase
          .from('webhooks')
          .select('*')
          .eq('organization_id', orgData.organization_id)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setWebhooks(data || []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchWebhookLogs = async (webhookId: string) => {
    try {
      const { data, error } = await supabase
        .from('webhook_logs')
        .select('*')
        .eq('webhook_id', webhookId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setWebhookLogs(data || []);
    } catch (error) {
      console.error('Error fetching webhook logs:', error);
    }
  };

  const generateAPIKey = () => {
    return 'sk_' + Array.from({ length: 32 }, () => 
      'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 62)]
    ).join('');
  };

  const generateSecret = () => {
    return 'whsec_' + Array.from({ length: 32 }, () => 
      'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 62)]
    ).join('');
  };

  const handleCreateAPIKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      const { data: orgData } = await supabase
        .from('user_organizations')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (!orgData) return;

      const { error } = await supabase
        .from('api_keys')
        .insert([{
          organization_id: orgData.organization_id,
          name: apiFormData.name,
          key_value: generateAPIKey(),
          permissions: apiFormData.permissions,
          status: 'active',
          expires_at: apiFormData.expires_at || null,
          created_by: user.id
        }]);

      if (error) throw error;

      setShowAPIModal(false);
      setApiFormData({ name: '', permissions: [], expires_at: '' });
      fetchData();
    } catch (error) {
      console.error('Error creating API key:', error);
    }
  };

  const handleCreateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      const { data: orgData } = await supabase
        .from('user_organizations')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (!orgData) return;

      const { error } = await supabase
        .from('webhooks')
        .insert([{
          organization_id: orgData.organization_id,
          name: webhookFormData.name,
          url: webhookFormData.url,
          events: webhookFormData.events,
          secret: generateSecret(),
          retry_count: webhookFormData.retry_count,
          timeout: webhookFormData.timeout,
          status: 'active',
          created_by: user.id
        }]);

      if (error) throw error;

      setShowWebhookModal(false);
      setWebhookFormData({ name: '', url: '', events: [], retry_count: 3, timeout: 30 });
      fetchData();
    } catch (error) {
      console.error('Error creating webhook:', error);
    }
  };

  const toggleAPIKeyStatus = async (id: string, currentStatus: string) => {
    try {
      const { error } = await supabase
        .from('api_keys')
        .update({ status: currentStatus === 'active' ? 'inactive' : 'active' })
        .eq('id', id);

      if (error) throw error;
      fetchData();
    } catch (error) {
      console.error('Error toggling API key status:', error);
    }
  };

  const toggleWebhookStatus = async (id: string, currentStatus: string) => {
    try {
      const { error } = await supabase
        .from('webhooks')
        .update({ status: currentStatus === 'active' ? 'inactive' : 'active' })
        .eq('id', id);

      if (error) throw error;
      fetchData();
    } catch (error) {
      console.error('Error toggling webhook status:', error);
    }
  };

  const deleteAPIKey = async (id: string) => {
    setDeleteTarget({ type: 'api', id });
    setDeleteConfirmOpen(true);
  };

  const deleteWebhook = async (id: string) => {
    setDeleteTarget({ type: 'webhook', id });
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;

    try {
      const table = deleteTarget.type === 'api' ? 'api_keys' : 'webhooks';
      const { error } = await supabase
        .from(table)
        .delete()
        .eq('id', deleteTarget.id);

      if (error) throw error;
      
      fetchData();
      addToast(`${deleteTarget.type === 'api' ? 'API key' : 'Webhook'} deleted successfully`, 'success');
    } catch (error) {
      console.error('Error deleting:', error);
      addToast(`Failed to delete ${deleteTarget.type === 'api' ? 'API key' : 'webhook'}`, 'error');
    } finally {
      setDeleteConfirmOpen(false);
      setDeleteTarget(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    addToast('Copied to clipboard!', 'success');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        title={`Delete ${deleteTarget?.type === 'api' ? 'API Key' : 'Webhook'}?`}
        message={`Are you sure you want to delete this ${deleteTarget?.type === 'api' ? 'API key' : 'webhook'}? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          setDeleteConfirmOpen(false);
          setDeleteTarget(null);
        }}
      />

      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">API & Webhooks</h1>
          <p className="text-gray-600 mt-2">Integrate with external systems and automate workflows</p>
        </div>
        <button
          onClick={() => activeTab === 'api' ? setShowAPIModal(true) : setShowWebhookModal(true)}
          className="px-6 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-2 whitespace-nowrap"
        >
          <i className="ri-add-line"></i>
          {activeTab === 'api' ? 'Create API Key' : 'Create Webhook'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 bg-white rounded-lg p-1 border border-gray-200 w-fit">
        <button
          onClick={() => setActiveTab('api')}
          className={`px-6 py-2 rounded-lg transition-colors whitespace-nowrap ${
            activeTab === 'api'
              ? 'bg-teal-600 text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <i className="ri-key-line mr-2"></i>
          API Keys
        </button>
        <button
          onClick={() => setActiveTab('webhooks')}
          className={`px-6 py-2 rounded-lg transition-colors whitespace-nowrap ${
            activeTab === 'webhooks'
              ? 'bg-teal-600 text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <i className="ri-webhook-line mr-2"></i>
          Webhooks
        </button>
      </div>

      {/* API Keys Tab */}
      {activeTab === 'api' && (
        <div className="space-y-4">
          {apiKeys.map((key) => (
            <div key={key.id} className="bg-white rounded-xl p-6 border border-gray-200">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{key.name}</h3>
                  <div className="flex items-center gap-2 mt-2">
                    <code className="px-3 py-1 bg-gray-100 text-gray-800 rounded text-sm font-mono">
                      {key.key_value}
                    </code>
                    <button
                      onClick={() => copyToClipboard(key.key_value)}
                      className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <i className="ri-file-copy-line"></i>
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-sm ${
                    key.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-700'
                  }`}>
                    {key.status}
                  </span>
                  <button
                    onClick={() => toggleAPIKeyStatus(key.id, key.status)}
                    className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <i className={`ri-${key.status === 'active' ? 'pause' : 'play'}-line`}></i>
                  </button>
                  <button
                    onClick={() => deleteAPIKey(key.id)}
                    className="w-8 h-8 flex items-center justify-center text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                  >
                    <i className="ri-delete-bin-line"></i>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <p className="text-sm text-gray-600">Permissions</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {key.permissions.map((perm) => (
                      <span key={perm} className="px-2 py-1 bg-teal-100 text-teal-700 text-xs rounded">
                        {perm}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Last Used</p>
                  <p className="text-sm font-medium text-gray-900">
                    {key.last_used_at ? new Date(key.last_used_at).toLocaleDateString() : 'Never'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Expires</p>
                  <p className="text-sm font-medium text-gray-900">
                    {key.expires_at ? new Date(key.expires_at).toLocaleDateString() : 'Never'}
                  </p>
                </div>
              </div>
            </div>
          ))}

          {apiKeys.length === 0 && (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
              <i className="ri-key-line text-6xl text-gray-300 mb-4"></i>
              <p className="text-gray-600">No API keys yet. Create your first API key to get started.</p>
            </div>
          )}
        </div>
      )}

      {/* Webhooks Tab */}
      {activeTab === 'webhooks' && (
        <div className="space-y-4">
          {webhooks.map((webhook) => (
            <div key={webhook.id} className="bg-white rounded-xl p-6 border border-gray-200">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{webhook.name}</h3>
                  <p className="text-sm text-gray-600 mt-1">{webhook.url}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-sm ${
                    webhook.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-700'
                  }`}>
                    {webhook.status}
                  </span>
                  <button
                    onClick={() => {
                      setSelectedWebhook(webhook.id);
                      fetchWebhookLogs(webhook.id);
                    }}
                    className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <i className="ri-history-line"></i>
                  </button>
                  <button
                    onClick={() => toggleWebhookStatus(webhook.id, webhook.status)}
                    className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <i className={`ri-${webhook.status === 'active' ? 'pause' : 'play'}-line`}></i>
                  </button>
                  <button
                    onClick={() => deleteWebhook(webhook.id)}
                    className="w-8 h-8 flex items-center justify-center text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                  >
                    <i className="ri-delete-bin-line"></i>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4 mb-4">
                <div>
                  <p className="text-sm text-gray-600">Events</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {webhook.events.map((event) => (
                      <span key={event} className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded">
                        {event}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Success Rate</p>
                  <p className="text-sm font-medium text-gray-900">
                    {webhook.success_count + webhook.failure_count > 0
                      ? `${Math.round((webhook.success_count / (webhook.success_count + webhook.failure_count)) * 100)}%`
                      : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Total Calls</p>
                  <p className="text-sm font-medium text-gray-900">
                    {webhook.success_count + webhook.failure_count}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Last Triggered</p>
                  <p className="text-sm font-medium text-gray-900">
                    {webhook.last_triggered_at ? new Date(webhook.last_triggered_at).toLocaleDateString() : 'Never'}
                  </p>
                </div>
              </div>

              {selectedWebhook === webhook.id && webhookLogs.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">Recent Activity</h4>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {webhookLogs.map((log) => (
                      <div key={log.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <i className={`ri-${log.success ? 'checkbox-circle' : 'close-circle'}-line text-lg ${
                            log.success ? 'text-emerald-600' : 'text-rose-600'
                          }`}></i>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{log.event}</p>
                            {log.error_message && (
                              <p className="text-xs text-rose-600">{log.error_message}</p>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-600">
                            {new Date(log.created_at).toLocaleString()}
                          </p>
                          {log.duration_ms && (
                            <p className="text-xs text-gray-500">{log.duration_ms}ms</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}

          {webhooks.length === 0 && (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
              <i className="ri-webhook-line text-6xl text-gray-300 mb-4"></i>
              <p className="text-gray-600">No webhooks yet. Create your first webhook to get started.</p>
            </div>
          )}
        </div>
      )}

      {/* API Key Modal */}
      {showAPIModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">Create API Key</h2>
            </div>

            <form onSubmit={handleCreateAPIKey} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Key Name *</label>
                <input
                  type="text"
                  required
                  value={apiFormData.name}
                  onChange={(e) => setApiFormData({ ...apiFormData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  placeholder="e.g., Production API Key"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Permissions *</label>
                <div className="space-y-2">
                  {availablePermissions.map((perm) => (
                    <label key={perm} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={apiFormData.permissions.includes(perm)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setApiFormData({ ...apiFormData, permissions: [...apiFormData.permissions, perm] });
                          } else {
                            setApiFormData({ ...apiFormData, permissions: apiFormData.permissions.filter(p => p !== perm) });
                          }
                        }}
                        className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                      />
                      <span className="text-sm text-gray-700">{perm}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Expiration Date (Optional)</label>
                <input
                  type="date"
                  value={apiFormData.expires_at}
                  onChange={(e) => setApiFormData({ ...apiFormData, expires_at: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAPIModal(false);
                    setApiFormData({ name: '', permissions: [], expires_at: '' });
                  }}
                  className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
                >
                  Create Key
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Webhook Modal */}
      {showWebhookModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">Create Webhook</h2>
            </div>

            <form onSubmit={handleCreateWebhook} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Webhook Name *</label>
                <input
                  type="text"
                  required
                  value={webhookFormData.name}
                  onChange={(e) => setWebhookFormData({ ...webhookFormData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  placeholder="e.g., Slack Notifications"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Webhook URL *</label>
                <input
                  type="url"
                  required
                  value={webhookFormData.url}
                  onChange={(e) => setWebhookFormData({ ...webhookFormData, url: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  placeholder="https://example.com/webhook"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Events *</label>
                <div className="space-y-2">
                  {availableEvents.map((event) => (
                    <label key={event} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={webhookFormData.events.includes(event)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setWebhookFormData({ ...webhookFormData, events: [...webhookFormData.events, event] });
                          } else {
                            setWebhookFormData({ ...webhookFormData, events: webhookFormData.events.filter(ev => ev !== event) });
                          }
                        }}
                        className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                      />
                      <span className="text-sm text-gray-700">{event}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Retry Count</label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={webhookFormData.retry_count}
                    onChange={(e) => setWebhookFormData({ ...webhookFormData, retry_count: parseInt(e.target.value) })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Timeout (seconds)</label>
                  <input
                    type="number"
                    min="5"
                    max="120"
                    value={webhookFormData.timeout}
                    onChange={(e) => setWebhookFormData({ ...webhookFormData, timeout: parseInt(e.target.value) })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowWebhookModal(false);
                    setWebhookFormData({ name: '', url: '', events: [], retry_count: 3, timeout: 30 });
                  }}
                  className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
                >
                  Create Webhook
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}