import React, { useState, useEffect } from 'react';
import { Folder, Database, File, ChevronRight, ChevronDown, RefreshCw, Box, Map, Image as ImageIcon } from 'lucide-react';

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
    e.dataTransfer.setData('application/magpi-dataset', JSON.stringify(dragData));
    e.dataTransfer.effectAllowed = 'copy';
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
        <span className="truncate flex-1" title={node.name}>{node.name}</span>
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

export default function CatalogPane() {
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
    <div className="w-64 border-r border-[#333333] flex flex-col bg-[#252526] h-full shrink-0 relative z-20 shadow-[2px_0_10px_rgba(0,0,0,0.5)]">
      <div className="p-3 border-b border-[#333333] flex justify-between items-center bg-[#2d2d2d]">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center">
          <Database size={14} className="mr-2" />
          Catalog
        </h2>
        <button onClick={fetchCatalog} className="p-1 hover:bg-[#444] rounded transition-colors text-slate-400 hover:text-emerald-400" title="Refresh Catalog">
          <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} />
        </button>
      </div>
      
      <div className="p-2 border-b border-[#333] text-[10px] text-slate-500 uppercase tracking-widest text-center bg-[#1e1e1e]/50">
        Drag files to Canvas
      </div>
      
      <div className="flex-1 overflow-y-auto p-1 custom-scrollbar">
        {catalog.map((node, i) => (
          <FileNode key={i} node={node} level={0} />
        ))}
      </div>
    </div>
  );
}
