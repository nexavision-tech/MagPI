# magpi/messages.py
import logging

# We tap into the root MagPI logger
logger = logging.getLogger("MagPI_Console")

def AddMessage(message):
    """Translates arcpy.AddMessage to standard logging INFO"""
    logger.info(message)

def AddWarning(message):
    """Translates arcpy.AddWarning to standard logging WARNING"""
    logger.warning(message)

def AddError(message):
    """Translates arcpy.AddError to standard logging ERROR"""
    logger.error(message)

def GetMessages(severity=None):
    """
    Legacy scripts often call this to retrieve the console output.
    MagPI handles this natively via stdout logging, so we return a placeholder.
    """
    return "MagPI: Messages are being routed natively to Python stdout."
