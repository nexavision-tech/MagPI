import React, { useState, useCallback, useEffect } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { GitBranch, XCircle, AlertTriangle, Bell, TerminalSquare, Save, Map as MapIcon, Edit3, Wrench, Layers, Activity, Database, Satellite } from 'lucide-react';
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
import DataStudio from './components/DataStudio';
import CatalogPane from './components/CatalogPane';
import WorkflowWorkspace from './components/WorkflowWorkspace';
import { generatePythonScript } from './utils/scriptGen';
import { generateAirflowDAG } from './utils/airflowGen';
import { saveProject, loadProject } from './utils/fileOps';
import { featuresMatch } from './utils/featureMatch';

export default function App() {
  const [activeWorkspace, setActiveWorkspace] = useState('builder');
  const [crs, setCrs] = useState("EPSG:4326");
  const [processingScope, setProcessingScope] = useState("Local Python");
  
  const [globalEnv, setGlobalEnv] = useState({
    workspace_dir: "/home/gda/MagPI/magpi_workspace",
    scratch_dir: "/home/gda/MagPI/magpi_workspace/magpi_scratch",
    output_dir: "/home/gda/MagPI/magpi_workspace/magpi_output",
    horizontal_datum: "EPSG:4326",
    vertical_datum: "EPSG:3855",
    external_dirs: []
  });
  const [showEnvSettings, setShowEnvSettings] = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [activeProfile, setActiveProfile] = useState(null);
  
  const activeRole = profiles.find(p => p.id === activeProfile)?.role || 'analyst';

  const [nodes, setNodes] = useState([]);
  const [connections, setConnections] = useState([]);
  
  const [activeRightTab, setActiveRightTab] = useState('toolbox');
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [explicitRender, setExplicitRender] = useState(null);
  const [selectedFeatures, setSelectedFeatures] = useState([]);

  useEffect(() => {
     const handleSelect = (e) => {
         setSelectedFeatures(prev => {
             if (!e.detail) return prev.length === 0 ? prev : [];
             
             if (e.detail.shiftKey || e.detail.ctrlKey) {
                 const exists = prev.find(f => f?.nodeId === e.detail.nodeId && featuresMatch(f?.feature?.properties, e.detail.feature?.properties));
                 if (exists) {
                     // If it's a marquee drag, it should strictly ADD to the selection, not toggle it off if it already exists
                     if (e.detail.isMarquee) {
                         return prev; // Already selected, don't remove it
                     }
                     return prev.filter(f => !(f?.nodeId === e.detail.nodeId && featuresMatch(f?.feature?.properties, e.detail.feature?.properties)));
                 } else {
                     return [...prev, e.detail];
                 }
             } else {
                 // For single select, if clicking the EXACT same feature, toggle it off
                 if (prev.length === 1 && prev[0]?.nodeId === e.detail.nodeId && featuresMatch(prev[0]?.feature?.properties, e.detail.feature?.properties)) {
                     return [];
                 }
                 return [e.detail];
             }
         });
     };
     window.addEventListener('magpi-feature-selected', handleSelect);
     return () => window.removeEventListener('magpi-feature-selected', handleSelect);
  }, []);

  // Separate side-effect for opening Identify Tab on feature select
  useEffect(() => {
      if (selectedFeatures && selectedFeatures.length > 0) {
          setActiveRightTab('identify');
          if (selectedFeatures[0]?.nodeId) {
              setSelectedNodeId(selectedFeatures[0].nodeId);
          }
          setShowTerminal(true);
          // Data Studio auto-popup disabled based on user feedback
      } else {
          setActiveRightTab('toolbox');
      }
  }, [selectedFeatures]);

  const [showScript, setShowScript] = useState(false);
  const [generatedCode, setGeneratedCode] = useState("");
  const [showTerminal, setShowTerminal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState([]);
  const [nodeStatuses, setNodeStatuses] = useState({});
  const [activeJobId, setActiveJobId] = useState(null);
  const [isDaemonAlive, setIsDaemonAlive] = useState(false);
  const [projectName, setProjectName] = useState(() => {
    const d = new Date();
    const pad = n => n.toString().padStart(2, '0');
    return `Untitled_${d.getFullYear()}_${pad(d.getMonth() + 1)}_${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  });

  const [projectDir, setProjectDir] = useState(null);
  const [autoZoom, setAutoZoom] = useState(false);
  const [interactionMode, setInteractionMode] = useState('nav'); // 'nav' | 'select'
  const [saveBrowserConfig, setSaveBrowserConfig] = useState({ isOpen: false, initialPath: "." });
  const [masterReferences, setMasterReferences] = useState({});
  const [masterGisServers, setMasterGisServers] = useState([]);
  const [mapLayers, setMapLayers] = useState([
    { id: 'base', name: 'Base Map (OSM)', visible: true, opacity: 100, isBase: true }
  ]);
  
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: "", message: "", confirmText: "OK", onConfirm: null, onCancel: null });
  const [promptDialog, setPromptDialog] = useState({ isOpen: false, title: "", message: "", defaultValue: "", confirmText: "OK", onConfirm: null, onCancel: null });

  // Keep mapLayers synced with node outputs
  useEffect(() => {
    setMapLayers(prev => {
        const baseLayer = prev.find(l => l.id === 'base') || { id: 'base', name: 'Base Map (OSM)', visible: true, opacity: 100, isBase: true };
        const extractedLayers = [];
        
        nodes.forEach(node => {
            if (node.params && node.params.export_to_map === false) return;
            
            const status = nodeStatuses[node.id];
            if (status === 'success' || node.toolId.startsWith('load_') || node.toolId === 'core_extent' || node.toolId === 'core_fishnet' || node.toolId.startsWith('wfs_') || node.toolId.startsWith('core_input_')) {
                let layerName = node.name || node.toolId;
                if (node.params && node.params.out_raster) {
                    layerName = `${node.name} (${node.params.out_raster})`;
                } else if (node.params && node.params.file_path) {
                    layerName = `${node.name} (${node.params.file_path.split('/').pop()})`;
                }
                
                const existingLayer = prev.find(l => l.id === node.id);
                extractedLayers.push({
                    id: node.id,
                    name: layerName,
                    visible: existingLayer ? existingLayer.visible : true,
                    opacity: existingLayer ? existingLayer.opacity : 100,
                    isBase: false,
                    vectorColor: existingLayer ? existingLayer.vectorColor : undefined,
                    cmap: existingLayer ? existingLayer.cmap : undefined
                });
            }
        });

        // Preserve Z-Stack Order!
        const prevOrder = prev.map(l => l.id);
        extractedLayers.sort((a, b) => {
            const indexA = prevOrder.indexOf(a.id);
            const indexB = prevOrder.indexOf(b.id);
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            return 0;
        });

        const newLayers = [baseLayer, ...extractedLayers];
        
        // Deep compare to avoid unnecessary re-renders
        const isDifferent = JSON.stringify(prev) !== JSON.stringify(newLayers);
        return isDifferent ? newLayers : prev;
    });
  }, [nodes, nodeStatuses]);

  useEffect(() => {
    fetch(`http://${window.location.hostname}:${window.MAGPI_PORT || '8282'}/api/references`)
      .then(res => res.json())
      .then(data => {
        if (data.status === 'success' && data.references) {
          setMasterReferences(data.references);
        }
      })
      .catch(err => console.error("Failed to load academic references", err));
      
    fetch(`http://${window.location.hostname}:${window.MAGPI_PORT || '8282'}/api/gis_servers`)
      .then(res => res.json())
      .then(data => {
        if (data.status === 'success' && data.servers) {
          setMasterGisServers(data.servers);
        }
      })
      .catch(err => console.error("Failed to load GIS servers", err));
      
    fetch(`http://${window.location.hostname}:${window.MAGPI_PORT || '8282'}/api/profiles`)
      .then(res => res.json())
      .then(data => {
        if (data.status === 'success' && data.profiles) {
          setProfiles(data.profiles);
          setActiveProfile(data.current_profile_id);
        }
      })
      .catch(err => console.error("Failed to load profiles", err));
  }, []);

  const handleProfileChange = async (profileId) => {
    try {
      const response = await fetch(`http://${window.location.hostname}:${window.MAGPI_PORT || '8282'}/api/profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile_id: profileId })
      });
      if (response.ok) {
        setActiveProfile(profileId);
      }
    } catch (e) {
      console.error("Failed to set profile", e);
    }
  };

  // --- JOB POLLING ENGINE ---
  useEffect(() => {
    let interval;
    if (activeJobId) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`http://${window.location.hostname}:${window.MAGPI_PORT || '8282'}/api/jobs`);
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
                    setLogs([{ type: 'info', msg: 'Initiating Daemon Link on port 8282...' }, { type: 'info', msg: `Pipeline Dispatched to Daemon. Job ID: ${job.id}` }, ...parsedLogs]);
                }
                
                if (job.status === 'Finished' || job.status === 'Failed') {
                    setActiveJobId(null);
                    setIsProcessing(false);
                    
                    if (job.status === 'Finished' && job.derived_outputs && job.derived_outputs.length > 0) {
                        setNodes(nds => {
                            let updatedNodes = false;
                            const newNds = nds.map(n => {
                                const derived = job.derived_outputs.find(d => d.node_id === n.id);
                                if (derived) {
                                    updatedNodes = true;
                                    const pathKey = derived.path.endsWith('.tif') ? 'out_raster' : 'file_path';
                                    return { ...n, params: { ...n.params, [pathKey]: derived.path } };
                                }
                                return n;
                            });
                            return updatedNodes ? newNds : nds;
                        });
                    }
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
              const res = await fetch(`http://${window.location.hostname}:${window.MAGPI_PORT || '8282'}/api/jobs`);
              if (res.ok) {
                  setIsDaemonAlive(true);
                  const jobs = await res.json();
                  const activeJob = jobs.find(j => j.status !== 'Finished' && j.status !== 'Failed');
                  if (activeJob) {
                      setActiveJobId(activeJob.id);
                      setIsProcessing(true);
                      setLogs(prev => [...prev, { type: 'success', msg: `Reconnected to running Daemon Job: ${activeJob.id}` }]);
                  }
              } else {
                  setIsDaemonAlive(false);
              }
          } catch (e) {
              setIsDaemonAlive(false);
          }
      };
      checkActiveJobs();
      const heartbeat = setInterval(checkActiveJobs, 3000);
      return () => clearInterval(heartbeat);
  }, []);

  const [browserConfig, setBrowserConfig] = useState({ isOpen: false, nodeId: null, paramKey: null, initialPath: "." });

  // --- UI LAYOUT FIX ---
  // Fixes Leaflet/ReactFlow Map getting stuck at 0x0 size when switching tabs due to 'display: hidden'
  useEffect(() => {
    setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
  }, [activeWorkspace]);

  useEffect(() => {
    const handleMapDrop = (e) => {
        const data = e.detail;
        if (!data || !data.id) return;
        
        const newNode = {
            id: `node_${Date.now()}`,
            toolId: data.id,
            name: data.name,
            icon: data.icon,
            x: 400 + Math.random() * 50,
            y: 200 + Math.random() * 50,
            color: data.color || 'bg-slate-600',
            border: data.border || 'border-slate-500',
            params: { ...(data.params || data.defaultParams || {}), export_to_map: true }
        };

        if (data.droppedFilePath) {
             const key = Object.keys(newNode.params).find(k => k.includes('file') || k.includes('path') || k.includes('image'));
             if (key) {
                 newNode.params[key] = data.droppedFilePath;
             }
        }
        
        setNodes(prev => [...prev, newNode]);
        setSelectedNodeId(newNode.id);
        setActiveRightTab('inspector');
    };
    
    const handleLog = (e) => {
        setLogs(prev => [...prev, e.detail]);
    };
    
    const handleRenderFishnet = (e) => {
        setExplicitRender({ bbox: e.detail.bbox, sourceLayerId: e.detail.sourceLayerId || null });
    };

    window.addEventListener('magpi-map-drop', handleMapDrop);
    window.addEventListener('magpi-log', handleLog);
    window.addEventListener('magpi-render-fishnet', handleRenderFishnet);
    
    return () => {
        window.removeEventListener('magpi-map-drop', handleMapDrop);
        window.removeEventListener('magpi-log', handleLog);
        window.removeEventListener('magpi-render-fishnet', handleRenderFishnet);
    };
  }, []);

  // --- AUTO-SAVE ENGINE (Prevents Losing Work!) ---
  useEffect(() => {
    // Listen for unlink requests from CatalogPane
    const handleUnlink = (e) => {
        const { path } = e.detail;
        setGlobalEnv(prev => ({...prev, external_dirs: (prev.external_dirs || []).filter(p => p !== path)}));
    };
    window.addEventListener('magpi-unlink-external', handleUnlink);
    
    // Load from LocalStorage on initial boot
    const savedNodes = localStorage.getItem('magpi_autosave_nodes');
    const savedCxs = localStorage.getItem('magpi_autosave_cxs');
    const savedEnv = localStorage.getItem('magpi_global_env');
    if (savedEnv) {
        try { setGlobalEnv(JSON.parse(savedEnv)); } catch (e) {}
    }
    if (savedNodes && savedCxs) {
        try {
            const parsedNodes = JSON.parse(savedNodes);
            if (parsedNodes.length > 0) {
                setConfirmDialog({
                    isOpen: true,
                    title: "Matrix Session Found",
                    message: "A previous Matrix session was detected. Would you like to restore your workspace?",
                    confirmText: "Restore Session",
                    onConfirm: () => {
                        setNodes(parsedNodes);
                        setConnections(JSON.parse(savedCxs));
                        setLogs([{ type: 'success', msg: 'Previous matrix state restored.' }]);
                        setShowTerminal(true);
                        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
                    },
                    onCancel: () => {
                        localStorage.removeItem('magpi_autosave_nodes');
                        localStorage.removeItem('magpi_autosave_cxs');
                        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
                    }
                });
            }
        } catch (e) { console.error("Failed to restore matrix state."); }
    }
  }, []);

  useEffect(() => {
    // Save to LocalStorage whenever the matrix changes (even if empty)
    localStorage.setItem('magpi_autosave_nodes', JSON.stringify(nodes));
    localStorage.setItem('magpi_autosave_cxs', JSON.stringify(connections));
    localStorage.setItem('magpi_global_env', JSON.stringify(globalEnv));
  }, [nodes, connections, globalEnv]);

  useEffect(() => {
    const handleKeyDown = (e) => {
        if (e.key === 'Delete' && selectedNodeId) {
            const activeElement = document.activeElement;
            if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.isContentEditable)) {
                return;
            }
            if (window.confirm("Delete selected node?")) {
                setNodes(prev => prev.filter(n => n.id !== selectedNodeId));
                setConnections(prev => prev.filter(c => c.sourceId !== selectedNodeId && c.targetId !== selectedNodeId));
                setSelectedNodeId(null);
                setLogs([{ type: 'info', msg: 'Node deleted via keyboard shortcut.' }]);
            }
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeId]);

  const handleAoiDrawn = useCallback((aoiData) => {
    const newId = `node_${Date.now()}`;
    const newNode = { 
        id: newId, toolId: 'core_extent', name: 'Spatial Extent (AOI)', icon: 'core_extent', 
        x: 400 + Math.random() * 50, y: 200 + Math.random() * 50, color: 'bg-yellow-600', border: 'border-yellow-500', 
        params: { xmin: aoiData.xmin, ymin: aoiData.ymin, xmax: aoiData.xmax, ymax: aoiData.ymax } 
    };
    setNodes(prev => [...prev, newNode]);
    setSelectedNodeId(newId);
    setActiveRightTab('inspector');
  }, []);

  const handleAoiImported = useCallback((bounds, filename) => {
    const newNode = { 
      id: `node_${Date.now()}`, toolId: 'core_extent', name: `AOI: ${filename}`, icon: 'core_extent', 
      x: 400 + Math.random() * 50, y: 200 + Math.random() * 50, color: 'bg-yellow-600', border: 'border-yellow-500', 
      params: { xmin: bounds.xmin, ymin: bounds.ymin, xmax: bounds.xmax, ymax: bounds.ymax } 
    };
    setNodes(prev => [...prev, newNode]);
    setSelectedNodeId(newNode.id);
    setSelectedNodeId(newNode.id);
    setActiveRightTab('inspector');
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
    const newNodeId = `node_${Date.now()}`;
    const newNode = { 
      id: newNodeId, toolId: tool.id, name: tool.name, icon: tool.id, 
      x: dropX !== null ? dropX : 300 + Math.random() * 50, y: dropY !== null ? dropY : 200 + Math.random() * 50, 
      color: tool.color, border: tool.border, params: { export_to_map: false, ...tool.params },
      inputs: tool.inputs ? [...tool.inputs] : undefined,
      outputs: tool.outputs ? [...tool.outputs] : undefined,
      reference_keys: tool.reference_keys ? [...tool.reference_keys] : undefined
    };
    setNodes(prev => [...prev, newNode]);
    setSelectedNodeId(newNode.id);
    setActiveRightTab('inspector');
    return newNodeId;
  }, []);

  const addConnection = useCallback((source, target, sourceHandle = 'out', targetHandle = 'in') => {
      setConnections(prev => [...prev, {
          from: source,
          to: target,
          sourceHandle: sourceHandle,
          targetHandle: targetHandle
      }]);
  }, []);

  const updateNodeParam = (nodeId, paramKey, value) => {
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, params: { ...n.params, [paramKey]: value } } : n));
  };

  const openFileBrowser = (nodeId, paramKey, currentPath) => {
    let defaultPath = currentPath;
    if (!defaultPath || defaultPath === "." || defaultPath === "./") {
        defaultPath = globalEnv?.workspace || ".";
    }
    setBrowserConfig({ isOpen: true, nodeId, paramKey, initialPath: defaultPath });
  };

  const handleFileSelected = async (absolutePath) => {
    if (browserConfig.nodeId === "LOAD_PROJECT") {
        try {
            setLogs([{ type: 'info', msg: `Loading project from ${absolutePath}...` }]);
            const response = await fetch(`http://${window.location.hostname}:${window.MAGPI_PORT || '8282'}/api/load_project?file=${encodeURIComponent(absolutePath)}`);
            const data = await response.json();
            if (response.ok && data.status === 'success') {
                const pd = data.project_data;
                if (pd.nodes) setNodes(pd.nodes);
                if (pd.connections) setConnections(pd.connections);
                if (pd.crs) setCrs(pd.crs);
                if (pd.globalEnv) setGlobalEnv(pd.globalEnv);
                const pName = absolutePath.split('/').pop().replace(/\.[^/.]+$/, "");
                const pDir = absolutePath.substring(0, absolutePath.lastIndexOf('/'));
                setProjectName(pName);
                setProjectDir(pDir);
                setLogs([{ type: 'success', msg: `Project loaded successfully. Rehydrated ${pd.nodes?.length || 0} nodes.` }]);
                setNodeStatuses({});
                setShowTerminal(true);
            } else {
                throw new Error(data.error || "Unknown error loading project from daemon.");
            }
        } catch (e) {
            setLogs([{ type: 'error', msg: `Failed to load project: ${e.message}` }]);
            setShowTerminal(true);
        }
    } else if (browserConfig.nodeId === "env" && browserConfig.paramKey === "external_dirs_append") {
        setGlobalEnv(prev => ({ ...prev, external_dirs: [...(prev.external_dirs || []), absolutePath] }));
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
    setConfirmDialog({
        isOpen: true,
        title: "New Project",
        message: "Are you sure you want to initialize a New Project? This will clear the current canvas. Unsaved changes will be lost.",
        confirmText: "Start Fresh",
        onConfirm: () => {
            setConfirmDialog(prev => ({ ...prev, isOpen: false }));
            
            const d = new Date();
            const pad = n => n.toString().padStart(2, '0');
            const defaultName = `Untitled_${d.getFullYear()}_${pad(d.getMonth() + 1)}_${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
            
            setPromptDialog({
                isOpen: true,
                title: "Name Project",
                message: "Enter a name for the New Project:",
                defaultValue: defaultName,
                confirmText: "Create",
                onConfirm: (newName) => {
                    setPromptDialog(prev => ({ ...prev, isOpen: false }));
                    setNodes([]); setConnections([]); setSelectedNodeId(null); setNodeStatuses({});
                    localStorage.removeItem('magpi_autosave_nodes'); localStorage.removeItem('magpi_autosave_cxs');
                    setActiveRightTab('toolbox'); setLogs([{ type: 'info', msg: `Started a new Tabula Rasa session: ${newName}` }]);
                    setShowTerminal(true);
                    setProjectDir(null);
                    setProjectName(newName || defaultName);
                },
                onCancel: () => setPromptDialog(prev => ({ ...prev, isOpen: false }))
            });
        },
        onCancel: () => setConfirmDialog(prev => ({ ...prev, isOpen: false }))
    });
  };

  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  const handleSave = async () => {
    if (projectDir) {
        try {
            setLogs([{ type: 'info', msg: `Quick saving project...` }]);
            await saveProject(nodes, connections, crs, globalEnv, projectName, projectDir);
            setLogs([{ type: 'success', msg: `Project quickly saved to ${projectDir} as ${projectName}.mpjx` }]);
        } catch (e) {
            setLogs([{ type: 'error', msg: `Failed to quick save project: ${e.message}` }]);
            setShowTerminal(true);
        }
    } else {
        setSaveBrowserConfig({ isOpen: true, initialPath: globalEnv.workspace_dir || "." });
    }
  };

  const handleSaveConfirm = async (saveData) => {
    const { dir, name } = saveData;
    const pName = name;
    setProjectName(pName);
    setProjectDir(dir);
    try {
        await saveProject(nodes, connections, crs, globalEnv, pName, dir);
        setLogs([{ type: 'success', msg: `Project successfully saved to ${dir} as ${pName}.mpjx` }]);
    } catch (e) {
        setLogs([{ type: 'error', msg: `Failed to save project: ${e.message}` }]);
        setShowTerminal(true);
    }
  };

  const handleLoad = () => {
    setBrowserConfig({ isOpen: true, nodeId: "LOAD_PROJECT", initialPath: globalEnv.workspace_dir || "." });
  };

  const handleAutoLayout = () => {
    if (nodes.length === 0) return;
    
    if (window.dagre) {
        try {
            const g = new window.dagre.graphlib.Graph();
            g.setGraph({ rankdir: 'LR', align: 'UL', ranksep: 250, nodesep: 100 });
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
    setLogs([{ type: 'info', msg: 'Initiating Daemon Link on port 8282...' }, { type: 'info', msg: 'Transmitting payload to OS kernel...' }]);
    try {
        const payload = {
            nodes,
            connections,
            crs,
            globalEnv
        };
        const response = await fetch(`http://${window.location.hostname}:${window.MAGPI_PORT || '8282'}/api/run_pipeline`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
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
        const response = await fetch(`http://${window.location.hostname}:${window.MAGPI_PORT || '8282'}/api/run_pipeline`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
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
        <TopRibbon activeWorkspace={activeWorkspace} globalEnv={globalEnv} setGlobalEnv={setGlobalEnv} crs={crs} setCrs={setCrs} processingScope={processingScope} setProcessingScope={setProcessingScope} onGenerate={handleGenerate} onSave={handleSave} onLoad={handleLoad} onClear={handleClear} onAutoLayout={handleAutoLayout} onOpenEnvSettings={() => setShowEnvSettings(true)} onImportENVI={handleImportENVI} isDaemonAlive={isDaemonAlive} projectName={projectName} profiles={profiles} activeProfile={activeProfile} activeRole={activeRole} onProfileChange={handleProfileChange} interactionMode={interactionMode} setInteractionMode={setInteractionMode} />
        <div className="flex bg-slate-900 border-b border-slate-700 px-4 pt-2">
            <button onClick={() => setActiveWorkspace('planar')} className={`px-6 py-2 text-xs font-bold uppercase tracking-widest rounded-t-lg transition-colors flex items-center border border-b-0 ${activeWorkspace === 'planar' ? 'bg-slate-800 text-purple-400 border-slate-600' : 'bg-transparent text-slate-500 border-transparent hover:bg-slate-800/50 hover:text-slate-300'}`}><Edit3 size={14} className="mr-2" /> Planar View</button>
            <button onClick={() => setActiveWorkspace('builder')} className={`px-6 py-2 text-xs font-bold uppercase tracking-widest rounded-t-lg transition-colors flex items-center border border-b-0 ml-1 ${activeWorkspace === 'builder' ? 'bg-slate-800 text-emerald-400 border-slate-600' : 'bg-transparent text-slate-500 border-transparent hover:bg-slate-800/50 hover:text-slate-300'}`}><Wrench size={14} className="mr-2" /> Model Builder</button>
            <button onClick={() => setActiveWorkspace('flow')} className={`px-6 py-2 text-xs font-bold uppercase tracking-widest rounded-t-lg transition-colors flex items-center border border-b-0 ml-1 ${activeWorkspace === 'flow' ? 'bg-slate-800 text-emerald-400 border-slate-600' : 'bg-transparent text-slate-500 border-transparent hover:bg-slate-800/50 hover:text-slate-300'}`}><Activity size={14} className="mr-2" /> Flow</button>
            <button onClick={() => setActiveWorkspace('globe')} className={`px-6 py-2 text-xs font-bold uppercase tracking-widest rounded-t-lg transition-colors flex items-center border border-b-0 ml-1 ${activeWorkspace === 'globe' ? 'bg-slate-800 text-cyan-400 border-slate-600' : 'bg-transparent text-slate-500 border-transparent hover:bg-slate-800/50 hover:text-slate-300'}`}><MapIcon size={14} className="mr-2" /> Scene View</button>
            <button onClick={() => setActiveWorkspace('tensor_brew')} className={`px-6 py-2 text-xs font-bold uppercase tracking-widest rounded-t-lg transition-colors flex items-center border border-b-0 ml-1 ${activeWorkspace === 'tensor_brew' ? 'bg-slate-800 text-indigo-400 border-slate-600' : 'bg-transparent text-slate-500 border-transparent hover:bg-slate-800/50 hover:text-slate-300'}`}><Layers size={14} className="mr-2" /> Tensor Brew</button>
            <button onClick={() => setActiveWorkspace('jobs')} className={`px-6 py-2 text-xs font-bold uppercase tracking-widest rounded-t-lg transition-colors flex items-center border border-b-0 ml-1 ${activeWorkspace === 'jobs' ? 'bg-slate-800 text-rose-400 border-slate-600' : 'bg-transparent text-slate-500 border-transparent hover:bg-slate-800/50 hover:text-slate-300'}`}><Activity size={14} className="mr-2" /> Job Manager</button>
        </div>
      </div>
      
      <ReactFlowProvider>
        <div className="flex-1 flex overflow-hidden min-h-0 relative z-0 bg-slate-800">
          
          {/* Render Catalog Pane when in Builder or Planar */}
            <div className={`relative ${['builder', 'planar', 'flow'].includes(activeWorkspace) ? 'flex' : 'hidden'} flex-col z-20`}>
              <CatalogPane 
                  mapLayers={mapLayers} 
                  setMapLayers={setMapLayers} 
                  reorderLayers={(startIndex, endIndex) => {
                    setMapLayers(prev => {
                        const result = Array.from(prev);
                        const [removed] = result.splice(startIndex, 1);
                        result.splice(endIndex, 0, removed);
                        return result;
                    });
                }}
                activeWorkspace={activeWorkspace}
                nodes={nodes}
                connections={connections}
                setNodes={setNodes}
                selectedNodeId={selectedNodeId}
                setSelectedNodeId={setSelectedNodeId}
                openFileBrowser={openFileBrowser}
                globalEnv={globalEnv}
                isDaemonAlive={isDaemonAlive}
                autoZoom={autoZoom}
                setAutoZoom={setAutoZoom}
                selectedFeatures={selectedFeatures}
                interactionMode={interactionMode}
            />
          </div>

        <div className={activeWorkspace === 'builder' ? 'flex-1 relative opacity-100 z-10' : 'absolute inset-0 opacity-0 pointer-events-none -z-10'}>
            <NodeCanvas nodes={nodes} setNodes={setNodes} connections={connections} setConnections={setConnections} selectedNodeId={selectedNodeId} setSelectedNodeId={setSelectedNodeId} setActiveRightTab={setActiveRightTab} nodeStatuses={nodeStatuses} removeConnection={removeConnection} addNode={addNode} />
        </div>
        <div className={`relative ${['globe', 'planar'].includes(activeWorkspace) ? 'flex-1 w-full min-w-0' : 'hidden'} flex-col shadow-[-10px_0_20px_rgba(0,0,0,0.3)] z-10 border-l border-r border-slate-800`}>
            <MapViewport onAoiDrawn={handleAoiDrawn} onAoiImported={handleAoiImported} selectedNode={nodes.find(n => n.id === selectedNodeId)} activeWorkspace={activeWorkspace} nodes={nodes} nodeStatuses={nodeStatuses} connections={connections} globalEnv={globalEnv} mapLayers={mapLayers} autoZoom={autoZoom} selectedFeatures={selectedFeatures} setSelectedFeatures={setSelectedFeatures} interactionMode={interactionMode} />
        </div>
        <div className={`w-[320px] shrink-0 relative ${['builder', 'planar'].includes(activeWorkspace) ? 'flex' : 'hidden'} flex-col z-20`}>
            <Toolbox 
            addNode={addNode}
            addConnection={addConnection}
            activeRightTab={activeRightTab} 
            setActiveRightTab={setActiveRightTab} 
            selectedNode={selectedNode}
            updateNodeParam={updateNodeParam}
            updateNodeName={updateNodeName}
            duplicateNode={duplicateNode}
            deleteNode={deleteNode}
            openFileBrowser={openFileBrowser}
            handleRunUpToNode={handleRunUpToNode}
            connections={connections}
            nodes={nodes}
            masterReferences={masterReferences}
            masterGisServers={masterGisServers}
            selectedFeatures={selectedFeatures}
            setSelectedFeatures={setSelectedFeatures}
          />
        </div>
        
        {/* Render Flow Workspace Fullscreen when Active */}
        <div className={`absolute inset-0 z-50 ${activeWorkspace === 'flow' ? 'block' : 'hidden'} bg-slate-900`}>
            <WorkflowWorkspace />
        </div>
        
        {/* Render Tensor Brew Fullscreen when Active */}
        <div className={`absolute inset-0 z-50 ${activeWorkspace === 'tensor_brew' ? 'block' : 'hidden'}`}>
            <TensorBrew activeWorkspace={activeWorkspace} />
        </div>
        
        {/* Render Job Manager Fullscreen when Active */}
        <div className={`absolute inset-0 z-50 ${activeWorkspace === 'jobs' ? 'block' : 'hidden'}`}>
            <JobManager activeWorkspace={activeWorkspace} />
        </div>
        
        {/* Render DB Studio Fullscreen when Active */}
        <div className={`absolute inset-0 z-50 ${activeWorkspace === 'dbstudio' ? 'block' : 'hidden'}`}>
            <DataStudio />
        </div>
      </div>
      </ReactFlowProvider>

      <div className="flex-none z-30"><Terminal showTerminal={showTerminal} setShowTerminal={setShowTerminal} logs={logs} isProcessing={isProcessing} selectedNode={selectedNode} selectedFeatures={selectedFeatures} explicitRender={explicitRender} /></div>
      
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
      <FileBrowserModal isOpen={saveBrowserConfig.isOpen} onClose={() => setSaveBrowserConfig(prev => ({ ...prev, isOpen: false }))} onSelect={handleSaveConfirm} initialPath={saveBrowserConfig.initialPath} isSaveMode={true} defaultSaveName={projectName} />
      <EnvSettingsModal isOpen={showEnvSettings} onClose={() => setShowEnvSettings(false)} globalEnv={globalEnv} setGlobalEnv={setGlobalEnv} openFileBrowser={openFileBrowser} />
      
      {/* Custom Confirm Dialog */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] backdrop-blur-sm px-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-6 max-w-md w-full shadow-2xl flex flex-col">
            <h2 className="text-lg font-bold text-slate-200 mb-3 flex items-center">
                <AlertTriangle size={18} className="mr-2 text-yellow-500" />
                {confirmDialog.title}
            </h2>
            <p className="text-slate-400 text-sm mb-6">{confirmDialog.message}</p>
            <div className="flex justify-end space-x-3">
              <button onClick={confirmDialog.onCancel} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold uppercase rounded border border-slate-600 transition-colors">Cancel</button>
              <button onClick={confirmDialog.onConfirm} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold uppercase rounded border border-emerald-500 transition-colors shadow-lg shadow-emerald-900/50">{confirmDialog.confirmText}</button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Prompt Dialog */}
      {promptDialog.isOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] backdrop-blur-sm px-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-6 max-w-md w-full shadow-2xl flex flex-col">
            <h2 className="text-lg font-bold text-slate-200 mb-3 flex items-center">
                <Edit3 size={18} className="mr-2 text-blue-400" />
                {promptDialog.title}
            </h2>
            <p className="text-slate-400 text-sm mb-4">{promptDialog.message}</p>
            <input 
                type="text" 
                defaultValue={promptDialog.defaultValue}
                id="magpi_custom_prompt_input"
                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 mb-6 focus:outline-none focus:border-blue-500"
                autoFocus
                onKeyDown={(e) => {
                    if (e.key === 'Enter') promptDialog.onConfirm(e.target.value);
                    if (e.key === 'Escape') promptDialog.onCancel();
                }}
            />
            <div className="flex justify-end space-x-3">
              <button onClick={promptDialog.onCancel} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold uppercase rounded border border-slate-600 transition-colors">Cancel</button>
              <button onClick={() => promptDialog.onConfirm(document.getElementById('magpi_custom_prompt_input').value)} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold uppercase rounded border border-blue-500 transition-colors shadow-lg shadow-blue-900/50">{promptDialog.confirmText}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}