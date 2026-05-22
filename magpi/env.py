# magpi/env.py
import logging

logger = logging.getLogger("MagPI_Env")

class _Environment:
    """
    MagPI Translation of arcpy.env.
    This is a Singleton class that holds the global state for all geoprocessing operations.
    """
    def __init__(self):
        # -----------------------------------------------------
        # Core ESRI Environment Variables
        # -----------------------------------------------------
        self._workspace = None
        self._scratchWorkspace = None
        self._overwriteOutput = False
        
        # Coordinates & Geometry
        self._outputCoordinateSystem = None
        self._horizontalDatum = None
        self._verticalDatum = None
        self._geographicTransformations = None
        self._outputZFlag = "Same As Input"
        self._outputMFlag = "Same As Input"
        
        # Raster Analysis
        self._cellSize = "MAXOF"
        self._extent = "MAXOF"
        self._snapRaster = None
        self._mask = None
        self._nodata = "NONE"
        
        # Processing & Performance
        self._parallelProcessingFactor = None
        
        # -----------------------------------------------------
        # Catch-all dictionary for unsupported/obscure environments
        # to prevent legacy scripts from crashing (Duck-typing)
        # -----------------------------------------------------
        self._unsupported_envs = {}

    # --- Property Getters and Setters for Core Variables ---

    @property
    def workspace(self):
        return self._workspace

    @workspace.setter
    def workspace(self, value):
        logger.info(f"Global Workspace set to: {value}")
        self._workspace = value

    @property
    def scratchWorkspace(self):
        return self._scratchWorkspace

    @scratchWorkspace.setter
    def scratchWorkspace(self, value):
        logger.info(f"Global Scratch Workspace set to: {value}")
        self._scratchWorkspace = value

    @property
    def overwriteOutput(self):
        return self._overwriteOutput

    @overwriteOutput.setter
    def overwriteOutput(self, value):
        logger.info(f"Global overwriteOutput set to: {value}")
        self._overwriteOutput = value

    @property
    def outputCoordinateSystem(self):
        return self._outputCoordinateSystem

    @outputCoordinateSystem.setter
    def outputCoordinateSystem(self, value):
        logger.info(f"Global Output Coordinate System set to: {value}")
        self._outputCoordinateSystem = value
        
    @property
    def horizontalDatum(self):
        return self._horizontalDatum

    @horizontalDatum.setter
    def horizontalDatum(self, value):
        logger.info(f"Global Horizontal Datum set to: {value}")
        self._horizontalDatum = value
        
    @property
    def verticalDatum(self):
        return self._verticalDatum

    @verticalDatum.setter
    def verticalDatum(self, value):
        logger.info(f"Global Vertical Datum set to: {value}")
        self._verticalDatum = value
        
    @property
    def cellSize(self):
        return self._cellSize

    @cellSize.setter
    def cellSize(self, value):
        logger.info(f"Global Raster Cell Size set to: {value}")
        self._cellSize = value

    @property
    def extent(self):
        return self._extent

    @extent.setter
    def extent(self, value):
        logger.info(f"Global Processing Extent set to: {value}")
        self._extent = value
        
    @property
    def mask(self):
        return self._mask

    @mask.setter
    def mask(self, value):
        logger.info(f"Global Analysis Mask set to: {value}")
        self._mask = value

    # --- The Magic Catch-All Methods ---
    # These intercept ANY property request. If it's not a core variable above,
    # it safely stores/returns it without crashing the user's script.

    def __getattr__(self, name):
        """Intercepts requests for obscure environment variables."""
        if name in self._unsupported_envs:
            return self._unsupported_envs[name]
        
        logger.debug(f"Accessed unsupported arcpy.env.{name}. Returning None to prevent crash.")
        return None

    def __setattr__(self, name, value):
        """Intercepts setting obscure environment variables."""
        # Allow standard attributes (the ones starting with '_') to be set normally
        if name.startswith('_'):
            super().__setattr__(name, value)
        # Allow properties (like 'workspace') to be routed through their setters
        elif hasattr(self.__class__, name) and isinstance(getattr(self.__class__, name), property):
            super().__setattr__(name, value)
        else:
            # Catch everything else (e.g., arcpy.env.XYResolution = "0.0001 Degrees")
            logger.debug(f"Intercepted unsupported arcpy.env.{name} = {value}. Storing safely.")
            self._unsupported_envs[name] = value

# Initialize the Singleton Instance
env = _Environment()
logger.info("MagPI Global Environment (arcpy.env) Initialized.")