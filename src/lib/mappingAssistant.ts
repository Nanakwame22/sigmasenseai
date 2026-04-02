export type DestinationType = 'metric_name' | 'value' | 'timestamp' | 'unit';

export interface AssistedFieldMapping {
  sourceField: string;
  destinationType: DestinationType;
  targetMetricId?: string;
}

export interface FieldInsight {
  field: string;
  sampleCount: number;
  numericRatio: number;
  mostlyNumeric: boolean;
  inferredType: 'number' | 'date' | 'text' | 'mixed' | 'empty';
}

export interface MappingSuggestion {
  mappings: AssistedFieldMapping[];
  confidence: 'high' | 'medium' | 'low';
  rationale: string[];
  recommendedValueField: string | null;
}

export function inferFieldInsights(previewData: Record<string, unknown>[], fields: string[]): FieldInsight[] {
  return fields.map((field) => {
    const values = previewData
      .map((row) => row?.[field])
      .filter((value) => value !== null && value !== undefined && String(value).trim() !== '');

    if (values.length === 0) {
      return {
        field,
        sampleCount: 0,
        numericRatio: 0,
        mostlyNumeric: false,
        inferredType: 'empty',
      };
    }

    const numericValues = values.filter((value) => {
      if (typeof value === 'number') return !Number.isNaN(value);
      const normalized = String(value).replace(/,/g, '').trim();
      return normalized !== '' && !Number.isNaN(Number(normalized));
    });

    const dateValues = values.filter((value) => {
      const date = new Date(String(value));
      return !Number.isNaN(date.getTime());
    });

    const numericRatio = numericValues.length / values.length;
    const dateRatio = dateValues.length / values.length;

    let inferredType: FieldInsight['inferredType'] = 'mixed';
    if (numericRatio >= 0.8) inferredType = 'number';
    else if (dateRatio >= 0.8) inferredType = 'date';
    else if (numericRatio <= 0.2 && dateRatio <= 0.2) inferredType = 'text';

    return {
      field,
      sampleCount: values.length,
      numericRatio,
      mostlyNumeric: numericRatio >= 0.6,
      inferredType,
    };
  });
}

export function getValueCandidateFields(fields: string[], insights: FieldInsight[]): string[] {
  return [...fields].sort((a, b) => {
    const insightA = insights.find((item) => item.field === a);
    const insightB = insights.find((item) => item.field === b);
    const scoreA = insightA?.numericRatio ?? 0;
    const scoreB = insightB?.numericRatio ?? 0;

    if (scoreA !== scoreB) return scoreB - scoreA;

    const nameBoostA = /(value|amount|score|count|rate|total|number|qty|volume|cost|duration|time)/i.test(a) ? 1 : 0;
    const nameBoostB = /(value|amount|score|count|rate|total|number|qty|volume|cost|duration|time)/i.test(b) ? 1 : 0;

    if (nameBoostA !== nameBoostB) return nameBoostB - nameBoostA;
    return a.localeCompare(b);
  });
}

export function buildMappingSuggestion(
  fields: string[],
  insights: FieldInsight[],
  previewData: Record<string, unknown>[],
): MappingSuggestion {
  const valueCandidates = getValueCandidateFields(fields, insights);
  const valueField = valueCandidates[0] || null;
  const metricNameField = fields.find((field) => /metric_name|metric|measure|kpi|name|label/i.test(field)) || null;
  const timestampField = fields.find((field) => /timestamp|date|time|recorded_at|created_at/i.test(field)) || null;
  const unitField = fields.find((field) => /unit|uom|measure_unit/i.test(field)) || null;

  const mappings: AssistedFieldMapping[] = [];
  const rationale: string[] = [];

  if (metricNameField) {
    mappings.push({ sourceField: metricNameField, destinationType: 'metric_name' });
    rationale.push(`Mapped \`${metricNameField}\` to metric name because it looks like a label field.`);
  }

  if (valueField) {
    const insight = insights.find((item) => item.field === valueField);
    mappings.push({ sourceField: valueField, destinationType: 'value' });
    rationale.push(
      insight
        ? `Mapped \`${valueField}\` to value because ${Math.round(insight.numericRatio * 100)}% of sampled rows are numeric.`
        : `Mapped \`${valueField}\` to value because it looks like the strongest numeric signal.`
    );
  }

  if (timestampField) {
    mappings.push({ sourceField: timestampField, destinationType: 'timestamp' });
    rationale.push(`Mapped \`${timestampField}\` to timestamp because it looks date/time shaped.`);
  }

  if (unitField) {
    mappings.push({ sourceField: unitField, destinationType: 'unit' });
    rationale.push(`Mapped \`${unitField}\` to unit because the field name suggests measurement units.`);
  }

  const coverageScore = [metricNameField, valueField, timestampField, unitField].filter(Boolean).length;
  const previewRows = previewData.length;

  let confidence: MappingSuggestion['confidence'] = 'low';
  if (valueField && coverageScore >= 3 && previewRows >= 3) confidence = 'high';
  else if (valueField && coverageScore >= 2) confidence = 'medium';

  if (!valueField) {
    rationale.push('No confident numeric value field was found. Review numeric columns manually before saving.');
  }

  return {
    mappings: mappings.length > 0 ? mappings : [{ sourceField: '', destinationType: 'value' }],
    confidence,
    rationale,
    recommendedValueField: valueField,
  };
}
