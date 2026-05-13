# magpi/da.py
import geopandas as gpd
import pandas as pd
import logging
import os

logger = logging.getLogger("MagPI_DataAccess")

class SearchCursor:
    """
    MagPI Translation of arcpy.da.SearchCursor.
    Reads records from a feature class or table in memory.
    """
    def __init__(self, in_table, field_names, where_clause=None):
        self.in_table = in_table
        
        try:
            self.gdf = gpd.read_file(in_table)
        except Exception:
            # Fallback for standard CSVs/Tables
            self.gdf = pd.read_csv(in_table)

        # Handle '*' for all fields
        if field_names == "*":
            self.field_names = list(self.gdf.columns)
        else:
            self.field_names = [field_names] if isinstance(field_names, str) else field_names

        # Filter if a SQL where_clause is provided
        if where_clause:
            pandas_query = where_clause.replace(" = ", " == ")
            try:
                self.gdf = self.gdf.query(pandas_query)
            except Exception as e:
                logger.error(f"SearchCursor query failed: {e}")

    def __enter__(self):
        # Yielding tuples just like ArcPy
        self._iter = self.gdf[self.field_names].itertuples(index=False, name=None)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        pass # Memory is freed automatically

    def __iter__(self):
        return self

    def __next__(self):
        return next(self._iter)


class UpdateCursor:
    """
    MagPI Translation of arcpy.da.UpdateCursor.
    Allows for row-by-row updating of data. Commits changes to disk upon exiting the 'with' block.
    """
    def __init__(self, in_table, field_names, where_clause=None):
        self.in_table = in_table
        self.is_spatial = True
        
        try:
            self.gdf = gpd.read_file(in_table)
        except Exception:
            self.gdf = pd.read_csv(in_table)
            self.is_spatial = False

        if field_names == "*":
            self.field_names = list(self.gdf.columns)
            if 'geometry' in self.field_names:
                self.field_names.remove('geometry') # Prevent accidental geometry overwrites in MVP
        else:
            self.field_names = [field_names] if isinstance(field_names, str) else field_names

        if where_clause:
            pandas_query = where_clause.replace(" = ", " == ")
            self.query_indices = self.gdf.query(pandas_query).index
        else:
            self.query_indices = self.gdf.index

        self.current_idx = -1
        self._iterator = iter(self.query_indices)
        self.has_updates = False

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        # The MagPI Magic: Flush the changes back to disk automatically!
        if self.has_updates:
            logger.info(f"Flushing UpdateCursor changes back to: {self.in_table}")
            if self.is_spatial:
                self.gdf.to_file(self.in_table)
            else:
                self.gdf.to_csv(self.in_table, index=False)

    def __iter__(self):
        return self

    def __next__(self):
        self.current_idx = next(self._iterator)
        row = tuple(self.gdf.loc[self.current_idx, self.field_names])
        # Return as a mutable list so the user can change the values
        return list(row)

    def updateRow(self, row):
        """Commits the modified row list back into the in-memory dataframe."""
        self.gdf.loc[self.current_idx, self.field_names] = row
        self.has_updates = True

    def deleteRow(self):
        """Drops the row from the dataframe."""
        self.gdf = self.gdf.drop(self.current_idx)
        self.has_updates = True


class InsertCursor:
    """
    MagPI Translation of arcpy.da.InsertCursor.
    Appends new rows to a dataset.
    """
    def __init__(self, in_table, field_names):
        self.in_table = in_table
        self.field_names = [field_names] if isinstance(field_names, str) else field_names
        self.new_rows = []
        
        try:
            self.gdf = gpd.read_file(in_table)
            self.is_spatial = True
        except Exception:
            self.gdf = pd.read_csv(in_table)
            self.is_spatial = False

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.new_rows:
            logger.info(f"Flushing {len(self.new_rows)} new rows to: {self.in_table}")
            new_df = pd.DataFrame(self.new_rows, columns=self.field_names)
            
            if self.is_spatial:
                # If spatial, just append null geometries for the MVP
                new_gdf = gpd.GeoDataFrame(new_df, geometry=[None]*len(new_df), crs=self.gdf.crs)
                self.gdf = pd.concat([self.gdf, new_gdf], ignore_index=True)
                self.gdf.to_file(self.in_table)
            else:
                self.gdf = pd.concat([self.gdf, new_df], ignore_index=True)
                self.gdf.to_csv(self.in_table, index=False)

    def insertRow(self, row):
        self.new_rows.append(row)