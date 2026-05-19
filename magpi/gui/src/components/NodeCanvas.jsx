import React, { useCallback, useRef } from 'react';
import ReactFlow, { 
  Background, 
  Controls, 
  MiniMap, 
  applyNodeChanges, 
  applyEdgeChanges, 
  MarkerType,
  Handle,
  Position
} from 'reactflow';
import 'reactflow/dist/style.css';
import { 
  Loader2, CheckCircle2, AlertCircle, Hexagon, Satellite, 
  Layers, Grid, DownloadCloud, Map as MapIcon, Globe, 
  ImageIcon, Box, Leaf, Cpu, Crosshair, Scissors, 
  CircleDashed, Settings, PaintBucket, FileOutput, LineChart 
} from 'lucide-react';

const getIconElement = (icon) => {
  if (React.isValidElement(icon)) return icon;
  if (typeof icon === 'string') {
    const iconKey = icon.toLowerCase();
    if (iconKey === 'fa-vector-square' || iconKey === 'core_extent') return <Hexagon size={14} className="text-yellow-400" />;
    if (iconKey.includes('sentinel')) return <Satellite size={14} className="text-cyan-400" />;
    if (iconKey.includes('nlcd') || iconKey.includes('grid')) return <Grid size={14} className="text-cyan-400" />;
    if (iconKey.includes('elevation') || iconKey.includes('layers')) return <Layers size={14} className="text-cyan-400" />;
    if (iconKey.includes('classify')) return <ImageIcon size={14} className="text-purple-400" />;
    if (iconKey.includes('train')) return <Cpu size={14} className="text-purple-400" />;
    if (iconKey.includes('reclassify') || iconKey.includes('paint')) return <PaintBucket size={14} className="text-emerald-400" />;
    if (iconKey.includes('polygon') || iconKey.includes('output')) return <FileOutput size={14} className="text-orange-400" />;
    if (iconKey.includes('stats') || iconKey.includes('confusion')) return <LineChart size={14} className="text-rose-400" />;
  }
  return <Settings size={14} className="text-slate-400" />;
};

const MagPINode = ({ data }) => {
  const isInputNode = ['core_extent', 'load_raster', 'load_vector'].includes(data.toolId);
  return (
    <div className={`px-4 py-3 rounded-lg shadow-2xl border-2 flex items-center min-w-[220px] transition-all duration-300 ${data.color} ${data.border} ${data.selected ? 'ring-2 ring-white scale-105 shadow-[0_0_25px_rgba(16,185,129,0.4)]' : 'opacity-95'}`}>
      {!isInputNode && (
        <Handle type="target" position={Position.Left} className="w-3.5 h-3.5 bg-slate-300 border-2 border-slate-800 -ml-1 transition-transform hover:scale-150 z-50 cursor-crosshair" />
      )}
      <div className="mr-3 bg-black/30 p-2 rounded flex items-center justify-center">{getIconElement(data.icon)}</div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold text-white tracking-wide truncate">{data.name}</div>
        <div className="text-[9px] text-white/60 uppercase tracking-widest font-mono mt-0.5 truncate">{data.toolId.split('_')[0]} module</div>
      </div>
      <div className="ml-3 flex items-center justify-center shrink-0">
        {data.status === 'processing' && <Loader2 size={16} className="text-white animate-spin" />}
        {data.status === 'success' && <CheckCircle2 size={16} className="text-emerald-300 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" />}
        {data.status === 'error' && <AlertCircle size={16} className="text-red-300 drop-shadow-[0_0_8px_rgba(248,113,113,0.8)]" />}
      </div>
      <Handle type="source" position={Position.Right} className="w-3.5 h-3.5 bg-emerald-400 border-2 border-slate-800 -mr-1 transition-transform hover:scale-150 z-50 cursor-crosshair shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
    </div>
  );
};

const nodeTypes = { magpiNode: MagPINode };

export default function NodeCanvas({ 
  nodes, setNodes, connections, setConnections, 
  selectedNodeId, setSelectedNodeId, setActiveRightTab, nodeStatuses, addNode 
}) {
  const reactFlowWrapper = useRef(null);

  const rfNodes = nodes.map(n => ({
    id: n.id,
    type: 'magpiNode',
    position: { x: n.x, y: n.y },
    data: { name: n.name, toolId: n.toolId, color: n.color, border: n.border, icon: n.icon, selected: n.id === selectedNodeId, status: nodeStatuses[n.id] }
  }));

  const rfEdges = connections.map((c, idx) => ({
    id: `e_${c.from}-${c.to}-${idx}`, source: c.from, target: c.to,
    animated: nodeStatuses[c.from] === 'processing' || nodeStatuses[c.to] === 'processing',
    style: { stroke: nodeStatuses[c.to] === 'success' ? '#10b981' : '#475569', strokeWidth: 3 },
    markerEnd: { type: MarkerType.ArrowClosed, color: nodeStatuses[c.to] === 'success' ? '#10b981' : '#475569' }
  }));

  const onNodesChange = useCallback((changes) => {
      setNodes((nds) => {
        const updated = applyNodeChanges(changes, nds.map(n => ({...n, position: {x: n.x, y: n.y}})));
        return updated.map(n => ({ ...nds.find(old => old.id === n.id), x: n.position.x, y: n.position.y }));
      });
  }, [setNodes]);

  const onEdgesChange = useCallback((changes) => {
      setConnections((eds) => {
        const remainingEdges = applyEdgeChanges(changes, eds.map((c, i) => ({ id: `e_${i}`, source: c.from, target: c.to })));
        return remainingEdges.map(e => ({ from: e.source, to: e.target }));
      });
  }, [setConnections]);

  const onConnect = useCallback((params) => setConnections((eds) => [...eds, { from: params.source, to: params.target }]), [setConnections]);

  const onNodeClick = (_, node) => { setSelectedNodeId(node.id); setActiveRightTab('inspector'); };
  const onPaneClick = () => { setSelectedNodeId(null); setActiveRightTab('toolbox'); };

  // FIX: Drag and Drop restoration
  const onDrop = useCallback((event) => {
      event.preventDefault();
      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const rawData = event.dataTransfer.getData('application/json');
      if (!rawData) return;
      const toolData = JSON.parse(rawData);
      // Rough projection (React Flow provides a hook for this in complex setups, but this math works for our layout)
      const position = {
        x: event.clientX - reactFlowBounds.left - 110,
        y: event.clientY - reactFlowBounds.top - 25,
      };
      addNode(toolData, position.x, position.y);
  }, [addNode]);

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  return (
    <div className="w-full h-full relative" ref={reactFlowWrapper}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onDrop={onDrop}
        onDragOver={onDragOver}
        nodeTypes={nodeTypes}
        fitView
        
        // THE QOL OVERRIDES: Spacebar Pan + Middle Click (1) + Right Click (2)
        panOnScroll={true}
        panOnDrag={[1, 2]} // 1 = Middle Mouse, 2 = Right Mouse
        selectionOnDrag={true} // Left Click drags a selection box!
        panActivationKeyCode="Space"
        selectionKeyCode="Shift"
        
        // Prevent default browser right-click menu so you can pan smoothly
        onPaneContextMenu={(e) => e.preventDefault()}
      >
        <Background color="#1e293b" gap={20} size={1.5} />
        <Controls showInteractive={false} className="react-flow__controls" />
        <MiniMap nodeColor={() => '#334155'} maskColor="rgba(15, 23, 42, 0.75)" className="bg-slate-900 border border-slate-700/80 rounded-lg shadow-2xl overflow-hidden" />
      </ReactFlow>
    </div>
  );
}