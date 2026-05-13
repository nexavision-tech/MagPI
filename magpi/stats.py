# magpi/stats.py
import geopandas as gpd
import numpy as np
import logging
import os
from .objects import Result

logger = logging.getLogger("MagPI_SpatialStats")

def HotSpots(Input_Feature_Class, Input_Field, Output_Feature_Class, Conceptualization_of_Spatial_Relationships="INVERSE_DISTANCE", Distance_Band_or_Threshold_Distance=None):
    """
    MagPI Translation of arcpy.stats.HotSpots (Getis-Ord Gi*).
    Identifies statistically significant spatial clusters of high values (hot spots) and low values (cold spots).
    Uses 'esda' and 'libpysal' (The engines behind GeoDa).
    """
    logger.info(f"Executing Open-Source HotSpots (Getis-Ord Gi*) on: {Input_Feature_Class}")
    try:
        import libpysal
        from esda.getisord import G_Local

        # 1. Load the vector data
        gdf = gpd.read_file(Input_Feature_Class)
        
        # Ensure the field exists and is numeric
        if Input_Field not in gdf.columns:
            logger.error(f"Field '{Input_Field}' not found in {Input_Feature_Class}")
            return Result(None, status=3)
            
        y = gdf[Input_Field].astype(float).values
        
        # 2. Build the Spatial Weights Matrix (How neighbors relate to each other)
        logger.info("Building Spatial Weights Matrix...")
        if Conceptualization_of_Spatial_Relationships == "INVERSE_DISTANCE":
            # Using Distance Band. If none provided, PySAL calculates a default KNN or minimum threshold.
            if Distance_Band_or_Threshold_Distance:
                w = libpysal.weights.DistanceBand.from_dataframe(gdf, float(Distance_Band_or_Threshold_Distance), binary=False)
            else:
                w = libpysal.weights.KNN.from_dataframe(gdf, k=8) # Default to 8 nearest neighbors
        else:
            # Default fallback to Contiguity (Queen's case - touching borders/corners)
            w = libpysal.weights.Queen.from_dataframe(gdf)
            
        w.transform = 'R' # Row-standardize the weights
        
        # 3. Calculate Getis-Ord Gi*
        logger.info("Calculating Local G Statistics...")
        g_local = G_Local(y, w, transform='R', star=True)
        
        # 4. Append Results to the GeoDataFrame
        gdf['Gi_Zscore'] = g_local.Zs
        gdf['Gi_Pvalue'] = g_local.p_sim
        
        # Categorize confidence intervals (99%, 95%, 90% Hot/Cold Spots)
        conditions = [
            (gdf['Gi_Pvalue'] < 0.01) & (gdf['Gi_Zscore'] > 0),
            (gdf['Gi_Pvalue'] < 0.05) & (gdf['Gi_Zscore'] > 0),
            (gdf['Gi_Pvalue'] < 0.10) & (gdf['Gi_Zscore'] > 0),
            (gdf['Gi_Pvalue'] < 0.01) & (gdf['Gi_Zscore'] < 0),
            (gdf['Gi_Pvalue'] < 0.05) & (gdf['Gi_Zscore'] < 0),
            (gdf['Gi_Pvalue'] < 0.10) & (gdf['Gi_Zscore'] < 0)
        ]
        choices = [3, 2, 1, -3, -2, -1] # +3 is 99% Hot, -3 is 99% Cold
        gdf['Gi_Bin'] = np.select(conditions, choices, default=0)

        # 5. Save Output
        gdf.to_file(Output_Feature_Class)
        logger.info(f"Hot Spot Analysis complete. Saved to: {Output_Feature_Class}")
        return Result(Output_Feature_Class)

    except ImportError:
        logger.error("Missing dependencies: 'libpysal' and 'esda'. Run: conda install -c conda-forge libpysal esda -y")
        return Result(None, status=3)
    except Exception as e:
        logger.error(f"Failed to calculate Hot Spots: {e}")
        return Result(None, status=3)

def SpatialAutocorrelation(Input_Feature_Class, Input_Field, Generate_Report="NO_REPORT", Conceptualization_of_Spatial_Relationships="INVERSE_DISTANCE", Distance_Band_or_Threshold_Distance=None):
    """
    MagPI Translation of arcpy.stats.SpatialAutocorrelation (Global Moran's I).
    Measures spatial autocorrelation based on both feature locations and feature values simultaneously.
    """
    logger.info(f"Executing Open-Source SpatialAutocorrelation (Moran's I) on: {Input_Feature_Class}")
    try:
        import libpysal
        from esda.moran import Moran

        gdf = gpd.read_file(Input_Feature_Class)
        y = gdf[Input_Field].astype(float).values
        
        if Conceptualization_of_Spatial_Relationships == "INVERSE_DISTANCE" and Distance_Band_or_Threshold_Distance:
            w = libpysal.weights.DistanceBand.from_dataframe(gdf, float(Distance_Band_or_Threshold_Distance), binary=False)
        else:
            w = libpysal.weights.KNN.from_dataframe(gdf, k=8)
            
        w.transform = 'R'
        
        logger.info("Calculating Global Moran's I...")
        moran = Moran(y, w)
        
        logger.info(f"Moran's Index: {moran.I:.4f}")
        logger.info(f"Z-Score: {moran.z_sim:.4f}")
        logger.info(f"P-Value: {moran.p_sim:.4f}")
        
        if moran.z_sim > 2.58:
            logger.info("Result: Clustered (Significant at 99%)")
        elif moran.z_sim < -2.58:
            logger.info("Result: Dispersed (Significant at 99%)")
        else:
            logger.info("Result: Random (No significant spatial autocorrelation)")
            
        # In ArcPy, this tool doesn't output a new shapefile, it just returns the stats as a tuple/Result
        return Result([moran.I, moran.z_sim, moran.p_sim])

    except ImportError:
        logger.error("Missing dependencies: 'libpysal' and 'esda'.")
        return Result(None, status=3)
    except Exception as e:
        logger.error(f"Failed to calculate Spatial Autocorrelation: {e}")
        return Result(None, status=3)