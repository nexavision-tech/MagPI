import React from 'react';
import { Compass, Server, Code, Save, Globe, Cpu, FolderUp } from 'lucide-react';

export default function TopRibbon({ crs, setCrs, processingScope, setProcessingScope, onGenerate, onSave, onLoad }) {
  return (
    <div className="flex flex-col bg-slate-800 border-b border-slate-700 shadow-md z-20">
      
      {/* App Title & Quick Access */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-950 text-xs text-slate-400">
        <div className="flex items-center space-x-4">
          <span className="font-black text-emerald-500 tracking-widest text-sm flex items-center">
            <Compass size={16} className="mr-2" /> MAGPI
          </span>
          <span className="bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
            Project: Local_Daemon_Active
          </span>
        </div>
        <div className="flex items-center space-x-3">
          <span className="flex items-center text-emerald-500 font-bold">
            <Server size={14} className="mr-2 animate-pulse" /> Matrix Connected
          </span>
        </div>
      </div>
      
      {/* Ribbon Tools */}
      <div className="flex items-center px-4 py-2 space-x-6">
        
        {/* Action Group */}
        <div className="flex items-center space-x-2 border-r border-slate-700 pr-6">
          <button 
            onClick={onGenerate}
            className="flex items-center justify-center px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded text-white font-bold transition-all shadow-lg hover:shadow-emerald-500/20 active:scale-95"
          >
            <Code size={18} className="mr-2" /> Generate Pipeline
          </button>
          
          <button onClick={onSave} className="flex flex-col items-center justify-center p-2 hover:bg-slate-700 rounded text-slate-400 transition-colors ml-2" title="Save Project">
            <Save size={20} />
            <span className="text-[10px] mt-1">Save</span>
          </button>
          
          <label className="flex flex-col items-center justify-center p-2 hover:bg-slate-700 rounded text-slate-400 transition-colors ml-1 cursor-pointer" title="Load Project">
            <FolderUp size={20} />
            <span className="text-[10px] mt-1">Load</span>
            <input type="file" accept=".mpjx,.json" className="hidden" onChange={(e) => {
              if (e.target.files.length > 0) onLoad(e.target.files[0]);
              e.target.value = null; // reset so the same file can be loaded twice if needed
            }} />
          </label>
        </div>

        {/* Environment Variables Group */}
        <div className="flex flex-col space-y-1">
          <div className="flex space-x-4">
            <div className="flex items-center space-x-2 bg-slate-900 px-3 py-1.5 rounded text-sm border border-slate-700 shadow-inner">
              <Globe size={16} className="text-blue-400" />
              <span className="text-xs text-slate-500 uppercase font-bold mr-1">Datum:</span>
              <select 
                className="bg-transparent outline-none cursor-pointer text-slate-200 font-medium"
                value={crs} 
                onChange={(e) => setCrs(e.target.value)}
              >
                <option value="EPSG:4326">WGS 84 (EPSG:4326)</option>
                <option value="EPSG:6438">FL State Plane E (EPSG:6438)</option>
                <option value="EPSG:3857">Web Mercator (EPSG:3857)</option>
              </select>
            </div>
            
            <div className="flex items-center space-x-2 bg-slate-900 px-3 py-1.5 rounded text-sm border border-slate-700 shadow-inner">
              <Cpu size={16} className="text-purple-400" />
              <span className="text-xs text-slate-500 uppercase font-bold mr-1">Engine:</span>
              <select 
                className="bg-transparent outline-none cursor-pointer text-slate-200 font-medium"
                value={processingScope} 
                onChange={(e) => setProcessingScope(e.target.value)}
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