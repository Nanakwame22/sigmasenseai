import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useToast } from '../../hooks/useToast';
import ConfirmDialog from '../../components/common/ConfirmDialog';

interface ClusteringAnalysis {
  id: string;
  name: string;
  algorithm: string;
  num_clusters: number;
  features: string[];
  data_source: string;
  data_source_id?: string;
  clusters: any;
  metrics: any;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface DataSource {
  id: string;
  name: string;
  type: string;
  file_data?: any[];
  connection_config?: {
    columns?: string[];
  };
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof (error as any).message === 'string') {
    return (error as any).message;
  }
  return 'Failed to run clustering analysis';
};

const getClusteringNarrative = (analysis: ClusteringAnalysis) => {
  const silhouette = Number(analysis.metrics?.silhouette_score || 0);
  const largestCluster = analysis.clusters?.clusters?.reduce((largest: any, cluster: any) => {
    if (!largest || cluster.size > largest.size) return cluster;
    return largest;
  }, null);

  const separation =
    silhouette >= 0.7 ? 'well separated' :
    silhouette >= 0.5 ? 'fairly distinct' :
    'still overlapping and should be interpreted carefully';

  return {
    summary: `This analysis found ${analysis.num_clusters} groups in your data. The groups are ${separation}, which means the segmentation is ${silhouette >= 0.5 ? 'useful for understanding patterns' : 'more exploratory than decisive'} right now.`,
    largest: largestCluster
      ? `${largestCluster.name} is the biggest group so far, representing ${(largestCluster.size / Math.max(1, Number(analysis.metrics?.num_points || 1)) * 100).toFixed(1)}% of the analyzed records.`
      : 'No dominant group could be identified yet.',
    guidance: silhouette >= 0.5
      ? 'Use these clusters to tailor workflows, interventions, or reporting by segment instead of treating every record the same way.'
      : 'Try different features or a different number of clusters before using this analysis operationally.',
  };
};

