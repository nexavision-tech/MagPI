# magpi/da.py
import geopandas as gpd
import pandas as pd
import logging
import os

logger = logging.getLogger("MagPI_DataAccess")

class SearchCursor:
    """
    MagPI Translation of arcpy.da.SearchCursor.
    Reads rows from a feature class or table using GeoPandas.
    """
    def __init__(self, in_table, field_names, where_clause=None):
        logger.info(f"Initializing Open-Source SearchCursor for: {in_table}")
        self.in_table = in_table
        
        # Handle the special ESRI "SHAPE@" and "OID@" tokens
        if isinstance(field_names, str):
            field_names = [field_names]
        
        self.original_fields = field_names
        self.query_fields = []
        for f in field_names:
            if f.upper() == "SHAPE@":
                self.query_fields.append("geometry")
            elif f.upper() == "OID@":
                self.query_fields.append("FID") # Pandas doesn't have native OIDs, we will use index
            else:
                self.query_fields.append(f)
                
        try:
            self.gdf = gpd.read_file(self.in_table)
            
            # Map index to FID if OID@ was requested
            if "FID" in self.query_fields and "FID" not in self.gdf.columns:
                self.gdf["FID"] = self.gdf.index

            # MVP SQL Filtering
            if where_clause:
                logger.info(f"Applying SearchCursor filter: {where_clause}")
                # Replace basic SQL '=' with Pandas '==' for seamless translation
                pandas_query = where_clause.replace(" = ", " == ")
                self.gdf = self.gdf.query(pandas_query)
                
            # Filter to requested columns
            self.gdf = self.gdf[self.query_fields]
            
            # Create a generator yielding tuples (matching arcpy behavior)
            self._iterator = self.gdf.itertuples(index=False, name=None)
            
        except Exception as e:
            logger.error(f"SearchCursor failed to initialize: {e}")
            self._iterator = iter([])

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.gdf = None # Free up RAM

    def __iter__(self):
        return self

    def __next__(self):
        return next(self._iterator)

    def next(self):
        """Python 2 legacy support."""
        return self.__next__()


class InsertCursor:
    """
    MagPI Translation of arcpy.da.InsertCursor.
    Collects new rows in memory and appends them to the dataset upon closing.
    """
    def __init__(self, in_table, field_names):
        logger.info(f"Initializing Open-Source InsertCursor for: {in_table}")
        self.in_table = in_table
        self.field_names = field_names if isinstance(field_names, list) else [field_names]
        
        # Translate SHAPE@ to geometry
        self.mapped_fields = ["geometry" if f.upper() == "SHAPE@" else f for f in self.field_names]
        self.new_rows = []

    def __enter__(self):
        return self

    def insertRow(self, row):
        """Adds a row tuple to the staging list."""
        if len(row) != len(self.mapped_fields):
            logger.error("InsertRow failed: Row length does not match field names length.")
            return
        
        # Create a dictionary mapping the fields to the values
        row_dict = dict(zip(self.mapped_fields, row))
        self.new_rows.append(row_dict)

    def __exit__(self, exc_type, exc_val, exc_tb):
        """When the 'with' block ends, execute the batch append to disk."""
        if not self.new_rows:
            return
            
        logger.info(f"Committing {len(self.new_rows)} new rows to {self.in_table}")
        try:
            # Create a GeoDataFrame from the new rows
            new_gdf = gpd.GeoDataFrame(self.new_rows)
            
            if os.path.exists(self.in_table):
                # If file exists, load it, concat, and overwrite
                existing_gdf = gpd.read_file(self.in_table)
                # Ensure the CRS matches
                if 'geometry' in new_gdf.columns and existing_gdf.crs:
                    new_gdf = new_gdf.set_crs(existing_gdf.crs)
                    
                combined_gdf = pd.concat([existing_gdf, new_gdf], ignore_index=True)
                combined_gdf.to_file(self.in_table)
            else:
                # If file doesn't exist, just save the new rows
                new_gdf.to_file(self.in_table)
                
        except Exception as e:
            logger.error(f"Failed to commit InsertCursor rows: {e}")

class UpdateCursor:
    """
    MagPI Translation of arcpy.da.UpdateCursor.
    Loads data into memory, allows row-by-row mutation, and saves on exit.
    """
    def __init__(self, in_table, field_names, where_clause=None):
        logger.info(f"Initializing Open-Source UpdateCursor for: {in_table}")
        logger.warning("Note: UpdateCursor caches the full file in memory for MVP.")
        self.in_table = in_table
        self.field_names = field_names if isinstance(field_names, list) else [field_names]
        self.mapped_fields = ["geometry" if f.upper() == "SHAPE@" else f for f in self.field_names]
        
        try:
            self.gdf = gpd.read_file(self.in_table)
            self.current_index = -1
            self.total_rows = len(self.gdf)
        except Exception as e:
            logger.error(f"Failed to initialize UpdateCursor: {e}")
            self.gdf = gpd.GeoDataFrame()
            self.total_rows = 0

    def __enter__(self):
        return self

    def __iter__(self):
        self.current_index = -1
        return self

    def __next__(self):
        self.current_index += 1
        if self.current_index >= self.total_rows:
            raise StopIteration
            
        # Extract the requested fields for the current row as a list
        row_values = []
        for field in self.mapped_fields:
            if field in self.gdf.columns:
                row_values.append(self.gdf.at[self.current_index, field])
            else:
                row_values.append(None)
                
        return row_values

    def next(self):
        return self.__next__()

    def updateRow(self, row):
        """Updates the current row in the GeoDataFrame memory cache."""
        if self.current_index < 0 or self.current_index >= self.total_rows:
            return
            
        for i, field in enumerate(self.mapped_fields):
            if field in self.gdf.columns:
                self.gdf.at[self.current_index, field] = row[i]

    def deleteRow(self):
        """Drops the current row from the GeoDataFrame memory cache."""
        if self.current_index >= 0 and self.current_index < self.total_rows:
            self.gdf = self.gdf.drop(self.current_index)

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Commit all updates and deletions back to the file."""
        if not self.gdf.empty:
            logger.info(f"Committing updates to {self.in_table}")
            try:
                self.gdf.to_file(self.in_table)
            except Exception as e:
                logger.error(f"Failed to commit UpdateCursor changes: {e}")