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
        
        # Instantiate nodes
        for n_data in json_data.get('nodes', []):
            tool_id = n_data.get('toolId')
            node_class = NODE_REGISTRY.get(tool_id)
            if node_class:
                self.nodes[n_data['id']] = node_class(id=n_data['id'], name=n_data.get('name'), params=n_data.get('params'))
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

    def run(self):
        """Executes the pipeline."""
        sorted_nodes, adj_list = self.resolve_dependencies()
        logger.info(f"Executing pipeline with {len(sorted_nodes)} nodes...")
        
        for nid in sorted_nodes:
            node = self.nodes[nid]
            logger.info(f"Executing {node.name}...")
            
            if not node.validate():
                logger.error(f"Validation failed for {node.name}")
                node.status = "error"
                return False
                
            try:
                node.execute()
                node.status = "success"
                logger.info(f"Node {node.name} completed successfully.")
                
                # Pass output forward to dependent nodes
                for neighbor_id, handle in adj_list[nid]:
                    neighbor = self.nodes[neighbor_id]
                    # Map handle to input key. Default to 'in' if no explicit port.
                    input_key = handle or "in"
                    neighbor.inputs[input_key] = node.output
                    
            except Exception as e:
                logger.error(f"Execution failed for {node.name}: {e}")
                node.status = "error"
                return False
                
        return True
