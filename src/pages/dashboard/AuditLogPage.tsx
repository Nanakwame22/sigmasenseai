import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_name: string | null;
  changes: any;
  ip_address: string | null;
  user_agent: string | null;
  severity: string;
  status: string;
  error_message: string | null;
  metadata: any;
  created_at: string;
  user_profiles?: {
    full_name: string;
    email: string;
  };
}

export default function AuditLogPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState('all');
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [filterEntity, setFilterEntity] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  useEffect(() => {
    fetchLogs();
  }, [user]);

  const fetchLogs = async () => {
    if (!user) return;

    try {
      const { data: orgData } = await supabase
        .from('user_organizations')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (!orgData) return;

      const { data, error } = await supabase
        .from('audit_logs')
        .select(`
          *,
          user_profiles (
            full_name,
            email
          )
        `)
        .eq('organization_id', orgData.organization_id)
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = logs.filter(log => {
    const matchesAction = filterAction === 'all' || log.action === filterAction;
    const matchesSeverity = filterSeverity === 'all' || log.severity === filterSeverity;
    const matchesEntity = filterEntity === 'all' || log.entity_type === filterEntity;
    const matchesSearch = 
      log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.entity_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.entity_name && log.entity_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (log.user_profiles?.full_name && log.user_profiles.full_name.toLowerCase().includes(searchTerm.toLowerCase()));
    
    return matchesAction && matchesSeverity && matchesEntity && matchesSearch;
  });

  const actions = ['all', ...Array.from(new Set(logs.map(l => l.action)))];
  const entityTypes = ['all', ...Array.from(new Set(logs.map(l => l.entity_type)))];

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-rose-100 text-rose-700';
      case 'error': return 'bg-orange-100 text-orange-700';
      case 'warning': return 'bg-amber-100 text-amber-700';
      case 'info': return 'bg-blue-100 text-blue-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return 'ri-error-warning-line';
      case 'error': return 'ri-close-circle-line';
      case 'warning': return 'ri-alert-line';
      case 'info': return 'ri-information-line';
      default: return 'ri-checkbox-circle-line';
    }
  };

  const getActionIcon = (action: string) => {
    if (action.includes('create')) return 'ri-add-circle-line';
    if (action.includes('update')) return 'ri-edit-line';
    if (action.includes('delete')) return 'ri-delete-bin-line';
    if (action.includes('login')) return 'ri-login-box-line';
    if (action.includes('logout')) return 'ri-logout-box-line';
    return 'ri-file-list-line';
  };

  const getStatusColor = (status: string) => {
    return status === 'success' ? 'text-emerald-600' : 'text-rose-600';
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
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Audit Log</h1>
          <p className="text-gray-600 mt-2">Complete activity tracking and security monitoring</p>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <i className="ri-file-list-line text-blue-600 text-xl"></i>
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Events</p>
              <p className="text-2xl font-bold text-gray-900">{logs.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-rose-100 rounded-lg flex items-center justify-center">
              <i className="ri-error-warning-line text-rose-600 text-xl"></i>
            </div>
            <div>
              <p className="text-sm text-gray-600">Critical</p>
              <p className="text-2xl font-bold text-gray-900">
                {logs.filter(l => l.severity === 'critical').length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <i className="ri-close-circle-line text-orange-600 text-xl"></i>
            </div>
            <div>
              <p className="text-sm text-gray-600">Errors</p>
              <p className="text-2xl font-bold text-gray-900">
                {logs.filter(l => l.severity === 'error').length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
              <i className="ri-alert-line text-amber-600 text-xl"></i>
            </div>
            <div>
              <p className="text-sm text-gray-600">Warnings</p>
              <p className="text-2xl font-bold text-gray-900">
                {logs.filter(l => l.severity === 'warning').length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
              <i className="ri-checkbox-circle-line text-emerald-600 text-xl"></i>
            </div>
            <div>
              <p className="text-sm text-gray-600">Success Rate</p>
              <p className="text-2xl font-bold text-gray-900">
                {logs.length > 0 ? Math.round((logs.filter(l => l.status === 'success').length / logs.length) * 100) : 0}%
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-6 border border-gray-200 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <input
            type="text"
            placeholder="Search logs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
          />
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
          >
            {actions.map(action => (
              <option key={action} value={action}>
                {action === 'all' ? 'All Actions' : action}
              </option>
            ))}
          </select>
          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
          >
            <option value="all">All Severities</option>
            <option value="critical">Critical</option>
            <option value="error">Error</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </select>
          <select
            value={filterEntity}
            onChange={(e) => setFilterEntity(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
          >
            {entityTypes.map(type => (
              <option key={type} value={type}>
                {type === 'all' ? 'All Entities' : type}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Timestamp
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Action
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Entity
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Severity
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {log.user_profiles?.full_name || 'System'}
                    </div>
                    <div className="text-xs text-gray-500">
                      {log.user_profiles?.email || 'Automated'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <i className={`${getActionIcon(log.action)} text-gray-600`}></i>
                      <span className="text-sm text-gray-900">{log.action}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{log.entity_type}</div>
                    {log.entity_name && (
                      <div className="text-xs text-gray-500">{log.entity_name}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getSeverityColor(log.severity)}`}>
                      <i className={getSeverityIcon(log.severity)}></i>
                      {log.severity}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <i className={`ri-${log.status === 'success' ? 'checkbox-circle' : 'close-circle'}-line text-lg ${getStatusColor(log.status)}`}></i>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => setSelectedLog(log)}
                      className="text-teal-600 hover:text-teal-700 text-sm font-medium whitespace-nowrap"
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredLogs.length === 0 && (
          <div className="text-center py-12">
            <i className="ri-file-list-line text-6xl text-gray-300 mb-4"></i>
            <p className="text-gray-600">No audit logs found matching your filters.</p>
          </div>
        )}
      </div>

      {/* Details Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Audit Log Details</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    {new Date(selectedLog.created_at).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedLog(null)}
                  className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">User</p>
                  <p className="text-sm text-gray-900">{selectedLog.user_profiles?.full_name || 'System'}</p>
                  <p className="text-xs text-gray-500">{selectedLog.user_profiles?.email || 'Automated'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Action</p>
                  <p className="text-sm text-gray-900">{selectedLog.action}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Entity Type</p>
                  <p className="text-sm text-gray-900">{selectedLog.entity_type}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Entity Name</p>
                  <p className="text-sm text-gray-900">{selectedLog.entity_name || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Severity</p>
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getSeverityColor(selectedLog.severity)}`}>
                    <i className={getSeverityIcon(selectedLog.severity)}></i>
                    {selectedLog.severity}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Status</p>
                  <span className={`text-sm font-medium ${getStatusColor(selectedLog.status)}`}>
                    {selectedLog.status}
                  </span>
                </div>
              </div>

              {selectedLog.ip_address && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">IP Address</p>
                  <p className="text-sm text-gray-900">{selectedLog.ip_address}</p>
                </div>
              )}

              {selectedLog.user_agent && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">User Agent</p>
                  <p className="text-sm text-gray-900 break-all">{selectedLog.user_agent}</p>
                </div>
              )}

              {selectedLog.error_message && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Error Message</p>
                  <p className="text-sm text-rose-600">{selectedLog.error_message}</p>
                </div>
              )}

              {selectedLog.changes && Object.keys(selectedLog.changes).length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Changes</p>
                  <pre className="bg-gray-50 p-4 rounded-lg text-xs overflow-x-auto">
                    {JSON.stringify(selectedLog.changes, null, 2)}
                  </pre>
                </div>
              )}

              {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Metadata</p>
                  <pre className="bg-gray-50 p-4 rounded-lg text-xs overflow-x-auto">
                    {JSON.stringify(selectedLog.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}