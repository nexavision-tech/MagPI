# magpi/engine/nodes/etl_nodes.py
from ..node import Node
from .registry import register_node
from magpi.analysis import SpatialJoin
import logging

logger = logging.getLogger("MagPI_ETLNodes")

@register_node('etl_spatial_join')
class SpatialJoinNode(Node):
    def validate(self):
        if "in1" not in self.inputs:
            logger.error("Spatial Join requires a Target Feature (in1)")
            return False
        if "in2" not in self.inputs:
            logger.error("Spatial Join requires a Join Feature (in2)")
            return False
        return True

    def execute(self):
        target_features = self.inputs.get("in1")
        join_features = self.inputs.get("in2")
        join_operation = self.params.get("join_operation", "JOIN_ONE_TO_ONE")
        
        out_filename = f"spatial_join_{self.id.split('_')[1] if '_' in self.id else '1'}.shp"
        
        logger.info(f"Performing Spatial Join ({join_operation}) into {out_filename}")
        self.output = SpatialJoin(target_features, join_features, out_filename, join_operation)

@register_node('etl_vector_converter')
class VectorConverterNode(Node):
    def validate(self):
        if "in" not in self.inputs and "in1" not in self.inputs and not self.params.get("input_file"):
            logger.error("Vector Converter requires an input vector (in or input_file).")
            return False
        return True
        
    def execute(self):
        import geopandas as gpd
        import os
        from magpi import env
        
        input_data = self.inputs.get("in", self.inputs.get("in1")) or self.params.get("input_file")
        target_format = self.params.get("target_format", ".geojson")
        
        # Determine output filename
        base_name = os.path.basename(str(input_data)).split('.')[0] if isinstance(input_data, str) else f"converted_{self.id}"
        out_filename = f"{base_name}{target_format}"
        out_path = os.path.join(env.outputWorkspace, out_filename)
        
        logger.info(f"Converting {input_data} to {target_format} format...")
        
        try:
            gdf = gpd.read_file(input_data)
            
            if target_format == '.geojson':
                # Convert to EPSG:4326 for web compatibility if necessary
                if gdf.crs and gdf.crs.to_string() != "EPSG:4326":
                    logger.info("Reprojecting to EPSG:4326 for GeoJSON output")
                    gdf = gdf.to_crs("EPSG:4326")
                gdf.to_file(out_path, driver='GeoJSON')
            elif target_format == '.shp':
                gdf.to_file(out_path, driver='ESRI Shapefile')
            elif target_format == '.gpkg':
                gdf.to_file(out_path, driver='GPKG', layer=base_name)
            else:
                raise ValueError(f"Unsupported format: {target_format}")
                
            logger.info(f"Successfully converted vector to {out_path}")
            self.output = out_path
        except Exception as e:
            logger.error(f"Failed to convert vector: {e}")
            raise

@register_node('etl_db_writer')
class PostGISWriterNode(Node):
    def validate(self):
        if "in" not in self.inputs and "in1" not in self.inputs:
            logger.error("PostGIS Writer requires an input vector (in).")
            return False
        return True
        
    def execute(self):
        import geopandas as gpd
        from sqlalchemy import create_engine
        
        input_data = self.inputs.get("in", self.inputs.get("in1"))
        conn_string = self.params.get("connection_string", "")
        table_name = self.params.get("table_name", "output_table")
        
        if not conn_string:
            logger.error("No database connection string provided.")
            raise ValueError("connection_string is required")
            
        logger.info(f"Writing {input_data} to PostGIS table {table_name}...")
        
        try:
            gdf = gpd.read_file(input_data)
            engine = create_engine(conn_string)
            gdf.to_postgis(name=table_name, con=engine, if_exists='replace')
            logger.info(f"Successfully wrote data to {table_name}")
            self.output = f"db://{table_name}"
        except Exception as e:
            logger.error(f"Failed to write to PostGIS: {e}")
            raise
