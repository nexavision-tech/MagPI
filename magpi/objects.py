# magpi/objects.py
import logging

logger = logging.getLogger("MagPI_Objects")

class Result:
    """
    Duck-typed mimic of the arcpy.Result object.
    Legacy scripts expect geoprocessing tools to return this, 
    and they often index it like a list: output_path = result[0]
    """
    def __init__(self, output_value, status=4):
        # In ArcPy, status 4 usually means 'Succeeded'
        self._output = output_value
        self.status = status
        self.messageCount = 0

    def __getitem__(self, index):
        """Allows the legacy result[0] indexing behavior"""
        if index == 0:
            return self._output
        else:
            logger.warning(f"Result object indexed at {index}, but MagPI currently only stores primary output at 0.")
            return None

    def getOutput(self, index):
        """Allows the legacy result.getOutput(0) behavior"""
        return self.__getitem__(index)

class DescribeObject:
    """
    Duck-typed mimic of the arcpy.Describe object.
    Dynamically attaches properties based on the dataset type.
    """
    def __init__(self, dataset_path):
        import os
        from pathlib import Path
        
        self.catalogPath = str(Path(dataset_path).resolve())
        self.name = os.path.basename(dataset_path)
        self.baseName = os.path.splitext(self.name)[0]
        self.extension = os.path.splitext(self.name)[1].replace(".", "")
        self.dataType = self._determine_data_type()
        
        # We will dynamically populate spatialReference using PyProj/Fiona later
        self.spatialReference = None 

    def _determine_data_type(self):
        """Rough estimation of data type for legacy script logic routing"""
        ext = self.extension.lower()
        if ext in ['shp', 'gpkg']:
            return "FeatureClass"
        elif ext in ['tif', 'png', 'jpg', 'img']:
            return "RasterDataset"
        elif ext == 'gdb':
            return "Workspace"
        return "Unknown"

def Describe(dataset):
    """The function called by users: arcpy.Describe(...)"""
    return DescribeObject(dataset)