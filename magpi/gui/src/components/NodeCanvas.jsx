import React, { useCallback, useRef } from 'react';
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
  Panel
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
  return '#ff3b30'; // Default Red
};

// --- DYNAMIC CHAINNER NODE COMPONENT ---
const MagPINode = ({ data, id }) => {
  const [collapsed, setCollapsed] = React.useState(true);
  // 1. Structural Logic
  const toolId = data.toolId || '';

  React.useEffect(() => {
    if (toolId === 'load_raster' && data.params?.file_path && !data.metadataFetched) {
        fetch(`http://localhost:8080/api/raster_metadata?file=${encodeURIComponent(data.params.file_path)}`)
        .then(res => res.ok ? res.json() : null)
        .then(meta => {
            if (meta && !meta.error) {
                const newOutputs = [
                    { id: 'raster', type: 'RASTER', label: 'RASTER' },
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
  }, [toolId, data.params?.file_path, data.metadataFetched, id, data]);

  
  // Pure sources (NO LEFT PORTS)
  const isPureSource = ['core_extent', 'load_raster', 'load_vector', 'logic_constant'].includes(toolId);
  // Pure endpoints (NO RIGHT PORTS)
  const isEndpoint = ['conv_raster_to_polygon', 'stats_confusion_matrix', 'etl_db_writer'].includes(toolId);
  // Dual-input receivers
  const isDualInput = ['ia_export_dl', 'stats_confusion_matrix', 'mgt_clip', 'ia_pansharpen', 'etl_spatial_join', 'ia_raster_math', 'logic_math'].includes(toolId);

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
  
  const showCollapseToggle = inputs.length > 4 || outputs.length > 4;

  return (
    <div className={`flex flex-col min-w-[170px] max-w-[250px] transition-all duration-200 bg-[#2b2b2b] rounded-lg shadow-[0_4px_15px_rgba(0,0,0,0.5)] border ${data.selected ? 'border-[#ff8c00] shadow-[0_0_15px_rgba(255,140,0,0.3)]' : 'border-[#1a1a1a]'}`}>
      
      {/* HEADER ROW */}
      <div className={`px-3 py-1.5 flex items-center justify-between ${data.color || 'bg-slate-700'} border-b border-[#1a1a1a] rounded-t-lg`}>
        <div className="flex items-center space-x-2">
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
      <div className="p-3 relative bg-gradient-to-b from-[#3a3a3a] to-[#2b2b2b] min-h-[30px] rounded-b-lg flex flex-col justify-between">
            <div className="flex justify-between w-full h-full min-h-[30px]">
                {/* DYNAMIC INPUTS */}
                <div className="flex flex-col justify-around h-full space-y-2">
                    {inputs.map((inp, idx) => {
                        const isHidden = collapsed && idx >= 2 && showCollapseToggle;
                        const color = getPortColor(inp.type, inp.label) !== '#a3a3a3' ? getPortColor(inp.type, inp.label) : getInHandleColor(inp.label);
                        return (
                            <div key={inp.id} className={`relative flex items-center transition-all duration-300 ${isHidden ? 'h-0 overflow-hidden opacity-0 mb-0' : 'h-4'}`}>
                                <Handle type="target" position={Position.Left} id={inp.id} isConnectableStart={false} style={{ backgroundColor: color, top: '50%' }} className="w-3.5 h-3.5 rounded-full border-[2.5px] border-[#1a1a1a] cursor-crosshair hover:bg-white transition-all z-50 !-left-4" />
                                <span style={{ color: color }} className="text-[9px] font-mono font-bold tracking-widest pointer-events-none drop-shadow-sm ml-1">{inp.label || inp.id.toUpperCase()}</span>
                            </div>
                        );
                    })}
                </div>
                {/* DYNAMIC OUTPUTS */}
                <div className="flex flex-col justify-around h-full items-end space-y-2">
                    {outputs.map((out, idx) => {
                        const isHidden = collapsed && idx >= 2 && showCollapseToggle;
                        const color = getPortColor(out.type, out.label) !== '#a3a3a3' ? getPortColor(out.type, out.label) : getOutHandleColor(toolId);
                        return (
                            <div key={out.id} className={`relative flex items-center justify-end transition-all duration-300 ${isHidden ? 'h-0 overflow-hidden opacity-0 mb-0' : 'h-4'}`}>
                                <span style={{ color: color }} className="text-[9px] font-mono font-bold tracking-widest pointer-events-none drop-shadow-sm mr-1">{out.label || out.id.toUpperCase()}</span>
                                <Handle type="source" position={Position.Right} id={out.id} style={{ backgroundColor: color, top: '50%' }} className="w-3.5 h-3.5 rounded-full border-[2.5px] border-[#1a1a1a] cursor-crosshair hover:bg-white transition-all z-50 !-right-4" />
                                
                                {!collapsed && out.value && (
                                    <div className="absolute -right-5 top-1/2 -translate-y-1/2 translate-x-full text-left max-w-[120px] pointer-events-none">
                                        <span className="text-[8px] text-slate-300 font-mono bg-[#1a1a1a]/80 px-1.5 py-[2px] rounded truncate block shadow-sm border border-[#333]">{String(out.value)}</span>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
            
            {showCollapseToggle && (
                <div 
                    onClick={() => setCollapsed(!collapsed)} 
                    className="w-full text-center mt-2 pt-1 border-t border-[#444] cursor-pointer hover:bg-[#444] transition-colors rounded-b-sm"
                >
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{collapsed ? '▼ Show More' : '▲ Show Less'}</span>
                </div>
            )}
            
            {data.params && typeof data.params.export_to_map === 'boolean' && (
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
        onDrop={onDrop}
        onDragOver={onDragOver}
        onEdgesDelete={onEdgesDelete}
        onReconnect={onReconnect}
        onReconnectEnd={onReconnectEnd}
        onSelectionChange={onSelectionChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
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
    </div>
  );
}