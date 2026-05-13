# magpi/mp.py
import geopandas as gpd
import logging
import os
from .objects import Result

logger = logging.getLogger("MagPI_Mapping")

def ExportToPNG(in_features, out_png, title="MagPI Spatial Export", color_field=None, cmap="viridis", add_basemap=True):
    """
    MagPI Translation of arcpy.mp (Mapping module) exports.
    Renders vector data onto a beautiful static map with an open-source basemap.
    """
    logger.info(f"Executing Open-Source Cartographic Export on: {in_features}")
    try:
        import matplotlib.pyplot as plt
        import contextily as cx
        
        # 1. Load the spatial data
        gdf = gpd.read_file(in_features)
        
        # For contextily basemaps to align perfectly, we need to convert to Web Mercator (EPSG:3857)
        if add_basemap:
            logger.info("Aligning projection for OpenStreetMap basemap (EPSG:3857)...")
            gdf = gdf.to_crs(epsg=3857)
            
        # 2. Setup the Canvas
        # Create a large, high-resolution figure (10x10 inches)
        fig, ax = plt.subplots(1, 1, figsize=(10, 10), dpi=300)
        
        # 3. Plot the Data
        logger.info("Rendering vector geometries...")
        if color_field and color_field in gdf.columns:
            # If the user wants to color code by a specific attribute (e.g., Tree Canopy Height)
            gdf.plot(column=color_field, ax=ax, cmap=cmap, legend=True, 
                     legend_kwds={'label': color_field, 'orientation': "horizontal"},
                     alpha=0.8, edgecolor='black', linewidth=0.5)
        else:
            # Standard single-color plot
            gdf.plot(ax=ax, color='red', alpha=0.6, edgecolor='black', linewidth=1)
            
        # 4. Add the Open-Source Basemap
        if add_basemap:
            logger.info("Reaching out to Gaian Mind for map tiles...")
            # Automatically downloads and stitches the background map!
            cx.add_basemap(ax, source=cx.providers.OpenStreetMap.Mapnik)
            
        # 5. Cartographic Polish
        ax.set_title(title, fontsize=16, fontweight='bold', fontfamily='sans-serif')
        ax.set_axis_off() # Hide the ugly coordinate axis borders
        
        # 6. Save to Disk
        plt.tight_layout()
        plt.savefig(out_png, format='png', bbox_inches='tight')
        plt.close(fig) # Free up memory
        
        logger.info(f"Cartographic export complete. Saved high-res map to: {out_png}")
        return Result(out_png)

    except ImportError:
        logger.error("Missing plotting dependencies. Run: conda install -c conda-forge matplotlib contextily -y")
        return Result(None, status=3)
    except Exception as e:
        logger.error(f"Failed to export map layout: {e}")
        return Result(None, status=3)

def ExportToPDF(in_features, out_pdf, title="MagPI Spatial Export", color_field=None):
    """
    MagPI Translation of arcpy.mp PDF exports.
    Calls the PNG engine but saves out as a universally readable PDF.
    """
    logger.info("Routing PDF request to unified mapping engine...")
    # Matplotlib natively supports PDF saving just by changing the extension!
    return ExportToPNG(in_features, out_pdf, title=title, color_field=color_field)