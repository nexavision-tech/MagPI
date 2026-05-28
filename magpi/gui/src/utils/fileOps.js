export const saveProject = (nodes, connections, crs, globalEnv, defaultName = "magpi_project") => {
    const projectData = {
        version: "0.1.3",
        timestamp: new Date().toISOString(),
        crs: crs,
        globalEnv: globalEnv,
        nodes: nodes,
        connections: connections
    };

    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `${defaultName.endsWith('.mpjx') ? defaultName : defaultName + '.mpjx'}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    return projectData;
};

export const loadProject = (file, setNodes, setConnections, setCrs, setGlobalEnv, logCallback) => {
    const reader = new FileReader();
    
    reader.onload = (event) => {
        try {
            const projectData = JSON.parse(event.target.result);
            
            // Rehydrate the React State
            if (projectData.nodes) setNodes(projectData.nodes);
            if (projectData.connections) setConnections(projectData.connections);
            if (projectData.crs) setCrs(projectData.crs);
            if (projectData.globalEnv) setGlobalEnv(projectData.globalEnv);
            
            logCallback({ type: 'success', msg: `Project loaded successfully. Rehydrated ${projectData.nodes.length} nodes.` });
        } catch (e) {
            console.error("Failed to parse project file", e);
            logCallback({ type: 'error', msg: `Failed to load project: Invalid JSON or corrupted .mpjx file.` });
        }
    };
    
    reader.readAsText(file);
};