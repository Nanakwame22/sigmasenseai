// Statistical Testing Service for Hypothesis Testing

export interface TTestResult {
  testStatistic: number;
  pValue: number;
  degreesOfFreedom: number;
  confidenceIntervalLower: number;
  confidenceIntervalUpper: number;
  result: 'reject_null' | 'fail_to_reject';
  effectSize: number;
}

export interface ChiSquareResult {
  testStatistic: number;
  pValue: number;
  degreesOfFreedom: number;
  result: 'reject_null' | 'fail_to_reject';
}

export interface ANOVAResult {
  fStatistic: number;
  pValue: number;
  dfBetween: number;
  dfWithin: number;
  result: 'reject_null' | 'fail_to_reject';
}

// Helper: Calculate mean
function mean(values: number[]): number {
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

// Helper: Calculate standard deviation
function standardDeviation(values: number[]): number {
  const avg = mean(values);
  const squareDiffs = values.map(value => Math.pow(value - avg, 2));
  const avgSquareDiff = mean(squareDiffs);
  return Math.sqrt(avgSquareDiff);
}

// Helper: Calculate variance
function variance(values: number[]): number {
  const avg = mean(values);
  const squareDiffs = values.map(value => Math.pow(value - avg, 2));
  return mean(squareDiffs);
}

// Helper: Student's t-distribution CDF approximation
function tDistributionCDF(t: number, df: number): number {
  // Using approximation for t-distribution
  const x = df / (df + t * t);
  const a = df / 2;
  const b = 0.5;
  
  // Incomplete beta function approximation
  let beta = 0;
  for (let i = 0; i <= 100; i++) {
    const term = Math.pow(x, a + i) * Math.pow(1 - x, b) / (a + i);
    beta += term;
    if (Math.abs(term) < 1e-10) break;
  }
  
  return 1 - beta / 2;
}

// Helper: Chi-square distribution CDF approximation
function chiSquareCDF(x: number, df: number): number {
  if (x <= 0) return 0;
  
  // Using gamma function approximation
  const k = df / 2;
  let sum = 0;
  let term = 1;
  
  for (let i = 0; i < 100; i++) {
    sum += term;
    term *= x / (k + i);
    if (term < 1e-10) break;
  }
  
  return 1 - Math.exp(-x / 2) * Math.pow(x / 2, k - 1) * sum;
}

// Helper: F-distribution CDF approximation
function fDistributionCDF(f: number, df1: number, df2: number): number {
  if (f <= 0) return 0;
  
  const x = df2 / (df2 + df1 * f);
  // Simplified approximation
  return 1 - Math.pow(x, df2 / 2);
}

// Two-sample t-test
export function twoSampleTTest(
  sample1: number[],
  sample2: number[],
  alpha: number = 0.05
): TTestResult {
  const n1 = sample1.length;
  const n2 = sample2.length;
  const mean1 = mean(sample1);
  const mean2 = mean(sample2);
  const var1 = variance(sample1);
  const var2 = variance(sample2);
  
  // Pooled standard deviation
  const pooledVar = ((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2);
  const standardError = Math.sqrt(pooledVar * (1 / n1 + 1 / n2));
  
  // Test statistic
  const testStatistic = (mean1 - mean2) / standardError;
  const df = n1 + n2 - 2;
  
  // P-value (two-tailed)
  const pValue = 2 * (1 - tDistributionCDF(Math.abs(testStatistic), df));
  
  // Confidence interval
  const tCritical = 1.96; // Approximation for 95% CI
  const marginOfError = tCritical * standardError;
  const confidenceIntervalLower = (mean1 - mean2) - marginOfError;
  const confidenceIntervalUpper = (mean1 - mean2) + marginOfError;
  
  // Effect size (Cohen's d)
  const pooledSD = Math.sqrt(pooledVar);
  const effectSize = (mean1 - mean2) / pooledSD;
  
  return {
    testStatistic,
    pValue,
    degreesOfFreedom: df,
    confidenceIntervalLower,
    confidenceIntervalUpper,
    result: pValue < alpha ? 'reject_null' : 'fail_to_reject',
    effectSize,
  };
}

// One-sample t-test
export function oneSampleTTest(
  sample: number[],
  populationMean: number,
  alpha: number = 0.05
): TTestResult {
  const n = sample.length;
  const sampleMean = mean(sample);
  const sampleSD = standardDeviation(sample);
  const standardError = sampleSD / Math.sqrt(n);
  
  const testStatistic = (sampleMean - populationMean) / standardError;
  const df = n - 1;
  
  const pValue = 2 * (1 - tDistributionCDF(Math.abs(testStatistic), df));
  
  const tCritical = 1.96;
  const marginOfError = tCritical * standardError;
  const confidenceIntervalLower = sampleMean - marginOfError;
  const confidenceIntervalUpper = sampleMean + marginOfError;
  
  const effectSize = (sampleMean - populationMean) / sampleSD;
  
  return {
    testStatistic,
    pValue,
    degreesOfFreedom: df,
    confidenceIntervalLower,
    confidenceIntervalUpper,
    result: pValue < alpha ? 'reject_null' : 'fail_to_reject',
    effectSize,
  };
}

// Paired t-test
export function pairedTTest(
  before: number[],
  after: number[],
  alpha: number = 0.05
): TTestResult {
  if (before.length !== after.length) {
    throw new Error('Samples must have equal length for paired t-test');
  }
  
  const differences = before.map((val, i) => val - after[i]);
  return oneSampleTTest(differences, 0, alpha);
}

// Chi-square test for independence
export function chiSquareTest(
  observed: number[][],
  alpha: number = 0.05
): ChiSquareResult {
  const rows = observed.length;
  const cols = observed[0].length;
  
  // Calculate row and column totals
  const rowTotals = observed.map(row => row.reduce((sum, val) => sum + val, 0));
  const colTotals = observed[0].map((_, colIndex) =>
    observed.reduce((sum, row) => sum + row[colIndex], 0)
  );
  const grandTotal = rowTotals.reduce((sum, val) => sum + val, 0);
  
  // Calculate expected frequencies
  const expected = observed.map((row, i) =>
    row.map((_, j) => (rowTotals[i] * colTotals[j]) / grandTotal)
  );
  
  // Calculate chi-square statistic
  let chiSquare = 0;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const diff = observed[i][j] - expected[i][j];
      chiSquare += (diff * diff) / expected[i][j];
    }
  }
  
  const df = (rows - 1) * (cols - 1);
  const pValue = 1 - chiSquareCDF(chiSquare, df);
  
  return {
    testStatistic: chiSquare,
    pValue,
    degreesOfFreedom: df,
    result: pValue < alpha ? 'reject_null' : 'fail_to_reject',
  };
}

