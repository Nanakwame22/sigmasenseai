import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, Radar, Cell
} from 'recharts';
import { useToast } from '../../hooks/useToast';
import ConfirmDialog from '../../components/common/ConfirmDialog';

interface Benchmark {
  id: string;
  organization_id: string;
  name: string;
  category: string;
  your_value: number;
  industry_avg: number;
  top_quartile: number;
  bottom_quartile: number;
  unit: string;
  description: string;
  data_source: string;
  created_at: string;
  updated_at: string;
}

const CATEGORIES = ['Quality', 'Efficiency', 'Cost', 'Delivery', 'Safety', 'Customer Satisfaction'];

const CATEGORY_COLORS: Record<string, string> = {
  Quality: '#14B8A6',
  Efficiency: '#F59E0B',
  Cost: '#EF4444',
  Delivery: '#8B5CF6',
  Safety: '#10B981',
  'Customer Satisfaction': '#F97316',
};

// For metrics where lower is better (e.g. defect rate, cost, incident rate)
const LOWER_IS_BETTER_KEYWORDS = [
  'defect', 'return rate', 'scrap', 'rework', 'changeover', 'energy efficiency',
  'cost', 'copq', 'maintenance cost', 'carrying cost', 'cycle time', 'variability',
  'incident', 'injury', 'response time', 'lead time'
];

function isLowerBetter(name: string): boolean {
  const lower = name.toLowerCase();
  return LOWER_IS_BETTER_KEYWORDS.some(k => lower.includes(k));
}

function calcPercentile(b: Benchmark): number {
  const { your_value, industry_avg, top_quartile, bottom_quartile } = b;
  const lowerBetter = isLowerBetter(b.name);

  if (lowerBetter) {
    // Invert: lower value = higher percentile
    if (your_value <= top_quartile) return 90;
    if (your_value <= industry_avg) return 50 + ((industry_avg - your_value) / (industry_avg - top_quartile)) * 40;
    if (your_value <= bottom_quartile) return 10 + ((bottom_quartile - your_value) / (bottom_quartile - industry_avg)) * 40;
    return 10;
  } else {
    if (your_value >= top_quartile) return 90;
    if (your_value >= industry_avg) return 50 + ((your_value - industry_avg) / (top_quartile - industry_avg)) * 40;
    if (your_value >= bottom_quartile) return 10 + ((your_value - bottom_quartile) / (industry_avg - bottom_quartile)) * 40;
    return 10;
  }
}

function calcGap(b: Benchmark): number {
  if (b.industry_avg === 0) return 0;
  return parseFloat((((b.your_value - b.industry_avg) / b.industry_avg) * 100).toFixed(1));
}

function getPerformanceLabel(p: number) {
  if (p >= 75) return 'Top Performer';
  if (p >= 50) return 'Above Average';
  if (p >= 25) return 'Below Average';
  return 'Needs Improvement';
}

function getPerformanceColor(p: number) {
  if (p >= 75) return 'text-emerald-600';
  if (p >= 50) return 'text-teal-600';
  if (p >= 25) return 'text-amber-600';
  return 'text-rose-600';
}

function getBarColor(p: number) {
  if (p >= 75) return '#10B981';
  if (p >= 50) return '#14B8A6';
  if (p >= 25) return '#F59E0B';
  return '#EF4444';
}

const defaultForm = {
  name: '',
  category: 'Quality',
  your_value: '',
  industry_avg: '',
  top_quartile: '',
  bottom_quartile: '',
  unit: '%',
  description: '',
  data_source: '',
};

