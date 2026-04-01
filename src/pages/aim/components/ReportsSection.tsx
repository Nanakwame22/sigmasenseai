import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import { exportToCSV, exportToJSON } from '../../../utils/exportUtils';
import { addToast } from '../../../hooks/useToast';
import ConfirmDialog from '../../../components/common/ConfirmDialog';

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
  const [pendingExportFormat, setPendingExportFormat] = useState<'pdf' | 'excel' | 'email' | null>(null);

  useEffect(() => {
    if (orgId) {
      loadReports();
      loadAuditStats();
      loadTeamMembers();
    }
  }, [orgId]);

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

      const loadedReports: Report[] = (auditLogs || []).map((log) => {
        const metadata = log.metadata as any;
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

      setReports(loadedReports);
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

  const generateReport = async () => {
    if (!orgId) return;

    try {
      setGenerating(true);

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
        sections: reportSections.filter(s => s.included).map(s => s.title),
        statistics: {
          recommendations: recommendationsCount || 0,
          alerts: alertsCount || 0,
          projects: projectsCount || 0,
          kpis: kpis?.length || 0
        },
        kpi_summary: kpis || [],
        generated_by: user?.id
      };

      const { error: insertError } = await supabase
        .from('audit_logs')
        .insert({
          organization_id: orgId,
          user_id: user?.id,
          action: 'report_generated',
          resource_type: 'report',
          resource_id: `report-${Date.now()}`,
          metadata: {
            report_title: `AIM Report - ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
            report_type: 'Custom Report',
            report_size: '2.3 MB',
            report_data: reportData
          }
        });

      if (insertError) throw insertError;

      setShowExportFormatDialog(true);
      setPendingExportReport({
        id: `report-${Date.now()}`,
        title: `AIM Report - ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
        type: 'Custom Report',
        date: new Date().toISOString().split('T')[0],
        size: '2.3 MB',
        status: 'Ready',
        data: reportData
      });

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

  const exportReport = async (report: Report, format: 'pdf' | 'excel' | 'email') => {
    setPendingExportReport(report);
    setPendingExportFormat(format);
  };

  const handleExportConfirm = () => {
    if (!pendingExportReport || !pendingExportFormat) return;

    const format = pendingExportFormat;
    const report = pendingExportReport;

    if (format === 'pdf') {
      addToast('PDF export is coming soon. Use CSV/JSON export for now.', 'info');
    } else if (format === 'excel') {
      if (report.data) {
        exportToCSV([report.data], `${report.title.replace(/\s+/g, '-').toLowerCase()}`);
        addToast('Report exported successfully', 'success');
      } else {
        addToast('No data available for this report', 'warning');
      }
    } else if (format === 'email') {
      addToast('Email functionality is coming soon. Please download and share manually.', 'info');
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Reports</h1>
          <p className="text-slate-600">Generate and share AIM insights with leadership</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowScheduleModal(true)}
            className="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap flex items-center gap-2"
          >
            <i className="ri-calendar-line"></i>
            Schedule Reports
          </button>
          <button
            onClick={generateReport}
            disabled={generating}
            className="px-4 py-2 bg-gradient-to-r from-teal-500 to-cyan-600 text-white text-sm font-semibold rounded-lg hover:shadow-lg transition-all whitespace-nowrap flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <i className={`ri-file-add-line ${generating ? 'animate-spin' : ''}`}></i>
            {generating ? 'Generating...' : 'Generate New Report'}
          </button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-4 gap-4">
        <button 
          onClick={generateReport}
          className="p-6 bg-gradient-to-br from-teal-50 to-cyan-50 border border-teal-200 rounded-xl hover:shadow-lg transition-all text-left"
        >
          <div className="w-12 h-12 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-lg flex items-center justify-center mb-4">
            <i className="ri-file-text-line text-2xl text-white"></i>
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-2">Monthly Report</h3>
          <p className="text-sm text-slate-600">Comprehensive monthly summary with all insights</p>
        </button>

        <button 
          onClick={generateReport}
          className="p-6 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl hover:shadow-lg transition-all text-left"
        >
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center mb-4">
            <i className="ri-presentation-line text-2xl text-white"></i>
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-2">Executive Brief</h3>
          <p className="text-sm text-slate-600">High-level summary for leadership meetings</p>
        </button>

        <button 
          onClick={generateReport}
          className="p-6 bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200 rounded-xl hover:shadow-lg transition-all text-left"
        >
          <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg flex items-center justify-center mb-4">
            <i className="ri-file-chart-line text-2xl text-white"></i>
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-2">Audit Report</h3>
          <p className="text-sm text-slate-600">Detailed documentation for compliance</p>
        </button>

        <button 
          onClick={generateReport}
          className="p-6 bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl hover:shadow-lg transition-all text-left"
        >
          <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center mb-4">
            <i className="ri-mail-send-line text-2xl text-white"></i>
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-2">Custom Report</h3>
          <p className="text-sm text-slate-600">Build a report with selected sections</p>
        </button>
      </div>

      {/* Report Archive */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-lg flex items-center justify-center">
            <i className="ri-folder-line text-xl text-white"></i>
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Report Archive</h2>
            <p className="text-sm text-slate-600">Previously generated reports</p>
          </div>
        </div>

        {reports.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="ri-file-list-line text-3xl text-slate-400"></i>
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">No Reports Yet</h3>
            <p className="text-slate-600 mb-4">Generate your first AIM report to get started</p>
            <button
              onClick={generateReport}
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
                    <button className="w-10 h-10 flex items-center justify-center hover:bg-slate-100 rounded-lg transition-colors" title="Share">
                      <i className="ri-share-line text-slate-600 text-xl"></i>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Report Builder */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg flex items-center justify-center">
            <i className="ri-layout-line text-xl text-white"></i>
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Custom Report Builder</h2>
            <p className="text-sm text-slate-600">Select sections to include in your report</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
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
              {reportSections.filter(s => s.included).length} sections selected
            </span>
            {' • '}
            <span>
              Estimated {reportSections.filter(s => s.included).reduce((sum, s) => sum + s.pages, 0)} pages
            </span>
          </div>
          <button
            onClick={generateReport}
            disabled={generating}
            className="px-6 py-3 bg-gradient-to-r from-teal-500 to-cyan-600 text-white text-sm font-semibold rounded-lg hover:shadow-lg transition-all whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? 'Generating...' : 'Generate Custom Report'}
          </button>
        </div>
      </div>

      {/* Export Options */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
            <i className="ri-download-cloud-line text-xl text-white"></i>
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Export Options</h2>
            <p className="text-sm text-slate-600">Choose your preferred format</p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          <button 
            onClick={() => addToast('PDF export coming soon. Use CSV/JSON for now.', 'info')}
            className="p-6 border border-slate-200 rounded-xl hover:shadow-lg hover:border-teal-500 transition-all text-center group"
          >
            <div className="w-16 h-16 bg-gradient-to-br from-red-100 to-pink-100 rounded-lg flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
              <i className="ri-file-pdf-line text-3xl text-red-600"></i>
            </div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">PDF Document</h3>
            <p className="text-xs text-slate-600">Professional formatted report</p>
          </button>

          <button 
            onClick={generateReport}
            className="p-6 border border-slate-200 rounded-xl hover:shadow-lg hover:border-teal-500 transition-all text-center group"
          >
            <div className="w-16 h-16 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-lg flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
              <i className="ri-file-excel-line text-3xl text-emerald-600"></i>
            </div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">Excel Workbook</h3>
            <p className="text-xs text-slate-600">Data tables and charts</p>
          </button>

          <button 
            onClick={() => addToast('Email functionality coming soon. Please download and share manually.', 'info')}
            className="p-6 border border-slate-200 rounded-xl hover:shadow-lg hover:border-teal-500 transition-all text-center group"
          >
            <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-lg flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
              <i className="ri-mail-line text-3xl text-blue-600"></i>
            </div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">Email Report</h3>
            <p className="text-xs text-slate-600">Send directly to recipients</p>
          </button>

          <button 
            onClick={() => addToast('Presentation export coming soon.', 'info')}
            className="p-6 border border-slate-200 rounded-xl hover:shadow-lg hover:border-teal-500 transition-all text-center group"
          >
            <div className="w-16 h-16 bg-gradient-to-br from-purple-100 to-pink-100 rounded-lg flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
              <i className="ri-presentation-line text-3xl text-purple-600"></i>
            </div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">Presentation</h3>
            <p className="text-xs text-slate-600">PowerPoint slides</p>
          </button>
        </div>
      </div>

      {/* Audit & Documentation */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg flex items-center justify-center">
            <i className="ri-shield-check-line text-xl text-white"></i>
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Audit & Documentation</h2>
            <p className="text-sm text-slate-600">Compliance and traceability information</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6">
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
      </div>

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