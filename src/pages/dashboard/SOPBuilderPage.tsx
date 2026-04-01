import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/useToast';
import ConfirmDialog from '../../components/common/ConfirmDialog';

interface SOPDocument {
  id: string;
  title: string;
  description: string;
  category: string;
  version: string;
  status: 'draft' | 'review' | 'approved' | 'archived';
  created_by: string;
  approved_by?: string;
  approved_at?: string;
  created_at: string;
  updated_at: string;
}

interface SOPSection {
  id: string;
  sop_id: string;
  title: string;
  content: string;
  order_index: number;
}

export default function SOPBuilderPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [sops, setSOPs] = useState<SOPDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showSectionsModal, setShowSectionsModal] = useState(false);
  const [selectedSOP, setSelectedSOP] = useState<SOPDocument | null>(null);
  const [sections, setSections] = useState<SOPSection[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [sopToDelete, setSopToDelete] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: '',
    version: '1.0',
    status: 'draft' as const
  });

  const [sectionForm, setSectionForm] = useState({
    title: '',
    content: ''
  });

  useEffect(() => {
    fetchSOPs();
  }, []);

  const fetchSOPs = async () => {
    try {
      setLoading(true);
      const { data: orgData } = await supabase
        .from('user_organizations')
        .select('organization_id')
        .eq('user_id', user?.id)
        .single();

      if (!orgData) return;

      const { data, error } = await supabase
        .from('sop_documents')
        .select('*')
        .eq('organization_id', orgData.organization_id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSOPs(data || []);
    } catch (error) {
      console.error('Error fetching SOPs:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSections = async (sopId: string) => {
    try {
      const { data, error } = await supabase
        .from('sop_sections')
        .select('*')
        .eq('sop_id', sopId)
        .order('order_index', { ascending: true });

      if (error) throw error;
      setSections(data || []);
    } catch (error) {
      console.error('Error fetching sections:', error);
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

      if (selectedSOP) {
        const { error } = await supabase
          .from('sop_documents')
          .update({
            ...formData,
            updated_at: new Date().toISOString()
          })
          .eq('id', selectedSOP.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('sop_documents')
          .insert({
            ...formData,
            organization_id: orgData.organization_id,
            created_by: user?.id
          });

        if (error) throw error;
      }

      setShowModal(false);
      setSelectedSOP(null);
      setFormData({
        title: '',
        description: '',
        category: '',
        version: '1.0',
        status: 'draft'
      });
      fetchSOPs();
    } catch (error) {
      console.error('Error saving SOP:', error);
    }
  };

  const handleAddSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSOP) return;

    try {
      const { error } = await supabase
        .from('sop_sections')
        .insert({
          sop_id: selectedSOP.id,
          title: sectionForm.title,
          content: sectionForm.content,
          order_index: sections.length
        });

      if (error) throw error;

      setSectionForm({ title: '', content: '' });
      fetchSections(selectedSOP.id);
    } catch (error) {
      console.error('Error adding section:', error);
    }
  };

  const handleDeleteSection = async (sectionId: string) => {
    try {
      const { error } = await supabase
        .from('sop_sections')
        .delete()
        .eq('id', sectionId);

      if (error) throw error;
      if (selectedSOP) fetchSections(selectedSOP.id);
    } catch (error) {
      console.error('Error deleting section:', error);
    }
  };

  const handleApprove = async (sop: SOPDocument) => {
    try {
      const { error } = await supabase
        .from('sop_documents')
        .update({
          status: 'approved',
          approved_by: user?.id,
          approved_at: new Date().toISOString()
        })
        .eq('id', sop.id);

      if (error) throw error;
      fetchSOPs();
    } catch (error) {
      console.error('Error approving SOP:', error);
    }
  };

  const handleDelete = async (id: string) => {
    setSopToDelete(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!sopToDelete) return;

    try {
      const { error } = await supabase
        .from('sop_documents')
        .delete()
        .eq('id', sopToDelete);

      if (error) throw error;
      fetchSOPs();
      showToast('SOP deleted successfully', 'success');
    } catch (error) {
      console.error('Error deleting SOP:', error);
      showToast('Failed to delete SOP', 'error');
    } finally {
      setShowDeleteConfirm(false);
      setSopToDelete(null);
    }
  };

  const openEditModal = (sop: SOPDocument) => {
    setSelectedSOP(sop);
    setFormData({
      title: sop.title,
      description: sop.description,
      category: sop.category,
      version: sop.version,
      status: sop.status
    });
    setShowModal(true);
  };

  const openSectionsModal = (sop: SOPDocument) => {
    setSelectedSOP(sop);
    fetchSections(sop.id);
    setShowSectionsModal(true);
  };

  const filteredSOPs = sops.filter(sop => {
    const matchesStatus = filterStatus === 'all' || sop.status === filterStatus;
    const matchesSearch = sop.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         sop.category.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'review': return 'bg-yellow-100 text-yellow-800';
      case 'approved': return 'bg-teal-100 text-teal-800';
      case 'archived': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const stats = {
    total: sops.length,
    draft: sops.filter(s => s.status === 'draft').length,
    approved: sops.filter(s => s.status === 'approved').length,
    review: sops.filter(s => s.status === 'review').length
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">SOP Builder</h1>
          <p className="text-gray-600 mt-1">Create and manage standard operating procedures</p>
        </div>
        <button
          onClick={() => {
            setSelectedSOP(null);
            setFormData({
              title: '',
              description: '',
              category: '',
              version: '1.0',
              status: 'draft'
            });
            setShowModal(true);
          }}
          className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap flex items-center gap-2"
        >
          <i className="ri-add-line"></i>
          Create SOP
        </button>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total SOPs</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
            <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center">
              <i className="ri-file-list-3-line text-2xl text-teal-600"></i>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Draft</p>
              <p className="text-2xl font-bold text-gray-900">{stats.draft}</p>
            </div>
            <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
              <i className="ri-draft-line text-2xl text-gray-600"></i>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">In Review</p>
              <p className="text-2xl font-bold text-gray-900">{stats.review}</p>
            </div>
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <i className="ri-eye-line text-2xl text-yellow-600"></i>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Approved</p>
              <p className="text-2xl font-bold text-gray-900">{stats.approved}</p>
            </div>
            <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center">
              <i className="ri-checkbox-circle-line text-2xl text-teal-600"></i>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg border border-gray-200 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search SOPs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          >
            <option value="all">All Status</option>
            <option value="draft">Draft</option>
            <option value="review">In Review</option>
            <option value="approved">Approved</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>

      {/* SOPs List */}
      <div className="grid grid-cols-1 gap-4">
        {filteredSOPs.map((sop) => (
          <div key={sop.id} className="bg-white p-6 rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-lg font-semibold text-gray-900">{sop.title}</h3>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${getStatusColor(sop.status)}`}>
                    {sop.status.charAt(0).toUpperCase() + sop.status.slice(1)}
                  </span>
                  <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-medium whitespace-nowrap">
                    v{sop.version}
                  </span>
                </div>
                <p className="text-gray-600 text-sm mb-3">{sop.description}</p>
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <span className="flex items-center gap-1">
                    <i className="ri-folder-line"></i>
                    {sop.category}
                  </span>
                  <span className="flex items-center gap-1">
                    <i className="ri-calendar-line"></i>
                    {new Date(sop.created_at).toLocaleDateString()}
                  </span>
                  {sop.approved_at && (
                    <span className="flex items-center gap-1 text-teal-600">
                      <i className="ri-checkbox-circle-line"></i>
                      Approved {new Date(sop.approved_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 ml-4">
                <button
                  onClick={() => openSectionsModal(sop)}
                  className="p-2 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                  title="Manage Sections"
                >
                  <i className="ri-list-check text-xl"></i>
                </button>
                {sop.status !== 'approved' && (
                  <button
                    onClick={() => handleApprove(sop)}
                    className="p-2 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                    title="Approve"
                  >
                    <i className="ri-checkbox-circle-line text-xl"></i>
                  </button>
                )}
                <button
                  onClick={() => openEditModal(sop)}
                  className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Edit"
                >
                  <i className="ri-edit-line text-xl"></i>
                </button>
                <button
                  onClick={() => handleDelete(sop.id)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Delete"
                >
                  <i className="ri-delete-bin-line text-xl"></i>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredSOPs.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <i className="ri-file-list-3-line text-6xl text-gray-300 mb-4"></i>
          <p className="text-gray-500">No SOPs found. Create your first SOP to get started.</p>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">
                {selectedSOP ? 'Edit SOP' : 'Create New SOP'}
              </h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  required
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <input
                    type="text"
                    required
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Version</label>
                  <input
                    type="text"
                    required
                    value={formData.version}
                    onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                >
                  <option value="draft">Draft</option>
                  <option value="review">In Review</option>
                  <option value="approved">Approved</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setSelectedSOP(null);
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
                >
                  {selectedSOP ? 'Update SOP' : 'Create SOP'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sections Modal */}
      {showSectionsModal && selectedSOP && (
        <div className="fixed inset-0 bg-black bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">Manage Sections: {selectedSOP.title}</h2>
                <button
                  onClick={() => {
                    setShowSectionsModal(false);
                    setSelectedSOP(null);
                    setSections([]);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line text-2xl"></i>
                </button>
              </div>
            </div>
            <div className="p-6">
              {/* Add Section Form */}
              <form onSubmit={handleAddSection} className="mb-6 p-4 bg-gray-50 rounded-lg">
                <h3 className="font-semibold text-gray-900 mb-3">Add New Section</h3>
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="Section Title"
                    required
                    value={sectionForm.title}
                    onChange={(e) => setSectionForm({ ...sectionForm, title: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                  <textarea
                    placeholder="Section Content"
                    required
                    value={sectionForm.content}
                    onChange={(e) => setSectionForm({ ...sectionForm, content: e.target.value })}
                    rows={4}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
                  >
                    Add Section
                  </button>
                </div>
              </form>

              {/* Sections List */}
              <div className="space-y-3">
                {sections.map((section, index) => (
                  <div key={section.id} className="p-4 bg-white border border-gray-200 rounded-lg">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="px-2 py-1 bg-teal-100 text-teal-700 rounded text-xs font-medium whitespace-nowrap">
                            Section {index + 1}
                          </span>
                          <h4 className="font-semibold text-gray-900">{section.title}</h4>
                        </div>
                        <p className="text-gray-600 text-sm whitespace-pre-wrap">{section.content}</p>
                      </div>
                      <button
                        onClick={() => handleDeleteSection(section.id)}
                        className="ml-4 p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <i className="ri-delete-bin-line text-xl"></i>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {sections.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <i className="ri-file-list-line text-4xl mb-2"></i>
                  <p>No sections yet. Add your first section above.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete SOP"
        message="Are you sure you want to delete this SOP? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmDelete}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setSopToDelete(null);
        }}
        variant="danger"
      />
    </div>
  );
}