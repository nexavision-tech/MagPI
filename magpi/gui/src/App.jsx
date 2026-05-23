import React, { useState, useCallback, useEffect } from 'react';
import { GitBranch, XCircle, AlertTriangle, Bell, TerminalSquare, Save, Map as MapIcon, Edit3, Wrench, Layers, Activity } from 'lucide-react';
import TopRibbon from './components/TopRibbon';
import Terminal from './components/Terminal';
import Toolbox from './components/Toolbox';
import NodeCanvas from './components/NodeCanvas';
import MapViewport from './components/MapViewport';
import TensorBrew from './components/TensorBrew';
import JobManager from './components/JobManager';
import ScriptModal from './components/ScriptModal';
import FileBrowserModal from './components/FileBrowserModal';
import EnvSettingsModal from './components/EnvSettingsModal';
import { generatePythonScript } from './utils/scriptGen';
import { saveProject, loadProject } from './utils/fileOps';

export default function App() {
  const [activeWorkspace, setActiveWorkspace] = useState('builder');
  const [crs, setCrs] = useState("EPSG:6438");
  const [processingScope, setProcessingScope] = useState("Local Python");
  
  const [globalEnv, setGlobalEnv] = useState({
    workspace_dir: "./magpi_workspace",
    scratch_dir: "./magpi_scratch",
    output_dir: "./magpi_output",
    horizontal_datum: "EPSG:4326",
    vertical_datum: "EPSG:3855"
  });
  const [showEnvSettings, setShowEnvSettings] = useState(false);

  const [nodes, setNodes] = useState([]);
  const [connections, setConnections] = useState([]);
  
  const [activeRightTab, setActiveRightTab] = useState('toolbox');
  const [selectedNodeId, setSelectedNodeId] = useState(null);

  const [showScript, setShowScript] = useState(false);
  const [generatedCode, setGeneratedCode] = useState("");
  const [showTerminal, setShowTerminal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState([]);
  const [nodeStatuses, setNodeStatuses] = useState({});

  const [browserConfig, setBrowserConfig] = useState({ isOpen: false, nodeId: null, paramKey: null, initialPath: "." });

  // --- AUTO-SAVE ENGINE (Prevents Losing Work!) ---
  useEffect(() => {
    // Load from LocalStorage on initial boot
    const savedNodes = localStorage.getItem('magpi_autosave_nodes');
    const savedCxs = localStorage.getItem('magpi_autosave_cxs');
    const savedEnv = localStorage.getItem('magpi_global_env');
    if (savedEnv) {
        try { setGlobalEnv(JSON.parse(savedEnv)); } catch (e) {}
    }
    if (savedNodes && savedCxs) {
        try {
            setNodes(JSON.parse(savedNodes));
            setConnections(JSON.parse(savedCxs));
            setLogs([{ type: 'success', msg: 'Previous matrix state auto-restored.' }]);
            setShowTerminal(true);
        } catch (e) { console.error("Failed to restore matrix state."); }
    }
  }, []);

  useEffect(() => {
    // Save to LocalStorage whenever the matrix changes
    if (nodes.length > 0 || connections.length > 0) {
        localStorage.setItem('magpi_autosave_nodes', JSON.stringify(nodes));
        localStorage.setItem('magpi_autosave_cxs', JSON.stringify(connections));
    }
    localStorage.setItem('magpi_global_env', JSON.stringify(globalEnv));
  }, [nodes, connections, globalEnv]);

  const handleAoiDrawn = useCallback((aoiData) => {
    const newNode = { 
      id: `node_${Date.now()}`, toolId: 'core_extent', name: 'Spatial Extent (AOI)', icon: 'core_extent', 
      x: 400 + Math.random() * 50, y: 200 + Math.random() * 50, color: 'bg-yellow-600', border: 'border-yellow-500', 
      params: { xmin: aoiData.xmin, ymin: aoiData.ymin, xmax: aoiData.xmax, ymax: aoiData.ymax } 
    };
    setNodes(prev => [...prev, newNode]);
    setSelectedNodeId(newNode.id);
    setActiveRightTab('inspector');
    setActiveWorkspace('builder');
  }, []);

  const addNode = useCallback((tool, dropX = null, dropY = null) => {
    const newNode = { 
      id: `node_${Date.now()}`, toolId: tool.id, name: tool.name, icon: tool.id, 
      x: dropX !== null ? dropX : 300 + Math.random() * 50, y: dropY !== null ? dropY : 200 + Math.random() * 50, 
      color: tool.color, border: tool.border, params: { ...tool.params } 
    };
    setNodes(prev => [...prev, newNode]);
    setSelectedNodeId(newNode.id);
    setActiveRightTab('inspector');
  }, []);

  const updateNodeParam = (nodeId, paramKey, value) => {
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, params: { ...n.params, [paramKey]: value } } : n));
  };

  const openFileBrowser = (nodeId, paramKey, currentPath) => {
    setBrowserConfig({ isOpen: true, nodeId, paramKey, initialPath: currentPath || "." });
  };

  const handleFileSelected = (absolutePath) => {
    if (browserConfig.nodeId && browserConfig.paramKey) updateNodeParam(browserConfig.nodeId, browserConfig.paramKey, absolutePath);
  };

  const updateNodeName = (nodeId, newName) => {
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, name: newName } : n));
  };

  const deleteNode = (nodeId) => {
    setNodes(nds => nds.filter(n => n.id !== nodeId));
    setConnections(cx => cx.filter(c => c.from !== nodeId && c.to !== nodeId));
    setSelectedNodeId(null);
    setActiveRightTab('toolbox');
  };

  const duplicateNode = (nodeId) => {
    const nodeToCopy = nodes.find(n => n.id === nodeId);
    if (!nodeToCopy) return;
    const clonedNode = { ...nodeToCopy, id: `node_${Date.now()}`, x: nodeToCopy.x + 40, y: nodeToCopy.y + 40 };
    setNodes([...nodes, clonedNode]);
    setSelectedNodeId(clonedNode.id);
  };

  const removeConnection = (index) => {
    setConnections(cx => cx.filter((_, i) => i !== index));
  };

  const handleClear = () => {
    setNodes([]); setConnections([]); setSelectedNodeId(null); setNodeStatuses({});
    localStorage.removeItem('magpi_autosave_nodes'); localStorage.removeItem('magpi_autosave_cxs');
    setActiveRightTab('toolbox'); setLogs([{ type: 'info', msg: 'Matrix cleared. Ready for new input.' }]);
    setShowTerminal(true);
  };

  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  const handleSave = () => {
    saveProject(nodes, connections, crs, "MagPI_Active_Pipeline");
    setLogs([{ type: 'success', msg: 'Project saved to disk as .mpjx format.' }]);
    setShowTerminal(true);
  };

  const handleLoad = (file) => {
    loadProject(file, setNodes, setConnections, setCrs, (msg) => {
        setLogs([msg]); setShowTerminal(true); setNodeStatuses({});
    });
  };

  const handleGenerate = () => {
    const code = generatePythonScript(nodes, connections, crs, processingScope, globalEnv);
    setGeneratedCode(code);
    setShowScript(true);
  };

  const handleDeploy = async () => {
    setShowScript(false); setShowTerminal(true); setIsProcessing(true); setNodeStatuses({});
    const processingStates = {};
    nodes.forEach(n => processingStates[n.id] = 'processing');
    setNodeStatuses(processingStates);
    setLogs([{ type: 'info', msg: 'Initiating Daemon Link on port 8080...' }, { type: 'info', msg: 'Transmitting payload to OS kernel...' }]);
    try {
        const payload = {
            nodes,
            connections,
            crs,
            globalEnv
        };
        const response = await fetch("http://localhost:8080/api/run_pipeline", { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await response.json();
        if (response.ok) {
            const rawLogs = (data.logs || "Execution finished. See Daemon logs.").split('\n').filter(l => l.trim() !== '');
            const parsedLogs = rawLogs.map(line => {
                let logType = 'info';
                if (line.toLowerCase().includes('error') || line.toLowerCase().includes('fail')) logType = 'error';
                else if (line.toLowerCase().includes('success') || line.toLowerCase().includes('pass')) logType = 'success';
                return { type: logType, msg: line };
            });
            setLogs(prev => [...prev, ...parsedLogs, { type: data.status === 'success' ? 'success' : 'error', msg: `Matrix Execution ${data.status.toUpperCase()}.` }]);
            const finalStates = {};
            nodes.forEach(n => finalStates[n.id] = data.status === 'success' ? 'success' : null);
            setNodeStatuses(finalStates);
        } else {
            setLogs(prev => [...prev, { type: 'error', msg: `Daemon execution failed: ${data.error}` }]);
            setNodeStatuses({});
        }
    } catch (err) {
        setLogs(prev => [...prev, { type: 'error', msg: `Failed to contact MagPI Daemon: ${err.message}` }]);
        setNodeStatuses({});
    } finally {
        setIsProcessing(false);
    }
  };

  return (
    <div className="absolute inset-0 w-full h-full flex flex-col bg-slate-900 text-slate-200 font-sans overflow-hidden select-none">
      <div className="flex-none z-40 shadow-md">
        <TopRibbon crs={crs} setCrs={setCrs} processingScope={processingScope} setProcessingScope={setProcessingScope} onGenerate={handleGenerate} onSave={handleSave} onLoad={handleLoad} onClear={handleClear} onOpenEnvSettings={() => setShowEnvSettings(true)} />
        <div className="flex bg-slate-900 border-b border-slate-700 px-4 pt-2">
            <button onClick={() => setActiveWorkspace('builder')} className={`px-6 py-2 text-xs font-bold uppercase tracking-widest rounded-t-lg transition-colors flex items-center border border-b-0 ${activeWorkspace === 'builder' ? 'bg-slate-800 text-emerald-400 border-slate-600' : 'bg-transparent text-slate-500 border-transparent hover:bg-slate-800/50 hover:text-slate-300'}`}><Wrench size={14} className="mr-2" /> Model Builder</button>
            <button onClick={() => setActiveWorkspace('globe')} className={`px-6 py-2 text-xs font-bold uppercase tracking-widest rounded-t-lg transition-colors flex items-center border border-b-0 ml-1 ${activeWorkspace === 'globe' ? 'bg-slate-800 text-cyan-400 border-slate-600' : 'bg-transparent text-slate-500 border-transparent hover:bg-slate-800/50 hover:text-slate-300'}`}><MapIcon size={14} className="mr-2" /> Globe Nexus</button>
            <button onClick={() => setActiveWorkspace('planar')} className={`px-6 py-2 text-xs font-bold uppercase tracking-widest rounded-t-lg transition-colors flex items-center border border-b-0 ml-1 ${activeWorkspace === 'planar' ? 'bg-slate-800 text-purple-400 border-slate-600' : 'bg-transparent text-slate-500 border-transparent hover:bg-slate-800/50 hover:text-slate-300'}`}><Edit3 size={14} className="mr-2" /> Planar Train Env</button>
            <button onClick={() => setActiveWorkspace('tensor_brew')} className={`px-6 py-2 text-xs font-bold uppercase tracking-widest rounded-t-lg transition-colors flex items-center border border-b-0 ml-1 ${activeWorkspace === 'tensor_brew' ? 'bg-slate-800 text-indigo-400 border-slate-600' : 'bg-transparent text-slate-500 border-transparent hover:bg-slate-800/50 hover:text-slate-300'}`}><Layers size={14} className="mr-2" /> Tensor Brew</button>
            <button onClick={() => setActiveWorkspace('jobs')} className={`px-6 py-2 text-xs font-bold uppercase tracking-widest rounded-t-lg transition-colors flex items-center border border-b-0 ml-1 ${activeWorkspace === 'jobs' ? 'bg-slate-800 text-rose-400 border-slate-600' : 'bg-transparent text-slate-500 border-transparent hover:bg-slate-800/50 hover:text-slate-300'}`}><Activity size={14} className="mr-2" /> Job Manager</button>
        </div>
      </div>
      
      <div className="flex-1 flex overflow-hidden min-h-0 relative z-0 bg-slate-800">
        <div className={`flex-1 relative ${activeWorkspace === 'builder' ? 'flex' : 'hidden'}`}>
            <NodeCanvas nodes={nodes} setNodes={setNodes} connections={connections} setConnections={setConnections} selectedNodeId={selectedNodeId} setSelectedNodeId={setSelectedNodeId} setActiveRightTab={setActiveRightTab} nodeStatuses={nodeStatuses} removeConnection={removeConnection} addNode={addNode} />
        </div>
        <div className={`relative ${['builder', 'globe', 'planar'].includes(activeWorkspace) ? (activeWorkspace === 'builder' ? 'w-[320px] hidden lg:flex' : 'flex-1 w-full') : 'hidden'} flex-col shadow-[-10px_0_20px_rgba(0,0,0,0.3)] z-10 border-l border-r border-slate-800`}>
            <MapViewport onAoiDrawn={handleAoiDrawn} selectedNode={selectedNode} activeWorkspace={activeWorkspace} />
        </div>
        <div className={`w-[320px] relative ${activeWorkspace === 'builder' ? 'flex' : 'hidden'} flex-col z-20`}>
            <Toolbox activeRightTab={activeRightTab} setActiveRightTab={setActiveRightTab} selectedNode={selectedNode} updateNodeParam={updateNodeParam} updateNodeName={updateNodeName} deleteNode={deleteNode} addNode={addNode} duplicateNode={duplicateNode} openFileBrowser={openFileBrowser} />
        </div>
        
        {/* Render Tensor Brew Fullscreen when Active */}
        <div className={`absolute inset-0 z-50 ${activeWorkspace === 'tensor_brew' ? 'block' : 'hidden'}`}>
            <TensorBrew activeWorkspace={activeWorkspace} />
        </div>
        
        {/* Render Job Manager Fullscreen when Active */}
        <div className={`absolute inset-0 z-50 ${activeWorkspace === 'jobs' ? 'block' : 'hidden'}`}>
            <JobManager activeWorkspace={activeWorkspace} />
        </div>
      </div>

      <div className="flex-none z-30"><Terminal showTerminal={showTerminal} setShowTerminal={setShowTerminal} logs={logs} isProcessing={isProcessing} /></div>
      
      <div className="flex-none shrink-0 bg-slate-950 border-t border-slate-800 text-[10.5px] text-slate-400 flex items-center justify-between px-3 py-1.5 z-50 font-sans shadow-[0_-2px_5px_rgba(0,0,0,0.5)]">
        <div className="flex items-center space-x-4">
          <span className="flex items-center cursor-pointer hover:text-slate-200 transition-colors"><GitBranch size={11} className="mr-1 text-emerald-500" /> main*</span>
          <span className="flex items-center cursor-pointer hover:text-slate-200 transition-colors"><XCircle size={11} className="mr-1 text-red-500" />0 <AlertTriangle size={11} className="ml-2 mr-1 text-yellow-500" />0</span>
          <span className="flex items-center cursor-pointer hover:text-slate-200 transition-colors" onClick={() => setShowTerminal(!showTerminal)} title="Toggle MagPI Console"><TerminalSquare size={11} className="mr-1 text-blue-400" /> {showTerminal ? "Hide Console" : "Show Console"}</span>
        </div>
        <div className="flex items-center space-x-4 font-mono">
          <span className="cursor-pointer hover:text-slate-200 transition-colors hidden sm:block text-slate-600">UTF-8</span>
          <span className="cursor-pointer hover:text-slate-200 transition-colors">Python 3.10 <span className="text-emerald-500 font-bold ml-1">(magpi-env)</span></span>
          <span className="cursor-pointer hover:text-emerald-400 transition-colors"><Bell size={11} /></span>
        </div>
      </div>
      
      <ScriptModal showScript={showScript} setShowScript={setShowScript} generatedCode={generatedCode} processingScope={processingScope} onDeploy={handleDeploy} />
      <FileBrowserModal isOpen={browserConfig.isOpen} onClose={() => setBrowserConfig(prev => ({ ...prev, isOpen: false }))} onSelect={handleFileSelected} initialPath={browserConfig.initialPath} />
      <EnvSettingsModal isOpen={showEnvSettings} onClose={() => setShowEnvSettings(false)} globalEnv={globalEnv} setGlobalEnv={setGlobalEnv} />
    </div>
  );
}