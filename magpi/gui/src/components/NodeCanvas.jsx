import React, { useState, useRef } from 'react';
import { MousePointer2, Hand, Settings, LocateFixed } from 'lucide-react';

export default function NodeCanvas({ 
  nodes, setNodes, 
  connections, setConnections, 
  selectedNodeId, setSelectedNodeId, 
  setActiveRightTab, nodeStatuses = {},
  removeConnection, addNode 
}) {
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const canvasRef = useRef(null);
  
  const [isPanning, setIsPanning] = useState(false);
  const [draggedNode, setDraggedNode] = useState(null);
  const [connectingFrom, setConnectingFrom] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  
  const [panMode, setPanMode] = useState(false);

  const handleDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; };
  const handleDrop = (e) => {
    e.preventDefault();
    const toolDataStr = e.dataTransfer.getData("application/json");
    if (toolDataStr) {
      const toolData = JSON.parse(toolDataStr);
      const rect = canvasRef.current.getBoundingClientRect();
      const dropX = (e.clientX - rect.left - pan.x) / zoom;
      const dropY = (e.clientY - rect.top - pan.y) / zoom;
      if(addNode) addNode(toolData, dropX - 105, dropY - 30);
    }
  };

  const handleWheel = (e) => {
    if (e.deltaY < 0) setZoom(z => Math.min(z + 0.1, 2));
    else setZoom(z => Math.max(z - 0.1, 0.5));
  };

  const handlePointerDown = (e) => {
    if (panMode || e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsPanning(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    } else if (e.target === canvasRef.current) {
      setSelectedNodeId(null);
      setActiveRightTab('toolbox');
      setConnectingFrom(null); 
    }
  };

  const handlePointerMove = (e) => {
    if (isPanning) setPan(p => ({ x: p.x + e.movementX, y: p.y + e.movementY }));
    if (draggedNode && !panMode) setNodes(nds => nds.map(n => n.id === draggedNode ? { ...n, x: n.x + e.movementX / zoom, y: n.y + e.movementY / zoom } : n));
    if (connectingFrom && canvasRef.current && !panMode) {
      const rect = canvasRef.current.getBoundingClientRect();
      setMousePos({ x: (e.clientX - rect.left - pan.x) / zoom, y: (e.clientY - rect.top - pan.y) / zoom });
    }
  };

  const handlePointerUp = (e) => { 
    setIsPanning(false); setDraggedNode(null); e.currentTarget.releasePointerCapture(e.pointerId);
    if(connectingFrom && !e.target.classList.contains('input-port')) setConnectingFrom(null);
  };

  const startWire = (nodeId, e) => {
    if (panMode) return; 
    e.stopPropagation(); setConnectingFrom(nodeId);
    const rect = canvasRef.current.getBoundingClientRect();
    setMousePos({ x: (e.clientX - rect.left - pan.x) / zoom, y: (e.clientY - rect.top - pan.y) / zoom });
  };

  const completeWire = (nodeId, e) => {
    if (panMode) return;
    e.stopPropagation();
    if (connectingFrom && connectingFrom !== nodeId && !connections.find(c => c.from === connectingFrom && c.to === nodeId)) {
        setConnections(prev => [...prev, { from: connectingFrom, to: nodeId }]);
    }
    setConnectingFrom(null);
  };

  const selectNode = (nodeId, e) => { 
    if (panMode) return;
    e.stopPropagation(); setSelectedNodeId(nodeId); setActiveRightTab('inspector'); 
  };

  const centerView = () => {
    setPan({ x: 0, y: 0 });
    setZoom(1);
  };

  return (
    <div 
      className={`flex-1 relative bg-[#151b2b] overflow-hidden border-r border-slate-800 ${panMode ? 'cursor-grab active:cursor-grabbing' : ''}`}
      ref={canvasRef} onWheel={handleWheel} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp} onDragOver={handleDragOver} onDrop={handleDrop}
      style={{ backgroundImage: 'radial-gradient(#2a3441 1.5px, transparent 1.5px)', backgroundSize: `${25 * zoom}px ${25 * zoom}px`, backgroundPosition: `${pan.x}px ${pan.y}px` }}
    >
      <style>{`.wire-pulse { animation: pulse-wire 2s infinite; } @keyframes pulse-wire { 0% { opacity: 0.6; } 50% { opacity: 1; stroke-width: 4px; } 100% { opacity: 0.6; } }`}</style>

      {/* ENHANCED OVERLAY CONTROLS - Added stopPropagation to act as a shield! */}
      <div 
        className="absolute top-4 left-4 flex space-x-2 z-10 bg-slate-800/90 p-1.5 rounded-lg backdrop-blur-md border border-slate-600 shadow-xl"
        onPointerDown={(e) => e.stopPropagation()} 
      >
        <button 
            onClick={() => setPanMode(false)}
            className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${!panMode ? 'bg-slate-700 text-emerald-400' : 'text-slate-400 hover:bg-slate-700'}`} 
            title="Select & Wire Tool"
        >
            <MousePointer2 size={16} />
        </button>
        <button 
            onClick={() => setPanMode(true)}
            className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${panMode ? 'bg-blue-600/50 text-blue-400 border border-blue-500/50' : 'text-slate-400 hover:bg-slate-700'}`} 
            title="Pan Canvas Mode"
        >
            <Hand size={16} />
        </button>
        <button onClick={centerView} className="w-8 h-8 flex items-center justify-center hover:bg-slate-700 rounded text-slate-400 transition-colors" title="Center Canvas View"><LocateFixed size={16} /></button>
        <div className="w-px bg-slate-600 mx-1"></div>
        <span className="text-xs font-bold flex items-center px-2 text-slate-300 w-12 justify-center">{Math.round(zoom * 100)}%</span>
      </div>

      <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0', width: '100%', height: '100%', position: 'absolute' }}>
        <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
          {connectingFrom && (() => { 
            const fromNode = nodes.find(n => n.id === connectingFrom); if(!fromNode) return null; 
            const startX = fromNode.x + 200; const startY = fromNode.y + 30;  
            return <path d={`M ${startX} ${startY} C ${startX + 60} ${startY}, ${mousePos.x - 60} ${mousePos.y}, ${mousePos.x} ${mousePos.y}`} fill="none" stroke="#10b981" strokeWidth="4" strokeDasharray="6,6" className="wire-pulse" />;
          })()}

          {connections.map((conn, i) => { 
            const fromNode = nodes.find(n => n.id === conn.from); const toNode = nodes.find(n => n.id === conn.to); if(!fromNode || !toNode) return null; 
            const startX = fromNode.x + 200; const startY = fromNode.y + 30; const endX = toNode.x; const endY = toNode.y + 30; 
            const isHighlighted = selectedNodeId === fromNode.id || selectedNodeId === toNode.id; 
            const wireClass = nodeStatuses[fromNode.id] === 'processing' ? 'wire-pulse pointer-events-none' : 'transition-all duration-300 hover:stroke-red-500 cursor-pointer pointer-events-auto';
            const wireColor = nodeStatuses[fromNode.id] === 'success' ? '#10b981' : (isHighlighted ? "#10b981" : "#475569");
            return <path key={i} d={`M ${startX} ${startY} C ${startX + 60} ${startY}, ${endX - 60} ${endY}, ${endX} ${endY}`} fill="none" stroke={wireColor} strokeWidth={isHighlighted || nodeStatuses[fromNode.id] ? "6" : "4"} className={wireClass} onPointerDown={(e) => { e.stopPropagation(); if(removeConnection) removeConnection(i); }} />;
          })}
        </svg>

        {nodes.map(node => {
          const isSelected = selectedNodeId === node.id;
          const status = nodeStatuses[node.id];
          
          let statusClasses = '';
          if (status === 'processing') statusClasses = 'ring-2 ring-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.6)] animate-pulse z-20';
          else if (status === 'success') statusClasses = 'ring-2 ring-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.4)] z-10';
          else if (isSelected) statusClasses = 'ring-2 ring-white shadow-[0_0_20px_rgba(255,255,255,0.3)] scale-105 z-10';
          else statusClasses = 'border border-t-white/20 border-b-black/50 hover:border-slate-400 z-0';

          let IconElement = <Settings size={18} className="text-white/70" />;
          if (typeof node.icon === 'string') IconElement = <i className={`fas ${node.icon} text-white/70 text-lg`}></i>;
          else if (node._icon_key === 'ImageIcon') IconElement = <i className="fas fa-image text-white/70 text-lg"></i>;
          else if (node._icon_key === 'Hexagon') IconElement = <i className="fas fa-draw-polygon text-white/70 text-lg"></i>;
          else if (node._icon_key === 'Leaf') IconElement = <i className="fas fa-leaf text-white/70 text-lg"></i>;
          else if (node._icon_key === 'Grid') IconElement = <i className="fas fa-th text-white/70 text-lg"></i>;
          else if (node._icon_key === 'Crosshair') IconElement = <i className="fas fa-crosshairs text-white/70 text-lg"></i>;
          else if (node._icon_key === 'Scissors') IconElement = <i className="fas fa-cut text-white/70 text-lg"></i>;
          else if (node._icon_key === 'CircleDashed') IconElement = <i className="fas fa-circle-notch text-white/70 text-lg"></i>;

          return (
            <div key={node.id} onPointerDown={(e) => { if(!panMode){ setDraggedNode(node.id); selectNode(node.id, e); } }} className={`absolute w-[210px] h-[60px] rounded-lg shadow-xl flex items-center px-4 transition-all duration-300 ${node.color} ${statusClasses} ${panMode ? '' : 'cursor-pointer'}`} style={{ left: node.x, top: node.y }}>
              <div className="input-port absolute -left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 bg-slate-300 rounded-full border-2 border-slate-800 hover:scale-150 transition-transform cursor-crosshair z-30" onPointerUp={(e) => completeWire(node.id, e)}></div>
              <div className="mr-3 pointer-events-none flex items-center justify-center">{IconElement}</div>
              <div className="flex-1 truncate pointer-events-none">
                <div className="text-[9px] uppercase tracking-widest text-white/70 font-bold">{node.toolId.split('_')[0]}</div>
                <div className="text-sm font-bold text-white truncate drop-shadow-md">{node.name}</div>
              </div>
              <div className="output-port absolute -right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 bg-emerald-400 rounded-full border-2 border-slate-800 hover:scale-150 transition-transform cursor-crosshair z-30 shadow-[0_0_8px_#10b981]" onPointerDown={(e) => startWire(node.id, e)}></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}