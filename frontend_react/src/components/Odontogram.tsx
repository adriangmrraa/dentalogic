import React, { useState } from 'react';
import { Save, X, FileText } from 'lucide-react';
import GlassCard from './GlassCard';

// FDI Notation - International numbering
const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11];
const UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_LEFT = [31, 32, 33, 34, 35, 36, 37, 38];
const LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41];

export type ToothStatus =
  | 'healthy'
  | 'cavity'
  | 'filled'
  | 'crown'
  | 'extraction'
  | 'implant'
  | 'bridge'
  | 'root_canal'
  | 'pending';

export interface ToothRecord {
  number: number;
  status: ToothStatus;
  notes?: string;
  treatments?: string[];
  lastUpdated?: string;
}

interface OdontogramProps {
  patientId: string;
  teeth: ToothRecord[];
  onToothSelect?: (toothNumber: number) => void;
  onToothUpdate?: (toothNumber: number, status: ToothStatus, notes: string) => void;
  readOnly?: boolean;
}

const STATUS_COLORS: Record<ToothStatus, string> = {
  healthy: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  cavity: 'text-red-400 border-red-500/30 bg-red-500/10',
  filled: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
  crown: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10',
  extraction: 'text-gray-500 border-gray-500/30 bg-gray-500/10 line-through',
  implant: 'text-violet-400 border-violet-500/30 bg-violet-500/10',
  bridge: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  root_canal: 'text-orange-400 border-orange-500/30 bg-orange-500/10',
  pending: 'text-white/30 border-white/[0.08] bg-white/[0.02]',
};

const STATUS_LABELS: Record<ToothStatus, string> = {
  healthy: 'Sano',
  cavity: 'Caries',
  filled: 'Obturado',
  crown: 'Corona',
  extraction: 'Extracción',
  implant: 'Implante',
  bridge: 'Puente',
  root_canal: 'Endodoncia',
  pending: 'Pendiente',
};

const ALL_STATUSES: ToothStatus[] = [
  'healthy', 'cavity', 'filled', 'crown', 'extraction', 'implant', 'bridge', 'root_canal', 'pending'
];

const Tooth: React.FC<{
  number: number;
  record?: ToothRecord;
  isSelected: boolean;
  onClick: () => void;
}> = ({ number, record, isSelected, onClick }) => {
  const status = record?.status || 'pending';
  const colors = STATUS_COLORS[status];

  return (
    <button
      onClick={onClick}
      className={`
        relative w-10 h-12 sm:w-11 sm:h-14 rounded-lg border-2 flex flex-col items-center justify-center
        transition-all duration-200 group
        ${colors}
        ${isSelected
          ? 'ring-2 ring-blue-500/50 scale-110 animate-tooth-pop'
          : 'hover:scale-105'
        }
      `}
    >
      <span className="text-[10px] font-bold leading-none">{number}</span>
      <span className="text-[7px] uppercase font-semibold mt-0.5 opacity-70">
        {status === 'healthy' ? '✓' : status.slice(0, 3)}
      </span>
      {isSelected && (
        <div className="absolute -inset-1 border-2 border-dashed border-blue-500/30 rounded-xl animate-orbit pointer-events-none" />
      )}
    </button>
  );
};

const ToothRow: React.FC<{
  teeth: number[];
  records: ToothRecord[];
  selectedTooth: number | null;
  onSelect: (n: number) => void;
}> = ({ teeth, records, selectedTooth, onSelect }) => (
  <div className="flex gap-1 sm:gap-1.5">
    {teeth.map((n) => (
      <Tooth
        key={n}
        number={n}
        record={records.find((r) => r.number === n)}
        isSelected={selectedTooth === n}
        onClick={() => onSelect(n)}
      />
    ))}
  </div>
);

