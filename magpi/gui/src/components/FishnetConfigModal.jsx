import React, { useState } from 'react';
import { X, Grid, Layers, HardDrive, Cpu, Settings2, Globe } from 'lucide-react';

export default function FishnetConfigModal({ isOpen, onClose, onExecute, sourceName }) {
    const [config, setConfig] = useState({
        strategy: 'custom',
        rows: 10,
        cols: 10,
        zSlice: false,
        persistToDisk: false
    });

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] backdrop-blur-sm px-4">
            <div className="bg-slate-900 border border-slate-700 rounded-lg max-w-md w-full shadow-2xl flex flex-col overflow-hidden">
                
                <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950">
                    <h2 className="text-sm font-bold text-slate-200 flex items-center uppercase tracking-wider">
                        <Grid size={16} className="mr-2 text-emerald-400" />
                        Configure Fishnet Matrix
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                        <X size={16} />
                    </button>
                </div>

                <div className="p-5 space-y-5">
                    {/* Source Information */}
                    <div className="bg-slate-800/50 p-3 rounded border border-slate-700 flex items-center">
                        <Layers size={14} className="text-blue-400 mr-2" />
                        <span className="text-xs text-slate-300 font-mono">Source: {sourceName || 'Unknown Extent'}</span>
                    </div>

                    {/* Strategy Toggle */}
                    <div>
                        <label className="text-[10px] uppercase font-bold text-slate-500 mb-2 block tracking-widest">Parsing Strategy</label>
                        <div className="flex bg-slate-950 rounded border border-slate-700 p-1">
                            <button 
                                onClick={() => setConfig(p => ({ ...p, strategy: 'custom' }))}
                                className={`flex-1 py-1.5 text-xs font-bold rounded ${config.strategy === 'custom' ? 'bg-slate-800 text-emerald-400 shadow' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                Custom Grid
                            </button>
                            <button 
                                onClick={() => setConfig(p => ({ ...p, strategy: 'mgrs' }))}
                                className={`flex-1 py-1.5 text-xs font-bold rounded flex items-center justify-center ${config.strategy === 'mgrs' ? 'bg-slate-800 text-blue-400 shadow' : 'text-slate-500 hover:text-slate-300'}`}
                                disabled
                                title="MGRS Integration coming in next Nexa-SGP patch"
                            >
                                <Globe size={12} className="mr-1" /> MGRS Presets <span className="ml-1 text-[8px] bg-slate-800 px-1 rounded border border-slate-700">WIP</span>
                            </button>
                        </div>
                    </div>

                    {/* Dimensions */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block tracking-widest flex items-center">
                                Rows (Y-Axis)
                            </label>
                            <input 
                                type="number" 
                                min="1" max="1000"
                                value={config.rows}
                                onChange={(e) => setConfig(p => ({ ...p, rows: parseInt(e.target.value) || 1 }))}
                                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm font-mono text-emerald-300 focus:outline-none focus:border-emerald-500 transition-colors"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block tracking-widest flex items-center">
                                Columns (X-Axis)
                            </label>
                            <input 
                                type="number" 
                                min="1" max="1000"
                                value={config.cols}
                                onChange={(e) => setConfig(p => ({ ...p, cols: parseInt(e.target.value) || 1 }))}
                                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm font-mono text-emerald-300 focus:outline-none focus:border-emerald-500 transition-colors"
                            />
                        </div>
                    </div>

                    {/* Advanced Toggles */}
                    <div className="space-y-3 pt-2 border-t border-slate-800">
                        <label className="flex items-center space-x-3 cursor-pointer group">
                            <div className={`w-8 h-4 rounded-full transition-colors flex items-center px-0.5 ${config.persistToDisk ? 'bg-emerald-600' : 'bg-slate-700'}`}
                                 onClick={() => setConfig(p => ({ ...p, persistToDisk: !p.persistToDisk }))}>
                                <div className={`w-3 h-3 bg-white rounded-full transition-transform shadow ${config.persistToDisk ? 'translate-x-4' : 'translate-x-0'}`} />
                            </div>
                            <span className="text-xs text-slate-400 group-hover:text-slate-200 transition-colors flex items-center">
                                <HardDrive size={12} className="mr-1" /> Persist Output to Disk
                            </span>
                        </label>

                        <label className="flex items-center space-x-3 cursor-not-allowed opacity-60">
                            <div className="w-8 h-4 rounded-full bg-slate-800 flex items-center px-0.5 border border-slate-700">
                                <div className="w-3 h-3 bg-slate-600 rounded-full" />
                            </div>
                            <span className="text-xs text-slate-500 flex items-center">
                                <Settings2 size={12} className="mr-1" /> Z-Slice / M-Value Splitting <span className="ml-2 text-[9px] bg-slate-900 px-1 rounded">Future</span>
                            </span>
                        </label>
                    </div>
                </div>

                <div className="p-4 border-t border-slate-800 bg-slate-950 flex justify-end space-x-3">
                    <button 
                        onClick={onClose} 
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold uppercase tracking-wider rounded border border-slate-700 transition-colors"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={() => onExecute(config)} 
                        className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold uppercase tracking-wider rounded border border-emerald-500 transition-colors shadow-lg shadow-emerald-900/50 flex items-center"
                    >
                        <Cpu size={14} className="mr-2" /> Execute
                    </button>
                </div>
            </div>
        </div>
    );
}
