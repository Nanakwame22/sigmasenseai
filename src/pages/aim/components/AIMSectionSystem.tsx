import React from 'react';

export const AIM_SURFACE = 'rounded-[28px] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.06)]';
export const AIM_SUBSURFACE = 'rounded-[22px] border border-slate-200 bg-white/90 shadow-sm';

export function AIMSectionIntro({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className={`${AIM_SURFACE} overflow-hidden`}>
      <div className="bg-[radial-gradient(circle_at_top_left,_rgba(20,184,166,0.12),_transparent_34%),linear-gradient(135deg,_#ffffff,_#f8fafc)] px-6 py-6 md:px-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            {eyebrow && (
              <div className="mb-3">
                <span className="rounded-full bg-teal-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-teal-700">
                  {eyebrow}
                </span>
              </div>
            )}
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">{title}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">{description}</p>
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
        </div>
      </div>
    </div>
  );
}

export function AIMMetricTiles({
  items,
  columns = 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4',
}: {
  items: Array<{
    label: string;
    value: React.ReactNode;
    detail?: string;
    accent?: string;
  }>;
  columns?: string;
}) {
  return (
    <div className={`grid gap-4 ${columns}`}>
      {items.map((item) => (
        <div key={item.label} className={`${AIM_SUBSURFACE} p-5`}>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{item.label}</div>
          <div className={`mt-3 text-3xl font-bold ${item.accent || 'text-slate-950'}`}>{item.value}</div>
          {item.detail ? <div className="mt-2 text-sm text-slate-600">{item.detail}</div> : null}
        </div>
      ))}
    </div>
  );
}

export function AIMPanel({
  title,
  description,
  icon,
  accentClass = 'from-teal-500 to-cyan-600',
  children,
  actions,
}: {
  title: string;
  description?: string;
  icon?: string;
  accentClass?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className={`${AIM_SURFACE} p-6 md:p-7`}>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {icon ? (
            <div className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${accentClass}`}>
              <i className={`${icon} text-xl text-white`}></i>
            </div>
          ) : null}
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-950">{title}</h2>
            {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

export function AIMEmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={`${AIM_SUBSURFACE} px-6 py-14 text-center`}>
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
        <i className={`${icon} text-3xl text-slate-400`}></i>
      </div>
      <h3 className="text-lg font-bold text-slate-900">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
