import React from 'react';
import { Compass, Server, Code, Save, Globe, Cpu, FolderUp, Trash2, Rss } from 'lucide-react';

export default function TopRibbon({ 
  crs, setCrs, 
  processingScope, setProcessingScope, 
  onGenerate, onSave, onLoad, onClear, onOpenEnvSettings 
}) {
  return (
    <div className="flex flex-col bg-slate-800 border-b border-slate-700 shadow-md z-20 shrink-0">
      
      {/* Top Thin Status Bar */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-slate-950 text-xs text-slate-400">
        <div className="flex items-center space-x-4">
          <span className="font-black text-emerald-500 tracking-widest text-sm flex items-center">
            <Compass size={16} className="mr-2" /> MAGPI
          </span>
          <span className="bg-slate-800 px-2 py-0.5 rounded border border-slate-700">Project: Local_Daemon_Active</span>
        </div>
        <div className="flex items-center space-x-3">
          {/* RSS Feed Link */}
          <a href="https://nexavision.tech/feed.xml" target="_blank" rel="noreferrer" className="flex items-center text-orange-400 hover:text-orange-300 transition-colors mr-3 font-bold">
            <Rss size={12} className="mr-1" /> SIGNAL LOGS
          </a>
          {processingScope === "Apache Airflow" ? (
            <span className="flex items-center text-sky-400 font-bold bg-sky-900/30 px-2 py-0.5 rounded border border-sky-800">
              <Server size={14} className="mr-2 animate-pulse" /> AIRFLOW (PORT: 8080)
            </span>
          ) : (
            <span className="flex items-center text-emerald-500 font-bold bg-emerald-900/30 px-2 py-0.5 rounded border border-emerald-800">
              <Server size={14} className="mr-2 animate-pulse" /> LOCAL DAEMON (PORT: 8080)
            </span>
          )}
        </div>
      </div>

      {/* Main Control Ribbon */}
      <div className="flex items-center px-4 py-2.5 space-x-6">
        
        {/* Action Group */}
        <div className="flex items-center space-x-2 border-r border-slate-700 pr-6">
          <button 
            onClick={onGenerate}
            className="flex items-center justify-center px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded text-white font-bold transition-all shadow-lg hover:shadow-emerald-500/20 active:scale-95"
          >
            <Code size={18} className="mr-2" /> Generate Pipeline
          </button>
          
          <button onClick={onSave} className="flex flex-col items-center justify-center p-2 hover:bg-slate-700 rounded text-slate-400 transition-colors ml-2" title="Save Project">
            <Save size={18} />
            <span className="text-[10px] mt-1 font-medium">Save</span>
          </button>
          
          <label className="flex flex-col items-center justify-center p-2 hover:bg-slate-700 rounded text-slate-400 transition-colors ml-1 cursor-pointer" title="Load Project">
            <FolderUp size={18} />
            <span className="text-[10px] mt-1 font-medium">Load</span>
            <input type="file" accept=".mpjx,.json" className="hidden" onChange={(e) => {
              if (e.target.files.length > 0) onLoad(e.target.files[0]);
              e.target.value = null; 
            }} />
          </label>

          <button onClick={onClear} className="flex flex-col items-center justify-center p-2 hover:bg-red-900/50 hover:text-red-400 rounded text-slate-400 transition-colors ml-1" title="Clear Canvas">
            <Trash2 size={18} />
            <span className="text-[10px] mt-1 font-medium">Clear</span>
          </button>
        </div>

        {/* Environment Variables Group */}
        <div className="flex flex-col space-y-1.5">
          <div className="flex items-center justify-between">
             <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Global Environment</span>
             <button onClick={onOpenEnvSettings} className="text-[10px] text-emerald-500 hover:text-emerald-400 font-bold uppercase tracking-widest flex items-center bg-slate-900 px-2 py-0.5 rounded border border-emerald-900/50 hover:border-emerald-500 transition-colors">
                <Globe size={10} className="mr-1" /> Paths
             </button>
          </div>
          <div className="flex space-x-4">
            
            <div className="flex items-center space-x-2 bg-slate-900 px-3 py-1.5 rounded text-sm border border-slate-700 shadow-inner hover:border-slate-500 transition-colors">
              <Globe size={14} className="text-blue-400" />
              <span className="text-xs text-slate-500 uppercase font-bold mr-1">Datum:</span>
              <select 
                className="bg-transparent outline-none cursor-pointer text-slate-200 font-medium"
                value={crs} onChange={(e) => setCrs(e.target.value)}
              >
                <option value="EPSG:4326">WGS 84 (EPSG:4326)</option>
                <option value="EPSG:6438">FL State Plane E (EPSG:6438)</option>
                <option value="EPSG:3857">Web Mercator (EPSG:3857)</option>
              </select>
            </div>

            <div className="flex items-center space-x-2 bg-slate-900 px-3 py-1.5 rounded text-sm border border-slate-700 shadow-inner hover:border-slate-500 transition-colors">
              <Cpu size={14} className="text-purple-400" />
              <span className="text-xs text-slate-500 uppercase font-bold mr-1">Engine:</span>
              <select 
                className="bg-transparent outline-none cursor-pointer text-slate-200 font-medium"
                value={processingScope} onChange={(e) => setProcessingScope(e.target.value)}
              >
                <option value="Local Python">Local Backend (Conda)</option>
                <option value="Apache Airflow">Remote (Apache Airflow)</option>
              </select>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}