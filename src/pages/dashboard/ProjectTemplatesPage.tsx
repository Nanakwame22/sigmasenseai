import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { exportToPDF, exportToCSV, exportToExcel } from '../../utils/exportUtils';
import { useToast } from '../../hooks/useToast';

interface Template {
  id: string;
  name: string;
  category: 'DMAIC' | 'Kaizen' | 'CAPA' | 'Root Cause' | 'Process Improvement' | 'Quality';
  description: string;
  icon: string;
  color: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  duration: string;
  phases: string[];
  tools: string[];
  deliverables: string[];
  useCases: string[];
  popularity: number;
}

export default function ProjectTemplatesPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedTemplate, setSelectedTemplate] = useState<typeof templates[0] | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const templates: Template[] = [
    {
      id: '1',
      name: 'Manufacturing Defect Reduction',
      category: 'DMAIC',
      description: 'Comprehensive DMAIC project template for reducing manufacturing defects and improving quality metrics.',
      icon: 'ri-tools-line',
      color: 'from-blue-500 to-indigo-600',
      difficulty: 'Intermediate',
      duration: '8-12 weeks',
      phases: ['Define', 'Measure', 'Analyze', 'Improve', 'Control'],
      tools: ['Pareto Chart', 'Fishbone Diagram', 'Control Charts', 'Process Capability Analysis', 'FMEA'],
      deliverables: ['Project Charter', 'Process Map', 'Root Cause Analysis', 'Implementation Plan', 'Control Plan'],
      useCases: ['Reduce scrap rate', 'Improve first-pass yield', 'Decrease rework', 'Enhance product quality'],
      popularity: 95
    },
    {
      id: '2',
      name: 'Cycle Time Reduction',
      category: 'DMAIC',
      description: 'Streamline processes and reduce cycle time using proven Six Sigma methodologies.',
      icon: 'ri-timer-line',
      color: 'from-teal-500 to-green-600',
      difficulty: 'Intermediate',
      duration: '6-10 weeks',
      phases: ['Define', 'Measure', 'Analyze', 'Improve', 'Control'],
      tools: ['Value Stream Mapping', 'Spaghetti Diagram', 'Time Study', 'Bottleneck Analysis', 'Standard Work'],
      deliverables: ['Current State Map', 'Future State Map', 'Kaizen Events', 'Standard Operating Procedures'],
      useCases: ['Reduce lead time', 'Eliminate bottlenecks', 'Improve throughput', 'Optimize workflow'],
      popularity: 88
    },
    {
      id: '3',
      name: 'Quick Win Kaizen',
      category: 'Kaizen',
      description: 'Rapid improvement template for small-scale changes that deliver immediate results.',
      icon: 'ri-flashlight-line',
      color: 'from-amber-500 to-orange-600',
      difficulty: 'Beginner',
      duration: '1-2 weeks',
      phases: ['Identify', 'Plan', 'Implement', 'Verify'],
      tools: ['5S', 'Visual Management', 'Quick Changeover', 'Mistake Proofing'],
      deliverables: ['Problem Statement', 'Before/After Photos', 'Implementation Checklist', 'Results Summary'],
      useCases: ['Workplace organization', 'Setup time reduction', 'Visual controls', 'Quick fixes'],
      popularity: 92
    },
    {
      id: '4',
      name: 'Customer Complaint Resolution',
      category: 'CAPA',
      description: 'Systematic approach to investigate and resolve customer complaints with corrective and preventive actions.',
      icon: 'ri-customer-service-2-line',
      color: 'from-red-500 to-pink-600',
      difficulty: 'Intermediate',
      duration: '4-6 weeks',
      phases: ['Investigation', 'Root Cause', 'Corrective Action', 'Preventive Action', 'Verification'],
      tools: ['8D Problem Solving', '5 Whys', 'Fishbone Diagram', 'FMEA', 'Verification Plan'],
      deliverables: ['CAPA Report', 'Root Cause Analysis', 'Action Plan', 'Effectiveness Check'],
      useCases: ['Product defects', 'Service failures', 'Quality issues', 'Customer dissatisfaction'],
      popularity: 85
    },
    {
      id: '5',
      name: 'Process Capability Study',
      category: 'Quality',
      description: 'Assess and improve process capability to meet customer specifications consistently.',
      icon: 'ri-bar-chart-box-line',
      color: 'from-purple-500 to-indigo-600',
      difficulty: 'Advanced',
      duration: '4-8 weeks',
      phases: ['Planning', 'Data Collection', 'Analysis', 'Improvement', 'Validation'],
      tools: ['Cp/Cpk Analysis', 'Control Charts', 'Histogram', 'Normal Probability Plot', 'Process Mapping'],
      deliverables: ['Capability Study Report', 'Control Plan', 'Improvement Recommendations', 'Validation Results'],
      useCases: ['New process validation', 'Supplier qualification', 'Process optimization', 'Quality assurance'],
      popularity: 78
    },
    {
      id: '6',
      name: 'Cost Reduction Initiative',
      category: 'Process Improvement',
      description: 'Identify and eliminate waste to reduce operational costs while maintaining quality.',
      icon: 'ri-money-dollar-circle-line',
      color: 'from-green-500 to-teal-600',
      difficulty: 'Intermediate',
      duration: '8-12 weeks',
      phases: ['Baseline', 'Analysis', 'Ideation', 'Implementation', 'Tracking'],
      tools: ['Value Stream Mapping', 'Waste Analysis', 'Cost-Benefit Analysis', 'Pareto Chart', 'Benchmarking'],
      deliverables: ['Cost Analysis', 'Waste Identification', 'Savings Plan', 'Implementation Roadmap'],
      useCases: ['Material waste reduction', 'Energy savings', 'Labor optimization', 'Inventory reduction'],
      popularity: 90
    },
    {
      id: '7',
      name: 'Equipment Downtime Reduction',
      category: 'Root Cause',
      description: 'Systematic approach to identify and eliminate causes of equipment downtime.',
      icon: 'ri-settings-3-line',
      color: 'from-orange-500 to-red-600',
      difficulty: 'Advanced',
      duration: '10-14 weeks',
      phases: ['Data Collection', 'Pareto Analysis', 'Root Cause', 'Solution Design', 'Implementation'],
      tools: ['Pareto Analysis', 'Fishbone Diagram', 'FMEA', 'TPM', 'Reliability Analysis'],
      deliverables: ['Downtime Analysis', 'Root Cause Report', 'Maintenance Plan', 'Training Materials'],
      useCases: ['Machine breakdowns', 'Planned maintenance', 'Reliability improvement', 'OEE enhancement'],
      popularity: 82
    },
    {
      id: '8',
      name: 'New Product Launch',
      category: 'DMAIC',
      description: 'Structured approach to launch new products with quality and efficiency from day one.',
      icon: 'ri-rocket-line',
      color: 'from-cyan-500 to-blue-600',
      difficulty: 'Advanced',
      duration: '12-16 weeks',
      phases: ['Planning', 'Design', 'Validation', 'Launch', 'Stabilization'],
      tools: ['DFSS', 'QFD', 'FMEA', 'DOE', 'Control Plan'],
      deliverables: ['Product Requirements', 'Design Validation', 'Process Validation', 'Launch Plan'],
      useCases: ['New product introduction', 'Product redesign', 'Process transfer', 'Market expansion'],
      popularity: 75
    },
    {
      id: '9',
      name: 'Supplier Quality Improvement',
      category: 'Quality',
      description: 'Collaborate with suppliers to improve incoming material quality and reduce defects.',
      icon: 'ri-truck-line',
      color: 'from-indigo-500 to-purple-600',
      difficulty: 'Intermediate',
      duration: '8-12 weeks',
      phases: ['Assessment', 'Gap Analysis', 'Improvement Plan', 'Implementation', 'Monitoring'],
      tools: ['Supplier Scorecard', 'Audit Checklist', 'PPAP', 'SPC', 'Corrective Action'],
      deliverables: ['Supplier Assessment', 'Improvement Plan', 'Quality Agreement', 'Performance Metrics'],
      useCases: ['Incoming quality issues', 'Supplier development', 'Cost of quality reduction', 'Partnership building'],
      popularity: 80
    },
    {
      id: '10',
      name: 'Employee Safety Enhancement',
      category: 'Kaizen',
      description: 'Improve workplace safety through systematic hazard identification and risk mitigation.',
      icon: 'ri-shield-check-line',
      color: 'from-yellow-500 to-orange-600',
      difficulty: 'Beginner',
      duration: '4-6 weeks',
      phases: ['Risk Assessment', 'Hazard Identification', 'Control Measures', 'Training', 'Monitoring'],
      tools: ['Risk Matrix', 'Job Safety Analysis', 'Visual Controls', 'Standard Work', 'Audits'],
      deliverables: ['Risk Assessment', 'Safety Procedures', 'Training Plan', 'Audit Schedule'],
      useCases: ['Accident reduction', 'Ergonomic improvements', 'PPE compliance', 'Safety culture'],
      popularity: 87
    },
    {
      id: '11',
      name: 'Inventory Optimization',
      category: 'Process Improvement',
      description: 'Reduce inventory levels while maintaining service levels through lean principles.',
      icon: 'ri-archive-line',
      color: 'from-emerald-500 to-green-600',
      difficulty: 'Intermediate',
      duration: '6-10 weeks',
      phases: ['Current State', 'Analysis', 'Optimization', 'Implementation', 'Sustain'],
      tools: ['ABC Analysis', 'Kanban', 'Min-Max Levels', 'Demand Forecasting', 'Pull Systems'],
      deliverables: ['Inventory Analysis', 'Optimization Plan', 'Replenishment System', 'Performance Metrics'],
      useCases: ['Excess inventory', 'Stockouts', 'Working capital reduction', 'Space optimization'],
      popularity: 84
    },
    {
      id: '12',
      name: 'Customer Service Excellence',
      category: 'Process Improvement',
      description: 'Enhance customer satisfaction through process improvements and service quality.',
      icon: 'ri-star-smile-line',
      color: 'from-pink-500 to-rose-600',
      difficulty: 'Beginner',
      duration: '6-8 weeks',
      phases: ['Voice of Customer', 'Gap Analysis', 'Process Design', 'Implementation', 'Measurement'],
      tools: ['Customer Surveys', 'Journey Mapping', 'Service Blueprint', 'Kano Model', 'NPS'],
      deliverables: ['Customer Requirements', 'Service Standards', 'Training Materials', 'Feedback System'],
      useCases: ['Response time improvement', 'First contact resolution', 'Customer satisfaction', 'Loyalty building'],
      popularity: 89
    }
  ];

  const categories = ['All', 'DMAIC', 'Kaizen', 'CAPA', 'Root Cause', 'Process Improvement', 'Quality'];
  const difficulties = ['All', 'Beginner', 'Intermediate', 'Advanced'];

  const filteredTemplates = templates.filter(template => {
    const matchesSearch = template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         template.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         template.useCases.some(uc => uc.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = selectedCategory === 'All' || template.category === selectedCategory;
    const matchesDifficulty = selectedDifficulty === 'All' || template.difficulty === selectedDifficulty;
    return matchesSearch && matchesCategory && matchesDifficulty;
  });

  const handleUseTemplate = (template: Template) => {
    if (template.category === 'DMAIC') {
      navigate('/dashboard/dmaic');
      showToast(`Starting new DMAIC project from template: ${template.name}`, 'success');
    } else if (template.category === 'Kaizen' || template.category === 'CAPA') {
      navigate('/dashboard/kaizen');
      showToast(`Starting new ${template.category} project from template: ${template.name}`, 'success');
    } else if (template.category === 'Root Cause') {
      navigate('/dashboard/root-cause');
      showToast(`Starting new Root Cause analysis from template: ${template.name}`, 'success');
    } else {
      showToast(`Starting new project from template: ${template.name}`, 'info');
    }
  };

  const handleExportPDF = () => {
    exportToPDF(
      'Project Templates Catalog',
      filteredTemplates,
      [
        { header: 'Template Name', dataKey: 'name' },
        { header: 'Category', dataKey: 'category' },
        { header: 'Difficulty', dataKey: 'difficulty' },
        { header: 'Duration', dataKey: 'duration' },
        { header: 'Popularity', dataKey: 'popularity' },
      ],
      {
        orientation: 'landscape',
        includeDate: true,
        includeStats: [
          { label: 'Total Templates', value: filteredTemplates.length.toString() },
          { label: 'Categories', value: new Set(filteredTemplates.map(t => t.category)).size.toString() },
          { label: 'Average Popularity', value: Math.round(filteredTemplates.reduce((sum, t) => sum + t.popularity, 0) / filteredTemplates.length).toString() + '%' },
        ]
      }
    );
  };

  const handleExportCSV = () => {
    const exportData = filteredTemplates.map(template => ({
      name: template.name,
      category: template.category,
      difficulty: template.difficulty,
      duration: template.duration,
      popularity: template.popularity,
      description: template.description,
      phases: template.phases.join(', '),
      tools: template.tools.join(', '),
      deliverables: template.deliverables.join(', '),
      use_cases: template.useCases.join(', '),
    }));
    exportToCSV(exportData, 'project_templates');
  };

  const handleExportExcel = () => {
    const exportData = filteredTemplates.map(template => ({
      name: template.name,
      category: template.category,
      difficulty: template.difficulty,
      duration: template.duration,
      popularity: template.popularity,
      description: template.description,
      phases: template.phases.join(', '),
      tools: template.tools.join(', '),
      deliverables: template.deliverables.join(', '),
      use_cases: template.useCases.join(', '),
    }));

    exportToExcel(
      exportData,
      'Project_Templates',
      'Templates Catalog',
      {
        includeStats: [
          { label: 'Total Templates', value: filteredTemplates.length.toString() },
          { label: 'Categories', value: new Set(filteredTemplates.map(t => t.category)).size.toString() },
          { label: 'Average Popularity', value: Math.round(filteredTemplates.reduce((sum, t) => sum + t.popularity, 0) / filteredTemplates.length).toString() + '%' },
        ],
        columns: ['name', 'category', 'difficulty', 'duration', 'popularity', 'description']
      }
    );
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'Beginner': return 'bg-green-100 text-green-700';
      case 'Intermediate': return 'bg-yellow-100 text-yellow-700';
      case 'Advanced': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50/30">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Project Templates</h1>
              <p className="text-base text-gray-600 mt-2">Choose a template to kickstart your analytics project</p>
            </div>
            <div className="flex items-center gap-3">
              {/* Export Buttons */}
              {filteredTemplates.length > 0 && (
                <>
                  <button
                    onClick={handleExportPDF}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 whitespace-nowrap"
                    title="Export to PDF"
                  >
                    <i className="ri-file-pdf-line"></i>
                    <span className="hidden sm:inline">PDF</span>
                  </button>
                  <button
                    onClick={handleExportCSV}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 whitespace-nowrap"
                    title="Export to CSV"
                  >
                    <i className="ri-file-excel-line"></i>
                    <span className="hidden sm:inline">CSV</span>
                  </button>
                  <button
                    onClick={handleExportExcel}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 whitespace-nowrap"
                    title="Export to Excel"
                  >
                    <i className="ri-file-excel-2-line"></i>
                    <span className="hidden sm:inline">Excel</span>
                  </button>
                </>
              )}
              <button className="px-6 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium text-base whitespace-nowrap">
                <i className="ri-add-line mr-2"></i>
                Create Custom Template
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-8 py-8">
        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-4">
            <div className="flex-1 relative">
              <i className="ri-search-line absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg"></i>
              <input
                type="text"
                placeholder="Search templates, use cases, or tools..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>

            <div className="flex items-center gap-3">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-4 py-3 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer bg-white min-w-[150px]"
              >
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>

              <select
                value={selectedDifficulty}
                onChange={(e) => setSelectedDifficulty(e.target.value)}
                className="px-4 py-3 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer bg-white min-w-[150px]"
              >
                {difficulties.map(diff => (
                  <option key={diff} value={diff}>{diff}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Templates Grid */}
        {filteredTemplates.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <i className="ri-file-search-line text-5xl text-gray-400"></i>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">No templates found</h3>
            <p className="text-base text-gray-600 mb-6 max-w-md mx-auto">
              Try adjusting your filters or search query to find what you're looking for
            </p>
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('All');
                setSelectedDifficulty('All');
              }}
              className="px-6 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors cursor-pointer whitespace-nowrap text-base font-semibold shadow-sm hover:shadow-md"
            >
              Clear all filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredTemplates.map((template) => (
              <div
                key={template.id}
                className="bg-white rounded-xl border border-gray-200 hover:border-teal-400 hover:shadow-xl transition-all duration-300 overflow-hidden group"
              >
                <div className={`h-32 bg-gradient-to-br ${template.color} p-6 flex items-center justify-center relative overflow-hidden`}>
                  <i className={`${template.icon} text-5xl text-white opacity-90`}></i>
                  <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-white/20 backdrop-blur-sm px-3 py-1.5 rounded-full">
                    <i className="ri-fire-line text-sm text-white"></i>
                    <span className="text-sm font-bold text-white">{template.popularity}%</span>
                  </div>
                </div>

                <div className="p-5 space-y-4">
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <h3 className="font-bold text-base text-gray-900 line-clamp-2 flex-1">
                        {template.name}
                      </h3>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${getDifficultyColor(template.difficulty)}`}>
                        {template.difficulty}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 line-clamp-2 leading-relaxed">
                      {template.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <div className="flex items-center gap-1.5">
                      <i className="ri-time-line"></i>
                      <span>{template.duration}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <i className="ri-folder-line"></i>
                      <span>{template.category}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-3 border-t border-gray-100">
                    <button
                      onClick={() => handleUseTemplate(template)}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors cursor-pointer shadow-sm hover:shadow-md"
                    >
                      <i className="ri-play-line text-base"></i>
                      <span className="text-sm font-semibold whitespace-nowrap">Use Template</span>
                    </button>
                    <button
                      onClick={() => {
                        setSelectedTemplate(template);
                        setShowPreview(true);
                      }}
                      className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                    >
                      <i className="ri-eye-line text-base"></i>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showPreview && selectedTemplate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-6">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className={`bg-gradient-to-br ${selectedTemplate.color} p-8 text-white`}>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-5">
                  <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center flex-shrink-0">
                    <i className={`${selectedTemplate.icon} text-3xl`}></i>
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold mb-2">{selectedTemplate.name}</h2>
                    <p className="text-base opacity-90 leading-relaxed">{selectedTemplate.description}</p>
                    <div className="flex items-center gap-3 mt-4">
                      <span className="px-3 py-1.5 bg-white/20 backdrop-blur-sm rounded-full text-sm font-semibold">
                        {selectedTemplate.category}
                      </span>
                      <span className="px-3 py-1.5 bg-white/20 backdrop-blur-sm rounded-full text-sm font-semibold">
                        {selectedTemplate.difficulty}
                      </span>
                      <span className="px-3 py-1.5 bg-white/20 backdrop-blur-sm rounded-full text-sm font-semibold">
                        {selectedTemplate.duration}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setShowPreview(false)}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors cursor-pointer"
                >
                  <i className="ri-close-line text-2xl"></i>
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-8 space-y-8">
              {/* Phases */}
              <div>
                <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <i className="ri-flow-chart text-teal-600 text-xl"></i>
                  <span>Project Phases</span>
                </h3>
                <div className="flex items-center gap-3">
                  {selectedTemplate.phases.map((phase, index) => (
                    <div key={phase} className="flex items-center flex-1">
                      <div className="flex-1 bg-teal-50 border border-teal-200 text-teal-700 px-4 py-3 rounded-lg text-center">
                        <p className="text-sm font-semibold">{phase}</p>
                      </div>
                      {index < selectedTemplate.phases.length - 1 && (
                        <i className="ri-arrow-right-line text-gray-400 mx-2 text-xl"></i>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Tools */}
              <div>
                <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <i className="ri-tools-line text-teal-600 text-xl"></i>
                  <span>Tools & Techniques</span>
                </h3>
                <div className="flex flex-wrap gap-3">
                  {selectedTemplate.tools.map((tool) => (
                    <span key={tool} className="px-4 py-2 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-sm font-medium">
                      {tool}
                    </span>
                  ))}
                </div>
              </div>

              {/* Deliverables */}
              <div>
                <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <i className="ri-file-list-3-line text-teal-600 text-xl"></i>
                  <span>Key Deliverables</span>
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {selectedTemplate.deliverables.map((deliverable) => (
                    <div key={deliverable} className="flex items-center gap-3 text-sm text-gray-700 bg-gray-50 px-4 py-3 rounded-lg">
                      <i className="ri-checkbox-circle-fill text-teal-600 text-lg"></i>
                      <span className="font-medium">{deliverable}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Use Cases */}
              <div>
                <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <i className="ri-lightbulb-line text-teal-600 text-xl"></i>
                  <span>Common Use Cases</span>
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {selectedTemplate.useCases.map((useCase) => (
                    <div key={useCase} className="flex items-center gap-3 text-sm text-gray-700 bg-amber-50 border border-amber-200 px-4 py-3 rounded-lg">
                      <i className="ri-arrow-right-s-line text-amber-600 text-lg"></i>
                      <span className="font-medium">{useCase}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="border-t border-gray-200 p-6 flex items-center justify-between bg-gray-50">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <i className="ri-fire-line text-amber-500 text-lg"></i>
                <span className="font-medium">{selectedTemplate.popularity}% of users find this template helpful</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowPreview(false)}
                  className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-white transition-colors cursor-pointer whitespace-nowrap text-base font-medium"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    setShowPreview(false);
                    handleUseTemplate(selectedTemplate);
                  }}
                  className="px-6 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors cursor-pointer whitespace-nowrap text-base font-semibold flex items-center gap-2 shadow-sm hover:shadow-md"
                >
                  <i className="ri-play-line text-base"></i>
                  Use This Template
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
