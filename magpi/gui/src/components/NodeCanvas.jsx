import React, { useCallback, useRef } from 'react';
import { TOOLBOX_CATEGORIES } from './Toolbox';
import { 
  ReactFlow,
  Background, 
  Controls, 
  MiniMap, 
  applyNodeChanges, 
  applyEdgeChanges,
  Handle,
  Position,
  ReactFlowProvider,
  useReactFlow,
  useNodesState,
  useEdgesState,
  reconnectEdge,
  Panel,
  useNodes,
  useEdges
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { 
  Loader2, CheckCircle2, XCircle, Hexagon, Satellite, 
  Layers, Grid, DownloadCloud, Map as MapIcon, Globe, 
  ImageIcon, Box, Leaf, Cpu, Crosshair, Scissors, 
  CircleDashed, Settings, PaintBucket, FileOutput, LineChart,
  Database, SlidersHorizontal, Network, Target
} from 'lucide-react';



// --- INTELLIGENT ICON ROUTER ---
const getIconElement = (iconName) => {
  const key = (iconName || '').toLowerCase();
  if (key === 'core_extent') return <Hexagon size={14} className="text-yellow-400" />;
  if (key.includes('sentinel')) return <Satellite size={14} className="text-cyan-400" />;
  if (key.includes('nlcd') || key.includes('grid')) return <Grid size={14} className="text-cyan-400" />;
  if (key.includes('elevation') || key.includes('layers')) return <Layers size={14} className="text-cyan-400" />;
  if (key.includes('classify')) return <ImageIcon size={14} className="text-purple-400" />;
  if (key.includes('train') || key.includes('detect')) return <Cpu size={14} className="text-purple-400" />;
  if (key.includes('paint') || key.includes('reclassify')) return <PaintBucket size={14} className="text-emerald-400" />;
  if (key.includes('polygon') || key.includes('clip') || key.includes('buffer')) return <Scissors size={14} className="text-orange-400" />;
  if (key.includes('stats')) return <LineChart size={14} className="text-rose-400" />;
  if (key.includes('etl') || key.includes('join') || key.includes('db')) return <Database size={14} className="text-indigo-400" />;
  if (key.includes('envi') || key.includes('band') || key.includes('pca')) return <SlidersHorizontal size={14} className="text-pink-400" />;
  return <Settings size={14} className="text-slate-400" />;
};

const getInHandleColor = (lbl) => {
  if (['VAR A', 'VAR B', 'MATH', 'CONST', 'VAL'].includes(lbl)) return '#ffcc00'; // Yellow
  if (['AOI', 'VECTOR', 'EXTENT', 'MASK', 'TRUTH', 'JOIN'].includes(lbl)) return '#32d74b'; // Green
  if (['IMG', 'RASTER', 'TENSORS', 'PREDICT', 'TARGET'].includes(lbl)) return '#5ac8fa'; // Blue
  return '#a3a3a3'; // Default Grey
};

const getOutHandleColor = (toolId) => {
  if (toolId.startsWith('logic_') || toolId === 'core_extent') return '#ffcc00'; // Yellow
  if (toolId === 'core_create_vector' || toolId === 'mgt_buffer' || toolId === 'conv_raster_to_polygon') return '#32d74b'; // Green
  if (toolId.startsWith('wfs_') || toolId === 'load_raster' || toolId === 'mgt_clip') return '#5ac8fa'; // Blue
  return '#8e8e93'; // Default Grey, reserving Red for Pre-flight validation
};

// --- DYNAMIC CHAINNER NODE COMPONENT ---
const MagPINode = ({ data, id }) => {
  const [collapsed, setCollapsed] = React.useState(false);
  const [attributesExpanded, setAttributesExpanded] = React.useState(false);
  const [bandsExpanded, setBandsExpanded] = React.useState(false);
  // 1. Structural Logic
  const toolId = data.toolId || '';

  React.useEffect(() => {
    if (toolId === 'load_raster' && data.params?.file_path && !data.metadataFetched) {
        fetch(`http://localhost:8080/api/raster_metadata?file=${encodeURIComponent(data.params.file_path)}`)
        .then(res => res.ok ? res.json() : null)
        .then(meta => {
            if (meta && !meta.error) {
                let fileExt = '';
                if (data.params?.file_path) {
                    const parts = data.params.file_path.split('.');
                    if (parts.length > 1) fileExt = ` (.${parts.pop().toLowerCase()})`;
                }
                const newOutputs = [
                    { id: 'raster', type: 'RASTER', label: `RASTER${fileExt}` },
                    { id: 'path_out', type: 'STRING', label: 'PATH OUT' },
                    { id: 'crs', type: 'STRING', label: 'CRS', value: meta.crs },
                    { id: 'extent', type: 'EXTENT', label: 'EXTENT', value: meta.extent ? `[${meta.extent.map(v=>v.toFixed(2)).join(', ')}]` : null },
                    { id: 'dtype', type: 'STRING', label: 'DTYPE', value: meta.dtype },
                    { id: 'nodata', type: 'FLOAT', label: 'NODATA', value: meta.nodata !== null ? meta.nodata : 'N/A' },
                    { id: 'acq_date', type: 'STRING', label: 'ACQ DATE', value: meta.tags?.['TIFFTAG_DATETIME'] || 'N/A' },
                ];
                
                if (meta.tags && meta.tags.wavelengths) {
                    newOutputs.push({ id: 'wavelengths', type: 'ARRAY', label: 'WAVELENGTHS', value: 'PRESENT' });
                }
                
                for (let i = 1; i <= (meta.bands || 0); i++) {
                    const desc = meta.descriptions && meta.descriptions[i - 1] ? ` (${meta.descriptions[i - 1]})` : '';
                    newOutputs.push({ id: `b${i}`, type: 'ARRAY', label: `BAND ${i}${desc}` });
                }
                
                if (meta.rpc) {
                    newOutputs.push({ id: 'rpc', type: 'OBJECT', label: 'RPC', value: 'PRESENT' });
                }
                
                if (data.updateGlobalNode) {
                    data.updateGlobalNode({ outputs: newOutputs, metadataFetched: true });
                }
            }
        }).catch(err => console.error(err));
    }
    
    if (toolId === 'load_vector' && data.params?.file_path && !data.metadataFetched) {
        fetch(`http://localhost:8080/api/vector_metadata?file=${encodeURIComponent(data.params.file_path)}`)
        .then(res => res.ok ? res.json() : null)
        .then(meta => {
            if (meta && !meta.error) {
                let fileExt = '';
                if (data.params?.file_path) {
                    const parts = data.params.file_path.split('.');
                    if (parts.length > 1) fileExt = ` (.${parts.pop().toLowerCase()})`;
                }
                const newOutputs = [
                    { id: 'vector', type: 'VECTOR', label: `VECTOR${fileExt}` },
                    { id: 'path_out', type: 'STRING', label: 'PATH OUT' },
                    { id: 'crs', type: 'STRING', label: 'CRS', value: meta.crs },
                    { id: 'extent', type: 'EXTENT', label: 'EXTENT', value: meta.extent ? `[${meta.extent.map(v=>v.toFixed(2)).join(', ')}]` : null },
                    { id: 'geometry', type: 'STRING', label: 'GEOMETRY', value: meta.geometry },
                    { id: 'feature_count', type: 'INT', label: 'FEATURE COUNT', value: meta.feature_count }
                ];
                
                if (meta.attributes) {
                    meta.attributes.forEach(attr => {
                        let shortType = attr.type;
                        if (shortType.includes(':')) shortType = shortType.split(':')[0]; // e.g., int:10 -> int
                        newOutputs.push({ id: `attr_${attr.name}`, type: 'FLOAT', label: attr.name, value: shortType });
                    });
                }
                
                if (data.updateGlobalNode) {
                    data.updateGlobalNode({ outputs: newOutputs, metadataFetched: true });
                }
            }
        }).catch(err => console.error(err));
    }
  }, [toolId, data.params?.file_path, data.metadataFetched, id, data]);

  
  // Pure sources (NO LEFT PORTS)
  const isPureSource = ['core_extent', 'load_raster', 'load_vector', 'logic_constant'].includes(toolId);
  // Pure endpoints (NO RIGHT PORTS)
  const isEndpoint = ['conv_raster_to_polygon', 'stats_confusion_matrix', 'etl_db_writer'].includes(toolId);
  // Dual-input receivers
  const isDualInput = ['ia_export_dl', 'stats_confusion_matrix', 'mgt_clip', 'ia_pansharpen', 'etl_spatial_join', 'ia_raster_math', 'logic_math'].includes(toolId);
  
  const isPrimitive = ['logic_string', 'logic_integer', 'logic_float', 'logic_boolean'].includes(toolId);
  const primitiveValue = data.params?.value;

  const edges = useEdges();
  const nodes = useNodes();

  // 2. Visual Hierarchy (Shapes)
  let shapeClass = "rounded-lg"; 
  if (isPureSource) shapeClass = "rounded-l-[24px] rounded-r-md"; 
  if (isEndpoint) shapeClass = "rounded-r-[24px] rounded-l-md"; 

  // 3. Dynamic Typed Ports Logic
  
  const getPortColor = (type, label) => {
      const t = (type || label || '').toUpperCase();
      if (['EXTENT', 'AOI', 'BBOX'].includes(t)) return '#ffcc00'; // Yellow
      if (['VECTOR', 'FOOTPRINTS', 'CENTROIDS', 'DAMAGE', 'GEOJSON'].includes(t)) return '#32d74b'; // Green
      if (['RASTER', 'IMG', 'PRE DSM', 'POST DSM', 'SAR', 'TIFF'].includes(t)) return '#5ac8fa'; // Blue
      if (['FILE', 'REPORT', 'STATUS', 'JSON'].includes(t)) return '#bf5af2'; // Purple
      return '#a3a3a3'; // Grey
  };

  // 4. Legacy Typographical Labels (Fallback)
  let topLbl = "IN 1", botLbl = "IN 2", singleLbl = "IN";
  
  if (toolId === 'ia_export_dl') { topLbl = "IMG"; botLbl = "LBL"; }
  else if (toolId === 'stats_confusion_matrix') { topLbl = "PREDICT"; botLbl = "TRUTH"; }
  else if (toolId === 'mgt_clip') { topLbl = "TARGET"; botLbl = "EXTENT"; }
  else if (toolId === 'etl_spatial_join') { topLbl = "TARGET"; botLbl = "JOIN"; }
  else if (toolId === 'ia_raster_math' || toolId === 'logic_math') { topLbl = "VAR A"; botLbl = "VAR B"; }
  
  if (toolId === 'ai_train') singleLbl = "TENSORS";
  else if (toolId === 'conv_raster_to_polygon') singleLbl = "MASK";
  else if (toolId.startsWith('wfs_')) singleLbl = "AOI";
  else if (toolId === 'logic_extract_attr') singleLbl = "VECTOR";

  // 5. Synthesize Inputs/Outputs if missing
  let inputs = data.inputs;
  if (!inputs) {
    inputs = [];
    if (!isPureSource) {
      if (isDualInput) {
        inputs.push({ id: 'in1', label: topLbl, type: topLbl });
        inputs.push({ id: 'in2', label: botLbl, type: botLbl });
      } else {
        inputs.push({ id: 'in', label: singleLbl, type: singleLbl });
      }
    }
  }

  let outputs = data.outputs;
  if (!outputs) {
    outputs = [];
    if (!isEndpoint) {
      outputs.push({ id: 'out', label: 'OUT', type: 'OUT' });
    }
  }
  const renderInput = (inp) => {
      const isConnected = edges.some(e => e.target === id && e.targetHandle === inp.id);
      const isHidden = collapsed && !isConnected;
      const color = getPortColor(inp.type, inp.label) !== '#a3a3a3' ? getPortColor(inp.type, inp.label) : getInHandleColor(inp.label);
      return (
          <div key={inp.id} className={`w-full relative flex items-center transition-all duration-300 ${isHidden ? 'hidden' : 'h-4'}`}>
              <Handle type="target" position={Position.Left} id={inp.id} isConnectableStart={false} style={{ backgroundColor: color, top: '50%' }} className="w-3.5 h-3.5 rounded-full border-[2.5px] border-[#1a1a1a] cursor-crosshair hover:bg-white transition-all z-50 !-left-4" />
              <span style={{ color: color }} className="text-[9px] font-mono font-bold tracking-widest pointer-events-none drop-shadow-sm ml-1">{inp.label || inp.id.toUpperCase()}</span>
          </div>
      );
  };

  const renderOutput = (out, groupExpanded) => {
      const isConnected = edges.some(e => e.source === id && e.sourceHandle === out.id);
      let isHidden = collapsed && !isConnected;
      if (groupExpanded !== undefined && !collapsed && !groupExpanded && !isConnected) isHidden = true;

      const color = getPortColor(out.type, out.label) !== '#a3a3a3' ? getPortColor(out.type, out.label) : getOutHandleColor(toolId);
      let displayValue = out.value;
      const setterHandle = `set_${out.id}`;
      const incomingEdge = edges.find(e => e.target === id && e.targetHandle === setterHandle);
      if (incomingEdge) {
          const sourceNode = nodes.find(n => n.id === incomingEdge.source);
          if (sourceNode && sourceNode.data && sourceNode.data.params) {
              if (sourceNode.data.toolId === 'core_date_variable') displayValue = sourceNode.data.params.start_date;
              else if (sourceNode.data.params.value !== undefined) displayValue = sourceNode.data.params.value;
          }
      }

      return (
          <div key={out.id} className={`w-full relative flex items-center justify-end transition-all duration-300 ${isHidden ? 'hidden' : 'h-4'}`}>
              {toolId === 'core_date_variable' && (out.id === 'start' || out.id === 'end') ? (
                  <input 
                      type="date"
                      value={out.id === 'start' ? (data.params?.start_date || '') : (data.params?.end_date || '')}
                      onChange={(e) => {
                          if (data.updateGlobalNode) {
                              const key = out.id === 'start' ? 'start_date' : 'end_date';
                              data.updateGlobalNode({ params: { ...data.params, [key]: e.target.value } });
                          }
                      }}
                      className={`bg-transparent text-right text-[9px] font-mono tracking-widest outline-none border-b border-transparent hover:border-[#444] transition-colors mr-1 w-24 ${out.id === 'start' ? 'text-[#ffcc00] focus:border-[#ffcc00] font-bold' : 'text-slate-400 focus:border-slate-400'}`}
                  />
              ) : (
                  <span style={{ color: color }} className="text-[9px] font-mono font-bold tracking-widest pointer-events-none drop-shadow-sm mr-1 truncate max-w-[120px] text-right" title={out.label || out.id.toUpperCase()}>{out.label || out.id.toUpperCase()}</span>
              )}
              <Handle type="source" position={Position.Right} id={out.id} style={{ backgroundColor: color, top: '50%' }} className="w-3.5 h-3.5 rounded-full border-[2.5px] border-[#1a1a1a] cursor-crosshair hover:bg-white transition-all z-50 !-right-4" />
              
              {!collapsed && displayValue !== undefined && displayValue !== null && displayValue !== '' && (
                  <div className="absolute -right-5 top-1/2 -translate-y-1/2 translate-x-full text-left max-w-[120px] pointer-events-none z-10">
                      <span className="text-[8px] text-slate-300 font-mono bg-[#1a1a1a]/80 px-1.5 py-[2px] rounded truncate block shadow-sm border border-[#333]">{String(displayValue)}</span>
                  </div>
              )}
          </div>
      );
  };

  const attrOutputs = outputs.filter(o => o.id.startsWith('attr_'));
  const bandOutputs = outputs.filter(o => o.id.startsWith('b') && !isNaN(o.id.substring(1)));
  const stdOutputs = outputs.filter(o => !o.id.startsWith('attr_') && !(o.id.startsWith('b') && !isNaN(o.id.substring(1))));
  
  const showCollapseToggle = !isPrimitive && (inputs.length > 0 || outputs.length > 0);

  return (
    <div className={`flex flex-col min-w-[170px] max-w-[250px] transition-all duration-200 bg-[#2b2b2b] rounded-lg shadow-[0_4px_15px_rgba(0,0,0,0.5)] border ${data.selected ? 'border-[#ff8c00] shadow-[0_0_15px_rgba(255,140,0,0.3)]' : 'border-[#1a1a1a]'}`}>
      
      {/* HEADER ROW */}
      <div className={`px-3 py-1.5 flex items-center justify-between ${data.color || 'bg-slate-700'} border-b border-[#1a1a1a] rounded-t-lg`}>
        <div className="flex items-center space-x-2">
            {showCollapseToggle && (
                <div 
                    onClick={() => setCollapsed(!collapsed)}
                    className="text-slate-300 hover:text-white cursor-pointer transition-transform duration-200 flex items-center justify-center w-3 h-3"
                    style={{ transform: collapsed ? 'rotate(0deg)' : 'rotate(90deg)' }}
                >
                    <span className="text-[10px] font-bold">►</span>
                </div>
            )}
            <div className="text-white drop-shadow-md">{getIconElement(data.toolId)}</div>
            <div>
                <div className="text-[10px] font-bold text-white tracking-wider drop-shadow-md">{data.name}</div>
            </div>
        </div>
        <div>
            {data.status === 'processing' && <Loader2 size={12} className="text-white animate-spin drop-shadow" />}
            {data.status === 'success' && <CheckCircle2 size={12} className="text-[#32d74b] drop-shadow" />}
            {data.status === 'error' && <XCircle size={12} className="text-[#ff453a] drop-shadow" />}
        </div>
      </div>

      {/* BODY ROW */}
      <div className={`relative bg-gradient-to-b from-[#3a3a3a] to-[#2b2b2b] rounded-b-lg flex flex-col justify-between ${isPrimitive ? 'p-2' : 'p-3 min-h-[30px]'}`}>
          <div className="w-full flex flex-col">
              
              {/* STANDARD ROW */}
              <div className={`flex justify-between w-full ${isPrimitive ? '' : 'min-h-[30px]'}`}>
                  <div className="flex flex-col justify-around h-full gap-2 w-1/2">
                      {inputs.map(inp => renderInput(inp))}
                  </div>
                  <div className="flex flex-col justify-around h-full items-end gap-2 w-1/2">
                      {stdOutputs.map(out => renderOutput(out))}
                  </div>
              </div>
              
              {/* ATTRIBUTES ROW */}
              {!collapsed && attrOutputs.length > 0 && (
                  <div onClick={() => setAttributesExpanded(!attributesExpanded)} className="w-full text-center mt-3 mb-1 border-t border-[#444] pt-1.5 cursor-pointer hover:bg-[#444] bg-[#2b2b2b]/50 transition-colors pointer-events-auto rounded">
                      <span className="text-[9px] font-bold tracking-widest text-slate-300">{attributesExpanded ? '▼' : '►'} ATTRIBUTES ({attrOutputs.length})</span>
                  </div>
              )}
              <div className={`flex justify-between w-full transition-all duration-300 ${attributesExpanded ? 'max-h-[300px] overflow-y-auto pr-1 custom-scrollbar' : ''}`}>
                  <div className="flex flex-col gap-2 w-1/2"></div>
                  <div className="flex flex-col items-end gap-2 w-1/2">
                      {attrOutputs.map(out => renderOutput(out, attributesExpanded))}
                  </div>
              </div>

              {/* BANDS ROW */}
              {!collapsed && bandOutputs.length > 0 && (
                  <div onClick={() => setBandsExpanded(!bandsExpanded)} className="w-full text-center mt-3 mb-1 border-t border-[#444] pt-1.5 cursor-pointer hover:bg-[#444] bg-[#2b2b2b]/50 transition-colors pointer-events-auto rounded">
                      <span className="text-[9px] font-bold tracking-widest text-slate-300">{bandsExpanded ? '▼' : '►'} BANDS ({bandOutputs.length})</span>
                  </div>
              )}
              <div className={`flex justify-between w-full transition-all duration-300 ${bandsExpanded ? 'max-h-[300px] overflow-y-auto pr-1 custom-scrollbar' : ''}`}>
                  <div className="flex flex-col gap-2 w-1/2"></div>
                  <div className="flex flex-col items-end gap-2 w-1/2">
                      {bandOutputs.map(out => renderOutput(out, bandsExpanded))}
                  </div>
              </div>

          </div>
            
            {isPrimitive && primitiveValue !== undefined && (
                <div className="w-full mt-2 pt-2 border-t border-[#444] flex flex-col items-center justify-center gap-1">
                    <input 
                        type={toolId === 'logic_string' ? "text" : "number"}
                        value={primitiveValue}
                        onChange={(e) => {
                            let val = e.target.value;
                            if (toolId === 'logic_integer') val = parseInt(val, 10);
                            else if (toolId === 'logic_float') val = parseFloat(val);
                            
                            if (data.updateGlobalNode) {
                                data.updateGlobalNode({ params: { ...data.params, value: val } });
                            }
                        }}
                        className="w-11/12 bg-transparent text-center text-xs text-[#ffcc00] font-mono font-bold tracking-widest outline-none border-b border-transparent hover:border-[#444] focus:border-[#ffcc00] transition-colors pb-1"
                    />
                </div>
            )}
            
            {!isPrimitive && toolId !== 'core_date_variable' && data.params && typeof data.params.export_to_map === 'boolean' && (
                <div className="w-full mt-2 pt-2 border-t border-[#444] flex items-center justify-between">
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Export to Map</span>
                    <input 
                        type="checkbox" 
                        checked={data.params.export_to_map} 
                        onChange={(e) => {
                            if (data.updateGlobalNode) {
                                data.updateGlobalNode({ params: { ...data.params, export_to_map: e.target.checked } });
                            }
                        }}
                        className="w-3 h-3 accent-blue-500 cursor-pointer"
                    />
                </div>
            )}
      </div>
    </div>
  );
};

const nodeTypes = { magpiNode: MagPINode };

// --- INNER CANVAS ENGINE ---
export default function NodeCanvas({ 
  nodes, setNodes, connections, setConnections, 
  selectedNodeId, setSelectedNodeId, setActiveRightTab, nodeStatuses, addNode 
}) {
  const reactFlowWrapper = useRef(null);
  const { screenToFlowPosition, fitView } = useReactFlow();

  React.useEffect(() => {
    if (nodes.length > 0) {
      setTimeout(() => fitView({ padding: 0.2, duration: 800 }), 100);
    }
  }, [nodes.length > 0, fitView]);

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState([]);
  
  const connectingNodeId = React.useRef(null);
  const connectingHandleId = React.useRef(null);
  const connectingHandleType = React.useRef(null);
  const [menuData, setMenuData] = React.useState(null);
  const [menuSearch, setMenuSearch] = React.useState("");

  const onConnectStart = React.useCallback((_, { nodeId, handleId, handleType }) => {
    connectingNodeId.current = nodeId;
    connectingHandleId.current = handleId;
    connectingHandleType.current = handleType;
  }, []);

  // Sync MagPI nodes -> rfNodes (preserves dragging state)
  React.useEffect(() => {
    setRfNodes((current) => nodes.map(n => {
      const existing = current.find(crn => crn.id === n.id);
      
      let position = { x: n.x, y: n.y };
      if (existing) {
          const dx = Math.abs(existing.position.x - n.x);
          const dy = Math.abs(existing.position.y - n.y);
          // Only override ReactFlow's internal position if App.jsx changes it significantly (e.g. Auto Layout)
          if (dx < 5 && dy < 5) {
              position = existing.position;
          }
      }
      
      return {
        ...existing, // keeps dragging, measured, selected
        id: n.id,
        type: 'magpiNode',
        position: position,
        data: { 
            ...n, 
            selected: n.selected || n.id === selectedNodeId, 
            status: nodeStatuses[n.id],
            updateGlobalNode: (newData) => {
                setNodes(prev => prev.map(pn => pn.id === n.id ? { ...pn, ...newData } : pn));
            }
        }
      };
    }));
  }, [nodes, selectedNodeId, nodeStatuses, setRfNodes]);

  // Sync MagPI connections -> rfEdges
  React.useEffect(() => {
    setRfEdges(connections.map((c) => ({
      id: `e_${c.from}_${c.sourceHandle || 'out'}_to_${c.to}_${c.targetHandle || 'in'}`,
      source: c.from,
      target: c.to,
      sourceHandle: c.sourceHandle || 'out',
      targetHandle: c.targetHandle || 'in',
      type: 'default',
      interactionWidth: 20,
      animated: nodeStatuses[c.from] === 'processing' || nodeStatuses[c.to] === 'processing',
      style: { stroke: nodeStatuses[c.to] === 'success' ? '#32d74b' : '#64748b', strokeWidth: 3 }
    })));
  }, [connections, nodeStatuses, setRfEdges]);

  // Sync positions back to App.jsx ONLY on drag stop to prevent render loops
  const onNodeDragStop = useCallback((event, node) => {
    setNodes(nds => nds.map(n => n.id === node.id ? { ...n, x: node.position.x, y: node.position.y } : n));
  }, [setNodes]);

  const onConnect = useCallback((params) => {
    setConnections((eds) => {
        // Enforce 1-to-1 input rule: if target handle is occupied, sever old connection
        const filteredEdges = eds.filter(e => !(e.to === params.target && (e.targetHandle || 'in') === (params.targetHandle || 'in')));
        return [...filteredEdges, { 
            from: params.source, 
            to: params.target,
            sourceHandle: params.sourceHandle || 'out',
            targetHandle: params.targetHandle || 'in'
        }];
    });
  }, [setConnections]);

  const onEdgesDelete = useCallback((edgesToDelete) => {
    setConnections((eds) => eds.filter(c => {
        return !edgesToDelete.find(e => e.source === c.from && e.target === c.to);
    }));
  }, [setConnections]);

  const onReconnect = useCallback((oldEdge, newConnection) => {
    setConnections((eds) => {
       const filtered = eds.filter(c => !(c.from === oldEdge.source && c.to === oldEdge.target));
       return [...filtered, {
           from: newConnection.source,
           to: newConnection.target,
           sourceHandle: newConnection.sourceHandle || 'out',
           targetHandle: newConnection.targetHandle || 'in'
       }];
    });
  }, [setConnections]);

  const onReconnectEnd = useCallback((event, edge) => {
    if (!event.target.classList.contains('react-flow__handle')) {
      setConnections(eds => eds.filter(c => !(c.from === edge.source && c.to === edge.target)));
    }
  }, [setConnections]);

  const onNodesDelete = useCallback((nodesToDelete) => {
    const deletedIds = nodesToDelete.map(n => n.id);
    setNodes(nds => nds.filter(n => !deletedIds.includes(n.id)));
    setConnections(cx => cx.filter(c => !deletedIds.includes(c.from) && !deletedIds.includes(c.to)));
    setSelectedNodeId(null);
    setActiveRightTab('toolbox');
  }, [setNodes, setConnections, setSelectedNodeId, setActiveRightTab]);

  // 6. Interaction Handlers
  const onNodeClick = (_, node) => { setSelectedNodeId(node.id); setActiveRightTab('inspector'); };
  const onPaneClick = () => { setSelectedNodeId(null); setActiveRightTab('toolbox'); };

  const onSelectionChange = useCallback(({ nodes: selectedNodes }) => {
    const selectedIds = selectedNodes.map(n => n.id);
    setNodes(nds => {
        let changed = false;
        const newNds = nds.map(n => {
            const isSel = selectedIds.includes(n.id);
            if (n.selected !== isSel) {
                changed = true;
                return { ...n, selected: isSel };
            }
            return n;
        });
        return changed ? newNds : nds;
    });

    if (selectedIds.length === 1) {
        setSelectedNodeId(selectedIds[0]);
    } else if (selectedIds.length === 0) {
        setSelectedNodeId(null);
    }
  }, [setNodes, setSelectedNodeId]);

  const onPaneContextMenu = useCallback((event) => {
    event.preventDefault();
    const bounds = reactFlowWrapper.current.getBoundingClientRect();
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    setMenuData({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
        flowPos: position,
        sourceNode: null,
        sourceHandle: null,
        sourceType: null
    });
    setMenuSearch("");
  }, [screenToFlowPosition]);

  const onDrop = useCallback((event) => {
      event.preventDefault();
      try {
        let toolData = null;
        if (window.__draggedMagPITool) {
            toolData = window.__draggedMagPITool;
            window.__draggedMagPITool = null;
        } else {
            const rawData = event.dataTransfer.getData('application/reactflow');
            const datasetData = event.dataTransfer.getData('application/magpi-dataset');
            
            if (rawData) {
                toolData = JSON.parse(rawData);
            } else if (datasetData) {
                const dataset = JSON.parse(datasetData);
                const isVector = ['shp', 'geojson', 'gdb', 'gpkg', 'sqlite', 'db'].includes(dataset.type);
                toolData = {
                    id: isVector ? 'load_vector' : 'load_raster',
                    name: isVector ? "Input Vector" : "Input Raster",
                    type: 'input',
                    color: 'bg-blue-600',
                    border: 'border-blue-500',
                    params: {
                        file_path: dataset.path,
                        ...(isVector ? { layer_name: dataset.layer_name || "" } : {})
                    }
                };
            }
        }
        
        if (!toolData) return;
        
        const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        if (position) {
            addNode(toolData, position.x - 100, position.y - 25);
        } else if (reactFlowWrapper.current) {
            const bounds = reactFlowWrapper.current.getBoundingClientRect();
            addNode(toolData, event.clientX - bounds.left - 100, event.clientY - bounds.top - 25);
        }
      } catch (err) { console.error("Drop failed:", err); }
  }, [screenToFlowPosition, addNode]);

  const onDragOver = useCallback((event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
  }, []);

  return (
    <div className="w-full h-full bg-[#0b1120] relative" ref={reactFlowWrapper}>
      
      <style>{`
        .react-flow__controls { background-color: #1e293b; border: 1px solid #334155; border-radius: 8px; overflow: hidden; }
        .react-flow__controls-button { background-color: transparent; border: none; border-bottom: 1px solid #334155; fill: #94a3b8; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
        .react-flow__controls-button:hover { background-color: #10b981; fill: #ffffff; }
        .react-flow__attribution { display: none; }
      `}</style>

      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onNodesDelete={onNodesDelete}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onEdgesDelete={onEdgesDelete}
        onReconnect={onReconnect}
        onReconnectEnd={onReconnectEnd}
        onSelectionChange={onSelectionChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onPaneContextMenu={onPaneContextMenu}
        nodeTypes={nodeTypes}
        fitView
        snapToGrid={true}
        snapGrid={[10, 10]}
        
        panOnDrag={[1, 2]}
        selectionOnDrag={true}
        panActivationKeyCode="Space" 
        selectionKeyCode="Shift"
        deleteKeyCode={['Backspace', 'Delete']}
      >
        <Background color="#1e293b" gap={20} size={1.5} />
        <Controls showInteractive={false} className="react-flow__controls" />
        <MiniMap nodeColor={() => '#334155'} maskColor="rgba(15, 23, 42, 0.75)" className="bg-slate-900 border border-slate-700/80 rounded-lg overflow-hidden shadow-2xl mb-2 mr-2" />
      </ReactFlow>

      {/* DEAD DROP CONTEXT MENU */}
      {menuData && (
        <div 
            className="absolute z-50 bg-[#1e293b] border border-[#334155] rounded shadow-2xl p-2 w-48 text-sm"
            style={{ top: menuData.y, left: menuData.x }}
        >
            <div className="flex justify-between items-center mb-2 pb-1 border-b border-[#334155] gap-2">
                <input 
                    type="text" 
                    placeholder="Search tools..." 
                    autoFocus
                    className="w-full bg-transparent text-[11px] text-white outline-none placeholder-slate-500 font-mono font-bold"
                    value={menuSearch}
                    onChange={e => setMenuSearch(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Escape') {
                            setMenuData(null);
                            setMenuSearch("");
                        }
                    }}
                />
            </div>
            <div className="max-h-[200px] overflow-y-auto space-y-1 scrollbar-hide">
                {TOOLBOX_CATEGORIES.flatMap(cat => cat.tools)
                    .filter(t => t.type !== 'input' || t.id === 'logic_constant')
                    .filter(t => t.name.toLowerCase().includes(menuSearch.toLowerCase()))
                    .map(tool => (
                    <div 
                        key={tool.id} 
                        className="flex items-center space-x-2 p-1.5 hover:bg-[#334155] rounded cursor-pointer text-slate-200 transition-colors"
                        onClick={() => {
                            const newNodeId = addNode(tool, menuData.flowPos.x, menuData.flowPos.y);
                            if (menuData.sourceType === 'source') {
                                setConnections(prev => [...prev, {
                                    id: `edge_${Date.now()}`,
                                    source: menuData.sourceNode, 
                                    sourceHandle: menuData.sourceHandle, 
                                    target: newNodeId, 
                                    targetHandle: tool.inputs ? tool.inputs[0].id : 'in' 
                                }]);
                            } else {
                                setConnections(prev => [...prev, {
                                    id: `edge_${Date.now()}`,
                                    source: newNodeId, 
                                    sourceHandle: tool.outputs ? tool.outputs[0].id : 'out', 
                                    target: menuData.sourceNode, 
                                    targetHandle: menuData.sourceHandle
                                }]);
                            }
                            setMenuData(null);
                            setMenuSearch("");
                        }}
                    >
                        <span className="text-[#3b82f6]">{tool.icon}</span>
                        <span className="text-[10px] uppercase font-mono">{tool.name}</span>
                    </div>
                ))}
            </div>
        </div>
      )}

    </div>
  );
}