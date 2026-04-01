import { Link } from 'react-router-dom';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  const footerLinks = {
    platform: [
      { label: 'AIM — Actionable Intelligence', href: '/dashboard/aim' },
      { label: 'CPI — Clinical Process Intelligence', href: '/cpi' },
      { label: 'DMAIC Digital Workspace', href: '/dashboard/dmaic' },
      { label: 'Live Metrics & Dashboard', href: '/dashboard/metrics' },
      { label: 'AI Root Cause Analysis', href: '/dashboard/root-cause' },
      { label: 'Action Tracker', href: '/dashboard/action-tracker' },
      { label: 'Predictive Simulations', href: '/dashboard/simulations' },
      { label: 'Data Integration Hub', href: '/dashboard/data-integration' }
    ],
    useCases: [
      { label: 'Healthcare Operations', href: '/use-cases#healthcare' },
      { label: 'Manufacturing & Quality', href: '/use-cases#manufacturing' },
      { label: 'Supply Chain & Logistics', href: '/use-cases#supply-chain' },
      { label: 'Finance & Banking', href: '/use-cases#finance' },
      { label: 'Retail & E-Commerce', href: '/use-cases#retail' },
      { label: 'SaaS & IT Operations', href: '/use-cases#saas' }
    ],
    teams: [
      { label: 'Clinical Operations Teams', href: '#' },
      { label: 'Quality Improvement Teams', href: '#' },
      { label: 'Healthcare Leadership', href: '#' },
      { label: 'Data & Analytics Teams', href: '#' },
      { label: 'Enterprise Ops Teams', href: '#' }
    ],
    resources: [
      { label: 'Documentation & Guides', href: '#' },
      { label: 'SigmaSense Academy', href: '#' },
      { label: 'Case Studies', href: '/case-studies' },
      { label: 'Whitepapers & Research', href: '#' },
      { label: 'Webinars & Training', href: '#' },
      { label: 'Blog & Insights', href: '#' },
      { label: 'Contact Support', href: '#' },
      { label: "What's New", href: '#' }
    ],
    company: [
      { label: 'About Us', href: '#' },
      { label: 'Careers', href: '#' },
      { label: 'Contact Sales', href: '#contact' },
      { label: 'Become a Partner', href: '#' },
      { label: 'Expert Directory', href: '#' }
    ],
    methodologies: [
      { label: 'DMAIC Framework', href: '#' },
      { label: 'Lean Six Sigma', href: '#' },
      { label: 'Kaizen Events', href: '#' },
      { label: 'Control Charts (SPC)', href: '#' },
      { label: 'Root Cause Analysis', href: '#' },
      { label: 'SOP Builder', href: '#' },
      { label: 'KPI Scorecards', href: '#' }
    ],
    deploymentOptions: [
      { label: 'Enterprise', href: '#pricing' },
      { label: 'Small & Midsize', href: '#pricing' },
      { label: 'Healthcare Systems', href: '#' },
      { label: 'ROI Calculator', href: '#' }
    ]
  };

  const scrollToSection = (id: string) => {
    if (id.startsWith('#')) {
      const element = document.getElementById(id.substring(1));
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  return (
    <footer className="bg-gradient-to-br from-teal-950 to-slate-900 text-white">
      <div className="w-full px-6 lg:px-12 py-16">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-0 left-0 w-96 h-96 bg-teal-400 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-teal-400 rounded-full blur-3xl"></div>
        </div>

        {/* Main Footer Content */}
        <div className="py-16 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8 lg:gap-12">
          {/* Platform Links */}
          <div>
            <h4 className="text-xs font-bold text-white/90 mb-4 uppercase tracking-wider">Platform</h4>
            <ul className="space-y-2.5">
              {footerLinks.platform.map((link, idx) => (
                <li key={idx}>
                  <a href={link.href} className="text-sm text-white/70 hover:text-white transition-colors cursor-pointer">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Use Cases + Teams */}
          <div>
            <h4 className="text-xs font-bold text-white/90 mb-4 uppercase tracking-wider">Use Cases</h4>
            <ul className="space-y-2.5">
              {footerLinks.useCases.map((link, idx) => (
                <li key={idx}>
                  <a href={link.href} className="text-sm text-white/70 hover:text-white transition-colors cursor-pointer">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>

            <h4 className="text-xs font-bold text-white/90 mb-4 mt-8 uppercase tracking-wider">Teams</h4>
            <ul className="space-y-2.5">
              {footerLinks.teams.map((link, idx) => (
                <li key={idx}>
                  <a href={link.href} className="text-sm text-white/70 hover:text-white transition-colors cursor-pointer">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Methodologies + Plans */}
          <div>
            <h4 className="text-xs font-bold text-white/90 mb-4 uppercase tracking-wider">Methodologies</h4>
            <ul className="space-y-2.5">
              {footerLinks.methodologies.map((link, idx) => (
                <li key={idx}>
                  <a href={link.href} className="text-sm text-white/70 hover:text-white transition-colors cursor-pointer">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>

            <h4 className="text-xs font-bold text-white/90 mb-4 mt-8 uppercase tracking-wider">Plans</h4>
            <ul className="space-y-2.5">
              {footerLinks.deploymentOptions.map((link, idx) => (
                <li key={idx}>
                  <a href={link.href} className="text-sm text-white/70 hover:text-white transition-colors cursor-pointer">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources Links */}
          <div>
            <h4 className="text-xs font-bold text-white/90 mb-4 uppercase tracking-wider">Resources</h4>
            <ul className="space-y-2.5">
              {footerLinks.resources.map((link, idx) => (
                <li key={idx}>
                  <a href={link.href} className="text-sm text-white/70 hover:text-white transition-colors cursor-pointer">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Company Links */}
          <div>
            <h4 className="text-xs font-bold text-white/90 mb-4 uppercase tracking-wider">Company</h4>
            <ul className="space-y-2.5">
              {footerLinks.company.map((link, idx) => (
                <li key={idx}>
                  {link.href.startsWith('#') ? (
                    <button
                      onClick={() => scrollToSection(link.href)}
                      className="text-sm text-white/70 hover:text-white transition-colors cursor-pointer text-left"
                    >
                      {link.label}
                    </button>
                  ) : (
                    <a href={link.href} className="text-sm text-white/70 hover:text-white transition-colors cursor-pointer">
                      {link.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Newsletter / CTA Column */}
          <div>
            <h4 className="text-xs font-bold text-white/90 mb-4 uppercase tracking-wider">Stay Updated</h4>
            <p className="text-sm text-white/60 mb-4 leading-relaxed">
              Get the latest on healthcare process improvement and product updates.
            </p>
            <div className="space-y-2">
              <input
                type="email"
                placeholder="Enter your email"
                className="w-full px-3 py-2 text-sm bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-teal-400 transition-colors"
              />
              <button className="w-full px-3 py-2 text-sm font-semibold bg-teal-500 hover:bg-teal-400 text-white rounded-lg transition-colors cursor-pointer whitespace-nowrap">
                Subscribe
              </button>
            </div>
            <div className="flex items-center space-x-3 mt-6">
              <a href="#" className="w-8 h-8 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-lg transition-colors cursor-pointer">
                <i className="ri-linkedin-fill text-sm text-white/80"></i>
              </a>
              <a href="#" className="w-8 h-8 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-lg transition-colors cursor-pointer">
                <i className="ri-twitter-x-line text-sm text-white/80"></i>
              </a>
              <a href="#" className="w-8 h-8 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-lg transition-colors cursor-pointer">
                <i className="ri-youtube-line text-sm text-white/80"></i>
              </a>
            </div>
          </div>
        </div>

        {/* Compliance Badge Strip */}
        <div className="border-t border-white/10 py-6 mb-0">
          <div className="flex flex-wrap items-center justify-center gap-4">
            {[
              { icon: 'ri-shield-check-fill', label: 'HIPAA Compliant' },
              { icon: 'ri-lock-2-fill', label: 'SOC 2 Type II' },
              { icon: 'ri-file-shield-2-fill', label: 'BAA Available' },
              { icon: 'ri-eye-off-fill', label: 'PHI Encrypted' },
              { icon: 'ri-database-2-fill', label: 'HL7 / FHIR Ready' },
              { icon: 'ri-global-fill', label: 'GDPR Aligned' },
            ].map((badge, idx) => (
              <div key={idx} className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-full px-3.5 py-1.5">
                <div className="w-4 h-4 flex items-center justify-center">
                  <i className={`${badge.icon} text-xs text-teal-300`}></i>
                </div>
                <span className="text-xs text-white/60 font-medium whitespace-nowrap">{badge.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-white/20 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between space-y-4 md:space-y-0">
            <div className="flex items-center space-x-2">
              <Link to="/" className="flex items-center space-x-2 group cursor-pointer">
                <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
                  <span className="text-orange-500 font-bold text-base">Σ</span>
                </div>
                <span className="text-base font-bold text-white">SigmaSense</span>
              </Link>
            </div>

            <div className="text-sm text-white/80">
              ©{currentYear} SigmaSense. All rights reserved
            </div>

            <div className="flex items-center space-x-6">
              <a 
                href="#" 
                className="text-sm text-white/80 hover:text-white transition-colors cursor-pointer"
              >
                Privacy Program
              </a>
              <span className="w-1 h-1 bg-white/40 rounded-full"></span>
              <a 
                href="#" 
                className="text-sm text-white/80 hover:text-white transition-colors cursor-pointer"
              >
                Legal
              </a>
              <span className="w-1 h-1 bg-white/40 rounded-full"></span>
              <a 
                href="#" 
                className="text-sm text-white/80 hover:text-white transition-colors cursor-pointer"
              >
                Security
              </a>
              <span className="w-1 h-1 bg-white/40 rounded-full"></span>
              <a 
                href="https://readdy.ai/?origin=logo" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-sm text-white/80 hover:text-white transition-colors cursor-pointer"
              >
                Powered by Readdy
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
