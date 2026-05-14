import React, { useState } from 'react';
import { 
  Database, Layers, Cpu, Settings, Image as ImageIcon, 
  Hexagon, Leaf, Grid, Crosshair, Scissors, CircleDashed, 
  ChevronDown, ChevronRight, MousePointer2, Trash2, 
  SlidersHorizontal, Wrench, Check, FolderOpen 
} from 'lucide-react';

const TOOLBOX_CATEGORIES = [
  {
    name: "Data Ingestion", icon: <Database size={18} className="text-emerald-500/70" />,
    tools: [
      { id: 'load_raster', name: "Input Raster", type: 'input', icon: <ImageIcon size={14}/>, color: 'bg-blue-600', border: 'border-blue-500', params: { file_path: "./test_data/noaa_florida/2021_4BandImagery_Florida_J1378560tR0_C0.tif" } },
      { id: 'load_vector', name: "Input Vector", type: 'input', icon: <Hexagon size={14}/>, color: 'bg-blue-600', border: 'border-blue-500', params: { file_path: "./test_data/noaa_florida/Orange_County_Tracts_Clipped.shp" } },
    ]
  },
  {
    name: "Image Analyst (ia)", icon: <Layers size={18} className="text-emerald-500/70" />,
    tools: [
      { id: 'ia_ndvi', name: "NDVI Calculator", type: 'process', icon: <Leaf size={14}/>, color: 'bg-emerald-600', border: 'border-emerald-500', params: { nir_band: 4, red_band: 1 } },
      { id: 'ia_export_dl', name: "Export DL Tensors", type: 'process', icon: <Grid size={14}/>, color: 'bg-emerald-600', border: 'border-emerald-500', params: { out_folder: "./tmp_wksp/MagPI_DeepLearning_Chips", tile_size: 256, stride: 128, shuffle: true } },
    ]
  },
  {
    name: "GeoAI (geoai)", icon: <Cpu size={18} className="text-emerald-500/70" />,
    tools: [
      { id: 'ai_detect', name: "Detect Objects", type: 'process', icon: <Crosshair size={14}/>, color: 'bg-purple-600', border: 'border-purple-500', params: { out_shp: "pools.shp", model: "facebook/detr-resnet-50" } },
    ]
  },
  {
    name: "Data Management", icon: <Settings size={18} className="text-emerald-500/70" />,
    tools: [
      { id: 'mgt_clip', name: "Clip to AOI", type: 'process', icon: <Scissors size={14}/>, color: 'bg-slate-600', border: 'border-slate-500', params: { xmin: "", ymin: "", xmax: "", ymax: "" } },
      { id: 'mgt_buffer', name: "Buffer", type: 'process', icon: <CircleDashed size={14}/>, color: 'bg-slate-600', border: 'border-slate-500', params: { distance: "50 METERS" } },
    ]
  }
];

