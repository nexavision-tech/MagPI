# magpi/__init__.py
import sys
import logging

# 1. The Trojan Horse: Inject MagPI into the Python sys.modules under the name 'arcpy'
sys.modules['arcpy'] = sys.modules[__name__]

# 2. Initialize the Global Console Logger
logging.basicConfig(level=logging.INFO, format='MagPI 🧭 [%(levelname)s]: %(message)s')
logger = logging.getLogger("MagPI_Core")
logger.info("MagPI Translation Matrix Online. Bypassing legacy dependencies.")

# 3. Expose Submodules (The Structural Tree)
from . import management
from . import analysis
from . import sa
from . import da
from . import conversion

# 4. Expose the Global Environment
from .env import env

# 5. Expose Core Objects & Classes
from .objects import Result, Describe
from .classes import SpatialReference, Extent

# 6. Expose Core Messaging Functions
from .messages import AddMessage, AddWarning, AddError, GetMessages

# 7. Core Root Functions
def Exists(dataset):
    """MagPI equivalent of arcpy.Exists()"""
    import os
    return os.path.exists(dataset)

# 8. The Ultimate Fallback Interceptor
def __getattr__(name):
    """
    Catches calls to unsupported legacy functions and prevents fatal crashes.
    """
    logger.warning(f"Unsupported legacy call intercepted: arcpy.{name}")
    
    class MockArcPyObject:
        def __call__(self, *args, **kwargs):
            logger.warning(f"Mock executed for arcpy.{name} with args: {args}")
            return Result("Mock_Fallback_Output")
            
        def __getattr__(self, attr):
            return MockArcPyObject()
            
    return MockArcPyObject()

# 9. Expose Data Enumerators (List Functions)
from .listing import ListFeatureClasses, ListRasters

# 10. Expose Map Algebra Raster Class
from .sa import Raster
