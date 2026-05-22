import React, { useCallback, useRef } from 'react';
import ReactFlow, { 
  Background, 
  Controls, 
  MiniMap, 
  applyNodeChanges, 
  Handle,
  Position,
  ReactFlowProvider,
  useReactFlow
} from 'reactflow';
import 'reactflow/dist/style.css';
import { 
  Loader2, CheckCircle2, AlertCircle, Hexagon, Satellite, 
  Layers, Grid, DownloadCloud, Map as MapIcon, Globe, 
  ImageIcon, Box, Leaf, Cpu, Crosshair, Scissors, 
  CircleDashed, Settings, PaintBucket, FileOutput, LineChart,
  Database, SlidersHorizontal
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

// --- DYNAMIC CHAINNER NODE COMPONENT ---
const MagPINode = ({ data }) => {
  // 1. Structural Logic
  const toolId = data.toolId || '';
  
  // Pure sources (NO LEFT PORTS)
  const isPureSource = ['core_extent', 'load_raster', 'load_vector'].includes(toolId);
  // Pure endpoints (NO RIGHT PORTS)
  const isEndpoint = ['conv_raster_to_polygon', 'stats_confusion_matrix', 'etl_db_writer'].includes(toolId);
  // Dual-input receivers
  const isDualInput = ['ia_export_dl', 'stats_confusion_matrix', 'mgt_clip', 'ia_pansharpen', 'etl_spatial_join'].includes(toolId);

  // 2. Visual Hierarchy (Shapes)
  let shapeClass = "rounded-lg"; 
  if (isPureSource) shapeClass = "rounded-l-[24px] rounded-r-md"; 
  if (isEndpoint) shapeClass = "rounded-r-[24px] rounded-l-md"; 

  // 3. Typographical Labels
  let topLbl = "IN 1", botLbl = "IN 2", singleLbl = "IN";
  
  if (toolId === 'ia_export_dl') { topLbl = "IMG"; botLbl = "LBL"; }
  else if (toolId === 'stats_confusion_matrix') { topLbl = "PREDICT"; botLbl = "TRUTH"; }
  else if (toolId === 'mgt_clip') { topLbl = "TARGET"; botLbl = "EXTENT"; }
  else if (toolId === 'etl_spatial_join') { topLbl = "TARGET"; botLbl = "JOIN"; }
  
  if (toolId === 'ai_train') singleLbl = "TENSORS";
  else if (toolId === 'conv_raster_to_polygon') singleLbl = "MASK";
  else if (toolId.startsWith('wfs_')) singleLbl = "AOI";

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
            {data.status === 'error' && <AlertCircle size={12} className="text-[#ff453a] drop-shadow" />}
        </div>
      </div>

      {/* BODY ROW */}
      <div className="p-3 relative bg-gradient-to-b from-[#3a3a3a] to-[#2b2b2b] min-h-[50px] rounded-b-lg">
        
        {/* SINGLE INPUT */}
        {!isPureSource && !isDualInput && (
            <>
            <Handle type="target" position={Position.Left} id="in" isConnectableStart={false} className="w-3.5 h-3.5 rounded-full bg-[#a3a3a3] border-[2.5px] border-[#1a1a1a] -ml-2 cursor-crosshair hover:bg-white hover:scale-125 transition-all z-50" />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[9px] font-mono text-[#a3a3a3] font-bold pointer-events-none tracking-widest">{singleLbl}</span>
            </>
        )}

        {/* DUAL INPUTS */}
        {isDualInput && (
            <>
            <Handle type="target" position={Position.Left} id="in1" style={{ top: '30%' }} isConnectableStart={false} className="w-3.5 h-3.5 rounded-full bg-[#5ac8fa] border-[2.5px] border-[#1a1a1a] -ml-2 cursor-crosshair hover:bg-white hover:scale-125 transition-all z-50" />
            <span className="absolute left-3 top-[30%] -translate-y-1/2 text-[9px] font-mono text-[#5ac8fa] font-bold pointer-events-none tracking-widest">{topLbl}</span>

            <Handle type="target" position={Position.Left} id="in2" style={{ top: '70%' }} isConnectableStart={false} className="w-3.5 h-3.5 rounded-full bg-[#ffcc00] border-[2.5px] border-[#1a1a1a] -ml-2 cursor-crosshair hover:bg-white hover:scale-125 transition-all z-50" />
            <span className="absolute left-3 top-[70%] -translate-y-1/2 text-[9px] font-mono text-[#ffcc00] font-bold pointer-events-none tracking-widest">{botLbl}</span>
            </>
        )}

        {/* INLINE PARAMETERS PREVIEW */}
        <div className="flex flex-col items-center justify-center space-y-1 mx-4 py-1">
            {Object.entries(data.params || {}).slice(0, 2).map(([key, val], idx) => {
                const isComplexObj = val && typeof val === 'object' && val.type === 'select';
                const isDateObj = val && typeof val === 'object' && val.type === 'date';
                const displayVal = (isComplexObj || isDateObj) ? val.value : val;
                return (
                    <div key={idx} className="w-full bg-[#1a1a1a] rounded px-1.5 py-0.5 truncate text-[8px] font-mono text-[#a3a3a3] border border-[#000000]">
                        <span className="text-[#6b6b6b] mr-1">{key.substring(0,6)}:</span>{typeof displayVal === 'boolean' ? (displayVal?'T':'F') : String(displayVal)}
                    </div>
                );
            })}
        </div>

        {/* OUTPUT */}
        {!isEndpoint && (
            <>
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-mono text-[#ff3b30] font-bold pointer-events-none tracking-widest">OUT</span>
            <Handle type="source" position={Position.Right} id="out" className="w-3.5 h-3.5 rounded-full bg-[#ff3b30] border-[2.5px] border-[#1a1a1a] -mr-2 cursor-crosshair hover:bg-white hover:scale-125 transition-all z-50" />
            </>
        )}
      </div>
    </div>
  );
};

const nodeTypes = { magpiNode: MagPINode };

// --- INNER CANVAS ENGINE ---
function CanvasInner({ 
  nodes, setNodes, connections, setConnections, 
  selectedNodeId, setSelectedNodeId, setActiveRightTab, nodeStatuses, addNode 
}) {
  const reactFlowWrapper = useRef(null);
  const { screenToFlowPosition } = useReactFlow();

  // 1. Map MagPI nodes to React Flow
  const rfNodes = nodes.map(n => ({
    id: n.id,
    type: 'magpiNode',
    position: { x: n.x, y: n.y },
    data: { ...n, selected: n.id === selectedNodeId, status: nodeStatuses[n.id] }
  }));

  // 2. Map MagPI connections to React Flow (CRITICAL: Preserving sourceHandle/targetHandle IDs so wires don't stack!)
  const rfEdges = connections.map((c, idx) => ({
    id: `e_${c.from}-${c.to}-${c.sourceHandle || 'out'}-${c.targetHandle || 'in'}-${idx}`,
    source: c.from,
    target: c.to,
    sourceHandle: c.sourceHandle || null,
    targetHandle: c.targetHandle || null,
    type: 'bezier',
    interactionWidth: 20,
    animated: nodeStatuses[c.from] === 'processing' || nodeStatuses[c.to] === 'processing',
    style: { stroke: nodeStatuses[c.to] === 'success' ? '#32d74b' : '#64748b', strokeWidth: 3 }
  }));

  // 3. FLAWLESS NODE DRAGGING (Syncing positions back to App.jsx)
  const onNodesChange = useCallback((changes) => {
    setNodes((oldNodes) => {
      const currentRfNodes = oldNodes.map(n => ({ id: n.id, position: { x: n.x, y: n.y }, type: 'magpiNode', data: {} }));
      const updatedRfNodes = applyNodeChanges(changes, currentRfNodes);
      return oldNodes.map(n => {
        const updated = updatedRfNodes.find(urn => urn.id === n.id);
        if (updated) return { ...n, x: updated.position.x, y: updated.position.y };
        return n;
      });
    });
  }, [setNodes]);

  const onEdgesChange = useCallback((changes) => {
    setConnections((eds) => {
      const mappedEdges = eds.map((c, idx) => ({ 
          id: `e_${c.from}-${c.to}-${c.sourceHandle || 'out'}-${c.targetHandle || 'in'}-${idx}`, 
          source: c.from, target: c.to, sourceHandle: c.sourceHandle, targetHandle: c.targetHandle 
      }));
      const updatedEdges = applyEdgeChanges(changes, mappedEdges);
      return updatedEdges.map(e => ({ from: e.source, to: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle }));
    });
  }, [setConnections]);

  // 4. FLAWLESS WIRE CONNECTION (Saving explicit port IDs)
  const onConnect = useCallback((params) => {
    setConnections((eds) => [...eds, { 
        from: params.source, 
        to: params.target,
        sourceHandle: params.sourceHandle,
        targetHandle: params.targetHandle 
    }]);
  }, [setConnections]);

  const onEdgesDelete = useCallback((edgesToDelete) => {
    setConnections((eds) => eds.filter(c => {
        return !edgesToDelete.find(e => e.source === c.from && e.target === c.to);
    }));
  }, [setConnections]);

  const onEdgeUpdate = useCallback((oldEdge, newConnection) => {
    setConnections((eds) => {
       const filtered = eds.filter(c => !(c.from === oldEdge.source && c.to === oldEdge.target));
       return [...filtered, {
           from: newConnection.source,
           to: newConnection.target,
           sourceHandle: newConnection.sourceHandle,
           targetHandle: newConnection.targetHandle
       }];
    });
  }, [setConnections]);

  // 6. Interaction Handlers
  const onNodeClick = (_, node) => { setSelectedNodeId(node.id); setActiveRightTab('inspector'); };
  const onPaneClick = () => { setSelectedNodeId(null); setActiveRightTab('toolbox'); };

  const onDrop = useCallback((event) => {
      event.preventDefault();
      try {
        let toolData = null;
        if (window.__draggedMagPITool) {
            toolData = window.__draggedMagPITool;
            window.__draggedMagPITool = null;
        } else {
            const rawData = event.dataTransfer.getData('application/json');
            if (rawData) toolData = JSON.parse(rawData);
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
        onConnect={onConnect}
        onEdgesDelete={onEdgesDelete}
        onEdgeUpdate={onEdgeUpdate}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onDrop={onDrop}
        onDragOver={onDragOver}
        nodeTypes={nodeTypes}
        fitView
        snapToGrid={true}
        snapGrid={[10, 10]}
        edgesUpdatable={true}
        
        /* Quality of Life Interactions
        panOnScroll={true}
        panOnDrag={[1, 2]} // Middle & Right Click pan
        selectionOnDrag={true} // Left click multi-select box
        panActivationKeyCode="Space" 
        selectionKeyCode="Shift"
        deleteKeyCode={['Backspace', 'Delete']} */
      >
        <Background color="#1e293b" gap={20} size={1.5} />
        <Controls showInteractive={false} className="react-flow__controls" />
        <MiniMap nodeColor={() => '#334155'} maskColor="rgba(15, 23, 42, 0.75)" className="bg-slate-900 border border-slate-700/80 rounded-lg overflow-hidden shadow-2xl" />
      </ReactFlow>
    </div>
  );
}

// WRAPPER: Essential to inject the ReactFlowProvider so screenToFlowPosition works!
export default function NodeCanvas(props) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}