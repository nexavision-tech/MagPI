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
# --- NumPy Array Conversions ---

def FeatureClassToNumPyArray(in_table, field_names, skip_nulls=False, null_value=None):
    import geopandas as gpd
    import pandas as pd
    try:
        gdf = gpd.read_file(in_table)
    except Exception:
        gdf = pd.read_csv(in_table)
        
    if isinstance(field_names, str):
        if field_names == "*":
            field_names = list(gdf.columns)
        else:
            field_names = [field_names]
    else:
        field_names = list(field_names)
        
    # Exclude geometry column if it was wildcarded and not explicitly requested
    if 'geometry' in field_names and '*' in field_names:
        field_names.remove('geometry')
        
    df = gdf[field_names].copy()
    if skip_nulls:
        df = df.dropna()
        
    # Convert to structured numpy array (what arcpy returns)
    return df.to_records(index=False)

def TableToNumPyArray(in_table, field_names, skip_nulls=False, null_value=None):
    return FeatureClassToNumPyArray(in_table, field_names, skip_nulls, null_value)

def NumPyArrayToTable(in_array, out_table):
    import pandas as pd
    df = pd.DataFrame(in_array)
    df.to_csv(out_table, index=False)
    logger.info(f"Wrote NumPy array to table: {out_table}")

def NumPyArrayToFeatureClass(in_array, out_table, shape_fields, spatial_reference=None):
    import geopandas as gpd
    import pandas as pd
    from shapely.geometry import Point
    
    df = pd.DataFrame(in_array)
    if isinstance(shape_fields, (list, tuple)) and len(shape_fields) == 2:
        geometry = [Point(xy) for xy in zip(df[shape_fields[0]], df[shape_fields[1]])]
        gdf = gpd.GeoDataFrame(df, geometry=geometry)
        gdf.to_file(out_table)
        logger.info(f"Wrote NumPy array to FeatureClass: {out_table}")
    else:
        logger.error("NumPyArrayToFeatureClass currently only supports Point geometries with [X, Y] shape_fields.")

def ExtendTable(in_table, table_match_field, in_array, array_match_field, append_only=False):
    import geopandas as gpd
    import pandas as pd
    is_spatial = True
    try:
        gdf = gpd.read_file(in_table)
    except Exception:
        gdf = pd.read_csv(in_table)
        is_spatial = False
        
    df_arr = pd.DataFrame(in_array)
    
    # Perform the join
    merged = gdf.merge(df_arr, left_on=table_match_field, right_on=array_match_field, how='left')
    
    if is_spatial:
        merged.to_file(in_table)
    else:
        merged.to_csv(in_table, index=False)
    logger.info(f"Extended table {in_table} with NumPy array.")

def Describe(in_data):
    """
    arcpy.da.Describe returns a dictionary of properties.
    """
    import geopandas as gpd
    try:
        gdf = gpd.read_file(in_data)
        desc = {
            'dataType': 'FeatureClass',
            'shapeType': str(gdf.geom_type.mode()[0]) if not gdf.empty else 'Polygon',
            'spatialReference': gdf.crs,
            'shapeFieldName': 'geometry',
            'OIDFieldName': 'OBJECTID', # Mock OID field
            'fields': [{'name': col, 'type': str(gdf[col].dtype)} for col in gdf.columns]
        }
        return desc
    except Exception:
        return {'dataType': 'Table', 'OIDFieldName': 'OBJECTID', 'fields': []}
