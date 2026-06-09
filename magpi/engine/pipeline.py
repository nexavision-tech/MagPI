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
        self.global_env = global_env
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
            arcpy.env.outputCoordinateSystem = h_datum.replace('EPSG:', '') if h_datum.startswith('EPSG:') else h_datum
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
                adj_list[c['from']].append((c['to'], c.get('sourceHandle'), c.get('targetHandle')))
                in_degree[c['to']] += 1
                
        queue = [nid for nid in in_degree if in_degree[nid] == 0]
        sorted_nodes = []
        
        while queue:
            curr = queue.pop(0)
            sorted_nodes.append(curr)
            for neighbor, src_handle, tgt_handle in adj_list[curr]:
                in_degree[neighbor] -= 1
                if in_degree[neighbor] == 0:
                    queue.append(neighbor)
                    
        return sorted_nodes, adj_list

    def _execute_single_run(self, progress_callback=None):
        """Executes the pipeline once."""
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
                
                # Check for derived outputs
                derived_paths = []
                import os
                
                # Only check for derived outputs if this is not a Load node
                if not (node.name.startswith("Input Raster") or node.name.startswith("Input Vector")):
                    def extract_paths(val):
                        if isinstance(val, str) and (val.endswith('.shp') or val.endswith('.tif') or val.endswith('.gpkg') or val.endswith('.geojson')):
                            scratch_dir = os.path.abspath(self.global_env.get('scratch_dir', './magpi_scratch'))
                            output_dir = os.path.abspath(self.global_env.get('output_dir', './magpi_output'))
                            val_abs = os.path.abspath(val)
                            if val_abs.startswith(scratch_dir) or val_abs.startswith(output_dir):
                                derived_paths.append(val_abs)
                        elif isinstance(val, list):
                            for v in val: extract_paths(v)
                        elif isinstance(val, dict):
                            for v in val.values(): extract_paths(v)
                    
                    try:
                        extract_paths(node.output)
                    except:
                        pass

                node.status = "success"
                if progress_callback: progress_callback(nid, 'success', idx + 1, len(sorted_nodes), derived=derived_paths)
                logger.info(f"Node {node.name} completed successfully.")
                
                # Pass output forward to dependent nodes
                for neighbor_id, src_handle, tgt_handle in adj_list[nid]:
                    neighbor = self.nodes[neighbor_id]
                    
                    # Extract specific output if node output is a dictionary and sourceHandle is specified
                    output_val = node.output
                    if isinstance(output_val, dict) and src_handle and src_handle != 'out':
                        output_val = output_val.get(src_handle, output_val)
                    elif src_handle and src_handle.startswith('attr_') and isinstance(output_val, str) and output_val.endswith(('.shp', '.gpkg', '.gdb', '.geojson')):
                        import geopandas as gpd
                        try:
                            # Extract the specific column array
                            col_name = src_handle.replace('attr_', '')
                            gdf = gpd.read_file(output_val)
                            if col_name in gdf.columns:
                                output_val = gdf[col_name].tolist()
                        except Exception as e:
                            logger.error(f"Failed to dynamically extract attribute {src_handle} from {output_val}: {e}")
                    
                    # Map handle to input key. Default to 'in' if no explicit port.
                    input_key = tgt_handle or "in"
                    
                    if input_key in neighbor.inputs:
                        if isinstance(neighbor.inputs[input_key], list):
                            neighbor.inputs[input_key].append(output_val)
                        else:
                            neighbor.inputs[input_key] = [neighbor.inputs[input_key], output_val]
                    else:
                        neighbor.inputs[input_key] = output_val
                    
            except Exception as e:
                logger.error(f"Execution failed for {node.name}: {e}")
                node.status = "error"
                if progress_callback: progress_callback(nid, 'error', idx + 1, len(sorted_nodes))
                return False
                
        return True
        
    def run(self, progress_callback=None):
        autopilot_enabled = self.global_env.get('autopilot_enabled', False)
        
        if not autopilot_enabled:
            return self._execute_single_run(progress_callback)
            
        start_date_str = self.global_env.get('autopilot_start_date', '2023-01-01')
        end_date_str = self.global_env.get('autopilot_end_date', '2023-12-31')
        interval_days = int(self.global_env.get('autopilot_interval', 7))
        
        from datetime import datetime, timedelta
        import os
        import magpi as arcpy
        
        try:
            start_date = datetime.strptime(start_date_str, "%Y-%m-%d")
            end_date = datetime.strptime(end_date_str, "%Y-%m-%d")
        except ValueError:
            logger.error("Invalid autopilot dates. Must be YYYY-MM-DD.")
            return False
            
        current_date = start_date
        loop_idx = 1
        
        base_workspace = self.global_env.get('workspace_dir', './magpi_workspace')
        
        while current_date <= end_date:
            week_end = current_date + timedelta(days=interval_days)
            week_str = f"Slice_{loop_idx}_{current_date.strftime('%Y%m%d')}"
            logger.info(f"--- AUTOPILOT ITERATION {loop_idx}: {current_date.strftime('%Y-%m-%d')} to {week_end.strftime('%Y-%m-%d')} ---")
            
            # Update specific nodes to the current temporal slice
            for nid, node in self.nodes.items():
                if 'start_date' in node.params:
                    node.params['start_date'] = current_date.strftime('%Y-%m-%d')
                if 'end_date' in node.params:
                    node.params['end_date'] = week_end.strftime('%Y-%m-%d')
            
            # Create a specific workspace for this temporal slice
            slice_workspace = os.path.join(base_workspace, week_str)
            os.makedirs(slice_workspace, exist_ok=True)
            arcpy.env.workspace = slice_workspace
            
            # Execute
            success = self._execute_single_run(progress_callback)
            if not success:
                logger.error(f"Autopilot slice {loop_idx} failed. Halting schedule.")
                return False
                
            current_date = week_end
            loop_idx += 1
            
        logger.info("Autopilot Schedule completed successfully across all temporal slices.")
        return True