// One-way ANOVA
export function oneWayANOVA(
  groups: number[][],
  alpha: number = 0.05
): ANOVAResult {
  const k = groups.length; // number of groups
  const n = groups.reduce((sum, group) => sum + group.length, 0); // total sample size
  
  // Calculate grand mean
  const allValues = groups.flat();
  const grandMean = mean(allValues);
  
  // Calculate group means
  const groupMeans = groups.map(group => mean(group));
  
  // Calculate sum of squares between groups (SSB)
  let ssb = 0;
  groups.forEach((group, i) => {
    ssb += group.length * Math.pow(groupMeans[i] - grandMean, 2);
  });
  
  // Calculate sum of squares within groups (SSW)
  let ssw = 0;
  groups.forEach((group, i) => {
    group.forEach(value => {
      ssw += Math.pow(value - groupMeans[i], 2);
    });
  });
  
  // Calculate degrees of freedom
  const dfBetween = k - 1;
  const dfWithin = n - k;
  
  // Calculate mean squares
  const msb = ssb / dfBetween;
  const msw = ssw / dfWithin;
  
  // Calculate F-statistic
  const fStatistic = msb / msw;
  
  // Calculate p-value
  const pValue = 1 - fDistributionCDF(fStatistic, dfBetween, dfWithin);
  
  return {
    fStatistic,
    pValue,
    dfBetween,
    dfWithin,
    result: pValue < alpha ? 'reject_null' : 'fail_to_reject',
  };
}

// Z-test for proportions
export function zTestProportions(
  successes1: number,
  n1: number,
  successes2: number,
  n2: number,
  alpha: number = 0.05
): {
  testStatistic: number;
  pValue: number;
  result: 'reject_null' | 'fail_to_reject';
} {
  const p1 = successes1 / n1;
  const p2 = successes2 / n2;
  const pooledP = (successes1 + successes2) / (n1 + n2);
  
  const standardError = Math.sqrt(pooledP * (1 - pooledP) * (1 / n1 + 1 / n2));
  const testStatistic = (p1 - p2) / standardError;
  
  // P-value using standard normal distribution
  const pValue = 2 * (1 - normalCDF(Math.abs(testStatistic)));
  
  return {
    testStatistic,
    pValue,
    result: pValue < alpha ? 'reject_null' : 'fail_to_reject',
  };
}

// Helper: Standard normal CDF
function normalCDF(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - prob : prob;
}

// Calculate required sample size for t-test
export function calculateSampleSize(
  effectSize: number,
  alpha: number = 0.05,
  power: number = 0.8
): number {
  // Simplified calculation using Cohen's formula
  const zAlpha = 1.96; // for alpha = 0.05 (two-tailed)
  const zBeta = 0.84; // for power = 0.8
  
  const n = Math.pow((zAlpha + zBeta) / effectSize, 2) * 2;
  return Math.ceil(n);
}
