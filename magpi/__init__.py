# magpi/__init__.py
import sys
import logging

# 1. The sys.modules Injection
# This forces Python to serve MagPI when 'arcpy' is imported globally.
sys.modules['arcpy'] = sys.modules[__name__]

# Initialize MagPI Logger
logging.basicConfig(level=logging.INFO, format='MagPI [%(levelname)s]: %(message)s')
logger = logging.getLogger("MagPI_Core")
logger.info("MagPI translation matrix initialized. Bypassing legacy dependencies.")

# 2. Expose Translated Submodules
from . import management
from . import analysis
from . import sa
from . import da
from .env import env  # The thread-safe global environment singleton

# 3. Core Root Functions (Mocked/Translated)
def Exists(dataset):
    """MagPI equivalent of arcpy.Exists()"""
    import os
    # Note: Will need GDAL/Fiona upgrades for specific GDB feature class checking
    return os.path.exists(dataset)

# 4. The Fallback Interceptor (Python 3.7+)
def __getattr__(name):
    """
    Catches calls to unsupported or unimplemented legacy functions.
    Prevents fatal crashes by returning a safe mock object.
    """
    logger.warning(f"Unsupported legacy call intercepted: arcpy.{name}. Returning Mock object.")
    
    class MockArcPyObject:
        def __call__(self, *args, **kwargs):
            logger.warning(f"Mock executed for arcpy.{name} with args: {args}")
            return "" # Safe fallback return
            
        def __getattr__(self, attr):
            return MockArcPyObject() # Recursive mocking for chained calls
            
    return MockArcPyObject()