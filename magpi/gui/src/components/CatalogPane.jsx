import React, { useState, useEffect } from 'react';
import { Folder, Database, File, ChevronRight, ChevronDown, RefreshCw, Box, Map, Image as ImageIcon, Layers, Eye, EyeOff } from 'lucide-react';

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
        const res = await fetch(`http://localhost:8080/api/list_layers?file_path=${encodeURIComponent(node.path)}`);
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
    const toolData = {
        id: isVector ? 'load_vector' : 'load_raster',
        name: isVector ? "Input Vector" : "Input Raster",
        type: 'input',
        color: 'bg-blue-600',
        border: 'border-blue-500',
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
        className={`flex items-center py-1 px-2 hover:bg-[#37373d] cursor-pointer rounded transition-colors text-sm text-slate-300 group`}
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
          <span className="opacity-0 group-hover:opacity-100 text-[9px] bg-[#2d2d2d] px-1 rounded text-slate-500 uppercase ml-2 transition-opacity">
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
              className="flex items-center py-1 px-2 hover:bg-[#37373d] cursor-pointer rounded transition-colors text-xs text-slate-400"
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

export default function CatalogPane({ mapLayers = [], setMapLayers }) {
  const [catalog, setCatalog] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchCatalog = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('http://localhost:8080/api/list_files');
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
    <div className="w-72 border-r border-[#333333] flex flex-col bg-[#252526] h-full shrink-0 relative z-20 shadow-[2px_0_10px_rgba(0,0,0,0.5)]">
      {/* Top Half: Browser */}
      <div className="flex-1 flex flex-col min-h-0 bg-gradient-to-b from-[#252526] to-[#1e1e1e]">
        <div className="p-3 border-b border-[#333333] flex justify-between items-center bg-[#2d2d2d] shadow-md z-10">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center">
            <Database size={14} className="mr-2" />
            Catalog Browser
          </h2>
          <button onClick={fetchCatalog} className="p-1 hover:bg-[#444] rounded transition-colors text-slate-400 hover:text-emerald-400" title="Refresh Catalog">
            <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} />
          </button>
        </div>
        
        <div className="p-2 border-b border-[#333] text-[10px] text-slate-400 uppercase tracking-widest text-center bg-[#1e1e1e] shadow-inner font-semibold">
          Drag files to Canvas
        </div>
        
        <div className="flex-1 overflow-y-auto p-1 custom-scrollbar">
          {catalog.map((node, i) => (
            <FileNode key={i} node={node} level={0} />
          ))}
        </div>
      </div>

      {/* Bottom Half: Map Layers */}
      <div className="h-[40%] min-h-[250px] border-t-2 border-[#111] flex flex-col bg-[#1a1a1a] shadow-[0_-5px_15px_rgba(0,0,0,0.2)]">
        <div className="p-3 border-b border-[#333333] flex justify-between items-center bg-[#2d2d2d] shadow-md z-10">
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
      </div>
    </div>
  );
}
