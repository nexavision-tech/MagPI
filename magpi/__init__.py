# magpi/__init__.py
"""
MagPI: Matrix Automated Geospatial Processing Interface
An open-source, AI-native drop-in replacement for ArcPy and FME.
Created by Geographic Data Dynamics LLC / NexaVision.tech
"""

import logging
from .env import env
from .objects import Extent, Raster, FeatureClass, Result

# Import all subsystem modules so they can be accessed as arcpy.module.Tool()
from . import wfs
from . import ia
from . import geoai
from . import mgt as management # Aliased to match arcpy.management
from . import ddd

# Configure global MagPI logger
logging.basicConfig(
    level=logging.INFO,
    format='[%(levelname)s] MagPI \u2728 [%(levelname)s]: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger("MagPI_Core")

def AddMessage(msg):
    """Prints a message to the MagPI console."""
    logger.info(msg)

def AddError(msg):
    """Prints an error to the MagPI console."""
    logger.error(msg)

def AddWarning(msg):
    """Prints a warning to the MagPI console."""
    logger.warning(msg)

# Initialize the environment upon import
logger.info("MagPI Translation Matrix Online. Bypassing legacy dependencies.")