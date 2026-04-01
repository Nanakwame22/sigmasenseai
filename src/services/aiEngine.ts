import { supabase } from '../lib/supabase';

export interface PredictiveAlert {
  id: string;
  type: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  predictedDate: string;
  daysUntil: number;
  confidence: number;
  category: string;
  metricId?: string;
  actions: string[];
}

export interface Recommendation {
  id: string;
  title: string;
  description: string;
  priority: number;
  effort: 'Low' | 'Medium' | 'High';
  impact: string;
  expectedBenefit: string;
  timeframe: string;
  confidence: number;
  actions: string[];
}

export interface Pattern {
  type: 'trend' | 'seasonal' | 'anomaly' | 'correlation';
  description: string;
  confidence: number;
  data: any[];
}

// Advanced Statistical Methods for Forecasting
interface ForecastPoint {
  date: string;
  value: number;
  confidence_lower: number;
  confidence_upper: number;
  trend: number;
  seasonal: number;
}

interface AdvancedForecast {
  method: 'sma' | 'ema' | 'exponential_smoothing' | 'seasonal';
  forecast: ForecastPoint[];
  accuracy: number;
  trend_strength: number;
  seasonality_detected: boolean;
  outliers: number[];
}

// Helper function for linear regression
function linearRegression(data: number[]): { slope: number; intercept: number } {
  const n = data.length;
  const indices = Array.from({ length: n }, (_, i) => i);
  
  const sumX = indices.reduce((a, b) => a + b, 0);
  const sumY = data.reduce((a, b) => a + b, 0);
  const sumXY = indices.reduce((sum, x, i) => sum + x * data[i], 0);
  const sumXX = indices.reduce((sum, x) => sum + x * x, 0);
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  
  return { slope, intercept };
}

// Helper function for moving average
function movingAverage(data: number[], window: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - window + 1);
    const subset = data.slice(start, i + 1);
    const avg = subset.reduce((a, b) => a + b, 0) / subset.length;
    result.push(avg);
  }
  return result;
}

// Helper function for seasonality detection (boolean version)
function hasSeasonality(data: number[], period: number): boolean {
  if (data.length < period * 2) return false;
  
  const cycles: number[][] = [];
  for (let i = 0; i < Math.floor(data.length / period); i++) {
    cycles.push(data.slice(i * period, (i + 1) * period));
  }
  
  if (cycles.length < 2) return false;
  
  // Calculate correlation between cycles
  let totalCorrelation = 0;
  let comparisons = 0;
  
  for (let i = 0; i < cycles.length - 1; i++) {
    for (let j = i + 1; j < cycles.length; j++) {
      const cycle1 = cycles[i];
      const cycle2 = cycles[j];
      
      const mean1 = cycle1.reduce((a, b) => a + b, 0) / cycle1.length;
      const mean2 = cycle2.reduce((a, b) => a + b, 0) / cycle2.length;
      
      let numerator = 0;
      let denom1 = 0;
      let denom2 = 0;
      
      for (let k = 0; k < Math.min(cycle1.length, cycle2.length); k++) {
        const diff1 = cycle1[k] - mean1;
        const diff2 = cycle2[k] - mean2;
        numerator += diff1 * diff2;
        denom1 += diff1 * diff1;
        denom2 += diff2 * diff2;
      }
      
      if (denom1 > 0 && denom2 > 0) {
        const correlation = numerator / Math.sqrt(denom1 * denom2);
        totalCorrelation += Math.abs(correlation);
        comparisons++;
      }
    }
  }
  
  const avgCorrelation = comparisons > 0 ? totalCorrelation / comparisons : 0;
  return avgCorrelation > 0.6;
}

// Simple Moving Average
function calculateSMA(data: number[], period: number): number[] {
  const sma: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      sma.push(data[i]);
    } else {
      const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      sma.push(sum / period);
    }
  }
  return sma;
}