export default function Toolbox({ 
  activeRightTab, setActiveRightTab, 
  selectedNode, updateNodeParam, deleteNode, addNode 
}) {
  const [expandedCategories, setExpandedCategories] = useState({ 
    "Data Ingestion": true, "Image Analyst (ia)": true, "GeoAI (geoai)": true 
  });

  const toggleCategory = (name) => {
    setExpandedCategories(prev => ({ ...prev, [name]: !prev[name] }));
  };

  return (
    <div className="w-[320px] bg-slate-800 flex flex-col shadow-[-10px_0_20px_rgba(0,0,0,0.5)] z-20">
      
      {/* Right Panel Tabs */}
      <div className="flex bg-slate-900 border-b border-slate-700">
        <button 
          onClick={() => setActiveRightTab('toolbox')} 
          className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest transition-all flex items-center justify-center ${activeRightTab === 'toolbox' ? 'text-emerald-400 border-b-2 border-emerald-400 bg-slate-800' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'}`}
        >
          <Wrench size={14} className="mr-2" /> Tools
        </button>
        <button 
          onClick={() => setActiveRightTab('inspector')} 
          className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest transition-all flex items-center justify-center ${activeRightTab === 'inspector' ? 'text-emerald-400 border-b-2 border-emerald-400 bg-slate-800' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'}`}
        >
          <SlidersHorizontal size={14} className="mr-2" /> Params
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto bg-slate-800 p-3">
        
        {/* TOOLBOX TAB */}
        {activeRightTab === 'toolbox' && (
          <div className="space-y-3">
            {TOOLBOX_CATEGORIES.map((cat, idx) => (
              <div key={idx} className="bg-slate-900/80 rounded-lg border border-slate-700/80 overflow-hidden shadow-sm">
                
                <button 
                  onClick={() => toggleCategory(cat.name)} 
                  className="w-full flex items-center justify-between px-4 py-3 bg-slate-800/80 hover:bg-slate-700 transition-colors"
                >
                  <div className="flex items-center space-x-3 text-sm font-bold text-slate-200">
                    {cat.icon}
                    <span>{cat.name}</span>
                  </div>
                  {expandedCategories[cat.name] ? <ChevronDown size={14} className="text-slate-500"/> : <ChevronRight size={14} className="text-slate-500"/>}
                </button>

                {expandedCategories[cat.name] && (
                  <div className="p-2 space-y-1 bg-slate-900/50">
                    {cat.tools.map(tool => (
                      <div 
                        key={tool.id} 
                        onClick={() => addNode(tool)} 
                        className="flex items-center px-3 py-2.5 text-xs bg-slate-800 hover:bg-slate-700 rounded-md cursor-pointer border border-transparent hover:border-emerald-500/50 transition-all group shadow-sm"
                      >
                        <div className={`w-3 h-3 rounded-full mr-3 ${tool.color} shadow-inner`}></div>
                        <span className="flex-1 text-slate-300 font-medium group-hover:text-white transition-colors">{tool.name}</span>
                      </div>
                    ))}
                  </div>
                )}

              </div>
            ))}
          </div>
        )}

        {/* INSPECTOR TAB */}
        {activeRightTab === 'inspector' && (
          <div className="p-2">
            {!selectedNode ? (
              <div className="text-center text-slate-500 mt-16 flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center mb-4 shadow-inner">
                  <MousePointer2 size={24} className="opacity-50" />
                </div>
                <p className="text-sm font-medium">Select a node on the canvas to configure.</p>
              </div>
            ) : (
              <div className="space-y-4 animate-fadeIn">
                
                {/* Node Title Header */}
                <div className={`px-4 py-3 rounded-lg text-white font-bold text-sm ${selectedNode.color} border border-t-white/20 border-b-black/50 shadow-lg flex items-center justify-between`}>
                  <div className="flex items-center">
                    <span className="mr-2 opacity-80">{/* Icon Map Placeholder */}</span>
                    {selectedNode.name}
                  </div>
                  <button 
                    onClick={() => deleteNode(selectedNode.id)} 
                    className="w-6 h-6 rounded bg-black/20 hover:bg-red-500/80 flex items-center justify-center transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>

                {/* Parameters Form */}
                <div className="bg-slate-900 p-4 rounded-lg border border-slate-700 shadow-inner">
                  <h4 className="text-[10px] uppercase tracking-widest text-emerald-500 font-bold mb-4 flex items-center">
                    <SlidersHorizontal size={12} className="mr-2" /> Parameters
                  </h4>
                  
                  {Object.entries(selectedNode.params || {}).map(([key, val]) => (
                    <div key={key} className="mb-4">
                      <label className="block text-[11px] font-bold text-slate-400 mb-1.5 uppercase tracking-wide">
                        {key.replace(/_/g, ' ')}
                      </label>
                      
                      {typeof val === 'boolean' ? (
                        <div 
                          className="flex items-center bg-slate-800 px-3 py-2 rounded-md border border-slate-700 cursor-pointer" 
                          onClick={() => updateNodeParam(selectedNode.id, key, !val)}
                        >
                          <div className={`w-4 h-4 rounded-sm flex items-center justify-center mr-3 transition-colors ${val ? 'bg-emerald-500' : 'bg-slate-700 border border-slate-600'}`}>
                            {val && <Check size={10} className="text-white" />}
                          </div>
                          <span className={`text-sm font-medium ${val ? 'text-white' : 'text-slate-400'}`}>
                            {val ? "Enabled" : "Disabled"}
                          </span>
                        </div>
                      ) : typeof val === 'number' ? (
                        <input 
                          type="number" 
                          value={val} 
                          onChange={(e) => updateNodeParam(selectedNode.id, key, Number(e.target.value))} 
                          className="w-full bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono"
                        />
                      ) : key === 'file_path' || key === 'out_folder' ? (
                         /* NEW DATA INJECTION PROTOCOL UI */
                        <div className="flex items-center space-x-2">
                           <input 
                            type="text" 
                            value={val} 
                            onChange={(e) => updateNodeParam(selectedNode.id, key, e.target.value)} 
                            className="flex-1 bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono"
                          />
                          <button className="p-2 bg-slate-700 hover:bg-slate-600 rounded border border-slate-600 transition-colors text-slate-300">
                             <FolderOpen size={16} />
                          </button>
                        </div>
                      ) : (
                        <input 
                          type="text" 
                          value={val} 
                          onChange={(e) => updateNodeParam(selectedNode.id, key, e.target.value)} 
                          className="w-full bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono"
                        />
                      )}
                    </div>
                  ))}
                  
                  {Object.keys(selectedNode.params || {}).length === 0 && (
                    <p className="text-xs text-slate-500 italic bg-slate-800/50 p-3 rounded-md text-center">No configurable parameters.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}