export function DashboardPreview() {
  return (
    <div className="p-5 space-y-4">
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'On-Time Delivery', value: '94.2%', delta: '+2.1%', up: true, color: 'text-emerald-600' },
          { label: 'Defect Rate', value: '0.32%', delta: '-0.08%', up: true, color: 'text-emerald-600' },
          { label: 'Cycle Time (hrs)', value: '4.7', delta: '+0.3', up: false, color: 'text-red-500' },
          { label: 'Active Alerts', value: '3', delta: '-2', up: true, color: 'text-emerald-600' },
        ].map((kpi, i) => (
          <div key={i} className="bg-white rounded-xl p-3 border border-gray-100">
            <p className="text-xs text-gray-400 mb-1.5 truncate">{kpi.label}</p>
            <p className="text-xl font-bold text-gray-900">{kpi.value}</p>
            <p className={`text-xs font-semibold mt-1 ${kpi.color}`}>
              {kpi.up ? '▲' : '▼'} {kpi.delta} vs last wk
            </p>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl p-4 border border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold text-gray-700">Defect Rate — 90 Day Trend</p>
          <span className="text-xs text-teal-600 font-semibold bg-teal-50 px-2 py-0.5 rounded-full">Live</span>
        </div>
        <div className="flex items-end gap-1 h-16">
          {[55,48,62,44,58,41,52,38,44,60,35,40,37,33,45,42,38,34,31,35,30,28,32,29,25,30,27,24,28,32].map((h, i) => (
            <div
              key={i}
              className={`flex-1 rounded-sm transition-all duration-300 ${i >= 25 ? 'bg-teal-500' : 'bg-gray-200'}`}
              style={{ height: `${h}%` }}
            ></div>
          ))}
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-xs text-gray-400">90 days ago</span>
          <span className="text-xs text-gray-400">Today</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[
          { name: 'Line A — Stamping', status: 'Normal', color: 'bg-emerald-100 text-emerald-700' },
          { name: 'Line B — Assembly', status: 'Warning', color: 'bg-yellow-100 text-yellow-700' },
          { name: 'Line C — Welding', status: 'Normal', color: 'bg-emerald-100 text-emerald-700' },
          { name: 'Line D — Painting', status: 'Critical', color: 'bg-red-100 text-red-700' },
        ].map((line, i) => (
          <div key={i} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-gray-100">
            <span className="text-xs text-gray-700 font-medium truncate">{line.name}</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap ml-2 ${line.color}`}>{line.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AIMPreview() {
  return (
    <div className="p-5 space-y-4">
      <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-xl p-4 text-white">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 flex items-center justify-center">
            <i className="ri-sparkling-2-fill text-teal-400 text-base"></i>
          </div>
          <span className="text-xs font-bold text-white/70 uppercase tracking-wider">Ask Sigma AI</span>
        </div>
        <p className="text-sm text-white/90 font-medium mb-3">"What caused the readmission spike last Tuesday?"</p>
        <div className="bg-white/10 rounded-lg p-3 text-xs text-white/80 leading-relaxed">
          <strong className="text-teal-300">Analysis complete.</strong> Readmissions increased 23% on Oct 14 correlating with a shift change at 07:00. Root cause links to discharge documentation gap — 34% of cases missing follow-up instructions. Confidence: 91%.
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Top AI Recommendations</p>
        {[
          { priority: 'P1', text: 'Implement discharge checklist for AM shift — est. 18% readmission reduction', impact: 'High Impact', color: 'bg-red-100 text-red-700' },
          { priority: 'P2', text: 'Schedule follow-up call within 24hrs for CHF patients — 12% improvement', impact: 'Med Impact', color: 'bg-yellow-100 text-yellow-700' },
          { priority: 'P3', text: 'Update nursing SOP for medication reconciliation at discharge', impact: 'Compliance', color: 'bg-teal-100 text-teal-700' },
        ].map((rec, i) => (
          <div key={i} className="flex items-start gap-3 bg-white rounded-xl p-3 border border-gray-100">
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md flex-shrink-0 mt-0.5 ${rec.color}`}>{rec.priority}</span>
            <p className="text-xs text-gray-700 flex-1 leading-relaxed">{rec.text}</p>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap ${rec.color}`}>{rec.impact}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CPIPreview() {
  return (
    <div className="p-5 space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Active Integrations', value: '6', icon: 'ri-link-m', color: 'bg-teal-50 text-teal-600' },
          { label: 'Clinical Models', value: '12', icon: 'ri-brain-line', color: 'bg-emerald-50 text-emerald-600' },
          { label: 'PHI Encrypted', value: '100%', icon: 'ri-shield-check-line', color: 'bg-gray-900 text-teal-400' },
        ].map((stat, i) => (
          <div key={i} className="bg-white rounded-xl p-3 border border-gray-100 text-center">
            <div className={`w-8 h-8 flex items-center justify-center rounded-lg mx-auto mb-2 ${stat.color}`}>
              <i className={`${stat.icon} text-sm`}></i>
            </div>
            <p className="text-lg font-bold text-gray-900">{stat.value}</p>
            <p className="text-xs text-gray-400 mt-0.5 leading-tight">{stat.label}</p>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl p-4 border border-gray-100">
        <p className="text-xs font-bold text-gray-700 mb-3">Clinical Automation Triggers — Today</p>
        <div className="space-y-2">
          {[
            { name: 'ED Surge Check', time: '14:23', status: 'Fired', patients: 34, color: 'text-red-600 bg-red-50' },
            { name: 'Readmission Risk', time: '13:45', status: 'Monitoring', patients: 89, color: 'text-yellow-600 bg-yellow-50' },
            { name: 'Lab Escalation', time: '12:08', status: 'Clear', patients: 12, color: 'text-emerald-600 bg-emerald-50' },
          ].map((t, i) => (
            <div key={i} className="flex items-center justify-between gap-2">
              <span className="text-xs text-gray-700 font-medium flex-1 truncate">{t.name}</span>
              <span className="text-xs text-gray-400">{t.time}</span>
              <span className="text-xs font-semibold text-gray-500">{t.patients} pts</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${t.color}`}>{t.status}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-gray-900 rounded-xl p-3 flex items-center gap-3">
        <div className="w-8 h-8 flex items-center justify-center bg-teal-500/20 rounded-lg flex-shrink-0">
          <i className="ri-lock-2-line text-teal-400 text-sm"></i>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-white">HIPAA Compliant — Field-Level Encryption Active</p>
          <p className="text-xs text-white/50 mt-0.5">All PHI encrypted with AES-256 · Audit logs enabled · phi_access_logs active</p>
        </div>
        <i className="ri-checkbox-circle-fill text-teal-400 text-xl flex-shrink-0"></i>
      </div>
    </div>
  );
}

