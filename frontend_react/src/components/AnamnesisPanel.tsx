import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Save, Heart, Pill, AlertTriangle, Cigarette, FileText } from 'lucide-react';
import GlassCard from './GlassCard';

export interface AnamnesisData {
  personalHistory: {
    allergies: string[];
    medications: string[];
    chronicConditions: string[];
    surgeries: string[];
    pregnancyStatus?: 'none' | 'pregnant' | 'lactating';
  };
  dentalHistory: {
    lastVisit?: string;
    brushingFrequency: string;
    flossing: boolean;
    sensitivity: string[];
    bruxism: boolean;
    previousTreatments: string[];
  };
  habits: {
    smoking: boolean;
    alcohol: boolean;
    diet: string;
  };
  observations: string;
  consentSigned: boolean;
  consentDate?: string;
  lastUpdated: string;
  updatedBy: string;
}

interface AnamnesisPanelProps {
  patientId: string;
  anamnesis: AnamnesisData;
  onSave: (data: AnamnesisData) => void;
  readOnly?: boolean;
}

const CollapsibleSection: React.FC<{
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ title, icon, defaultOpen = false, children }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <GlassCard className="mb-3" hover={false}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between group"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">{icon}</div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
        </div>
        <div className="text-white/40 group-hover:text-white/60 transition-colors">
          {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </div>
      </button>
      {isOpen && (
        <div className="mt-4 pt-4 border-t border-white/[0.06] animate-slide-up">
          {children}
        </div>
      )}
    </GlassCard>
  );
};

const TagList: React.FC<{
  items: string[];
  onChange?: (items: string[]) => void;
  readOnly?: boolean;
  color?: string;
}> = ({ items, onChange, readOnly, color = 'blue' }) => {
  const [input, setInput] = useState('');
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    red: 'bg-red-500/10 text-red-400 border-red-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    green: 'bg-green-500/10 text-green-400 border-green-500/20',
  };

  const handleAdd = () => {
    if (input.trim() && onChange) {
      onChange([...items, input.trim()]);
      setInput('');
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {items.map((item, i) => (
          <span key={i} className={`px-2.5 py-1 rounded-full text-xs font-medium border ${colorMap[color]}`}>
            {item}
            {!readOnly && onChange && (
              <button
                onClick={() => onChange(items.filter((_, idx) => idx !== i))}
                className="ml-1.5 opacity-60 hover:opacity-100"
              >
                ×
              </button>
            )}
          </span>
        ))}
        {items.length === 0 && <span className="text-xs text-white/20">Sin registros</span>}
      </div>
      {!readOnly && onChange && (
        <div className="flex gap-2 mt-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAdd())}
            placeholder="Agregar..."
            className="flex-1 px-3 py-1.5 bg-white/[0.04] border border-white/[0.08] rounded-lg text-white text-xs focus:outline-none focus:border-blue-500/40"
          />
          <button
            onClick={handleAdd}
            className="px-3 py-1.5 bg-white/[0.06] text-white/60 rounded-lg text-xs hover:bg-white/[0.10] transition-colors"
          >
            +
          </button>
        </div>
      )}
    </div>
  );
};

const CheckField: React.FC<{
  label: string;
  checked: boolean;
  onChange?: (v: boolean) => void;
  readOnly?: boolean;
}> = ({ label, checked, onChange, readOnly }) => (
  <label className="flex items-center gap-3 cursor-pointer group">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => !readOnly && onChange?.(e.target.checked)}
      disabled={readOnly}
      className="w-4 h-4 rounded border-white/[0.12] bg-white/[0.04] text-blue-500 focus:ring-blue-500/20 disabled:opacity-50"
    />
    <span className="text-sm text-white/60 group-hover:text-white/80">{label}</span>
  </label>
);

