# magpi/__init__.py
import sys
import logging

# 1. The Trojan Horse: Inject MagPI into Python's sys.modules as 'arcpy'
sys.modules['arcpy'] = sys.modules[__name__]

# 2. Initialize Global Console Logger
logging.basicConfig(level=logging.INFO, format='MagPI 🧭 [%(levelname)s]: %(message)s')
logger = logging.getLogger("MagPI_Core")
logger.info("MagPI Translation Matrix Online. Bypassing legacy dependencies.")

# 3. Expose Submodules (The Structural Tree)
from . import management
from . import analysis
from . import sa
from . import da
from . import conversion
from . import ddd
from . import ia
from . import stats
from . import wfs
from . import mp
from . import server
from . import geocoding
from . import na
from . import lr
from . import ga
from . import ia       # Image Analyst (Chipping)
from . import geoai    # AI Training & Inference
from .ui import LaunchCanvas
from . import mgt

# 4. Expose the Global Environment
from .env import env
from .db import ArcSDESQLExecute
from .core import ListFeatureClasses, ListRasters, ListFiles, Exists
from .db import ArcSDESQLExecute

# 5. Expose Core Objects & Classes
from .objects import Result, Describe
from .classes import SpatialReference, Extent

# 6. Expose Core Messaging Functions
from .messages import AddMessage, AddWarning, AddError, GetMessages

# 7. Expose Data Enumerators (Listing)
from .listing import ListFeatureClasses, ListRasters

# 8. Expose Map Algebra Raster Class
from .sa import Raster

# 9. Core Root Functions
def Exists(dataset):
    """MagPI equivalent of arcpy.Exists()"""
    import os
    return os.path.exists(dataset)

# 10. The Ultimate Fallback Interceptor
def __getattr__(name):
    """Catches calls to unsupported legacy functions and prevents fatal crashes."""
    logger.warning(f"Unsupported legacy call intercepted: arcpy.{name}")
    
    class MockArcPyObject:
        def __call__(self, *args, **kwargs):
            logger.warning(f"Mock executed for arcpy.{name} with args: {args}")
            return Result("Mock_Fallback_Output")
            
        def __getattr__(self, attr):
            return MockArcPyObject()
            
    return MockArcPyObject()