export function AnomalyPreview() {
  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-gray-700">Live Anomaly Feed</p>
        <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold">
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
          Monitoring 48 metrics
        </span>
      </div>
      <div className="space-y-2">
        {[
          { metric: 'Patient Wait Time — ED', severity: 'Critical', value: '4.2 σ', delta: '↑ 187%', time: '2m ago', bg: 'border-red-200 bg-red-50/50' },
          { metric: 'Lab Turnaround — Blood Panel', severity: 'High', value: '2.8 σ', delta: '↑ 43%', time: '8m ago', bg: 'border-yellow-200 bg-yellow-50/50' },
          { metric: 'OR Utilization Rate', severity: 'Medium', value: '1.9 σ', delta: '↓ 12%', time: '15m ago', bg: 'border-gray-200 bg-white' },
          { metric: 'Bed Turnover Cycle', severity: 'Low', value: '1.2 σ', delta: '↓ 5%', time: '31m ago', bg: 'border-gray-200 bg-white' },
        ].map((a, i) => (
          <div key={i} className={`flex items-center gap-3 border rounded-xl px-3 py-2.5 ${a.bg}`}>
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
              a.severity === 'Critical' ? 'bg-red-500' :
              a.severity === 'High' ? 'bg-yellow-500' :
              a.severity === 'Medium' ? 'bg-gray-400' : 'bg-emerald-400'
            }`}></div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-800 truncate">{a.metric}</p>
              <p className="text-xs text-gray-400">{a.time}</p>
            </div>
            <span className="text-xs font-bold text-gray-700">{a.value}</span>
            <span className={`text-xs font-semibold ${a.delta.startsWith('↑') ? 'text-red-600' : 'text-emerald-600'}`}>{a.delta}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-bold whitespace-nowrap ${
              a.severity === 'Critical' ? 'bg-red-100 text-red-700' :
              a.severity === 'High' ? 'bg-yellow-100 text-yellow-700' :
              a.severity === 'Medium' ? 'bg-gray-100 text-gray-600' : 'bg-emerald-100 text-emerald-700'
            }`}>{a.severity}</span>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl p-3 border border-gray-100">
        <p className="text-xs text-gray-400 font-medium mb-2">Alert Channels Active</p>
        <div className="flex items-center gap-2 flex-wrap">
          {['Email', 'Slack', 'PagerDuty', 'Webhook', 'In-App'].map(ch => (
            <span key={ch} className="text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full">{ch}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DMAICPreview() {
  return (
    <div className="p-5 space-y-4">
      <div className="bg-white rounded-xl p-3 border border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold text-gray-700">Project: Reduce ED Wait Time</p>
          <span className="text-xs text-teal-600 font-bold bg-teal-50 px-2 py-0.5 rounded-full">In Progress</span>
        </div>
        <div className="flex items-stretch gap-1">
          {[
            { phase: 'D', label: 'Define', pct: 100, color: 'bg-teal-500' },
            { phase: 'M', label: 'Measure', pct: 100, color: 'bg-teal-500' },
            { phase: 'A', label: 'Analyze', pct: 75, color: 'bg-teal-400' },
            { phase: 'I', label: 'Improve', pct: 20, color: 'bg-gray-200' },
            { phase: 'C', label: 'Control', pct: 0, color: 'bg-gray-100' },
          ].map((p, i) => (
            <div key={i} className="flex-1 text-center">
              <div className={`w-8 h-8 flex items-center justify-center rounded-lg mx-auto mb-1 text-xs font-bold ${
                p.pct === 100 ? 'bg-teal-500 text-white' :
                p.pct > 0 ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-400'
              }`}>{p.phase}</div>
              <p className="text-[9px] text-gray-500">{p.label}</p>
              <p className="text-[9px] font-bold text-gray-700">{p.pct}%</p>
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Open Tasks</p>
        {[
          { task: 'Complete fishbone diagram for triage delays', owner: 'Dr. Martinez', due: 'Oct 28', done: false },
          { task: 'Validate sample size for hypothesis test', owner: 'J. Chen', due: 'Oct 30', done: false },
          { task: 'Define project charter & scope', owner: 'Team', due: 'Oct 20', done: true },
          { task: 'Collect baseline DPMO data', owner: 'Data Team', due: 'Oct 22', done: true },
        ].map((t, i) => (
          <div key={i} className={`flex items-center gap-3 bg-white rounded-lg px-3 py-2 border ${t.done ? 'border-gray-100 opacity-50' : 'border-gray-100'}`}>
            <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${t.done ? 'bg-teal-500' : 'border-2 border-gray-300'}`}>
              {t.done && <i className="ri-check-line text-white text-[9px]"></i>}
            </div>
            <p className={`text-xs flex-1 truncate ${t.done ? 'line-through text-gray-400' : 'text-gray-700'}`}>{t.task}</p>
            <span className="text-xs text-gray-400 whitespace-nowrap">{t.due}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RootCausePreview() {
  return (
    <div className="p-5 space-y-4">
      <div className="bg-white rounded-xl p-4 border border-gray-100">
        <p className="text-xs font-bold text-gray-700 mb-3">Root Cause Tree — High Readmission Rate</p>
        <div className="space-y-2 text-xs">
          <div className="flex items-start gap-2">
            <div className="w-5 h-5 bg-red-100 rounded flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-red-600 font-bold text-[9px]">!</span>
            </div>
            <span className="font-semibold text-gray-800">Readmission Rate 23% above baseline</span>
          </div>
          <div className="pl-6 space-y-2 border-l-2 border-gray-200 ml-2">
            {[
              { cause: 'Discharge process gaps', probability: '68%', children: ['Missing follow-up instructions', 'No medication list provided'] },
              { cause: 'Patient education deficit', probability: '45%', children: ['No teach-back performed', 'Language barrier — 31% non-English'] },
            ].map((c, i) => (
              <div key={i} className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-yellow-500 flex-shrink-0"></div>
                  <span className="text-gray-700 font-medium">{c.cause}</span>
                  <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-bold">{c.probability}</span>
                </div>
                <div className="pl-4 space-y-1">
                  {c.children.map((ch, j) => (
                    <div key={j} className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0"></div>
                      <span className="text-gray-500 text-xs">{ch}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Causes Found', value: '7', icon: 'ri-focus-3-line', color: 'text-red-600 bg-red-50' },
          { label: 'Confidence', value: '88%', icon: 'ri-bar-chart-fill', color: 'text-teal-600 bg-teal-50' },
          { label: 'Est. Fix Time', value: '14d', icon: 'ri-time-line', color: 'text-gray-600 bg-gray-100' },
        ].map((s, i) => (
          <div key={i} className="bg-white rounded-xl p-3 border border-gray-100 text-center">
            <div className={`w-7 h-7 flex items-center justify-center rounded-lg mx-auto mb-1.5 ${s.color}`}>
              <i className={`${s.icon} text-sm`}></i>
            </div>
            <p className="text-base font-bold text-gray-900">{s.value}</p>
            <p className="text-xs text-gray-400">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ForecastPreview() {
  return (
    <div className="p-5 space-y-4">
      <div className="bg-white rounded-xl p-4 border border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold text-gray-700">Patient Volume Forecast — Next 30 Days</p>
          <span className="text-xs font-bold text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">95% CI</span>
        </div>
        <div className="relative h-24">
          <div className="flex items-end gap-0.5 h-full">
            {[60,65,58,72,68,75,80,74,70,82,85,78,90,88,92,95,98,94,100,96,102,108,105,110,112,108,115,118,112,120].map((h, i) => (
              <div key={i} className="flex-1 flex flex-col justify-end">
                <div
                  className={`w-full rounded-sm ${i < 20 ? 'bg-gray-300' : 'bg-teal-400/70'} ${i === 19 ? 'border-r-2 border-dashed border-teal-600' : ''}`}
                  style={{ height: `${h * 0.7}%` }}
                ></div>
              </div>
            ))}
          </div>
          <div className="absolute top-0 left-0 right-0 bottom-0 flex items-center" style={{ left: '65%' }}>
            <div className="w-px h-full border-l-2 border-dashed border-teal-500 opacity-70"></div>
          </div>
        </div>
        <div className="flex justify-between mt-1 text-[9px] text-gray-400">
          <span>Historical</span>
          <span className="text-teal-600 font-semibold">▶ Forecasted</span>
          <span>+30 days</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl p-3 border border-gray-100">
          <p className="text-xs text-gray-400 mb-1">What-If Scenario</p>
          <p className="text-xs font-semibold text-gray-800 mb-2">"If LOS drops by 1 day..."</p>
          <div className="space-y-1.5">
            {[
              { label: 'Bed Capacity', change: '+18 beds/day', up: true },
              { label: 'Revenue Impact', change: '+$2.1M/yr', up: true },
              { label: 'Staff Load', change: '-7% pressure', up: true },
            ].map((r, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-xs text-gray-500">{r.label}</span>
                <span className="text-xs font-bold text-emerald-600">{r.change}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-xl p-3 border border-gray-100">
          <p className="text-xs text-gray-400 mb-1">Model Accuracy</p>
          {[
            { model: 'ARIMA', accuracy: '91.2%' },
            { model: 'Prophet', accuracy: '94.7%' },
            { model: 'Ensemble', accuracy: '96.1%' },
          ].map((m, i) => (
            <div key={i} className="flex items-center gap-2 mb-1.5">
              <span className="text-xs text-gray-500 w-16">{m.model}</span>
              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-teal-500 rounded-full" style={{ width: m.accuracy }}></div>
              </div>
              <span className="text-xs font-bold text-gray-700 w-8 text-right">{m.accuracy}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DataIntegrationPreview() {
  return (
    <div className="p-5 space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Sources Connected', value: '14', icon: 'ri-database-2-line', color: 'bg-teal-50 text-teal-600' },
          { label: 'Pipelines Running', value: '8', icon: 'ri-flow-chart', color: 'bg-emerald-50 text-emerald-600' },
          { label: 'Records/Hour', value: '284K', icon: 'ri-speed-up-line', color: 'bg-gray-100 text-gray-600' },
        ].map((s, i) => (
          <div key={i} className="bg-white rounded-xl p-3 border border-gray-100 text-center">
            <div className={`w-7 h-7 flex items-center justify-center rounded-lg mx-auto mb-1.5 ${s.color}`}>
              <i className={`${s.icon} text-sm`}></i>
            </div>
            <p className="text-base font-bold text-gray-900">{s.value}</p>
            <p className="text-xs text-gray-400 leading-tight">{s.label}</p>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="px-3 py-2 border-b border-gray-100 bg-gray-50/60">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Active ETL Pipelines</p>
        </div>
        <div className="divide-y divide-gray-50">
          {[
            { name: 'Epic EHR → Analytics DB', status: 'Running', records: '12,400', health: 100 },
            { name: 'Lab System → CPI Feed', status: 'Running', records: '3,210', health: 98 },
            { name: 'Finance → KPI Aggregator', status: 'Warning', records: '890', health: 74 },
            { name: 'HR System → Staffing Model', status: 'Running', records: '124', health: 100 },
          ].map((p, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                p.status === 'Running' ? 'bg-emerald-500' : 'bg-yellow-400'
              }`}></div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-700 font-medium truncate">{p.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${p.health > 90 ? 'bg-teal-500' : 'bg-yellow-400'}`} style={{ width: `${p.health}%` }}></div>
                  </div>
                  <span className="text-xs text-gray-400 whitespace-nowrap">{p.health}%</span>
                </div>
              </div>
              <span className="text-xs text-gray-500 whitespace-nowrap">{p.records} rows</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function KaizenPreview() {
  return (
    <div className="p-5 space-y-4">
      <div className="grid grid-cols-4 gap-2 text-center text-xs">
        {[
          { stage: 'Backlog', count: 8, color: 'bg-gray-100 text-gray-600' },
          { stage: 'In Progress', count: 4, color: 'bg-teal-100 text-teal-700' },
          { stage: 'Review', count: 2, color: 'bg-yellow-100 text-yellow-700' },
          { stage: 'Done', count: 23, color: 'bg-emerald-100 text-emerald-700' },
        ].map((s, i) => (
          <div key={i} className={`rounded-xl px-2 py-2 font-bold ${s.color}`}>
            <div className="text-xl font-extrabold">{s.count}</div>
            <div>{s.stage}</div>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {[
          { title: 'Reduce IV prep time from 18→10 min', owner: 'Pharmacy', tags: ['Process', 'Time'], urgent: true },
          { title: 'Standardize wound care documentation', owner: 'Nursing', tags: ['Documentation'], urgent: false },
          { title: 'Streamline insurance pre-auth workflow', owner: 'Billing', tags: ['Automation', 'Revenue'], urgent: true },
        ].map((item, i) => (
          <div key={i} className="bg-white rounded-xl p-3 border border-gray-100">
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <p className="text-xs font-semibold text-gray-800 flex-1 leading-tight">{item.title}</p>
              {item.urgent && <span className="text-[9px] bg-red-100 text-red-600 font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap">Urgent</span>}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-400">{item.owner}</span>
              {item.tags.map(t => (
                <span key={t} className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">{t}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BenchmarkingPreview() {
  return (
    <div className="p-5 space-y-4">
      <div className="bg-white rounded-xl p-4 border border-gray-100">
        <p className="text-xs font-bold text-gray-700 mb-3">KPI vs. Industry Benchmark</p>
        <div className="space-y-3">
          {[
            { metric: 'Readmission Rate', yours: 12.4, benchmark: 15.2, unit: '%', better: true },
            { metric: 'HCAHPS Score', yours: 78, benchmark: 82, unit: '/100', better: false },
            { metric: 'Average LOS (days)', yours: 4.1, benchmark: 4.8, unit: 'd', better: true },
            { metric: 'ED Throughput (hrs)', yours: 3.2, benchmark: 2.8, unit: 'h', better: false },
          ].map((m, i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-700 font-medium">{m.metric}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-900">{m.yours}{m.unit}</span>
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${m.better ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                    {m.better ? '▲ Better' : '▼ Below'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden relative">
                  <div
                    className={`h-full rounded-full ${m.better ? 'bg-emerald-500' : 'bg-red-400'}`}
                    style={{ width: `${Math.min((m.yours / (Math.max(m.yours, m.benchmark) * 1.1)) * 100, 100)}%` }}
                  ></div>
                  <div
                    className="absolute top-0 h-full w-0.5 bg-gray-500 opacity-50"
                    style={{ left: `${(m.benchmark / (Math.max(m.yours, m.benchmark) * 1.1)) * 100}%` }}
                  ></div>
                </div>
                <span className="text-xs text-gray-400 whitespace-nowrap">Peer: {m.benchmark}{m.unit}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl p-3 border border-gray-100">
          <p className="text-xs text-gray-400 mb-1.5">Percentile Ranking</p>
          <p className="text-2xl font-extrabold text-gray-900">72<span className="text-sm font-semibold text-gray-400">nd</span></p>
          <p className="text-xs text-gray-500 mt-0.5">vs. 2,400 peer hospitals</p>
        </div>
        <div className="bg-white rounded-xl p-3 border border-gray-100">
          <p className="text-xs text-gray-400 mb-1.5">Top Opportunity</p>
          <p className="text-xs font-bold text-gray-800">HCAHPS Score</p>
          <p className="text-xs text-red-600 font-semibold mt-0.5">+4 points gap to top quartile</p>
        </div>
      </div>
    </div>
  );
}
