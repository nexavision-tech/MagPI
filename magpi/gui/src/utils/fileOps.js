export const saveProject = (nodes, connections, crs, globalEnv, projectName = "MagPI_Project") => {
    // Construct the payload
    const projectData = {
        version: "0.1.3",
        timestamp: new Date().toISOString(),
        crs: crs,
        globalEnv: globalEnv,
        nodes: nodes,
        connections: connections
    };

    // Convert to a JSON string and create a downloadable blob
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(projectData, null, 2));
    
    // Create a temporary hidden link in the browser to trigger the download
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", projectName + ".mpjx");
    
    document.body.appendChild(downloadAnchorNode); // required for firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
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