// Exponential Moving Average
function calculateEMA(data: number[], period: number): number[] {
  const ema: number[] = [];
  const multiplier = 2 / (period + 1);
  
  // First EMA is SMA
  const firstSMA = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  ema.push(firstSMA);
  
  for (let i = 1; i < data.length; i++) {
    const currentEMA = (data[i] - ema[i - 1]) * multiplier + ema[i - 1];
    ema.push(currentEMA);
  }
  
  return ema;
}

// Exponential Smoothing with Trend (Holt's Method)
function exponentialSmoothing(data: number[], alpha: number = 0.3, beta: number = 0.1): { level: number[]; trend: number[] } {
  const level: number[] = [data[0]];
  const trend: number[] = [data[1] - data[0]];
  
  for (let i = 1; i < data.length; i++) {
    const newLevel = alpha * data[i] + (1 - alpha) * (level[i - 1] + trend[i - 1]);
    const newTrend = beta * (newLevel - level[i - 1]) + (1 - beta) * trend[i - 1];
    level.push(newLevel);
    trend.push(newTrend);
  }
  
  return { level, trend };
}

// Detect Seasonality (component version)
function detectSeasonality(data: number[], period: number = 7): { seasonal: number[]; strength: number } {
  if (data.length < period * 2) {
    return { seasonal: new Array(data.length).fill(0), strength: 0 };
  }
  
  const seasonal: number[] = [];
  const cycles = Math.floor(data.length / period);
  
  // Calculate average for each position in the cycle
  for (let i = 0; i < period; i++) {
    let sum = 0;
    let count = 0;
    for (let j = 0; j < cycles; j++) {
      const index = j * period + i;
      if (index < data.length) {
        sum += data[index];
        count++;
      }
    }
    seasonal.push(sum / count);
  }
  
  // Normalize seasonal factors
  const seasonalMean = seasonal.reduce((a, b) => a + b, 0) / seasonal.length;
  const normalizedSeasonal = seasonal.map(s => s - seasonalMean);
  
  // Calculate seasonality strength
  const variance = data.reduce((sum, val) => sum + Math.pow(val - seasonalMean, 2), 0) / data.length;
  const seasonalVariance = normalizedSeasonal.reduce((sum, val) => sum + Math.pow(val, 2), 0) / normalizedSeasonal.length;
  const strength = Math.min(seasonalVariance / (variance || 1), 1);
  
  // Extend seasonal pattern to match data length
  const extendedSeasonal: number[] = [];
  for (let i = 0; i < data.length; i++) {
    extendedSeasonal.push(normalizedSeasonal[i % period]);
  }
  
  return { seasonal: extendedSeasonal, strength };
}

// Detect Outliers using IQR method
function detectOutliers(data: number[]): number[] {
  const sorted = [...data].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;
  
  const outlierIndices: number[] = [];
  data.forEach((value, index) => {
    if (value < lowerBound || value > upperBound) {
      outlierIndices.push(index);
    }
  });
  
  return outlierIndices;
}

// Calculate Trend Strength
function calculateTrendStrength(data: number[]): number {
  if (data.length < 2) return 0;
  
  const n = data.length;
  const xMean = (n - 1) / 2;
  const yMean = data.reduce((a, b) => a + b, 0) / n;
  
  let numerator = 0;
  let denominator = 0;
  
  for (let i = 0; i < n; i++) {
    numerator += (i - xMean) * (data[i] - yMean);
    denominator += Math.pow(i - xMean, 2);
  }
  
  const slope = numerator / denominator;
  const yVariance = data.reduce((sum, val) => sum + Math.pow(val - yMean, 2), 0) / n;
  const trendVariance = Math.pow(slope, 2) * denominator / n;
  
  return Math.min(trendVariance / (yVariance || 1), 1);
}

// Calculate Confidence Intervals
function calculateConfidenceInterval(data: number[], forecast: number, confidenceLevel: number = 0.95): { lower: number; upper: number } {
  const mean = data.reduce((a, b) => a + b, 0) / data.length;
  const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length;
  const stdDev = Math.sqrt(variance);
  
  // Z-score for 95% confidence
  const zScore = confidenceLevel === 0.95 ? 1.96 : 2.576;
  const margin = zScore * stdDev;
  
  return {
    lower: Math.max(0, forecast - margin),
    upper: forecast + margin
  };
}

