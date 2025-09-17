import React, { useState } from 'react';
import DiagnosticsPanel from './DiagnosticsPanel';

interface ConfigurationScreenProps {
  title: string;
  description: string;
  value: number;
  onValueChange: (newValue: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
  max: number;
    children?: React.ReactNode; // extra controls (e.g., toggles)
}

export const ConfigurationScreen: React.FC<ConfigurationScreenProps> = ({
    title,
    description,
    value,
    onValueChange,
    onConfirm,
    onCancel,
    max,
    children,
}) => {
    const [showDiagnostics, setShowDiagnostics] = useState(false);
  return (
    <div className="w-full max-w-2xl p-8 bg-gray-800 rounded-xl shadow-2xl flex flex-col items-center space-y-6 animate-fade-in">
        <h2 className="text-2xl font-bold text-white">{title}</h2>
        <p className="text-center text-gray-400">
            {description}
        </p>
                <button
                    type="button"
                    onClick={() => setShowDiagnostics(s=>!s)}
                    className="px-3 py-2 text-xs rounded-md bg-gray-700 hover:bg-gray-600 text-teal-300 border border-gray-600 self-end"
                    style={{marginTop:-20}}>
                    {showDiagnostics ? 'Esconder Diagnósticos' : 'Mostrar Diagnósticos'}
                </button>
                {showDiagnostics && (
                    <div className="w-full">
                        <DiagnosticsPanel />
                    </div>
                )}
                {children && (
                    <div className="w-full mt-2 p-3 rounded-md bg-gray-700/40 border border-gray-700 text-sm text-gray-300 space-y-2">
                        {children}
                    </div>
                )}
        
        <div className="w-full space-y-4">
            <label htmlFor="chunk-slider" className="block text-lg font-semibold text-center text-gray-200">
                Nível de Granularidade: <span className="font-bold text-teal-300">{value}</span> pedaços
            </label>
            <input
                id="chunk-slider"
                type="range"
                min="1"
                max={max}
                value={value}
                onChange={(e) => onValueChange(parseInt(e.target.value, 10))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer range-lg"
            />
            <div className="flex justify-between text-xs text-gray-500">
                <span>Menos Pedaços (Rápido)</span>
                <span>Mais Pedaços (Preciso)</span>
            </div>
        </div>

        <div className="w-full flex items-center justify-between space-x-4 mt-2">
            <button
                onClick={onCancel}
                className="w-1/3 px-6 py-3 bg-gray-600 text-white font-bold rounded-md hover:bg-gray-500 transition-colors text-lg"
            >
                Voltar
            </button>
            <button
                onClick={onConfirm}
                className="w-2/3 px-6 py-3 bg-teal-600 text-white font-bold rounded-md hover:bg-teal-500 transition-colors text-lg"
            >
                Iniciar Processamento
            </button>
        </div>
    </div>
  );
};