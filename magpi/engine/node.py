# magpi/engine/node.py
import uuid
import logging

logger = logging.getLogger("MagPI_Engine")

class Node:
    """Base class for all MagPI OOP Pipeline Nodes."""
    def __init__(self, id=None, name="BaseNode", params=None):
        self.id = id or str(uuid.uuid4())
        self.name = name
        self.params = params or {}
        self.status = "pending"
        self.inputs = {}
        self.output = None

    def validate(self):
        """Validates that all required inputs are present before execution. Can be overridden."""
        return True

    def execute(self):
        """Core logic. Must be overridden by subclasses."""
        raise NotImplementedError("Execute method not implemented.")