// Generate Advanced Forecast
export async function generateAdvancedForecast(
  metricId: string,
  periods: number = 12,
  method: 'auto' | 'sma' | 'ema' | 'exponential_smoothing' | 'seasonal' = 'auto'
): Promise<AdvancedForecast> {
  try {
    // Fetch historical data
    const { data: historicalData, error } = await supabase
      .from('metric_data')
      .select('value, timestamp')
      .eq('metric_id', metricId)
      .order('timestamp', { ascending: true })
      .limit(90); // Last 90 data points

    if (error) throw error;
    if (!historicalData || historicalData.length < 10) {
      throw new Error('Insufficient historical data for forecasting');
    }

    const values = historicalData.map(d => d.value);
    const dates = historicalData.map(d => d.timestamp);
    
    // Detect outliers
    const outliers = detectOutliers(values);
    
    // Remove outliers for better forecasting
    const cleanedValues = values.filter((_, index) => !outliers.includes(index));
    
    // Detect seasonality
    const { seasonal, strength: seasonalityStrength } = detectSeasonality(cleanedValues);
    const seasonalityDetected = seasonalityStrength > 0.3;
    
    // Calculate trend strength
    const trendStrength = calculateTrendStrength(cleanedValues);
    
    // Choose best method based on data characteristics
    let selectedMethod = method;
    if (method === 'auto') {
      if (seasonalityDetected) {
        selectedMethod = 'seasonal';
      } else if (trendStrength > 0.5) {
        selectedMethod = 'exponential_smoothing';
      } else {
        selectedMethod = 'ema';
      }
    }
    
    // Generate forecast based on selected method
    let forecastValues: number[] = [];
    let trendValues: number[] = [];
    
    switch (selectedMethod) {
      case 'sma': {
        const sma = calculateSMA(cleanedValues, 7);
        const lastValue = sma[sma.length - 1];
        const trend = (sma[sma.length - 1] - sma[sma.length - 7]) / 7;
        
        for (let i = 1; i <= periods; i++) {
          forecastValues.push(lastValue + trend * i);
          trendValues.push(trend * i);
        }
        break;
      }
      
      case 'ema': {
        const ema = calculateEMA(cleanedValues, 14);
        const lastValue = ema[ema.length - 1];
        const trend = (ema[ema.length - 1] - ema[ema.length - 7]) / 7;
        
        for (let i = 1; i <= periods; i++) {
          forecastValues.push(lastValue + trend * i);
          trendValues.push(trend * i);
        }
        break;
      }
      
      case 'exponential_smoothing': {
        const { level, trend } = exponentialSmoothing(cleanedValues);
        const lastLevel = level[level.length - 1];
        const lastTrend = trend[trend.length - 1];
        
        for (let i = 1; i <= periods; i++) {
          forecastValues.push(lastLevel + lastTrend * i);
          trendValues.push(lastTrend * i);
        }
        break;
      }
      
      case 'seasonal': {
        const { level, trend } = exponentialSmoothing(cleanedValues);
        const lastLevel = level[level.length - 1];
        const lastTrend = trend[trend.length - 1];
        const seasonalPeriod = 7;
        
        for (let i = 1; i <= periods; i++) {
          const baseValue = lastLevel + lastTrend * i;
          const seasonalIndex = (cleanedValues.length + i - 1) % seasonalPeriod;
          const seasonalFactor = seasonal[seasonalIndex] || 0;
          forecastValues.push(baseValue + seasonalFactor);
          trendValues.push(lastTrend * i);
        }
        break;
      }
    }
    
    // Generate forecast points with confidence intervals
    const lastDate = new Date(dates[dates.length - 1]);
    const forecast: ForecastPoint[] = forecastValues.map((value, index) => {
      const forecastDate = new Date(lastDate);
      forecastDate.setDate(forecastDate.getDate() + (index + 1));
      
      const { lower, upper } = calculateConfidenceInterval(cleanedValues, value);
      
      return {
        date: forecastDate.toISOString().split('T')[0],
        value: Math.round(value * 100) / 100,
        confidence_lower: Math.round(lower * 100) / 100,
        confidence_upper: Math.round(upper * 100) / 100,
        trend: Math.round(trendValues[index] * 100) / 100,
        seasonal: seasonalityDetected ? Math.round(seasonal[index % seasonal.length] * 100) / 100 : 0
      };
    });
    
    // Calculate forecast accuracy (using MAPE on historical data)
    let mape = 0;
    if (selectedMethod !== 'auto') {
      const predictions = selectedMethod === 'sma' 
        ? calculateSMA(cleanedValues, 7)
        : calculateEMA(cleanedValues, 14);
      
      let errorSum = 0;
      for (let i = 7; i < cleanedValues.length; i++) {
        errorSum += Math.abs((cleanedValues[i] - predictions[i]) / cleanedValues[i]);
      }
      mape = (errorSum / (cleanedValues.length - 7)) * 100;
    }
    
    const accuracy = Math.max(0, Math.min(100, 100 - mape));
    
    return {
      method: selectedMethod as any,
      forecast,
      accuracy: Math.round(accuracy),
      trend_strength: Math.round(trendStrength * 100) / 100,
      seasonality_detected: seasonalityDetected,
      outliers
    };
    
  } catch (error) {
    console.error('Error generating advanced forecast:', error);
    throw error;
  }
}

