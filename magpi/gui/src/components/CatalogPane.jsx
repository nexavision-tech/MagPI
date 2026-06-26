import React, { useState, useEffect } from 'react';
import { useReactFlow } from '@xyflow/react';
import { Folder, Database, File, ChevronRight, ChevronDown, RefreshCw, Box, Map, Image as ImageIcon, Layers, Eye, EyeOff, Network, Crosshair, FolderOpen, Search, Trash2, FolderPlus, MinusCircle, Link, Copy, Check } from 'lucide-react';
import { TOOLBOX_CATEGORIES } from './Toolbox';

const DebouncedColorPicker = ({ color, onChange }) => {
    const [localColor, setLocalColor] = useState(color || '#32d74b');
    useEffect(() => { setLocalColor(color || '#32d74b'); }, [color]);
    return (
        <input 
            type="color"
            className="w-full h-6 rounded cursor-pointer bg-slate-800 border-none p-0"
            value={localColor}
            onChange={(e) => setLocalColor(e.target.value)}
            onBlur={() => onChange(localColor)}
        />
    );
};

const FileNode = ({ node, level, globalEnv, copiedPath, setCopiedPath }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [layers, setLayers] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const isGdb = node.type === 'gdb' || node.type === 'gpkg';
  const isExpandable = node.is_dir || isGdb;

  useEffect(() => {
      if (node.autoExpand && !isOpen) {
          setIsOpen(true);
      }
  }, [node.autoExpand]);

  const handleToggle = async () => {
    setIsOpen(!isOpen);
    if (!isOpen && isGdb && !layers) {
      setIsLoading(true);
      try {
        const res = await fetch(`http://${window.location.hostname}:${window.MAGPI_PORT || '8282'}/api/list_layers?file_path=${encodeURIComponent(node.path)}`);
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
        
        <button 
          onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(node.path);
              setCopiedPath(node.path);
              setTimeout(() => setCopiedPath(null), 2000);
          }}
          className="opacity-0 group-hover:opacity-100 hover:text-emerald-400 text-slate-500 transition-opacity p-0.5 ml-1 shrink-0"
          title="Copy Absolute Path"
        >
          {copiedPath === node.path ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
        </button>

        {node.type && node.type !== 'folder' && (
          <span className="opacity-0 group-hover:opacity-100 text-[9px] bg-slate-800 px-1 rounded text-slate-500 uppercase ml-2 transition-opacity">
            {node.type}
          </span>
        )}
        {globalEnv?.external_dirs?.includes(node.path) && (
          <button 
              className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-purple-400 ml-2 transition-opacity z-10"
              onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`Are you sure you want to unlink ${node.name} from the catalog? This will not delete the folder from disk.`)) {
                      window.dispatchEvent(new CustomEvent('magpi-unlink-external', { detail: { path: node.path } }));
                  }
              }}
              title="Unlink Folder from Catalog"
          >
              <Link size={12} />
          </button>
        )}
        {node.path !== '/home/gda/MagPI/magpi_workspace' && !globalEnv?.external_dirs?.includes(node.path) && (
          <button 
              className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-500 ml-2 transition-opacity z-10"
              onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`Are you sure you want to permanently delete ${node.name} from the server? This action cannot be undone.`)) {
                      window.dispatchEvent(new CustomEvent('magpi-delete-file', { detail: { path: node.path } }));
                  }
              }}
              title="Delete File/Folder from Server"
          >
              <Trash2 size={12} />
          </button>
        )}
      </div>

      {isOpen && node.children && (
        <div>
          {node.children.map((child, i) => (
            <FileNode key={i} node={child} level={level + 1} globalEnv={globalEnv} copiedPath={copiedPath} setCopiedPath={setCopiedPath} />
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
              title={layer}
            >
              <Box size={12} className="mr-2 opacity-50 shrink-0" />
              <span className="truncate">{layer}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default function CatalogPane({ mapLayers = [], setMapLayers, reorderLayers, activeWorkspace, nodes = [], setNodes, selectedNodeId, setSelectedNodeId, openFileBrowser, globalEnv, isDaemonAlive, autoZoom, setAutoZoom }) {
  const [catalog, setCatalog] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedLayers, setExpandedLayers] = useState({});
  const [copiedPath, setCopiedPath] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [dragSourceIndex, setDragSourceIndex] = useState(null);
  const reactFlow = useReactFlow();

  const handleNodeClick = (node) => {
    if (setSelectedNodeId) setSelectedNodeId(node.id);
    reactFlow.setCenter(node.x + 125, node.y + 40, { duration: 800, zoom: 1.5 });
  };

  const fetchCatalog = async () => {
    setIsLoading(true);
    try {
      const qs = new URLSearchParams();
      if (globalEnv?.workspace_dir) qs.append('workspace', globalEnv.workspace_dir);
      if (globalEnv?.output_dir) qs.append('output', globalEnv.output_dir);
      if (globalEnv?.external_dirs) {
          globalEnv.external_dirs.forEach(dir => qs.append('external', dir));
      }
      const res = await fetch(`http://${window.location.hostname}:${window.MAGPI_PORT || '8282'}/api/list_files?${qs.toString()}`);
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
    if (isDaemonAlive) {
        fetchCatalog();
    }
  }, [globalEnv?.workspace_dir, isDaemonAlive]);

  useEffect(() => {
    const handleDelete = async (e) => {
        const { path } = e.detail;
        try {
            await fetch(`http://${window.location.hostname}:${window.MAGPI_PORT || '8282'}/api/delete_file?path=${encodeURIComponent(path)}`);
            fetchCatalog();
        } catch (err) {
            console.error("Failed to delete file", err);
        }
    };
    window.addEventListener('magpi-delete-file', handleDelete);
    return () => window.removeEventListener('magpi-delete-file', handleDelete);
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
          <div className="flex space-x-1">
            <button onClick={() => openFileBrowser('env', 'workspace', null)} className="p-1 hover:bg-slate-700 rounded transition-colors text-slate-400 hover:text-emerald-400" title="Change Workspace Directory">
              <FolderOpen size={12} />
            </button>
            <button 
                onClick={async () => {
                    const name = window.prompt("Enter new folder name:");
                    if (name) {
                        try {
                            await fetch(`http://${window.location.hostname}:${window.MAGPI_PORT || '8282'}/api/create_folder?workspace=${encodeURIComponent(globalEnv?.workspace_dir || '')}&name=${encodeURIComponent(name)}`);
                            fetchCatalog();
                        } catch (err) {
                            console.error("Failed to create folder", err);
                        }
                    }
                }}
                className="p-1 hover:bg-slate-700 rounded transition-colors text-slate-400 hover:text-blue-400" 
                title="New Folder in Workspace"
            >
              <FolderPlus size={12} />
            </button>
            <button 
                onClick={() => openFileBrowser('env', 'external_dirs_append', null)} 
                className="p-1 hover:bg-slate-700 rounded transition-colors text-slate-400 hover:text-purple-400" 
                title="Link External Folder to Catalog"
            >
              <Link size={12} />
            </button>
            <button onClick={fetchCatalog} className="p-1 hover:bg-slate-700 rounded transition-colors text-slate-400 hover:text-emerald-400" title="Refresh Catalog">
              <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
        
        <div className="p-2 border-b border-slate-800 text-[10px] text-slate-400 uppercase tracking-widest text-center bg-slate-900 shadow-inner font-semibold">
          Drag files to Canvas
        </div>
        
        <div className="flex-1 overflow-y-auto p-1 custom-scrollbar">
          {catalog.map((node, i) => (
            <FileNode key={i} node={{...node, autoExpand: node.name === 'magpi_workspace'}} level={0} globalEnv={globalEnv} />
          ))}
        </div>
      </div>

      {/* Bottom Half: Map Layers or Node Navigator */}
      <div className={`${activeWorkspace === 'planar' ? 'h-[60%] min-h-[400px]' : 'h-[40%] min-h-[250px]'} border-t border-slate-700 flex flex-col bg-slate-900 shadow-[0_-5px_15px_rgba(0,0,0,0.2)] transition-all duration-300`}>
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
                        <Crosshair size={14} className="mr-2 opacity-50 group-hover:opacity-100 group-hover:text-emerald-400 transition-opacity shrink-0" />
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
                <button 
                  onClick={() => setAutoZoom(!autoZoom)}
                  className={`flex items-center text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded border ${autoZoom ? 'bg-cyan-900/50 text-cyan-300 border-cyan-700/50' : 'bg-slate-900 text-slate-500 border-slate-700 hover:text-slate-300'} transition-colors`}
                  title="Toggle Auto-Zoom to new layers"
                >
                  <Crosshair size={12} className="mr-1" /> Auto-Zoom
                </button>
                </div>
        <div 
          className="flex-1 overflow-y-auto p-2 custom-scrollbar space-y-1 relative"
          onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              e.dataTransfer.dropEffect = 'move';
              // If we drag over the empty space at the bottom, reset index or assume end
              if (e.target === e.currentTarget) {
                  setDragOverIndex(null);
              }
          }}
          onDragLeave={(e) => {
              if (e.target === e.currentTarget) {
                  setDragOverIndex(null);
              }
          }}
          onDrop={(e) => {
              // Only handle map dropping here (for dragging new tools onto the pane)
              e.preventDefault();
              e.stopPropagation();
              
              setDragOverIndex(null);
              
              let data = null;
              if (window.__draggedMagPITool) {
                  data = window.__draggedMagPITool;
                  window.__draggedMagPITool = null;
              } else {
                  const dataStr = e.dataTransfer.getData('application/reactflow') || e.dataTransfer.getData('text/plain');
                  if (dataStr && !dataStr.startsWith('magpi-layer:')) { 
                      try { data = JSON.parse(dataStr); } catch(err) {} 
                  }
              }
              if (data && typeof data === 'object' && data.id) {
                  window.dispatchEvent(new CustomEvent('magpi-map-drop', { detail: data }));
              }
          }}
        >
          {mapLayers.length === 0 && (
             <div className="absolute inset-0 flex items-center justify-center text-slate-600 text-xs text-center p-4 pointer-events-none border-2 border-dashed border-slate-700/50 rounded-lg m-2">
                 Drag spatial files here to add them to the map.
             </div>
          )}
          {mapLayers.map((layer, index) => {
              const isExpanded = expandedLayers[layer.id];
              return (
              <div 
                  key={layer.id} 
                  draggable
                  onDragStart={(e) => {
                      setDragSourceIndex(index);
                      e.dataTransfer.effectAllowed = 'move';
                      // Fallback for tools outside React state
                      e.dataTransfer.setData('text/plain', `magpi-layer:${index}`);
                  }}
                  onDragEnd={(e) => {
                      setDragSourceIndex(null);
                      setDragOverIndex(null);
                  }}
                  onDragEnter={(e) => {
                      e.preventDefault();
                      setDragOverIndex(index);
                  }}
                  onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.dataTransfer.dropEffect = 'move';
                      if (dragOverIndex !== index) {
                          setDragOverIndex(index);
                      }
                  }}
                  onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      
                      const targetIndex = index;
                      setDragOverIndex(null);
                      
                      let sourceIdx = dragSourceIndex;
                      if (sourceIdx === null) {
                          const dataStr = e.dataTransfer.getData('text/plain');
                          if (dataStr && dataStr.startsWith('magpi-layer:')) {
                              sourceIdx = parseInt(dataStr.split(':')[1], 10);
                          }
                      }
                      
                      if (sourceIdx !== null && sourceIdx !== targetIndex && reorderLayers) {
                          reorderLayers(sourceIdx, targetIndex);
                      }
                      setDragSourceIndex(null);
                  }}
                  className={`p-2 rounded-md ${selectedNodeId === layer.id ? 'bg-cyan-900/40 border border-cyan-700/50' : 'bg-slate-800/60 border border-transparent'} hover:bg-slate-700/60 transition-colors flex flex-col cursor-move relative`}
              >
                  {dragOverIndex === index && (
                      <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500 z-50 rounded-t-md pointer-events-none shadow-[0_0_10px_rgba(16,185,129,0.8)]" />
                  )}
                  <div className="flex items-center justify-between mb-1">
                      <button 
                          onPointerDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setExpandedLayers(prev => ({ ...prev, [layer.id]: !prev[layer.id] }));
                          }}
                          className="mr-1 text-slate-400 hover:text-emerald-400 shrink-0"
                      >
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      <span 
                          className="text-[11px] font-medium text-slate-200 truncate flex-1 cursor-pointer hover:text-cyan-400 transition-colors" 
                          title={layer.name}
                          onPointerDown={(e) => {
                              e.stopPropagation();
                              if (setSelectedNodeId && layer.id !== 'base') {
                                  setSelectedNodeId(layer.id);
                              }
                          }}
                      >
                          {layer.name}
                      </span>
                      <div className="flex items-center ml-2 shrink-0 space-x-1">
                          <button 
                              onPointerDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  window.dispatchEvent(new CustomEvent('magpi-zoom-layer', { detail: { layerId: layer.id } }));
                              }}
                              className="text-slate-400 hover:text-cyan-400"
                              title="Zoom to Layer"
                          >
                              <Search size={12} />
                          </button>
                          <button 
                              onPointerDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (setMapLayers) {
                                      setMapLayers(prev => prev.map(l => l.id === layer.id ? { ...l, visible: !l.visible } : l));
                                  }
                              }}
                              className="text-slate-400 hover:text-white"
                              title="Toggle Visibility"
                          >
                              {layer.visible ? <Eye size={12} className="text-emerald-400" /> : <EyeOff size={12} className="text-slate-600" />}
                          </button>
                          <button
                              onPointerDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (setNodes) {
                                      setNodes(prev => prev.map(n => n.id === layer.id ? { ...n, params: { ...n.params, export_to_map: false } } : n));
                                  }
                              }}
                              className="text-slate-400 hover:text-orange-400"
                              title="Hide from Map (Unlink Layer)"
                          >
                              <MinusCircle size={12} />
                          </button>
                      </div>
                  </div>
                  
                  {isExpanded && layer.visible && (
                      <div className="mt-2 pl-5 space-y-3 bg-slate-900/50 p-2 rounded border border-slate-700/50">
                          <div className="flex items-center space-x-2">
                              <span className="text-[9px] text-slate-500 uppercase tracking-widest w-12 shrink-0">Opacity</span>
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
                              <span className="text-[9px] text-slate-400 w-6 text-right shrink-0">{layer.opacity}%</span>
                          </div>
                          
                          {layer.isBase === false && (() => {
                              const node = nodes.find(n => n.id === layer.id);
                              if (node && node.toolId === 'core_extent') {
                                  return (
                                      <div className="flex flex-col space-y-1 mt-2 border-t border-slate-700/50 pt-2">
                                          <span className="text-[9px] text-slate-500 uppercase tracking-widest shrink-0">Spatial Coordinates (AOI)</span>
                                          <div className="grid grid-cols-2 gap-1 mt-1">
                                              <div className="flex items-center space-x-1">
                                                  <span className="text-[9px] text-slate-400 w-2 shrink-0">W</span>
                                                  <input type="number" step="0.001" className="flex-1 bg-slate-800 text-[10px] text-slate-300 border border-slate-700 rounded px-1 py-0.5 outline-none" value={node.params.xmin || ''} onChange={(e) => setNodes && setNodes(prev => prev.map(n => n.id === layer.id ? { ...n, params: { ...n.params, xmin: parseFloat(e.target.value) } } : n))} />
                                              </div>
                                              <div className="flex items-center space-x-1">
                                                  <span className="text-[9px] text-slate-400 w-2 shrink-0">S</span>
                                                  <input type="number" step="0.001" className="flex-1 bg-slate-800 text-[10px] text-slate-300 border border-slate-700 rounded px-1 py-0.5 outline-none" value={node.params.ymin || ''} onChange={(e) => setNodes && setNodes(prev => prev.map(n => n.id === layer.id ? { ...n, params: { ...n.params, ymin: parseFloat(e.target.value) } } : n))} />
                                              </div>
                                              <div className="flex items-center space-x-1">
                                                  <span className="text-[9px] text-slate-400 w-2 shrink-0">E</span>
                                                  <input type="number" step="0.001" className="flex-1 bg-slate-800 text-[10px] text-slate-300 border border-slate-700 rounded px-1 py-0.5 outline-none" value={node.params.xmax || ''} onChange={(e) => setNodes && setNodes(prev => prev.map(n => n.id === layer.id ? { ...n, params: { ...n.params, xmax: parseFloat(e.target.value) } } : n))} />
                                              </div>
                                              <div className="flex items-center space-x-1">
                                                  <span className="text-[9px] text-slate-400 w-2 shrink-0">N</span>
                                                  <input type="number" step="0.001" className="flex-1 bg-slate-800 text-[10px] text-slate-300 border border-slate-700 rounded px-1 py-0.5 outline-none" value={node.params.ymax || ''} onChange={(e) => setNodes && setNodes(prev => prev.map(n => n.id === layer.id ? { ...n, params: { ...n.params, ymax: parseFloat(e.target.value) } } : n))} />
                                              </div>
                                          </div>
                                      </div>
                                  );
                              }

                              return (
                                  <div className="flex items-center space-x-2">
                                      {layer.name.includes('.tif') || layer.name.includes('Raster') || layer.name.includes('Extract') ? (
                                          <>
                                              <span className="text-[9px] text-slate-500 uppercase tracking-widest w-12 shrink-0">Colormap</span>
                                              <select 
                                                  className="flex-1 bg-slate-800 text-[10px] text-slate-300 border border-slate-700 rounded px-1 py-0.5 outline-none"
                                                  value={layer.cmap || 'viridis'}
                                                  onChange={(e) => {
                                                      if (setMapLayers) {
                                                          setMapLayers(prev => prev.map(l => l.id === layer.id ? { ...l, cmap: e.target.value } : l));
                                                      }
                                                  }}
                                              >
                                                  <option value="viridis">Viridis</option>
                                                  <option value="plasma">Plasma</option>
                                                  <option value="inferno">Inferno</option>
                                                  <option value="magma">Magma</option>
                                                  <option value="cividis">Cividis</option>
                                                  <option value="gray">Gray</option>
                                                  <option value="terrain">Terrain</option>
                                              </select>
                                          </>
                                      ) : (
                                            <>
                                                <span className="text-[9px] text-slate-500 uppercase tracking-widest w-12 shrink-0">Color</span>
                                                <DebouncedColorPicker 
                                                    color={layer.vectorColor}
                                                    onChange={(newColor) => {
                                                        if (setMapLayers) {
                                                            setMapLayers(prev => prev.map(l => l.id === layer.id ? { ...l, vectorColor: newColor } : l));
                                                        }
                                                    }}
                                                />
                                            </>
                                      )}
                                  </div>
                              );
                          })()}
                      </div>
                  )}
              </div>
          )})}
        </div>
            </>
        )}
      </div>
    </div>
  );
}
