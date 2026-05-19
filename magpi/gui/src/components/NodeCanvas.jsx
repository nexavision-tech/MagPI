import React, { useCallback, useRef } from 'react';
import ReactFlow, { 
  Background, 
  Controls, 
  MiniMap, 
  applyNodeChanges, 
  applyEdgeChanges, 
  addEdge,
  MarkerType
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

// Custom Node Component to show Status Indicators
const MagPINode = ({ data }) => {
  return (
    <div className={`px-4 py-3 rounded-lg shadow-xl border-2 flex items-center min-w-[200px] transition-all duration-300 ${data.color} ${data.border} ${data.selected ? 'ring-2 ring-white scale-105 shadow-[0_0_20px_rgba(255,255,255,0.3)]' : 'opacity-95'}`}>
      <div className="mr-3 bg-black/20 p-2 rounded flex items-center justify-center">
         {data.icon}
      </div>
      <div className="flex-1">
        <div className="text-xs font-bold text-white tracking-wide">{data.name}</div>
        <div className="text-[9px] text-white/70 uppercase tracking-widest font-mono mt-0.5">{data.toolId.split('_')[0]} module</div>
      </div>
      
      {/* Dynamic Status Indicator */}
      <div className="ml-3 flex items-center justify-center">
        {data.status === 'processing' && <Loader2 size={16} className="text-white animate-spin" />}
        {data.status === 'success' && <CheckCircle2 size={16} className="text-emerald-300 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]" />}
        {data.status === 'error' && <AlertCircle size={16} className="text-red-300 drop-shadow-[0_0_8px_rgba(248,113,113,0.8)]" />}
      </div>
    </div>
  );
};

const nodeTypes = { magpiNode: MagPINode };

export default function NodeCanvas({ 
  nodes, setNodes, connections, setConnections, 
  selectedNodeId, setSelectedNodeId, setActiveRightTab, nodeStatuses, addNode 
}) {
  
  const reactFlowWrapper = useRef(null);

  // Map our simple state to React Flow's expected format
  const rfNodes = nodes.map(n => ({
    id: n.id,
    type: 'magpiNode',
    position: { x: n.x, y: n.y },
    data: { 
      name: n.name, 
      toolId: n.toolId, 
      color: n.color, 
      border: n.border, 
      icon: n.icon,
      selected: n.id === selectedNodeId,
      status: nodeStatuses[n.id]
    },
    sourcePosition: 'right',
    targetPosition: 'left',
  }));

  const rfEdges = connections.map((c, idx) => ({
    id: `e_${c.from}-${c.to}-${idx}`,
    source: c.from,
    target: c.to,
    animated: nodeStatuses[c.from] === 'processing' || nodeStatuses[c.to] === 'processing',
    style: { stroke: nodeStatuses[c.to] === 'success' ? '#34d399' : '#64748b', strokeWidth: 3 },
    markerEnd: { type: MarkerType.ArrowClosed, color: nodeStatuses[c.to] === 'success' ? '#34d399' : '#64748b' }
  }));

  const onNodesChange = useCallback(
    (changes) => {
      setNodes((nds) => {
        const updated = applyNodeChanges(changes, nds.map(n => ({...n, position: {x: n.x, y: n.y}})));
        return updated.map(n => ({ ...nds.find(old => old.id === n.id), x: n.position.x, y: n.position.y }));
      });
    },
    [setNodes]
  );

  const onEdgesChange = useCallback(
    (changes) => {
      setConnections((eds) => {
        // Handle deletions
        const remainingEdges = applyEdgeChanges(changes, eds.map((c, i) => ({ id: `e_${i}`, source: c.from, target: c.to })));
        return remainingEdges.map(e => ({ from: e.source, to: e.target }));
      });
    },
    [setConnections]
  );

  const onConnect = useCallback(
    (params) => setConnections((eds) => [...eds, { from: params.source, to: params.target }]),
    [setConnections]
  );

  const onNodeClick = (_, node) => {
    setSelectedNodeId(node.id);
    setActiveRightTab('inspector');
  };

  const onPaneClick = () => {
    setSelectedNodeId(null);
    setActiveRightTab('toolbox');
  };

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const rawData = event.dataTransfer.getData('application/json');
      if (!rawData) return;
      
      const toolData = JSON.parse(rawData);
      
      // Calculate exact drop position
      const position = {
        x: event.clientX - reactFlowBounds.left - 100,
        y: event.clientY - reactFlowBounds.top - 25,
      };

      // Reconstruct the Icon from the string key
      // We pass a dummy icon here, the real icon is managed in Toolbox, but we can just use a generic one or pass it through
      addNode(toolData, position.x, position.y);
    },
    [addNode]
  );

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  return (
    <div className="w-full h-full" ref={reactFlowWrapper}>
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
        
        /* THE MAGIC FIGMA UX CONTROLS */
        panOnScroll={true}           // Scroll wheel moves canvas up/down
        panOnDrag={false}            // Prevents left-click from panning (allows box selection)
        selectionOnDrag={true}       // Left click + drag draws a multi-select box
        panActivationKeyCode="Space" // HOLD SPACEBAR TO PAN!
        selectionKeyCode="Shift"
      >
        <Background color="#334155" gap={20} size={2} />
        <Controls className="bg-slate-800 border-slate-700 fill-slate-300" />
        <MiniMap 
          nodeColor={(n) => '#475569'} 
          maskColor="rgba(15, 23, 42, 0.7)" 
          className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl" 
        />
      </ReactFlow>
    </div>
  );
}