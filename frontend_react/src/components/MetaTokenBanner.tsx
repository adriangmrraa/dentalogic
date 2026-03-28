import React, { useState } from 'react';
import { AlertTriangle, X, ExternalLink, Wifi } from 'lucide-react';

interface MetaTokenBannerProps {
  status: 'valid' | 'expiring_soon' | 'expired' | 'not_connected';
  expiresAt?: string;
  onReconnect: () => void;
}

export const MetaTokenBanner: React.FC<MetaTokenBannerProps> = ({ status, expiresAt, onReconnect }) => {
  const [dismissed, setDismissed] = useState(false);

  if (status === 'valid' || dismissed) return null;

  const config = {
    expiring_soon: {
      bg: 'bg-amber-500/10 border-amber-500/20',
      text: 'text-amber-400',
      icon: <AlertTriangle size={16} className="text-amber-400" />,
      message: `Tu conexión con Meta expira${expiresAt ? ` el ${new Date(expiresAt).toLocaleDateString()}` : ' pronto'}.`,
      action: 'Reconectar',
    },
    expired: {
      bg: 'bg-red-500/10 border-red-500/20',
      text: 'text-red-400',
      icon: <AlertTriangle size={16} className="text-red-400" />,
      message: 'Conexión con Meta expirada. Los leads no se están recibiendo.',
      action: 'Reconectar ahora',
    },
    not_connected: {
      bg: 'bg-blue-500/10 border-blue-500/20',
      text: 'text-blue-400',
      icon: <Wifi size={16} className="text-blue-400" />,
      message: 'Conecta Meta para recibir leads automáticamente.',
      action: 'Conectar',
    },
  }[status];

  return (
    <div className={`mx-4 mt-2 px-4 py-2.5 rounded-xl border flex items-center gap-3 animate-slide-up ${config.bg}`}>
      {config.icon}
      <p className={`text-sm flex-1 ${config.text}`}>{config.message}</p>
      <button
        onClick={onReconnect}
        className={`text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.10] transition-colors flex items-center gap-1.5 ${config.text}`}
      >
        <ExternalLink size={12} /> {config.action}
      </button>
      <button
        onClick={() => setDismissed(true)}
        className="text-white/30 hover:text-white/60 transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  );
};

export default MetaTokenBanner;
