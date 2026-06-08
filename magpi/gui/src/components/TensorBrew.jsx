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
  const [rightTab, setRightTab] = useState('kernel'); // 'kernel', 'spectral', 'rf', 'ml'
  const [kernelSize, setKernelSize] = useState(3);
  const [kernelMatrix, setKernelMatrix] = useState([
    [0, -1, 0],
    [-1, 5, -1],
    [0, -1, 0]
  ]);

  const updateKernelSize = (size) => {
    setKernelSize(size);
    const newKernel = Array(size).fill(0).map(() => Array(size).fill(0));
    // Try to center a basic identity if going to larger size
    const center = Math.floor(size / 2);
    newKernel[center][center] = 1;
    setKernelMatrix(newKernel);
  };

  // State for ML Config (Neural Architect)
  const [nnLayers, setNnLayers] = useState([
    { id: 1, type: 'Input(Tensor)', filters: '-', kernel: '-', activation: '-' },
    { id: 2, type: 'Conv2D', filters: '64', kernel: '3x3', activation: 'ReLU' },
    { id: 3, type: 'Dropout', filters: '-', kernel: '-', activation: 'Rate: 0.5' },
    { id: 4, type: 'Dense(Logits)', filters: '1', kernel: '-', activation: 'Sigmoid' }
  ]);
  const [learningRate, setLearningRate] = useState(0.001);

  // State for Data Stewardship (Center Panel)
  const [normalization, setNormalization] = useState('raw'); // 'raw', 'minmax', 'zscore'
  const [nodataHandling, setNodataHandling] = useState('nan'); // 'nan', 'zero'

  // Compilation State
  const [isCompiling, setIsCompiling] = useState(false);
  const [compileOutput, setCompileOutput] = useState('');
  const [showTerminal, setShowTerminal] = useState(false);

  const generatePyTorchCode = () => {
    let code = `import torch\nimport torch.nn as nn\n\nclass MagPI_Net(nn.Module):\n    def __init__(self):\n        super().__init__()\n        self.model = nn.Sequential(\n`;
    
    nnLayers.forEach(layer => {
      if (layer.type === 'Input(Tensor)') {
         code += `            # Input Layer (Handled by DataLoader)\n`;
      } else if (layer.type === 'Conv2D') {
         code += `            nn.Conv2d(in_channels=3, out_channels=${layer.filters}, kernel_size=${layer.kernel.split('x')[0]}, padding=1),\n`;
         if (layer.activation && layer.activation !== '-') {
             if(layer.activation === 'ReLU') code += `            nn.ReLU(),\n`;
             if(layer.activation === 'Sigmoid') code += `            nn.Sigmoid(),\n`;
         }
      } else if (layer.type === 'Dropout') {
         const rate = layer.activation.replace('Rate: ', '');
         code += `            nn.Dropout(p=${rate}),\n`;
      } else if (layer.type === 'Dense(Logits)') {
         code += `            nn.AdaptiveAvgPool2d((1,1)),\n`;
         code += `            nn.Flatten(),\n`;
         code += `            nn.Linear(64, ${layer.filters}),\n`;
         if (layer.activation && layer.activation !== '-') {
             if(layer.activation === 'ReLU') code += `            nn.ReLU(),\n`;
             if(layer.activation === 'Sigmoid') code += `            nn.Sigmoid(),\n`;
         }
      }
    });

    code += `        )\n\n    def forward(self, x):\n        return self.model(x)\n\n`;
    code += `print("--- MAGPI TENSOR BREW (PYTORCH GRAPH COMPILER) ---")\n`;
    code += `print(f"Optimizer LR: ${learningRate}")\n`;
    code += `model = MagPI_Net()\n`;
    code += `print(model)\n`;
    code += `try:\n`;
    code += `    from torchsummary import summary\n`;
    code += `    summary(model, (3, 256, 256))\n`;
    code += `except Exception as e:\n`;
    code += `    print("Note: Install torchsummary to view layer parameter count.")\n`;
    return code;
  };

  const compileModelGraph = async () => {
    setIsCompiling(true);
    setShowTerminal(true);
    setCompileOutput('Generating PyTorch script...\n');
    
    const code = generatePyTorchCode();
    setCompileOutput(prev => prev + 'Dispatching graph to MagPI Daemon (/api/run)...\n\n');

    try {
      const res = await fetch(`http://${window.location.hostname}:8282/api/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      const data = await res.json();
      
      if (data.status === 'success') {
         setCompileOutput(prev => prev + data.stdout);
      } else {
         setCompileOutput(prev => prev + "[ERROR] " + data.stderr);
      }
    } catch (e) {
      setCompileOutput(prev => prev + `[NETWORK ERROR] Could not connect to MagPI Daemon at 8080. Is it running? (${e.message})`);
    }
    
    setIsCompiling(false);
  };

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

          {/* Actual Viewport Area & Data Stewardship Console */}
          <div className="flex-1 flex flex-col items-center justify-center p-8 z-10 space-y-4">
            
            {/* 256x256 WebGL Chip Dummy */}
            <div className="w-[384px] h-[384px] bg-slate-900 rounded border border-slate-700 shadow-[0_0_50px_rgba(0,0,0,0.5)] flex items-center justify-center relative overflow-hidden group">
               <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(#334155 1px, transparent 1px), linear-gradient(90deg, #334155 1px, transparent 1px)', backgroundSize: '32px 32px' }}></div>
               <div className="text-center z-20 bg-black/60 p-6 rounded-xl border border-slate-700 backdrop-blur-md transition-opacity group-hover:opacity-20">
                 <Hexagon size={48} className="mx-auto text-indigo-500 mb-4 animate-pulse" />
                 <h3 className="text-sm font-black text-white mb-1 uppercase tracking-widest">Active Monitor</h3>
                 <p className="text-[10px] text-slate-400">WebGL Tensor Rendering Active</p>
               </div>
            </div>

            {/* Data Stewardship Controls */}
            <div className="w-[384px] bg-slate-900/80 backdrop-blur border border-slate-700 rounded-lg p-3">
               <h4 className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mb-2 flex items-center">
                 <Settings size={12} className="mr-2 text-indigo-400" /> Data Stewardship Console
               </h4>
               
               <div className="flex space-x-2 mb-2">
                 <button onClick={()=>setNormalization('raw')} className={`flex-1 py-1 text-[9px] font-bold uppercase rounded border ${normalization === 'raw' ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500' : 'bg-slate-800 text-slate-500 border-slate-700 hover:text-slate-300'}`}>Raw NumPy</button>
                 <button onClick={()=>setNormalization('minmax')} className={`flex-1 py-1 text-[9px] font-bold uppercase rounded border ${normalization === 'minmax' ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500' : 'bg-slate-800 text-slate-500 border-slate-700 hover:text-slate-300'}`}>Min-Max (0-1)</button>
                 <button onClick={()=>setNormalization('zscore')} className={`flex-1 py-1 text-[9px] font-bold uppercase rounded border ${normalization === 'zscore' ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500' : 'bg-slate-800 text-slate-500 border-slate-700 hover:text-slate-300'}`}>Z-Score</button>
               </div>

               <div className="flex space-x-2">
                 <div className="flex-1 bg-slate-950 rounded p-2 border border-slate-800 flex justify-between items-center">
                   <span className="text-[9px] text-slate-500 uppercase">NoData Mask</span>
                   <select value={nodataHandling} onChange={(e)=>setNodataHandling(e.target.value)} className="bg-transparent text-[9px] text-indigo-300 outline-none cursor-pointer">
                     <option value="nan">np.nan</option>
                     <option value="zero">Zero (0)</option>
                   </select>
                 </div>
                 <div className="flex-1 bg-slate-950 rounded p-2 border border-slate-800 flex flex-col justify-center">
                   <div className="flex justify-between text-[8px] text-slate-500 font-mono mb-1">
                     <span>MIN: {normalization==='minmax' ? '0.00' : '-1.24'}</span>
                     <span>MAX: {normalization==='minmax' ? '1.00' : '8.92'}</span>
                   </div>
                   <div className="flex justify-between text-[8px] text-slate-500 font-mono">
                     <span>μ: {normalization==='zscore' ? '0.00' : '3.14'}</span>
                     <span>σ: {normalization==='zscore' ? '1.00' : '0.85'}</span>
                   </div>
                 </div>
               </div>
            </div>
          </div>
        </div>

        {/* Right Panel: Kernel Brewer & ML Config */}
        <div className="w-[320px] shrink-0 border-l border-slate-800 bg-slate-900 flex flex-col z-10 shadow-xl">
           
           {/* Right Tabs */}
           <div className="flex border-b border-slate-800 bg-slate-950 overflow-x-auto custom-scrollbar">
             <button onClick={()=>setRightTab('kernel')} className={`shrink-0 px-3 py-3 text-[10px] font-bold uppercase tracking-widest ${rightTab === 'kernel' ? 'text-indigo-400 border-b-2 border-indigo-500 bg-slate-900' : 'text-slate-500 hover:text-slate-300'}`}>Kernel</button>
             <button onClick={()=>setRightTab('spectral')} className={`shrink-0 px-3 py-3 text-[10px] font-bold uppercase tracking-widest ${rightTab === 'spectral' ? 'text-pink-400 border-b-2 border-pink-500 bg-slate-900' : 'text-slate-500 hover:text-slate-300'}`}>Spectral</button>
             <button onClick={()=>setRightTab('rf')} className={`shrink-0 px-3 py-3 text-[10px] font-bold uppercase tracking-widest ${rightTab === 'rf' ? 'text-amber-400 border-b-2 border-amber-500 bg-slate-900' : 'text-slate-500 hover:text-slate-300'}`}>RF/Gini</button>
             <button onClick={()=>setRightTab('ml')} className={`shrink-0 px-3 py-3 text-[10px] font-bold uppercase tracking-widest ${rightTab === 'ml' ? 'text-emerald-400 border-b-2 border-emerald-500 bg-slate-900' : 'text-slate-500 hover:text-slate-300'}`}>Neural Architect</button>
           </div>

           <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              
              {/* KERNEL BREWER TAB */}
              {rightTab === 'kernel' && (
                <div className="animate-fadeIn">
                  <h3 className="text-xs font-bold text-slate-300 mb-4 uppercase tracking-widest flex items-center">
                    <Grid size={14} className="mr-2 text-indigo-400" /> Convolution Matrix
                  </h3>
                  <div className="flex justify-between items-center mb-4">
                    <p className="text-[10px] text-slate-500 leading-relaxed max-w-[200px]">
                      Design custom spatial filters (GLCM, Edge Detection, Sharpening).
                    </p>
                    <select 
                      value={kernelSize} 
                      onChange={(e) => updateKernelSize(parseInt(e.target.value))}
                      className="bg-slate-950 border border-slate-700 text-xs text-indigo-300 rounded px-2 py-1 outline-none focus:border-indigo-500"
                    >
                      <option value={3}>3x3</option>
                      <option value={5}>5x5</option>
                      <option value={7}>7x7</option>
                      <option value={9}>9x9</option>
                      <option value={15}>15x15</option>
                    </select>
                  </div>

                  <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 flex justify-center mb-4 overflow-x-auto custom-scrollbar">
                    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${kernelSize}, minmax(0, 1fr))` }}>
                      {kernelMatrix.map((row, rIdx) => (
                        row.map((val, cIdx) => (
                          <input 
                            key={`${rIdx}-${cIdx}`}
                            type="number"
                            value={val}
                            onChange={(e) => handleKernelChange(rIdx, cIdx, e.target.value)}
                            className={`bg-slate-900 border border-slate-700 text-center text-xs font-mono text-indigo-300 rounded focus:border-indigo-500 outline-none ${kernelSize >= 9 ? 'w-8 h-8' : 'w-12 h-12'}`}
                          />
                        ))
                      ))}
                    </div>
                  </div>
                  
                  {kernelSize === 3 && (
                    <div className="space-y-2">
                      <button onClick={() => setKernelMatrix([[0,0,0],[0,1,0],[0,0,0]])} className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 rounded border border-slate-700 transition-colors">Identity Kernel</button>
                      <button onClick={() => setKernelMatrix([[-1,-1,-1],[-1,8,-1],[-1,-1,-1]])} className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 rounded border border-slate-700 transition-colors">Edge Detection</button>
                      <button onClick={() => setKernelMatrix([[0,-1,0],[-1,5,-1],[0,-1,0]])} className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 rounded border border-slate-700 transition-colors">Sharpen</button>
                    </div>
                  )}
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

              {/* RANDOM FOREST / GINI TAB */}
              {rightTab === 'rf' && (
                <div className="animate-fadeIn">
                  <h3 className="text-xs font-bold text-slate-300 mb-4 uppercase tracking-widest flex items-center">
                    <Activity size={14} className="mr-2 text-amber-400" /> Random Forest
                  </h3>
                  <p className="text-[10px] text-slate-500 mb-4 leading-relaxed">
                    Evaluate GLCM textural features and spectral bands using Gini Impurity to select the optimal predictors for Palm Detection.
                  </p>

                  <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 mb-4">
                    <h4 className="text-[10px] font-bold text-amber-300 uppercase mb-3">Feature Importance (Gini)</h4>
                    <div className="space-y-3">
                      {/* Mock Chart Data */}
                      {[
                        { name: "GLCM_Contrast_9x9", val: 85, color: "bg-amber-500" },
                        { name: "GLCM_Entropy_15x15", val: 72, color: "bg-amber-600" },
                        { name: "Sentinel2_B8_NIR", val: 54, color: "bg-amber-700" },
                        { name: "GLCM_Variance_5x5", val: 32, color: "bg-amber-800" },
                        { name: "Sentinel2_B4_Red", val: 18, color: "bg-amber-900" }
                      ].map(f => (
                        <div key={f.name}>
                          <div className="flex justify-between text-[9px] mb-1">
                            <span className="text-slate-300 font-mono">{f.name}</span>
                            <span className="text-slate-500">{f.val}%</span>
                          </div>
                          <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
                            <div className={`h-full ${f.color}`} style={{ width: `${f.val}%` }}></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button className="w-full py-2 bg-amber-600/20 text-amber-400 border border-amber-500/50 hover:bg-amber-600/40 rounded text-xs font-bold transition-colors">
                    Train RF & Calculate Gini
                  </button>
                  <button className="w-full mt-2 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded text-xs transition-colors border border-slate-700">
                    Auto-Route Top 3 Features to RGB
                  </button>
                </div>
              )}

              {/* NEURAL ARCHITECT TAB */}
              {rightTab === 'ml' && (
                <div className="animate-fadeIn">
                  <h3 className="text-xs font-bold text-slate-300 mb-4 uppercase tracking-widest flex items-center">
                    <Cpu size={14} className="mr-2 text-emerald-400" /> Neural Architect
                  </h3>
                  
                  <div className="mb-4">
                    <p className="text-[10px] text-slate-500 mb-2 leading-relaxed">
                      Construct a custom PyTorch/TensorFlow graph layer-by-layer for deep feature extraction.
                    </p>
                    <div className="flex justify-between items-center bg-slate-950 border border-slate-800 rounded px-3 py-2">
                       <span className="text-[10px] uppercase font-bold text-slate-400">Learning Rate</span>
                       <input type="number" step="0.001" value={learningRate} onChange={(e)=>setLearningRate(e.target.value)} className="w-16 bg-slate-900 text-[10px] text-emerald-300 border border-slate-700 rounded px-1 outline-none text-right" />
                    </div>
                  </div>

                  {/* Layer Stacker */}
                  <div className="space-y-2 mb-4">
                    {nnLayers.map((layer, i) => (
                      <div key={layer.id} className="bg-slate-950 border border-slate-800 rounded p-2 flex flex-col group relative">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">{i}: {layer.type}</span>
                          {i !== 0 && (
                            <button className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Trash2 size={10} />
                            </button>
                          )}
                        </div>
                        <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                          <span>F:{layer.filters}</span>
                          <span>K:{layer.kernel}</span>
                          <span className="text-slate-400">{layer.activation}</span>
                        </div>
                      </div>
                    ))}
                    
                    <button className="w-full py-2 border border-dashed border-slate-700 text-slate-500 hover:text-emerald-400 hover:border-emerald-500/50 rounded flex justify-center items-center text-[10px] font-bold uppercase transition-colors">
                      <Plus size={12} className="mr-1" /> Add Layer
                    </button>
                  </div>

                  <button onClick={compileModelGraph} disabled={isCompiling} className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold transition-colors flex justify-center items-center">
                    <Settings size={14} className="mr-2" /> {isCompiling ? 'Compiling...' : 'Compile Model Graph'}
                  </button>
                </div>
              )}

           </div>
        </div>

      </div>

      {/* Terminal Modal for Compilation Output */}
      {showTerminal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-8">
           <div className="w-full max-w-4xl h-[80vh] bg-slate-950 border border-slate-700 rounded-lg shadow-2xl flex flex-col overflow-hidden animate-fadeIn">
              <div className="h-10 bg-slate-900 border-b border-slate-800 flex justify-between items-center px-4 shrink-0">
                 <div className="flex items-center text-emerald-400 font-mono text-xs font-bold uppercase">
                   <Cpu size={14} className="mr-2" /> PyTorch Compilation Output
                 </div>
                 <button onClick={() => setShowTerminal(false)} className="text-slate-500 hover:text-white transition-colors">
                   <Trash2 size={16} />
                 </button>
              </div>
              <div className="flex-1 p-4 overflow-y-auto bg-black font-mono text-xs text-slate-300 leading-relaxed custom-scrollbar whitespace-pre-wrap">
                 {compileOutput}
              </div>
           </div>
        </div>
      )}
    </div>
  );
}
