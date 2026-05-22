# magpi/engine/nodes/registry.py
NODE_REGISTRY = {}

def register_node(tool_id):
    """Decorator to register a node class with a specific tool_id from the GUI."""
    def decorator(cls):
        NODE_REGISTRY[tool_id] = cls
        return cls
    return decorator
