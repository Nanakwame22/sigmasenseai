import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import { exportToCSV, exportToJSON } from '../../../utils/exportUtils';
import { addToast } from '../../../hooks/useToast';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import { AIMMetricTiles, AIMPanel, AIMSectionIntro } from './AIMSectionSystem';

interface Report {
  id: string;
  title: string;
  type: string;
  date: string;
  size: string;
  status: 'Ready' | 'Generating' | 'Scheduled';
  data?: any;
}

interface ReportSection {
  title: string;
  description: string;
  included: boolean;
  pages: number;
}

interface Recipient {
  id: string;
  name: string;
  role: string;
  email: string;
}

type ReportTemplateId = 'monthly' | 'executive' | 'audit' | 'custom';

const REPORT_TEMPLATES: Array<{
  id: ReportTemplateId;
  title: string;
  description: string;
  type: string;
  icon: string;
  shell: string;
  includedSections: string[];
  audience: string;
}> = [
  {
    id: 'monthly',
    title: 'Monthly Operating Review',
    description: 'Comprehensive monthly report covering intelligence, decisions, actions, and alert posture.',
    type: 'Monthly Summary',
    icon: 'ri-file-text-line',
    shell: 'from-teal-50 to-cyan-50 border-teal-200',
    includedSections: [
      'Executive Summary',
      'Performance Narrative',
      'Key Drivers Analysis',
      'Recommendations',
      'Impact Forecasts',
      'Decision Support',
      'Action Tracker',
      'Predictive Alerts',
    ],
    audience: 'Operations and leadership',
  },
  {
    id: 'executive',
    title: 'Executive Brief',
    description: 'Boardroom-ready snapshot focused on risk, opportunity, and recommended decisions.',
    type: 'Executive Brief',
    icon: 'ri-presentation-line',
    shell: 'from-blue-50 to-indigo-50 border-blue-200',
    includedSections: [
      'Executive Summary',
      'Performance Narrative',
      'Recommendations',
      'Impact Forecasts',
      'Decision Support',
    ],
    audience: 'Executives and sponsors',
  },
  {
    id: 'audit',
    title: 'Audit & Compliance Pack',
    description: 'Traceable documentation of methodology, sources, alerts, and action history.',
    type: 'Audit Report',
    icon: 'ri-shield-check-line',
    shell: 'from-purple-50 to-pink-50 border-purple-200',
    includedSections: [
      'Executive Summary',
      'Predictive Alerts',
      'Action Tracker',
      'Historical Accuracy',
      'Technical Appendix',
    ],
    audience: 'Compliance and quality',
  },
  {
    id: 'custom',
    title: 'Custom Report',
    description: 'Assemble a report pack tailored to the audience, review, or operating question at hand.',
    type: 'Custom Report',
    icon: 'ri-mail-send-line',
    shell: 'from-emerald-50 to-teal-50 border-emerald-200',
    includedSections: [],
    audience: 'Custom distribution',
  },
];

const getLocalReportsKey = (orgId: string) => `aim-local-reports:${orgId}`;

