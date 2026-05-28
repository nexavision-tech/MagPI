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
import { generateAirflowDAG } from './utils/airflowGen';
import { saveProject, loadProject } from './utils/fileOps';

export default function App() {
  const [activeWorkspace, setActiveWorkspace] = useState('builder');
  const [crs, setCrs] = useState("EPSG:4326");
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
  const [activeJobId, setActiveJobId] = useState(null);

  // --- JOB POLLING ENGINE ---
  useEffect(() => {
    let interval;
    if (activeJobId) {
      interval = setInterval(async () => {
        try {
          const res = await fetch('http://localhost:8080/api/jobs');
          if (res.ok) {
            const jobs = await res.json();
            const job = jobs.find(j => j.id === activeJobId);
            if (job && job.node_status) {
                // Instantly mark input nodes as success so they don't spin
                const adjustedStatuses = { ...job.node_status };
                nodes.forEach(n => {
                    if (n.toolId.startsWith('core_') || n.toolId.startsWith('load_')) {
                        adjustedStatuses[n.id] = 'success';
                    }
                });
                setNodeStatuses(adjustedStatuses);

                if (job.logs && job.logs.length > 0) {
                    const parsedLogs = job.logs.filter(l => l.trim().length > 0).map(l => {
                        let type = 'info';
                        if (l.includes('[ERROR]') || l.includes('Error:')) type = 'error';
                        else if (l.includes('[SUCCESS]')) type = 'success';
                        else if (l.includes('[WARNING]')) type = 'warn';
                        return { type, msg: l.replace(/\[.*?\]:\s?/, '') };
                    });
                    setLogs([{ type: 'info', msg: 'Initiating Daemon Link on port 8080...' }, { type: 'info', msg: `Pipeline Dispatched to Daemon. Job ID: ${job.id}` }, ...parsedLogs]);
                }
                
                if (job.status === 'Finished' || job.status === 'Failed') {
                    setActiveJobId(null);
                    setIsProcessing(false);
                }
            }
          }
        } catch (e) {}
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [activeJobId, nodes]);

  // --- DAEMON RESYNC (ON BROWSER REFRESH) ---
  useEffect(() => {
      const checkActiveJobs = async () => {
          try {
              const res = await fetch('http://localhost:8080/api/jobs');
              if (res.ok) {
                  const jobs = await res.json();
                  const activeJob = jobs.find(j => j.status !== 'Finished' && j.status !== 'Failed');
                  if (activeJob) {
                      setActiveJobId(activeJob.id);
                      setIsProcessing(true);
                      setLogs(prev => [...prev, { type: 'success', msg: `Reconnected to running Daemon Job: ${activeJob.id}` }]);
                      setShowTerminal(true);
                  }
              }
          } catch (e) {}
      };
      checkActiveJobs();
  }, []);

  const [browserConfig, setBrowserConfig] = useState({ isOpen: false, nodeId: null, paramKey: null, initialPath: "." });

  // --- UI LAYOUT FIX ---
  // Fixes Leaflet/ReactFlow Map getting stuck at 0x0 size when switching tabs due to 'display: hidden'
  useEffect(() => {
    setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
  }, [activeWorkspace]);

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

  const handleImportENVI = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(e.target.result, "text/xml");
        const points = Array.from(xmlDoc.getElementsByTagName('POINT')).map(node => {
            const [x, y] = node.textContent.split(',').map(Number);
            return { x, y };
        });
        
        if (points.length === 0) throw new Error("No points found in ROI XML.");
        
        const xmin = Math.min(...points.map(p => p.x));
        const xmax = Math.max(...points.map(p => p.x));
        const ymin = Math.min(...points.map(p => p.y));
        const ymax = Math.max(...points.map(p => p.y));
        
        const roiNameNode = xmlDoc.getElementsByTagName('NAME')[0];
        const roiName = roiNameNode ? roiNameNode.textContent : "ENVI ROI";
        
        const newNode = { 
          id: `node_${Date.now()}`, toolId: 'core_extent', name: `ENVI ROI: ${roiName}`, icon: 'core_extent', 
          x: 400 + Math.random() * 50, y: 200 + Math.random() * 50, color: 'bg-yellow-600', border: 'border-yellow-500', 
          params: { xmin, ymin, xmax, ymax } 
        };
        
        setNodes(prev => [...prev, newNode]);
        setSelectedNodeId(newNode.id);
        setActiveRightTab('inspector');
        setActiveWorkspace('builder');
        
        setLogs([{ type: 'success', msg: `Successfully imported ENVI ROI '${roiName}' as an AOI Extent.` }]);
        setShowTerminal(true);
      } catch (err) {
        setLogs([{ type: 'error', msg: `Failed to parse ENVI ROI: ${err.message}` }]);
        setShowTerminal(true);
      }
    };
    reader.readAsText(file);
  };

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

  const handleFileSelected = async (absolutePath) => {
    if (browserConfig.nodeId === "LOAD_PROJECT") {
        try {
            setLogs([{ type: 'info', msg: `Loading project from ${absolutePath}...` }]);
            const response = await fetch(`http://localhost:8080/api/load_project?file=${encodeURIComponent(absolutePath)}`);
            const data = await response.json();
            if (response.ok && data.status === 'success') {
                const pd = data.project_data;
                if (pd.nodes) setNodes(pd.nodes);
                if (pd.connections) setConnections(pd.connections);
                if (pd.crs) setCrs(pd.crs);
                if (pd.globalEnv) setGlobalEnv(pd.globalEnv);
                setLogs([{ type: 'success', msg: `Project loaded successfully. Rehydrated ${pd.nodes.length} nodes.` }]);
                setNodeStatuses({});
                setShowTerminal(true);
            } else {
                throw new Error(data.error || "Unknown error loading project from daemon.");
            }
        } catch (e) {
            setLogs([{ type: 'error', msg: `Failed to load project: ${e.message}` }]);
            setShowTerminal(true);
        }
    } else if (browserConfig.nodeId === "env" && browserConfig.paramKey) {
        setGlobalEnv(prev => ({ ...prev, [browserConfig.paramKey]: absolutePath }));
    } else if (browserConfig.nodeId && browserConfig.paramKey) {
        updateNodeParam(browserConfig.nodeId, browserConfig.paramKey, absolutePath);
    }
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
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const projectName = `magpi_project_${timestamp}`;
    
    try {
        saveProject(nodes, connections, crs, globalEnv, projectName);
        setLogs([{ type: 'success', msg: `Project successfully downloaded to your local device as ${projectName}.mpjx` }]);
        setShowTerminal(true);
    } catch (e) {
        setLogs([{ type: 'error', msg: `Failed to save project: ${e.message}` }]);
        setShowTerminal(true);
    }
  };

  const handleLoad = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.mpjx,.json';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        loadProject(file, setNodes, setConnections, setCrs, setGlobalEnv, (log) => {
            setLogs([log]);
            setShowTerminal(true);
        });
    };
    input.click();
  };

  const handleAutoLayout = () => {
    if (nodes.length === 0) return;
    
    if (window.dagre) {
        try {
            const g = new window.dagre.graphlib.Graph();
            g.setGraph({ rankdir: 'LR', align: 'UL', ranksep: 150, nodesep: 50 });
            g.setDefaultEdgeLabel(() => ({}));
            
            const NODE_WIDTH = 250;
            const NODE_HEIGHT = 80;

            nodes.forEach(n => {
                g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
            });
            
            connections.forEach(c => {
                g.setEdge(c.from, c.to);
            });
            
            window.dagre.layout(g);
            
            setNodes(prev => prev.map(n => {
                const nodeWithPosition = g.node(n.id);
                return {
                    ...n,
                    x: nodeWithPosition.x - NODE_WIDTH / 2,
                    y: nodeWithPosition.y - NODE_HEIGHT / 2 + 100
                };
            }));
            
            setLogs([{ type: 'success', msg: 'Auto-Layout successfully optimized via Dagre.' }]);
            setShowTerminal(true);
            return; // Exit if successful
        } catch (e) {
            console.error("Dagre layout failed, likely due to a cycle:", e);
        }
    }
    
    // Fallback Homebrew Auto-Layout (executes if Dagre is missing or fails)
        const depths = {};
        const getDepth = (nId, visited = new Set()) => {
            if (depths[nId] !== undefined) return depths[nId];
            if (visited.has(nId)) return 0;
            visited.add(nId);
            const incomingCxs = connections.filter(c => c.to === nId);
            if (incomingCxs.length === 0) return 0;
            
            let maxParentDepth = 0;
            for (const cx of incomingCxs) {
                maxParentDepth = Math.max(maxParentDepth, getDepth(cx.from, new Set(visited)));
            }
            depths[nId] = maxParentDepth + 1;
            return depths[nId];
        };
        
        nodes.forEach(n => getDepth(n.id));
        const nodesByDepth = {};
        Object.entries(depths).forEach(([nId, d]) => {
            if (!nodesByDepth[d]) nodesByDepth[d] = [];
            nodesByDepth[d].push(nodes.find(n => n.id === nId));
        });
        
        const SPACING_X = 350;
        const SPACING_Y = 150;
        const START_X = 50;
        const START_Y = 100;
        
        setNodes(prev => prev.map(n => {
            const d = depths[n.id];
            const siblings = nodesByDepth[d];
            const index = siblings.findIndex(s => s.id === n.id);
            const verticalOffset = ((siblings.length - 1) * SPACING_Y) / 2;
            return {
                ...n,
                x: START_X + (d * SPACING_X),
                y: START_Y + (index * SPACING_Y) - verticalOffset + 200
            };
        }));
        setLogs([{ type: 'success', msg: 'Homebrew Auto-Layout successfully executed.' }]);
    setShowTerminal(true);
  };

  const handleGenerate = () => {
    let code;
    if (processingScope === "Apache Airflow") {
        code = generateAirflowDAG(nodes, connections, crs, globalEnv);
    } else {
        code = generatePythonScript(nodes, connections, crs, processingScope, globalEnv);
    }
    setGeneratedCode(code);
    setShowScript(true);
  };

  const handleDeploy = async () => {
    // 1. Pre-Flight Validation for Orphaned / Unkinked Nodes
    const invalidNodes = nodes.filter(n => {
        const hasIncoming = connections.some(c => c.to === n.id);
        const hasOutgoing = connections.some(c => c.from === n.id);
        
        // Identify Source Nodes that generate data (don't inherently need inputs)
        const isSource = ['core_extent', 'load_raster', 'load_vector', 'logic_constant', 'core_create_vector', 'core_create_raster'].includes(n.toolId) || n.toolId.startsWith('wfs_');
        
        // Completely floating/orphaned (no ins, no outs)
        if (!hasIncoming && !hasOutgoing) return true;
        
        // Processing nodes that are missing incoming connections
        if (!isSource && !hasIncoming) return true;
        
        return false;
    });

    if (invalidNodes.length > 0) {
        const names = invalidNodes.map(n => n.name).join(", ");
        setLogs([{ type: 'error', msg: `Pipeline Validation Failed: The following nodes are disconnected or missing required inputs: ${names}` }]);
        setShowTerminal(true);
        return;
    }

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
            setLogs(prev => [...prev, { type: 'success', msg: `Pipeline Dispatched to Daemon. Job ID: ${data.job_id}` }]);
            setActiveJobId(data.job_id);
            // We keep isProcessing true so the UI indicates active work
        } else {
            setLogs(prev => [...prev, { type: 'error', msg: `Daemon execution failed: ${data.error}` }]);
            setNodeStatuses({});
            setIsProcessing(false);
        }
    } catch (err) {
        setLogs(prev => [...prev, { type: 'error', msg: `Failed to contact MagPI Daemon: ${err.message}` }]);
        setNodeStatuses({});
        setIsProcessing(false);
    }
  };

  const handleRunUpToNode = async (targetNodeId) => {
    setShowScript(false); setShowTerminal(true); setIsProcessing(true); setNodeStatuses({});
    
    // Calculate subgraph (backward traversal)
    const activeNodes = new Set([targetNodeId]);
    let added = true;
    while(added) {
        added = false;
        connections.forEach(c => {
            if (activeNodes.has(c.to) && !activeNodes.has(c.from)) {
                activeNodes.add(c.from);
                added = true;
            }
        });
    }
    
    const subgraphNodes = nodes.filter(n => activeNodes.has(n.id));
    const subgraphConnections = connections.filter(c => activeNodes.has(c.from) && activeNodes.has(c.to));
    
    const processingStates = {};
    subgraphNodes.forEach(n => processingStates[n.id] = 'processing');
    setNodeStatuses(processingStates);
    
    setLogs([{ type: 'info', msg: `Initiating partial run up to node ${targetNodeId}...` }]);
    
    try {
        const payload = { nodes: subgraphNodes, connections: subgraphConnections, crs, globalEnv };
        const response = await fetch("http://localhost:8080/api/run_pipeline", { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await response.json();
        if (response.ok) {
            setLogs(prev => [...prev, { type: 'success', msg: `Partial Pipeline Dispatched. Job ID: ${data.job_id}` }]);
            setActiveJobId(data.job_id);
        } else {
            setLogs(prev => [...prev, { type: 'error', msg: `Daemon execution failed: ${data.error}` }]);
            setNodeStatuses({}); setIsProcessing(false);
        }
    } catch (err) {
        setLogs(prev => [...prev, { type: 'error', msg: `Failed to contact MagPI Daemon: ${err.message}` }]);
        setNodeStatuses({}); setIsProcessing(false);
    }
  };

  return (
    <div className="absolute inset-0 w-full h-full flex flex-col bg-slate-900 text-slate-200 font-sans overflow-hidden select-none">
      <div className="flex-none z-40 shadow-md">
        <TopRibbon crs={crs} setCrs={setCrs} processingScope={processingScope} setProcessingScope={setProcessingScope} onGenerate={handleGenerate} onSave={handleSave} onLoad={handleLoad} onClear={handleClear} onAutoLayout={handleAutoLayout} onOpenEnvSettings={() => setShowEnvSettings(true)} onImportENVI={handleImportENVI} />
        <div className="flex bg-slate-900 border-b border-slate-700 px-4 pt-2">
            <button onClick={() => setActiveWorkspace('planar')} className={`px-6 py-2 text-xs font-bold uppercase tracking-widest rounded-t-lg transition-colors flex items-center border border-b-0 ${activeWorkspace === 'planar' ? 'bg-slate-800 text-purple-400 border-slate-600' : 'bg-transparent text-slate-500 border-transparent hover:bg-slate-800/50 hover:text-slate-300'}`}><Edit3 size={14} className="mr-2" /> Planar Train Env</button>
            <button onClick={() => setActiveWorkspace('builder')} className={`px-6 py-2 text-xs font-bold uppercase tracking-widest rounded-t-lg transition-colors flex items-center border border-b-0 ml-1 ${activeWorkspace === 'builder' ? 'bg-slate-800 text-emerald-400 border-slate-600' : 'bg-transparent text-slate-500 border-transparent hover:bg-slate-800/50 hover:text-slate-300'}`}><Wrench size={14} className="mr-2" /> Model Builder</button>
            <button onClick={() => setActiveWorkspace('globe')} className={`px-6 py-2 text-xs font-bold uppercase tracking-widest rounded-t-lg transition-colors flex items-center border border-b-0 ml-1 ${activeWorkspace === 'globe' ? 'bg-slate-800 text-cyan-400 border-slate-600' : 'bg-transparent text-slate-500 border-transparent hover:bg-slate-800/50 hover:text-slate-300'}`}><MapIcon size={14} className="mr-2" /> Globe Nexus</button>
            <button onClick={() => setActiveWorkspace('tensor_brew')} className={`px-6 py-2 text-xs font-bold uppercase tracking-widest rounded-t-lg transition-colors flex items-center border border-b-0 ml-1 ${activeWorkspace === 'tensor_brew' ? 'bg-slate-800 text-indigo-400 border-slate-600' : 'bg-transparent text-slate-500 border-transparent hover:bg-slate-800/50 hover:text-slate-300'}`}><Layers size={14} className="mr-2" /> Tensor Brew</button>
            <button onClick={() => setActiveWorkspace('jobs')} className={`px-6 py-2 text-xs font-bold uppercase tracking-widest rounded-t-lg transition-colors flex items-center border border-b-0 ml-1 ${activeWorkspace === 'jobs' ? 'bg-slate-800 text-rose-400 border-slate-600' : 'bg-transparent text-slate-500 border-transparent hover:bg-slate-800/50 hover:text-slate-300'}`}><Activity size={14} className="mr-2" /> Job Manager</button>
        </div>
      </div>
      
      <div className="flex-1 flex overflow-hidden min-h-0 relative z-0 bg-slate-800">
        <div className={activeWorkspace === 'builder' ? 'flex-1 relative opacity-100 z-10' : 'absolute inset-0 opacity-0 pointer-events-none -z-10'}>
            <NodeCanvas nodes={nodes} setNodes={setNodes} connections={connections} setConnections={setConnections} selectedNodeId={selectedNodeId} setSelectedNodeId={setSelectedNodeId} setActiveRightTab={setActiveRightTab} nodeStatuses={nodeStatuses} removeConnection={removeConnection} addNode={addNode} />
        </div>
        <div className={`relative ${['builder', 'globe', 'planar'].includes(activeWorkspace) ? (activeWorkspace === 'builder' ? 'w-[320px] hidden lg:flex' : 'flex-1 w-full') : 'hidden'} flex-col shadow-[-10px_0_20px_rgba(0,0,0,0.3)] z-10 border-l border-r border-slate-800`}>
            <MapViewport onAoiDrawn={handleAoiDrawn} selectedNode={selectedNode} activeWorkspace={activeWorkspace} nodes={nodes} nodeStatuses={nodeStatuses} connections={connections} globalEnv={globalEnv} />
        </div>
        <div className={`w-[320px] relative ${activeWorkspace === 'builder' ? 'flex' : 'hidden'} flex-col z-20`}>
            <Toolbox activeRightTab={activeRightTab} setActiveRightTab={setActiveRightTab} selectedNode={selectedNode} updateNodeParam={updateNodeParam} updateNodeName={updateNodeName} deleteNode={deleteNode} addNode={addNode} duplicateNode={duplicateNode} openFileBrowser={openFileBrowser} nodes={nodes} connections={connections} handleRunUpToNode={handleRunUpToNode} />
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
      <EnvSettingsModal isOpen={showEnvSettings} onClose={() => setShowEnvSettings(false)} globalEnv={globalEnv} setGlobalEnv={setGlobalEnv} openFileBrowser={openFileBrowser} />
    </div>
  );
}