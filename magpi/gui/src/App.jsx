import React, { useState } from 'react';

// Imported Modular Components
import TopRibbon from './components/TopRibbon';
import Terminal from './components/Terminal';
import Toolbox from './components/Toolbox';
import NodeCanvas from './components/NodeCanvas';
import MapViewport from './components/MapViewport';
import ScriptModal from './components/ScriptModal';

// Utilities
import { generatePythonScript } from './utils/scriptGen';
import { saveProject, loadProject } from './utils/fileOps';

export default function App() {
  // Global Application State
  const [crs, setCrs] = useState("EPSG:6438");
  const [processingScope, setProcessingScope] = useState("Local Python");
  
  // Pipeline State (The Nodes & Wires)
  const [nodes, setNodes] = useState([
    { id: 'node_1', toolId: 'load_raster', name: 'NOAA 4-Band Raster', icon: 'fa-image', x: 200, y: 150, color: 'bg-blue-600', border: 'border-blue-500', params: { file_path: "./test_data/noaa_florida/2021_4BandImagery_Florida_J1378560tR0_C0.tif" } }
  ]);
  const [connections, setConnections] = useState([]);
  
  // UI Interaction State
  const [activeRightTab, setActiveRightTab] = useState('toolbox');
  const [selectedNodeId, setSelectedNodeId] = useState(null);

  // Terminal, Script & Execution State
  const [showScript, setShowScript] = useState(false);
  const [generatedCode, setGeneratedCode] = useState("");
  const [showTerminal, setShowTerminal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState([]);
  const [nodeStatuses, setNodeStatuses] = useState({});

  // --- MAP TO CANVAS BRIDGE ---
  const handleAoiDrawn = (aoiData) => {
    const newNode = { 
      id: `node_${Date.now()}`, toolId: 'mgt_clip', name: 'Clip to AOI (Map Draw)', icon: 'fa-cut', 
      x: 400 + Math.random() * 50, y: 200 + Math.random() * 50, color: 'bg-slate-600', border: 'border-slate-500', 
      params: { xmin: aoiData.xmin, ymin: aoiData.ymin, xmax: aoiData.xmax, ymax: aoiData.ymax } 
    };
    setNodes(prev => [...prev, newNode]);
    setSelectedNodeId(newNode.id);
    setActiveRightTab('inspector');
  };

  // --- NODE LOGIC METHODS ---
  // ENHANCED: Now accepts specific X and Y coordinates!
  const addNode = (tool, dropX = null, dropY = null) => {
    const newNode = { 
      id: `node_${Date.now()}`, 
      toolId: tool.id, 
      name: tool.name, 
      icon: tool.icon, 
      x: dropX !== null ? dropX : 300 + Math.random() * 50, 
      y: dropY !== null ? dropY : 200 + Math.random() * 50, 
      color: tool.color, 
      border: tool.border, 
      params: { ...tool.params } 
    };
    setNodes([...nodes, newNode]);
    setSelectedNodeId(newNode.id);
    setActiveRightTab('inspector');
  };

  const updateNodeParam = (nodeId, paramKey, value) => {
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, params: { ...n.params, [paramKey]: value } } : n));
  };

  const deleteNode = (nodeId) => {
    setNodes(nds => nds.filter(n => n.id !== nodeId));
    setConnections(cx => cx.filter(c => c.from !== nodeId && c.to !== nodeId));
    setSelectedNodeId(null);
    setActiveRightTab('toolbox');
  };

  const removeConnection = (index) => {
    setConnections(cx => cx.filter((_, i) => i !== index));
  };

  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  // --- PROJECT SAVE/LOAD ---
  const handleSave = () => {
    saveProject(nodes, connections, crs, "MagPI_Active_Pipeline");
    setLogs([{ type: 'success', msg: 'Project saved to disk as .mpjx format.' }]);
    setShowTerminal(true);
  };

  const handleLoad = (file) => {
    loadProject(file, setNodes, setConnections, setCrs, (msg) => {
        setLogs([msg]);
        setShowTerminal(true);
        setNodeStatuses({});
    });
  };

  // --- EXECUTION PIPELINE ---
  const handleGenerate = () => {
    const code = generatePythonScript(nodes, connections, crs, processingScope);
    setGeneratedCode(code);
    setShowScript(true);
  };

  const handleDeploy = () => {
    setShowScript(false);
    setShowTerminal(true);
    setIsProcessing(true);
    setLogs([]);
    setNodeStatuses({});
    
    const sortedNodes = [...nodes].sort((a, b) => a.x - b.x);
    const simulatedLogs = [
        { type: 'info', msg: 'MagPI Translation Matrix Online. Bypassing legacy dependencies.', delay: 500 },
        { type: 'info', msg: `Global Workspace set to: ./tmp_wksp`, delay: 500 }
    ];
    
    sortedNodes.forEach((n) => {
        simulatedLogs.push({ type: 'info', msg: `[${n.name}] Initialization starting...`, nodeId: n.id, status: 'processing', delay: 1000 });
        simulatedLogs.push({ type: 'success', msg: `[PASS] ${n.name} execution complete.`, nodeId: n.id, status: 'success', delay: 1000 });
    });
    
    simulatedLogs.push({ type: 'success', msg: `--- MAGPI PIPELINE EXECUTION COMPLETE ---`, delay: 500, isEnd: true });

    let currentLogIndex = 0;
    const processNextLog = () => {
        if (currentLogIndex >= simulatedLogs.length) return;
        const log = simulatedLogs[currentLogIndex];
        if (log.isEnd) setIsProcessing(false);
        if (log.nodeId && log.status) setNodeStatuses(prev => ({ ...prev, [log.nodeId]: log.status }));
        setLogs(prev => [...prev, log]);
        setTimeout(() => { currentLogIndex++; processNextLog(); }, log.delay || 300);
    };
    processNextLog();
  };

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-slate-200 font-sans overflow-hidden select-none">
      <TopRibbon crs={crs} setCrs={setCrs} processingScope={processingScope} setProcessingScope={setProcessingScope} onGenerate={handleGenerate} onSave={handleSave} onLoad={handleLoad} />
      <div className={`flex flex-1 overflow-hidden transition-all duration-500 ${showTerminal ? 'h-[65vh]' : 'h-full'}`}>
        <NodeCanvas 
          nodes={nodes} setNodes={setNodes}
          connections={connections} setConnections={setConnections}
          selectedNodeId={selectedNodeId} setSelectedNodeId={setSelectedNodeId}
          setActiveRightTab={setActiveRightTab} nodeStatuses={nodeStatuses} 
          removeConnection={removeConnection} 
          addNode={addNode} // <-- ENHANCED: Passed addNode into the canvas!
        />
        <MapViewport onAoiDrawn={handleAoiDrawn} />
        <Toolbox activeRightTab={activeRightTab} setActiveRightTab={setActiveRightTab} selectedNode={selectedNode} updateNodeParam={updateNodeParam} deleteNode={deleteNode} addNode={addNode} />
      </div>
      <Terminal showTerminal={showTerminal} setShowTerminal={setShowTerminal} logs={logs} isProcessing={isProcessing} />
      <ScriptModal showScript={showScript} setShowScript={setShowScript} generatedCode={generatedCode} processingScope={processingScope} onDeploy={handleDeploy} />
    </div>
  );
}