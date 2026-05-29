import React from 'react';
import { X, Globe, Folder, Database, HardDrive, CheckCircle2, Settings } from 'lucide-react';

export default function EnvSettingsModal({ isOpen, onClose, globalEnv, setGlobalEnv, openFileBrowser }) {
  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setGlobalEnv(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-800 border-b border-slate-700">
          <div className="flex items-center space-x-3 text-emerald-400 font-bold tracking-widest uppercase">
            <Globe size={18} />
            <span>Global Environment Settings</span>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-700 rounded-md text-slate-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-400 leading-relaxed max-w-lg">
              These global variables will be injected into the Pipeline Runner at runtime. 
              Nodes that require a scratch directory or output directory will automatically fallback to these if no explicit path is provided in their parameters.
            </p>
            <div className="bg-slate-950 border border-slate-700 rounded-lg p-3 flex flex-col min-w-[200px]">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1.5">Active Profile</span>
              <div className="relative">
                <select className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-emerald-400 font-bold appearance-none cursor-pointer focus:outline-none">
                  <option>MagPI Default</option>
                  <option>Custom Profile</option>
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex flex-col space-y-2 relative group">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center">
                <Folder size={14} className="mr-2 text-blue-400" /> Workspace Directory
                {globalEnv.workspace_dir !== './magpi_workspace' && <span className="ml-3 text-[9px] bg-amber-500/20 text-amber-500 px-1.5 py-0.5 rounded border border-amber-500/30">CUSTOM</span>}
              </label>
              <div className="flex">
                <input 
                  type="text" 
                  name="workspace_dir"
                  value={globalEnv.workspace_dir} 
                  onChange={handleChange}
                  className="w-full bg-slate-950 border border-slate-700 rounded-l-lg px-4 py-2.5 text-sm font-mono text-emerald-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 transition-all" 
                  placeholder="/home/user/projects/magpi_workspace"
                />
                <button 
                  onClick={() => openFileBrowser('env', 'workspace_dir', globalEnv.workspace_dir)}
                  className="bg-slate-800 border border-l-0 border-slate-700 rounded-r-lg px-3 hover:bg-slate-700 text-slate-400 hover:text-emerald-400 transition-colors"
                >
                  <Folder size={16} />
                </button>
              </div>
              <span className="text-[10px] text-slate-500 italic">The root directory for all MagPI project files and relative path resolutions.</span>
            </div>

            <div className="flex flex-col space-y-2 relative group">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center">
                <HardDrive size={14} className="mr-2 text-yellow-400" /> Scratch Directory
                {globalEnv.scratch_dir !== './magpi_scratch' && <span className="ml-3 text-[9px] bg-amber-500/20 text-amber-500 px-1.5 py-0.5 rounded border border-amber-500/30">CUSTOM</span>}
              </label>
              <div className="flex">
                <input 
                  type="text" 
                  name="scratch_dir"
                  value={globalEnv.scratch_dir} 
                  onChange={handleChange}
                  className="w-full bg-slate-950 border border-slate-700 rounded-l-lg px-4 py-2.5 text-sm font-mono text-emerald-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 transition-all" 
                  placeholder="./magpi_scratch"
                />
                <button 
                  onClick={() => openFileBrowser('env', 'scratch_dir', globalEnv.scratch_dir)}
                  className="bg-slate-800 border border-l-0 border-slate-700 rounded-r-lg px-3 hover:bg-slate-700 text-slate-400 hover:text-emerald-400 transition-colors"
                >
                  <Folder size={16} />
                </button>
              </div>
              <span className="text-[10px] text-slate-500 italic">Temporary storage for intermediate raster chips, unzipped shapes, and cached WFS streams. Safe to delete between runs.</span>
            </div>

            <div className="flex flex-col space-y-2 relative group">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center">
                <Database size={14} className="mr-2 text-purple-400" /> Output Directory
                {globalEnv.output_dir !== './magpi_output' && <span className="ml-3 text-[9px] bg-amber-500/20 text-amber-500 px-1.5 py-0.5 rounded border border-amber-500/30">CUSTOM</span>}
              </label>
              <div className="flex">
                <input 
                  type="text" 
                  name="output_dir"
                  value={globalEnv.output_dir} 
                  onChange={handleChange}
                  className="w-full bg-slate-950 border border-slate-700 rounded-l-lg px-4 py-2.5 text-sm font-mono text-emerald-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 transition-all" 
                  placeholder="./magpi_output"
                />
                <button 
                  onClick={() => openFileBrowser('env', 'output_dir', globalEnv.output_dir)}
                  className="bg-slate-800 border border-l-0 border-slate-700 rounded-r-lg px-3 hover:bg-slate-700 text-slate-400 hover:text-emerald-400 transition-colors"
                >
                  <Folder size={16} />
                </button>
              </div>
              <span className="text-[10px] text-slate-500 italic">The final destination for processed pipelines, AI inference masks, and exported metrics.</span>
            </div>
            
            <div className="flex items-center justify-between bg-slate-900/50 border border-slate-700/50 rounded-lg p-4">
              <div>
                <label className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center">
                  <Settings size={14} className="mr-2 text-indigo-400" /> Overwrite Output Files
                </label>
                <span className="text-[10px] text-slate-500 italic block mt-1">If enabled, existing files will be overwritten without throwing an error.</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={globalEnv.overwrite_output !== false} // Default true
                  onChange={(e) => setGlobalEnv(prev => ({ ...prev, overwrite_output: e.target.checked }))}
                />
                <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
              </label>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col space-y-2 relative group">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center">
                  <Globe size={14} className="mr-2 text-rose-400" /> Horizontal Datum
                  {globalEnv.horizontal_datum !== 'EPSG:4326' && <span className="ml-3 text-[9px] bg-amber-500/20 text-amber-500 px-1.5 py-0.5 rounded border border-amber-500/30">CUSTOM</span>}
                </label>
                <input 
                  type="text" 
                  name="horizontal_datum"
                  value={globalEnv.horizontal_datum || "EPSG:4326"} 
                  onChange={handleChange}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-sm font-mono text-emerald-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 transition-all" 
                  placeholder="EPSG:4326"
                />
              </div>

              <div className="flex flex-col space-y-2 relative group">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center">
                  <Globe size={14} className="mr-2 text-rose-400" /> Vertical Datum
                  {globalEnv.vertical_datum !== 'EPSG:3855' && <span className="ml-3 text-[9px] bg-amber-500/20 text-amber-500 px-1.5 py-0.5 rounded border border-amber-500/30">CUSTOM</span>}
                </label>
                <input 
                  type="text" 
                  name="vertical_datum"
                  value={globalEnv.vertical_datum || "EPSG:3855"} 
                  onChange={handleChange}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-sm font-mono text-emerald-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 transition-all" 
                  placeholder="EPSG:3855"
                />
              </div>
            </div>
          </div>
          {/* Autopilot Schedule Section */}
          <div className="mt-6 border-t border-slate-700 pt-6 space-y-4">

          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-800 border-t border-slate-700">
          <button 
            onClick={() => setGlobalEnv({ workspace_dir: "./magpi_workspace", scratch_dir: "./magpi_scratch", output_dir: "./magpi_output", horizontal_datum: "EPSG:4326", vertical_datum: "EPSG:3855", overwrite_output: true })} 
            className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white transition-colors"
          >
            Reset to Defaults
          </button>
          <button onClick={() => { localStorage.setItem('magpi_global_env', JSON.stringify(globalEnv)); onClose(); }} className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg shadow-lg flex items-center transition-colors">
            <CheckCircle2 size={18} className="mr-2" /> Save & Apply Globally
          </button>
        </div>

      </div>
    </div>
  );
}