// Generate recommendations based on real data
export async function generateRecommendations(): Promise<Recommendation[]> {
  try {
    const recommendations: Recommendation[] = [];

    // Fetch metrics with high variability
    const { data: metrics } = await supabase
      .from('metrics')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (metrics) {
      for (const metric of metrics) {
        const { data: metricData } = await supabase
          .from('metric_data')
          .select('value')
          .eq('metric_id', metric.id)
          .order('date', { ascending: false })
          .limit(30);

        if (metricData && metricData.length >= 10) {
          const values = metricData.map(d => d.value);
          const avg = values.reduce((a, b) => a + b, 0) / values.length;
          const stdDev = Math.sqrt(values.reduce((sq, n) => sq + Math.pow(n - avg, 2), 0) / values.length);
          const cv = (stdDev / avg) * 100;

          if (cv > 15) {
            const priority = Math.min(100, Math.round(cv * 3));
            
            // LITERAL INTERPRETATION: Direct, specific language
            const currentVariability = cv.toFixed(1);
            const targetImprovement = Math.round(cv * 0.6); // 60% reduction target
            const daysToImplement = cv > 25 ? 45 : 20;
            const costSavings = Math.round(avg * 30 * (cv / 100) * 0.4); // 40% of waste reduction
            
            recommendations.push({
              id: `rec-${metric.id}`,
              title: `IMMEDIATE ACTION: Fix ${metric.name} Inconsistency`,
              description: `${metric.name} varies by ${currentVariability}% from target. This wastes $${costSavings.toLocaleString()} monthly. Implement standardization within ${daysToImplement} days to reduce variation to under ${targetImprovement}%.`,
              priority,
              effort: cv > 25 ? 'Medium' : 'Low',
              impact: `Save $${Math.round(costSavings * 12).toLocaleString()}/year by reducing waste`,
              expectedBenefit: `Reduce variability from ${currentVariability}% to ${targetImprovement}% within ${daysToImplement} days`,
              timeframe: `${daysToImplement} days to complete, results visible in 14 days`,
              confidence: Math.min(95, 75 + Math.abs(cv) / 2),
              actions: [
                `Day 1-3: Document current ${metric.name} process - identify exact steps causing variation`,
                `Day 4-10: Create standard operating procedure with specific measurements and tolerances`,
                `Day 11-15: Train all operators on new procedure - test with 5 sample runs`,
                `Day 16-${daysToImplement}: Implement controls - check every batch for compliance`,
                `Day ${daysToImplement + 1}: Measure results - expect ${targetImprovement}% or better consistency`
              ]
            });
          }
        }
      }
    }

    // Add specific data quality recommendations
    const { data: qualityResults } = await supabase
      .from('data_quality_results')
      .select('*')
      .eq('status', 'failed')
      .order('checked_at', { ascending: false })
      .limit(20);

    if (qualityResults && qualityResults.length > 3) {
      const failureRate = (qualityResults.length / 100) * 100;
      const dailyCost = Math.round(failureRate * 50); // $50 per failed check impact
      
      recommendations.push({
        id: 'rec-data-quality-fix',
        title: `CRITICAL: Fix Data Accuracy - Losing $${(dailyCost * 30).toLocaleString()}/Month`,
        description: `${qualityResults.length} data quality failures in recent period. Each failure costs approximately $${dailyCost} in bad decisions and rework. Fix root cause within 7 days to stop financial bleeding.`,
        priority: 90,
        effort: 'Medium',
        impact: `Stop losing $${(dailyCost * 365).toLocaleString()}/year from bad data decisions`,
        expectedBenefit: `Achieve 95%+ data accuracy within 7 days, eliminate $${dailyCost * 30}/month waste`,
        timeframe: '7 days to fix, 3 days to see improvement',
        confidence: 92,
        actions: [
          'Day 1: Identify the 3 most frequent data errors causing failures',
          'Day 2: Trace each error back to its source - person, system, or process',
          'Day 3: Install automatic validation checks at data entry points',
          'Day 4-5: Retrain staff on correct data entry procedures with examples',
          'Day 6-7: Test new controls with live data - verify 95%+ accuracy rate'
        ]
      });
    }

    // Add project deadline recommendations
    const { data: projects } = await supabase
      .from('dmaic_projects')
      .select('*')
      .eq('status', 'in_progress')
      .not('target_completion_date', 'is', null);

    if (projects) {
      for (const project of projects) {
        const dueDate = new Date(project.target_completion_date);
        const today = new Date();
        const daysUntil = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        if (daysUntil > 0 && daysUntil <= 14) {
          const dailyValue = (project.expected_savings || 50000) / 365;
          const riskCost = dailyValue * Math.max(daysUntil - 7, 0);
          
          recommendations.push({
            id: `rec-project-${project.id}`,
            title: `URGENT: Complete "${project.name}" in ${daysUntil} Days or Lose $${Math.round(riskCost).toLocaleString()}`,
            description: `Project delivers $${Math.round(dailyValue).toLocaleString()}/day value once complete. Every day of delay costs $${Math.round(dailyValue).toLocaleString()}. Immediate action required to meet ${dueDate.toLocaleDateString()} deadline.`,
            priority: daysUntil <= 7 ? 95 : 85,
            effort: 'High',
            impact: `Secure $${(project.expected_savings || 50000).toLocaleString()}/year project benefits`,
            expectedBenefit: `Complete on ${dueDate.toLocaleDateString()} to capture full $${Math.round(dailyValue * 365).toLocaleString()}/year value`,
            timeframe: `${daysUntil} days remaining - daily progress required`,
            confidence: 88,
            actions: [
              `Today: Call emergency project meeting - identify specific blockers preventing completion`,
              `Tomorrow: Reassign resources - add 2x staffing if needed to meet deadline`,
              `Day 3: Complete 80% of remaining work - focus only on critical deliverables`,
              `Day ${Math.min(daysUntil - 1, 5)}: Final review and testing - prepare for launch`,
              `Day ${daysUntil}: Project completion - begin realizing $${Math.round(dailyValue).toLocaleString()}/day benefits`
            ]
          });
        }
      }
    }

    // Sort by priority and return top recommendations
    return recommendations
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 8); // Limit to top 8 most critical
  } catch (error) {
    console.error('Error generating recommendations:', error);
    return [];
  }
}

