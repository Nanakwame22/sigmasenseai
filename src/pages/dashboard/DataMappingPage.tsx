import { useState } from 'react';

interface MappingRule {
  id: string;
  sourceName: string;
  sourceType: string;
  targetName: string;
  targetType: string;
  transformation: string;
  status: 'active' | 'inactive';
}

interface DataSource {
  id: string;
  name: string;
  type: string;
  fields: Array<{ name: string; type: string; sample: string }>;
}

export default function DataMappingPage() {
  const [activeTab, setActiveTab] = useState<'sources' | 'mapping' | 'preview'>('sources');
  const [selectedSource, setSelectedSource] = useState<string>('');
  const [selectedTarget, setSelectedTarget] = useState<string>('');

  const dataSources: DataSource[] = [
    {
      id: '1',
      name: 'Sales Database',
      type: 'PostgreSQL',
      fields: [
        { name: 'order_id', type: 'integer', sample: '10234' },
        { name: 'customer_name', type: 'varchar', sample: 'John Smith' },
        { name: 'order_date', type: 'date', sample: '2024-01-15' },
        { name: 'total_amount', type: 'decimal', sample: '1250.00' },
        { name: 'status', type: 'varchar', sample: 'completed' }
      ]
    },
    {
      id: '2',
      name: 'CRM System',
      type: 'Salesforce',
      fields: [
        { name: 'account_id', type: 'string', sample: 'ACC-001' },
        { name: 'company_name', type: 'string', sample: 'Acme Corp' },
        { name: 'contact_email', type: 'email', sample: 'john@acme.com' },
        { name: 'revenue', type: 'currency', sample: '$50,000' },
        { name: 'stage', type: 'picklist', sample: 'Closed Won' }
      ]
    },
    {
      id: '3',
      name: 'Analytics Platform',
      type: 'Target Schema',
      fields: [
        { name: 'transaction_id', type: 'bigint', sample: '' },
        { name: 'client_name', type: 'text', sample: '' },
        { name: 'transaction_date', type: 'timestamp', sample: '' },
        { name: 'amount', type: 'numeric', sample: '' },
        { name: 'state', type: 'text', sample: '' }
      ]
    }
  ];

  const [mappingRules, setMappingRules] = useState<MappingRule[]>([
    {
      id: '1',
      sourceName: 'order_id',
      sourceType: 'integer',
      targetName: 'transaction_id',
      targetType: 'bigint',
      transformation: 'Direct mapping',
      status: 'active'
    },
    {
      id: '2',
      sourceName: 'customer_name',
      sourceType: 'varchar',
      targetName: 'client_name',
      targetType: 'text',
      transformation: 'UPPER(customer_name)',
      status: 'active'
    },
    {
      id: '3',
      sourceName: 'order_date',
      sourceType: 'date',
      targetName: 'transaction_date',
      targetType: 'timestamp',
      transformation: 'CAST(order_date AS timestamp)',
      status: 'active'
    }
  ]);

  const transformations = [
    'Direct mapping',
    'UPPER(field)',
    'LOWER(field)',
    'TRIM(field)',
    'CAST(field AS type)',
    'CONCAT(field1, field2)',
    'SUBSTRING(field, start, length)',
    'REPLACE(field, old, new)',
    'Custom SQL'
  ];

  const addMappingRule = () => {
    const newRule: MappingRule = {
      id: Date.now().toString(),
      sourceName: '',
      sourceType: '',
      targetName: '',
      targetType: '',
      transformation: 'Direct mapping',
      status: 'active'
    };
    setMappingRules([...mappingRules, newRule]);
  };

  const updateMappingRule = (id: string, field: keyof MappingRule, value: string) => {
    setMappingRules(mappingRules.map(rule => 
      rule.id === id ? { ...rule, [field]: value } : rule
    ));
  };

  const deleteMappingRule = (id: string) => {
    setMappingRules(mappingRules.filter(rule => rule.id !== id));
  };

  const toggleRuleStatus = (id: string) => {
    setMappingRules(mappingRules.map(rule => 
      rule.id === id ? { ...rule, status: rule.status === 'active' ? 'inactive' : 'active' } : rule
    ));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
              <i className="ri-node-tree text-white text-2xl"></i>
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Data Mapping</h1>
              <p className="text-slate-600 text-sm mt-1">Map and transform data between sources</p>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl p-5 border border-slate-200 hover:shadow-lg transition-all duration-300">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-600 text-sm font-medium">Data Sources</span>
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                <i className="ri-database-2-line text-blue-600 text-lg"></i>
              </div>
            </div>
            <div className="text-3xl font-bold text-slate-900">{dataSources.length - 1}</div>
            <div className="text-xs text-slate-500 mt-1">Connected systems</div>
          </div>

          <div className="bg-white rounded-xl p-5 border border-slate-200 hover:shadow-lg transition-all duration-300">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-600 text-sm font-medium">Mapping Rules</span>
              <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center">
                <i className="ri-git-branch-line text-purple-600 text-lg"></i>
              </div>
            </div>
            <div className="text-3xl font-bold text-slate-900">{mappingRules.length}</div>
            <div className="text-xs text-slate-500 mt-1">Active mappings</div>
          </div>

          <div className="bg-white rounded-xl p-5 border border-slate-200 hover:shadow-lg transition-all duration-300">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-600 text-sm font-medium">Fields Mapped</span>
              <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
                <i className="ri-checkbox-circle-line text-green-600 text-lg"></i>
              </div>
            </div>
            <div className="text-3xl font-bold text-slate-900">
              {mappingRules.filter(r => r.status === 'active').length}
            </div>
            <div className="text-xs text-slate-500 mt-1">Successfully mapped</div>
          </div>

          <div className="bg-white rounded-xl p-5 border border-slate-200 hover:shadow-lg transition-all duration-300">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-600 text-sm font-medium">Transformations</span>
              <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center">
                <i className="ri-refresh-line text-orange-600 text-lg"></i>
              </div>
            </div>
            <div className="text-3xl font-bold text-slate-900">
              {mappingRules.filter(r => r.transformation !== 'Direct mapping').length}
            </div>
            <div className="text-xs text-slate-500 mt-1">With transformations</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl border border-slate-200 mb-6">
          <div className="flex border-b border-slate-200">
            <button
              onClick={() => setActiveTab('sources')}
              className={`flex-1 px-6 py-4 text-sm font-medium transition-all duration-200 ${
                activeTab === 'sources'
                  ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50/50'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <i className="ri-database-2-line mr-2"></i>
              Data Sources
            </button>
            <button
              onClick={() => setActiveTab('mapping')}
              className={`flex-1 px-6 py-4 text-sm font-medium transition-all duration-200 ${
                activeTab === 'mapping'
                  ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50/50'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <i className="ri-git-branch-line mr-2"></i>
              Mapping Rules
            </button>
            <button
              onClick={() => setActiveTab('preview')}
              className={`flex-1 px-6 py-4 text-sm font-medium transition-all duration-200 ${
                activeTab === 'preview'
                  ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50/50'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <i className="ri-eye-line mr-2"></i>
              Preview
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          {/* Data Sources Tab */}
          {activeTab === 'sources' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-slate-900">Connected Data Sources</h2>
                <button className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-medium rounded-lg hover:shadow-lg transition-all duration-200 whitespace-nowrap">
                  <i className="ri-add-line mr-2"></i>
                  Add Source
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {dataSources.map((source) => (
                  <div key={source.id} className="border border-slate-200 rounded-xl p-5 hover:shadow-lg transition-all duration-300">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
                          <i className="ri-database-2-line text-white text-xl"></i>
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-900">{source.name}</h3>
                          <p className="text-sm text-slate-600">{source.type}</p>
                        </div>
                      </div>
                      <span className="px-3 py-1 bg-green-50 text-green-700 text-xs font-medium rounded-full whitespace-nowrap">
                        Connected
                      </span>
                    </div>

                    <div className="space-y-2">
                      <div className="text-sm font-medium text-slate-700 mb-3">Fields ({source.fields.length})</div>
                      {source.fields.slice(0, 3).map((field, idx) => (
                        <div key={idx} className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded-lg">
                          <div className="flex items-center gap-2">
                            <i className="ri-file-list-3-line text-slate-400 text-sm"></i>
                            <span className="text-sm font-medium text-slate-700">{field.name}</span>
                          </div>
                          <span className="text-xs text-slate-500 bg-white px-2 py-1 rounded whitespace-nowrap">
                            {field.type}
                          </span>
                        </div>
                      ))}
                      {source.fields.length > 3 && (
                        <div className="text-xs text-slate-500 text-center py-2">
                          +{source.fields.length - 3} more fields
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mapping Rules Tab */}
          {activeTab === 'mapping' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-slate-900">Field Mapping Rules</h2>
                <button
                  onClick={addMappingRule}
                  className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-medium rounded-lg hover:shadow-lg transition-all duration-200 whitespace-nowrap"
                >
                  <i className="ri-add-line mr-2"></i>
                  Add Mapping
                </button>
              </div>

              {/* Source and Target Selection */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 p-4 bg-slate-50 rounded-xl">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Source System</label>
                  <select
                    value={selectedSource}
                    onChange={(e) => setSelectedSource(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    <option value="">Select source...</option>
                    {dataSources.filter(s => s.type !== 'Target Schema').map(source => (
                      <option key={source.id} value={source.id}>{source.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Target System</label>
                  <select
                    value={selectedTarget}
                    onChange={(e) => setSelectedTarget(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    <option value="">Select target...</option>
                    {dataSources.filter(s => s.type === 'Target Schema').map(source => (
                      <option key={source.id} value={source.id}>{source.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Mapping Rules Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Source Field</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Type</th>
                      <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">
                        <i className="ri-arrow-right-line text-purple-600"></i>
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Target Field</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Type</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Transformation</th>
                      <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">Status</th>
                      <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappingRules.map((rule) => (
                      <tr key={rule.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4">
                          <input
                            type="text"
                            value={rule.sourceName}
                            onChange={(e) => updateMappingRule(rule.id, 'sourceName', e.target.value)}
                            placeholder="Source field"
                            className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          />
                        </td>
                        <td className="py-3 px-4">
                          <input
                            type="text"
                            value={rule.sourceType}
                            onChange={(e) => updateMappingRule(rule.id, 'sourceType', e.target.value)}
                            placeholder="Type"
                            className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          />
                        </td>
                        <td className="py-3 px-4 text-center">
                          <i className="ri-arrow-right-line text-purple-600"></i>
                        </td>
                        <td className="py-3 px-4">
                          <input
                            type="text"
                            value={rule.targetName}
                            onChange={(e) => updateMappingRule(rule.id, 'targetName', e.target.value)}
                            placeholder="Target field"
                            className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          />
                        </td>
                        <td className="py-3 px-4">
                          <input
                            type="text"
                            value={rule.targetType}
                            onChange={(e) => updateMappingRule(rule.id, 'targetType', e.target.value)}
                            placeholder="Type"
                            className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          />
                        </td>
                        <td className="py-3 px-4">
                          <select
                            value={rule.transformation}
                            onChange={(e) => updateMappingRule(rule.id, 'transformation', e.target.value)}
                            className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          >
                            {transformations.map(t => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => toggleRuleStatus(rule.id)}
                            className={`px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap ${
                              rule.status === 'active'
                                ? 'bg-green-50 text-green-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {rule.status === 'active' ? 'Active' : 'Inactive'}
                          </button>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => deleteMappingRule(rule.id)}
                            className="w-8 h-8 flex items-center justify-center text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <i className="ri-delete-bin-line"></i>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {mappingRules.length === 0 && (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i className="ri-git-branch-line text-slate-400 text-2xl"></i>
                  </div>
                  <p className="text-slate-600 mb-4">No mapping rules yet</p>
                  <button
                    onClick={addMappingRule}
                    className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-medium rounded-lg hover:shadow-lg transition-all duration-200 whitespace-nowrap"
                  >
                    Create First Mapping
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Preview Tab */}
          {activeTab === 'preview' && (
            <div>
              <div className="mb-6">
                <h2 className="text-xl font-bold text-slate-900 mb-2">Mapping Preview</h2>
                <p className="text-sm text-slate-600">Preview how your data will be transformed</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Source Data */}
                <div className="border border-slate-200 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                      <i className="ri-database-2-line text-blue-600"></i>
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900">Source Data</h3>
                      <p className="text-xs text-slate-600">Sales Database</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="bg-slate-50 rounded-lg p-3">
                      <div className="text-xs font-medium text-slate-500 mb-1">order_id</div>
                      <div className="text-sm font-medium text-slate-900">10234</div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <div className="text-xs font-medium text-slate-500 mb-1">customer_name</div>
                      <div className="text-sm font-medium text-slate-900">John Smith</div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <div className="text-xs font-medium text-slate-500 mb-1">order_date</div>
                      <div className="text-sm font-medium text-slate-900">2024-01-15</div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <div className="text-xs font-medium text-slate-500 mb-1">total_amount</div>
                      <div className="text-sm font-medium text-slate-900">1250.00</div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <div className="text-xs font-medium text-slate-500 mb-1">status</div>
                      <div className="text-sm font-medium text-slate-900">completed</div>
                    </div>
                  </div>
                </div>

                {/* Target Data */}
                <div className="border border-slate-200 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center">
                      <i className="ri-database-2-line text-purple-600"></i>
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900">Target Data</h3>
                      <p className="text-xs text-slate-600">Analytics Platform</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="bg-purple-50 rounded-lg p-3">
                      <div className="text-xs font-medium text-purple-600 mb-1">transaction_id</div>
                      <div className="text-sm font-medium text-slate-900">10234</div>
                      <div className="text-xs text-slate-500 mt-1">Direct mapping</div>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-3">
                      <div className="text-xs font-medium text-purple-600 mb-1">client_name</div>
                      <div className="text-sm font-medium text-slate-900">JOHN SMITH</div>
                      <div className="text-xs text-slate-500 mt-1">UPPER(customer_name)</div>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-3">
                      <div className="text-xs font-medium text-purple-600 mb-1">transaction_date</div>
                      <div className="text-sm font-medium text-slate-900">2024-01-15 00:00:00</div>
                      <div className="text-xs text-slate-500 mt-1">CAST(order_date AS timestamp)</div>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-3">
                      <div className="text-xs font-medium text-purple-600 mb-1">amount</div>
                      <div className="text-sm font-medium text-slate-900">1250.00</div>
                      <div className="text-xs text-slate-500 mt-1">Direct mapping</div>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-3">
                      <div className="text-xs font-medium text-purple-600 mb-1">state</div>
                      <div className="text-sm font-medium text-slate-900">completed</div>
                      <div className="text-xs text-slate-500 mt-1">Direct mapping</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 mt-6 pt-6 border-t border-slate-200">
                <button className="px-5 py-2.5 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap">
                  <i className="ri-download-line mr-2"></i>
                  Export Mapping
                </button>
                <button className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-medium rounded-lg hover:shadow-lg transition-all duration-200 whitespace-nowrap">
                  <i className="ri-play-line mr-2"></i>
                  Execute Mapping
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
