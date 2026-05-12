# magpi/env.py
import threading

class ThreadSafeMeta(type):
    """
    Metaclass to ensure the EnvironmentSettings acts as a thread-safe Singleton.
    Each execution thread gets its own isolated state instance.
    """
    _local_state = threading.local()

    def __call__(cls, *args, **kwargs):
        if not hasattr(cls._local_state, "instance"):
            cls._local_state.instance = super(ThreadSafeMeta, cls).__call__(*args, **kwargs)
        return cls._local_state.instance

class EnvironmentSettings(metaclass=ThreadSafeMeta):
    """
    MagPI equivalent of arcpy.env. 
    Manages global geoprocessing state safely across parallel workflows.
    """
    def __init__(self):
        self._workspace = None
        self.scratchWorkspace = None
        self.overwriteOutput = False
        self.outputCoordinateSystem = None
        self.snapRaster = None
        self.extent = None

    @property
    def workspace(self):
        return self._workspace

    @workspace.setter
    def workspace(self, path):
        # We can add GDAL 3.6+ validation here later to check if it's a valid open format or .gdb
        self._workspace = path

# Instantiate the singleton so it can be imported directly as 'env'
env = EnvironmentSettings()