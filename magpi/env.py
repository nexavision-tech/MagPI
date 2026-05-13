# magpi/env.py
import logging

logger = logging.getLogger("MagPI_Env")

class ArcPyEnvironment:
    """
    MagPI Translation of arcpy.env.
    A thread-safe Singleton that stores global geoprocessing settings.
    """
    _instance = None

    def __new__(cls):
        # Ensure only one instance of the environment ever exists
        if cls._instance is None:
            cls._instance = super(ArcPyEnvironment, cls).__new__(cls)
            cls._instance._init_defaults()
        return cls._instance

    def _init_defaults(self):
        """Initializes the default ESRI environment states."""
        self._workspace = None
        self._overwriteOutput = False
        self._scratchWorkspace = None
        self._outputCoordinateSystem = None
        self._extent = None
        self._cell_size = "MAXOF"
        self._mask = None
        self._parallelProcessingFactor = None
        
        logger.info("MagPI Global Environment (arcpy.env) Initialized.")

    # --- Properties with Getters and Setters ---

    @property
    def workspace(self):
        return self._workspace

    @workspace.setter
    def workspace(self, value):
        logger.info(f"Global Workspace set to: {value}")
        self._workspace = value

    @property
    def overwriteOutput(self):
        return self._overwriteOutput

    @overwriteOutput.setter
    def overwriteOutput(self, value):
        # Accepts True/False or "True"/"False" strings
        val_bool = str(value).lower() == 'true'
        logger.info(f"Global overwriteOutput set to: {val_bool}")
        self._overwriteOutput = val_bool

    @property
    def scratchWorkspace(self):
        return self._scratchWorkspace

    @scratchWorkspace.setter
    def scratchWorkspace(self, value):
        self._scratchWorkspace = value

    @property
    def outputCoordinateSystem(self):
        return self._outputCoordinateSystem

    @outputCoordinateSystem.setter
    def outputCoordinateSystem(self, value):
        logger.info(f"Global Output Coordinate System set to: {value}")
        self._outputCoordinateSystem = value

    @property
    def extent(self):
        return self._extent

    @extent.setter
    def extent(self, value):
        logger.info(f"Global Extent (Bounding Box) set to: {value}")
        self._extent = value

    @property
    def cellSize(self):
        return self._cell_size

    @cellSize.setter
    def cellSize(self, value):
        self._cell_size = value

    @property
    def mask(self):
        return self._mask

    @mask.setter
    def mask(self, value):
        self._mask = value
        
    @property
    def parallelProcessingFactor(self):
        return self._parallelProcessingFactor
        
    @parallelProcessingFactor.setter
    def parallelProcessingFactor(self, value):
        # This is where we will eventually tie into Airflow or multi-threading pools!
        logger.info(f"Parallel Processing Factor requested: {value} (Not yet implemented in MVP)")
        self._parallelProcessingFactor = value

# Instantiate the singleton so it's ready the moment `import magpi as arcpy` is called
env = ArcPyEnvironment()