export const Odontogram: React.FC<OdontogramProps> = ({
  patientId,
  teeth,
  onToothSelect,
  onToothUpdate,
  readOnly = false,
}) => {
  const [selectedTooth, setSelectedTooth] = useState<number | null>(null);
  const [editStatus, setEditStatus] = useState<ToothStatus>('healthy');
  const [editNotes, setEditNotes] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  const handleSelect = (toothNumber: number) => {
    setSelectedTooth(toothNumber);
    onToothSelect?.(toothNumber);
    const record = teeth.find((t) => t.number === toothNumber);
    setEditStatus(record?.status || 'pending');
    setEditNotes(record?.notes || '');
    setHasChanges(false);
  };

  const handleSave = () => {
    if (selectedTooth && onToothUpdate) {
      onToothUpdate(selectedTooth, editStatus, editNotes);
      setHasChanges(false);
    }
  };

  const selectedRecord = teeth.find((t) => t.number === selectedTooth);

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Odontogram Grid */}
      <div className="flex-1">
        <GlassCard>
          {/* Legend */}
          <div className="flex flex-wrap gap-2 mb-6">
            {ALL_STATUSES.map((s) => (
              <span key={s} className={`text-[9px] px-2 py-0.5 rounded-full border font-semibold uppercase ${STATUS_COLORS[s]}`}>
                {STATUS_LABELS[s]}
              </span>
            ))}
          </div>

          {/* Upper Jaw */}
          <div className="mb-2">
            <p className="text-[10px] text-white/30 uppercase font-bold tracking-wider mb-2">Maxilar Superior</p>
            <div className="flex justify-center gap-2 sm:gap-4 flex-wrap">
              <ToothRow teeth={UPPER_RIGHT} records={teeth} selectedTooth={selectedTooth} onSelect={handleSelect} />
              <div className="w-px bg-white/[0.08] mx-1 hidden sm:block" />
              <ToothRow teeth={UPPER_LEFT} records={teeth} selectedTooth={selectedTooth} onSelect={handleSelect} />
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-white/[0.06] my-4" />

          {/* Lower Jaw */}
          <div>
            <p className="text-[10px] text-white/30 uppercase font-bold tracking-wider mb-2">Maxilar Inferior</p>
            <div className="flex justify-center gap-2 sm:gap-4 flex-wrap">
              <ToothRow teeth={LOWER_LEFT} records={teeth} selectedTooth={selectedTooth} onSelect={handleSelect} />
              <div className="w-px bg-white/[0.08] mx-1 hidden sm:block" />
              <ToothRow teeth={LOWER_RIGHT} records={teeth} selectedTooth={selectedTooth} onSelect={handleSelect} />
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Side Panel */}
      {selectedTooth && (
        <div className="w-full lg:w-72 shrink-0 animate-slide-in">
          <GlassCard>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-white">Diente #{selectedTooth}</h3>
                <span className={`text-xs font-semibold uppercase ${STATUS_COLORS[selectedRecord?.status || 'pending'].split(' ')[0]}`}>
                  {STATUS_LABELS[selectedRecord?.status || 'pending']}
                </span>
              </div>
              <button
                onClick={() => setSelectedTooth(null)}
                className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {!readOnly && (
              <>
                {/* Status Selector */}
                <div className="mb-4">
                  <label className="block text-xs font-medium text-white/40 mb-2 uppercase">Estado</label>
                  <select
                    value={editStatus}
                    onChange={(e) => { setEditStatus(e.target.value as ToothStatus); setHasChanges(true); }}
                    className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-sm focus:outline-none focus:border-blue-500/40"
                  >
                    {ALL_STATUSES.map((s) => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </div>

                {/* Notes */}
                <div className="mb-4">
                  <label className="block text-xs font-medium text-white/40 mb-2 uppercase">Notas</label>
                  <textarea
                    value={editNotes}
                    onChange={(e) => { setEditNotes(e.target.value); setHasChanges(true); }}
                    rows={3}
                    className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-sm resize-none focus:outline-none focus:border-blue-500/40"
                    placeholder="Observaciones..."
                  />
                </div>

                {/* Save Button */}
                <button
                  onClick={handleSave}
                  disabled={!hasChanges}
                  className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all
                    ${hasChanges
                      ? 'bg-white text-gray-900 hover:scale-105 active:scale-95 shadow-lg animate-pulse-glow'
                      : 'bg-white/[0.04] text-white/30 cursor-not-allowed'
                    }`}
                >
                  <Save size={16} />
                  Guardar
                </button>
              </>
            )}

            {/* Treatment History */}
            {selectedRecord?.treatments && selectedRecord.treatments.length > 0 && (
              <div className="mt-4 pt-4 border-t border-white/[0.06]">
                <h4 className="text-xs font-medium text-white/40 uppercase mb-2">Historial</h4>
                <div className="space-y-2">
                  {selectedRecord.treatments.map((t, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-white/60">
                      <FileText size={12} className="text-blue-400" />
                      <span>{t}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedRecord?.lastUpdated && (
              <p className="text-[10px] text-white/20 mt-4">
                Actualizado: {selectedRecord.lastUpdated}
              </p>
            )}
          </GlassCard>
        </div>
      )}
    </div>
  );
};

export default Odontogram;