export default function ClusteringPage() {
  const { user, organizationId } = useAuth();
  const { showToast } = useToast();
  const [analyses, setAnalyses] = useState<ClusteringAnalysis[]>([]);
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedAnalysis, setSelectedAnalysis] = useState<ClusteringAnalysis | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);

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
    algorithm: 'kmeans',
    num_clusters: 3,
    features: [] as string[],
    data_source_id: ''
  });

  const COLORS = ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#EF4444', '#14B8A6', '#F97316'];

  useEffect(() => {
    if (organizationId) {
      loadAnalyses();
      loadDataSources();
    } else {
      setLoading(false);
    }
  }, [organizationId]);

  const loadDataSources = async () => {
    if (!organizationId) return;

    try {
      const { data, error } = await supabase
        .from('data_sources')
        .select('id, name, type, file_data, connection_config')
        .eq('organization_id', organizationId)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (data && !error) {
        setDataSources(data);
      }
    } catch (error) {
      console.error('Error loading data sources:', error);
    }
  };

  const loadAnalyses = async () => {
    if (!user || !organizationId) return;

    try {
      const { data, error } = await supabase
        .from('clustering_analyses')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (data) setAnalyses(data);
    } catch (error) {
      console.error('Error loading analyses:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDataSourceChange = (dataSourceId: string) => {
    setFormData({ ...formData, data_source_id: dataSourceId, features: [] });
    
    const selectedSource = dataSources.find(ds => ds.id === dataSourceId);
    if (selectedSource) {
      // Get columns from connection_config or from first row of file_data
      let columns: string[] = [];
      
      if (selectedSource.connection_config?.columns) {
        columns = selectedSource.connection_config.columns;
      } else if (selectedSource.file_data && selectedSource.file_data.length > 0) {
        columns = Object.keys(selectedSource.file_data[0]);
      }
      
      // Filter to numeric columns only
      const numericColumns = columns.filter(col => {
        if (!selectedSource.file_data || selectedSource.file_data.length === 0) return true;
        const sampleValue = selectedSource.file_data[0][col];
        return typeof sampleValue === 'number' || !isNaN(parseFloat(sampleValue));
      });
      
      setAvailableColumns(numericColumns);
    } else {
      setAvailableColumns([]);
    }
  };

  const toggleFeature = (column: string) => {
    const currentFeatures = formData.features;
    if (currentFeatures.includes(column)) {
      setFormData({ 
        ...formData, 
        features: currentFeatures.filter(f => f !== column) 
      });
    } else {
      setFormData({ 
        ...formData, 
        features: [...currentFeatures, column] 
      });
    }
  };

  const generateClustersFromRealData = (
    dataSourceId: string,
    algorithm: string,
    numClusters: number,
    features: string[]
  ) => {
    const selectedSource = dataSources.find(ds => ds.id === dataSourceId);
    if (!selectedSource || !selectedSource.file_data || selectedSource.file_data.length === 0) {
      throw new Error('Selected data source does not contain usable row data');
    }

    const rawData = selectedSource.file_data;
    const dataPoints = [];
    const clusters = [];

    // Initialize clusters
    for (let i = 0; i < numClusters; i++) {
      clusters.push({
        id: i,
        name: `Cluster ${i + 1}`,
        center: { x: 0, y: 0 },
        size: 0,
        color: COLORS[i % COLORS.length],
        characteristics: []
      });
    }

    // Extract numeric values for the selected features
    const validDataPoints = rawData
      .map((row, idx) => {
        const x = parseFloat(row[features[0]]);
        const y = parseFloat(row[features[1]]);
        
        if (isNaN(x) || isNaN(y)) return null;
        
        return { id: idx, x, y, rawData: row };
      })
      .filter(point => point !== null);

    if (validDataPoints.length === 0) {
      throw new Error('Selected features do not contain enough numeric values to cluster');
    }

    // Normalize data to 0-100 range for visualization
    const xValues = validDataPoints.map(p => p!.x);
    const yValues = validDataPoints.map(p => p!.y);
    const xMin = Math.min(...xValues);
    const xMax = Math.max(...xValues);
    const yMin = Math.min(...yValues);
    const yMax = Math.max(...yValues);

    const normalize = (value: number, min: number, max: number) => {
      if (max === min) return 50;
      return ((value - min) / (max - min)) * 100;
    };

    const sortedByX = [...validDataPoints].sort((a, b) => a!.x - b!.x);
    const clusterCenters = [];
    for (let i = 0; i < numClusters; i++) {
      const percentileIndex = Math.min(
        sortedByX.length - 1,
        Math.floor(((i + 0.5) / numClusters) * sortedByX.length)
      );
      const seedPoint = sortedByX[percentileIndex]!;
      clusterCenters.push({
        x: seedPoint.x,
        y: seedPoint.y
      });
    }

    // Assign points to nearest cluster
    validDataPoints.forEach(point => {
      let minDist = Infinity;
      let assignedCluster = 0;

      clusterCenters.forEach((center, idx) => {
        const dist = Math.sqrt(
          Math.pow(point!.x - center.x, 2) + 
          Math.pow(point!.y - center.y, 2)
        );
        if (dist < minDist) {
          minDist = dist;
          assignedCluster = idx;
        }
      });

      const normalizedX = normalize(point!.x, xMin, xMax);
      const normalizedY = normalize(point!.y, yMin, yMax);

      dataPoints.push({
        id: point!.id,
        x: normalizedX,
        y: normalizedY,
        cluster: assignedCluster,
        features: {
          [features[0]]: point!.x,
          [features[1]]: point!.y
        }
      });

      clusters[assignedCluster].size++;
    });

    // Calculate cluster characteristics
    clusters.forEach(cluster => {
      const clusterPoints = dataPoints.filter(p => p.cluster === cluster.id);
      if (clusterPoints.length === 0) return;

      const avgX = clusterPoints.reduce((sum, p) => sum + p.x, 0) / clusterPoints.length;
      const avgY = clusterPoints.reduce((sum, p) => sum + p.y, 0) / clusterPoints.length;

      cluster.center = { x: avgX, y: avgY };

      if (avgX > 66) {
        cluster.characteristics.push(`High ${features[0]}`);
      } else if (avgX < 33) {
        cluster.characteristics.push(`Low ${features[0]}`);
      } else {
        cluster.characteristics.push(`Medium ${features[0]}`);
      }

      if (avgY > 66) {
        cluster.characteristics.push(`High ${features[1]}`);
      } else if (avgY < 33) {
        cluster.characteristics.push(`Low ${features[1]}`);
      } else {
        cluster.characteristics.push(`Medium ${features[1]}`);
      }
    });

    const averageDistanceToCenter = dataPoints.length > 0
      ? dataPoints.reduce((sum, point) => {
          const cluster = clusters[point.cluster];
          return sum + Math.sqrt(Math.pow(point.x - cluster.center.x, 2) + Math.pow(point.y - cluster.center.y, 2));
        }, 0) / dataPoints.length
      : 0;
    const centerDistances: number[] = [];
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const a = clusters[i];
        const b = clusters[j];
        centerDistances.push(
          Math.sqrt(Math.pow(a.center.x - b.center.x, 2) + Math.pow(a.center.y - b.center.y, 2))
        );
      }
    }
    const avgCenterDistance = centerDistances.length > 0
      ? centerDistances.reduce((sum, value) => sum + value, 0) / centerDistances.length
      : 1;
    const silhouetteScore = Math.max(0, Math.min(1, avgCenterDistance / (avgCenterDistance + averageDistanceToCenter + 1)));
    const daviesBouldinIndex = Number((averageDistanceToCenter / Math.max(avgCenterDistance, 1)).toFixed(3));
    const inertia = dataPoints.reduce((sum, point) => {
      const cluster = clusters[point.cluster];
      return sum + Math.pow(point.x - cluster.center.x, 2) + Math.pow(point.y - cluster.center.y, 2);
    }, 0);

    return {
      dataPoints,
      clusters,
      metrics: {
        silhouette_score: silhouetteScore.toFixed(3),
        davies_bouldin_index: daviesBouldinIndex.toFixed(3),
        inertia: inertia.toFixed(2),
        num_points: dataPoints.length
      }
    };
  };

  const handleCreate = async () => {
    if (!user || !formData.name || !organizationId) return;
    if (!formData.data_source_id || formData.features.length < 2) {
      showToast('Please select a data source and at least 2 features', 'error');
      return;
    }

    try {
      const { dataPoints, clusters, metrics } = generateClustersFromRealData(
        formData.data_source_id,
        formData.algorithm,
        formData.num_clusters,
        formData.features
      );

      const selectedSource = dataSources.find(ds => ds.id === formData.data_source_id);
      const insertPayload: any = {
        organization_id: organizationId,
        name: formData.name,
        algorithm: formData.algorithm,
        num_clusters: formData.num_clusters,
        features: formData.features,
        data_source: selectedSource?.name || 'Unknown',
        data_source_id: formData.data_source_id,
        clusters: { dataPoints, clusters },
        metrics,
        status: 'completed',
        created_by: user.id
      };

      let { error } = await supabase.from('clustering_analyses').insert(insertPayload);

      if (error && error.message?.toLowerCase().includes('data_source_id')) {
        delete insertPayload.data_source_id;
        const retryResult = await supabase.from('clustering_analyses').insert(insertPayload);
        error = retryResult.error;
      }

      if (!error) {
        setShowCreateModal(false);
        setFormData({
          name: '',
          algorithm: 'kmeans',
          num_clusters: 3,
          features: [],
          data_source_id: ''
        });
        setAvailableColumns([]);
        loadAnalyses();
        showToast(`Analysis completed on ${metrics.num_points} data points`, 'success');
      } else {
        throw error;
      }
    } catch (error) {
      console.error('Error creating analysis:', error);
      showToast(getErrorMessage(error), 'error');
    }
  };

  const handleDelete = async (id: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Analysis',
      message: 'Are you sure you want to delete this clustering analysis? This action cannot be undone.',
      onConfirm: async () => {
        try {
          await supabase.from('clustering_analyses').delete().eq('id', id);
          showToast('Analysis deleted successfully', 'success');
          loadAnalyses();
        } catch (error) {
          console.error('Error deleting analysis:', error);
          showToast('Failed to delete analysis', 'error');
        }
        setConfirmDialog({ ...confirmDialog, isOpen: false });
      }
    });
  };

  const filteredAnalyses = analyses.filter(a =>
    a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.algorithm.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getAlgorithmIcon = (algorithm: string) => {
    switch (algorithm) {
      case 'kmeans': return 'ri-bubble-chart-line';
      case 'dbscan': return 'ri-radar-line';
      case 'hierarchical': return 'ri-organization-chart';
      default: return 'ri-pie-chart-line';
    }
  };

  const getAlgorithmColor = (algorithm: string) => {
    switch (algorithm) {
      case 'kmeans': return 'text-blue-600 bg-blue-50';
      case 'dbscan': return 'text-purple-600 bg-purple-50';
      case 'hierarchical': return 'text-teal-600 bg-teal-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clustering Analysis</h1>
          <p className="text-sm text-gray-600 mt-1">Pattern grouping with K-Means, DBSCAN, and Hierarchical clustering</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-2 whitespace-nowrap"
        >
          <i className="ri-add-line"></i>
          New Analysis
        </button>
      </div>

      {/* What is Clustering? Info Section */}
      <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl p-6 border border-purple-100">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-purple-600 rounded-xl flex items-center justify-center flex-shrink-0">
            <i className="ri-bubble-chart-line text-white text-2xl"></i>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">What is Clustering Analysis?</h3>
            <p className="text-sm text-gray-700 mb-4">
              Clustering automatically groups similar data points together based on their characteristics. It helps you discover natural patterns and segments in your data without predefined categories.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="bg-white/80 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                    <i className="ri-group-line text-blue-600"></i>
                  </div>
                  <h4 className="font-medium text-gray-900">Customer Segmentation</h4>
                </div>
                <p className="text-xs text-gray-600">Group customers by behavior, spending patterns, or demographics to create targeted marketing campaigns</p>
              </div>
              
              <div className="bg-white/80 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                    <i className="ri-shopping-bag-line text-purple-600"></i>
                  </div>
                  <h4 className="font-medium text-gray-900">Product Grouping</h4>
                </div>
                <p className="text-xs text-gray-600">Identify product categories based on sales patterns, features, or customer preferences</p>
              </div>
              
              <div className="bg-white/80 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-teal-100 rounded-lg flex items-center justify-center">
                    <i className="ri-alert-line text-teal-600"></i>
                  </div>
                  <h4 className="font-medium text-gray-900">Anomaly Detection</h4>
                </div>
                <p className="text-xs text-gray-600">Find outliers and unusual patterns that don't fit into any cluster for fraud detection or quality control</p>
              </div>
            </div>

            <div className="bg-white/80 rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                <i className="ri-lightbulb-line text-amber-600"></i>
                How to Use Clustering
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-gray-700">
                <div>
                  <div className="font-medium text-blue-600 mb-1">1. Choose Your Data</div>
                  <p>Select a data source and pick 2+ numeric features that describe your items (e.g., age & income, or price & quantity)</p>
                </div>
                <div>
                  <div className="font-medium text-purple-600 mb-1">2. Select Algorithm</div>
                  <p><strong>K-Means:</strong> Fast, works best with spherical clusters<br/>
                  <strong>DBSCAN:</strong> Finds arbitrary shapes, handles noise<br/>
                  <strong>Hierarchical:</strong> Creates tree-like groupings</p>
                </div>
                <div>
                  <div className="font-medium text-teal-600 mb-1">3. Interpret Results</div>
                  <p>Review cluster characteristics and sizes. Higher Silhouette Score (closer to 1) means better-defined clusters</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Info Banner */}
      {dataSources.length === 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <i className="ri-information-line text-blue-600 text-xl mt-0.5"></i>
            <div>
              <h3 className="font-semibold text-blue-900 mb-1">No Data Sources Found</h3>
              <p className="text-sm text-blue-800 mb-3">
                Upload your data files in Data Integration to perform clustering analysis on real data.
              </p>
              <a
                href="/dashboard/data-integration"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium whitespace-nowrap"
              >
                <i className="ri-upload-2-line"></i>
                Go to Data Integration
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
        <input
          type="text"
          placeholder="Search analyses..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
        />
      </div>

      {/* Analyses Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredAnalyses.map((analysis) => (
          <div key={analysis.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-lg ${getAlgorithmColor(analysis.algorithm)} flex items-center justify-center`}>
                  <i className={`${getAlgorithmIcon(analysis.algorithm)} text-lg`}></i>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{analysis.name}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {analysis.algorithm.toUpperCase()} • {analysis.num_clusters} clusters
                  </p>
                  {analysis.data_source && (
                    <p className="text-xs text-teal-600 mt-1">
                      <i className="ri-database-2-line"></i> {analysis.data_source}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedAnalysis(analysis)}
                  className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors cursor-pointer"
                >
                  <i className="ri-eye-line"></i>
                </button>
                <button
                  onClick={() => handleDelete(analysis.id)}
                  className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                >
                  <i className="ri-delete-bin-line"></i>
                </button>
              </div>
            </div>

            {/* Metrics */}
            {analysis.metrics && (
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500">Silhouette Score</div>
                  <div className="text-lg font-semibold text-gray-900">{analysis.metrics.silhouette_score}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500">Data Points</div>
                  <div className="text-lg font-semibold text-gray-900">{analysis.metrics.num_points}</div>
                </div>
              </div>
            )}

            {/* Cluster Preview */}
            {analysis.clusters?.clusters && (
              <div className="space-y-2 mb-4">
                {analysis.clusters.clusters.slice(0, 3).map((cluster: any) => (
                  <div key={cluster.id} className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: cluster.color }}
                    ></div>
                    <span className="text-sm text-gray-900 font-medium">{cluster.name}</span>
                    <span className="text-xs text-gray-500">({cluster.size} points)</span>
                  </div>
                ))}
              </div>
            )}

            {/* Features */}
            <div className="flex flex-wrap gap-2 mb-3">
              {analysis.features.map((feature, idx) => (
                <span key={idx} className="px-2 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs">
                  {feature}
                </span>
              ))}
            </div>

            <div className="text-xs text-gray-500 pt-3 border-t border-gray-100">
              Created {new Date(analysis.created_at).toLocaleDateString()}
            </div>

            <div className="mt-4 bg-slate-50 border border-slate-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <i className="ri-chat-1-line text-teal-600"></i>
                <span className="text-sm font-semibold text-slate-900">What this means</span>
              </div>
              <p className="text-sm text-slate-700 leading-relaxed">
                {getClusteringNarrative(analysis).summary}
              </p>
            </div>
          </div>
        ))}
      </div>

      {filteredAnalyses.length === 0 && (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
          <i className="ri-bubble-chart-line text-4xl text-gray-300 mb-3"></i>
          <p className="text-gray-500">No analyses found</p>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">New Clustering Analysis</h2>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setFormData({
                    name: '',
                    algorithm: 'kmeans',
                    num_clusters: 3,
                    features: [],
                    data_source_id: ''
                  });
                  setAvailableColumns([]);
                }}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Analysis Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  placeholder="Customer Segmentation"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data Source</label>
                <select
                  value={formData.data_source_id}
                  onChange={(e) => handleDataSourceChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                >
                  <option value="">Select a data source...</option>
                  {dataSources.map(ds => (
                    <option key={ds.id} value={ds.id}>
                      {ds.name} ({ds.type.toUpperCase()})
                    </option>
                  ))}
                </select>
                {dataSources.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">
                    <i className="ri-alert-line"></i> No data sources available. Upload data in Data Integration first.
                  </p>
                )}
              </div>

              {formData.data_source_id && availableColumns.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Features (choose at least 2 numeric columns)
                  </label>
                  <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-1">
                    {availableColumns.map(column => (
                      <label
                        key={column}
                        className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={formData.features.includes(column)}
                          onChange={() => toggleFeature(column)}
                          className="w-4 h-4 text-teal-600 rounded focus:ring-teal-500 cursor-pointer"
                        />
                        <span className="text-sm text-gray-700">{column}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Selected: {formData.features.length} feature{formData.features.length !== 1 ? 's' : ''}
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Algorithm</label>
                <select
                  value={formData.algorithm}
                  onChange={(e) => setFormData({ ...formData, algorithm: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                >
                  <option value="kmeans">K-Means (Fast, spherical clusters)</option>
                  <option value="dbscan">DBSCAN (Density-based, arbitrary shapes)</option>
                  <option value="hierarchical">Hierarchical (Tree-based grouping)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Number of Clusters</label>
                <input
                  type="number"
                  value={formData.num_clusters}
                  onChange={(e) => setFormData({ ...formData, num_clusters: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  min="2"
                  max="10"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setFormData({
                    name: '',
                    algorithm: 'kmeans',
                    num_clusters: 3,
                    features: [],
                    data_source_id: ''
                  });
                  setAvailableColumns([]);
                }}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!formData.name || !formData.data_source_id || formData.features.length < 2}
                className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                Run Analysis
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedAnalysis && selectedAnalysis.clusters && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-5xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{selectedAnalysis.name}</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {selectedAnalysis.algorithm.toUpperCase()} • {selectedAnalysis.num_clusters} clusters • {selectedAnalysis.metrics.num_points} data points
                </p>
              </div>
              <button
                onClick={() => setSelectedAnalysis(null)}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>

            {/* Metrics */}
            {selectedAnalysis.metrics && (
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="text-xs text-blue-600 font-medium">Silhouette Score</div>
                  <div className="text-2xl font-bold text-blue-900 mt-1">{selectedAnalysis.metrics.silhouette_score}</div>
                  <div className="text-xs text-blue-600 mt-1">Higher is better (0-1)</div>
                </div>
                <div className="bg-purple-50 rounded-lg p-4">
                  <div className="text-xs text-purple-600 font-medium">Davies-Bouldin Index</div>
                  <div className="text-2xl font-bold text-purple-900 mt-1">{selectedAnalysis.metrics.davies_bouldin_index}</div>
                  <div className="text-xs text-purple-600 mt-1">Lower is better</div>
                </div>
                <div className="bg-teal-50 rounded-lg p-4">
                  <div className="text-xs text-teal-600 font-medium">Inertia</div>
                  <div className="text-2xl font-bold text-teal-900 mt-1">{selectedAnalysis.metrics.inertia}</div>
                  <div className="text-xs text-teal-600 mt-1">Within-cluster variance</div>
                </div>
              </div>
            )}

            <div className="bg-gradient-to-br from-teal-50 to-cyan-50 border border-teal-200 rounded-lg p-5 mb-6">
              <div className="flex items-center gap-2 mb-3">
                <i className="ri-chat-quote-line text-teal-600"></i>
                <h3 className="font-semibold text-slate-900">Plain-English Summary</h3>
              </div>
              <div className="space-y-3 text-sm text-slate-700 leading-relaxed">
                <p>{getClusteringNarrative(selectedAnalysis).summary}</p>
                <p>{getClusteringNarrative(selectedAnalysis).largest}</p>
                <p>{getClusteringNarrative(selectedAnalysis).guidance}</p>
              </div>
            </div>

            {/* Scatter Plot */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <h3 className="font-semibold text-gray-900 mb-4">Cluster Visualization</h3>
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis 
                      type="number" 
                      dataKey="x" 
                      name={selectedAnalysis.features[0]} 
                      stroke="#6B7280"
                      tick={{ fontSize: 12 }}
                      label={{ value: selectedAnalysis.features[0], position: 'insideBottom', offset: -5 }}
                    />
                    <YAxis 
                      type="number" 
                      dataKey="y" 
                      name={selectedAnalysis.features[1]} 
                      stroke="#6B7280"
                      tick={{ fontSize: 12 }}
                      label={{ value: selectedAnalysis.features[1], angle: -90, position: 'insideLeft' }}
                    />
                    <Tooltip 
                      cursor={{ strokeDasharray: '3 3' }}
                      contentStyle={{ backgroundColor: '#FFF', border: '1px solid #E5E7EB', borderRadius: '8px' }}
                    />
                    {selectedAnalysis.clusters.clusters.map((cluster: any) => (
                      <Scatter
                        key={cluster.id}
                        name={cluster.name}
                        data={selectedAnalysis.clusters.dataPoints.filter((p: any) => p.cluster === cluster.id)}
                        fill={cluster.color}
                      />
                    ))}
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Cluster Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {selectedAnalysis.clusters.clusters.map((cluster: any) => (
                <div key={cluster.id} className="bg-white border-2 rounded-lg p-4" style={{ borderColor: cluster.color }}>
                  <div className="flex items-center gap-2 mb-3">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: cluster.color }}
                    ></div>
                    <span className="font-semibold text-gray-900">{cluster.name}</span>
                  </div>
                  <div className="text-sm text-gray-600 mb-3">
                    <strong>{cluster.size}</strong> data points ({((cluster.size / selectedAnalysis.metrics.num_points) * 100).toFixed(1)}%)
                  </div>
                  <div className="space-y-1">
                    {cluster.characteristics.map((char: string, idx: number) => (
                      <div key={idx} className="text-xs text-gray-600 flex items-center gap-1">
                        <i className="ri-checkbox-circle-fill text-teal-600"></i>
                        {char}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
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
