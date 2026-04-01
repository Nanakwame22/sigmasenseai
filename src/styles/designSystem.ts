// SigmaSense AI Premium Design System
// Optimized for operational intelligence platforms

export const designSystem = {
  // Spacing Scale (8px base)
  spacing: {
    xs: '8px',
    sm: '16px',
    md: '24px',
    lg: '48px',
    xl: '72px',
  },

  // Card Elevation Levels
  elevation: {
    low: {
      shadow: '0 1px 3px rgba(15, 23, 42, 0.08), 0 1px 2px rgba(15, 23, 42, 0.04)',
      hover: '0 4px 6px rgba(15, 23, 42, 0.10), 0 2px 4px rgba(15, 23, 42, 0.06)',
    },
    medium: {
      shadow: '0 4px 12px rgba(15, 23, 42, 0.10), 0 2px 6px rgba(15, 23, 42, 0.06)',
      hover: '0 8px 16px rgba(15, 23, 42, 0.12), 0 4px 8px rgba(15, 23, 42, 0.08)',
    },
    hero: {
      shadow: '0 12px 24px rgba(15, 23, 42, 0.12), 0 6px 12px rgba(15, 23, 42, 0.08)',
      hover: '0 16px 32px rgba(15, 23, 42, 0.14), 0 8px 16px rgba(15, 23, 42, 0.10)',
    },
  },

  // Corner Radius
  radius: {
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '20px',
    full: '9999px',
  },

  // Color System
  colors: {
    // Backgrounds
    background: {
      primary: '#FAFBFC',
      secondary: '#F5F7FA',
      tertiary: '#EEF2F6',
    },
    
    // Surfaces
    surface: {
      primary: '#FFFFFF',
      elevated: '#FFFFFF',
      overlay: 'rgba(255, 255, 255, 0.95)',
    },

    // Primary (Deep Indigo/Charcoal Blue)
    primary: {
      50: '#F0F4F8',
      100: '#D9E2EC',
      200: '#BCCCDC',
      300: '#9FB3C8',
      400: '#829AB1',
      500: '#627D98',
      600: '#486581',
      700: '#334E68',
      800: '#243B53',
      900: '#102A43',
    },

    // Accent (Sapphire Blue)
    accent: {
      50: '#E6F6FF',
      100: '#BAE3FF',
      200: '#7CC4FA',
      300: '#47A3F3',
      400: '#2186EB',
      500: '#0967D2',
      600: '#0552B5',
      700: '#03449E',
      800: '#01337D',
      900: '#002159',
    },

    // AI Highlight (Subtle Cyan Glow)
    ai: {
      50: '#E0FCFF',
      100: '#BEF8FD',
      200: '#87EAF2',
      300: '#54D1DB',
      400: '#38BEC9',
      500: '#2CB1BC',
      600: '#14919B',
      700: '#0E7C86',
      800: '#0A6C74',
      900: '#044E54',
      glow: 'rgba(56, 190, 201, 0.15)',
    },

    // Status Colors
    status: {
      success: '#10B981',
      warning: '#F59E0B',
      error: '#EF4444',
      info: '#3B82F6',
    },

    // Text
    text: {
      primary: '#102A43',
      secondary: '#486581',
      tertiary: '#627D98',
      disabled: '#9FB3C8',
      inverse: '#FFFFFF',
    },

    // Borders
    border: {
      light: '#E4E9F0',
      medium: '#D9E2EC',
      strong: '#BCCCDC',
    },
  },

  // Typography Hierarchy
  typography: {
    // KPI Numbers
    kpi: {
      hero: {
        size: '48px',
        weight: '700',
        lineHeight: '1.1',
        letterSpacing: '-0.02em',
      },
      large: {
        size: '36px',
        weight: '700',
        lineHeight: '1.2',
        letterSpacing: '-0.01em',
      },
      medium: {
        size: '28px',
        weight: '600',
        lineHeight: '1.3',
        letterSpacing: '-0.01em',
      },
    },

    // Section Headers
    heading: {
      h1: {
        size: '32px',
        weight: '700',
        lineHeight: '1.25',
        letterSpacing: '-0.01em',
      },
      h2: {
        size: '24px',
        weight: '600',
        lineHeight: '1.3',
        letterSpacing: '-0.01em',
      },
      h3: {
        size: '20px',
        weight: '600',
        lineHeight: '1.4',
        letterSpacing: '0',
      },
      h4: {
        size: '16px',
        weight: '600',
        lineHeight: '1.5',
        letterSpacing: '0',
      },
    },

    // Body Text
    body: {
      large: {
        size: '16px',
        weight: '400',
        lineHeight: '1.6',
      },
      medium: {
        size: '14px',
        weight: '400',
        lineHeight: '1.6',
      },
      small: {
        size: '13px',
        weight: '400',
        lineHeight: '1.5',
      },
    },

    // Microcopy
    micro: {
      label: {
        size: '12px',
        weight: '600',
        lineHeight: '1.4',
        letterSpacing: '0.02em',
        transform: 'uppercase',
      },
      caption: {
        size: '12px',
        weight: '400',
        lineHeight: '1.4',
      },
      tiny: {
        size: '11px',
        weight: '400',
        lineHeight: '1.4',
      },
    },
  },

  // Button Styles
  buttons: {
    primary: {
      bg: '#0967D2',
      bgHover: '#0552B5',
      text: '#FFFFFF',
      shadow: '0 2px 4px rgba(9, 103, 210, 0.2)',
      shadowHover: '0 4px 8px rgba(9, 103, 210, 0.3)',
    },
    secondary: {
      bg: '#FFFFFF',
      bgHover: '#F5F7FA',
      text: '#334E68',
      border: '#D9E2EC',
      shadow: '0 1px 3px rgba(15, 23, 42, 0.08)',
      shadowHover: '0 2px 4px rgba(15, 23, 42, 0.10)',
    },
    aiHighlight: {
      bg: 'linear-gradient(135deg, #38BEC9 0%, #2CB1BC 100%)',
      bgHover: 'linear-gradient(135deg, #2CB1BC 0%, #14919B 100%)',
      text: '#FFFFFF',
      shadow: '0 4px 12px rgba(56, 190, 201, 0.25)',
      shadowHover: '0 6px 16px rgba(56, 190, 201, 0.35)',
      glow: '0 0 20px rgba(56, 190, 201, 0.3)',
    },
    ghost: {
      bg: 'transparent',
      bgHover: '#F0F4F8',
      text: '#486581',
    },
  },

  // Alert & Insight Visual Language
  alerts: {
    critical: {
      bg: '#FEF2F2',
      border: '#FCA5A5',
      text: '#991B1B',
      icon: '#DC2626',
      glow: 'rgba(239, 68, 68, 0.1)',
    },
    high: {
      bg: '#FEF3C7',
      border: '#FCD34D',
      text: '#92400E',
      icon: '#F59E0B',
      glow: 'rgba(245, 158, 11, 0.1)',
    },
    medium: {
      bg: '#DBEAFE',
      border: '#93C5FD',
      text: '#1E40AF',
      icon: '#3B82F6',
      glow: 'rgba(59, 130, 246, 0.1)',
    },
    low: {
      bg: '#F0FDF4',
      border: '#86EFAC',
      text: '#166534',
      icon: '#10B981',
      glow: 'rgba(16, 185, 129, 0.1)',
    },
    ai: {
      bg: 'linear-gradient(135deg, #E0FCFF 0%, #BEF8FD 100%)',
      border: '#87EAF2',
      text: '#044E54',
      icon: '#38BEC9',
      glow: 'rgba(56, 190, 201, 0.15)',
    },
  },

  // Confidence Indicators
  confidence: {
    high: {
      color: '#10B981',
      bg: '#D1FAE5',
      label: 'High Confidence',
    },
    medium: {
      color: '#3B82F6',
      bg: '#DBEAFE',
      label: 'Medium Confidence',
    },
    low: {
      color: '#F59E0B',
      bg: '#FEF3C7',
      label: 'Low Confidence',
    },
  },

  // Animation Timings
  animation: {
    fast: '150ms',
    normal: '250ms',
    slow: '350ms',
    ease: 'cubic-bezier(0.4, 0, 0.2, 1)',
    spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  },

  // Z-Index Layers
  zIndex: {
    base: 0,
    dropdown: 1000,
    sticky: 1100,
    modal: 1200,
    popover: 1300,
    tooltip: 1400,
  },
};

export default designSystem;
