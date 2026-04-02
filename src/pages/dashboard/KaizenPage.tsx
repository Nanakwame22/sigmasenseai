import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line } from 'recharts';
import { useToast } from '../../hooks/useToast';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import InsightSummary from '../../components/common/InsightSummary';
import { downloadTemplate } from '../../utils/exportUtils';

interface KaizenItem {
  id: string;
  type: 'kaizen' | 'capa';
  title: string;
  description: string;
  category: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'in_progress' | 'completed' | 'rejected';
  submitted_by: string;
  assigned_to?: string;
  location?: string;
  problem_statement?: string;
  root_cause?: string;
  proposed_solution?: string;
  implementation_plan?: string;
  expected_benefit?: string;
  actual_benefit?: string;
  cost_estimate?: number;
  actual_cost?: number;
  target_date?: string;
  completion_date?: string;
  verification_method?: string;
  effectiveness_check?: string;
  created_at: string;
  updated_at: string;
}

interface FormData {
  type: 'kaizen' | 'capa';
  title: string;
  category: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  problem_statement: string;
  proposed_solution: string;
  expected_benefit: string;
}

export default function KaizenPage() {
  const { organization, user } = useAuth();
  const { showToast } = useToast();
  const [items, setItems] = useState<KaizenItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<KaizenItem | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'kaizen' | 'capa'>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [submitting, setSubmitting] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState<KaizenItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  
  const [formData, setFormData] = useState<FormData>({
    type: 'kaizen',
    title: '',
    category: 'Process Improvement',
    priority: 'medium',
    problem_statement: '',
    proposed_solution: '',
    expected_benefit: ''
  });

  useEffect(() => {
    loadItems();
  }, [organization?.id]);

  const loadItems = async () => {
    if (!organization?.id) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('kaizen_items')
        .select('*')
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setItems(data || []);
    } catch (error) {
      console.error('Error loading items:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!organization?.id || !user?.id) return;
    if (!formData.title || !formData.problem_statement || !formData.proposed_solution) {
      showToast('Please fill in all required fields', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('kaizen_items')
        .insert({
          organization_id: organization.id,
          type: formData.type,
          title: formData.title,
          description: formData.problem_statement.substring(0, 200),
          category: formData.category,
          priority: formData.priority,
          status: 'submitted',
          submitted_by: user.id,
          problem_statement: formData.problem_statement,
          proposed_solution: formData.proposed_solution,
          expected_benefit: formData.expected_benefit
        });

      if (error) throw error;

      setShowCreateModal(false);
      setFormData({
        type: 'kaizen',
        title: '',
        category: 'Process Improvement',
        priority: 'medium',
        problem_statement: '',
        proposed_solution: '',
        expected_benefit: ''
      });
      loadItems();
      showToast('Idea submitted successfully!', 'success');
    } catch (error) {
      console.error('Error submitting idea:', error);
      showToast('Failed to submit idea', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingItem) return;

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('kaizen_items')
        .update({
          title: editingItem.title,
          description: editingItem.description,
          category: editingItem.category,
          priority: editingItem.priority,
          problem_statement: editingItem.problem_statement,
          root_cause: editingItem.root_cause,
          proposed_solution: editingItem.proposed_solution,
          implementation_plan: editingItem.implementation_plan,
          expected_benefit: editingItem.expected_benefit,
          actual_benefit: editingItem.actual_benefit,
          cost_estimate: editingItem.cost_estimate,
          actual_cost: editingItem.actual_cost,
          target_date: editingItem.target_date,
          completion_date: editingItem.completion_date,
          verification_method: editingItem.verification_method,
          effectiveness_check: editingItem.effectiveness_check,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingItem.id);

      if (error) throw error;

      setShowEditModal(false);
      setEditingItem(null);
      loadItems();
      showToast('Item updated successfully!', 'success');
    } catch (error) {
      console.error('Error updating item:', error);
      showToast('Failed to update item', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusUpdate = async (itemId: string, newStatus: string) => {
    try {
      const updateData: any = { 
        status: newStatus, 
        updated_at: new Date().toISOString() 
      };

      // Auto-set completion date when status changes to completed
      if (newStatus === 'completed') {
        updateData.completion_date = new Date().toISOString();
      }

      const { error } = await supabase
        .from('kaizen_items')
        .update(updateData)
        .eq('id', itemId);

      if (error) throw error;
      
      loadItems();
      if (selectedItem?.id === itemId) {
        setSelectedItem({ ...selectedItem, status: newStatus as any });
      }
      
      showToast(`Status updated to ${newStatus.replace('_', ' ')}`, 'success');
    } catch (error) {
      console.error('Error updating status:', error);
      showToast('Failed to update status', 'error');
    }
  };

  const handleAssign = async (itemId: string, userId: string) => {
    try {
      const { error } = await supabase
        .from('kaizen_items')
        .update({ 
          assigned_to: userId,
          status: 'in_progress',
          updated_at: new Date().toISOString() 
        })
        .eq('id', itemId);

      if (error) throw error;
      
      loadItems();
      showToast('Item assigned successfully!', 'success');
    } catch (error) {
      console.error('Error assigning item:', error);
      showToast('Failed to assign item', 'error');
    }
  };

  const handleDelete = async (itemId: string) => {
    setItemToDelete(itemId);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;

    try {
      const { error } = await supabase
        .from('kaizen_items')
        .delete()
        .eq('id', itemToDelete);

      if (error) throw error;
      
      loadItems();
      setSelectedItem(null);
      showToast('Item deleted successfully!', 'success');
    } catch (error) {
      console.error('Error deleting item:', error);
      showToast('Failed to delete item', 'error');
    } finally {
      setShowDeleteConfirm(false);
      setItemToDelete(null);
    }
  };

  const handleEdit = (item: KaizenItem) => {
    setEditingItem(item);
    setShowEditModal(true);
  };

  const handleDownloadTemplate = () => {
    downloadTemplate(
      'Kaizen_Items_Import_Template',
      [
        { name: 'title', description: 'Improvement idea title (required)', example: 'Reduce medication dispensing time' },
        { name: 'description', description: 'Detailed description (required)', example: 'Implement barcode scanning for faster medication verification' },
        { name: 'category', description: 'process/quality/safety/cost/other (required)', example: 'process' },
        { name: 'priority', description: 'low/medium/high/critical', example: 'high' },
        { name: 'status', description: 'submitted/under_review/approved/in_progress/completed/rejected', example: 'submitted' },
        { name: 'estimated_impact', description: 'Impact description', example: 'Reduce dispensing time by 30%' },
        { name: 'estimated_effort', description: 'Effort description', example: '2 weeks implementation' }
      ]
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800 border-green-200';
      case 'in_progress': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'approved': return 'bg-teal-100 text-teal-800 border-teal-200';
      case 'under_review': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'submitted': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'rejected': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getTypeIcon = (type: string) => {
    return type === 'kaizen' ? 'ri-loop-right-line' : 'ri-shield-check-line';
  };

  const filteredItems = items.filter(item => {
    if (activeTab !== 'all' && item.type !== activeTab) return false;
    if (filterStatus !== 'all' && item.status !== filterStatus) return false;
    if (filterPriority !== 'all' && item.priority !== filterPriority) return false;
    if (searchQuery && !item.title.toLowerCase().includes(searchQuery.toLowerCase()) && 
        !item.description.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const stats = {
    total: items.length,
    kaizen: items.filter(i => i.type === 'kaizen').length,
    capa: items.filter(i => i.type === 'capa').length,
    submitted: items.filter(i => i.status === 'submitted').length,
    underReview: items.filter(i => i.status === 'under_review').length,
    approved: items.filter(i => i.status === 'approved').length,
    inProgress: items.filter(i => i.status === 'in_progress').length,
    completed: items.filter(i => i.status === 'completed').length,
    critical: items.filter(i => i.priority === 'critical').length,
    avgImplementationTime: items.filter(i => i.completion_date && i.created_at)
      .reduce((acc, item) => {
        const start = new Date(item.created_at).getTime();
        const end = new Date(item.completion_date!).getTime();
        return acc + (end - start);
      }, 0) / Math.max(1, items.filter(i => i.completion_date).length) / (1000 * 60 * 60 * 24) // Convert to days
  };

  const benefitsData = getBenefitsData(items);
  const totalExpectedBenefit = benefitsData.reduce((sum, row) => sum + row.expected, 0);
  const totalActualBenefit = benefitsData.reduce((sum, row) => sum + row.actual, 0);
  const topCategory = getCategoryDistribution(items)[0]?.category;
  const summaryText = items.length === 0
    ? 'There are no Kaizen or CAPA items yet, so this workspace is ready but still empty. Once ideas and corrective actions start flowing in, this page becomes your operational improvement backlog.'
    : `There are ${items.length} active improvement records, with ${stats.completed} completed and ${stats.inProgress} currently in progress. This gives you a live view of how much improvement work is moving versus waiting.`;
  const summaryDriver = items.length > 0
    ? `${topCategory ? `${topCategory} is the busiest category right now.` : 'The backlog is now active.'} Expected tracked benefit totals $${Math.round(totalExpectedBenefit).toLocaleString()}, and actual recorded benefit totals $${Math.round(totalActualBenefit).toLocaleString()}.`
    : undefined;
  const summaryGuidance = stats.critical > 0
    ? `You have ${stats.critical} critical item${stats.critical === 1 ? '' : 's'} in the queue, so review those first before adding lower-priority improvement work.`
    : 'Use the charts below to see whether improvement ideas are converting into completed outcomes quickly enough, then remove blockers from anything stuck in review or implementation.';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <i className="ri-loader-4-line text-2xl text-teal-600 animate-spin"></i>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Kaizen / CAPA Management</h1>
          <p className="text-sm text-gray-600 mt-1">
            Continuous improvement and corrective/preventive actions tracking
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center space-x-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors cursor-pointer whitespace-nowrap"
        >
          <i className="ri-add-line text-sm"></i>
          <span className="text-sm font-medium">Submit Idea</span>
        </button>
      </div>

      <InsightSummary
        title="What This Means In Plain English"
        summary={summaryText}
        driver={summaryDriver}
        guidance={summaryGuidance}
      />

      {/* Enhanced Stats Cards */}
      <div className="grid grid-cols-6 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-600">Total Items</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</p>
            </div>
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
              <i className="ri-file-list-3-line text-lg text-gray-600"></i>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-600">Kaizen</p>
              <p className="text-2xl font-bold text-teal-600 mt-1">{stats.kaizen}</p>
            </div>
            <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
              <i className="ri-loop-right-line text-lg text-teal-600"></i>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-600">CAPA</p>
              <p className="text-2xl font-bold text-blue-600 mt-1">{stats.capa}</p>
            </div>
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <i className="ri-shield-check-line text-lg text-blue-600"></i>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-600">In Progress</p>
              <p className="text-2xl font-bold text-orange-600 mt-1">{stats.inProgress}</p>
            </div>
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <i className="ri-time-line text-lg text-orange-600"></i>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-600">Completed</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{stats.completed}</p>
            </div>
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <i className="ri-checkbox-circle-line text-lg text-green-600"></i>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-600">Avg. Time</p>
              <p className="text-2xl font-bold text-purple-600 mt-1">{Math.round(stats.avgImplementationTime)}</p>
              <p className="text-[10px] text-gray-500">days</p>
            </div>
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <i className="ri-timer-line text-lg text-purple-600"></i>
            </div>
          </div>
        </div>
      </div>

      {/* NEW: Visualizations Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Status Distribution */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Status Distribution</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={getStatusDistribution(items)}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {getStatusDistribution(items).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.name as keyof typeof STATUS_COLORS] || '#94a3b8'} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Category Distribution */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Category Breakdown</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={getCategoryDistribution(items)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="category" stroke="#6b7280" style={{ fontSize: '10px' }} angle={-45} textAnchor="end" height={80} />
              <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#fff', 
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
              />
              <Bar dataKey="count" fill="#14b8a6" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Benefits Tracking */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Expected vs Actual Benefits</h3>
              <ResponsiveContainer width="100%" height={250}>
            <LineChart data={benefitsData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" stroke="#6b7280" style={{ fontSize: '11px' }} />
              <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#fff', 
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
                formatter={(value: number) => `$${Math.round(value).toLocaleString()}`}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Line type="monotone" dataKey="expected" stroke="#3b82f6" strokeWidth={2} name="Expected" strokeDasharray="5 5" />
              <Line type="monotone" dataKey="actual" stroke="#10b981" strokeWidth={2} name="Actual" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          {/* Type Tabs */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'all'
                  ? 'bg-teal-100 text-teal-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              All Items
            </button>
            <button
              onClick={() => setActiveTab('kaizen')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'kaizen'
                  ? 'bg-teal-100 text-teal-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <i className="ri-loop-right-line mr-2"></i>
              Kaizen
            </button>
            <button
              onClick={() => setActiveTab('capa')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'capa'
                  ? 'bg-teal-100 text-teal-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <i className="ri-shield-check-line mr-2"></i>
              CAPA
            </button>
          </div>

          {/* Search & Filters */}
          <div className="flex items-center space-x-3">
            <div className="relative">
              <i className="ri-search-line absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="all">All Status</option>
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="under_review">Under Review</option>
              <option value="approved">Approved</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="rejected">Rejected</option>
            </select>

            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="all">All Priority</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>
      </div>

      {/* Items List */}
      <div className="space-y-4">
        {filteredItems.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <i className="ri-inbox-line text-4xl text-gray-300"></i>
            <p className="text-sm text-gray-600 mt-4">No items found</p>
            <p className="text-xs text-gray-500 mt-1">Try adjusting your filters or submit a new idea</p>
          </div>
        ) : (
          filteredItems.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      item.type === 'kaizen' ? 'bg-teal-100' : 'bg-blue-100'
                    }`}>
                      <i className={`${getTypeIcon(item.type)} text-sm ${
                        item.type === 'kaizen' ? 'text-teal-600' : 'text-blue-600'
                      }`}></i>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-gray-900">{item.title}</h3>
                      <p className="text-xs text-gray-600 mt-0.5">{item.category}</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getPriorityColor(item.priority)}`}>
                        {item.priority}
                      </span>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(item.status)}`}>
                        {item.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>

                  <p className="text-sm text-gray-700 mb-4">{item.description}</p>

                  {item.expected_benefit && (
                    <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-200">
                      <p className="text-xs text-green-700 font-medium">Expected Benefit</p>
                      <p className="text-sm text-green-900 mt-1">{item.expected_benefit}</p>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex items-center space-x-2 mt-4">
                    <button
                      onClick={() => setSelectedItem(item)}
                      className="px-3 py-1.5 bg-teal-600 text-white rounded-lg text-xs font-medium hover:bg-teal-700 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <i className="ri-eye-line mr-1"></i>
                      View Details
                    </button>
                    <button
                      onClick={() => handleEdit(item)}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <i className="ri-edit-line mr-1"></i>
                      Edit
                    </button>
                    {item.status === 'submitted' && (
                      <button
                        onClick={() => handleStatusUpdate(item.id, 'approved')}
                        className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <i className="ri-check-line mr-1"></i>
                        Approve
                      </button>
                    )}
                    {item.status === 'approved' && (
                      <button
                        onClick={() => handleStatusUpdate(item.id, 'in_progress')}
                        className="px-3 py-1.5 bg-orange-600 text-white rounded-lg text-xs font-medium hover:bg-orange-700 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <i className="ri-play-line mr-1"></i>
                        Start Implementation
                      </button>
                    )}
                    {item.status === 'in_progress' && (
                      <button
                        onClick={() => handleStatusUpdate(item.id, 'completed')}
                        className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-medium hover:bg-purple-700 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <i className="ri-checkbox-circle-line mr-1"></i>
                        Mark Complete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Detail Modal */}
      {selectedItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  selectedItem.type === 'kaizen' ? 'bg-teal-100' : 'bg-blue-100'
                }`}>
                  <i className={`${getTypeIcon(selectedItem.type)} text-lg ${
                    selectedItem.type === 'kaizen' ? 'text-teal-600' : 'text-blue-600'
                  }`}></i>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{selectedItem.title}</h2>
                  <p className="text-sm text-gray-600">{selectedItem.category}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
              >
                <i className="ri-close-line text-xl text-gray-600"></i>
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Status & Priority */}
              <div className="flex items-center space-x-3">
                <span className={`px-4 py-2 rounded-lg text-sm font-medium border ${getPriorityColor(selectedItem.priority)}`}>
                  {selectedItem.priority} Priority
                </span>
                <select
                  value={selectedItem.status}
                  onChange={(e) => handleStatusUpdate(selectedItem.id, e.target.value)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border cursor-pointer ${getStatusColor(selectedItem.status)}`}
                >
                  <option value="draft">Draft</option>
                  <option value="submitted">Submitted</option>
                  <option value="under_review">Under Review</option>
                  <option value="approved">Approved</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>

              {/* Description */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Description</h3>
                <p className="text-sm text-gray-700">{selectedItem.description}</p>
              </div>

              {/* Problem Statement */}
              {selectedItem.problem_statement && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">Problem Statement</h3>
                  <p className="text-sm text-gray-700">{selectedItem.problem_statement}</p>
                </div>
              )}

              {/* Root Cause */}
              {selectedItem.root_cause && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">Root Cause</h3>
                  <p className="text-sm text-gray-700">{selectedItem.root_cause}</p>
                </div>
              )}

              {/* Proposed Solution */}
              {selectedItem.proposed_solution && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">Proposed Solution</h3>
                  <p className="text-sm text-gray-700">{selectedItem.proposed_solution}</p>
                </div>
              )}

              {/* Implementation Plan */}
              {selectedItem.implementation_plan && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">Implementation Plan</h3>
                  <p className="text-sm text-gray-700 whitespace-pre-line">{selectedItem.implementation_plan}</p>
                </div>
              )}

              {/* Expected Benefit */}
              {selectedItem.expected_benefit && (
                <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                  <h3 className="text-sm font-semibold text-green-900 mb-2">Expected Benefit</h3>
                  <p className="text-sm text-green-800">{selectedItem.expected_benefit}</p>
                </div>
              )}

              {/* Actual Benefit (if completed) */}
              {selectedItem.actual_benefit && (
                <div className="p-4 bg-teal-50 rounded-lg border border-teal-200">
                  <h3 className="text-sm font-semibold text-teal-900 mb-2">Actual Benefit Achieved</h3>
                  <p className="text-sm text-teal-800">{selectedItem.actual_benefit}</p>
                </div>
              )}

              {/* Cost Information */}
              {(selectedItem.cost_estimate || selectedItem.actual_cost) && (
                <div className="grid grid-cols-2 gap-4">
                  {selectedItem.cost_estimate && (
                    <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                      <h3 className="text-sm font-semibold text-yellow-900 mb-2">Estimated Cost</h3>
                      <p className="text-lg font-bold text-yellow-800">${selectedItem.cost_estimate.toLocaleString()}</p>
                    </div>
                  )}
                  {selectedItem.actual_cost && (
                    <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
                      <h3 className="text-sm font-semibold text-orange-900 mb-2">Actual Cost</h3>
                      <p className="text-lg font-bold text-orange-800">${selectedItem.actual_cost.toLocaleString()}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Timeline */}
              {(selectedItem.target_date || selectedItem.completion_date) && (
                <div className="grid grid-cols-2 gap-4">
                  {selectedItem.target_date && (
                    <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                      <h3 className="text-sm font-semibold text-blue-900 mb-2">Target Date</h3>
                      <p className="text-sm text-blue-800">{new Date(selectedItem.target_date).toLocaleDateString()}</p>
                    </div>
                  )}
                  {selectedItem.completion_date && (
                    <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                      <h3 className="text-sm font-semibold text-purple-900 mb-2">Completion Date</h3>
                      <p className="text-sm text-purple-800">{new Date(selectedItem.completion_date).toLocaleDateString()}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                <button
                  onClick={() => handleDelete(selectedItem.id)}
                  className="px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 transition-colors cursor-pointer whitespace-nowrap text-sm font-medium"
                >
                  <i className="ri-delete-bin-line mr-2"></i>
                  Delete
                </button>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      handleEdit(selectedItem);
                      setSelectedItem(null);
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors cursor-pointer whitespace-nowrap text-sm font-medium"
                  >
                    <i className="ri-edit-line mr-2"></i>
                    Edit
                  </button>
                  <button
                    onClick={() => setSelectedItem(null)}
                    className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors cursor-pointer whitespace-nowrap text-sm font-medium"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Submit New Idea</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
              >
                <i className="ri-close-line text-xl text-gray-600"></i>
              </button>
            </div>

            <div className="p-6">
              <p className="text-sm text-gray-600 mb-6">
                Share your improvement ideas or report issues that need corrective action
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setFormData({...formData, type: 'kaizen'})}
                      className={`p-4 border-2 rounded-lg text-left cursor-pointer transition-colors ${
                        formData.type === 'kaizen'
                          ? 'border-teal-600 bg-teal-50'
                          : 'border-gray-300 hover:border-teal-600 hover:bg-teal-50'
                      }`}
                    >
                      <i className="ri-loop-right-line text-lg text-teal-600"></i>
                      <p className="text-sm font-semibold text-gray-900 mt-2">Kaizen</p>
                      <p className="text-xs text-gray-600 mt-1">Continuous improvement idea</p>
                    </button>
                    <button
                      onClick={() => setFormData({...formData, type: 'capa'})}
                      className={`p-4 border-2 rounded-lg text-left cursor-pointer transition-colors ${
                        formData.type === 'capa'
                          ? 'border-blue-600 bg-blue-50'
                          : 'border-gray-300 hover:border-blue-600 hover:bg-blue-50'
                      }`}
                    >
                      <i className="ri-shield-check-line text-lg text-blue-600"></i>
                      <p className="text-sm font-semibold text-gray-900 mt-2">CAPA</p>
                      <p className="text-xs text-gray-600 mt-1">Corrective/Preventive action</p>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Title *</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({...formData, title: e.target.value})}
                    placeholder="Brief description of the improvement"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({...formData, category: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm cursor-pointer"
                  >
                    <option>Process Improvement</option>
                    <option>Quality</option>
                    <option>Safety</option>
                    <option>Cost Reduction</option>
                    <option>Productivity</option>
                    <option>Maintenance</option>
                    <option>Inventory Management</option>
                    <option>Sustainability</option>
                    <option>Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({...formData, priority: e.target.value as any})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm cursor-pointer"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Problem Statement *</label>
                  <textarea
                    rows={3}
                    value={formData.problem_statement}
                    onChange={(e) => setFormData({...formData, problem_statement: e.target.value})}
                    placeholder="What is the current problem or opportunity?"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm resize-none"
                  ></textarea>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Proposed Solution *</label>
                  <textarea
                    rows={3}
                    value={formData.proposed_solution}
                    onChange={(e) => setFormData({...formData, proposed_solution: e.target.value})}
                    placeholder="How do you suggest solving this?"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm resize-none"
                  ></textarea>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Expected Benefit</label>
                  <textarea
                    rows={2}
                    value={formData.expected_benefit}
                    onChange={(e) => setFormData({...formData, expected_benefit: e.target.value})}
                    placeholder="What improvements do you expect?"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm resize-none"
                  ></textarea>
                </div>

                <div className="flex items-center justify-end space-x-3 pt-4">
                  <button
                    onClick={() => setShowCreateModal(false)}
                    disabled={submitting}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer whitespace-nowrap text-sm font-medium disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors cursor-pointer whitespace-nowrap text-sm font-medium disabled:opacity-50 flex items-center space-x-2"
                  >
                    {submitting && <i className="ri-loader-4-line animate-spin"></i>}
                    <span>{submitting ? 'Submitting...' : 'Submit Idea'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal - Similar to Create but with all fields */}
      {showEditModal && editingItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Edit Item</h2>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingItem(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
              >
                <i className="ri-close-line text-xl text-gray-600"></i>
              </button>
            </div>

            <div className="p-6">
              <div className="space-y-4">
                {/* Basic Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Title *</label>
                    <input
                      type="text"
                      value={editingItem.title}
                      onChange={(e) => setEditingItem({...editingItem, title: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                    <select
                      value={editingItem.category}
                      onChange={(e) => setEditingItem({...editingItem, category: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm cursor-pointer"
                    >
                      <option>Process Improvement</option>
                      <option>Quality</option>
                      <option>Safety</option>
                      <option>Cost Reduction</option>
                      <option>Productivity</option>
                      <option>Maintenance</option>
                      <option>Inventory Management</option>
                      <option>Sustainability</option>
                      <option>Other</option>
                    </select>
                  </div>
                </div>

                {/* Problem & Solution */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Problem Statement</label>
                  <textarea
                    rows={3}
                    value={editingItem.problem_statement || ''}
                    onChange={(e) => setEditingItem({...editingItem, problem_statement: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm resize-none"
                  ></textarea>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Root Cause</label>
                  <textarea
                    rows={2}
                    value={editingItem.root_cause || ''}
                    onChange={(e) => setEditingItem({...editingItem, root_cause: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm resize-none"
                  ></textarea>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Proposed Solution</label>
                  <textarea
                    rows={3}
                    value={editingItem.proposed_solution || ''}
                    onChange={(e) => setEditingItem({...editingItem, proposed_solution: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm resize-none"
                  ></textarea>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Implementation Plan</label>
                  <textarea
                    rows={4}
                    value={editingItem.implementation_plan || ''}
                    onChange={(e) => setEditingItem({...editingItem, implementation_plan: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm resize-none"
                  ></textarea>
                </div>

                {/* Benefits */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Expected Benefit</label>
                    <textarea
                      rows={2}
                      value={editingItem.expected_benefit || ''}
                      onChange={(e) => setEditingItem({...editingItem, expected_benefit: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm resize-none"
                    ></textarea>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Actual Benefit</label>
                    <textarea
                      rows={2}
                      value={editingItem.actual_benefit || ''}
                      onChange={(e) => setEditingItem({...editingItem, actual_benefit: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm resize-none"
                    ></textarea>
                  </div>
                </div>

                {/* Cost & Timeline */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Cost Estimate ($)</label>
                    <input
                      type="number"
                      value={editingItem.cost_estimate || ''}
                      onChange={(e) => setEditingItem({...editingItem, cost_estimate: parseFloat(e.target.value) || undefined})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Actual Cost ($)</label>
                    <input
                      type="number"
                      value={editingItem.actual_cost || ''}
                      onChange={(e) => setEditingItem({...editingItem, actual_cost: parseFloat(e.target.value) || undefined})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Target Date</label>
                    <input
                      type="date"
                      value={editingItem.target_date || ''}
                      onChange={(e) => setEditingItem({...editingItem, target_date: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Completion Date</label>
                    <input
                      type="date"
                      value={editingItem.completion_date || ''}
                      onChange={(e) => setEditingItem({...editingItem, completion_date: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                    />
                  </div>
                </div>

                {/* Verification */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Verification Method</label>
                  <textarea
                    rows={2}
                    value={editingItem.verification_method || ''}
                    onChange={(e) => setEditingItem({...editingItem, verification_method: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm resize-none"
                  ></textarea>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Effectiveness Check</label>
                  <textarea
                    rows={2}
                    value={editingItem.effectiveness_check || ''}
                    onChange={(e) => setEditingItem({...editingItem, effectiveness_check: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm resize-none"
                  ></textarea>
                </div>

                <div className="flex items-center justify-end space-x-3 pt-4">
                  <button
                    onClick={() => {
                      setShowEditModal(false);
                      setEditingItem(null);
                    }}
                    disabled={submitting}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer whitespace-nowrap text-sm font-medium disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUpdate}
                    disabled={submitting}
                    className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors cursor-pointer whitespace-nowrap text-sm font-medium disabled:opacity-50 flex items-center space-x-2"
                  >
                    {submitting && <i className="ri-loader-4-line animate-spin"></i>}
                    <span>{submitting ? 'Updating...' : 'Update Item'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete Item"
        message="Are you sure you want to delete this item? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmDelete}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setItemToDelete(null);
        }}
        variant="danger"
      />
    </div>
  );
}

// Status colors for pie chart
const STATUS_COLORS = {
  'Draft': '#94a3b8',
  'Submitted': '#3b82f6',
  'Under Review': '#f59e0b',
  'Approved': '#8b5cf6',
  'In Progress': '#14b8a6',
  'Completed': '#10b981'
};

// Helper function to get status distribution
function getStatusDistribution(items: any[]) {
  const statusCounts: Record<string, number> = {};
  items.forEach(item => {
    statusCounts[item.status] = (statusCounts[item.status] || 0) + 1;
  });
  
  return Object.entries(statusCounts).map(([name, value]) => ({ name, value }));
}

// Helper function to get category distribution
function getCategoryDistribution(items: any[]) {
  const categoryCounts: Record<string, number> = {};
  items.forEach(item => {
    categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
  });
  
  return Object.entries(categoryCounts)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

// Helper function to get benefits data
function getBenefitsData(items: any[]) {
  const monthlyTotals = new Map<string, { expected: number; actual: number }>();

  items
    .filter((item: any) => item.created_at)
    .forEach((item: any) => {
      const monthKey = new Date(item.created_at).toLocaleDateString('en-US', { month: 'short' });
      const existing = monthlyTotals.get(monthKey) || { expected: 0, actual: 0 };

      const expectedFromCost = typeof item.cost_estimate === 'number' ? item.cost_estimate : 0;
      const actualFromCost = typeof item.actual_cost === 'number' ? item.actual_cost : 0;
      const expectedFallback = item.expected_benefit ? 1 : 0;
      const actualFallback = item.actual_benefit ? 1 : 0;

      monthlyTotals.set(monthKey, {
        expected: existing.expected + expectedFromCost + expectedFallback,
        actual: existing.actual + actualFromCost + actualFallback,
      });
    });

  if (monthlyTotals.size === 0) {
    return [];
  }

  return Array.from(monthlyTotals.entries()).map(([month, totals]) => ({
    month,
    expected: totals.expected,
    actual: totals.actual,
  }));
}
