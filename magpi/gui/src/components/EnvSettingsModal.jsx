import React from 'react';
import { X, Globe, Folder, Database, HardDrive, CheckCircle2 } from 'lucide-react';

export default function EnvSettingsModal({ isOpen, onClose, globalEnv, setGlobalEnv }) {
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
          <p className="text-sm text-slate-400 leading-relaxed">
            These global variables will be injected into the Pipeline Runner at runtime. 
            Nodes that require a scratch directory or output directory will automatically fallback to these if no explicit path is provided in their parameters.
          </p>

          <div className="space-y-4">
            <div className="flex flex-col space-y-2">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center">
                <Folder size={14} className="mr-2 text-blue-400" /> Workspace Directory
              </label>
              <input 
                type="text" 
                name="workspace_dir"
                value={globalEnv.workspace_dir} 
                onChange={handleChange}
                className="bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-sm font-mono text-emerald-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 transition-all" 
                placeholder="/home/user/projects/magpi_workspace"
              />
              <span className="text-[10px] text-slate-500 italic">The root directory for all MagPI project files and relative path resolutions.</span>
            </div>

            <div className="flex flex-col space-y-2">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center">
                <HardDrive size={14} className="mr-2 text-yellow-400" /> Scratch Directory
              </label>
              <input 
                type="text" 
                name="scratch_dir"
                value={globalEnv.scratch_dir} 
                onChange={handleChange}
                className="bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-sm font-mono text-emerald-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 transition-all" 
                placeholder="./magpi_scratch"
              />
              <span className="text-[10px] text-slate-500 italic">Temporary storage for intermediate raster chips, unzipped shapes, and cached WFS streams. Safe to delete between runs.</span>
            </div>

            <div className="flex flex-col space-y-2">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center">
                <Database size={14} className="mr-2 text-purple-400" /> Output Directory
              </label>
              <input 
                type="text" 
                name="output_dir"
                value={globalEnv.output_dir} 
                onChange={handleChange}
                className="bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-sm font-mono text-emerald-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 transition-all" 
                placeholder="./magpi_output"
              />
              <span className="text-[10px] text-slate-500 italic">The final destination for processed pipelines, AI inference masks, and exported metrics.</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-4 bg-slate-800 border-t border-slate-700">
          <button onClick={onClose} className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg shadow-lg flex items-center transition-colors">
            <CheckCircle2 size={18} className="mr-2" /> Save & Apply Globally
          </button>
        </div>

      </div>
    </div>
  );
}
