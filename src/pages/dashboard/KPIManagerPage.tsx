import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { addToast } from '../../hooks/useToast';
import ConfirmDialog from '../../components/common/ConfirmDialog';

interface KPI {
  id: string;
  name: string;
  description: string;
  category: string;
  target_value: number;
  unit: string;
  frequency: string;
  owner_id: string;
  owner_name?: string;
  status: 'active' | 'inactive' | 'archived';
  created_at: string;
}

export default function KPIManagerPage() {
  const { user } = useAuth();
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingKPI, setEditingKPI] = useState<KPI | null>(null);
  const [organizationId, setOrganizationId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: '',
    target_value: 0,
    unit: '',
    frequency: 'monthly',
    status: 'active' as const,
  });

  const categories = ['Financial', 'Operational', 'Customer', 'Quality', 'Safety', 'Efficiency', 'Growth', 'Other'];
  const frequencies = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'];

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;

    try {
      setLoading(true);

      const { data: orgData } = await supabase
        .from('user_organizations')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (!orgData) return;
      setOrganizationId(orgData.organization_id);

      await loadKPIs(orgData.organization_id);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadKPIs = async (orgId: string) => {
    const { data, error } = await supabase
      .from('kpis')
      .select(`
        *,
        owner:user_profiles!kpis_owner_id_fkey(full_name)
      `)
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading KPIs:', error);
      return;
    }

    const kpisWithOwner = data.map((kpi: any) => ({
      ...kpi,
      owner_name: kpi.owner?.full_name || 'Unknown',
    }));

    setKpis(kpisWithOwner);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !organizationId) return;

    try {
      const kpiData = {
        ...formData,
        organization_id: organizationId,
        owner_id: user.id,
      };

      if (editingKPI) {
        const { error } = await supabase
          .from('kpis')
          .update(kpiData)
          .eq('id', editingKPI.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('kpis')
          .insert([kpiData]);

        if (error) throw error;
      }

      await loadKPIs(organizationId);
      resetForm();
      addToast(`KPI ${editingKPI ? 'updated' : 'created'} successfully`, 'success');
    } catch (error) {
      console.error('Error saving KPI:', error);
      addToast('Failed to save KPI', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    setDeleteTargetId(id);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTargetId) return;

    const { error } = await supabase
      .from('kpis')
      .delete()
      .eq('id', deleteTargetId);

    if (error) {
      console.error('Error deleting KPI:', error);
      addToast('Failed to delete KPI', 'error');
    } else {
      setKpis(kpis.filter((k) => k.id !== deleteTargetId));
      addToast('KPI deleted successfully', 'success');
    }

    setDeleteConfirmOpen(false);
    setDeleteTargetId(null);
  };

  const handleEdit = (kpi: KPI) => {
    setEditingKPI(kpi);
    setFormData({
      name: kpi.name,
      description: kpi.description || '',
      category: kpi.category,
      target_value: kpi.target_value,
      unit: kpi.unit,
      frequency: kpi.frequency,
      status: kpi.status,
    });
    setShowModal(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      category: '',
      target_value: 0,
      unit: '',
      frequency: 'monthly',
      status: 'active',
    });
    setEditingKPI(null);
    setShowModal(false);
  };

  const filteredKPIs = kpis.filter((kpi) => {
    const matchesSearch = kpi.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         kpi.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || kpi.category === categoryFilter;
    const matchesStatus = statusFilter === 'all' || kpi.status === statusFilter;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'inactive': return 'bg-gray-100 text-gray-800';
      case 'archived': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Financial': return 'ri-money-dollar-circle-line';
      case 'Operational': return 'ri-settings-3-line';
      case 'Customer': return 'ri-user-heart-line';
      case 'Quality': return 'ri-star-line';
      case 'Safety': return 'ri-shield-check-line';
      case 'Efficiency': return 'ri-speed-line';
      case 'Growth': return 'ri-line-chart-line';
      default: return 'ri-folder-line';
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        title="Delete KPI?"
        message="Are you sure you want to delete this KPI? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          setDeleteConfirmOpen(false);
          setDeleteTargetId(null);
        }}
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">KPI Manager</h1>
          <p className="text-gray-600 mt-1">Create and manage your key performance indicators</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap flex items-center gap-2"
        >
          <i className="ri-add-line"></i>
          Create KPI
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total KPIs</p>
              <p className="text-2xl font-bold text-gray-900">{kpis.length}</p>
            </div>
            <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center">
              <i className="ri-dashboard-line text-2xl text-teal-600"></i>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active</p>
              <p className="text-2xl font-bold text-green-600">
                {kpis.filter(k => k.status === 'active').length}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <i className="ri-checkbox-circle-line text-2xl text-green-600"></i>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Inactive</p>
              <p className="text-2xl font-bold text-gray-600">
                {kpis.filter(k => k.status === 'inactive').length}
              </p>
            </div>
            <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
              <i className="ri-pause-circle-line text-2xl text-gray-600"></i>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Categories</p>
              <p className="text-2xl font-bold text-gray-900">
                {new Set(kpis.map(k => k.category)).size}
              </p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <i className="ri-folder-line text-2xl text-purple-600"></i>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg border border-gray-200 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <div className="relative">
              <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
              <input
                type="text"
                placeholder="Search KPIs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="all">All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>
      </div>

      {/* KPIs Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredKPIs.map((kpi) => (
          <div key={kpi.id} className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-start gap-3 flex-1">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  kpi.category === 'Financial' ? 'bg-green-100' :
                  kpi.category === 'Operational' ? 'bg-blue-100' :
                  kpi.category === 'Customer' ? 'bg-purple-100' :
                  kpi.category === 'Quality' ? 'bg-yellow-100' :
                  kpi.category === 'Safety' ? 'bg-red-100' :
                  kpi.category === 'Efficiency' ? 'bg-teal-100' :
                  kpi.category === 'Growth' ? 'bg-indigo-100' :
                  'bg-gray-100'
                }`}>
                  <i className={`${getCategoryIcon(kpi.category)} text-xl ${
                    kpi.category === 'Financial' ? 'text-green-600' :
                    kpi.category === 'Operational' ? 'text-blue-600' :
                    kpi.category === 'Customer' ? 'text-purple-600' :
                    kpi.category === 'Quality' ? 'text-yellow-600' :
                    kpi.category === 'Safety' ? 'text-red-600' :
                    kpi.category === 'Efficiency' ? 'text-teal-600' :
                    kpi.category === 'Growth' ? 'text-indigo-600' :
                    'text-gray-600'
                  }`}></i>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">{kpi.name}</h3>
                  <p className="text-xs text-gray-600 mt-1">{kpi.category}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleEdit(kpi)}
                  className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                  title="Edit"
                >
                  <i className="ri-edit-line text-sm"></i>
                </button>
                <button
                  onClick={() => handleDelete(kpi.id)}
                  className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                  title="Delete"
                >
                  <i className="ri-delete-bin-line text-sm"></i>
                </button>
              </div>
            </div>

            {kpi.description && (
              <p className="text-sm text-gray-600 mb-3 line-clamp-2">{kpi.description}</p>
            )}

            <div className="space-y-2 mb-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Target:</span>
                <span className="font-semibold text-gray-900">
                  {kpi.target_value} {kpi.unit}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Frequency:</span>
                <span className="font-medium text-gray-900 capitalize">{kpi.frequency}</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-gray-200">
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(kpi.status)}`}>
                {kpi.status}
              </span>
              <span className="text-xs text-gray-500">
                <i className="ri-user-line mr-1"></i>
                {kpi.owner_name}
              </span>
            </div>
          </div>
        ))}
      </div>

      {filteredKPIs.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <i className="ri-dashboard-line text-6xl text-gray-400 mb-4"></i>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            {searchTerm || categoryFilter !== 'all' || statusFilter !== 'all' 
              ? 'No KPIs Found' 
              : 'No KPIs Yet'}
          </h3>
          <p className="text-gray-600 mb-4">
            {searchTerm || categoryFilter !== 'all' || statusFilter !== 'all'
              ? 'Try adjusting your filters'
              : 'Create your first KPI to start tracking performance'}
          </p>
          {!searchTerm && categoryFilter === 'all' && statusFilter === 'all' && (
            <button
              onClick={() => setShowModal(true)}
              className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
            >
              Create KPI
            </button>
          )}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                {editingKPI ? 'Edit KPI' : 'Create New KPI'}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Customer Satisfaction Score"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Describe what this KPI measures..."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                    <select
                      required
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      <option value="">Select category</option>
                      {categories.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Frequency *</label>
                    <select
                      required
                      value={formData.frequency}
                      onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      {frequencies.map((freq) => (
                        <option key={freq} value={freq}>{freq.charAt(0).toUpperCase() + freq.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Target Value *</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={formData.target_value}
                      onChange={(e) => setFormData({ ...formData, target_value: parseFloat(e.target.value) })}
                      placeholder="100"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Unit *</label>
                    <input
                      type="text"
                      required
                      value={formData.unit}
                      onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                      placeholder="%, $, points, etc."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
                  >
                    {editingKPI ? 'Update KPI' : 'Create KPI'}
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
