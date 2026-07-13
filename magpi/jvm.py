# magpi/jvm.py
import os
import logging
import jpype
import jpype.imports

logger = logging.getLogger("MagPI_JVM")

class GeoToolsBridge:
    """
    MagPI JVM Bridge using JPype.
    Provides direct access to the GeoTools Java library from Python, 
    bypassing the GIL for heavy topological and grid-processing operations.
    """
    _initialized = False

    @classmethod
    def initialize(cls, jar_dir="/opt/geotools/lib"):
        if cls._initialized:
            return

        logger.info("Initializing MagPI JVM Engine via JPype...")
        
        try:
            # We want to load all GeoTools jars in the specified directory
            if os.path.exists(jar_dir):
                classpath = os.path.join(jar_dir, "*")
                jpype.startJVM(classpath=[classpath], convertStrings=True)
                cls._initialized = True
                logger.info("JVM successfully started with GeoTools classpath.")
            else:
                logger.warning(f"GeoTools lib directory not found at {jar_dir}. JVM starting without GeoTools.")
                jpype.startJVM(convertStrings=True)
                cls._initialized = True
        except Exception as e:
            logger.error(f"Failed to start JVM: {e}")

    @classmethod
    def get_jts_factory(cls):
        """
        Example method to fetch the JTS GeometryFactory directly from Java.
        """
        if not cls._initialized:
            cls.initialize()
            
        try:
            from org.locationtech.jts.geom import GeometryFactory
            return GeometryFactory()
        except ImportError:
            logger.error("JTS Topology Suite not found in JVM Classpath. Did you install GeoTools?")
            return None
