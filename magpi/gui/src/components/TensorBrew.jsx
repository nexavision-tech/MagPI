import React, { useState } from 'react';
import { Layers, Plus, Trash2, Cpu, Eye, Activity } from 'lucide-react';

export default function TensorBrew({ activeWorkspace }) {
  const [bands, setBands] = useState([
    { id: 1, name: 'Sentinel-2 (B4 - Red)', type: 'Optical', active: true, weight: 1.0 },
    { id: 2, name: 'Sentinel-2 (B8 - NIR)', type: 'Optical', active: true, weight: 1.2 },
    { id: 3, name: 'Sentinel-1 (VV - SAR)', type: 'Radar', active: false, weight: 0.8 },
  ]);

  if (activeWorkspace !== 'tensor_brew') return null;

  return (
    <div className="w-full h-full flex flex-col bg-slate-900 text-slate-200">
      
      {/* Header */}
      <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center shrink-0">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-indigo-900/50 rounded-lg border border-indigo-500/50">
            <Layers className="text-indigo-400" size={24} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-200 tracking-wide">Tensor Brewing Laboratory</h1>
            <p className="text-xs text-slate-500 font-mono">Fuse Multi-Spectral, SAR, and LiDAR into N-Dimensional Tensors</p>
          </div>
        </div>
        <button className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded shadow-lg transition-all flex items-center">
          <Cpu size={16} className="mr-2" /> Compile Composite Tensor
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Panel: Band Mixing Board */}
        <div className="w-1/3 min-w-[350px] border-r border-slate-800 bg-slate-900 flex flex-col">
          <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
            <h2 className="text-sm font-bold text-slate-300 uppercase tracking-widest flex items-center">
              <Activity size={14} className="mr-2 text-rose-400" /> Active Spectral Bands
            </h2>
            <button className="text-cyan-400 hover:text-cyan-300 p-1 bg-cyan-900/30 rounded border border-cyan-900/50 transition-colors">
              <Plus size={16} />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {bands.map((b, idx) => (
              <div key={b.id} className={`p-3 rounded border transition-all ${b.active ? 'bg-slate-800 border-indigo-500/50' : 'bg-slate-900 border-slate-700 opacity-50'}`}>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold text-slate-300">{b.name}</span>
                  <div className="flex space-x-2">
                    <button onClick={() => {
                      const newB = [...bands]; newB[idx].active = !newB[idx].active; setBands(newB);
                    }} className="text-slate-400 hover:text-indigo-400 transition-colors">
                      <Eye size={14} />
                    </button>
                    <button className="text-slate-500 hover:text-red-400 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <span className="text-[10px] bg-slate-700 px-2 py-0.5 rounded text-slate-300">{b.type}</span>
                  <input type="range" min="0" max="2" step="0.1" value={b.weight} 
                    onChange={(e) => {
                      const newB = [...bands]; newB[idx].weight = parseFloat(e.target.value); setBands(newB);
                    }}
                    className="flex-1 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                  />
                  <span className="text-xs font-mono text-indigo-300">{b.weight.toFixed(1)}x</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Panel: 3D Visualization Stub */}
        <div className="flex-1 bg-black relative flex items-center justify-center">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-900 to-black"></div>
          
          <div className="text-center z-10 p-8 bg-slate-900/80 backdrop-blur-md rounded-2xl border border-slate-700 max-w-md shadow-2xl animate-pulse">
            <Layers size={48} className="mx-auto text-indigo-500 mb-4" />
            <h3 className="text-xl font-black text-white mb-2">Hyperspectral Cube Visualization</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              In Phase 7, this area will render a real-time WebGL 3D Spectral Cube representation of your fused data. 
              For now, configure your composite weights on the mixing board.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