export const AnamnesisPanel: React.FC<AnamnesisPanelProps> = ({
  patientId,
  anamnesis,
  onSave,
  readOnly = false,
}) => {
  const [data, setData] = useState<AnamnesisData>(anamnesis);
  const [hasChanges, setHasChanges] = useState(false);

  const update = (updater: (d: AnamnesisData) => AnamnesisData) => {
    setData((prev) => {
      const next = updater(prev);
      setHasChanges(true);
      return next;
    });
  };

  return (
    <div>
      {/* Personal History */}
      <CollapsibleSection title="Historia Personal" icon={<Heart size={16} />} defaultOpen>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-white/40 uppercase font-semibold mb-2 block">Alergias</label>
            <TagList
              items={data.personalHistory.allergies}
              onChange={(items) => update((d) => ({ ...d, personalHistory: { ...d.personalHistory, allergies: items } }))}
              readOnly={readOnly}
              color="red"
            />
          </div>
          <div>
            <label className="text-xs text-white/40 uppercase font-semibold mb-2 block">Medicamentos actuales</label>
            <TagList
              items={data.personalHistory.medications}
              onChange={(items) => update((d) => ({ ...d, personalHistory: { ...d.personalHistory, medications: items } }))}
              readOnly={readOnly}
              color="amber"
            />
          </div>
          <div>
            <label className="text-xs text-white/40 uppercase font-semibold mb-2 block">Condiciones crónicas</label>
            <TagList
              items={data.personalHistory.chronicConditions}
              onChange={(items) => update((d) => ({ ...d, personalHistory: { ...d.personalHistory, chronicConditions: items } }))}
              readOnly={readOnly}
            />
          </div>
          <div>
            <label className="text-xs text-white/40 uppercase font-semibold mb-2 block">Cirugías previas</label>
            <TagList
              items={data.personalHistory.surgeries}
              onChange={(items) => update((d) => ({ ...d, personalHistory: { ...d.personalHistory, surgeries: items } }))}
              readOnly={readOnly}
              color="green"
            />
          </div>
          <div>
            <label className="text-xs text-white/40 uppercase font-semibold mb-2 block">Estado de embarazo</label>
            <select
              value={data.personalHistory.pregnancyStatus || 'none'}
              onChange={(e) => update((d) => ({ ...d, personalHistory: { ...d.personalHistory, pregnancyStatus: e.target.value as any } }))}
              disabled={readOnly}
              className="px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-sm w-full focus:outline-none focus:border-blue-500/40"
            >
              <option value="none">No aplica</option>
              <option value="pregnant">Embarazada</option>
              <option value="lactating">Lactancia</option>
            </select>
          </div>
        </div>
      </CollapsibleSection>

      {/* Dental History */}
      <CollapsibleSection title="Historia Dental" icon={<FileText size={16} />}>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-white/40 uppercase font-semibold mb-2 block">Última visita</label>
            <input
              type="date"
              value={data.dentalHistory.lastVisit || ''}
              onChange={(e) => update((d) => ({ ...d, dentalHistory: { ...d.dentalHistory, lastVisit: e.target.value } }))}
              disabled={readOnly}
              className="px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-sm w-full focus:outline-none focus:border-blue-500/40"
            />
          </div>
          <div>
            <label className="text-xs text-white/40 uppercase font-semibold mb-2 block">Frecuencia de cepillado</label>
            <select
              value={data.dentalHistory.brushingFrequency}
              onChange={(e) => update((d) => ({ ...d, dentalHistory: { ...d.dentalHistory, brushingFrequency: e.target.value } }))}
              disabled={readOnly}
              className="px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-sm w-full focus:outline-none focus:border-blue-500/40"
            >
              <option value="1x">1 vez al día</option>
              <option value="2x">2 veces al día</option>
              <option value="3x">3 veces al día</option>
              <option value="irregular">Irregular</option>
            </select>
          </div>
          <div className="space-y-2">
            <CheckField label="Usa hilo dental" checked={data.dentalHistory.flossing} onChange={(v) => update((d) => ({ ...d, dentalHistory: { ...d.dentalHistory, flossing: v } }))} readOnly={readOnly} />
            <CheckField label="Bruxismo" checked={data.dentalHistory.bruxism} onChange={(v) => update((d) => ({ ...d, dentalHistory: { ...d.dentalHistory, bruxism: v } }))} readOnly={readOnly} />
          </div>
          <div>
            <label className="text-xs text-white/40 uppercase font-semibold mb-2 block">Sensibilidades</label>
            <TagList
              items={data.dentalHistory.sensitivity}
              onChange={(items) => update((d) => ({ ...d, dentalHistory: { ...d.dentalHistory, sensitivity: items } }))}
              readOnly={readOnly}
              color="amber"
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* Habits */}
      <CollapsibleSection title="Hábitos" icon={<Cigarette size={16} />}>
        <div className="space-y-3">
          <CheckField label="Fumador" checked={data.habits.smoking} onChange={(v) => update((d) => ({ ...d, habits: { ...d.habits, smoking: v } }))} readOnly={readOnly} />
          <CheckField label="Consumo de alcohol" checked={data.habits.alcohol} onChange={(v) => update((d) => ({ ...d, habits: { ...d.habits, alcohol: v } }))} readOnly={readOnly} />
          <div>
            <label className="text-xs text-white/40 uppercase font-semibold mb-2 block">Dieta</label>
            <input
              type="text"
              value={data.habits.diet}
              onChange={(e) => update((d) => ({ ...d, habits: { ...d.habits, diet: e.target.value } }))}
              disabled={readOnly}
              className="px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-sm w-full focus:outline-none focus:border-blue-500/40"
              placeholder="Ej: Alta en azúcares..."
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* Observations */}
      <CollapsibleSection title="Observaciones" icon={<AlertTriangle size={16} />}>
        <textarea
          value={data.observations}
          onChange={(e) => update((d) => ({ ...d, observations: e.target.value }))}
          disabled={readOnly}
          rows={4}
          className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-sm resize-none focus:outline-none focus:border-blue-500/40"
          placeholder="Observaciones generales del paciente..."
        />
        <div className="mt-3">
          <CheckField
            label="Consentimiento informado firmado"
            checked={data.consentSigned}
            onChange={(v) => update((d) => ({ ...d, consentSigned: v, consentDate: v ? new Date().toISOString() : undefined }))}
            readOnly={readOnly}
          />
        </div>
      </CollapsibleSection>

      {/* Save */}
      {!readOnly && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-[10px] text-white/20">
            Última actualización: {data.lastUpdated} por {data.updatedBy}
          </span>
          <button
            onClick={() => { onSave(data); setHasChanges(false); }}
            disabled={!hasChanges}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium transition-all
              ${hasChanges
                ? 'bg-white text-gray-900 hover:scale-105 active:scale-95 shadow-lg animate-pulse-glow'
                : 'bg-white/[0.04] text-white/30 cursor-not-allowed'
              }`}
          >
            <Save size={16} />
            Guardar anamnesis
          </button>
        </div>
      )}
    </div>
  );
};

export default AnamnesisPanel;
