import React from 'react';
import { Compass, Server, Code, Save, Globe, Cpu, FolderUp, Trash2, Rss, Map as MapIcon, Layers, XCircle, Edit, Crosshair, ClipboardCheck, Network, FilePlus, User } from 'lucide-react';

export default function TopRibbon({ 
  activeWorkspace, globalEnv, setGlobalEnv, crs, setCrs, 
  processingScope, setProcessingScope, 
  onGenerate, onSave, onLoad, onClear, onAutoLayout, onOpenEnvSettings, onImportENVI,
  isDaemonAlive, projectName, profiles = [], activeProfile, activeRole, onProfileChange,
  interactionMode, setInteractionMode
}) {
  const hiddenFileInput = React.useRef(null);
  const [isEditingMode, setIsEditingMode] = React.useState(false);

  React.useEffect(() => {
    const handleEditStart = () => setIsEditingMode(true);
    const handleEditEnd = () => setIsEditingMode(false);
    
    window.addEventListener('magpi-edit-vector', handleEditStart);
    window.addEventListener('magpi-save-edits', handleEditEnd);
    window.addEventListener('magpi-cancel-edits', handleEditEnd);
    window.addEventListener('magpi-clear-selection', handleEditEnd);
    window.addEventListener('magpi-reset-edits', handleEditEnd);
    
    return () => {
      window.removeEventListener('magpi-edit-vector', handleEditStart);
      window.removeEventListener('magpi-save-edits', handleEditEnd);
      window.removeEventListener('magpi-cancel-edits', handleEditEnd);
      window.removeEventListener('magpi-clear-selection', handleEditEnd);
      window.removeEventListener('magpi-reset-edits', handleEditEnd);
    };
  }, []);
  
  return (
    <div className="flex flex-col bg-slate-800 border-b border-slate-700 shadow-md z-20 shrink-0">
      
      {/* Top Thin Status Bar */}
      <div className="flex items-center justify-between px-4 py-1 bg-slate-950 text-xs text-slate-400">
        <div className="flex items-center space-x-4">
          <span className="font-black text-emerald-500 tracking-widest text-sm flex items-center">
            <Compass size={16} className="mr-2" /> MAGPI
          </span>
          <span className="bg-slate-800 px-2 py-0.5 rounded border border-slate-700">Project: {projectName || "Untitled_1"}</span>
          {activeRole !== 'analyst' && (
            <button onClick={onOpenEnvSettings} className="text-[10px] text-slate-300 hover:text-white font-bold uppercase tracking-widest flex items-center bg-slate-800 hover:bg-slate-700 px-2 py-0.5 rounded border border-slate-700 transition-colors">
                <Globe size={12} className="mr-1" /> GLOBALS
            </button>
          )}
          <div className="flex items-center space-x-2 bg-slate-900 px-2 py-0.5 rounded text-[10px] border border-slate-700">
            <User size={12} className="text-amber-400" />
            <select 
              className="bg-transparent outline-none cursor-pointer text-slate-300 font-bold tracking-wider"
              value={activeProfile || ''} onChange={(e) => onProfileChange && onProfileChange(e.target.value)}
            >
              <option value="" disabled>Select Profile...</option>
              {profiles.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center space-x-2 bg-slate-900 px-2 py-0.5 rounded text-[10px] border border-slate-700">
            <Cpu size={12} className="text-purple-400" />
            <span className="text-slate-500 uppercase font-bold">Engine:</span>
            <select 
              className="bg-transparent outline-none cursor-pointer text-slate-300 font-medium"
              value={processingScope} onChange={(e) => setProcessingScope(e.target.value)}
            >
              <option value="Local Python">Local Backend (Conda)</option>
              <option value="PEP684">Local (PEP 684)</option>
              <option value="Apache Airflow">Remote (Airflow)</option>
            </select>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          {/* RSS Feed Link */}
          <a href="https://nexavision.tech/feed.xml" target="_blank" rel="noreferrer" className="flex items-center text-orange-400 hover:text-orange-300 transition-colors mr-3 font-bold">
            <Rss size={12} className="mr-1" /> SIGNAL LOGS
          </a>
          {processingScope === "Apache Airflow" ? (
            <span className="flex items-center text-sky-400 font-bold bg-sky-900/30 px-2 py-0.5 rounded border border-sky-800">
              <Server size={14} className="mr-2 animate-pulse" /> AIRFLOW (PORT: {window.MAGPI_PORT || '8282'})
            </span>
          ) : isDaemonAlive ? (
            <span className="flex items-center text-emerald-500 font-bold bg-emerald-900/30 px-2 py-0.5 rounded border border-emerald-800">
              <Server size={14} className="mr-2 animate-pulse" /> LOCAL DAEMON (PORT: {window.MAGPI_PORT || '8282'})
            </span>
          ) : (
            <span className="flex items-center text-red-500 font-bold bg-red-900/30 px-2 py-0.5 rounded border border-red-800">
              <XCircle size={14} className="mr-2 animate-pulse" /> DAEMON OFFLINE
            </span>
          )}
        </div>
      </div>

      {/* Main Control Ribbon */}
      <div className="flex items-center px-4 py-1.5 space-x-6">
        
        {/* Action Group */}
        <div className="flex items-center space-x-2 border-r border-slate-700 pr-6">
          <button 
            onClick={onGenerate}
            className="flex items-center justify-center px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded text-white font-bold transition-all shadow-lg hover:shadow-emerald-500/20 active:scale-95"
          >
            <Code size={18} className="mr-2" /> Generate Pipeline
          </button>
          
          <button onClick={onClear} className="flex flex-col items-center justify-center p-2 hover:bg-slate-700 rounded text-slate-400 transition-colors ml-1 cursor-pointer" title="New Blank Project">
            <FilePlus size={18} />
            <span className="text-[10px] mt-1 font-medium">New</span>
          </button>
          
          <button onClick={onSave} className="flex flex-col items-center justify-center p-2 hover:bg-slate-700 rounded text-slate-400 transition-colors ml-2" title="Quick Save / Save As">
            <Save size={18} />
            <span className="text-[10px] mt-1 font-medium">Save</span>
          </button>
          
          <button onClick={onLoad} className="flex flex-col items-center justify-center p-2 hover:bg-slate-700 rounded text-slate-400 transition-colors ml-1 cursor-pointer" title="Load Project">
            <FolderUp size={18} />
            <span className="text-[10px] mt-1 font-medium">Load</span>
          </button>
          
          {/* Context-Aware Tools */}
          {activeWorkspace === 'builder' && (
            <>
              <button onClick={onAutoLayout} className="flex flex-col items-center justify-center p-2 hover:bg-indigo-900/50 hover:text-indigo-400 rounded text-slate-400 transition-colors ml-4 border-l border-slate-700 pl-4" title="Auto Layout Nodes">
                <Layers size={18} />
                <span className="text-[10px] mt-1 font-medium">Layout</span>
              </button>
            </>
          )}

          {activeWorkspace === 'planar' && (
            <>

              {isEditingMode ? (
                <>
                  <div className="flex items-center space-x-2 bg-slate-900 px-3 py-1.5 rounded-lg border border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.15)] ml-4">
                    <div className="text-emerald-400 text-[10px] font-bold uppercase tracking-widest animate-pulse mr-2 border-r border-slate-700 pr-3">
                      <Edit size={14} className="inline mr-1 mb-0.5" /> Editing
                    </div>
                    
                    <button 
                      onClick={() => window.dispatchEvent(new CustomEvent('magpi-draw-new-polygon'))}
                      className="flex items-center justify-center px-3 py-1 bg-sky-900/40 hover:bg-sky-800/60 text-sky-300 hover:text-sky-100 rounded text-[10px] font-bold uppercase transition-colors mr-2 border-r border-slate-700 pr-3"
                      title="Draw New Polygon"
                    >
                      <Crosshair size={12} className="mr-1" /> New Poly
                    </button>

                    <button 
                      onClick={() => window.dispatchEvent(new CustomEvent('magpi-save-edits', { detail: { nodeId: explicitRender?.sourceLayerId } }))}
                      className="flex items-center justify-center px-3 py-1 bg-emerald-600/30 hover:bg-emerald-500/50 text-emerald-300 hover:text-emerald-100 rounded text-[10px] font-bold uppercase transition-colors"
                      title="Save Changes"
                    >
                      <Save size={12} className="mr-1" /> Save
                    </button>

                    <button 
                      onClick={() => window.dispatchEvent(new CustomEvent('magpi-cancel-edits'))}
                      className="flex items-center justify-center px-3 py-1 bg-rose-900/40 hover:bg-rose-800/60 text-rose-300 hover:text-rose-100 rounded text-[10px] font-bold uppercase transition-colors"
                      title="Discard Changes"
                    >
                      <XCircle size={12} className="mr-1" /> Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <button 
                    onClick={() => window.dispatchEvent(new CustomEvent('magpi-draw-aoi'))} 
                    className="flex flex-col items-center justify-center p-2 hover:bg-cyan-900/50 hover:text-cyan-400 rounded text-slate-400 transition-colors ml-4 border-l border-slate-700 pl-4" 
                    title="Draw AOI on Map"
                  >
                    <Edit size={18} />
                    <span className="text-[10px] mt-1 font-medium">Draw AOI</span>
                  </button>
                  <button 
                    onClick={() => window.dispatchEvent(new CustomEvent('magpi-draw-marquee'))} 
                    className="flex flex-col items-center justify-center p-2 hover:bg-purple-900/50 hover:text-purple-400 rounded text-slate-400 transition-colors ml-1" 
                    title="Marquee Select"
                  >
                    <Layers size={18} />
                    <span className="text-[10px] mt-1 font-medium">Marquee</span>
                  </button>

                  <button 
                    onClick={() => window.dispatchEvent(new CustomEvent('magpi-draw-lasso'))} 
                    className="flex flex-col items-center justify-center p-2 hover:bg-pink-900/50 hover:text-pink-400 rounded text-slate-400 transition-colors ml-1" 
                    title="Lasso Select"
                  >
                    <Crosshair size={18} />
                    <span className="text-[10px] mt-1 font-medium">Lasso</span>
                  </button>

                  <button 
                    onClick={() => { if (window.confirm('Clear all selections and render locks?')) window.dispatchEvent(new CustomEvent('magpi-clear-selection')); }} 
                    className="flex flex-col items-center justify-center p-2 hover:bg-red-900/50 hover:text-red-400 rounded text-slate-400 transition-colors ml-1 border-r border-slate-700 pr-4 mr-1" 
                    title="Clear Selection"
                  >
                    <XCircle size={18} />
                    <span className="text-[10px] mt-1 font-medium">Clear</span>
                  </button>

                  <button 
                    onClick={() => window.dispatchEvent(new CustomEvent('magpi-edit-vector'))}
                    className="flex flex-col items-center justify-center p-2 hover:bg-emerald-900/50 hover:text-emerald-400 rounded text-slate-400 transition-colors ml-1" 
                    title="Edit Polygons"
                  >
                    <Network size={18} />
                    <span className="text-[10px] mt-1 font-medium">Edit Vector</span>
                  </button>
                  
                  <button className="flex flex-col items-center justify-center p-2 hover:bg-slate-700 rounded text-slate-500 transition-colors ml-1" title="Build Training Dataset (Coming Soon)">
                    <Crosshair size={18} />
                    <span className="text-[10px] mt-1 font-medium">Training</span>
                  </button>
                  
                  <button className="flex flex-col items-center justify-center p-2 hover:bg-slate-700 rounded text-slate-500 transition-colors ml-1" title="QA/QC Workflows (Coming Soon)">
                    <ClipboardCheck size={18} />
                    <span className="text-[10px] mt-1 font-medium">QA/QC</span>
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}