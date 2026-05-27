export const saveProject = async (nodes, connections, crs, globalEnv, projectName = "untitled_project") => {
    // Construct the payload
    const projectData = {
        version: "0.1.3",
        timestamp: new Date().toISOString(),
        crs: crs,
        globalEnv: globalEnv,
        nodes: nodes,
        connections: connections
    };

    try {
        const response = await fetch("http://localhost:8080/api/save_project", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                project_name: projectName,
                project_data: projectData
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const result = await response.json();
        console.log("Project saved to daemon:", result);
        return result;
    } catch (error) {
        console.error("Failed to save project via daemon API:", error);
        throw error;
    }
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