# magpi/__init__.py
"""
MagPI: Matrix Automated Geospatial Processing Interface
An open-source, AI-native drop-in replacement for ArcPy and FME.
Created by www.nexavision.tech
"""

import logging
from .env import env
from .objects import Extent, SpatialReference, Describe, Result
from .sa import Raster 

# 1. Expose Submodules (The Structural Tree)
from . import wfs
from . import ia
from . import geoai
from . import ml
from . import management
from . import ddd
from . import conversion
from . import analysis
from . import sa
from . import da
from . import stats # NEW: Spatial Statistics (stats.py)
from . import mp
from . import server
from . import geocoding
from . import lr
from . import ga

# 2. Expose Core Root Functions directly to the arcpy.* level
from .core import ListFeatureClasses, ListRasters, ListFiles, Exists

# 3. Configure global MagPI logger
logging.basicConfig(
    level=logging.INFO,
    format='[%(levelname)s] MagPI \u2728 [%(levelname)s]: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger("MagPI_Core")

# 4. Core Messaging Functions
def AddMessage(msg):
    logger.info(msg)

def AddError(msg):
    logger.error(msg)

def AddWarning(msg):
    logger.warning(msg)

# 5. The Ultimate Fallback Interceptor
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

# Initialize the environment upon import
logger.info("MagPI Translation Matrix Online. Bypassing legacy dependencies.")