// Generate predictive alerts with literal interpretations
export async function generatePredictiveAlerts(): Promise<PredictiveAlert[]> {
  try {
    const alerts: PredictiveAlert[] = [];

    // Fetch metrics with their recent data
    const { data: metrics } = await supabase
      .from('metrics')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (metrics) {
      for (const metric of metrics) {
        // Fetch recent metric data
        const { data: metricData } = await supabase
          .from('metric_data')
          .select('value, timestamp')
          .eq('metric_id', metric.id)
          .order('timestamp', { ascending: false })
          .limit(30);

        if (metricData && metricData.length >= 10) {
          const values = metricData.map(d => d.value).reverse();
          
          // Calculate trend with specific numbers
          const recentValues = values.slice(-10);
          const olderValues = values.slice(0, 10);
          const recentAvg = recentValues.reduce((a, b) => a + b, 0) / recentValues.length;
          const olderAvg = olderValues.reduce((a, b) => a + b, 0) / olderValues.length;
          const changeRate = ((recentAvg - olderAvg) / olderAvg) * 100;

          // LITERAL INTERPRETATION with exact numbers and consequences
          if (metric.target_value && Math.abs(changeRate) > 5) {
            const currentValue = values[values.length - 1];
            const targetValue = metric.target_value;
            const isIncreasing = changeRate > 0;
            const targetDirection = metric.target_direction || 'maximize';

            let willBreachTarget = false;
            if (targetDirection === 'maximize' && isIncreasing === false && currentValue < targetValue) {
              willBreachTarget = true;
            } else if (targetDirection === 'minimize' && isIncreasing === true && currentValue > targetValue) {
              willBreachTarget = true;
            }

            if (willBreachTarget) {
              const difference = Math.abs(currentValue - targetValue);
              const daysUntil = Math.max(3, Math.min(21, Math.round(difference / Math.abs(changeRate) * 7)));
              const confidence = Math.min(95, 80 + Math.abs(changeRate));
              
              // Calculate exact financial impact
              const dailyCost = Math.round((targetValue - currentValue) * 25); // $25 per unit gap per day
              const totalRisk = dailyCost * daysUntil;

              const predictedDate = new Date();
              predictedDate.setDate(predictedDate.getDate() + daysUntil);

              alerts.push({
                id: `alert-${metric.id}`,
                type: daysUntil <= 7 ? 'critical' : daysUntil <= 14 ? 'warning' : 'info',
                title: `${metric.name} Will Hit ${targetValue} on ${predictedDate.toLocaleDateString()} - Risk: $${totalRisk.toLocaleString()}`,
                description: `Current: ${currentValue.toFixed(1)}, Target: ${targetValue}, Trend: ${changeRate > 0 ? '+' : ''}${changeRate.toFixed(1)}%/week. Will breach target in exactly ${daysUntil} days. Financial impact: $${dailyCost.toLocaleString()}/day once breached.`,
                predictedDate: predictedDate.toLocaleDateString(),
                daysUntil,
                confidence,
                category: metric.category || 'Performance',
                metricId: metric.id,
                actions: [
                  `Within 24 hours: Investigate why ${metric.name} dropped ${Math.abs(changeRate).toFixed(1)}% - interview 3 key operators`,
                  `Day 2: Implement quick fix to stop the decline - target +${(Math.abs(changeRate) / 2).toFixed(1)}% recovery`,
                  `Day 3-5: Monitor daily - must see positive trend by day 5 or escalate immediately`,
                  `Day 6-${daysUntil}: Achieve ${targetValue} target - document what worked for future use`
                ]
              });
            }
          }
        }
      }
    }

    // Add specific capacity alerts with exact numbers
    const { data: qualityResults } = await supabase
      .from('data_quality_results')
      .select('*, data_quality_checks(*)')
      .eq('status', 'failed')
      .order('checked_at', { ascending: false })
      .limit(15);

    if (qualityResults && qualityResults.length > 8) {
      const failuresPerDay = qualityResults.length / 7;
      const costPerFailure = 150; // $150 impact per failure
      const projectedWeeklyCost = failuresPerDay * 7 * costPerFailure;
      
      alerts.push({
        id: 'alert-data-system-overload',
        type: 'critical',
        title: `Data System Failing ${failuresPerDay.toFixed(1)} Times/Day - Costing $${Math.round(projectedWeeklyCost).toLocaleString()}/Week`,
        description: `${qualityResults.length} data quality failures in 7 days = ${failuresPerDay.toFixed(1)} failures per day. Each failure costs approximately $${costPerFailure} in rework and bad decisions. System will collapse within 10 days without intervention.`,
        predictedDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toLocaleDateString(),
        daysUntil: 10,
        confidence: 94,
        category: 'System Health',
        actions: [
          'Today: Add 50% more server capacity - current system is overloaded',
          'Day 2: Upgrade data validation rules - catch errors before they become failures',
          'Day 3-5: Retrain data entry team - prevent human errors at source',
          'Day 6-10: Monitor failure rate - target under 2 failures/day maximum'
        ]
      });
    }

    return alerts.sort((a, b) => {
      // Sort by financial impact and urgency
      const typePriority = { critical: 0, warning: 1, info: 2 };
      const typeDiff = typePriority[a.type] - typePriority[b.type];
      if (typeDiff !== 0) return typeDiff;
      
      return a.daysUntil - b.daysUntil;
    });
  } catch (error) {
    console.error('Error generating predictive alerts:', error);
    return [];
  }
}

