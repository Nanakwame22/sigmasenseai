import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/useToast';
import ConfirmDialog from '../../components/common/ConfirmDialog';

interface KnowledgeArticle {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  author_id: string;
  status: 'draft' | 'published' | 'archived';
  views: number;
  helpful_count: number;
  created_at: string;
  updated_at: string;
}

export default function KnowledgeLibraryPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<KnowledgeArticle | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [articleToDelete, setArticleToDelete] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    content: '',
    category: '',
    tags: '',
    status: 'published' as const
  });

  useEffect(() => {
    fetchArticles();
  }, []);

  const fetchArticles = async () => {
    try {
      setLoading(true);
      const { data: orgData } = await supabase
        .from('user_organizations')
        .select('organization_id')
        .eq('user_id', user?.id)
        .single();

      if (!orgData) return;

      const { data, error } = await supabase
        .from('knowledge_articles')
        .select('*')
        .eq('organization_id', orgData.organization_id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setArticles(data || []);
    } catch (error) {
      console.error('Error fetching articles:', error);
    } finally {
      setLoading(false);
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

      const tagsArray = formData.tags.split(',').map(tag => tag.trim()).filter(tag => tag);

      if (selectedArticle) {
        const { error } = await supabase
          .from('knowledge_articles')
          .update({
            title: formData.title,
            content: formData.content,
            category: formData.category,
            tags: tagsArray,
            status: formData.status,
            updated_at: new Date().toISOString()
          })
          .eq('id', selectedArticle.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('knowledge_articles')
          .insert({
            title: formData.title,
            content: formData.content,
            category: formData.category,
            tags: tagsArray,
            status: formData.status,
            organization_id: orgData.organization_id,
            author_id: user?.id
          });

        if (error) throw error;
      }

      setShowModal(false);
      setSelectedArticle(null);
      setFormData({
        title: '',
        content: '',
        category: '',
        tags: '',
        status: 'published'
      });
      fetchArticles();
    } catch (error) {
      console.error('Error saving article:', error);
    }
  };

  const handleView = async (article: KnowledgeArticle) => {
    setSelectedArticle(article);
    setShowViewModal(true);

    // Increment view count
    try {
      await supabase
        .from('knowledge_articles')
        .update({ views: article.views + 1 })
        .eq('id', article.id);
      
      fetchArticles();
    } catch (error) {
      console.error('Error updating views:', error);
    }
  };

  const handleHelpful = async (article: KnowledgeArticle) => {
    try {
      await supabase
        .from('knowledge_articles')
        .update({ helpful_count: article.helpful_count + 1 })
        .eq('id', article.id);
      
      fetchArticles();
    } catch (error) {
      console.error('Error updating helpful count:', error);
    }
  };

  const handleDelete = async (id: string) => {
    setArticleToDelete(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!articleToDelete) return;

    try {
      const { error } = await supabase
        .from('knowledge_articles')
        .delete()
        .eq('id', articleToDelete);

      if (error) throw error;
      fetchArticles();
      showToast('Article deleted successfully', 'success');
    } catch (error) {
      console.error('Error deleting article:', error);
      showToast('Failed to delete article', 'error');
    } finally {
      setShowDeleteConfirm(false);
      setArticleToDelete(null);
    }
  };

  const openEditModal = (article: KnowledgeArticle) => {
    setSelectedArticle(article);
    setFormData({
      title: article.title,
      content: article.content,
      category: article.category,
      tags: article.tags.join(', '),
      status: article.status
    });
    setShowModal(true);
  };

  const categories = Array.from(new Set(articles.map(a => a.category))).filter(Boolean);

  const filteredArticles = articles.filter(article => {
    const matchesCategory = filterCategory === 'all' || article.category === filterCategory;
    const matchesSearch = article.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         article.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         article.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesCategory && matchesSearch && article.status === 'published';
  });

  const stats = {
    total: articles.filter(a => a.status === 'published').length,
    views: articles.reduce((sum, a) => sum + a.views, 0),
    helpful: articles.reduce((sum, a) => sum + a.helpful_count, 0),
    categories: categories.length
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
          <h1 className="text-3xl font-bold text-gray-900">Knowledge Library</h1>
          <p className="text-gray-600 mt-1">Centralized documentation and best practices</p>
        </div>
        <button
          onClick={() => {
            setSelectedArticle(null);
            setFormData({
              title: '',
              content: '',
              category: '',
              tags: '',
              status: 'published'
            });
            setShowModal(true);
          }}
          className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap flex items-center gap-2"
        >
          <i className="ri-add-line"></i>
          Create Article
        </button>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Articles</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
            <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center">
              <i className="ri-book-line text-2xl text-teal-600"></i>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Views</p>
              <p className="text-2xl font-bold text-gray-900">{stats.views}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <i className="ri-eye-line text-2xl text-blue-600"></i>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Helpful Votes</p>
              <p className="text-2xl font-bold text-gray-900">{stats.helpful}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <i className="ri-thumb-up-line text-2xl text-green-600"></i>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Categories</p>
              <p className="text-2xl font-bold text-gray-900">{stats.categories}</p>
            </div>
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <i className="ri-folder-line text-2xl text-orange-600"></i>
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
              placeholder="Search articles, tags..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          >
            <option value="all">All Categories</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Articles Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredArticles.map((article) => (
          <div key={article.id} className="bg-white p-6 rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <span className="px-3 py-1 bg-teal-100 text-teal-700 rounded-full text-xs font-medium whitespace-nowrap">
                {article.category}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openEditModal(article)}
                  className="p-1 text-gray-600 hover:bg-gray-100 rounded transition-colors"
                  title="Edit"
                >
                  <i className="ri-edit-line"></i>
                </button>
                <button
                  onClick={() => handleDelete(article.id)}
                  className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                  title="Delete"
                >
                  <i className="ri-delete-bin-line"></i>
                </button>
              </div>
            </div>
            
            <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-2">{article.title}</h3>
            <p className="text-gray-600 text-sm mb-4 line-clamp-3">{article.content}</p>
            
            {article.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {article.tags.slice(0, 3).map((tag, idx) => (
                  <span key={idx} className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs whitespace-nowrap">
                    #{tag}
                  </span>
                ))}
                {article.tags.length > 3 && (
                  <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs whitespace-nowrap">
                    +{article.tags.length - 3}
                  </span>
                )}
              </div>
            )}
            
            <div className="flex items-center justify-between pt-4 border-t border-gray-200">
              <div className="flex items-center gap-4 text-sm text-gray-500">
                <span className="flex items-center gap-1">
                  <i className="ri-eye-line"></i>
                  {article.views}
                </span>
                <span className="flex items-center gap-1">
                  <i className="ri-thumb-up-line"></i>
                  {article.helpful_count}
                </span>
              </div>
              <button
                onClick={() => handleView(article)}
                className="px-3 py-1 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors text-sm font-medium whitespace-nowrap"
              >
                Read More
              </button>
            </div>
          </div>
        ))}
      </div>

      {filteredArticles.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <i className="ri-book-line text-6xl text-gray-300 mb-4"></i>
          <p className="text-gray-500">No articles found. Create your first article to get started.</p>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">
                {selectedArticle ? 'Edit Article' : 'Create New Article'}
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
                <textarea
                  required
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  rows={10}
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tags (comma-separated)</label>
                <input
                  type="text"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  placeholder="best-practices, tutorial, guide"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setSelectedArticle(null);
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
                >
                  {selectedArticle ? 'Update Article' : 'Create Article'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Modal */}
      {showViewModal && selectedArticle && (
        <div className="fixed inset-0 bg-black bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <span className="px-3 py-1 bg-teal-100 text-teal-700 rounded-full text-xs font-medium whitespace-nowrap">
                    {selectedArticle.category}
                  </span>
                  <h2 className="text-2xl font-bold text-gray-900 mt-3">{selectedArticle.title}</h2>
                  <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <i className="ri-eye-line"></i>
                      {selectedArticle.views} views
                    </span>
                    <span className="flex items-center gap-1">
                      <i className="ri-thumb-up-line"></i>
                      {selectedArticle.helpful_count} helpful
                    </span>
                    <span className="flex items-center gap-1">
                      <i className="ri-calendar-line"></i>
                      {new Date(selectedArticle.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowViewModal(false);
                    setSelectedArticle(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="ri-close-line text-2xl"></i>
                </button>
              </div>
            </div>
            <div className="p-6">
              <div className="prose max-w-none mb-6">
                <p className="text-gray-700 whitespace-pre-wrap">{selectedArticle.content}</p>
              </div>
              
              {selectedArticle.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-6 pb-6 border-b border-gray-200">
                  {selectedArticle.tags.map((tag, idx) => (
                    <span key={idx} className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm whitespace-nowrap">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
              
              <div className="flex items-center justify-between">
                <p className="text-gray-600">Was this article helpful?</p>
                <button
                  onClick={() => {
                    handleHelpful(selectedArticle);
                    setShowViewModal(false);
                  }}
                  className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap flex items-center gap-2"
                >
                  <i className="ri-thumb-up-line"></i>
                  Yes, this helped
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete Article"
        message="Are you sure you want to delete this article? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmDelete}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setArticleToDelete(null);
        }}
        variant="danger"
      />
    </div>
  );
}