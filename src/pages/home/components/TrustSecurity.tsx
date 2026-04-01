import { useState } from 'react';

const complianceBadges = [
  { icon: 'ri-shield-check-fill', label: 'HIPAA Compliant', color: 'text-teal-600', bg: 'bg-teal-50 border-teal-100' },
  { icon: 'ri-lock-2-fill', label: 'SOC 2 Type II', color: 'text-slate-700', bg: 'bg-slate-50 border-slate-200' },
  { icon: 'ri-file-shield-2-fill', label: 'BAA Available', color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100' },
  { icon: 'ri-eye-off-fill', label: 'PHI Encrypted', color: 'text-teal-700', bg: 'bg-teal-50 border-teal-100' },
  { icon: 'ri-building-2-fill', label: 'HL7 / FHIR Ready', color: 'text-slate-700', bg: 'bg-slate-50 border-slate-200' },
  { icon: 'ri-award-fill', label: 'GDPR Aligned', color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100' },
];

const securityPillars = [
  {
    icon: 'ri-shield-keyhole-fill',
    title: 'End-to-End PHI Encryption',
    description:
      'All Protected Health Information is AES-256 encrypted at rest and TLS 1.3 in transit. Field-level encryption ensures PHI is never exposed in logs, caches, or analytics pipelines.',
    tag: 'HIPAA §164.312',
  },
  {
    icon: 'ri-user-settings-fill',
    title: 'Role-Based Access Control',
    description:
      'Granular RBAC with least-privilege defaults. Clinicians, analysts, and executives each see only what\'s appropriate. Access matrices align to NIST 800-53 and Joint Commission standards.',
    tag: 'Zero Trust Architecture',
  },
  {
    icon: 'ri-file-list-3-fill',
    title: 'Immutable Audit Logs',
    description:
      'Every data access, export, and configuration change is tamper-proof, time-stamped, and queryable. Ready for Joint Commission audits, OCR investigations, and internal compliance reviews.',
    tag: 'HIPAA §164.312(b)',
  },
  {
    icon: 'ri-server-fill',
    title: 'Healthcare-Grade Infrastructure',
    description:
      'Hosted on HIPAA-eligible cloud infrastructure with dedicated tenancy options. 99.9% uptime SLA, multi-region failover, and automated daily backups with point-in-time recovery.',
    tag: '99.9% Uptime SLA',
  },
  {
    icon: 'ri-team-fill',
    title: 'Business Associate Agreement',
    description:
      'We sign BAAs with every healthcare customer — no exceptions. Our legal team works directly with your Compliance Officer to ensure the agreement meets your organization\'s specific requirements.',
    tag: 'Sign BAA in &lt;24h',
  },
  {
    icon: 'ri-scan-fill',
    title: 'Continuous Vulnerability Management',
    description:
      'Automated SAST/DAST scans on every deployment, quarterly third-party penetration testing, and a responsible disclosure program. Vulnerabilities are triaged within 4 hours.',
    tag: 'Pen Tested Quarterly',
  },
];

const faqs = [
  {
    q: 'Can SigmaSense sign a BAA with our organization?',
    a: 'Yes — every healthcare customer receives a fully executed Business Associate Agreement before accessing the platform. Our legal and compliance teams turn around BAA signatures in under 24 hours.',
  },
  {
    q: 'Where is PHI stored and processed?',
    a: 'PHI is stored on HIPAA-eligible cloud infrastructure in the US by default, with EU and APAC region options for international health systems. Data never transits regions without your explicit configuration.',
  },
  {
    q: 'How does SigmaSense handle de-identification?',
    a: 'The platform supports both Safe Harbor and Expert Determination de-identification methods per HIPAA §164.514. Our PHI handler service can strip, tokenize, or pseudonymize identifiers automatically at the pipeline level.',
  },
  {
    q: 'What happens if there\'s a data breach?',
    a: 'Our incident response plan follows HHS guidelines with 60-day breach notification timelines. Customers receive direct notification from our Security Officer within 24 hours of any confirmed incident, well ahead of HIPAA\'s regulatory window.',
  },
];

export default function TrustSecurity() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <section id="security" className="py-24 bg-gradient-to-b from-white to-slate-50/60">
      <div className="max-w-7xl mx-auto px-6 lg:px-12">

        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center space-x-2 bg-teal-50 border border-teal-100 text-teal-700 text-xs font-semibold px-4 py-2 rounded-full mb-6 uppercase tracking-wider">
            <i className="ri-shield-check-fill text-sm"></i>
            <span>Enterprise Security &amp; Compliance</span>
          </div>
          <h2 className="text-4xl lg:text-5xl font-bold text-slate-900 leading-tight mb-5">
            Built for Healthcare.<br />
            <span className="text-teal-600">Secured for Compliance.</span>
          </h2>
          <p className="text-lg text-slate-500 max-w-2xl mx-auto leading-relaxed">
            Clinical organizations operate under strict regulatory obligations. SigmaSense was architected from day one with HIPAA, SOC 2, and HL7/FHIR requirements baked into every layer — not bolted on after the fact.
          </p>
        </div>

        {/* Compliance Badge Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-20">
          {complianceBadges.map((badge, idx) => (
            <div
              key={idx}
              className={`flex flex-col items-center justify-center gap-2.5 p-5 rounded-xl border ${badge.bg} transition-transform hover:-translate-y-0.5 duration-200 cursor-default`}
            >
              <div className={`w-10 h-10 flex items-center justify-center`}>
                <i className={`${badge.icon} text-2xl ${badge.color}`}></i>
              </div>
              <span className="text-xs font-semibold text-slate-700 text-center leading-tight">{badge.label}</span>
            </div>
          ))}
        </div>

        {/* Security Pillars Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-20">
          {securityPillars.map((pillar, idx) => (
            <div
              key={idx}
              className="group relative bg-white border border-slate-100 rounded-2xl p-7 hover:border-teal-200 transition-all duration-200 cursor-default overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-teal-50 rounded-full blur-2xl opacity-0 group-hover:opacity-60 transition-opacity duration-300 -translate-y-8 translate-x-8"></div>
              <div className="relative">
                <div className="w-11 h-11 flex items-center justify-center bg-teal-50 rounded-xl mb-5">
                  <i className={`${pillar.icon} text-xl text-teal-600`}></i>
                </div>
                <h3 className="text-base font-bold text-slate-900 mb-2">{pillar.title}</h3>
                <p
                  className="text-sm text-slate-500 leading-relaxed mb-4"
                  dangerouslySetInnerHTML={{ __html: pillar.description }}
                />
                <span className="inline-block text-xs font-semibold text-teal-600 bg-teal-50 border border-teal-100 px-3 py-1 rounded-full">
                  {pillar.tag}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Social Proof / Trust Quote Banner */}
        <div className="relative bg-gradient-to-r from-teal-900 to-slate-800 rounded-2xl p-10 mb-20 overflow-hidden">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 left-0 w-64 h-64 bg-teal-400 rounded-full blur-3xl"></div>
            <div className="absolute bottom-0 right-0 w-64 h-64 bg-teal-400 rounded-full blur-3xl"></div>
          </div>
          <div className="relative flex flex-col lg:flex-row items-start lg:items-center gap-8">
            <div className="flex-shrink-0">
              <div className="w-16 h-16 flex items-center justify-center bg-teal-500/20 border border-teal-400/30 rounded-2xl">
                <i className="ri-hospital-fill text-3xl text-teal-300"></i>
              </div>
            </div>
            <div className="flex-1">
              <blockquote className="text-lg text-white/90 leading-relaxed mb-4 italic">
                &ldquo;SigmaSense was the only process improvement platform that came to the table with a pre-signed BAA and a clear data residency policy. Our CISO approved it in a single review cycle — that never happens.&rdquo;
              </blockquote>
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">Director of Clinical Informatics</p>
                  <p className="text-xs text-white/50">400-bed Academic Medical Center, Midwest</p>
                </div>
              </div>
            </div>
            <div className="flex-shrink-0 flex flex-col sm:flex-row gap-3">
              <a
                href="#contact"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-teal-500 hover:bg-teal-400 text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer whitespace-nowrap"
              >
                <i className="ri-file-shield-2-line"></i>
                Request BAA
              </a>
              <a
                href="#contact"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/20 text-white text-sm font-semibold rounded-xl border border-white/20 transition-colors cursor-pointer whitespace-nowrap"
              >
                <i className="ri-download-line"></i>
                Security Brief
              </a>
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div className="max-w-3xl mx-auto">
          <h3 className="text-xl font-bold text-slate-900 text-center mb-8">Common Compliance Questions</h3>
          <div className="space-y-3">
            {faqs.map((faq, idx) => (
              <div
                key={idx}
                className="border border-slate-100 rounded-xl overflow-hidden bg-white"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  className="w-full flex items-center justify-between px-6 py-5 text-left cursor-pointer hover:bg-slate-50/60 transition-colors"
                >
                  <span className="text-sm font-semibold text-slate-800 pr-4">{faq.q}</span>
                  <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                    <i className={`ri-${openFaq === idx ? 'subtract' : 'add'}-line text-teal-600 text-base`}></i>
                  </div>
                </button>
                {openFaq === idx && (
                  <div className="px-6 pb-5">
                    <p className="text-sm text-slate-500 leading-relaxed">{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
}
