import { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import AskSigmaModal from '../../../components/feature/AskSigmaModal';
import BookDemoModal from './BookDemoModal';

interface DropdownItem {
  title: string;
  description: string;
  icon: string;
  link: string;
}

interface DropdownSection {
  items: DropdownItem[];
  cta?: {
    text: string;
    link: string;
  };
}

export default function Navigation() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAskSigmaOpen, setIsAskSigmaOpen] = useState(false);
  const [isBookDemoOpen, setIsBookDemoOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [mobileExpandedMenu, setMobileExpandedMenu] = useState<string | null>(null);
  const [showUseCases, setShowUseCases] = useState(false);
  const [showUseCasesDropdown, setShowUseCasesDropdown] = useState(false);
  const dropdownTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleMouseEnter = (menu: string) => {
    if (dropdownTimeoutRef.current) {
      clearTimeout(dropdownTimeoutRef.current);
    }
    setActiveDropdown(menu);
  };

  const handleMouseLeave = () => {
    dropdownTimeoutRef.current = setTimeout(() => {
      setActiveDropdown(null);
    }, 150);
  };

  const platformItems: DropdownSection = {
    items: [
      {
        title: '⭐ AIM — Actionable Intelligence Model',
        description: 'Get prioritized recommendations powered by AI',
        icon: 'ri-brain-line',
        link: '/dashboard/aim'
      },
      {
        title: '🏥 CPI — Clinical Process Intelligence',
        description: 'Real-time predictive intelligence for healthcare operations',
        icon: 'ri-heart-pulse-line',
        link: '/dashboard/cpi'
      },
      {
        title: 'Live Metrics & Performance Dashboard',
        description: 'Real-time visibility into operational performance',
        icon: 'ri-dashboard-line',
        link: '/dashboard/metrics'
      },
      {
        title: 'AI Root Cause Analysis',
        description: 'Automated investigation of performance issues',
        icon: 'ri-search-eye-line',
        link: '/dashboard/root-cause'
      },
      {
        title: 'Predictive Improvement Simulations',
        description: 'Test changes before implementation',
        icon: 'ri-flask-line',
        link: '/dashboard/simulations'
      },
      {
        title: 'DMAIC Digital Workspace',
        description: 'Structured improvement project management',
        icon: 'ri-flow-chart',
        link: '/dashboard/dmaic'
      },
      {
        title: 'Continuous Monitoring & Alerts',
        description: 'Proactive notifications for anomalies',
        icon: 'ri-notification-line',
        link: '/dashboard/metrics'
      },
      {
        title: 'Data Integration Hub',
        description: 'Connect all your data sources seamlessly',
        icon: 'ri-database-2-line',
        link: '/dashboard/data-integration'
      }
    ],
    cta: {
      text: 'Explore Full Platform',
      link: '/dashboard'
    }
  };

  const useCasesItems: DropdownSection = {
    items: [
      {
        title: 'Manufacturing',
        description: 'Reduce defects, improve yield, stabilize cycle time',
        icon: 'ri-settings-3-line',
        link: '/use-cases#manufacturing'
      },
      {
        title: 'Healthcare',
        description: 'Optimize patient flow and throughput',
        icon: 'ri-heart-pulse-line',
        link: '/use-cases#healthcare'
      },
      {
        title: 'Supply Chain & Logistics',
        description: 'Speed fulfillment and reduce bottlenecks',
        icon: 'ri-truck-line',
        link: '/use-cases#supply-chain'
      },
      {
        title: 'Retail & E-Commerce',
        description: 'Improve demand forecasting and returns reduction',
        icon: 'ri-shopping-cart-line',
        link: '/use-cases#retail'
      },
      {
        title: 'Finance & Banking',
        description: 'Reduce operational risk & SLA breaches',
        icon: 'ri-bank-line',
        link: '/use-cases#finance'
      },
      {
        title: 'SaaS & IT',
        description: 'Improve uptime, deployment stability & customer experience',
        icon: 'ri-cloud-line',
        link: '/use-cases#saas'
      }
    ],
    cta: {
      text: 'Talk to an Expert',
      link: '#contact'
    }
  };

  const resourcesItems: DropdownSection = {
    items: [
      {
        title: 'Case Studies',
        description: 'Real-world success stories from our customers',
        icon: 'ri-file-text-line',
        link: '#case-studies'
      },
      {
        title: 'Whitepapers & Research Reports',
        description: 'In-depth analysis and industry insights',
        icon: 'ri-article-line',
        link: '#whitepapers'
      },
      {
        title: 'Webinars & Training',
        description: 'Live and on-demand learning sessions',
        icon: 'ri-video-line',
        link: '#webinars'
      },
      {
        title: 'Documentation & User Guides',
        description: 'Complete product documentation',
        icon: 'ri-book-open-line',
        link: '#docs'
      },
      {
        title: 'SigmaSense Academy',
        description: 'Structured learning paths and certifications',
        icon: 'ri-graduation-cap-line',
        link: '#academy'
      },
      {
        title: 'Blog & Insights',
        description: 'Latest trends and best practices',
        icon: 'ri-lightbulb-line',
        link: '#blog'
      }
    ],
    cta: {
      text: 'Visit Resource Center',
      link: '#resources'
    }
  };

  const pricingItems: DropdownSection = {
    items: [
      {
        title: 'Self-Service Plans',
        description: 'Get started instantly with flexible pricing',
        icon: 'ri-rocket-line',
        link: '#pricing'
      },
      {
        title: 'Enterprise Plans',
        description: 'Custom solutions for large organizations',
        icon: 'ri-building-line',
        link: '#enterprise'
      },
      {
        title: 'Compare Plans',
        description: 'Find the perfect plan for your needs',
        icon: 'ri-contrast-2-line',
        link: '#compare'
      },
      {
        title: 'ROI Calculator',
        description: 'Calculate your potential savings',
        icon: 'ri-calculator-line',
        link: '#roi'
      },
      {
        title: 'FAQs',
        description: 'Common questions about pricing',
        icon: 'ri-question-line',
        link: '#faqs'
      }
    ],
    cta: {
      text: 'Contact Sales',
      link: '#contact'
    }
  };

  const dropdownData: Record<string, DropdownSection> = {
    product: platformItems,
    usecases: useCasesItems,
    capabilities: resourcesItems,
    resources: resourcesItems,
    pricing: pricingItems
  };

  const renderDropdown = (menu: string) => {
    const data = dropdownData[menu];
    if (!data) return null;

    const handleItemClick = (link: string) => {
      setActiveDropdown(null);
      
      if (link.startsWith('/use-cases#')) {
        const hash = link.split('#')[1];
        if (window.REACT_APP_NAVIGATE) {
          window.REACT_APP_NAVIGATE('/use-cases');
          setTimeout(() => {
            const element = document.getElementById(hash);
            if (element) {
              element.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }, 100);
        }
      }
    };

    const handleCtaClick = (e: React.MouseEvent<HTMLAnchorElement>, link: string) => {
      if (link.startsWith('#')) {
        e.preventDefault();
        setActiveDropdown(null);
        const id = link.slice(1);
        const element = document.getElementById(id);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    };

    return (
      <div 
        className={`absolute top-full left-1/2 -translate-x-1/2 mt-2 w-[720px] bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden transition-all duration-300 ${
          activeDropdown === menu 
            ? 'opacity-100 translate-y-0 pointer-events-auto' 
            : 'opacity-0 -translate-y-2 pointer-events-none'
        }`}
        onMouseEnter={() => handleMouseEnter(menu)}
        onMouseLeave={handleMouseLeave}
      >
        <div className="p-6">
          <div className="grid grid-cols-2 gap-3">
            {data.items.map((item, index) => {
              const isAIM = item.title.includes('AIM');
              const isCPI = item.title.includes('CPI');
              
              const itemClass = isAIM
                ? 'bg-gradient-to-br from-indigo-50 via-purple-50 to-blue-50 border-2 border-indigo-200 hover:border-indigo-300'
                : isCPI
                ? 'bg-gradient-to-br from-teal-50 to-emerald-50 border-2 border-teal-200 hover:border-teal-300'
                : 'hover:bg-gray-50';
              const iconBg = isAIM
                ? 'bg-gradient-to-br from-indigo-500 via-purple-500 to-blue-500'
                : isCPI
                ? 'bg-gradient-to-br from-teal-500 to-emerald-500'
                : 'bg-gradient-to-br from-teal-50 to-cyan-50';
              const iconColor = isAIM || isCPI ? 'text-white' : 'text-teal-600';
              const titleColor = isAIM
                ? 'text-indigo-900 group-hover:text-indigo-700'
                : isCPI
                ? 'text-teal-900 group-hover:text-teal-700'
                : 'text-gray-900 group-hover:text-teal-600';

              return item.link.startsWith('/use-cases#') ? (
                <div
                  key={index}
                  onClick={() => handleItemClick(item.link)}
                  className={`group flex items-start space-x-4 p-4 rounded-xl transition-all duration-200 cursor-pointer ${itemClass}`}
                >
                  <div className={`w-10 h-10 flex-shrink-0 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-200 ${iconBg}`}>
                    <i className={`${item.icon} text-lg ${iconColor}`}></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-semibold mb-1 transition-colors duration-200 ${titleColor}`}>
                      {item.title}
                    </div>
                    <div className="text-xs text-gray-500 leading-relaxed">
                      {item.description}
                    </div>
                  </div>
                </div>
              ) : (
                <a
                  key={index}
                  href={item.link}
                  className={`group flex items-start space-x-4 p-4 rounded-xl transition-all duration-200 cursor-pointer ${itemClass}`}
                >
                  <div className={`w-10 h-10 flex-shrink-0 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-200 ${iconBg}`}>
                    <i className={`${item.icon} text-lg ${iconColor}`}></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-semibold mb-1 transition-colors duration-200 ${titleColor}`}>
                      {item.title}
                    </div>
                    <div className="text-xs text-gray-500 leading-relaxed">
                      {item.description}
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
          
          {data.cta && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <a
                href={data.cta.link}
                onClick={(e) => handleCtaClick(e, data.cta!.link)}
                className="group flex items-center justify-between px-4 py-3 bg-gradient-to-r from-gray-50 to-teal-50/30 hover:from-teal-50 hover:to-cyan-50 rounded-xl transition-all duration-300 cursor-pointer"
              >
                <span className="text-sm font-semibold text-gray-900 group-hover:text-teal-600 transition-colors duration-200">
                  {data.cta.text}
                </span>
                <i className="ri-arrow-right-line text-teal-600 group-hover:translate-x-1 transition-transform duration-200"></i>
              </a>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled ? 'bg-white/95 backdrop-blur-md shadow-sm' : 'bg-transparent'
        }`}
      >
        <div className="max-w-[1600px] mx-auto px-8 lg:px-12">
          <div className="flex items-center justify-between h-20">
            {/* Logo - Left aligned */}
            <Link 
              to="/" 
              className="flex items-center space-x-2.5 group cursor-pointer relative z-10"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center">
                  <img 
                    src="https://static.readdy.ai/image/e0eaba904d3ab93af6bd7d79a7618802/315afdeb7baeedd8ffa62425df2dc4e4.png" 
                    alt="SigmaSense Logo" 
                    className="w-full h-full object-contain"
                  />
                </div>
                <span className="text-xl font-bold text-brand-900 tracking-tight">
                  sigmaSense<span className="text-sapphire-600">AI</span>
                </span>
              </div>
            </Link>

            {/* Desktop Navigation - Center-left */}
            <div className="hidden lg:flex items-center gap-1 flex-1 justify-center ml-16">
              {[
                { id: 'product', label: 'Product' },
                { id: 'usecases', label: 'Use Cases' },
                { id: 'pricing', label: 'Pricing' }
              ].map((item) => (
                <div
                  key={item.id}
                  className="relative"
                  onMouseEnter={() => handleMouseEnter(item.id)}
                  onMouseLeave={handleMouseLeave}
                >
                  <button
                    className={`group relative px-3.5 py-2 text-sm font-medium rounded-lg transition-all duration-200 cursor-pointer whitespace-nowrap flex items-center space-x-1 ${
                      activeDropdown === item.id
                        ? 'text-teal-600 bg-teal-50/50'
                        : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    <span>{item.label}</span>
                    <i className={`ri-arrow-down-s-line text-sm transition-transform duration-200 ${
                      activeDropdown === item.id ? 'rotate-180' : ''
                    }`}></i>
                  </button>
                  {renderDropdown(item.id)}
                </div>
              ))}
              <Link
                to="/product-tour"
                className={`px-3.5 py-2 text-sm font-medium rounded-lg transition-all duration-200 cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  location.pathname === '/product-tour'
                    ? 'text-teal-600 bg-teal-50/50'
                    : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <i className="ri-play-circle-line text-sm"></i>
                Product Tour
              </Link>
            </div>

            {/* Right Side CTAs */}
            <div className="hidden lg:flex items-center gap-3">
              {/* Book Demo - Secondary CTA */}
              <button
                onClick={() => setIsBookDemoOpen(true)}
                className="group px-5 py-2.5 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 cursor-pointer whitespace-nowrap"
              >
                Book Demo
              </button>

              {/* Start Free - Primary CTA */}
              <Link
                to="/auth/signup"
                className="group relative px-6 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-teal-600 to-teal-500 rounded-lg transition-all duration-200 cursor-pointer whitespace-nowrap shadow-lg shadow-teal-600/25 hover:shadow-xl hover:shadow-teal-600/30 hover:-translate-y-0.5"
              >
                <span className="relative z-10 flex items-center space-x-1.5">
                  <span>Start Free</span>
                  <i className="ri-arrow-right-line text-sm transition-transform duration-200 group-hover:translate-x-0.5"></i>
                </span>
              </Link>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="lg:hidden p-2.5 rounded-lg text-gray-700 hover:bg-gray-100 transition-all duration-300 cursor-pointer"
            >
              <div className="w-5 h-5 flex flex-col justify-center items-center space-y-1">
                <span className={`w-5 h-0.5 bg-current transition-all duration-300 ${isMobileMenuOpen ? 'rotate-45 translate-y-1.5' : ''}`}></span>
                <span className={`w-5 h-0.5 bg-current transition-all duration-300 ${isMobileMenuOpen ? 'opacity-0' : ''}`}></span>
                <span className={`w-5 h-0.5 bg-current transition-all duration-300 ${isMobileMenuOpen ? '-rotate-45 -translate-y-1.5' : ''}`}></span>
              </div>
            </button>
          </div>

          {/* Mobile Menu */}
          {isMobileMenuOpen && (
            <div className="lg:hidden pb-6 border-t border-gray-200 mt-2">
              {/* Mobile Menu Items with Expandable Dropdowns */}
              {[
                { id: 'product', label: 'Product', data: platformItems },
                { id: 'usecases', label: 'Use Cases', data: useCasesItems },
                { id: 'pricing', label: 'Pricing', data: pricingItems }
              ].map((menu) => (
                <div key={menu.id} className="border-b border-gray-100 pb-2">
                  <button
                    onClick={() => setMobileExpandedMenu(mobileExpandedMenu === menu.id ? null : menu.id)}
                    className="flex items-center justify-between w-full px-4 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50 rounded-lg transition-all duration-200 cursor-pointer"
                  >
                    <span>{menu.label}</span>
                    <i className={`ri-arrow-down-s-line transition-transform duration-200 ${
                      mobileExpandedMenu === menu.id ? 'rotate-180' : ''
                    }`}></i>
                  </button>
                  
                  <div className={`overflow-hidden transition-all duration-300 ${
                    mobileExpandedMenu === menu.id ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
                  }`}>
                    <div className="pl-4 pt-2 space-y-1">
                      {menu.data.items.map((item, index) => (
                        item.link.startsWith('/use-cases#') ? (
                          <div
                            key={index}
                            onClick={() => {
                              const hash = item.link.split('#')[1];
                              if (window.REACT_APP_NAVIGATE) {
                                window.REACT_APP_NAVIGATE('/use-cases');
                                setIsMobileMenuOpen(false);
                                setTimeout(() => {
                                  const element = document.getElementById(hash);
                                  if (element) {
                                    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                  }
                                }, 100);
                              }
                            }}
                            className="flex items-start space-x-3 px-4 py-3 hover:bg-gray-50 rounded-lg transition-all duration-200 cursor-pointer"
                          >
                            <i className={`${item.icon} text-teal-600 text-lg mt-0.5`}></i>
                            <div>
                              <div className="text-sm font-medium text-gray-900">{item.title}</div>
                              <div className="text-xs text-gray-500 mt-0.5">{item.description}</div>
                            </div>
                          </div>
                        ) : (
                          <a
                            key={index}
                            href={item.link}
                            className="flex items-start space-x-3 px-4 py-3 hover:bg-gray-50 rounded-lg transition-all duration-200 cursor-pointer"
                          >
                            <i className={`${item.icon} text-teal-600 text-lg mt-0.5`}></i>
                            <div>
                              <div className="text-sm font-medium text-gray-900">{item.title}</div>
                              <div className="text-xs text-gray-500 mt-0.5">{item.description}</div>
                            </div>
                          </a>
                        )
                      ))}
                      {menu.data.cta && (
                        <a
                          href={menu.data.cta.link}
                          className="flex items-center justify-between px-4 py-3 mt-2 bg-teal-50 hover:bg-teal-100 rounded-lg transition-all duration-200 cursor-pointer"
                        >
                          <span className="text-sm font-semibold text-teal-600">{menu.data.cta.text}</span>
                          <i className="ri-arrow-right-line text-teal-600"></i>
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Mobile CTAs */}
              <div className="pt-4 space-y-2 px-4">
                <button
                  onClick={() => { setIsMobileMenuOpen(false); setIsBookDemoOpen(true); }}
                  className="w-full px-4 py-3 text-sm font-semibold text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-all duration-300 cursor-pointer"
                >
                  Book Demo
                </button>
                
                <Link
                  to="/auth/signup"
                  className="block w-full text-center px-4 py-3 text-sm font-bold text-white bg-gradient-to-r from-teal-600 to-teal-500 rounded-lg shadow-lg transition-all duration-300 cursor-pointer"
                >
                  Start Free
                </Link>
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Floating AI Assistant Button */}
      <button
        onClick={() => setIsAskSigmaOpen(true)}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 bg-gradient-to-br from-teal-500 to-teal-600 rounded-full shadow-2xl shadow-teal-600/40 flex items-center justify-center hover:scale-110 transition-all duration-300 cursor-pointer group"
      >
        <i className="ri-sparkling-line text-white text-xl group-hover:rotate-12 transition-transform duration-300"></i>
        <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white animate-pulse"></div>
      </button>

      {/* Ask Sigma Modal */}
      <AskSigmaModal isOpen={isAskSigmaOpen} onClose={() => setIsAskSigmaOpen(false)} />

      {/* Book Demo Modal */}
      <BookDemoModal isOpen={isBookDemoOpen} onClose={() => setIsBookDemoOpen(false)} />
    </>
  );
}
