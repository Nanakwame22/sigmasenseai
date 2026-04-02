interface InsightSummaryProps {
  title?: string;
  summary: string;
  driver?: string;
  guidance?: string;
  className?: string;
}

export default function InsightSummary({
  title = 'Plain-English Summary',
  summary,
  driver,
  guidance,
  className = '',
}: InsightSummaryProps) {
  return (
    <div className={`bg-gradient-to-br from-teal-50 to-cyan-50 border border-teal-200 rounded-lg p-5 ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <i className="ri-chat-quote-line text-teal-600"></i>
        <h3 className="font-semibold text-slate-900">{title}</h3>
      </div>
      <div className="space-y-3 text-sm text-slate-700 leading-relaxed">
        <p>{summary}</p>
        {driver && <p>{driver}</p>}
        {guidance && <p>{guidance}</p>}
      </div>
    </div>
  );
}
