import React, { ReactNode } from 'react';

interface VisualizationCardProps {
  title: string;
  subtitle?: string;
  icon?: string;
  children: ReactNode;
  actions?: ReactNode;
  elevation?: 'low' | 'medium' | 'hero';
  aiHighlight?: boolean;
  className?: string;
}

export default function VisualizationCard({
  title,
  subtitle,
  icon,
  children,
  actions,
  elevation = 'medium',
  aiHighlight = false,
  className = '',
}: VisualizationCardProps) {
  const elevationClasses = {
    low: 'elevation-low hover:shadow-elevation-2',
    medium: 'elevation-medium hover:shadow-elevation-3',
    hero: 'elevation-hero hover:shadow-elevation-4',
  };

  return (
    <div
      className={`bg-white rounded-premium-lg p-8 border border-border/50 transition-smooth relative overflow-hidden ${elevationClasses[elevation]} ${
        aiHighlight ? 'ai-glow' : ''
      } ${className}`}
    >
      {/* AI Glow Background Effect */}
      {aiHighlight && (
        <>
          <div className="absolute top-0 right-0 w-48 h-48 bg-ai-400/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-sapphire-400/10 rounded-full blur-2xl"></div>
        </>
      )}

      {/* Header */}
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            {icon && (
              <div
                className={`w-12 h-12 rounded-premium-lg flex items-center justify-center shadow-elevation-2 ${
                  aiHighlight
                    ? 'bg-gradient-to-br from-ai-400 to-ai-500'
                    : 'bg-gradient-to-br from-sapphire-500 to-sapphire-600'
                }`}
              >
                <i className={`${icon} text-white text-2xl`}></i>
              </div>
            )}
            <div>
              <h3 className="text-heading-3 text-brand-900">{title}</h3>
              {subtitle && <p className="text-sm text-brand-600 mt-1">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex items-center gap-3">{actions}</div>}
        </div>

        {/* Content */}
        <div>{children}</div>
      </div>
    </div>
  );
}
