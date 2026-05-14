import magpi as arcpy

# Read the Orange County DSM and DTM tiles
dsm = arcpy.sa.Raster("test_data/2022 Pilot Tiles/Orange County 3 Inch/3in/DEM/DSM/DSM-2022_480536.tif")
dtm = arcpy.sa.Raster("test_data/2022 Pilot Tiles/Orange County 3 Inch/3in/DEM/DTM/DTM-2022_480536.tif")

# Map Algebra: Subtract terrain from surface to get the height of buildings/trees!
canopy_height = dsm - dtm 

canopy_height.save("test_data/building_heights.tif")