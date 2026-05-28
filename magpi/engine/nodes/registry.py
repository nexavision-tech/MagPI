# magpi/engine/nodes/registry.py
import os
import sys
import importlib.util
import logging

logger = logging.getLogger("MagPI_Registry")

NODE_REGISTRY = {}
COMMUNITY_METADATA = []

def register_node(tool_id, metadata=None):
    """Decorator to register a node class with a specific tool_id from the GUI."""
    def decorator(cls):
        NODE_REGISTRY[tool_id] = cls
        if metadata:
            COMMUNITY_METADATA.append(metadata)
        return cls
    return decorator

def load_community_nodes(workspace_dir):
    """Dynamically loads all .py plugins from the community_nodes folder."""
    community_dir = os.path.join(workspace_dir, "community_nodes")
    if not os.path.exists(community_dir):
        os.makedirs(community_dir, exist_ok=True)
        return

    logger.info(f"Scanning for community plugins in {community_dir}...")
    
    for filename in os.listdir(community_dir):
        if filename.endswith(".py") and not filename.startswith("__"):
            filepath = os.path.join(community_dir, filename)
            module_name = f"magpi_community.{filename[:-3]}"
            try:
                spec = importlib.util.spec_from_file_location(module_name, filepath)
                module = importlib.util.module_from_spec(spec)
                sys.modules[module_name] = module
                spec.loader.exec_module(module)
                logger.info(f"Successfully loaded plugin: {filename}")
            except Exception as e:
                logger.error(f"Failed to load plugin {filename}: {e}")
