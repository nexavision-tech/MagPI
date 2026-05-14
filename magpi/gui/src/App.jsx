import React, { useState } from 'react';

// Imported Components
import TopRibbon from './components/TopRibbon';
import Terminal from './components/Terminal';
import Toolbox from './components/Toolbox';
import NodeCanvas from './components/NodeCanvas';
import MapViewport from './components/MapViewport';
import ScriptModal from './components/ScriptModal';

// Utilities
import { generatePythonScript } from './utils/scriptGen';

export default function App() {
  // Global Application State
  const [crs, setCrs] = useState("EPSG:6438");
  const [processingScope, setProcessingScope] = useState("Local Python");
  
  // Pipeline State (The Nodes & Wires)
  const [nodes, setNodes] = useState([
    { id: 'node_1', toolId: 'load_raster', name: 'NOAA 4-Band Raster', icon: 'fa-image', x: 200, y: 150, color: 'bg-blue-600', border: 'border-blue-500', params: { file_path: "./test_data/noaa_florida/2021_4BandImagery.tif" } }
  ]);
  const [connections, setConnections] = useState([]);
  
  // UI Interaction State
  const [activeRightTab, setActiveRightTab] = useState('toolbox');
  const [selectedNodeId, setSelectedNodeId] = useState(null);

  // Terminal & Script State
  const [showScript, setShowScript] = useState(false);
  const [generatedCode, setGeneratedCode] = useState("");
  const [showTerminal, setShowTerminal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState([]);

  // --- MAP TO CANVAS BRIDGE ---
  const handleAoiDrawn = (aoiData) => {
    const newNode = { 
      id: `node_${Date.now()}`, 
      toolId: 'mgt_clip', 
      name: 'Clip to AOI (Map Draw)', 
      icon: 'fa-cut', 
      x: 400 + Math.random() * 50, 
      y: 200 + Math.random() * 50, 
      color: 'bg-slate-600', 
      border: 'border-slate-500', 
      params: { xmin: aoiData.xmin, ymin: aoiData.ymin, xmax: aoiData.xmax, ymax: aoiData.ymax } 
    };
    setNodes(prev => [...prev, newNode]);
    setSelectedNodeId(newNode.id);
    setActiveRightTab('inspector');
  };

  // --- NODE LOGIC METHODS ---
  const addNode = (tool) => {
    const newNode = { 
      id: `node_${Date.now()}`, 
      toolId: tool.id, 
      name: tool.name, 
      icon: tool.icon, 
      x: 300 + Math.random() * 50, 
      y: 200 + Math.random() * 50, 
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

  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  // --- EXECUTION PIPELINE ---
  const handleGenerate = () => {
    // 1. Generate the Python string using our isolated utility
    const code = generatePythonScript(nodes, connections, crs, processingScope);
    setGeneratedCode(code);
    
    // 2. Pop open the modal
    setShowScript(true);
  };

  const handleDeploy = () => {
    // 1. Hide the script modal and show terminal
    setShowScript(false);
    setShowTerminal(true);
    setIsProcessing(true);
    setLogs([]);
    
    // 2. Simulate the backend processing logs based on nodes
    const simulatedLogs = [
        { type: 'info', msg: 'MagPI Translation Matrix Online. Bypassing legacy dependencies.' },
        { type: 'info', msg: `Global Workspace set to: ./tmp_wksp` }
    ];
    
    nodes.forEach((n) => {
        simulatedLogs.push({ type: 'info', msg: `[${n.name}] Initialization starting...`, delay: 1000 });
        if (n.toolId === 'ia_ndvi') {
             simulatedLogs.push({ type: 'info', msg: `Executing Open-Source NDVI. Math C-Backend loaded.`, delay: 800 });
             simulatedLogs.push({ type: 'success', msg: `[PASS] NDVI successfully calculated.`, delay: 1200 });
        }
        if (n.toolId === 'ia_export_dl') {
             simulatedLogs.push({ type: 'info', msg: `Chipping into tensors with stride ${n.params.stride}...`, delay: 1000 });
             simulatedLogs.push({ type: 'success', msg: `[PASS] PyTorch tensors successfully generated at ${n.params.out_folder}.`, delay: 1500 });
        }
    });
    simulatedLogs.push({ type: 'success', msg: `--- MAGPI PIPELINE EXECUTION COMPLETE ---`, delay: 500 });

    // Recursive timeout trick to play logs sequentially like a real terminal
    let currentLogIndex = 0;
    const processNextLog = () => {
        if (currentLogIndex >= simulatedLogs.length) { 
            setIsProcessing(false); 
            return; 
        }
        const log = simulatedLogs[currentLogIndex];
        setLogs(prev => [...prev, log]);
        setTimeout(() => { 
            currentLogIndex++; 
            processNextLog(); 
        }, log.delay || 300);
    };
    processNextLog();
  };

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-slate-200 font-sans overflow-hidden select-none">
      
      <TopRibbon 
        crs={crs} setCrs={setCrs} 
        processingScope={processingScope} setProcessingScope={setProcessingScope}
        onGenerate={handleGenerate}
      />

      <div className={`flex flex-1 overflow-hidden transition-all duration-500 ${showTerminal ? 'h-2/3' : 'h-full'}`}>
        <NodeCanvas 
          nodes={nodes} setNodes={setNodes}
          connections={connections} setConnections={setConnections}
          selectedNodeId={selectedNodeId} setSelectedNodeId={setSelectedNodeId}
          setActiveRightTab={setActiveRightTab}
        />
        <MapViewport onAoiDrawn={handleAoiDrawn} />
        <Toolbox 
          activeRightTab={activeRightTab} setActiveRightTab={setActiveRightTab}
          selectedNode={selectedNode} updateNodeParam={updateNodeParam}
          deleteNode={deleteNode} addNode={addNode}
        />
      </div>

      <Terminal 
        showTerminal={showTerminal} setShowTerminal={setShowTerminal} 
        logs={logs} isProcessing={isProcessing} 
      />

      {/* 5. SCRIPT MODAL */}
      <ScriptModal 
        showScript={showScript} 
        setShowScript={setShowScript} 
        generatedCode={generatedCode}
        processingScope={processingScope}
        onDeploy={handleDeploy}
      />

    </div>
  );
}