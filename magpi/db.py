# magpi/db.py
import geopandas as gpd
import logging
from .objects import Result

logger = logging.getLogger("MagPI_Database")

class ArcSDESQLExecute:
    """
    MagPI Translation of arcpy.ArcSDESQLExecute.
    Bypasses proprietary ESRI SDE middleware to execute raw SQL directly on PostGIS/PostgreSQL.
    """
    def __init__(self, server, database=None, user=None, password=None, port=5432):
        # Allow passing an existing connection string directly in the 'server' variable
        if "postgresql://" in str(server):
            self.conn_str = server
            log_db = server.split('@')[-1].split('/')[0] if '@' in server else "DirectDB"
            logger.info(f"Establishing Sovereign DB Connection to: {log_db}")
        else:
            logger.info(f"Establishing Sovereign DB Connection to: {server}/{database}")
            self.conn_str = f"postgresql://{user}:{password}@{server}:{port}/{database}"

        try:
            from sqlalchemy import create_engine, text
            self.engine = create_engine(self.conn_str)
            logger.info("PostGIS connection established via SQLAlchemy C-backend.")
        except ImportError:
            logger.error("Missing dependency. Run: conda install -c conda-forge sqlalchemy psycopg2 -y")
            self.engine = None

    def execute(self, sql_statement):
        """Executes a raw SQL statement on the connected PostGIS database."""
        if not self.engine:
            logger.error("No active database engine. Cannot execute SQL.")
            return Result(False, status=3)
        
        # Strip out legacy SDE specific syntax if present
        clean_sql = str(sql_statement).replace("sde.ST_", "ST_")
        
        logger.info(f"Executing PostGIS SQL: {clean_sql[:75]}...")
        try:
            from sqlalchemy import text
            with self.engine.connect() as conn:
                # If it's a SELECT query returning geometry, route directly to GeoPandas!
                if "SELECT" in clean_sql.upper() and ("geom" in clean_sql.lower() or "shape" in clean_sql.lower()):
                    logger.info("Spatial query detected. Routing directly to GeoPandas memory...")
                    # Try to dynamically find the geometry column name
                    geom_col = 'geom' if 'geom' in clean_sql.lower() else 'shape'
                    
                    gdf = gpd.read_postgis(text(clean_sql), conn, geom_col=geom_col)
                    logger.info(f"Retrieved {len(gdf)} spatial records from database.")
                    return Result(gdf) # Returns the actual GeoDataFrame in memory
                
                else:
                    # Standard SQL execution (UPDATE, INSERT, CREATE TABLE, DROP)
                    result = conn.execute(text(clean_sql))
                    conn.commit()
                    
                    # If it's a non-spatial SELECT, return the rows
                    if "SELECT" in clean_sql.upper():
                        rows = result.fetchall()
                        logger.info(f"Retrieved {len(rows)} tabular records.")
                        return Result([list(r) for r in rows])
                    
                    logger.info("SQL Execution committed successfully.")
                    return Result(True)
                    
        except Exception as e:
            logger.error(f"PostGIS SQL Execution failed: {e}")
            return Result(False, status=3)