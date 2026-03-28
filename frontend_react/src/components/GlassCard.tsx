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
