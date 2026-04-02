import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useCPIData } from '../../../hooks/useCPIData';

export default function CPIHeader() {
  const [time, setTime] = useState(new Date());
  const [pulse, setPulse] = useState(false);
  const { domains } = useCPIData();

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
      setPulse(p => !p);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  // Derive live metrics from real domain snapshot data
  const liveMetrics = useMemo(() => {
    const getDomain = (id: string) => domains.find(d => d.domain_id === id);
    const ed = getDomain('ed');
    const beds = getDomain('beds');
    const discharge = getDomain('discharge');
    const staffing = getDomain('staffing');
    const inpatient = getDomain('inpatient');

    return [
      {
        label: 'ED Occupancy',
        value: ed ? `${ed.risk_score}%` : '—',
        trend: ed && ed.risk_score > 70 ? 'up' : 'stable',
        status: ed && ed.risk_score >= 75 ? 'critical' : ed && ed.risk_score >= 55 ? 'warning' : 'good',
      },
      {
        label: 'Avg LOS',
        value: inpatient ? (inpatient.metrics['avg_los'] as string) ?? '—' : '—',
        trend: 'stable',
        status: 'good',
      },
      {
        label: 'Beds Available',
        value: beds ? (beds.metrics['available_beds'] as string) ?? '—' : '—',
        trend: beds && beds.risk_score > 60 ? 'down' : 'stable',
        status: beds && beds.risk_score >= 75 ? 'critical' : beds && beds.risk_score >= 55 ? 'warning' : 'good',
      },
      {
        label: 'Pending Discharges',
        value: discharge ? (discharge.metrics['ready_waiting'] as string) ?? '—' : '—',
        trend: discharge && discharge.risk_score > 50 ? 'up' : 'stable',
        status: discharge && discharge.risk_score >= 75 ? 'critical' : discharge && discharge.risk_score >= 40 ? 'warning' : 'good',
      },
      {
        label: 'Staffing Index',
        value: staffing ? ((staffing.metrics['rn_coverage'] as string) ?? '—') : '—',
        trend: staffing && staffing.risk_score > 50 ? 'down' : 'stable',
        status: staffing && staffing.risk_score >= 75 ? 'critical' : staffing && staffing.risk_score >= 55 ? 'warning' : 'good',
      },
    ] as { label: string; value: string; trend: 'up' | 'down' | 'stable'; status: 'good' | 'warning' | 'critical' }[];
  }, [domains]);

  const statusColor = {
    good: 'text-emerald-400',
    warning: 'text-amber-400',
    critical: 'text-rose-400',
  };

  const trendIcon = {
    up: 'ri-arrow-up-line',
    down: 'ri-arrow-down-line',
    stable: 'ri-subtract-line',
  };

  const trendColor = {
    up: 'text-rose-400',
    down: 'text-emerald-400',
    stable: 'text-slate-400',
  };

  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-teal-950 to-slate-900"></div>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(20,184,166,0.15)_0%,_transparent_60%)]"></div>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_rgba(6,182,212,0.08)_0%,_transparent_60%)]"></div>
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: `linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)`,
        backgroundSize: '40px 40px'
      }}></div>

      <div className="relative px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <Link to="/" className="flex items-center space-x-2.5 group cursor-pointer">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center">
                <img
                  src="https://static.readdy.ai/image/e0eaba904d3ab93af6bd7d79a7618802/315afdeb7baeedd8ffa62425df2dc4e4.png"
                  alt="SigmaSense"
                  className="w-full h-full object-contain"
                />
              </div>
              <span className="text-sm font-semibold text-white/60 group-hover:text-white/90 transition-colors">SigmaSense</span>
            </Link>
            <span className="text-white/20">/</span>
            <div className="flex items-center space-x-2">
              <div className="w-5 h-5 flex items-center justify-center">
                <i className="ri-heart-pulse-line text-teal-400 text-sm"></i>
              </div>
              <span className="text-sm font-semibold text-teal-300">Clinical Process Intelligence</span>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-full">
              <div className={`w-2 h-2 rounded-full bg-emerald-400 transition-opacity duration-1000 ${pulse ? 'opacity-100' : 'opacity-40'}`}></div>
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Live</span>
            </div>
            <div className="text-sm font-mono text-white/40">
              {time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
            <Link
              to="/dashboard"
              className="flex items-center space-x-2 px-4 py-2 bg-white/10 hover:bg-white/15 border border-white/15 rounded-lg text-sm text-white/70 hover:text-white transition-all duration-200 cursor-pointer whitespace-nowrap"
            >
              <i className="ri-dashboard-line text-sm"></i>
              <span>Dashboard</span>
            </Link>
          </div>
        </div>

        <div className="max-w-3xl">
          <div className="flex items-center space-x-3 mb-3">
            <div className="w-10 h-10 flex items-center justify-center bg-teal-500/20 border border-teal-500/30 rounded-xl">
              <i className="ri-heart-pulse-line text-teal-400 text-xl"></i>
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white tracking-tight">
                Clinical Process Intelligence <span className="text-teal-400">CPI</span>
              </h1>
            </div>
          </div>
          <p className="text-white/50 text-base leading-relaxed mb-1">Operational intelligence for healthcare delivery</p>
          <p className="text-white/30 text-sm">Monitoring ED flow, inpatient throughput, lab escalation, staffing balance, and discharge coordination</p>
        </div>

        {/* Live metrics strip — pulled from Supabase */}
        <div className="flex items-center space-x-4 mt-6 overflow-x-auto pb-1">
          {liveMetrics.map((metric, i) => (
            <div
              key={i}
              className="flex-shrink-0 flex items-center space-x-3 px-4 py-2.5 bg-white/5 border border-white/8 rounded-xl backdrop-blur-sm hover:bg-white/8 transition-colors"
            >
              <div>
                <div className="text-xs text-white/40 font-medium mb-0.5 whitespace-nowrap">{metric.label}</div>
                <div className={`text-base font-bold ${statusColor[metric.status]}`}>
                  {metric.value === '—' ? (
                    <span className="inline-block w-8 h-4 bg-white/10 rounded animate-pulse"></span>
                  ) : metric.value}
                </div>
              </div>
              <div className={`w-5 h-5 flex items-center justify-center ${trendColor[metric.trend]}`}>
                <i className={`${trendIcon[metric.trend]} text-sm`}></i>
              </div>
            </div>
          ))}

          <div className="flex-shrink-0 ml-auto flex items-center space-x-2 px-4 py-2.5 bg-teal-500/10 border border-teal-500/20 rounded-xl">
            {['Sense', 'Analyze', 'Decide', 'Act', 'Learn'].map((stage, i) => (
              <div key={i} className="flex items-center">
                <span className="text-xs font-semibold text-teal-400 whitespace-nowrap">{stage}</span>
                {i < 4 && <i className="ri-arrow-right-s-line text-teal-600 mx-0.5 text-xs"></i>}
              </div>
            ))}
          </div>
        </div>

        {/* Live data source + analytics bridge indicator */}
        <div className="mt-3 flex items-center space-x-4 flex-wrap gap-y-1">
          <div className="flex items-center space-x-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
            <span className="text-xs text-white/25">Operational metrics refreshed from live CPI domain telemetry</span>
          </div>
          <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-teal-500/10 border border-teal-500/20 rounded-full">
            <i className="ri-arrow-left-right-line text-teal-400 text-xs"></i>
            <span className="text-xs text-teal-400 font-medium">Connected to Analytics Layer</span>
            <span className="text-xs text-teal-500/60">· Forecasting · AIM · Alerts</span>
          </div>
        </div>
      </div>
    </div>
  );
}
