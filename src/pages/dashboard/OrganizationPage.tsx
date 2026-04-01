import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { useToast } from '../../hooks/useToast';

interface Organization {
  id: string;
  name: string;
  industry: string;
  website?: string;
  description?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postal_code?: string;
  phone?: string;
  email?: string;
  timezone: string;
  currency: string;
  date_format: string;
  time_format: string;
  language: string;
  fiscal_year_start: string;
  settings: {
    features: {
      ai_insights: boolean;
      advanced_analytics: boolean;
      custom_reports: boolean;
      api_access: boolean;
      sso: boolean;
      audit_logs: boolean;
    };
    notifications: {
      email_alerts: boolean;
      slack_integration: boolean;
      webhook_enabled: boolean;
    };
    security: {
      two_factor_required: boolean;
      session_timeout: number;
      password_expiry_days: number;
      ip_whitelist: string[];
    };
    data_retention: {
      metrics_days: number;
      logs_days: number;
      reports_days: number;
    };
  };
  created_at: string;
  updated_at: string;
}

const OrganizationPage: React.FC = () => {
  const { organizationId, organization: authOrganization, user } = useAuth();
  const { showToast } = useToast();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'features' | 'notifications' | 'security' | 'data'>('general');
  const [successMessage, setSuccessMessage] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);

  useEffect(() => {
    if (organizationId) {
      fetchOrganization();
    } else {
      setLoading(false);
    }
  }, [organizationId]);

  const handleCreate = async () => {
    if (!user) return;
    
    try {
      setCreating(true);
      setSuccessMessage('');

      const newOrg = {
        name: organization?.name || '',
        industry: organization?.industry || 'manufacturing',
        size: organization?.size || '51-200',
        website: organization?.website || null,
        description: organization?.description || null,
        timezone: 'America/New_York',
        currency: 'USD',
        date_format: 'MM/DD/YYYY',
        time_format: '12h',
        language: 'en',
        fiscal_year_start: '01',
        settings: {
          features: {
            ai_insights: true,
            advanced_analytics: true,
            custom_reports: true,
            api_access: false,
            sso: false,
            audit_logs: true,
          },
          notifications: {
            email_alerts: true,
            slack_integration: false,
            webhook_enabled: false,
          },
          security: {
            two_factor_required: false,
            session_timeout: 30,
            password_expiry_days: 90,
            ip_whitelist: [],
          },
          data_retention: {
            metrics_days: 365,
            logs_days: 90,
            reports_days: 180,
          },
        },
      };

      const { data: createdOrg, error: orgError } = await supabase
        .from('organizations')
        .insert(newOrg)
        .select()
        .single();

      if (orgError) throw orgError;

      const { error: linkError } = await supabase
        .from('user_organizations')
        .insert({
          user_id: user.id,
          organization_id: createdOrg.id,
          role: 'admin',
        });

      if (linkError) throw linkError;

      setOrganization(createdOrg);
      setShowCreateForm(false);
      showToast('Organization created successfully!', 'success');
      
      window.location.reload();
    } catch (error) {
      console.error('Error creating organization:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      showToast(`Failed to create organization: ${errorMessage}`, 'error');
    } finally {
      setCreating(false);
    }
  };

  const fetchOrganization = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', organizationId)
        .single();

      if (error) throw error;
      setOrganization(data);
    } catch (error) {
      console.error('Error fetching organization:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!organization || !organizationId) return;
    try {
      setSaving(true);
      setSuccessMessage('');
      
      const updateData: any = {
        name: organization.name,
        industry: organization.industry,
        size: organization.size || null,
        website: organization.website || null,
        description: organization.description || null,
        address: organization.address || null,
        city: organization.city || null,
        state: organization.state || null,
        country: organization.country || null,
        postal_code: organization.postal_code || null,
        phone: organization.phone || null,
        email: organization.email || null,
        timezone: organization.timezone,
        currency: organization.currency,
        date_format: organization.date_format,
        time_format: organization.time_format,
        language: organization.language,
        fiscal_year_start: organization.fiscal_year_start,
        settings: organization.settings,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('organizations')
        .update(updateData)
        .eq('id', organizationId);

      if (error) throw error;
      showToast('Settings saved successfully!', 'success');
    } catch (error) {
      console.error('Error saving organization:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      showToast(`Failed to save settings: ${errorMessage}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  if (!organizationId || !organization) {
    if (showCreateForm) {
      return (
        <div className="max-w-3xl mx-auto">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <i className="ri-building-line text-3xl text-teal-600"></i>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Create Your Organization</h2>
              <p className="text-gray-600">Set up your organization to start using the platform</p>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Organization Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={organization?.name || ''}
                  onChange={(e) => setOrganization({ 
                    ...organization, 
                    name: e.target.value 
                  } as Organization)}
                  placeholder="Apex Advanced Manufacturing"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Industry <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={organization?.industry || 'manufacturing'}
                    onChange={(e) => setOrganization({ 
                      ...organization, 
                      industry: e.target.value 
                    } as Organization)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  >
                    <option value="manufacturing">Manufacturing</option>
                    <option value="healthcare">Healthcare</option>
                    <option value="technology">Technology</option>
                    <option value="retail">Retail</option>
                    <option value="finance">Finance</option>
                    <option value="logistics">Logistics</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Company Size <span className="text-red-500">*</span></label>
                  <select
                    value={organization?.size || '51-200'}
                    onChange={(e) => setOrganization({ 
                      ...organization, 
                      size: e.target.value 
                    } as Organization)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  >
                    <option value="1-10">1-10 employees</option>
                    <option value="11-50">11-50 employees</option>
                    <option value="51-200">51-200 employees</option>
                    <option value="201-500">201-500 employees</option>
                    <option value="501-1000">501-1000 employees</option>
                    <option value="1000+">1000+ employees</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description (Optional)</label>
                <textarea
                  value={organization?.description || ''}
                  onChange={(e) => setOrganization({ 
                    ...organization, 
                    description: e.target.value 
                  } as Organization)}
                  placeholder="Electronics Assembly Operations specializing in high-density PCB manufacturing..."
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Website (Optional)</label>
                <input
                  type="url"
                  value={organization?.website || ''}
                  onChange={(e) => setOrganization({ 
                    ...organization, 
                    website: e.target.value 
                  } as Organization)}
                  placeholder="https://www.apexmanufacturing.com"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>

              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="flex items-start gap-3">
                  <i className="ri-information-line text-blue-600 text-xl"></i>
                  <div className="text-sm text-blue-800">
                    <strong>What happens next?</strong>
                    <ul className="mt-2 space-y-1 list-disc list-inside">
                      <li>Your organization will be created with default settings</li>
                      <li>You'll be assigned as the admin</li>
                      <li>You can customize all settings after creation</li>
                      <li>You can invite team members later</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={creating || !organization?.name}
                  className="flex-1 px-6 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap flex items-center justify-center gap-2"
                >
                  {creating ? (
                    <>
                      <i className="ri-loader-4-line animate-spin"></i>
                      Creating...
                    </>
                  ) : (
                    <>
                      <i className="ri-check-line"></i>
                      Create Organization
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12">
          <div className="w-20 h-20 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <i className="ri-building-line text-4xl text-teal-600"></i>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Welcome to SigmaFlow</h2>
          <p className="text-gray-600 mb-8 max-w-md mx-auto">
            To get started, you need to create an organization. This will be your workspace where you can manage projects, teams, and data.
          </p>
          <button
            onClick={() => setShowCreateForm(true)}
            className="px-8 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap inline-flex items-center gap-2 text-lg font-medium"
          >
            <i className="ri-add-line text-xl"></i>
            Create Organization
          </button>
          
          <div className="mt-12 pt-8 border-t border-gray-200">
            <p className="text-sm text-gray-500 mb-4">What you'll be able to do:</p>
            <div className="grid grid-cols-2 gap-4 text-left max-w-lg mx-auto">
              <div className="flex items-start gap-3">
                <i className="ri-check-line text-teal-600 text-lg mt-0.5"></i>
                <span className="text-sm text-gray-700">Manage DMAIC projects</span>
              </div>
              <div className="flex items-start gap-3">
                <i className="ri-check-line text-teal-600 text-lg mt-0.5"></i>
                <span className="text-sm text-gray-700">Track metrics & KPIs</span>
              </div>
              <div className="flex items-start gap-3">
                <i className="ri-check-line text-teal-600 text-lg mt-0.5"></i>
                <span className="text-sm text-gray-700">Integrate data sources</span>
              </div>
              <div className="flex items-start gap-3">
                <i className="ri-check-line text-teal-600 text-lg mt-0.5"></i>
                <span className="text-sm text-gray-700">Invite team members</span>
              </div>
              <div className="flex items-start gap-3">
                <i className="ri-check-line text-teal-600 text-lg mt-0.5"></i>
                <span className="text-sm text-gray-700">AI-powered insights</span>
              </div>
              <div className="flex items-start gap-3">
                <i className="ri-check-line text-teal-600 text-lg mt-0.5"></i>
                <span className="text-sm text-gray-700">Advanced analytics</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Organization Settings</h1>
          <p className="text-sm text-gray-600 mt-1">Manage your organization configuration and preferences</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
        >
          {saving ? (
            <>
              <i className="ri-loader-4-line animate-spin"></i>
              Saving...
            </>
          ) : (
            <>
              <i className="ri-save-line"></i>
              Save Changes
            </>
          )}
        </button>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
          <i className="ri-check-line text-green-600 text-xl"></i>
          <span className="text-green-800 font-medium">{successMessage}</span>
        </div>
      )}

      {/* NEW: Organization Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Feature Usage */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Feature Usage</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={getFeatureUsageData(organization?.settings)} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" stroke="#6b7280" style={{ fontSize: '12px' }} domain={[0, 100]} />
              <YAxis dataKey="feature" type="category" stroke="#6b7280" style={{ fontSize: '12px' }} width={120} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#fff', 
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
              />
              <Bar dataKey="usage" fill="#14b8a6" radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Security Configuration */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Security Configuration</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={getSecurityScoreData(organization?.settings)}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => value > 0 ? name : ''}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {getSecurityScoreData(organization?.settings).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={SECURITY_COLORS[index % SECURITY_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#fff', 
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="border-b border-gray-200">
          <div className="flex gap-1 p-1">
            {[
              { id: 'general', label: 'General', icon: 'ri-settings-3-line' },
              { id: 'features', label: 'Features', icon: 'ri-function-line' },
              { id: 'notifications', label: 'Notifications', icon: 'ri-notification-3-line' },
              { id: 'security', label: 'Security', icon: 'ri-shield-check-line' },
              { id: 'data', label: 'Data Retention', icon: 'ri-database-2-line' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`flex-1 px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                  activeTab === tab.id
                    ? 'bg-teal-50 text-teal-700'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <i className={`${tab.icon} mr-2`}></i>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {/* General Tab */}
          {activeTab === 'general' && (
            <div className="space-y-6">
              <div className="flex items-start gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Organization Logo</label>
                  <div className="w-32 h-32 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center overflow-hidden bg-gray-50">
                    <div className="text-center">
                      <i className="ri-building-line text-4xl text-gray-400"></i>
                      <p className="text-xs text-gray-500 mt-2">Logo upload<br/>coming soon</p>
                    </div>
                  </div>
                </div>
                <div className="flex-1 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Organization Name</label>
                    <input
                      type="text"
                      value={organization.name}
                      onChange={(e) => setOrganization({ ...organization, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
                      <select
                        value={organization.industry}
                        onChange={(e) => setOrganization({ ...organization, industry: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      >
                        <option value="manufacturing">Manufacturing</option>
                        <option value="healthcare">Healthcare</option>
                        <option value="technology">Technology</option>
                        <option value="retail">Retail</option>
                        <option value="finance">Finance</option>
                        <option value="logistics">Logistics</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Company Size</label>
                      <select
                        value={organization.size}
                        onChange={(e) => setOrganization({ ...organization, size: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      >
                        <option value="1-10">1-10 employees</option>
                        <option value="11-50">11-50 employees</option>
                        <option value="51-200">51-200 employees</option>
                        <option value="201-500">201-500 employees</option>
                        <option value="501-1000">501-1000 employees</option>
                        <option value="1000+">1000+ employees</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={organization.description || ''}
                  onChange={(e) => setOrganization({ ...organization, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="Brief description of your organization"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
                  <input
                    type="url"
                    value={organization.website || ''}
                    onChange={(e) => setOrganization({ ...organization, website: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    placeholder="https://example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={organization.email || ''}
                    onChange={(e) => setOrganization({ ...organization, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <input
                  type="text"
                  value={organization.address || ''}
                  onChange={(e) => setOrganization({ ...organization, address: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                  <input
                    type="text"
                    value={organization.city || ''}
                    onChange={(e) => setOrganization({ ...organization, city: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">State/Province</label>
                  <input
                    type="text"
                    value={organization.state || ''}
                    onChange={(e) => setOrganization({ ...organization, state: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                  <input
                    type="text"
                    value={organization.country || ''}
                    onChange={(e) => setOrganization({ ...organization, country: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Postal Code</label>
                  <input
                    type="text"
                    value={organization.postal_code || ''}
                    onChange={(e) => setOrganization({ ...organization, postal_code: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
                  <select
                    value={organization.timezone}
                    onChange={(e) => setOrganization({ ...organization, timezone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="America/New_York">Eastern Time (ET)</option>
                    <option value="America/Chicago">Central Time (CT)</option>
                    <option value="America/Denver">Mountain Time (MT)</option>
                    <option value="America/Los_Angeles">Pacific Time (PT)</option>
                    <option value="Europe/London">London (GMT)</option>
                    <option value="Europe/Paris">Paris (CET)</option>
                    <option value="Asia/Tokyo">Tokyo (JST)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
                  <select
                    value={organization.currency}
                    onChange={(e) => setOrganization({ ...organization, currency: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="USD">USD - US Dollar</option>
                    <option value="EUR">EUR - Euro</option>
                    <option value="GBP">GBP - British Pound</option>
                    <option value="JPY">JPY - Japanese Yen</option>
                    <option value="CAD">CAD - Canadian Dollar</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date Format</label>
                  <select
                    value={organization.date_format}
                    onChange={(e) => setOrganization({ ...organization, date_format: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Time Format</label>
                  <select
                    value={organization.time_format}
                    onChange={(e) => setOrganization({ ...organization, time_format: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="12h">12-hour</option>
                    <option value="24h">24-hour</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fiscal Year Start</label>
                <select
                  value={organization.fiscal_year_start}
                  onChange={(e) => setOrganization({ ...organization, fiscal_year_start: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="01">January</option>
                  <option value="02">February</option>
                  <option value="03">March</option>
                  <option value="04">April</option>
                  <option value="05">May</option>
                  <option value="06">June</option>
                  <option value="07">July</option>
                  <option value="08">August</option>
                  <option value="09">September</option>
                  <option value="10">October</option>
                  <option value="11">November</option>
                  <option value="12">December</option>
                </select>
              </div>
            </div>
          )}

          {/* Features Tab */}
          {activeTab === 'features' && (
            <div className="space-y-4">
              {Object.entries(organization.settings.features).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                  <div>
                    <div className="font-medium text-gray-900 capitalize">{key.replace(/_/g, ' ')}</div>
                    <div className="text-sm text-gray-600">
                      {key === 'ai_insights' && 'Enable AI-powered insights and recommendations'}
                      {key === 'advanced_analytics' && 'Access to advanced forecasting and anomaly detection'}
                      {key === 'custom_reports' && 'Create and customize detailed reports'}
                      {key === 'api_access' && 'Programmatic access via REST API'}
                      {key === 'sso' && 'Single Sign-On integration'}
                      {key === 'audit_logs' && 'Complete activity tracking and audit trails'}
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={value}
                      onChange={(e) => {
                        const newSettings = { ...organization.settings };
                        newSettings.features[key as keyof typeof newSettings.features] = e.target.checked;
                        setOrganization({ ...organization, settings: newSettings });
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-teal-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600"></div>
                  </label>
                </div>
              ))}
            </div>
          )}

          {/* Notifications Tab */}
          {activeTab === 'notifications' && (
            <div className="space-y-4">
              {Object.entries(organization.settings.notifications).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                  <div>
                    <div className="font-medium text-gray-900 capitalize">{key.replace(/_/g, ' ')}</div>
                    <div className="text-sm text-gray-600">
                      {key === 'email_alerts' && 'Receive email notifications for important events'}
                      {key === 'slack_integration' && 'Send notifications to Slack channels'}
                      {key === 'webhook_enabled' && 'Trigger webhooks for external integrations'}
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={value}
                      onChange={(e) => {
                        const newSettings = { ...organization.settings };
                        newSettings.notifications[key as keyof typeof newSettings.notifications] = e.target.checked;
                        setOrganization({ ...organization, settings: newSettings });
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-teal-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600"></div>
                  </label>
                </div>
              ))}
            </div>
          )}

          {/* Security Tab */}
          {activeTab === 'security' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                <div>
                  <div className="font-medium text-gray-900">Two-Factor Authentication</div>
                  <div className="text-sm text-gray-600">Require 2FA for all team members</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={organization.settings.security.two_factor_required}
                    onChange={(e) => {
                      const newSettings = { ...organization.settings };
                      newSettings.security.two_factor_required = e.target.checked;
                      setOrganization({ ...organization, settings: newSettings });
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-teal-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600"></div>
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Session Timeout (minutes)</label>
                <input
                  type="number"
                  value={organization.settings.security.session_timeout}
                  onChange={(e) => {
                    const newSettings = { ...organization.settings };
                    newSettings.security.session_timeout = parseInt(e.target.value);
                    setOrganization({ ...organization, settings: newSettings });
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password Expiry (days)</label>
                <input
                  type="number"
                  value={organization.settings.security.password_expiry_days}
                  onChange={(e) => {
                    const newSettings = { ...organization.settings };
                    newSettings.security.password_expiry_days = parseInt(e.target.value);
                    setOrganization({ ...organization, settings: newSettings });
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">IP Whitelist</label>
                <textarea
                  value={organization.settings.security.ip_whitelist.join('\n')}
                  onChange={(e) => {
                    const newSettings = { ...organization.settings };
                    newSettings.security.ip_whitelist = e.target.value.split('\n').filter(ip => ip.trim());
                    setOrganization({ ...organization, settings: newSettings });
                  }}
                  rows={4}
                  placeholder="Enter one IP address per line"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm"
                />
              </div>
            </div>
          )}

          {/* Data Retention Tab */}
          {activeTab === 'data' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Metrics Data Retention (days)</label>
                <input
                  type="number"
                  value={organization.settings.data_retention.metrics_days}
                  onChange={(e) => {
                    const newSettings = { ...organization.settings };
                    newSettings.data_retention.metrics_days = parseInt(e.target.value);
                    setOrganization({ ...organization, settings: newSettings });
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
                <p className="text-sm text-gray-600 mt-1">How long to keep historical metrics data</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Logs Retention (days)</label>
                <input
                  type="number"
                  value={organization.settings.data_retention.logs_days}
                  onChange={(e) => {
                    const newSettings = { ...organization.settings };
                    newSettings.data_retention.logs_days = parseInt(e.target.value);
                    setOrganization({ ...organization, settings: newSettings });
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
                <p className="text-sm text-gray-600 mt-1">How long to keep audit logs and activity history</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reports Retention (days)</label>
                <input
                  type="number"
                  value={organization.settings.data_retention.reports_days}
                  onChange={(e) => {
                    const newSettings = { ...organization.settings };
                    newSettings.data_retention.reports_days = parseInt(e.target.value);
                    setOrganization({ ...organization, settings: newSettings });
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
                <p className="text-sm text-gray-600 mt-1">How long to keep generated reports</p>
              </div>

              <div className="bg-yellow-50 p-4 rounded-lg">
                <div className="flex items-start gap-3">
                  <i className="ri-alert-line text-yellow-600 text-xl"></i>
                  <div>
                    <div className="font-medium text-yellow-900">Data Retention Policy</div>
                    <div className="text-sm text-yellow-700 mt-1">
                      Data older than the specified retention period will be automatically archived or deleted. 
                      This action cannot be undone. Ensure compliance with your industry regulations.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Security colors for pie chart
const SECURITY_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'];

// Helper function to get feature usage data
function getFeatureUsageData(settings: any) {
  const features = settings?.features || {};
  return [
    { feature: 'AI Insights', usage: features.ai_insights ? 85 : 0 },
    { feature: 'Advanced Analytics', usage: features.advanced_analytics ? 92 : 0 },
    { feature: 'Custom Reports', usage: features.custom_reports ? 78 : 0 },
    { feature: 'API Access', usage: features.api_access ? 65 : 0 },
    { feature: 'SSO Integration', usage: features.sso ? 45 : 0 },
    { feature: 'Audit Logs', usage: features.audit_logs ? 88 : 0 }
  ];
}

// Helper function to get security score data
function getSecurityScoreData(settings: any) {
  const security = settings?.security || {};
  return [
    { name: '2FA Enabled', value: security.two_factor_required ? 1 : 0 },
    { name: 'Session Timeout', value: security.session_timeout > 0 ? 1 : 0 },
    { name: 'Password Expiry', value: security.password_expiry_days > 0 ? 1 : 0 },
    { name: 'IP Whitelist', value: security.ip_whitelist?.length > 0 ? 1 : 0 }
  ];
}

export default OrganizationPage;
