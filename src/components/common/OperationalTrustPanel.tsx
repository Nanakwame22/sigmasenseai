interface TrustChip {
  label: string;
  value: string;
  tone?: 'teal' | 'emerald' | 'amber' | 'slate' | 'rose';
}

interface OperationalTrustPanelProps {
  title: string;
  subtitle: string;
  chips: TrustChip[];
  note: string;
  className?: string;
}

const toneClasses: Record<NonNullable<TrustChip['tone']>, string> = {
  teal: 'bg-teal-50 text-teal-700 border-teal-200',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  slate: 'bg-slate-100 text-slate-700 border-slate-200',
  rose: 'bg-rose-50 text-rose-700 border-rose-200',
};

export default function OperationalTrustPanel({
  title,
  subtitle,
  chips,
  note,
  className = '',
}: OperationalTrustPanelProps) {
  return (
    <div className={`rounded-2xl border border-slate-200/80 bg-white/90 px-5 py-4 shadow-[0_12px_32px_rgba(15,23,42,0.05)] ${className}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Operational Trust</div>
          <h3 className="mt-1 text-sm font-bold text-slate-900">{title}</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <div
              key={`${chip.label}-${chip.value}`}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${toneClasses[chip.tone || 'slate']}`}
            >
              <span className="opacity-70">{chip.label}:</span> {chip.value}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
        {note}
      </div>
    </div>
  );
}