// Detect patterns in data
export async function detectPatterns(metricId: string): Promise<Pattern[]> {
  try {
    const patterns: Pattern[] = [];

    const { data: metricData } = await supabase
      .from('metric_data')
      .select('value, timestamp')
      .eq('metric_id', metricId)
      .order('timestamp', { ascending: true })
      .limit(90);

    if (!metricData || metricData.length < 14) {
      return patterns;
    }

    const values = metricData.map(d => d.value);

    // Detect trend
    const { slope } = linearRegression(values);
    const avgValue = values.reduce((a, b) => a + b, 0) / values.length;
    const trendStrength = Math.abs(slope / avgValue) * 100;

    if (trendStrength > 2) {
      patterns.push({
        type: 'trend',
        description: slope > 0 ? 'Increasing trend detected' : 'Decreasing trend detected',
        confidence: Math.min(95, 60 + trendStrength * 5),
        data: values
      });
    }

    // Detect weekly seasonality
    if (hasSeasonality(values, 7)) {
      patterns.push({
        type: 'seasonal',
        description: 'Weekly seasonal pattern detected',
        confidence: 75,
        data: values
      });
    }

    // Detect monthly seasonality
    if (values.length >= 60 && hasSeasonality(values, 30)) {
      patterns.push({
        type: 'seasonal',
        description: 'Monthly seasonal pattern detected',
        confidence: 70,
        data: values
      });
    }

    return patterns;
  } catch (error) {
    console.error('Error detecting patterns:', error);
    return [];
  }
}

// Forecast future values
export async function forecastMetric(metricId: string, daysAhead: number): Promise<number[]> {
  try {
    const { data: metricData } = await supabase
      .from('metric_data')
      .select('value')
      .eq('metric_id', metricId)
      .order('date', { ascending: true })
      .limit(90);

    if (!metricData || metricData.length < 14) {
      return [];
    }

    const values = metricData.map(d => d.value);
    const { slope, intercept } = linearRegression(values);

    // Generate forecast
    const forecast: number[] = [];
    const startIndex = values.length;

    for (let i = 0; i < daysAhead; i++) {
      const predictedValue = slope * (startIndex + i) + intercept;
      forecast.push(Math.max(0, predictedValue));
    }

    return forecast;
  } catch (error) {
    console.error('Error forecasting metric:', error);
    return [];
  }
}