import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import {
  twoSampleTTest,
  oneSampleTTest,
  pairedTTest,
  chiSquareTest,
  oneWayANOVA,
  zTestProportions,
  calculateSampleSize,
} from '../../services/statisticalTests';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ScatterChart, Scatter, ZAxis, Cell } from 'recharts';
import { useToast } from '../../hooks/useToast';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { Link } from 'react-router-dom';

interface HypothesisTest {
  id: string;
  name: string;
  description: string;
  test_type: 't_test' | 'z_test' | 'chi_square' | 'anova' | 'paired_t_test';
  null_hypothesis: string;
  alternative_hypothesis: string;
  significance_level: number;
  sample_size_1: number;
  sample_size_2?: number;
  mean_1: number;
  mean_2?: number;
  std_dev_1: number;
  std_dev_2?: number;
  test_statistic: number;
  p_value: number;
  degrees_of_freedom: number;
  confidence_interval_lower: number;
  confidence_interval_upper: number;
  result: 'reject_null' | 'fail_to_reject' | 'inconclusive';
  conclusion: string;
  created_at: string;
}

interface Metric {
  id: string;
  name: string;
}

export default function HypothesisTestingPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [tests, setTests] = useState<HypothesisTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [organizationId, setOrganizationId] = useState<string>('');
  const [calculating, setCalculating] = useState(false);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [metricsWithData, setMetricsWithData] = useState<Array<{ id: string; name: string; dataCount: number }>>([]);
  const [selectedMetricForLoad, setSelectedMetricForLoad] = useState<string>('');
  const [loadingMetricData, setLoadingMetricData] = useState(false);

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
    description: '',
    test_type: 't_test' as const,
    null_hypothesis: '',
    alternative_hypothesis: '',
    significance_level: 0.05,
    data_input_method: 'summary' as 'summary' | 'raw',
    // Summary statistics
    sample_size_1: 30,
    sample_size_2: 30,
    mean_1: 0,
    mean_2: 0,
    std_dev_1: 1,
    std_dev_2: 1,
    // Raw data
    raw_data_1: '',
    raw_data_2: '',
    // Chi-square data
    chi_square_data: '',
    // ANOVA data
    anova_groups: '',
    // Z-test proportions
    successes_1: 0,
    successes_2: 0,
  });

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

      await Promise.all([
        loadTests(orgData.organization_id),
        loadMetrics(orgData.organization_id)
      ]);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTests = async (orgId: string) => {
    const { data, error } = await supabase
      .from('hypothesis_tests')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading tests:', error);
      return;
    }

    setTests(data || []);
  };

  const loadMetrics = async (orgId: string) => {
    const { data: metricsRes, error } = await supabase
      .from('metrics')
      .select('id, name')
      .eq('organization_id', orgId);

    if (error) {
      console.error('Error loading metrics:', error);
      return;
    }

    if (metricsRes) {
      setMetrics(metricsRes);
      
      // Fetch data point counts for each metric
      const metricsWithCounts = await Promise.all(
        metricsRes.map(async (metric) => {
          const { count } = await supabase
            .from('metric_data')
            .select('*', { count: 'exact', head: true })
            .eq('metric_id', metric.id);
          
          return {
            id: metric.id,
            name: metric.name,
            dataCount: count || 0
          };
        })
      );
      
      setMetricsWithData(metricsWithCounts);
    }
  };

  const loadMetricDataIntoForm = async (metricId: string, targetField: 'raw_data_1' | 'raw_data_2') => {
    if (!metricId) return;

    setLoadingMetricData(true);
    try {
      const { data, error } = await supabase
        .from('metric_data')
        .select('value')
        .eq('metric_id', metricId)
        .order('timestamp', { ascending: true });

      if (error) throw error;

      if (data && data.length > 0) {
        const values = data.map(d => d.value).join(', ');
        setFormData(prev => ({
          ...prev,
          [targetField]: values
        }));
        showToast(`Loaded ${data.length} data points from metric`, 'success');
      } else {
        showToast('No data points found for this metric', 'warning');
      }
    } catch (error) {
      console.error('Error loading metric data:', error);
      showToast('Failed to load metric data', 'error');
    } finally {
      setLoadingMetricData(false);
      setSelectedMetricForLoad('');
    }
  };

  const parseRawData = (dataString: string): number[] => {
    return dataString
      .split(/[\s,;]+/)
      .map(s => parseFloat(s.trim()))
      .filter(n => !isNaN(n));
  };

  const handleCalculate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !organizationId) return;

    setCalculating(true);

    try {
      let result: any;
      let testData: any = {
        name: formData.name,
        description: formData.description,
        test_type: formData.test_type,
        null_hypothesis: formData.null_hypothesis,
        alternative_hypothesis: formData.alternative_hypothesis,
        significance_level: formData.significance_level,
        organization_id: organizationId,
        created_by: user.id,
      };

      // Perform the appropriate statistical test
      switch (formData.test_type) {
        case 't_test': {
          if (formData.data_input_method === 'raw') {
            const sample1 = parseRawData(formData.raw_data_1);
            const sample2 = parseRawData(formData.raw_data_2);
            result = twoSampleTTest(sample1, sample2, formData.significance_level);
            testData.sample_size_1 = sample1.length;
            testData.sample_size_2 = sample2.length;
            testData.mean_1 = sample1.reduce((a, b) => a + b, 0) / sample1.length;
            testData.mean_2 = sample2.reduce((a, b) => a + b, 0) / sample2.length;
          } else {
            // Generate sample data from summary statistics for testing
            const sample1 = Array(formData.sample_size_1).fill(0).map(() => 
              formData.mean_1 + (Math.random() - 0.5) * formData.std_dev_1 * 2
            );
            const sample2 = Array(formData.sample_size_2).fill(0).map(() => 
              formData.mean_2 + (Math.random() - 0.5) * formData.std_dev_2 * 2
            );
            result = twoSampleTTest(sample1, sample2, formData.significance_level);
            testData.sample_size_1 = formData.sample_size_1;
            testData.sample_size_2 = formData.sample_size_2;
            testData.mean_1 = formData.mean_1;
            testData.mean_2 = formData.mean_2;
            testData.std_dev_1 = formData.std_dev_1;
            testData.std_dev_2 = formData.std_dev_2;
          }
          testData.test_statistic = result.testStatistic;
          testData.p_value = result.pValue;
          testData.degrees_of_freedom = result.degreesOfFreedom;
          testData.confidence_interval_lower = result.confidenceIntervalLower;
          testData.confidence_interval_upper = result.confidenceIntervalUpper;
          testData.result = result.result;
          break;
        }

        case 'paired_t_test': {
          const before = parseRawData(formData.raw_data_1);
          const after = parseRawData(formData.raw_data_2);
          result = pairedTTest(before, after, formData.significance_level);
          testData.sample_size_1 = before.length;
          testData.test_statistic = result.testStatistic;
          testData.p_value = result.pValue;
          testData.degrees_of_freedom = result.degreesOfFreedom;
          testData.confidence_interval_lower = result.confidenceIntervalLower;
          testData.confidence_interval_upper = result.confidenceIntervalUpper;
          testData.result = result.result;
          break;
        }

        case 'z_test': {
          result = zTestProportions(
            formData.successes_1,
            formData.sample_size_1,
            formData.successes_2,
            formData.sample_size_2,
            formData.significance_level
          );
          testData.sample_size_1 = formData.sample_size_1;
          testData.sample_size_2 = formData.sample_size_2;
          testData.test_statistic = result.testStatistic;
          testData.p_value = result.pValue;
          testData.result = result.result;
          break;
        }

        case 'chi_square': {
          const rows = formData.chi_square_data.trim().split('\n');
          const observed = rows.map(row => 
            row.split(/[\s,;]+/).map(s => parseFloat(s.trim())).filter(n => !isNaN(n))
          );
          result = chiSquareTest(observed, formData.significance_level);
          testData.test_statistic = result.testStatistic;
          testData.p_value = result.pValue;
          testData.degrees_of_freedom = result.degreesOfFreedom;
          testData.result = result.result;
          break;
        }

        case 'anova': {
          const groupStrings = formData.anova_groups.trim().split('\n');
          const groups = groupStrings.map(group => parseRawData(group));
          result = oneWayANOVA(groups, formData.significance_level);
          testData.test_statistic = result.fStatistic;
          testData.p_value = result.pValue;
          testData.degrees_of_freedom = result.dfBetween;
          testData.result = result.result;
          break;
        }
      }

      // Generate conclusion
      const conclusion = result.result === 'reject_null'
        ? `We reject the null hypothesis at α = ${formData.significance_level}. There is sufficient evidence to support the alternative hypothesis.`
        : `We fail to reject the null hypothesis at α = ${formData.significance_level}. There is insufficient evidence to support the alternative hypothesis.`;
      
      testData.conclusion = conclusion;

      // Save to database
      const { error } = await supabase
        .from('hypothesis_tests')
        .insert([testData]);

      if (error) throw error;

      showToast('Hypothesis test calculated successfully', 'success');
      await loadTests(organizationId);
      resetForm();
    } catch (error) {
      console.error('Error calculating test:', error);
      showToast('Failed to calculate hypothesis test. Please check your input data.', 'error');
    } finally {
      setCalculating(false);
    }
  };

  const handleDelete = async (id: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Test',
      message: 'Are you sure you want to delete this hypothesis test? This action cannot be undone.',
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from('hypothesis_tests')
            .delete()
            .eq('id', id);

          if (error) throw error;

          showToast('Test deleted successfully', 'success');
          setTests(tests.filter((t) => t.id !== id));
        } catch (error) {
          console.error('Error deleting test:', error);
          showToast('Failed to delete test', 'error');
        }
        setConfirmDialog({ ...confirmDialog, isOpen: false });
      }
    });
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      test_type: 't_test',
      null_hypothesis: '',
      alternative_hypothesis: '',
      significance_level: 0.05,
      data_input_method: 'summary',
      sample_size_1: 30,
      sample_size_2: 30,
      mean_1: 0,
      mean_2: 0,
      std_dev_1: 1,
      std_dev_2: 1,
      raw_data_1: '',
      raw_data_2: '',
      chi_square_data: '',
      anova_groups: '',
      successes_1: 0,
      successes_2: 0,
    });
    setShowModal(false);
  };

  const getTestTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      t_test: 'Two-Sample T-Test',
      paired_t_test: 'Paired T-Test',
      z_test: 'Z-Test (Proportions)',
      chi_square: 'Chi-Square Test',
      anova: 'One-Way ANOVA',
    };
    return labels[type] || type;
  };

  const getResultColor = (result: string) => {
    return result === 'reject_null' ? 'text-red-600' : 'text-green-600';
  };

  const testTypeDistribution = [
    { type: 'Two-Sample T-Test', count: tests.filter(t => t.test_type === 'two_sample_t').length },
    { type: 'Paired T-Test', count: tests.filter(t => t.test_type === 'paired_t').length },
    { type: 'Z-Test', count: tests.filter(t => t.test_type === 'z_test').length },
    { type: 'Chi-Square', count: tests.filter(t => t.test_type === 'chi_square').length },
    { type: 'ANOVA', count: tests.filter(t => t.test_type === 'anova').length }
  ];

  const resultDistribution = [
    { result: 'Reject H₀', count: tests.filter(t => t.result === 'reject').length, color: '#10B981' },
    { result: 'Fail to Reject', count: tests.filter(t => t.result === 'fail_to_reject').length, color: '#6B7280' }
  ];

  if (loading) return <LoadingSpinner />;

  const metricsWithSufficientData = metricsWithData.filter(m => m.dataCount >= 3);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Hypothesis Testing</h1>
          <p className="text-gray-600 mt-1">Perform statistical hypothesis tests</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap flex items-center gap-2"
        >
          <i className="ri-add-line"></i>
          New Test
        </button>
      </div>

      {/* Info Banner */}
      {metricsWithData.length === 0 ? (
        <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-lg mb-6">
          <div className="flex items-start">
            <i className="ri-information-line text-blue-600 text-xl mr-3 mt-0.5"></i>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-blue-900 mb-1">No Metrics Available</h3>
              <p className="text-sm text-blue-800 mb-3">
                While you can perform hypothesis tests with manual data entry, connecting to your metrics makes analysis faster and more accurate.
              </p>
              <Link
                to="/dashboard/metrics"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
              >
                <i className="ri-add-line"></i>
                Create Metrics
              </Link>
            </div>
          </div>
        </div>
      ) : metricsWithSufficientData.length === 0 ? (
        <div className="bg-orange-50 border-l-4 border-orange-400 p-4 rounded-lg mb-6">
          <div className="flex items-start">
            <i className="ri-alert-line text-orange-600 text-xl mr-3 mt-0.5"></i>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-orange-900 mb-1">Add Data for Quick Analysis</h3>
              <p className="text-sm text-orange-800 mb-2">
                Your metrics need at least 3 data points to be loaded into hypothesis tests. Add data to enable quick loading.
              </p>
              <ul className="text-sm text-orange-800 mb-3 space-y-1">
                {metricsWithData.slice(0, 5).map(m => (
                  <li key={m.id} className="flex items-center gap-2">
                    <i className="ri-close-circle-line text-orange-600"></i>
                    <span><strong>{m.name}</strong>: {m.dataCount} data {m.dataCount === 1 ? 'point' : 'points'}</span>
                  </li>
                ))}
                {metricsWithData.length > 5 && (
                  <li className="text-orange-700">...and {metricsWithData.length - 5} more</li>
                )}
              </ul>
              <Link
                to="/dashboard/metrics"
                className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700 transition-colors"
              >
                <i className="ri-add-circle-line"></i>
                Add Data Points
              </Link>
            </div>
          </div>
        </div>
      ) : metricsWithSufficientData.length < metricsWithData.length ? (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-lg mb-6">
          <div className="flex items-start">
            <i className="ri-information-line text-yellow-600 text-xl mr-3 mt-0.5"></i>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-yellow-900 mb-1">Metrics Data Status</h3>
              <p className="text-sm text-yellow-800 mb-2">
                <strong>{metricsWithSufficientData.length}</strong> of <strong>{metricsWithData.length}</strong> metrics have enough data for quick loading into tests.
              </p>
              <Link
                to="/dashboard/metrics"
                className="text-sm text-yellow-900 underline hover:text-yellow-700"
              >
                Add more data points to enable all metrics →
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-green-50 border-l-4 border-green-400 p-4 rounded-lg mb-6">
          <div className="flex items-start">
            <i className="ri-checkbox-circle-line text-green-600 text-xl mr-3 mt-0.5"></i>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-green-900 mb-1">Ready for Analysis</h3>
              <p className="text-sm text-green-800">
                <strong>{metricsWithSufficientData.length}</strong> metrics available with sufficient data. You can quickly load metric data into your hypothesis tests.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Test Type Distribution */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Tests by Type</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={testTypeDistribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis 
                dataKey="type" 
                stroke="#6B7280" 
                style={{ fontSize: '11px' }}
                angle={-45}
                textAnchor="end"
                height={100}
              />
              <YAxis stroke="#6B7280" style={{ fontSize: '12px' }} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#FFF', border: '1px solid #E5E7EB', borderRadius: '8px' }}
                labelStyle={{ color: '#111827', fontWeight: 600 }}
              />
              <Bar dataKey="count" fill="#14B8A6" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Result Distribution */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Test Results Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={resultDistribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="result" stroke="#6B7280" style={{ fontSize: '12px' }} />
              <YAxis stroke="#6B7280" style={{ fontSize: '12px' }} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#FFF', border: '1px solid #E5E7EB', borderRadius: '8px' }}
                labelStyle={{ color: '#111827', fontWeight: 600 }}
              />
              <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                {resultDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tests List */}
      <div className="space-y-4 mt-6">
        {tests.map((test) => (
          <div key={test.id} className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-xl font-bold text-gray-900">{test.name}</h3>
                  <span className="px-3 py-1 bg-teal-100 text-teal-800 text-xs font-medium rounded-full">
                    {getTestTypeLabel(test.test_type)}
                  </span>
                </div>
                {test.description && (
                  <p className="text-sm text-gray-600 mb-3">{test.description}</p>
                )}
              </div>
              <button
                onClick={() => handleDelete(test.id)}
                className="p-2 text-red-600 hover:bg-red-50 rounded"
                title="Delete"
              >
                <i className="ri-delete-bin-line text-lg"></i>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Hypotheses */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-2">Hypotheses</h4>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="font-medium text-gray-700">H₀:</span>
                    <span className="text-gray-600 ml-2">{test.null_hypothesis}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">H₁:</span>
                    <span className="text-gray-600 ml-2">{test.alternative_hypothesis}</span>
                  </div>
                </div>
              </div>

              {/* Test Results */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-2">Results</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Test Statistic:</span>
                    <span className="font-medium text-gray-900">{test.test_statistic.toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">P-Value:</span>
                    <span className="font-medium text-gray-900">{test.p_value.toFixed(6)}</span>
                  </div>
                  {test.degrees_of_freedom && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Degrees of Freedom:</span>
                      <span className="font-medium text-gray-900">{test.degrees_of_freedom}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-600">Significance Level:</span>
                    <span className="font-medium text-gray-900">α = {test.significance_level}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Confidence Interval */}
            {test.confidence_interval_lower !== null && test.confidence_interval_upper !== null && (
              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <div className="text-sm font-medium text-gray-700 mb-1">95% Confidence Interval</div>
                <div className="text-sm text-gray-600">
                  [{test.confidence_interval_lower.toFixed(4)}, {test.confidence_interval_upper.toFixed(4)}]
                </div>
              </div>
            )}

            {/* Conclusion */}
            <div className="mt-4 p-4 bg-gray-50 rounded-lg border-l-4 border-teal-500">
              <div className="flex items-start gap-3">
                <i className={`ri-information-line text-xl ${getResultColor(test.result)}`}></i>
                <div>
                  <div className={`font-semibold mb-1 ${getResultColor(test.result)}`}>
                    {test.result === 'reject_null' ? 'Reject Null Hypothesis' : 'Fail to Reject Null Hypothesis'}
                  </div>
                  <p className="text-sm text-gray-700">{test.conclusion}</p>
                </div>
              </div>
            </div>

            {/* Sample Info */}
            <div className="mt-4 flex items-center gap-6 text-xs text-gray-500">
              {test.sample_size_1 && (
                <span>
                  <i className="ri-group-line mr-1"></i>
                  n₁ = {test.sample_size_1}
                </span>
              )}
              {test.sample_size_2 && (
                <span>
                  <i className="ri-group-line mr-1"></i>
                  n₂ = {test.sample_size_2}
                </span>
              )}
              <span>
                <i className="ri-calendar-line mr-1"></i>
                {new Date(test.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        ))}
      </div>

      {tests.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200 mt-6">
          <i className="ri-flask-line text-6xl text-gray-400 mb-4"></i>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No Tests Yet</h3>
          <p className="text-gray-600 mb-4">Perform your first hypothesis test</p>
          <button
            onClick={() => setShowModal(true)}
            className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
          >
            Create Test
          </button>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">New Hypothesis Test</h2>
              <form onSubmit={handleCalculate} className="space-y-4">
                {/* Basic Info */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Test Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Test Type *</label>
                    <select
                      value={formData.test_type}
                      onChange={(e) => setFormData({ ...formData, test_type: e.target.value as any })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      <option value="t_test">Two-Sample T-Test</option>
                      <option value="paired_t_test">Paired T-Test</option>
                      <option value="z_test">Z-Test (Proportions)</option>
                      <option value="chi_square">Chi-Square Test</option>
                      <option value="anova">One-Way ANOVA</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Significance Level (α)</label>
                    <select
                      value={formData.significance_level}
                      onChange={(e) => setFormData({ ...formData, significance_level: parseFloat(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      <option value="0.01">0.01 (99% confidence)</option>
                      <option value="0.05">0.05 (95% confidence)</option>
                      <option value="0.10">0.10 (90% confidence)</option>
                    </select>
                  </div>
                </div>

                {/* Hypotheses */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Null Hypothesis (H₀) *</label>
                  <input
                    type="text"
                    required
                    value={formData.null_hypothesis}
                    onChange={(e) => setFormData({ ...formData, null_hypothesis: e.target.value })}
                    placeholder="e.g., μ₁ = μ₂"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Alternative Hypothesis (H₁) *</label>
                  <input
                    type="text"
                    required
                    value={formData.alternative_hypothesis}
                    onChange={(e) => setFormData({ ...formData, alternative_hypothesis: e.target.value })}
                    placeholder="e.g., μ₁ ≠ μ₂"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>

                {/* Data Input based on test type */}
                {formData.test_type === 't_test' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Data Input Method</label>
                      <div className="flex gap-4">
                        <label className="flex items-center">
                          <input
                            type="radio"
                            value="summary"
                            checked={formData.data_input_method === 'summary'}
                            onChange={(e) => setFormData({ ...formData, data_input_method: e.target.value as any })}
                            className="mr-2"
                          />
                          Summary Statistics
                        </label>
                        <label className="flex items-center">
                          <input
                            type="radio"
                            value="raw"
                            checked={formData.data_input_method === 'raw'}
                            onChange={(e) => setFormData({ ...formData, data_input_method: e.target.value as any })}
                            className="mr-2"
                          />
                          Raw Data
                        </label>
                      </div>
                    </div>

                    {formData.data_input_method === 'summary' ? (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-3">
                          <h4 className="font-medium text-gray-900">Sample 1</h4>
                          <input
                            type="number"
                            placeholder="Sample Size"
                            value={formData.sample_size_1}
                            onChange={(e) => setFormData({ ...formData, sample_size_1: parseInt(e.target.value) })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                          <input
                            type="number"
                            step="0.01"
                            placeholder="Mean"
                            value={formData.mean_1}
                            onChange={(e) => setFormData({ ...formData, mean_1: parseFloat(e.target.value) })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                          <input
                            type="number"
                            step="0.01"
                            placeholder="Std Dev"
                            value={formData.std_dev_1}
                            onChange={(e) => setFormData({ ...formData, std_dev_1: parseFloat(e.target.value) })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                        </div>
                        <div className="space-y-3">
                          <h4 className="font-medium text-gray-900">Sample 2</h4>
                          <input
                            type="number"
                            placeholder="Sample Size"
                            value={formData.sample_size_2}
                            onChange={(e) => setFormData({ ...formData, sample_size_2: parseInt(e.target.value) })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                          <input
                            type="number"
                            step="0.01"
                            placeholder="Mean"
                            value={formData.mean_2}
                            onChange={(e) => setFormData({ ...formData, mean_2: parseFloat(e.target.value) })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                          <input
                            type="number"
                            step="0.01"
                            placeholder="Std Dev"
                            value={formData.std_dev_2}
                            onChange={(e) => setFormData({ ...formData, std_dev_2: parseFloat(e.target.value) })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="block text-sm font-medium text-gray-700">Sample 1 Data</label>
                            {metricsWithSufficientData.length > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const metricId = prompt(`Select metric:\n${metricsWithSufficientData.map((m, i) => `${i + 1}. ${m.name} (${m.dataCount} points)`).join('\n')}\n\nEnter number:`);
                                  if (metricId) {
                                    const index = parseInt(metricId) - 1;
                                    if (index >= 0 && index < metricsWithSufficientData.length) {
                                      loadMetricDataIntoForm(metricsWithSufficientData[index].id, 'raw_data_1');
                                    }
                                  }
                                }}
                                className="text-xs text-teal-600 hover:text-teal-700 flex items-center gap-1"
                                disabled={loadingMetricData}
                              >
                                <i className="ri-download-line"></i>
                                {loadingMetricData ? 'Loading...' : 'Load from Metric'}
                              </button>
                            )}
                          </div>
                          <textarea
                            value={formData.raw_data_1}
                            onChange={(e) => setFormData({ ...formData, raw_data_1: e.target.value })}
                            placeholder="Enter values separated by spaces or commas"
                            rows={4}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="block text-sm font-medium text-gray-700">Sample 2 Data</label>
                            {metricsWithSufficientData.length > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const metricId = prompt(`Select metric:\n${metricsWithSufficientData.map((m, i) => `${i + 1}. ${m.name} (${m.dataCount} points)`).join('\n')}\n\nEnter number:`);
                                  if (metricId) {
                                    const index = parseInt(metricId) - 1;
                                    if (index >= 0 && index < metricsWithSufficientData.length) {
                                      loadMetricDataIntoForm(metricsWithSufficientData[index].id, 'raw_data_2');
                                    }
                                  }
                                }}
                                className="text-xs text-teal-600 hover:text-teal-700 flex items-center gap-1"
                                disabled={loadingMetricData}
                              >
                                <i className="ri-download-line"></i>
                                {loadingMetricData ? 'Loading...' : 'Load from Metric'}
                              </button>
                            )}
                          </div>
                          <textarea
                            value={formData.raw_data_2}
                            onChange={(e) => setFormData({ ...formData, raw_data_2: e.target.value })}
                            placeholder="Enter values separated by spaces or commas"
                            rows={4}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}

                {formData.test_type === 'paired_t_test' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-sm font-medium text-gray-700">Before Data</label>
                        {metricsWithSufficientData.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              const metricId = prompt(`Select metric:\n${metricsWithSufficientData.map((m, i) => `${i + 1}. ${m.name} (${m.dataCount} points)`).join('\n')}\n\nEnter number:`);
                              if (metricId) {
                                const index = parseInt(metricId) - 1;
                                if (index >= 0 && index < metricsWithSufficientData.length) {
                                  loadMetricDataIntoForm(metricsWithSufficientData[index].id, 'raw_data_1');
                                }
                              }
                            }}
                            className="text-xs text-teal-600 hover:text-teal-700 flex items-center gap-1"
                            disabled={loadingMetricData}
                          >
                            <i className="ri-download-line"></i>
                            {loadingMetricData ? 'Loading...' : 'Load from Metric'}
                          </button>
                        )}
                      </div>
                      <textarea
                        value={formData.raw_data_1}
                        onChange={(e) => setFormData({ ...formData, raw_data_1: e.target.value })}
                        placeholder="Enter values separated by spaces or commas"
                        rows={4}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-sm font-medium text-gray-700">After Data</label>
                        {metricsWithSufficientData.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              const metricId = prompt(`Select metric:\n${metricsWithSufficientData.map((m, i) => `${i + 1}. ${m.name} (${m.dataCount} points)`).join('\n')}\n\nEnter number:`);
                              if (metricId) {
                                const index = parseInt(metricId) - 1;
                                if (index >= 0 && index < metricsWithSufficientData.length) {
                                  loadMetricDataIntoForm(metricsWithSufficientData[index].id, 'raw_data_2');
                                }
                              }
                            }}
                            className="text-xs text-teal-600 hover:text-teal-700 flex items-center gap-1"
                            disabled={loadingMetricData}
                          >
                            <i className="ri-download-line"></i>
                            {loadingMetricData ? 'Loading...' : 'Load from Metric'}
                          </button>
                        )}
                      </div>
                      <textarea
                        value={formData.raw_data_2}
                        onChange={(e) => setFormData({ ...formData, raw_data_2: e.target.value })}
                        placeholder="Enter values separated by spaces or commas"
                        rows={4}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                  </div>
                )}

                {formData.test_type === 'z_test' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <h4 className="font-medium text-gray-900">Group 1</h4>
                      <input
                        type="number"
                        placeholder="Sample Size"
                        value={formData.sample_size_1}
                        onChange={(e) => setFormData({ ...formData, sample_size_1: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                      <input
                        type="number"
                        placeholder="Number of Successes"
                        value={formData.successes_1}
                        onChange={(e) => setFormData({ ...formData, successes_1: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                    <div className="space-y-3">
                      <h4 className="font-medium text-gray-900">Group 2</h4>
                      <input
                        type="number"
                        placeholder="Sample Size"
                        value={formData.sample_size_2}
                        onChange={(e) => setFormData({ ...formData, sample_size_2: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                      <input
                        type="number"
                        placeholder="Number of Successes"
                        value={formData.successes_2}
                        onChange={(e) => setFormData({ ...formData, successes_2: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                  </div>
                )}

                {formData.test_type === 'chi_square' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Observed Frequencies (rows separated by newlines, values by spaces)
                    </label>
                    <textarea
                      value={formData.chi_square_data}
                      onChange={(e) => setFormData({ ...formData, chi_square_data: e.target.value })}
                      placeholder="10 15 20&#10;12 18 22"
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                    />
                  </div>
                )}

                {formData.test_type === 'anova' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Group Data (one group per line, values separated by spaces)
                    </label>
                    <textarea
                      value={formData.anova_groups}
                      onChange={(e) => setFormData({ ...formData, anova_groups: e.target.value })}
                      placeholder="10 12 14 16 18&#10;20 22 24 26 28&#10;30 32 34 36 38"
                      rows={5}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                    />
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <button
                    type="submit"
                    disabled={calculating}
                    className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap disabled:opacity-50"
                  >
                    {calculating ? 'Calculating...' : 'Calculate Test'}
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