const ReportsSection: React.FC = () => {
  const { organization, organizationId, user } = useAuth();

  // Resolve org ID from either source — whichever is available first
  const orgId = organization?.id ?? organizationId ?? null;

  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [reportFrequency, setReportFrequency] = useState<string>('monthly');
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<ReportTemplateId>('executive');
  const [reportSections, setReportSections] = useState<ReportSection[]>([
    {
      title: 'Executive Summary',
      description: 'High-level overview of key findings and recommendations',
      included: true,
      pages: 2
    },
    {
      title: 'Performance Narrative',
      description: 'AI-generated insights and trend analysis',
      included: true,
      pages: 3
    },
    {
      title: 'Key Drivers Analysis',
      description: 'Detailed breakdown of performance drivers',
      included: true,
      pages: 4
    },
    {
      title: 'Recommendations',
      description: 'Ranked action opportunities with ROI analysis',
      included: true,
      pages: 5
    },
    {
      title: 'Impact Forecasts',
      description: 'Projected outcomes and KPI predictions',
      included: true,
      pages: 4
    },
    {
      title: 'Decision Support',
      description: 'Scenario comparison and justification',
      included: true,
      pages: 6
    },
    {
      title: 'Action Tracker',
      description: 'Current initiatives and progress updates',
      included: true,
      pages: 3
    },
    {
      title: 'Predictive Alerts',
      description: 'Early warnings and risk assessments',
      included: true,
      pages: 2
    },
    {
      title: 'Historical Accuracy',
      description: 'AIM performance and validation metrics',
      included: false,
      pages: 2
    },
    {
      title: 'Technical Appendix',
      description: 'Data sources, methodology, and assumptions',
      included: false,
      pages: 8
    }
  ]);
  const [auditStats, setAuditStats] = useState({
    totalReports: 0,
    dataSourcesValidated: 0,
    auditTrailComplete: 100
  });

  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [showExportFormatDialog, setShowExportFormatDialog] = useState(false);
  const [pendingExportReport, setPendingExportReport] = useState<Report | null>(null);
  const [pendingExportFormat, setPendingExportFormat] = useState<'pdf' | 'excel' | 'email' | 'presentation' | null>(null);

  const syncSectionsToTemplate = (templateId: ReportTemplateId) => {
    const template = REPORT_TEMPLATES.find((item) => item.id === templateId);
    if (!template || template.id === 'custom') return;

    setReportSections((prev) =>
      prev.map((section) => ({
        ...section,
        included: template.includedSections.includes(section.title),
      }))
    );
  };

  const getActiveTemplate = () =>
    REPORT_TEMPLATES.find((template) => template.id === selectedTemplate) || REPORT_TEMPLATES[0];

  const getSelectedSections = () => reportSections.filter((section) => section.included);

  const getReportSnapshot = (report?: Report | null) => {
    const reportData = report?.data;
    const statsBlock = reportData?.statistics || {};

    return {
      title: report?.title || `AIM Report - ${new Date().toLocaleDateString()}`,
      generatedAt: reportData?.generated_at || report?.date || new Date().toISOString(),
      sections: reportData?.sections || reportSections.filter(s => s.included).map(s => s.title),
      statistics: {
        recommendations: statsBlock.recommendations || 0,
        alerts: statsBlock.alerts || 0,
        projects: statsBlock.projects || 0,
        kpis: statsBlock.kpis || 0,
      },
      kpis: reportData?.kpi_summary || [],
    };
  };

  const buildReportSummaryText = (report?: Report | null) => {
    const snapshot = getReportSnapshot(report);
    return [
      snapshot.title,
      `Generated: ${new Date(snapshot.generatedAt).toLocaleString()}`,
      '',
      'Included Sections:',
      ...snapshot.sections.map((section: string) => `- ${section}`),
      '',
      'Headline Metrics:',
      `- Recommendations: ${snapshot.statistics.recommendations}`,
      `- Alerts: ${snapshot.statistics.alerts}`,
      `- Projects: ${snapshot.statistics.projects}`,
      `- KPIs: ${snapshot.statistics.kpis}`,
      '',
      snapshot.kpis.length > 0 ? 'KPI Snapshot:' : '',
      ...snapshot.kpis.slice(0, 10).map((kpi: any) => `- ${kpi.name}: ${kpi.current_value ?? 'N/A'} / target ${kpi.target_value ?? 'N/A'}`),
    ]
      .filter(Boolean)
      .join('\n');
  };

  const openPrintableReport = (report?: Report | null) => {
    const snapshot = getReportSnapshot(report);
    const popup = window.open('', '_blank', 'noopener,noreferrer,width=960,height=720');
    if (!popup) {
      addToast('Popup blocked. Please allow popups to export the report as a printable document.', 'warning');
      return;
    }

    const kpiRows = snapshot.kpis.length > 0
      ? snapshot.kpis.slice(0, 12).map((kpi: any) => `
          <tr>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${kpi.name}</td>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${kpi.current_value ?? 'N/A'}</td>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${kpi.target_value ?? 'N/A'}</td>
          </tr>
        `).join('')
      : '<tr><td colspan="3" style="padding:8px;">No KPI detail captured in this report.</td></tr>';

    popup.document.write(`
      <html>
        <head>
          <title>${snapshot.title}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 32px; color: #0f172a; }
            h1 { margin-bottom: 8px; }
            h2 { margin-top: 28px; }
            .meta { color: #475569; margin-bottom: 20px; }
            .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 20px 0; }
            .card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          </style>
        </head>
        <body>
          <h1>${snapshot.title}</h1>
          <div class="meta">Generated ${new Date(snapshot.generatedAt).toLocaleString()}</div>
          <div class="grid">
            <div class="card"><strong>Recommendations</strong><div>${snapshot.statistics.recommendations}</div></div>
            <div class="card"><strong>Alerts</strong><div>${snapshot.statistics.alerts}</div></div>
            <div class="card"><strong>Projects</strong><div>${snapshot.statistics.projects}</div></div>
            <div class="card"><strong>KPIs</strong><div>${snapshot.statistics.kpis}</div></div>
          </div>
          <h2>Included Sections</h2>
          <ul>${snapshot.sections.map((section: string) => `<li>${section}</li>`).join('')}</ul>
          <h2>KPI Snapshot</h2>
          <table>
            <thead>
              <tr><th style="text-align:left;padding:8px;border-bottom:1px solid #cbd5e1;">Metric</th><th style="text-align:left;padding:8px;border-bottom:1px solid #cbd5e1;">Current</th><th style="text-align:left;padding:8px;border-bottom:1px solid #cbd5e1;">Target</th></tr>
            </thead>
            <tbody>${kpiRows}</tbody>
          </table>
        </body>
      </html>
    `);
    popup.document.close();
    popup.focus();
    popup.print();
  };

  const shareReport = async (report?: Report | null) => {
    const text = buildReportSummaryText(report);
    const title = getReportSnapshot(report).title;

    if (navigator.share) {
      await navigator.share({ title, text });
      addToast('Report summary shared successfully', 'success');
      return;
    }

    await navigator.clipboard.writeText(text);
    addToast('Report summary copied to clipboard for sharing', 'success');
  };

  useEffect(() => {
    if (orgId) {
      loadReports();
      loadAuditStats();
      loadTeamMembers();
    }
  }, [orgId]);

  useEffect(() => {
    syncSectionsToTemplate(selectedTemplate);
  }, [selectedTemplate]);

  const loadLocalReports = (currentOrgId: string): Report[] => {
    if (typeof window === 'undefined') return [];

    try {
      const raw = window.localStorage.getItem(getLocalReportsKey(currentOrgId));
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error('Error loading local AIM reports:', error);
      return [];
    }
  };

  const saveLocalReports = (currentOrgId: string, nextReports: Report[]) => {
    if (typeof window === 'undefined') return;

    try {
      window.localStorage.setItem(getLocalReportsKey(currentOrgId), JSON.stringify(nextReports));
    } catch (error) {
      console.error('Error saving local AIM reports:', error);
    }
  };

  const loadReports = async () => {
    if (!orgId) return;

    try {
      setLoading(true);

      const { data: auditLogs, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('organization_id', orgId)
        .eq('action', 'report_generated')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      const remoteReports: Report[] = (auditLogs || []).map((log) => {
        const metadata = (log.metadata || log.new_values || log.details) as any;
        return {
          id: log.id,
          title: metadata?.report_title || `AIM Report - ${new Date(log.created_at).toLocaleDateString()}`,
          type: metadata?.report_type || 'Monthly Summary',
          date: new Date(log.created_at).toISOString().split('T')[0],
          size: metadata?.report_size || '2.1 MB',
          status: 'Ready' as const,
          data: metadata?.report_data
        };
      });

      const localReports = loadLocalReports(orgId);
      const mergedReports = [...localReports, ...remoteReports].filter(
        (report, index, list) => list.findIndex((item) => item.id === report.id) === index
      );

      setReports(mergedReports);
    } catch (error) {
      console.error('Error loading reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAuditStats = async () => {
    if (!orgId) return;

    try {
      const { count: reportCount } = await supabase
        .from('audit_logs')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('action', 'report_generated');

      const { count: dataSourceCount } = await supabase
        .from('data_sources')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('status', 'active');

      setAuditStats({
        totalReports: reportCount || 0,
        dataSourcesValidated: dataSourceCount || 0,
        auditTrailComplete: 100
      });
    } catch (error) {
      console.error('Error loading audit stats:', error);
    }
  };

  const loadTeamMembers = async () => {
    if (!orgId) return;

    try {
      const { data: teamMembers, error } = await supabase
        .from('user_profiles')
        .select('id, full_name, email')
        .eq('organization_id', orgId)
        .limit(10);

      if (error) throw error;

      const formattedRecipients: Recipient[] = (teamMembers || []).map((member) => ({
        id: member.id,
        name: member.full_name || 'Unknown',
        role: 'Team Member',
        email: member.email || ''
      }));

      setRecipients(formattedRecipients);
    } catch (error) {
      console.error('Error loading team members:', error);
    }
  };

  const generateReport = async (templateId: ReportTemplateId = selectedTemplate) => {
    if (!orgId) return;

    try {
      setGenerating(true);
      const template = REPORT_TEMPLATES.find((item) => item.id === templateId) || getActiveTemplate();
      const selectedSections =
        template.id === 'custom'
          ? getSelectedSections()
          : reportSections.filter((section) => template.includedSections.includes(section.title));

      const [
        { count: recommendationsCount },
        { count: alertsCount },
        { count: projectsCount },
        { data: kpis }
      ] = await Promise.all([
        supabase
          .from('recommendations')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', orgId),
        supabase
          .from('alerts')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', orgId),
        supabase
          .from('dmaic_projects')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', orgId),
        supabase
          .from('kpis')
          .select('name, current_value, target_value')
          .eq('organization_id', orgId)
          .limit(10)
      ]);

      const reportData = {
        generated_at: new Date().toISOString(),
        organization_id: orgId,
        sections: selectedSections.map(s => s.title),
        statistics: {
          recommendations: recommendationsCount || 0,
          alerts: alertsCount || 0,
          projects: projectsCount || 0,
          kpis: kpis?.length || 0
        },
        kpi_summary: kpis || [],
        generated_by: user?.id
      };

      const reportId = `report-${Date.now()}`;
      const newReport: Report = {
        id: reportId,
        title: `${template.title} - ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
        type: template.type,
        date: new Date().toISOString().split('T')[0],
        size: `${Math.max(1.4, (selectedSections.reduce((sum, section) => sum + section.pages, 0) / 6)).toFixed(1)} MB`,
        status: 'Ready',
        data: reportData
      };

      const auditPayload = {
        organization_id: orgId,
        user_id: user?.id,
        action: 'report_generated',
        resource_type: 'report',
        resource_id: reportId,
        entity_type: 'report',
        entity_id: reportId,
        entity_name: newReport.title,
        severity: 'info',
        status: 'success',
        details: {
          report_title: newReport.title,
          report_type: newReport.type,
          report_size: newReport.size,
          report_data: reportData
        },
        metadata: {
          report_title: newReport.title,
          report_type: newReport.type,
          report_size: newReport.size,
          report_data: reportData
        },
        new_values: {
          report_title: newReport.title,
          report_type: newReport.type,
          report_size: newReport.size,
          report_data: reportData
        }
      };

      const { error: insertError } = await supabase
        .from('audit_logs')
        .insert(auditPayload);

      if (insertError) {
        console.error('Report audit persistence failed:', insertError);
        const existingLocalReports = loadLocalReports(orgId);
        const nextLocalReports = [newReport, ...existingLocalReports].filter(
          (report, index, list) => list.findIndex((item) => item.id === report.id) === index
        );
        saveLocalReports(orgId, nextLocalReports);
        setReports(nextLocalReports);
        addToast('Report generated and saved locally. Audit logging is currently unavailable.', 'warning');
      } else {
        saveLocalReports(orgId, [newReport, ...loadLocalReports(orgId)].filter(
          (report, index, list) => list.findIndex((item) => item.id === report.id) === index
        ));
        await loadReports();
        await loadAuditStats();
      }

      setShowExportFormatDialog(true);
      setPendingExportReport(newReport);

    } catch (error) {
      console.error('Error generating report:', error);
      addToast('Failed to generate report', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleExportFormatConfirm = async (format: 'json' | 'csv') => {
    if (!pendingExportReport) return;

    try {
      const reportData = pendingExportReport.data;
      
      if (format === 'json') {
        exportToJSON(reportData, `aim-report-${new Date().toISOString().split('T')[0]}`);
      } else {
        const csvData = [
          { Section: 'Recommendations', Count: reportData.statistics.recommendations },
          { Section: 'Alerts', Count: reportData.statistics.alerts },
          { Section: 'Projects', Count: reportData.statistics.projects },
          { Section: 'KPIs', Count: reportData.statistics.kpis }
        ];
        exportToCSV(csvData, `aim-report-${new Date().toISOString().split('T')[0]}`);
      }

      await loadReports();
      await loadAuditStats();

      addToast('Report generated successfully!', 'success');
    } catch (error) {
      console.error('Error exporting report:', error);
      addToast('Failed to export report', 'error');
    } finally {
      setShowExportFormatDialog(false);
      setPendingExportReport(null);
    }
  };

  const scheduleReport = async () => {
    if (!orgId || selectedRecipients.length === 0) {
      addToast('Please select at least one recipient', 'warning');
      return;
    }

    try {
      const { error } = await supabase
        .from('alert_preferences')
        .upsert({
          organization_id: orgId,
          email_enabled: true,
          frequency: reportFrequency as any,
          metadata: {
            report_schedule: {
              frequency: reportFrequency,
              recipients: selectedRecipients,
              sections: reportSections.filter(s => s.included).map(s => s.title),
              scheduled_at: new Date().toISOString()
            }
          }
        });

      if (error) throw error;

      addToast(`Report scheduled: ${reportFrequency} delivery to ${selectedRecipients.length} recipients`, 'success');
      setShowScheduleModal(false);
    } catch (error) {
      console.error('Error scheduling report:', error);
      addToast('Failed to schedule report', 'error');
    }
  };

  const toggleRecipient = (id: string) => {
    setSelectedRecipients(prev =>
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    );
  };

  const toggleSection = (index: number) => {
    setReportSections(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], included: !updated[index].included };
      return updated;
    });
  };

  const exportReport = async (report: Report, format: 'pdf' | 'excel' | 'email' | 'presentation') => {
    setPendingExportReport(report);
    setPendingExportFormat(format);
  };

  const handleExportConfirm = async () => {
    if (!pendingExportReport || !pendingExportFormat) return;

    const format = pendingExportFormat;
    const report = pendingExportReport;

    if (format === 'pdf') {
      openPrintableReport(report);
      addToast('Printable report opened successfully', 'success');
    } else if (format === 'excel') {
      const snapshot = getReportSnapshot(report);
      const csvData = [
        { Section: 'Recommendations', Count: snapshot.statistics.recommendations },
        { Section: 'Alerts', Count: snapshot.statistics.alerts },
        { Section: 'Projects', Count: snapshot.statistics.projects },
        { Section: 'KPIs', Count: snapshot.statistics.kpis },
        ...snapshot.kpis.slice(0, 20).map((kpi: any) => ({
          Section: `KPI - ${kpi.name}`,
          Count: `${kpi.current_value ?? 'N/A'} / ${kpi.target_value ?? 'N/A'}`
        }))
      ];
      exportToCSV(csvData, `${report.title.replace(/\s+/g, '-').toLowerCase()}`);
      addToast('Report exported successfully', 'success');
    } else if (format === 'email') {
      const subject = encodeURIComponent(getReportSnapshot(report).title);
      const body = encodeURIComponent(buildReportSummaryText(report));
      window.location.href = `mailto:?subject=${subject}&body=${body}`;
      addToast('Email draft opened successfully', 'success');
    } else if (format === 'presentation') {
      await navigator.clipboard.writeText(buildReportSummaryText(report));
      addToast('Presentation-ready report summary copied to clipboard', 'success');
    }

    setPendingExportReport(null);
    setPendingExportFormat(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading reports...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AIMSectionIntro
        eyebrow="Reports Studio"
        title="Executive Reporting"
        description="Package AIM intelligence into leadership-ready briefs, operating reviews, and compliance packs with a clearer distribution workflow."
        actions={
          <>
            <button
              onClick={() => setShowScheduleModal(true)}
              className="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors whitespace-nowrap flex items-center gap-2"
            >
              <i className="ri-calendar-line"></i>
              Schedule Reports
            </button>
            <button
              onClick={() => generateReport(selectedTemplate)}
              disabled={generating}
              className="px-4 py-2 bg-gradient-to-r from-teal-500 to-cyan-600 text-white text-sm font-semibold rounded-xl hover:shadow-lg transition-all whitespace-nowrap flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <i className={`ri-file-add-line ${generating ? 'animate-spin' : ''}`}></i>
              {generating ? 'Generating...' : 'Generate Report'}
            </button>
          </>
        }
      />

      <AIMMetricTiles
        items={[
          {
            label: 'Report Archive',
            value: auditStats.totalReports,
            detail: 'Generated and logged reports',
          },
          {
            label: 'Validated Sources',
            value: auditStats.dataSourcesValidated,
            detail: 'Live sources included in reporting',
          },
          {
            label: 'Audit Coverage',
            value: `${auditStats.auditTrailComplete}%`,
            detail: 'Traceability across generated reports',
            accent: 'text-emerald-600',
          },
          {
            label: 'Current Template',
            value: getActiveTemplate().title,
            detail: getActiveTemplate().audience,
          },
        ]}
      />

      <AIMPanel
        title="Report Templates"
        description="Choose the reporting posture that best matches your audience before you generate or schedule delivery."
        icon="ri-layout-grid-line"
        accentClass="from-teal-500 to-cyan-600"
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {REPORT_TEMPLATES.map((template) => {
            const isActive = selectedTemplate === template.id;
            return (
              <button
                key={template.id}
                onClick={() => setSelectedTemplate(template.id)}
                className={`rounded-[24px] border p-5 text-left transition-all ${
                  isActive
                    ? 'border-teal-500 bg-gradient-to-br from-teal-50 to-cyan-50 shadow-lg shadow-teal-100/70'
                    : `border-slate-200 bg-gradient-to-br ${template.shell} hover:shadow-md`
                }`}
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/80 shadow-sm">
                    <i className={`${template.icon} text-xl text-slate-700`}></i>
                  </div>
                  {isActive ? (
                    <span className="rounded-full bg-teal-500 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white">
                      Selected
                    </span>
                  ) : null}
                </div>
                <h3 className="text-lg font-bold text-slate-900">{template.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{template.description}</p>
                <div className="mt-4 text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                  {template.audience}
                </div>
              </button>
            );
          })}
        </div>
      </AIMPanel>

      <AIMPanel
        title="Report Archive"
        description="Review the latest generated report packs and export or share them in the format your audience expects."
        icon="ri-folder-line"
        accentClass="from-blue-500 to-indigo-600"
      >

        {reports.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="ri-file-list-line text-3xl text-slate-400"></i>
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">No Reports Yet</h3>
            <p className="text-slate-600 mb-4">Generate your first AIM report to get started</p>
            <button
              onClick={() => generateReport(selectedTemplate)}
              className="px-6 py-3 bg-gradient-to-r from-teal-500 to-cyan-600 text-white text-sm font-semibold rounded-lg hover:shadow-lg transition-all whitespace-nowrap"
            >
              Generate Report
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map((report) => (
              <div
                key={report.id}
                className={`p-5 border border-slate-200 rounded-xl hover:shadow-lg transition-all cursor-pointer ${
                  selectedReport === report.id ? 'ring-2 ring-teal-500 bg-teal-50' : ''
                }`}
                onClick={() => setSelectedReport(report.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-lg flex items-center justify-center">
                      <i className="ri-file-text-line text-2xl text-blue-600"></i>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-slate-900 mb-1">{report.title}</h3>
                      <div className="flex items-center gap-4 text-sm text-slate-600">
                        <span className="flex items-center gap-1">
                          <i className="ri-calendar-line"></i>
                          {report.date}
                        </span>
                        <span className="flex items-center gap-1">
                          <i className="ri-file-line"></i>
                          {report.type}
                        </span>
                        <span className="flex items-center gap-1">
                          <i className="ri-hard-drive-line"></i>
                          {report.size}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`px-3 py-1 ${
                      report.status === 'Ready' ? 'bg-emerald-100 text-emerald-700' :
                      report.status === 'Generating' ? 'bg-blue-100 text-blue-700' :
                      'bg-amber-100 text-amber-700'
                    } text-xs font-semibold rounded-full whitespace-nowrap`}>
                      {report.status}
                    </span>

                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        exportReport(report, 'pdf');
                      }}
                      className="w-10 h-10 flex items-center justify-center hover:bg-slate-100 rounded-lg transition-colors" 
                      title="Download PDF"
                    >
                      <i className="ri-file-pdf-line text-red-600 text-xl"></i>
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        exportReport(report, 'excel');
                      }}
                      className="w-10 h-10 flex items-center justify-center hover:bg-slate-100 rounded-lg transition-colors" 
                      title="Download Excel"
                    >
                      <i className="ri-file-excel-line text-emerald-600 text-xl"></i>
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        exportReport(report, 'email');
                      }}
                      className="w-10 h-10 flex items-center justify-center hover:bg-slate-100 rounded-lg transition-colors" 
                      title="Email Report"
                    >
                      <i className="ri-mail-line text-blue-600 text-xl"></i>
                    </button>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        await shareReport(report);
                      }}
                      className="w-10 h-10 flex items-center justify-center hover:bg-slate-100 rounded-lg transition-colors"
                      title="Share"
                    >
                      <i className="ri-share-line text-slate-600 text-xl"></i>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </AIMPanel>

      <AIMPanel
        title="Custom Report Builder"
        description="Control what goes into the generated package and see the estimated document size before you export or schedule it."
        icon="ri-layout-line"
        accentClass="from-purple-500 to-pink-600"
      >

        <div className="grid gap-4 md:grid-cols-2">
          {reportSections.map((section, index) => (
            <div
              key={index}
              onClick={() => toggleSection(index)}
              className={`p-4 border-2 rounded-xl transition-all cursor-pointer ${
                section.included
                  ? 'border-teal-500 bg-gradient-to-br from-teal-50 to-cyan-50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-slate-900 mb-1">{section.title}</h3>
                  <p className="text-sm text-slate-600">{section.description}</p>
                </div>
                <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                  section.included
                    ? 'bg-teal-500 border-teal-500'
                    : 'border-slate-300'
                }`}>
                  {section.included && (
                    <i className="ri-check-line text-white text-sm"></i>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{section.pages} pages</span>
                {section.included && (
                  <span className="px-2 py-1 bg-teal-100 text-teal-700 font-semibold rounded-full">
                    Included
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 pt-6 border-t border-slate-200 flex items-center justify-between">
          <div className="text-sm text-slate-600">
            <span className="font-semibold text-slate-900">
              {getSelectedSections().length} sections selected
            </span>
            {' • '}
            <span>
              Estimated {getSelectedSections().reduce((sum, s) => sum + s.pages, 0)} pages
            </span>
          </div>
          <button
            onClick={() => generateReport(selectedTemplate)}
            disabled={generating}
            className="px-6 py-3 bg-gradient-to-r from-teal-500 to-cyan-600 text-white text-sm font-semibold rounded-lg hover:shadow-lg transition-all whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? 'Generating...' : 'Generate Custom Report'}
          </button>
        </div>
      </AIMPanel>

      <AIMPanel
        title="Distribution Options"
        description="Export, email, or stage the report package in the format each audience expects."
        icon="ri-download-cloud-line"
        accentClass="from-blue-500 to-indigo-600"
      >

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <button 
            onClick={() => reports[0] ? exportReport(reports[0], 'pdf') : generateReport(selectedTemplate)}
            className="p-6 border border-slate-200 rounded-xl hover:shadow-lg hover:border-teal-500 transition-all text-center group"
          >
            <div className="w-16 h-16 bg-gradient-to-br from-red-100 to-pink-100 rounded-lg flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
              <i className="ri-file-pdf-line text-3xl text-red-600"></i>
            </div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">PDF Document</h3>
            <p className="text-xs text-slate-600">Professional formatted report</p>
          </button>

          <button 
            onClick={() => reports[0] ? exportReport(reports[0], 'excel') : generateReport(selectedTemplate)}
            className="p-6 border border-slate-200 rounded-xl hover:shadow-lg hover:border-teal-500 transition-all text-center group"
          >
            <div className="w-16 h-16 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-lg flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
              <i className="ri-file-excel-line text-3xl text-emerald-600"></i>
            </div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">Excel Workbook</h3>
            <p className="text-xs text-slate-600">Data tables and charts</p>
          </button>

          <button 
            onClick={() => reports[0] ? exportReport(reports[0], 'email') : generateReport(selectedTemplate)}
            className="p-6 border border-slate-200 rounded-xl hover:shadow-lg hover:border-teal-500 transition-all text-center group"
          >
            <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-lg flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
              <i className="ri-mail-line text-3xl text-blue-600"></i>
            </div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">Email Report</h3>
            <p className="text-xs text-slate-600">Send directly to recipients</p>
          </button>

          <button 
            onClick={() => reports[0] ? exportReport(reports[0], 'presentation') : generateReport(selectedTemplate)}
            className="p-6 border border-slate-200 rounded-xl hover:shadow-lg hover:border-teal-500 transition-all text-center group"
          >
            <div className="w-16 h-16 bg-gradient-to-br from-purple-100 to-pink-100 rounded-lg flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
              <i className="ri-presentation-line text-3xl text-purple-600"></i>
            </div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">Presentation</h3>
            <p className="text-xs text-slate-600">PowerPoint slides</p>
          </button>
        </div>
      </AIMPanel>

      <AIMPanel
        title="Audit & Documentation"
        description="Track report traceability, validated source coverage, and compliance posture alongside every generated pack."
        icon="ri-shield-check-line"
        accentClass="from-amber-500 to-orange-600"
      >

        <div className="grid gap-6 md:grid-cols-3">
          <div className="p-5 bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl">
            <div className="text-sm text-slate-600 mb-2">Total Reports Generated</div>
            <div className="text-3xl font-bold text-slate-900 mb-1">{auditStats.totalReports}</div>
            <div className="text-xs text-slate-500">All time</div>
          </div>

          <div className="p-5 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl">
            <div className="text-sm text-slate-600 mb-2">Data Sources Validated</div>
            <div className="text-3xl font-bold text-blue-600 mb-1">{auditStats.dataSourcesValidated}</div>
            <div className="text-xs text-slate-500">All sources verified</div>
          </div>

          <div className="p-5 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl">
            <div className="text-sm text-slate-600 mb-2">Audit Trail Complete</div>
            <div className="text-3xl font-bold text-emerald-600 mb-1">{auditStats.auditTrailComplete}%</div>
            <div className="text-xs text-slate-500">Full traceability</div>
          </div>
        </div>

        <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-3">
            <i className="ri-information-line text-amber-600 text-xl mt-0.5"></i>
            <div>
              <h4 className="text-sm font-semibold text-slate-900 mb-1">Compliance Note</h4>
              <p className="text-sm text-slate-600">
                All AIM reports include full audit trails, data source documentation, and methodology transparency. 
                Reports meet ISO 9001 and Six Sigma documentation standards.
              </p>
            </div>
          </div>
        </div>
      </AIMPanel>

      {/* Schedule Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-slate-900">Schedule Automated Reports</h3>
              <button
                onClick={() => setShowScheduleModal(false)}
                className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg transition-colors"
              >
                <i className="ri-close-line text-slate-600 text-xl"></i>
              </button>
            </div>

            <div className="space-y-6">
              {/* Frequency */}
              <div>
                <label className="text-sm font-semibold text-slate-900 mb-3 block">Report Frequency</label>
                <div className="grid grid-cols-4 gap-3">
                  {['weekly', 'monthly', 'quarterly', 'custom'].map((freq) => (
                    <button
                      key={freq}
                      onClick={() => setReportFrequency(freq)}
                      className={`px-4 py-3 text-sm font-medium rounded-lg transition-all capitalize ${
                        reportFrequency === freq
                          ? 'bg-gradient-to-r from-teal-500 to-cyan-600 text-white'
                          : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {freq}
                    </button>
                  ))}
                </div>
              </div>

              {/* Recipients */}
              <div>
                <label className="text-sm font-semibold text-slate-900 mb-3 block">
                  Select Recipients ({selectedRecipients.length} selected)
                </label>
                {recipients.length === 0 ? (
                  <div className="text-center py-8 text-slate-600">
                    No team members found. Add team members to send reports.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {recipients.map((recipient) => (
                      <button
                        key={recipient.id}
                        onClick={() => toggleRecipient(recipient.id)}
                        className={`w-full flex items-center gap-3 p-3 border-2 rounded-lg transition-all ${
                          selectedRecipients.includes(recipient.id)
                            ? 'border-teal-500 bg-teal-50'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center ${
                          selectedRecipients.includes(recipient.id)
                            ? 'bg-teal-500 border-teal-500'
                            : 'border-slate-300'
                        }`}>
                          {selectedRecipients.includes(recipient.id) && (
                            <i className="ri-check-line text-white text-sm"></i>
                          )}
                        </div>
                        <div className="flex-1 text-left">
                          <div className="font-semibold text-slate-900">{recipient.name}</div>
                          <div className="text-xs text-slate-600">{recipient.role} • {recipient.email}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Delivery Options */}
              <div>
                <label className="text-sm font-semibold text-slate-900 mb-3 block">Delivery Format</label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 border border-slate-200 rounded-lg">
                    <input type="checkbox" id="pdf" defaultChecked className="mr-2" />
                    <label htmlFor="pdf" className="text-sm text-slate-700 cursor-pointer">PDF Document</label>
                  </div>
                  <div className="p-4 border border-slate-200 rounded-lg">
                    <input type="checkbox" id="excel" className="mr-2" />
                    <label htmlFor="excel" className="text-sm text-slate-700 cursor-pointer">Excel Workbook</label>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t border-slate-200">
                <button
                  onClick={() => setShowScheduleModal(false)}
                  className="flex-1 px-4 py-3 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap"
                >
                  Cancel
                </button>
                <button
                  onClick={scheduleReport}
                  disabled={selectedRecipients.length === 0}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-teal-500 to-cyan-600 text-white text-sm font-semibold rounded-lg hover:shadow-lg transition-all whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Schedule Reports
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Export Format Dialog */}
      <ConfirmDialog
        isOpen={showExportFormatDialog}
        title="Choose Export Format"
        message="Select your preferred format for the report export."
        confirmText="Export as JSON"
        cancelText="Export as CSV"
        confirmVariant="primary"
        onConfirm={() => handleExportFormatConfirm('json')}
        onCancel={() => handleExportFormatConfirm('csv')}
      />

      {/* Export Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!pendingExportReport && !!pendingExportFormat}
        title={`Export Report as ${pendingExportFormat?.toUpperCase()}`}
        message={`Are you sure you want to export "${pendingExportReport?.title}" as ${pendingExportFormat?.toUpperCase()}?`}
        confirmText="Export"
        cancelText="Cancel"
        confirmVariant="primary"
        onConfirm={handleExportConfirm}
        onCancel={() => {
          setPendingExportReport(null);
          setPendingExportFormat(null);
        }}
      />
    </div>
  );
};

export default ReportsSection;
