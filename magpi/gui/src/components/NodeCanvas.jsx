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
  CircleDashed, Settings, PaintBucket, FileOutput, LineChart 
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
  return <Settings size={14} className="text-slate-400" />;
};

// --- DYNAMIC CHAINNER NODE COMPONENT ---
const MagPINode = ({ data }) => {
  // 1. Structural Logic
  const toolId = data.toolId || '';
  
  // Pure sources (NO LEFT PORTS)
  const isPureSource = ['core_extent', 'load_raster', 'load_vector'].includes(toolId);
  // Pure endpoints (NO RIGHT PORTS)
  const isEndpoint = ['conv_raster_to_polygon', 'stats_confusion_matrix'].includes(toolId);
  // Dual-input receivers
  const isDualInput = ['ia_export_dl', 'stats_confusion_matrix', 'mgt_clip', 'ia_pansharpen'].includes(toolId);

  // 2. Visual Hierarchy (Shapes)
  let shapeClass = "rounded-lg"; 
  if (isPureSource) shapeClass = "rounded-l-[24px] rounded-r-md"; 
  if (isEndpoint) shapeClass = "rounded-r-[24px] rounded-l-md"; 

  // 3. Typographical Labels
  let topLbl = "IN 1", botLbl = "IN 2", singleLbl = "IN";
  
  if (toolId === 'ia_export_dl') { topLbl = "IMG"; botLbl = "LBL"; }
  else if (toolId === 'stats_confusion_matrix') { topLbl = "PREDICT"; botLbl = "TRUTH"; }
  else if (toolId === 'mgt_clip') { topLbl = "TARGET"; botLbl = "EXTENT"; }
  
  if (toolId === 'ai_train') singleLbl = "TENSORS";
  else if (toolId === 'conv_raster_to_polygon') singleLbl = "MASK";
  else if (toolId.startsWith('wfs_')) singleLbl = "AOI";

  return (
    <div className={`py-3 pl-12 pr-12 shadow-2xl border border-slate-700 bg-slate-800 flex flex-col min-w-[220px] transition-all duration-200 ${shapeClass} ${data.selected ? 'ring-2 ring-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.3)]' : ''}`}>
      
      {/* HEADER ROW */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center">
            <div className="mr-2 bg-slate-900 p-1.5 rounded-md shadow-inner border border-slate-700">
                {getIconElement(data.toolId)}
            </div>
            <div>
                <div className="text-[11px] font-bold text-slate-200 tracking-wide">{data.name}</div>
                <div className="text-[8px] text-slate-500 uppercase tracking-widest font-mono">{toolId.split('_')[0]}</div>
            </div>
        </div>
        <div>
            {data.status === 'processing' && <Loader2 size={14} className="text-cyan-400 animate-spin" />}
            {data.status === 'success' && <CheckCircle2 size={14} className="text-emerald-400" />}
            {data.status === 'error' && <AlertCircle size={14} className="text-red-400" />}
        </div>
      </div>

      {/* SOCKET BAY (Handles) */}
      <div className="relative w-full h-8 bg-slate-900/50 rounded border border-slate-700/50">
        
        {/* SINGLE INPUT */}
        {!isPureSource && !isDualInput && (
            <>
            <Handle type="target" position={Position.Left} id="in" className="w-3.5 h-3.5 bg-slate-400 border-2 border-slate-900 -ml-1.5 cursor-crosshair hover:bg-emerald-400 hover:scale-125 transition-all" />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[9px] font-mono text-slate-400 font-bold pointer-events-none tracking-widest">{singleLbl}</span>
            </>
        )}

        {/* DUAL INPUTS */}
        {isDualInput && (
            <>
            <Handle type="target" position={Position.Left} id="in1" style={{ top: '25%' }} className="w-3.5 h-3.5 bg-cyan-400 border-2 border-slate-900 -ml-1.5 cursor-crosshair hover:scale-125 transition-transform" />
            <span className="absolute left-3 top-[25%] -translate-y-1/2 text-[9px] font-mono text-cyan-400/80 font-bold pointer-events-none tracking-widest">{topLbl}</span>

            <Handle type="target" position={Position.Left} id="in2" style={{ top: '75%' }} className="w-3.5 h-3.5 bg-orange-400 border-2 border-slate-900 -ml-1.5 cursor-crosshair hover:scale-125 transition-transform" />
            <span className="absolute left-3 top-[75%] -translate-y-1/2 text-[9px] font-mono text-orange-400/80 font-bold pointer-events-none tracking-widest">{botLbl}</span>
            </>
        )}

        {/* OUTPUT */}
        {!isEndpoint && (
            <>
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-mono text-emerald-400/80 font-bold pointer-events-none tracking-widest">OUT</span>
            <Handle type="source" position={Position.Right} id="out" className="w-3.5 h-3.5 bg-emerald-500 border-2 border-slate-900 -mr-1.5 cursor-crosshair hover:scale-125 transition-transform shadow-[0_0_5px_rgba(16,185,129,0.5)]" />
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
    type: 'smoothstep',
    animated: nodeStatuses[c.from] === 'processing' || nodeStatuses[c.to] === 'processing',
    style: { stroke: nodeStatuses[c.to] === 'success' ? '#10b981' : '#64748b', strokeWidth: 2 }
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

  // 4. FLAWLESS WIRE CONNECTION (Saving explicit port IDs)
  const onConnect = useCallback((params) => {
    setConnections((eds) => [...eds, { 
        from: params.source, 
        to: params.target,
        sourceHandle: params.sourceHandle,
        targetHandle: params.targetHandle 
    }]);
  }, [setConnections]);

  // 5. FLAWLESS WIRE DELETION (Backspace/Delete triggers this)
  const onEdgesDelete = useCallback((edgesToDelete) => {
    setConnections((eds) => eds.filter(c => {
        // Keep the connection if it is NOT in the edgesToDelete array
        return !edgesToDelete.find(e => e.source === c.from && e.target === c.to);
    }));
  }, [setConnections]);

  // 6. Interaction Handlers
  const onNodeClick = (_, node) => { setSelectedNodeId(node.id); setActiveRightTab('inspector'); };
  const onPaneClick = () => { setSelectedNodeId(null); setActiveRightTab('toolbox'); };

  // 7. DRAG AND DROP RESOLUTION
  const onDrop = useCallback((event) => {
      event.preventDefault();
      try {
        const rawData = event.dataTransfer.getData('application/json');
        if (!rawData) return;
        const toolData = JSON.parse(rawData);
        
        // This function is absolute magic. It calculates the exact canvas zoom/pan offsets.
        const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        addNode(toolData, position.x - 110, position.y - 40);
      } catch (err) { console.error("Drop failed:", err); }
  }, [screenToFlowPosition, addNode]);

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
        onConnect={onConnect}
        onEdgesDelete={onEdgesDelete}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
        nodeTypes={nodeTypes}
        fitView
        
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