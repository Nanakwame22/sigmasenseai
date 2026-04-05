import React from 'react';

export const AIM_SURFACE = 'rounded-[32px] border border-brand-200/80 bg-[linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(247,250,252,0.98))] shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-sm';
export const AIM_SUBSURFACE = 'rounded-[24px] border border-brand-200/80 bg-[linear-gradient(180deg,_rgba(255,255,255,0.96),_rgba(248,250,252,0.92))] shadow-[0_10px_30px_rgba(15,23,42,0.05)]';

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
      <div className="bg-[radial-gradient(circle_at_top_left,_rgba(20,184,166,0.14),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(99,102,241,0.08),_transparent_22%),linear-gradient(135deg,_#ffffff,_#f8fafc)] px-6 py-7 md:px-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            {eyebrow && (
              <div className="mb-3">
                <span className="rounded-full bg-ai-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-ai-700">
                  {eyebrow}
                </span>
              </div>
            )}
            <h1 className="text-[2rem] font-bold tracking-tight text-brand-900 md:text-[2.2rem]">{title}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-brand-600 md:text-[15px]">{description}</p>
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
        <div key={item.label} className={`${AIM_SUBSURFACE} p-5 md:p-6`}>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-500">{item.label}</div>
          <div className={`mt-3 text-[2rem] font-bold tracking-tight ${item.accent || 'text-brand-900'}`}>{item.value}</div>
          {item.detail ? <div className="mt-2 text-sm text-brand-600">{item.detail}</div> : null}
        </div>
      ))}
    </div>
  );
}

export function AIMPanel({
  title,
  description,
  icon,
  accentClass = 'from-ai-500 to-ai-600',
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
    <div className={`${AIM_SURFACE} overflow-hidden`}>
      <div className="border-b border-brand-200/80 bg-[linear-gradient(180deg,_rgba(255,255,255,0.92),_rgba(248,250,252,0.9))] px-6 py-5 md:px-7">
        <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {icon ? (
            <div className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${accentClass}`}>
              <i className={`${icon} text-xl text-white`}></i>
            </div>
          ) : null}
          <div>
            <h2 className="text-xl font-bold tracking-tight text-brand-900">{title}</h2>
            {description ? <p className="mt-1 text-sm text-brand-600">{description}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      </div>
      <div className="px-6 py-6 md:px-7 md:py-7">
      {children}
      </div>
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
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-100">
        <i className={`${icon} text-3xl text-brand-400`}></i>
      </div>
      <h3 className="text-lg font-bold text-brand-900">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-brand-600">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
