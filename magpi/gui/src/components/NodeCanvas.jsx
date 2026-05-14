import React, { useState, useRef } from 'react';
import { MousePointer2, Hand, ZoomIn } from 'lucide-react';

export default function NodeCanvas({ 
  nodes, setNodes, 
  connections, setConnections, 
  selectedNodeId, setSelectedNodeId, 
  setActiveRightTab 
}) {
  // Local Canvas State
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const canvasRef = useRef(null);
  
  // Interaction State
  const [isPanning, setIsPanning] = useState(false);
  const [draggedNode, setDraggedNode] = useState(null);
  
  // Wiring State
  const [connectingFrom, setConnectingFrom] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // --- CANVAS INTERACTIONS ---
  const handleWheel = (e) => {
    if (e.deltaY < 0) setZoom(z => Math.min(z + 0.1, 2));
    else setZoom(z => Math.max(z - 0.1, 0.5));
  };

  const handlePointerDown = (e) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsPanning(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    } else if (e.target === canvasRef.current) {
      // Clicked empty space
      setSelectedNodeId(null);
      setActiveRightTab('toolbox');
      setConnectingFrom(null); 
    }
  };

  const handlePointerMove = (e) => {
    if (isPanning) {
      setPan(p => ({ x: p.x + e.movementX, y: p.y + e.movementY }));
    }
    if (draggedNode) {
      setNodes(nds => nds.map(n => 
        n.id === draggedNode ? { ...n, x: n.x + e.movementX / zoom, y: n.y + e.movementY / zoom } : n
      ));
    }
    if (connectingFrom && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      setMousePos({
        x: (e.clientX - rect.left - pan.x) / zoom,
        y: (e.clientY - rect.top - pan.y) / zoom
      });
    }
  };

  const handlePointerUp = (e) => { 
    setIsPanning(false); 
    setDraggedNode(null); 
    e.currentTarget.releasePointerCapture(e.pointerId);
    if(connectingFrom && !e.target.classList.contains('input-port')) {
      setConnectingFrom(null); // Dropped wire in empty space
    }
  };

  // --- WIRING LOGIC ---
  const startWire = (nodeId, e) => {
    e.stopPropagation();
    setConnectingFrom(nodeId);
    const rect = canvasRef.current.getBoundingClientRect();
    setMousePos({ x: (e.clientX - rect.left - pan.x) / zoom, y: (e.clientY - rect.top - pan.y) / zoom });
  };

  const completeWire = (nodeId, e) => {
    e.stopPropagation();
    if (connectingFrom && connectingFrom !== nodeId) {
      // Prevent duplicate connections
      if (!connections.find(c => c.from === connectingFrom && c.to === nodeId)) {
        setConnections(prev => [...prev, { from: connectingFrom, to: nodeId }]);
      }
    }
    setConnectingFrom(null);
  };

  const selectNode = (nodeId, e) => { 
    e.stopPropagation(); 
    setSelectedNodeId(nodeId); 
    setActiveRightTab('inspector'); 
  };

  return (
    <div 
      className="flex-1 relative bg-[#151b2b] overflow-hidden border-r border-slate-800 cursor-grab active:cursor-grabbing"
      ref={canvasRef} 
      onWheel={handleWheel} 
      onPointerDown={handlePointerDown} 
      onPointerMove={handlePointerMove} 
      onPointerUp={handlePointerUp} 
      onPointerLeave={handlePointerUp}
      style={{ 
        backgroundImage: 'radial-gradient(#2a3441 1.5px, transparent 1.5px)', 
        backgroundSize: `${25 * zoom}px ${25 * zoom}px`, 
        backgroundPosition: `${pan.x}px ${pan.y}px` 
      }}
    >
      {/* Viewport Overlay Controls */}
      <div className="absolute top-4 left-4 flex space-x-2 z-10 bg-slate-800/90 p-1.5 rounded-lg backdrop-blur-md border border-slate-600 shadow-xl">
        <button className="w-8 h-8 flex items-center justify-center bg-slate-700 rounded text-emerald-400" title="Select">
          <MousePointer2 size={16} />
        </button>
        <button className="w-8 h-8 flex items-center justify-center hover:bg-slate-700 rounded text-slate-400 transition-colors" title="Pan (Middle Click or Alt+Drag)">
          <Hand size={16} />
        </button>
        <div className="w-px bg-slate-600 mx-1"></div>
        <span className="text-xs font-bold flex items-center px-2 text-slate-300 w-12 justify-center">
          {Math.round(zoom * 100)}%
        </span>
      </div>

      {/* The Transform Layer (Pans and Zooms everything inside) */}
      <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0', width: '100%', height: '100%', position: 'absolute' }}>
        
        {/* Wires (SVG) */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
          
          {/* Active Dragging Wire */}
          {connectingFrom && (() => { 
            const fromNode = nodes.find(n => n.id === connectingFrom); 
            if(!fromNode) return null; 
            const startX = fromNode.x + 200; // Node width is 200
            const startY = fromNode.y + 30;  // Half of height 60
            return (
              <path 
                d={`M ${startX} ${startY} C ${startX + 60} ${startY}, ${mousePos.x - 60} ${mousePos.y}, ${mousePos.x} ${mousePos.y}`} 
                fill="none" stroke="#10b981" strokeWidth="4" strokeDasharray="6,6" className="wire-pulse" 
              />
            );
          })()}

          {/* Solid Connections */}
          {connections.map((conn, i) => { 
            const fromNode = nodes.find(n => n.id === conn.from); 
            const toNode = nodes.find(n => n.id === conn.to); 
            if(!fromNode || !toNode) return null; 
            
            const startX = fromNode.x + 200; 
            const startY = fromNode.y + 30; 
            const endX = toNode.x; 
            const endY = toNode.y + 30; 
            const isHighlighted = selectedNodeId === fromNode.id || selectedNodeId === toNode.id; 
            
            return (
              <path 
                key={i} 
                d={`M ${startX} ${startY} C ${startX + 60} ${startY}, ${endX - 60} ${endY}, ${endX} ${endY}`} 
                fill="none" 
                stroke={isHighlighted ? "#10b981" : "#475569"} 
                strokeWidth={isHighlighted ? "4" : "3"} 
                className="transition-all duration-300" 
              />
            );
          })}
        </svg>

        {/* Nodes */}
        {nodes.map(node => {
          const isSelected = selectedNodeId === node.id;
          return (
            <div 
              key={node.id} 
              onPointerDown={(e) => { setDraggedNode(node.id); selectNode(node.id, e); }} 
              className={`absolute w-[200px] h-[60px] rounded-lg shadow-xl flex items-center px-4 cursor-pointer transition-all ${node.color} border border-t-white/20 border-b-black/50 ${isSelected ? 'ring-2 ring-white shadow-[0_0_20px_rgba(16,185,129,0.6)] scale-105 z-10' : 'hover:border-slate-400 z-0'}`} 
              style={{ left: node.x, top: node.y }}
            >
              {/* Input Port (Gray Dot) */}
              <div 
                className="input-port absolute -left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 bg-slate-300 rounded-full border-2 border-slate-800 hover:scale-150 transition-transform cursor-crosshair z-20" 
                onPointerUp={(e) => completeWire(node.id, e)}
              ></div>
              
              <div className="flex-1 truncate pointer-events-none ml-2">
                <div className="text-[9px] uppercase tracking-widest text-white/60 font-bold">{node.toolId.split('_')[0]}</div>
                <div className="text-sm font-bold text-white truncate drop-shadow-md">{node.name}</div>
              </div>

              {/* Output Port (Green Dot) */}
              <div 
                className="output-port absolute -right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 bg-emerald-400 rounded-full border-2 border-slate-800 hover:scale-150 transition-transform cursor-crosshair z-20 shadow-[0_0_8px_#10b981]" 
                onPointerDown={(e) => startWire(node.id, e)}
              ></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}