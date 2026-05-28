# magpi/engine/pipeline.py
import json
import logging
from .nodes.registry import NODE_REGISTRY

logger = logging.getLogger("MagPI_Pipeline")

class PipelineRunner:
    def __init__(self):
        self.nodes = {}
        self.connections = []

    def load_from_json(self, json_data):
        if isinstance(json_data, str):
            json_data = json.loads(json_data)
            
        # 1. Apply Global Environment Context
        global_env = json_data.get('globalEnv', {})
        if global_env:
            import os
            import magpi as arcpy
            workspace = global_env.get('workspace_dir', './magpi_workspace')
            scratch = global_env.get('scratch_dir', './magpi_scratch')
            output = global_env.get('output_dir', './magpi_output')
            h_datum = global_env.get('horizontal_datum', 'EPSG:4326')
            v_datum = global_env.get('vertical_datum', 'EPSG:3855')
            
            os.environ['MAGPI_WORKSPACE'] = workspace
            os.environ['MAGPI_SCRATCH'] = scratch
            os.environ['MAGPI_OUTPUT'] = output
            os.environ['MAGPI_H_DATUM'] = h_datum
            os.environ['MAGPI_V_DATUM'] = v_datum
            
            arcpy.env.workspace = workspace
            arcpy.env.scratchWorkspace = scratch
            arcpy.env.outputWorkspace = output
            arcpy.env.horizontalDatum = h_datum
            arcpy.env.verticalDatum = v_datum
            arcpy.env.overwriteOutput = True
            
            # Ensure directories exist
            os.makedirs(workspace, exist_ok=True)
            os.makedirs(scratch, exist_ok=True)
            os.makedirs(output, exist_ok=True)
            logger.info(f"Global environments applied: {global_env}")
        
        # Instantiate nodes
        for n_data in json_data.get('nodes', []):
            tool_id = n_data.get('toolId')
            node_class = NODE_REGISTRY.get(tool_id)
            if node_class:
                # Parse complex params from GUI (e.g., {value: '...', type: 'date'})
                parsed_params = {}
                for k, v in n_data.get('params', {}).items():
                    if isinstance(v, dict) and 'value' in v:
                        parsed_params[k] = v['value']
                    else:
                        parsed_params[k] = v
                self.nodes[n_data['id']] = node_class(id=n_data['id'], name=n_data.get('name'), params=parsed_params)
            else:
                logger.warning(f"Unknown tool ID: {tool_id}. Cannot instantiate node.")
        
        self.connections = json_data.get('connections', [])
        
    def resolve_dependencies(self):
        """Sort nodes based on topological order and map dependencies."""
        adj_list = {nid: [] for nid in self.nodes}
        in_degree = {nid: 0 for nid in self.nodes}
        
        for c in self.connections:
            if c['from'] in adj_list and c['to'] in in_degree:
                adj_list[c['from']].append((c['to'], c.get('targetHandle')))
                in_degree[c['to']] += 1
                
        queue = [nid for nid in in_degree if in_degree[nid] == 0]
        sorted_nodes = []
        
        while queue:
            curr = queue.pop(0)
            sorted_nodes.append(curr)
            for neighbor, handle in adj_list[curr]:
                in_degree[neighbor] -= 1
                if in_degree[neighbor] == 0:
                    queue.append(neighbor)
                    
        return sorted_nodes, adj_list

    def run(self, progress_callback=None):
        """Executes the pipeline."""
        sorted_nodes, adj_list = self.resolve_dependencies()
        logger.info(f"Executing pipeline with {len(sorted_nodes)} nodes...")
        
        for idx, nid in enumerate(sorted_nodes):
            node = self.nodes[nid]
            logger.info(f"Executing {node.name}...")
            
            if progress_callback:
                progress_callback(nid, 'processing', idx, len(sorted_nodes))
            
            if not node.validate():
                logger.error(f"Validation failed for {node.name}")
                node.status = "error"
                if progress_callback: progress_callback(nid, 'error', idx + 1, len(sorted_nodes))
                return False
                
            try:
                node.execute()
                if hasattr(node.output, 'status') and node.output.status == 3:
                    logger.error(f"Execution failed for {node.name}: Internal Tool Error")
                    node.status = "error"
                    if progress_callback: progress_callback(nid, 'error', idx + 1, len(sorted_nodes))
                    return False
                
                node.status = "success"
                if progress_callback: progress_callback(nid, 'success', idx + 1, len(sorted_nodes))
                logger.info(f"Node {node.name} completed successfully.")
                
                # Pass output forward to dependent nodes
                for neighbor_id, handle in adj_list[nid]:
                    neighbor = self.nodes[neighbor_id]
                    # Map handle to input key. Default to 'in' if no explicit port.
                    input_key = handle or "in"
                    
                    if input_key in neighbor.inputs:
                        if isinstance(neighbor.inputs[input_key], list):
                            neighbor.inputs[input_key].append(node.output)
                        else:
                            neighbor.inputs[input_key] = [neighbor.inputs[input_key], node.output]
                    else:
                        neighbor.inputs[input_key] = node.output
                    
            except Exception as e:
                logger.error(f"Execution failed for {node.name}: {e}")
                node.status = "error"
                if progress_callback: progress_callback(nid, 'error', idx + 1, len(sorted_nodes))
                return False
                
        return True
