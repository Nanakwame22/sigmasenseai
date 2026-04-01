import { useState } from 'react';

export default function HealthcareExample() {
  return (
    <div className="max-w-6xl mx-auto p-8 bg-white">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Healthcare Example: Emergency Department Wait Times
        </h1>
        <p className="text-gray-600">
          Real-world application of DMAIC Measure Phase in a hospital setting
        </p>
      </div>

      {/* Scenario Overview */}
      <div className="bg-blue-50 border-l-4 border-blue-500 p-6 mb-8">
        <h2 className="text-xl font-bold text-blue-900 mb-3">
          <i className="ri-hospital-line mr-2"></i>
          Scenario: Reducing Emergency Department Wait Times
        </h2>
        <div className="text-gray-700 space-y-2">
          <p><strong>Hospital:</strong> Metropolitan General Hospital</p>
          <p><strong>Problem:</strong> Patients waiting 4+ hours in ED before seeing a physician</p>
          <p><strong>Goal:</strong> Reduce average wait time to under 2 hours</p>
          <p><strong>Impact:</strong> Patient satisfaction, clinical outcomes, regulatory compliance</p>
        </div>
      </div>

      {/* Step-by-Step Workflow */}
      <div className="space-y-8">
        
        {/* Step 1: Data Collection Setup */}
        <div className="border border-gray-200 rounded-lg p-6">
          <div className="flex items-start mb-4">
            <div className="w-10 h-10 bg-teal-500 text-white rounded-full flex items-center justify-center font-bold mr-4 flex-shrink-0">
              1
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-gray-900 mb-3">Data Collection Setup</h3>
              
              <div className="bg-gray-50 p-4 rounded-lg space-y-3">
                <div>
                  <span className="font-semibold text-gray-700">Data Source:</span>
                  <span className="text-gray-600 ml-2">Electronic Health Record (EHR) system - Epic</span>
                </div>
                <div>
                  <span className="font-semibold text-gray-700">Collection Method:</span>
                  <span className="text-gray-600 ml-2">Automated timestamp extraction from patient tracking system</span>
                </div>
                <div>
                  <span className="font-semibold text-gray-700">Sample Size:</span>
                  <span className="text-gray-600 ml-2">2,847 patient visits</span>
                </div>
                <div>
                  <span className="font-semibold text-gray-700">Collection Frequency:</span>
                  <span className="text-gray-600 ml-2">Continuous (every patient visit)</span>
                </div>
                <div>
                  <span className="font-semibold text-gray-700">Measurement Period:</span>
                  <span className="text-gray-600 ml-2">January 1 - March 31, 2024 (90 days)</span>
                </div>
              </div>

              <div className="mt-4 bg-blue-50 p-4 rounded-lg">
                <p className="text-sm text-blue-900">
                  <i className="ri-lightbulb-line mr-2"></i>
                  <strong>Purpose:</strong> Creates audit trail for Joint Commission compliance and ensures reproducibility
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Step 2: Data Import */}
        <div className="border border-gray-200 rounded-lg p-6">
          <div className="flex items-start mb-4">
            <div className="w-10 h-10 bg-teal-500 text-white rounded-full flex items-center justify-center font-bold mr-4 flex-shrink-0">
              2
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-gray-900 mb-3">Data Import</h3>
              
              <div className="bg-gray-50 p-4 rounded-lg mb-4">
                <p className="font-semibold text-gray-700 mb-2">Sample CSV Format:</p>
                <div className="bg-white p-3 rounded border border-gray-300 font-mono text-sm overflow-x-auto">
                  <div>Date,Shift,Wait_Time_Minutes,Triage_Level,Physician_Available,Nurse_Ratio</div>
                  <div>2024-01-01,Day,145,3,Yes,1:4</div>
                  <div>2024-01-01,Day,238,2,No,1:5</div>
                  <div>2024-01-01,Evening,312,4,Yes,1:6</div>
                  <div>2024-01-02,Night,189,3,Yes,1:4</div>
                  <div>2024-01-02,Day,267,2,No,1:5</div>
                </div>
              </div>

              <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4">
                <p className="text-sm text-yellow-900">
                  <i className="ri-information-line mr-2"></i>
                  <strong>What Happens:</strong> System reads 2,847 rows, identifies 'Wait_Time_Minutes' as primary metric, parses all timestamps and categorical data
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Step 3: Baseline Metrics */}
        <div className="border border-gray-200 rounded-lg p-6">
          <div className="flex items-start mb-4">
            <div className="w-10 h-10 bg-teal-500 text-white rounded-full flex items-center justify-center font-bold mr-4 flex-shrink-0">
              3
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-gray-900 mb-3">Baseline Metrics Calculation</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-4 rounded-lg">
                  <div className="text-sm opacity-90 mb-1">Mean</div>
                  <div className="text-3xl font-bold">187 min</div>
                  <div className="text-xs mt-2 opacity-80">Average wait time across all visits</div>
                </div>
                <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white p-4 rounded-lg">
                  <div className="text-sm opacity-90 mb-1">Median</div>
                  <div className="text-3xl font-bold">165 min</div>
                  <div className="text-xs mt-2 opacity-80">Typical patient experience</div>
                </div>
                <div className="bg-gradient-to-br from-orange-500 to-orange-600 text-white p-4 rounded-lg">
                  <div className="text-sm opacity-90 mb-1">Std Dev</div>
                  <div className="text-3xl font-bold">78 min</div>
                  <div className="text-xs mt-2 opacity-80">High variation indicates inconsistency</div>
                </div>
                <div className="bg-gradient-to-br from-green-500 to-green-600 text-white p-4 rounded-lg">
                  <div className="text-sm opacity-90 mb-1">Minimum</div>
                  <div className="text-3xl font-bold">45 min</div>
                  <div className="text-xs mt-2 opacity-80">Best case scenario</div>
                </div>
                <div className="bg-gradient-to-br from-red-500 to-red-600 text-white p-4 rounded-lg">
                  <div className="text-sm opacity-90 mb-1">Maximum</div>
                  <div className="text-3xl font-bold">425 min</div>
                  <div className="text-xs mt-2 opacity-80">Worst case - over 7 hours!</div>
                </div>
                <div className="bg-gradient-to-br from-pink-500 to-pink-600 text-white p-4 rounded-lg">
                  <div className="text-sm opacity-90 mb-1">Range</div>
                  <div className="text-3xl font-bold">380 min</div>
                  <div className="text-xs mt-2 opacity-80">Massive spread in performance</div>
                </div>
              </div>

              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="text-sm text-blue-900 mb-2">
                  <strong>Clinical Interpretation:</strong>
                </p>
                <ul className="text-sm text-blue-800 space-y-1 ml-4">
                  <li>• Mean of 187 min (3.1 hours) exceeds national benchmark of 120 min</li>
                  <li>• Median lower than mean suggests some extreme outliers pulling average up</li>
                  <li>• High std dev (78 min) indicates unpredictable patient experience</li>
                  <li>• Maximum of 425 min represents serious patient safety and satisfaction risk</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Step 4: Process Capability */}
        <div className="border border-gray-200 rounded-lg p-6">
          <div className="flex items-start mb-4">
            <div className="w-10 h-10 bg-teal-500 text-white rounded-full flex items-center justify-center font-bold mr-4 flex-shrink-0">
              4
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-gray-900 mb-3">Process Capability Analysis</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 text-white p-6 rounded-lg">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-lg font-semibold">Sigma Level</span>
                    <i className="ri-line-chart-line text-3xl opacity-80"></i>
                  </div>
                  <div className="text-5xl font-bold mb-2">2.8σ</div>
                  <div className="w-full bg-white/20 rounded-full h-3 mb-3">
                    <div className="bg-white rounded-full h-3" style={{width: '47%'}}></div>
                  </div>
                  <div className="text-sm opacity-90">Below 3σ - Needs Significant Improvement</div>
                </div>

                <div className="bg-gradient-to-br from-red-500 to-red-600 text-white p-6 rounded-lg">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-lg font-semibold">Defect Rate</span>
                    <i className="ri-alert-line text-3xl opacity-80"></i>
                  </div>
                  <div className="text-5xl font-bold mb-2">23.4%</div>
                  <div className="w-full bg-white/20 rounded-full h-3 mb-3">
                    <div className="bg-white rounded-full h-3" style={{width: '100%'}}></div>
                  </div>
                  <div className="text-sm opacity-90">High - Immediate Action Required</div>
                </div>
              </div>

              <div className="bg-red-50 border-l-4 border-red-500 p-4">
                <p className="text-sm text-red-900 mb-2">
                  <strong>Critical Finding:</strong>
                </p>
                <p className="text-sm text-red-800">
                  23.4% of patients (667 out of 2,847) waited longer than 421 minutes (UCL = Mean + 3σ = 187 + 234). 
                  This represents a serious quality and safety issue requiring immediate intervention.
                </p>
              </div>

              <div className="mt-4 bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-700 mb-2"><strong>Calculation Details:</strong></p>
                <ul className="text-sm text-gray-600 space-y-1 ml-4">
                  <li>• UCL = 187 + (3 × 78) = 421 minutes</li>
                  <li>• LCL = 187 - (3 × 78) = -47 minutes (set to 0 for wait times)</li>
                  <li>• 667 patients exceeded 421 minutes</li>
                  <li>• Defect Rate = (667 ÷ 2,847) × 100 = 23.4%</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Step 5: Advanced Analytics */}
        <div className="border border-gray-200 rounded-lg p-6">
          <div className="flex items-start mb-4">
            <div className="w-10 h-10 bg-teal-500 text-white rounded-full flex items-center justify-center font-bold mr-4 flex-shrink-0">
              5
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-gray-900 mb-4">Advanced Analytics</h3>
              
              {/* Control Chart */}
              <div className="mb-6">
                <h4 className="font-semibold text-gray-800 mb-3 flex items-center">
                  <i className="ri-line-chart-line mr-2 text-teal-600"></i>
                  Control Chart Analysis
                </h4>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Upper Control Limit (UCL):</span>
                      <span className="font-semibold text-red-600">421 minutes</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Center Line (Mean):</span>
                      <span className="font-semibold text-blue-600">187 minutes</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Lower Control Limit (LCL):</span>
                      <span className="font-semibold text-green-600">0 minutes</span>
                    </div>
                  </div>
                  <div className="mt-4 bg-yellow-50 border-l-4 border-yellow-500 p-3">
                    <p className="text-sm text-yellow-900">
                      <strong>Finding:</strong> 47 data points outside UCL detected. Process is OUT OF CONTROL. 
                      Special causes identified on weekends and during shift changes (3pm-5pm).
                    </p>
                  </div>
                </div>
              </div>

              {/* Variation by Shift */}
              <div className="mb-6">
                <h4 className="font-semibold text-gray-800 mb-3 flex items-center">
                  <i className="ri-time-line mr-2 text-teal-600"></i>
                  Variation by Shift Analysis
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
                    <div className="font-semibold text-green-900 mb-3">Day Shift (7am-3pm)</div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Mean:</span>
                        <span className="font-semibold">142 min</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Std Dev:</span>
                        <span className="font-semibold">52 min</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Range:</span>
                        <span className="font-semibold">45-298 min</span>
                      </div>
                    </div>
                    <div className="mt-3 text-xs text-green-800 bg-green-100 p-2 rounded">
                      ✓ Best performing shift - adequate staffing
                    </div>
                  </div>

                  <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
                    <div className="font-semibold text-yellow-900 mb-3">Evening Shift (3pm-11pm)</div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Mean:</span>
                        <span className="font-semibold">198 min</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Std Dev:</span>
                        <span className="font-semibold">71 min</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Range:</span>
                        <span className="font-semibold">67-387 min</span>
                      </div>
                    </div>
                    <div className="mt-3 text-xs text-yellow-800 bg-yellow-100 p-2 rounded">
                      ⚠ Moderate - high patient volume overlap
                    </div>
                  </div>

                  <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
                    <div className="font-semibold text-red-900 mb-3">Night Shift (11pm-7am)</div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Mean:</span>
                        <span className="font-semibold">267 min</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Std Dev:</span>
                        <span className="font-semibold">98 min</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Range:</span>
                        <span className="font-semibold">89-425 min</span>
                      </div>
                    </div>
                    <div className="mt-3 text-xs text-red-800 bg-red-100 p-2 rounded">
                      ✗ Critical - reduced staffing, limited resources
                    </div>
                  </div>
                </div>
                <div className="mt-4 bg-blue-50 p-4 rounded-lg">
                  <p className="text-sm text-blue-900">
                    <strong>Key Insight:</strong> Night shift wait times are 88% longer than day shift (267 vs 142 min). 
                    This suggests staffing levels and resource availability are primary drivers of variation.
                  </p>
                </div>
              </div>

              {/* Correlation Analysis */}
              <div>
                <h4 className="font-semibold text-gray-800 mb-3 flex items-center">
                  <i className="ri-links-line mr-2 text-teal-600"></i>
                  Correlation Analysis
                </h4>
                <div className="space-y-3">
                  <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-red-900">Nurse-to-Patient Ratio ↔ Wait Time</span>
                      <span className="text-2xl font-bold text-red-700">+0.84</span>
                    </div>
                    <div className="w-full bg-red-200 rounded-full h-2 mb-2">
                      <div className="bg-red-600 rounded-full h-2" style={{width: '84%'}}></div>
                    </div>
                    <p className="text-sm text-red-800">
                      <strong>Strong Positive:</strong> As nurse ratio increases (fewer nurses per patient), 
                      wait times significantly increase. Critical staffing issue identified.
                    </p>
                  </div>

                  <div className="bg-orange-50 border-l-4 border-orange-500 p-4 rounded">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-orange-900">Physician Availability ↔ Wait Time</span>
                      <span className="text-2xl font-bold text-orange-700">-0.72</span>
                    </div>
                    <div className="w-full bg-orange-200 rounded-full h-2 mb-2">
                      <div className="bg-orange-600 rounded-full h-2" style={{width: '72%'}}></div>
                    </div>
                    <p className="text-sm text-orange-800">
                      <strong>Strong Negative:</strong> When physicians are immediately available, 
                      wait times drop significantly. Physician scheduling optimization needed.
                    </p>
                  </div>

                  <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-yellow-900">Triage Level ↔ Wait Time</span>
                      <span className="text-2xl font-bold text-yellow-700">+0.58</span>
                    </div>
                    <div className="w-full bg-yellow-200 rounded-full h-2 mb-2">
                      <div className="bg-yellow-600 rounded-full h-2" style={{width: '58%'}}></div>
                    </div>
                    <p className="text-sm text-yellow-800">
                      <strong>Moderate Positive:</strong> Lower acuity patients (Level 4-5) wait longer, 
                      suggesting triage prioritization is working but creates backlog for non-urgent cases.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Step 6: Variation Analysis */}
        <div className="border border-gray-200 rounded-lg p-6">
          <div className="flex items-start mb-4">
            <div className="w-10 h-10 bg-teal-500 text-white rounded-full flex items-center justify-center font-bold mr-4 flex-shrink-0">
              6
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-gray-900 mb-3">Variation Analysis Classification</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="bg-gray-100 border-2 border-gray-300 p-4 rounded-lg opacity-60">
                  <div className="flex items-center mb-2">
                    <i className="ri-checkbox-blank-circle-line text-2xl text-gray-400 mr-2"></i>
                    <span className="font-semibold text-gray-600">Stable (Common Cause)</span>
                  </div>
                  <p className="text-sm text-gray-500">
                    Not selected - Process shows clear special cause variation
                  </p>
                </div>

                <div className="bg-red-50 border-2 border-red-500 p-4 rounded-lg">
                  <div className="flex items-center mb-2">
                    <i className="ri-checkbox-circle-fill text-2xl text-red-600 mr-2"></i>
                    <span className="font-semibold text-red-900">Special Cause (Unstable)</span>
                  </div>
                  <p className="text-sm text-red-800">
                    Selected - Multiple special causes identified requiring investigation
                  </p>
                </div>
              </div>

              <div className="bg-red-50 border-l-4 border-red-500 p-4">
                <p className="text-sm text-red-900 mb-2"><strong>Special Causes Identified:</strong></p>
                <ul className="text-sm text-red-800 space-y-1 ml-4">
                  <li>• Night shift staffing shortages (88% longer wait times)</li>
                  <li>• Weekend physician coverage gaps</li>
                  <li>• Shift change periods (3pm-5pm) with handoff delays</li>
                  <li>• Nurse-to-patient ratio exceeding 1:5 during peak hours</li>
                  <li>• Lab turnaround delays on weekends (no stat lab coverage)</li>
                </ul>
              </div>

              <div className="mt-4 bg-blue-50 p-4 rounded-lg">
                <p className="text-sm text-blue-900">
                  <strong>Action Required:</strong> Eliminate special causes before attempting process redesign. 
                  Focus on staffing optimization, physician scheduling, and resource allocation.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Step 7: VOC to CTQ Mapping */}
        <div className="border border-gray-200 rounded-lg p-6">
          <div className="flex items-start mb-4">
            <div className="w-10 h-10 bg-teal-500 text-white rounded-full flex items-center justify-center font-bold mr-4 flex-shrink-0">
              7
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-gray-900 mb-3">VOC → CTQ → Metric Mapping</h3>
              
              <div className="space-y-4">
                <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 rounded-lg border border-blue-200">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <div className="text-xs font-semibold text-blue-600 mb-1">VOICE OF CUSTOMER</div>
                      <div className="text-sm text-gray-800">"I shouldn't have to wait hours in pain"</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-purple-600 mb-1">CRITICAL TO QUALITY</div>
                      <div className="text-sm text-gray-800">Time to Physician Assessment</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-teal-600 mb-1">METRIC</div>
                      <div className="text-sm text-gray-800">Door-to-Provider Time (minutes)</div>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-r from-green-50 to-teal-50 p-4 rounded-lg border border-green-200">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <div className="text-xs font-semibold text-green-600 mb-1">VOICE OF CUSTOMER</div>
                      <div className="text-sm text-gray-800">"I want to know what's happening"</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-teal-600 mb-1">CRITICAL TO QUALITY</div>
                      <div className="text-sm text-gray-800">Communication Frequency</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-blue-600 mb-1">METRIC</div>
                      <div className="text-sm text-gray-800">Staff Updates per Hour</div>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-r from-orange-50 to-red-50 p-4 rounded-lg border border-orange-200">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <div className="text-xs font-semibold text-orange-600 mb-1">VOICE OF CUSTOMER</div>
                      <div className="text-sm text-gray-800">"The wait is unpredictable"</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-red-600 mb-1">CRITICAL TO QUALITY</div>
                      <div className="text-sm text-gray-800">Process Consistency</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-purple-600 mb-1">METRIC</div>
                      <div className="text-sm text-gray-800">Wait Time Standard Deviation</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Step 8: Data Quality Notes */}
        <div className="border border-gray-200 rounded-lg p-6">
          <div className="flex items-start mb-4">
            <div className="w-10 h-10 bg-teal-500 text-white rounded-full flex items-center justify-center font-bold mr-4 flex-shrink-0">
              8
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-gray-900 mb-3">Data Quality Notes</h3>
              
              <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 mb-3">
                <p className="text-sm text-yellow-900 mb-2"><strong>Data Quality Issues Identified:</strong></p>
                <ul className="text-sm text-yellow-800 space-y-1 ml-4">
                  <li>• 23 records missing triage timestamps (0.8% of data) - excluded from analysis</li>
                  <li>• 7 outliers &gt;500 minutes investigated - all legitimate (complex trauma cases)</li>
                  <li>• Weekend data shows 15% fewer records - confirmed lower ED volume</li>
                  <li>• Shift change periods (3pm-5pm) have timestamp recording delays</li>
                </ul>
              </div>

              <div className="bg-green-50 border-l-4 border-green-500 p-4">
                <p className="text-sm text-green-900 mb-2"><strong>Data Validation Performed:</strong></p>
                <ul className="text-sm text-green-800 space-y-1 ml-4">
                  <li>• Cross-referenced with nurse station logs - 99.2% match rate</li>
                  <li>• Verified timestamp accuracy with IT department</li>
                  <li>• Confirmed triage level assignments with clinical staff</li>
                  <li>• Validated staffing ratios against HR scheduling system</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Step 9: Automated Insights */}
        <div className="border border-gray-200 rounded-lg p-6">
          <div className="flex items-start mb-4">
            <div className="w-10 h-10 bg-teal-500 text-white rounded-full flex items-center justify-center font-bold mr-4 flex-shrink-0">
              9
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-gray-900 mb-3">Automated Insights</h3>
              
              <div className="space-y-3">
                <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
                  <div className="flex items-start">
                    <i className="ri-alert-fill text-red-600 text-xl mr-3 mt-1"></i>
                    <div>
                      <p className="font-semibold text-red-900 mb-1">Critical: High Variation Detected</p>
                      <p className="text-sm text-red-800">
                        Standard deviation (78 min) is 42% of mean (187 min). Process is highly unstable 
                        and unpredictable. Patient experience varies dramatically.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
                  <div className="flex items-start">
                    <i className="ri-alert-fill text-red-600 text-xl mr-3 mt-1"></i>
                    <div>
                      <p className="font-semibold text-red-900 mb-1">Critical: Low Sigma Level</p>
                      <p className="text-sm text-red-800">
                        Sigma level of 2.8σ indicates significant quality issues. This is below healthcare 
                        industry standards and represents patient safety concerns.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
                  <div className="flex items-start">
                    <i className="ri-alert-fill text-red-600 text-xl mr-3 mt-1"></i>
                    <div>
                      <p className="font-semibold text-red-900 mb-1">Critical: High Defect Rate</p>
                      <p className="text-sm text-red-800">
                        23.4% defect rate means nearly 1 in 4 patients experience unacceptable wait times. 
                        This requires immediate executive attention and resource allocation.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-orange-50 border-l-4 border-orange-500 p-4 rounded">
                  <div className="flex items-start">
                    <i className="ri-information-fill text-orange-600 text-xl mr-3 mt-1"></i>
                    <div>
                      <p className="font-semibold text-orange-900 mb-1">Recommendation: Focus on Night Shift</p>
                      <p className="text-sm text-orange-800">
                        Night shift performance is 88% worse than day shift. Prioritize staffing optimization 
                        and resource allocation for 11pm-7am period.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
                  <div className="flex items-start">
                    <i className="ri-lightbulb-fill text-blue-600 text-xl mr-3 mt-1"></i>
                    <div>
                      <p className="font-semibold text-blue-900 mb-1">Insight: Staffing is Primary Driver</p>
                      <p className="text-sm text-blue-800">
                        Strong correlation (+0.84) between nurse ratio and wait times. Addressing staffing 
                        levels will have the most significant impact on reducing wait times.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Final Summary */}
        <div className="bg-gradient-to-br from-teal-500 to-teal-600 text-white p-8 rounded-lg">
          <h3 className="text-2xl font-bold mb-4">
            <i className="ri-file-list-3-line mr-2"></i>
            Measure Phase Summary
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <h4 className="font-semibold mb-2 text-teal-100">Current State Baseline:</h4>
              <ul className="text-sm space-y-1 text-white/90">
                <li>• Average wait time: 187 minutes (3.1 hours)</li>
                <li>• Process capability: 2.8σ (below standard)</li>
                <li>• Defect rate: 23.4% (667 patients)</li>
                <li>• High variation: 78 min std dev</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2 text-teal-100">Key Findings:</h4>
              <ul className="text-sm space-y-1 text-white/90">
                <li>• Night shift 88% worse than day shift</li>
                <li>• Nurse ratio strongly correlates (+0.84)</li>
                <li>• Process out of control (47 outliers)</li>
                <li>• Special cause variation identified</li>
              </ul>
            </div>
          </div>

          <div className="bg-white/10 p-4 rounded-lg">
            <h4 className="font-semibold mb-2">Next Steps for Analyze Phase:</h4>
            <ol className="text-sm space-y-1 text-white/90 ml-4">
              <li>1. Root cause analysis on night shift staffing shortages</li>
              <li>2. Investigate physician scheduling optimization opportunities</li>
              <li>3. Analyze shift change handoff process delays</li>
              <li>4. Evaluate resource allocation during peak hours</li>
              <li>5. Hypothesis testing on nurse ratio impact</li>
            </ol>
          </div>
        </div>

        {/* Comparison with Manufacturing */}
        <div className="bg-gray-50 border-2 border-gray-300 p-6 rounded-lg">
          <h3 className="text-xl font-bold text-gray-900 mb-4">
            <i className="ri-contrast-2-line mr-2"></i>
            Healthcare vs Manufacturing: Key Differences
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-semibold text-gray-800 mb-3">Healthcare Considerations:</h4>
              <ul className="text-sm text-gray-700 space-y-2">
                <li className="flex items-start">
                  <i className="ri-checkbox-circle-fill text-teal-600 mr-2 mt-1"></i>
                  <span><strong>Patient Safety:</strong> Defects can mean life or death, not just quality issues</span>
                </li>
                <li className="flex items-start">
                  <i className="ri-checkbox-circle-fill text-teal-600 mr-2 mt-1"></i>
                  <span><strong>Regulatory Compliance:</strong> Joint Commission, CMS requirements</span>
                </li>
                <li className="flex items-start">
                  <i className="ri-checkbox-circle-fill text-teal-600 mr-2 mt-1"></i>
                  <span><strong>Human Factors:</strong> Staffing, fatigue, clinical judgment affect outcomes</span>
                </li>
                <li className="flex items-start">
                  <i className="ri-checkbox-circle-fill text-teal-600 mr-2 mt-1"></i>
                  <span><strong>Unpredictable Demand:</strong> Can't control when patients arrive or acuity</span>
                </li>
                <li className="flex items-start">
                  <i className="ri-checkbox-circle-fill text-teal-600 mr-2 mt-1"></i>
                  <span><strong>Ethical Constraints:</strong> Can't turn away patients or delay critical care</span>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-gray-800 mb-3">Manufacturing Considerations:</h4>
              <ul className="text-sm text-gray-700 space-y-2">
                <li className="flex items-start">
                  <i className="ri-checkbox-circle-fill text-blue-600 mr-2 mt-1"></i>
                  <span><strong>Product Quality:</strong> Defects affect cost and customer satisfaction</span>
                </li>
                <li className="flex items-start">
                  <i className="ri-checkbox-circle-fill text-blue-600 mr-2 mt-1"></i>
                  <span><strong>ISO Standards:</strong> Quality management system requirements</span>
                </li>
                <li className="flex items-start">
                  <i className="ri-checkbox-circle-fill text-blue-600 mr-2 mt-1"></i>
                  <span><strong>Machine Factors:</strong> Equipment reliability, maintenance schedules</span>
                </li>
                <li className="flex items-start">
                  <i className="ri-checkbox-circle-fill text-blue-600 mr-2 mt-1"></i>
                  <span><strong>Predictable Demand:</strong> Production schedules, inventory management</span>
                </li>
                <li className="flex items-start">
                  <i className="ri-checkbox-circle-fill text-blue-600 mr-2 mt-1"></i>
                  <span><strong>Process Control:</strong> Can stop production line to fix issues</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}