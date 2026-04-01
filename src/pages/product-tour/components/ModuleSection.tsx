import { ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface Feature {
  icon: string;
  text: string;
}

interface ModuleSectionProps {
  id: string;
  badge: string;
  badgeColor: string;
  title: string;
  description: string;
  features: Feature[];
  ctaLabel: string;
  ctaLink: string;
  previewComponent: ReactNode;
  reverse?: boolean;
}

export default function ModuleSection({
  id,
  badge,
  badgeColor,
  title,
  description,
  features,
  ctaLabel,
  ctaLink,
  previewComponent,
  reverse = false,
}: ModuleSectionProps) {
  return (
    <section
      id={id}
      className="py-20 scroll-mt-20 border-b border-gray-100 last:border-b-0"
    >
      <div className={`flex flex-col ${reverse ? 'lg:flex-row-reverse' : 'lg:flex-row'} gap-12 lg:gap-16 xl:gap-20 2xl:gap-28 items-center`}>
        {/* Text Side */}
        <div className="flex-1 min-w-0">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider mb-5 ${badgeColor}`}>
            {badge}
          </span>
          <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4 leading-tight tracking-tight">
            {title}
          </h2>
          <p className="text-lg text-gray-500 leading-relaxed mb-8">
            {description}
          </p>

          <ul className="space-y-3 mb-10">
            {features.map((f, i) => (
              <li key={i} className="flex items-start gap-3">
                <div className="w-6 h-6 flex items-center justify-center rounded-lg bg-teal-50 flex-shrink-0 mt-0.5">
                  <i className={`${f.icon} text-teal-600 text-sm`}></i>
                </div>
                <span className="text-sm text-gray-600 leading-relaxed">{f.text}</span>
              </li>
            ))}
          </ul>

          <Link
            to={ctaLink}
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-teal-600 to-teal-500 text-white font-semibold rounded-xl hover:from-teal-500 hover:to-teal-400 transition-all duration-200 cursor-pointer whitespace-nowrap text-sm"
          >
            {ctaLabel}
            <i className="ri-arrow-right-line text-base"></i>
          </Link>
        </div>

        {/* Preview Side */}
        <div className="flex-1 min-w-0 w-full">
          <div className="rounded-2xl overflow-hidden border border-gray-200 bg-white" style={{ minHeight: 360 }}>
            {/* Browser chrome bar */}
            <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
              <div className="w-3 h-3 rounded-full bg-red-400"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
              <div className="w-3 h-3 rounded-full bg-green-400"></div>
              <div className="flex-1 mx-3 h-6 bg-gray-200 rounded-md text-xs text-gray-400 flex items-center px-3">
                app.sigmasenseai.com{ctaLink}
              </div>
            </div>
            <div className="bg-gray-50/40">
              {previewComponent}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