export default function BenchmarkingPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingBenchmark, setEditingBenchmark] = useState<Benchmark | null>(null);
  const [formData, setFormData] = useState(defaultForm);
  const [selectedBenchmark, setSelectedBenchmark] = useState<Benchmark | null>(null);
  const [showChartModal, setShowChartModal] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false, title: '', message: '', onConfirm: () => {},
  });

  useEffect(() => { fetchBenchmarks(); }, [user]);

  const fetchBenchmarks = async () => {
    if (!user) return;
    try {
      const { data: orgData } = await supabase
        .from('user_organizations')
        .select('organization_id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!orgData) return;

      const { data, error } = await supabase
        .from('benchmarks')
        .select('*')
        .eq('organization_id', orgData.organization_id)
        .order('category', { ascending: true });

      if (error) throw error;
      setBenchmarks(data || []);
    } catch (err) {
      console.error('Error fetching benchmarks:', err);
    } finally {
      setLoading(false);
    }
  };

  const enriched = useMemo(() =>
    benchmarks.map(b => ({
      ...b,
      percentile: Math.round(calcPercentile(b)),
      gap: calcGap(b),
    })),
    [benchmarks]
  );

  const filtered = useMemo(() =>
    enriched.filter(b => {
      const matchCat = filterCategory === 'all' || b.category === filterCategory;
      const matchSearch = b.name.toLowerCase().includes(searchTerm.toLowerCase());
      return matchCat && matchSearch;
    }),
    [enriched, filterCategory, searchTerm]
  );

  const radarData = CATEGORIES.map(cat => {
    const catBenchmarks = enriched.filter(b => b.category === cat);
    const avg = catBenchmarks.length > 0
      ? Math.round(catBenchmarks.reduce((s, b) => s + b.percentile, 0) / catBenchmarks.length)
      : 0;
    return { category: cat.replace(' Satisfaction', '\nSatisfaction'), score: avg };
  });

  const topPerformers = enriched.filter(b => b.percentile >= 75).length;
  const aboveAvg = enriched.filter(b => b.percentile >= 50 && b.percentile < 75).length;
  const needsImprovement = enriched.filter(b => b.percentile < 50).length;
  const avgPercentile = enriched.length > 0
    ? Math.round(enriched.reduce((s, b) => s + b.percentile, 0) / enriched.length)
    : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      const { data: orgData } = await supabase
        .from('user_organizations')
        .select('organization_id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!orgData) return;

      const payload = {
        organization_id: orgData.organization_id,
        name: formData.name,
        category: formData.category,
        your_value: parseFloat(formData.your_value as string),
        industry_avg: parseFloat(formData.industry_avg as string),
        top_quartile: parseFloat(formData.top_quartile as string),
        bottom_quartile: parseFloat(formData.bottom_quartile as string),
        unit: formData.unit,
        description: formData.description,
        data_source: formData.data_source,
      };

      if (editingBenchmark) {
        const { error } = await supabase.from('benchmarks').update(payload).eq('id', editingBenchmark.id);
        if (error) throw error;
        showToast('Benchmark updated successfully', 'success');
      } else {
        const { error } = await supabase.from('benchmarks').insert([payload]);
        if (error) throw error;
        showToast('Benchmark added successfully', 'success');
      }

      setShowModal(false);
      setEditingBenchmark(null);
      setFormData(defaultForm);
      fetchBenchmarks();
    } catch (err) {
      console.error('Error saving benchmark:', err);
      showToast('Failed to save benchmark', 'error');
    }
  };

  const handleDelete = (id: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Benchmark',
      message: 'Are you sure you want to delete this benchmark? This action cannot be undone.',
      onConfirm: async () => {
        try {
          const { error } = await supabase.from('benchmarks').delete().eq('id', id);
          if (error) throw error;
          showToast('Benchmark deleted', 'success');
          fetchBenchmarks();
        } catch {
          showToast('Failed to delete benchmark', 'error');
        }
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
      },
    });
  };

  const openEdit = (b: Benchmark) => {
    setEditingBenchmark(b);
    setFormData({
      name: b.name,
      category: b.category,
      your_value: String(b.your_value),
      industry_avg: String(b.industry_avg),
      top_quartile: String(b.top_quartile),
      bottom_quartile: String(b.bottom_quartile),
      unit: b.unit || '%',
      description: b.description || '',
      data_source: b.data_source || '',
    });
    setShowModal(true);
  };

  const comparisonData = (b: Benchmark & { percentile: number }) => [
    { name: 'Your Value', value: b.your_value, fill: getBarColor(b.percentile) },
    { name: 'Industry Avg', value: b.industry_avg, fill: '#94A3B8' },
    { name: 'Top Quartile', value: b.top_quartile, fill: '#10B981' },
    { name: 'Bottom Quartile', value: b.bottom_quartile, fill: '#FCA5A5' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Industry Benchmarking</h1>
          <p className="text-gray-500 mt-1 text-sm">
            {enriched.length} benchmarks across {CATEGORIES.length} categories — general standards
          </p>
        </div>
        <button
          onClick={() => { setEditingBenchmark(null); setFormData(defaultForm); setShowModal(true); }}
          className="px-5 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-2 whitespace-nowrap text-sm font-medium"
        >
          <i className="ri-add-line"></i> Add Benchmark
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
        {[
          { label: 'Total Benchmarks', value: enriched.length, icon: 'ri-bar-chart-line', bg: 'bg-teal-50', color: 'text-teal-600' },
          { label: 'Top Performers', value: topPerformers, icon: 'ri-trophy-line', bg: 'bg-emerald-50', color: 'text-emerald-600' },
          { label: 'Above Average', value: aboveAvg, icon: 'ri-arrow-up-line', bg: 'bg-amber-50', color: 'text-amber-600' },
          { label: 'Needs Improvement', value: needsImprovement, icon: 'ri-alert-line', bg: 'bg-rose-50', color: 'text-rose-600' },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-xl p-5 border border-gray-200 flex items-center gap-4">
            <div className={`w-11 h-11 ${card.bg} rounded-lg flex items-center justify-center`}>
              <i className={`${card.icon} ${card.color} text-xl`}></i>
            </div>
            <div>
              <p className="text-xs text-gray-500">{card.label}</p>
              <p className="text-2xl font-bold text-gray-900">{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Radar Chart */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-1">Category Performance Overview</h3>
          <p className="text-xs text-gray-500 mb-4">Average percentile rank per category (0–100)</p>
          <ResponsiveContainer width="100%" height={320}>
            <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
              <PolarGrid stroke="#E5E7EB" />
              <PolarAngleAxis dataKey="category" tick={{ fontSize: 11, fill: '#6B7280' }} />
              <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10, fill: '#9CA3AF' }} />
              <Radar name="Percentile" dataKey="score" stroke="#14B8A6" fill="#14B8A6" fillOpacity={0.55} />
              <Tooltip
                formatter={(v: number) => [`${v}th percentile`, 'Avg Rank']}
                contentStyle={{ borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 12 }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Category Bar Chart */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-1">Percentile by Category</h3>
          <p className="text-xs text-gray-500 mb-4">Average percentile rank — higher is better</p>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart
              data={CATEGORIES.map(cat => {
                const items = enriched.filter(b => b.category === cat);
                return {
                  name: cat === 'Customer Satisfaction' ? 'Cust. Sat.' : cat,
                  score: items.length > 0 ? Math.round(items.reduce((s, b) => s + b.percentile, 0) / items.length) : 0,
                  fill: CATEGORY_COLORS[cat],
                };
              })}
              margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6B7280' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#6B7280' }} />
              <Tooltip
                formatter={(v: number) => [`${v}th percentile`]}
                contentStyle={{ borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 12 }}
              />
              <Bar dataKey="score" radius={[6, 6, 0, 0]}>
                {CATEGORIES.map(cat => (
                  <Cell key={cat} fill={CATEGORY_COLORS[cat]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-3 items-center">
        <div className="flex-1 min-w-[220px] relative">
          <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
          <input
            type="text"
            placeholder="Search benchmarks..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {['all', ...CATEGORIES].map(cat => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                filterCategory === cat
                  ? 'bg-teal-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat === 'all' ? 'All' : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Benchmark Cards Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <i className="ri-bar-chart-line text-5xl text-gray-300 mb-3"></i>
          <p className="text-gray-500 text-sm">No benchmarks match your search.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map(b => (
            <div key={b.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
              {/* Card Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-gray-900 text-sm leading-tight">{b.name}</h4>
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <span
                      className="px-2 py-0.5 text-xs rounded-full font-medium"
                      style={{
                        backgroundColor: CATEGORY_COLORS[b.category] + '20',
                        color: CATEGORY_COLORS[b.category],
                      }}
                    >
                      {b.category}
                    </span>
                    <span className={`text-xs font-medium ${getPerformanceColor(b.percentile)}`}>
                      {getPerformanceLabel(b.percentile)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-2 shrink-0">
                  <button
                    onClick={() => { setSelectedBenchmark(b); setShowChartModal(true); }}
                    className="w-7 h-7 flex items-center justify-center text-teal-600 hover:bg-teal-50 rounded-lg transition-colors cursor-pointer"
                    title="View Chart"
                  >
                    <i className="ri-bar-chart-line text-sm"></i>
                  </button>
                  <button
                    onClick={() => openEdit(b)}
                    className="w-7 h-7 flex items-center justify-center text-gray-400 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                    title="Edit"
                  >
                    <i className="ri-edit-line text-sm"></i>
                  </button>
                  <button
                    onClick={() => handleDelete(b.id)}
                    className="w-7 h-7 flex items-center justify-center text-gray-400 hover:bg-rose-50 hover:text-rose-500 rounded-lg transition-colors cursor-pointer"
                    title="Delete"
                  >
                    <i className="ri-delete-bin-line text-sm"></i>
                  </button>
                </div>
              </div>

              {/* Values */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="text-center p-2 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-0.5">Yours</p>
                  <p className="text-base font-bold text-gray-900">{b.your_value}</p>
                  <p className="text-xs text-gray-400">{b.unit}</p>
                </div>
                <div className="text-center p-2 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-0.5">Avg</p>
                  <p className="text-base font-semibold text-gray-700">{b.industry_avg}</p>
                  <p className="text-xs text-gray-400">{b.unit}</p>
                </div>
                <div className="text-center p-2 bg-emerald-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-0.5">Top 25%</p>
                  <p className="text-base font-semibold text-emerald-700">{b.top_quartile}</p>
                  <p className="text-xs text-gray-400">{b.unit}</p>
                </div>
              </div>

              {/* Percentile Bar */}
              <div className="mb-3">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Percentile Rank</span>
                  <span className="font-semibold text-gray-800">{b.percentile}th</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2.5">
                  <div
                    className="h-2.5 rounded-full transition-all duration-500"
                    style={{ width: `${b.percentile}%`, backgroundColor: getBarColor(b.percentile) }}
                  ></div>
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                  <span>0</span>
                  <span>50</span>
                  <span>100</span>
                </div>
              </div>

              {/* Gap */}
              <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <span className="text-xs text-gray-500">Gap vs Industry Avg</span>
                <span className={`text-sm font-bold ${b.gap >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {b.gap >= 0 ? '+' : ''}{b.gap}%
                </span>
              </div>

              {b.data_source && (
                <p className="text-xs text-gray-400 mt-2 truncate" title={b.data_source}>
                  <i className="ri-file-text-line mr-1"></i>{b.data_source}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Chart Detail Modal */}
      {showChartModal && selectedBenchmark && (() => {
        const enrichedSelected = enriched.find(e => e.id === selectedBenchmark.id) || { ...selectedBenchmark, percentile: Math.round(calcPercentile(selectedBenchmark)), gap: calcGap(selectedBenchmark) };
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full">
              <div className="p-5 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{selectedBenchmark.name}</h2>
                  <p className="text-xs text-gray-500 mt-0.5">{selectedBenchmark.category} · {selectedBenchmark.unit}</p>
                </div>
                <button
                  onClick={() => setShowChartModal(false)}
                  className="w-8 h-8 flex items-center justify-center text-gray-400 hover:bg-gray-100 rounded-lg cursor-pointer"
                >
                  <i className="ri-close-line text-lg"></i>
                </button>
              </div>

              <div className="p-5">
                {selectedBenchmark.description && (
                  <p className="text-sm text-gray-600 mb-4 bg-gray-50 rounded-lg p-3">{selectedBenchmark.description}</p>
                )}

                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={comparisonData(enrichedSelected as any)} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6B7280' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} />
                    <Tooltip
                      formatter={(v: number) => [`${v} ${selectedBenchmark.unit}`]}
                      contentStyle={{ borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 12 }}
                    />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                      {comparisonData(enrichedSelected as any).map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>

                <div className="grid grid-cols-3 gap-3 mt-4">
                  <div className="p-3 bg-gray-50 rounded-lg text-center">
                    <p className="text-xs text-gray-500">Percentile Rank</p>
                    <p className={`text-xl font-bold mt-1 ${getPerformanceColor(enrichedSelected.percentile)}`}>
                      {enrichedSelected.percentile}th
                    </p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg text-center">
                    <p className="text-xs text-gray-500">Status</p>
                    <p className={`text-sm font-semibold mt-1 ${getPerformanceColor(enrichedSelected.percentile)}`}>
                      {getPerformanceLabel(enrichedSelected.percentile)}
                    </p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg text-center">
                    <p className="text-xs text-gray-500">Gap vs Avg</p>
                    <p className={`text-xl font-bold mt-1 ${enrichedSelected.gap >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {enrichedSelected.gap >= 0 ? '+' : ''}{enrichedSelected.gap}%
                    </p>
                  </div>
                </div>

                {selectedBenchmark.data_source && (
                  <p className="text-xs text-gray-400 mt-3 text-center">
                    Source: {selectedBenchmark.data_source}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">
                {editingBenchmark ? 'Edit Benchmark' : 'Add New Benchmark'}
              </h2>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  required
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="e.g., Defect Rate"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                  <select
                    required
                    value={formData.category}
                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unit *</label>
                  <input
                    required
                    type="text"
                    value={formData.unit}
                    onChange={e => setFormData({ ...formData, unit: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    placeholder="%, days, score..."
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {[
                  { key: 'your_value', label: 'Your Value' },
                  { key: 'industry_avg', label: 'Industry Average' },
                  { key: 'top_quartile', label: 'Top Quartile (75th)' },
                  { key: 'bottom_quartile', label: 'Bottom Quartile (25th)' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{f.label} *</label>
                    <input
                      required
                      type="number"
                      step="any"
                      value={(formData as any)[f.key]}
                      onChange={e => setFormData({ ...formData, [f.key]: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    />
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="What does this metric measure?"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data Source</label>
                <input
                  type="text"
                  value={formData.data_source}
                  onChange={e => setFormData({ ...formData, data_source: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="e.g., ASQ Benchmark Report 2024"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setEditingBenchmark(null); setFormData(defaultForm); }}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm whitespace-nowrap cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm whitespace-nowrap cursor-pointer"
                >
                  {editingBenchmark ? 'Update' : 'Add Benchmark'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
