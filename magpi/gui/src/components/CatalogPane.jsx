import React, { useState, useEffect } from 'react';
import { useReactFlow } from '@xyflow/react';
import { Folder, Database, File, ChevronRight, ChevronDown, RefreshCw, Box, Map, Image as ImageIcon, Layers, Eye, EyeOff, Network, Target } from 'lucide-react';
import { TOOLBOX_CATEGORIES } from './Toolbox';

const FileNode = ({ node, level }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [layers, setLayers] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const isGdb = node.type === 'gdb' || node.type === 'gpkg';
  const isExpandable = node.is_dir || isGdb;

  const handleToggle = async () => {
    setIsOpen(!isOpen);
    if (!isOpen && isGdb && !layers) {
      setIsLoading(true);
      try {
        const res = await fetch(`http://${window.location.hostname}:8282/api/list_layers?file_path=${encodeURIComponent(node.path)}`);
        const data = await res.json();
        if (data.status === 'success') {
          setLayers(data.layers);
        }
      } catch (e) {
        console.error("Failed to fetch layers:", e);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleDragStart = (e, dragData) => {
    const isVector = ['shp', 'geojson', 'gdb', 'gpkg', 'sqlite', 'db'].includes(dragData.type);
    const toolId = isVector ? 'load_vector' : 'load_raster';
    let baseToolDef = null;
    for (const cat of TOOLBOX_CATEGORIES) {
        const found = cat.tools.find(t => t.id === toolId);
        if (found) {
            baseToolDef = found;
            break;
        }
    }

    const toolData = {
        id: toolId,
        name: isVector ? "Input Vector" : "Input Raster",
        type: 'input',
        color: 'bg-blue-600',
        border: 'border-blue-500',
        inputs: baseToolDef?.inputs,
        outputs: baseToolDef?.outputs,
        params: {
            file_path: dragData.path,
            ...(isVector ? { layer_name: dragData.layer_name || "" } : {})
        }
    };
    window.__draggedMagPITool = toolData;
    e.dataTransfer.setData('application/reactflow', JSON.stringify(toolData));
    e.dataTransfer.effectAllowed = 'move';
  };

  const renderIcon = () => {
    if (node.type === 'folder') return <Folder size={14} className="text-yellow-500 mr-1.5 opacity-80" />;
    if (isGdb) return <Database size={14} className="text-purple-400 mr-1.5" />;
    if (node.type === 'shp' || node.type === 'geojson') return <Map size={14} className="text-emerald-400 mr-1.5" />;
    if (['tif', 'tiff', 'vrt', 'img', 'nc'].includes(node.type)) return <ImageIcon size={14} className="text-blue-400 mr-1.5" />;
    return <File size={14} className="text-slate-400 mr-1.5" />;
  };

  return (
    <div className="select-none">
      <div 
        className={`flex items-center py-1 px-2 hover:bg-slate-700 cursor-pointer rounded transition-colors text-sm text-slate-300 group`}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={isExpandable ? handleToggle : undefined}
        draggable={!node.is_dir}
        onDragStart={!node.is_dir ? (e) => handleDragStart(e, { path: node.path, type: node.type }) : undefined}
      >
        {isExpandable ? (
          isOpen ? <ChevronDown size={14} className="mr-1 text-slate-500" /> : <ChevronRight size={14} className="mr-1 text-slate-500" />
        ) : (
          <span className="w-3.5 mr-1 inline-block" />
        )}
        {renderIcon()}
        <span className="break-all flex-1 pr-2" title={node.name}>{node.name}</span>
        {node.type && node.type !== 'folder' && (
          <span className="opacity-0 group-hover:opacity-100 text-[9px] bg-slate-800 px-1 rounded text-slate-500 uppercase ml-2 transition-opacity">
            {node.type}
          </span>
        )}
      </div>

      {isOpen && node.children && (
        <div>
          {node.children.map((child, i) => (
            <FileNode key={i} node={child} level={level + 1} />
          ))}
        </div>
      )}

      {isOpen && isGdb && (
        <div>
          {isLoading && <div className="text-xs text-slate-500 py-1" style={{ paddingLeft: `${(level+1) * 12 + 28}px` }}>Loading layers...</div>}
          {layers && layers.length === 0 && <div className="text-xs text-slate-500 py-1" style={{ paddingLeft: `${(level+1) * 12 + 28}px` }}>No layers found.</div>}
          {layers && layers.map((layer, i) => (
            <div 
              key={i} 
              className="flex items-center py-1 px-2 hover:bg-slate-700 cursor-pointer rounded transition-colors text-xs text-slate-400"
              style={{ paddingLeft: `${(level+1) * 12 + 20}px` }}
              draggable
              onDragStart={(e) => handleDragStart(e, { path: node.path, type: node.type, layer_name: layer })}
            >
              <Box size={12} className="mr-2 opacity-50" />
              {layer}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default function CatalogPane({ mapLayers = [], setMapLayers, activeWorkspace, nodes = [], setSelectedNodeId }) {
  const [catalog, setCatalog] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const reactFlow = useReactFlow();

  const handleNodeClick = (node) => {
    if (setSelectedNodeId) setSelectedNodeId(node.id);
    reactFlow.setCenter(node.x + 125, node.y + 40, { duration: 800, zoom: 1.5 });
  };

  const fetchCatalog = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`http://${window.location.hostname}:8282/api/list_files`);
      const data = await res.json();
      if (data.status === 'success') {
        setCatalog(data.catalog);
      }
    } catch (e) {
      console.error("Failed to fetch catalog:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCatalog();
  }, []);

  return (
    <div className="w-72 border-r border-slate-800 flex flex-col bg-slate-900 h-full shrink-0 relative z-20 shadow-[2px_0_10px_rgba(0,0,0,0.5)]">
      {/* Top Half: Browser */}
      <div className="flex-1 flex flex-col min-h-0 bg-gradient-to-b from-slate-900 to-slate-800">
        <div className="p-3 border-b border-slate-800 flex justify-between items-center bg-slate-800 shadow-md z-10">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center">
            <Database size={14} className="mr-2" />
            Catalog Browser
          </h2>
          <button onClick={fetchCatalog} className="p-1 hover:bg-slate-700 rounded transition-colors text-slate-400 hover:text-emerald-400" title="Refresh Catalog">
            <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} />
          </button>
        </div>
        
        <div className="p-2 border-b border-slate-800 text-[10px] text-slate-400 uppercase tracking-widest text-center bg-slate-900 shadow-inner font-semibold">
          Drag files to Canvas
        </div>
        
        <div className="flex-1 overflow-y-auto p-1 custom-scrollbar">
          {catalog.map((node, i) => (
            <FileNode key={i} node={node} level={0} />
          ))}
        </div>
      </div>

      {/* Bottom Half: Map Layers or Node Navigator */}
      <div className="h-[40%] min-h-[250px] border-t border-slate-700 flex flex-col bg-slate-900 shadow-[0_-5px_15px_rgba(0,0,0,0.2)]">
        {activeWorkspace === 'builder' ? (
            <>
                <div className="p-3 border-b border-slate-800 flex justify-between items-center bg-slate-800 shadow-md z-10 shrink-0">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center">
                    <Network size={14} className="mr-2" />
                    Node Navigator
                    </h2>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                    {nodes.map(node => (
                    <div 
                        key={node.id}
                        onClick={() => handleNodeClick(node)}
                        className="px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white rounded cursor-pointer transition-colors flex items-center group"
                    >
                        <Target size={14} className="mr-2 opacity-50 group-hover:opacity-100 group-hover:text-emerald-400 transition-opacity shrink-0" />
                        <span className="truncate flex-1">{node.name || node.toolId}</span>
                    </div>
                    ))}
                    {nodes.length === 0 && (
                        <div className="text-xs text-slate-500 italic p-4 text-center">No nodes in the active matrix.</div>
                    )}
                </div>
            </>
        ) : (
            <>
                <div className="p-3 border-b border-slate-800 flex justify-between items-center bg-slate-800 shadow-md z-10">
                <h2 className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center">
                    <Layers size={14} className="mr-2" />
                    Map Layers
                </h2>
                </div>
        <div className="flex-1 overflow-y-auto p-2 custom-scrollbar space-y-1">
          {mapLayers.map(layer => (
              <div key={layer.id} className={`p-2 rounded-md ${layer.selected ? 'bg-cyan-900/40 border border-cyan-700/50' : 'bg-slate-800/60 border border-transparent'} hover:bg-slate-700/60 transition-colors flex flex-col`}>
                  <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-medium text-slate-200 truncate flex-1" title={layer.name}>
                          {layer.name}
                      </span>
                      <button 
                          onClick={() => {
                              if (setMapLayers) {
                                  setMapLayers(prev => prev.map(l => l.id === layer.id ? { ...l, visible: !l.visible } : l));
                              }
                          }}
                          className="ml-2 text-slate-400 hover:text-white"
                      >
                          {layer.visible ? <Eye size={12} className="text-emerald-400" /> : <EyeOff size={12} className="text-slate-600" />}
                      </button>
                  </div>
                  
                  {layer.visible && (
                      <div className="flex items-center space-x-2">
                          <span className="text-[9px] text-slate-500">Opacity</span>
                          <input 
                              type="range" 
                              min="0" max="100" 
                              value={layer.opacity}
                              onChange={(e) => {
                                  const newOpacity = parseInt(e.target.value);
                                  if (setMapLayers) {
                                      setMapLayers(prev => prev.map(l => l.id === layer.id ? { ...l, opacity: newOpacity } : l));
                                  }
                              }}
                              className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer" 
                          />
                          <span className="text-[9px] text-slate-400 w-6 text-right">{layer.opacity}%</span>
                      </div>
                  )}
              </div>
          ))}
        </div>
            </>
        )}
      </div>
    </div>
  );
}
