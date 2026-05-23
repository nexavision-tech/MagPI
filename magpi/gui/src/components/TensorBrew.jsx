import React, { useState } from 'react';
import { Layers, Plus, Trash2, Cpu, Eye, Activity, Sliders, Hexagon, Maximize, GitBranch, Settings, Grid } from 'lucide-react';

export default function TensorBrew({ activeWorkspace }) {
  // State for Left Panel: Data Cubes and RGB Gun Mixers
  const [bands, setBands] = useState([
    { id: 1, name: 'Sentinel-2 (B4 - Red)', type: 'Optical', active: true, weight: 1.0 },
    { id: 2, name: 'Sentinel-2 (B8 - NIR)', type: 'Optical', active: true, weight: 1.2 },
    { id: 3, name: 'Sentinel-1 (VV - SAR)', type: 'Radar', active: true, weight: 0.8 },
  ]);

  const [rgbGuns, setRgbGuns] = useState({
    red: 2,   // mapping to band id
    green: 1,
    blue: 3
  });

  // State for Right Panel: Tabs and Kernel Brewer
  const [rightTab, setRightTab] = useState('kernel'); // 'kernel', 'spectral', 'ml'
  const [kernelMatrix, setKernelMatrix] = useState([
    [0, -1, 0],
    [-1, 5, -1],
    [0, -1, 0]
  ]);

  // State for ML Config
  const [mlConfig, setMlConfig] = useState({
    modelRepo: 'huggingface/deep-earth-v2',
    activation: 'ReLU',
    epochs: 50,
    batchSize: 16,
    ganRes: '2x'
  });

  if (activeWorkspace !== 'tensor_brew') return null;

  const handleKernelChange = (row, col, value) => {
    const newKernel = [...kernelMatrix];
    newKernel[row][col] = parseFloat(value) || 0;
    setKernelMatrix(newKernel);
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-900 text-slate-200 font-sans">
      
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
        
        {/* Left Panel: Band Mixing Board & RGB Guns */}
        <div className="w-[350px] shrink-0 border-r border-slate-800 bg-slate-900 flex flex-col z-10 shadow-xl">
          
          <div className="p-4 border-b border-slate-800 bg-slate-950">
            <h2 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center mb-4">
              <Sliders size={14} className="mr-2 text-rose-400" /> RGB Gun Assigner
            </h2>
            <div className="space-y-3">
              {['red', 'green', 'blue'].map((color) => (
                <div key={color} className="flex items-center space-x-3">
                  <div className={`w-3 h-3 rounded-full bg-${color}-500 shadow-[0_0_8px_currentColor]`} />
                  <span className="text-xs font-bold uppercase w-12 text-slate-400">{color}</span>
                  <select 
                    value={rgbGuns[color]}
                    onChange={(e) => setRgbGuns({...rgbGuns, [color]: parseInt(e.target.value)})}
                    className="flex-1 bg-slate-800 border border-slate-700 text-xs text-slate-300 rounded p-1.5 focus:border-indigo-500 outline-none"
                  >
                    {bands.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
            <h2 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center">
              <Activity size={14} className="mr-2 text-cyan-400" /> Tensor Data Cubes
            </h2>
            <button className="text-cyan-400 hover:text-cyan-300 p-1 bg-cyan-900/30 rounded border border-cyan-900/50 transition-colors">
              <Plus size={14} />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
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
                  <span className="text-[9px] font-bold bg-slate-700 px-2 py-0.5 rounded text-slate-300 uppercase">{b.type}</span>
                  <input type="range" min="0" max="2" step="0.1" value={b.weight} 
                    onChange={(e) => {
                      const newB = [...bands]; newB[idx].weight = parseFloat(e.target.value); setBands(newB);
                    }}
                    className="flex-1 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                  />
                  <span className="text-[10px] font-mono text-indigo-300">{b.weight.toFixed(1)}x</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Center Panel: The Visual Monitor */}
        <div className="flex-1 bg-black relative flex flex-col overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-900/10 via-slate-900 to-black pointer-events-none"></div>
          
          {/* Monitor Toolbar */}
          <div className="h-10 border-b border-slate-800 bg-slate-900/50 backdrop-blur z-10 flex items-center justify-between px-4">
             <div className="flex items-center space-x-4">
               <span className="text-[10px] text-slate-400 font-mono">CHIP_DIMS: [256, 256, {bands.filter(b=>b.active).length}]</span>
               <span className="text-[10px] text-slate-400 font-mono">PROJECTION: EPSG:4326</span>
             </div>
             <div className="flex items-center space-x-2 text-slate-400">
                <button className="p-1 hover:text-white"><Maximize size={14}/></button>
             </div>
          </div>

          {/* Actual Viewport Area (Simulated for now) */}
          <div className="flex-1 flex items-center justify-center p-8 z-10">
            <div className="w-[512px] h-[512px] bg-slate-900 rounded border border-slate-700 shadow-[0_0_50px_rgba(0,0,0,0.5)] flex items-center justify-center relative overflow-hidden group">
               {/* Dummy Visualization Grid pattern */}
               <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(#334155 1px, transparent 1px), linear-gradient(90deg, #334155 1px, transparent 1px)', backgroundSize: '32px 32px' }}></div>
               
               <div className="text-center z-20 bg-black/60 p-6 rounded-xl border border-slate-700 backdrop-blur-md transition-opacity group-hover:opacity-20">
                 <Hexagon size={48} className="mx-auto text-indigo-500 mb-4 animate-pulse" />
                 <h3 className="text-sm font-black text-white mb-1 uppercase tracking-widest">Active Monitor</h3>
                 <p className="text-[10px] text-slate-400">WebGL Tensor Rendering Active</p>
               </div>
            </div>
          </div>
        </div>

        {/* Right Panel: Kernel Brewer & ML Config */}
        <div className="w-[320px] shrink-0 border-l border-slate-800 bg-slate-900 flex flex-col z-10 shadow-xl">
           
           {/* Right Tabs */}
           <div className="flex border-b border-slate-800 bg-slate-950">
             <button onClick={()=>setRightTab('kernel')} className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-widest ${rightTab === 'kernel' ? 'text-indigo-400 border-b-2 border-indigo-500 bg-slate-900' : 'text-slate-500 hover:text-slate-300'}`}>Kernel</button>
             <button onClick={()=>setRightTab('spectral')} className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-widest ${rightTab === 'spectral' ? 'text-pink-400 border-b-2 border-pink-500 bg-slate-900' : 'text-slate-500 hover:text-slate-300'}`}>Spectral</button>
             <button onClick={()=>setRightTab('ml')} className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-widest ${rightTab === 'ml' ? 'text-emerald-400 border-b-2 border-emerald-500 bg-slate-900' : 'text-slate-500 hover:text-slate-300'}`}>ML Model</button>
           </div>

           <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              
              {/* KERNEL BREWER TAB */}
              {rightTab === 'kernel' && (
                <div className="animate-fadeIn">
                  <h3 className="text-xs font-bold text-slate-300 mb-4 uppercase tracking-widest flex items-center">
                    <Grid size={14} className="mr-2 text-indigo-400" /> Convolution Matrix
                  </h3>
                  <p className="text-[10px] text-slate-500 mb-4 leading-relaxed">
                    Design custom 3x3 spatial filters (GLCM, Edge Detection, Sharpening) to apply to your tensor cubes before ML ingestion.
                  </p>

                  <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 flex justify-center mb-4">
                    <div className="grid grid-cols-3 gap-2">
                      {kernelMatrix.map((row, rIdx) => (
                        row.map((val, cIdx) => (
                          <input 
                            key={`${rIdx}-${cIdx}`}
                            type="number"
                            value={val}
                            onChange={(e) => handleKernelChange(rIdx, cIdx, e.target.value)}
                            className="w-12 h-12 bg-slate-900 border border-slate-700 text-center text-sm font-mono text-indigo-300 rounded focus:border-indigo-500 outline-none"
                          />
                        ))
                      ))}
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <button onClick={() => setKernelMatrix([[0,0,0],[0,1,0],[0,0,0]])} className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 rounded border border-slate-700 transition-colors">Identity Kernel</button>
                    <button onClick={() => setKernelMatrix([[-1,-1,-1],[-1,8,-1],[-1,-1,-1]])} className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 rounded border border-slate-700 transition-colors">Edge Detection</button>
                    <button onClick={() => setKernelMatrix([[0,-1,0],[-1,5,-1],[0,-1,0]])} className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 rounded border border-slate-700 transition-colors">Sharpen</button>
                  </div>
                </div>
              )}

              {/* SPECTRAL TAB */}
              {rightTab === 'spectral' && (
                <div className="animate-fadeIn">
                  <h3 className="text-xs font-bold text-slate-300 mb-4 uppercase tracking-widest flex items-center">
                    <Activity size={14} className="mr-2 text-pink-400" /> Signal Processing
                  </h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[10px] uppercase text-slate-500 font-bold mb-1">Algorithm</label>
                      <select className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-300 outline-none focus:border-pink-500">
                        <option>Spectral Angle Mapper (SAM)</option>
                        <option>Principal Component Analysis</option>
                        <option>Tasseled Cap</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase text-slate-500 font-bold mb-1">Target Endmember Library</label>
                      <select className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-300 outline-none focus:border-pink-500">
                        <option>USGS Spectral Library v7</option>
                        <option>ASTER Spectral Library</option>
                        <option>Custom ROI Extraction</option>
                      </select>
                    </div>

                    <button className="w-full py-2 bg-pink-600/20 text-pink-400 border border-pink-500/50 hover:bg-pink-600/40 rounded text-xs font-bold transition-colors">
                      Process Spectral Signatures
                    </button>
                  </div>
                </div>
              )}

              {/* ML MODEL TAB */}
              {rightTab === 'ml' && (
                <div className="animate-fadeIn">
                  <h3 className="text-xs font-bold text-slate-300 mb-4 uppercase tracking-widest flex items-center">
                    <GitBranch size={14} className="mr-2 text-emerald-400" /> HuggingFace Interface
                  </h3>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-[10px] uppercase text-slate-500 font-bold mb-1">Model Repository (Hub)</label>
                      <input 
                        type="text" 
                        value={mlConfig.modelRepo}
                        onChange={e => setMlConfig({...mlConfig, modelRepo: e.target.value})}
                        className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-emerald-300 font-mono outline-none focus:border-emerald-500" 
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] uppercase text-slate-500 font-bold mb-1">Epochs</label>
                        <input 
                          type="number" 
                          value={mlConfig.epochs}
                          onChange={e => setMlConfig({...mlConfig, epochs: e.target.value})}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-300 outline-none focus:border-emerald-500" 
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase text-slate-500 font-bold mb-1">Batch Size</label>
                        <input 
                          type="number" 
                          value={mlConfig.batchSize}
                          onChange={e => setMlConfig({...mlConfig, batchSize: e.target.value})}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-300 outline-none focus:border-emerald-500" 
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase text-slate-500 font-bold mb-1">Activation Function</label>
                      <select 
                        value={mlConfig.activation}
                        onChange={e => setMlConfig({...mlConfig, activation: e.target.value})}
                        className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-300 outline-none focus:border-emerald-500"
                      >
                        <option>ReLU</option>
                        <option>LeakyReLU</option>
                        <option>Sigmoid</option>
                        <option>Swish</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase text-slate-500 font-bold mb-1">GAN Res Multiplier</label>
                      <select 
                        value={mlConfig.ganRes}
                        onChange={e => setMlConfig({...mlConfig, ganRes: e.target.value})}
                        className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-300 outline-none focus:border-emerald-500"
                      >
                        <option>1x (Native)</option>
                        <option>2x</option>
                        <option>4x (Super Resolution)</option>
                      </select>
                    </div>

                    <button className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold transition-colors flex justify-center items-center">
                      <Settings size={14} className="mr-2" /> Commit Hyperparameters
                    </button>
                  </div>
                </div>
              )}

           </div>
        </div>

      </div>
    </div>
  );
}
