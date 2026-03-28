import React from 'react';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  backgroundImage?: string;
  hover?: boolean;
  onClick?: () => void;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const paddingMap = {
  none: '',
  sm: 'p-3',
  md: 'p-4 sm:p-6',
  lg: 'p-6 sm:p-8',
};

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  className = '',
  backgroundImage,
  hover = true,
  onClick,
  padding = 'md',
}) => {
  return (
    <div
      onClick={onClick}
      className={`
        relative overflow-hidden rounded-2xl
        bg-white/[0.03] border border-white/[0.06]
        ${paddingMap[padding]}
        ${hover ? 'transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:scale-[1.015] hover:shadow-xl hover:border-blue-500/20 hover:shadow-blue-500/5' : ''}
        ${onClick ? 'cursor-pointer' : ''}
        ${className}
      `}
    >
      {/* Background image layer */}
      {backgroundImage && (
        <div
          className="absolute inset-0 opacity-[0.03] hover:opacity-[0.08] transition-opacity duration-500 bg-cover bg-center animate-ken-burns pointer-events-none"
          style={{ backgroundImage: `url(${backgroundImage})` }}
        />
      )}
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none" />
      {/* Content */}
      <div className="relative z-10">{children}</div>
    </div>
  );
};

export default GlassCard;

// Pre-defined images for different contexts
export const CARD_IMAGES = {
  revenue: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=400&q=60',
  appointments: 'https://images.unsplash.com/photo-1506784983877-45594efa4cbe?w=400&q=60',
  patients: 'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?w=400&q=60',
  completion: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=400&q=60',
  analytics: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400&q=60',
  marketing: 'https://images.unsplash.com/photo-1533750349088-cd871a92f312?w=400&q=60',
  dental: 'https://images.unsplash.com/photo-1606811971618-4486d14f3f99?w=400&q=60',
  clinic: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=400&q=60',
  tech: 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=400&q=60',
  team: 'https://images.unsplash.com/photo-1521791136064-7986c2920216?w=400&q=60',
  calendar: 'https://images.unsplash.com/photo-1506784983877-45594efa4cbe?w=400&q=60',
  chat: 'https://images.unsplash.com/photo-1577563908411-5077b6dc7624?w=400&q=60',
  leads: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=400&q=60',
  tokens: 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=400&q=60',
  profile: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&q=60',
};
