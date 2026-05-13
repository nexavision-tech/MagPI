# magpi/server.py
import geopandas as gpd
import requests
import logging
import os
from .objects import Result

logger = logging.getLogger("MagPI_Server")

def DownloadArcGISRESTFeatureLayer(rest_url, out_feature_class, where_clause="1=1", out_sr="4326"):
    """
    MagPI Translation/Enhancement of arcpy.server data extraction.
    Downloads vector data from any public ArcGIS REST API endpoint.
    """
    logger.info(f"Executing Open-Source REST Extraction from: {rest_url}")
    
    # Ensure the URL points to the query endpoint
    if not rest_url.endswith("/query"):
        rest_url = f"{rest_url.rstrip('/')}/query"
        
    params = {
        'where': where_clause,
        'outFields': '*',
        'f': 'geojson', # Request standard GeoJSON
        'outSR': out_sr,
        'returnGeometry': 'true'
    }
    
    try:
        logger.info(f"Querying endpoint with clause: {where_clause}...")
        response = requests.get(rest_url, params=params)
        response.raise_for_status()
        
        data = response.json()
        
        # Check if the server refused GeoJSON and returned an ESRI error
        if 'error' in data:
             logger.warning(f"Server returned error: {data['error']}. Attempting ESRI JSON fallback...")
             params['f'] = 'json'
             response = requests.get(rest_url, params=params)
             response.raise_for_status()
             data = response.json()
             if 'error' in data:
                 logger.error(f"Fallback failed. Server error: {data['error']}")
                 return Result(None, status=3)
             
             logger.info("Parsing ESRI JSON into GeoPandas...")
             import json
             gdf = gpd.read_file(json.dumps(data), driver='ESRIJSON')
        else:
             logger.info("Parsing standard GeoJSON into GeoPandas...")
             gdf = gpd.GeoDataFrame.from_features(data['features'])
             
        # Set initial CRS based on request
        if 'epsg' not in str(out_sr).lower() and out_sr.isdigit():
             gdf.set_crs(epsg=int(out_sr), inplace=True, allow_override=True)
        
        # Reproject if global environment is set
        from .env import env
        if env.outputCoordinateSystem:
             target_crs = f"EPSG:{env.outputCoordinateSystem}" if isinstance(env.outputCoordinateSystem, int) else str(env.outputCoordinateSystem)
             logger.info(f"Auto-Reprojecting retrieved data to: {target_crs}")
             gdf = gdf.to_crs(target_crs)
             
        gdf.to_file(out_feature_class)
        logger.info(f"SUCCESS: {len(gdf)} features downloaded to {out_feature_class}")
        return Result(out_feature_class)
        
    except Exception as e:
        logger.error(f"Failed to download REST data: {e}")
        return Result(None, status=3)


def PublishToAGOL(in_features, title, username=None, password=None, tags="MagPI"):
    """
    MagPI Translation of arcpy.sharing workflows.
    (Skeleton Phase - Outlines the bridge back into the ESRI ecosystem if needed).
    """
    logger.info(f"Initializing AGOL Publish Pipeline for: {in_features}")
    logger.warning("PublishToAGOL is in Skeleton Phase. Requires ArcREST or arcgis Python API backend.")
    
    # In a full deployment, this would zip the shapefile or convert to GeoJSON
    # and POST it to the ArcGIS Online / Portal sharing endpoint using an OAuth token.
    
    return Result(True)

def ConnectToS3(bucket_name, access_key=None, secret_key=None):
    """
    MagPI Cloud Enhancement (Not in legacy arcpy natively without complex setup).
    Initializes a connection to Amazon S3 (or compatible object storage) for reading/writing.
    """
    logger.info(f"Connecting to Cloud Storage (S3 Bucket: {bucket_name})...")
    try:
        import boto3
        # If keys are None, boto3 will attempt to find them in environment variables or ~/.aws/credentials
        s3 = boto3.client('s3', aws_access_key_id=access_key, aws_secret_access_key=secret_key)
        logger.info("S3 Connection established via boto3.")
        return Result(s3)
    except ImportError:
        logger.error("Missing dependency. Run: conda install -c conda-forge boto3 -y")
        return Result(None, status=3)
    except Exception as e:
        logger.error(f"Failed to connect to S3: {e}")
        return Result(None, status=3)

def ConnectToGCS(bucket_name, project_id=None, service_account_json=None):
    """
    MagPI Cloud Enhancement.
    Initializes a connection to Google Cloud Storage (GCS).
    """
    logger.info(f"Connecting to Google Cloud Storage (Bucket: {bucket_name})...")
    try:
        from google.cloud import storage
        
        # If a service account file is provided, use it. Otherwise, rely on default application credentials.
        if service_account_json and os.path.exists(service_account_json):
            client = storage.Client.from_service_account_json(service_account_json)
        elif project_id:
            client = storage.Client(project=project_id)
        else:
            client = storage.Client()
            
        bucket = client.bucket(bucket_name)
        logger.info(f"GCS Connection established. Bucket '{bucket.name}' loaded.")
        return Result(bucket)
        
    except ImportError:
        logger.error("Missing dependency. Run: conda install -c conda-forge google-cloud-storage -y")
        return Result(None, status=3)
    except Exception as e:
        logger.error(f"Failed to connect to GCS: {e}")
        return Result(None, status=3)

def ConnectToAzure(container_name, connection_string=None):
    """
    MagPI Cloud Enhancement.
    Initializes a connection to Azure Blob Storage.
    """
    logger.info(f"Connecting to Azure Blob Storage (Container: {container_name})...")
    try:
        from azure.storage.blob import BlobServiceClient
        
        if connection_string:
            blob_service_client = BlobServiceClient.from_connection_string(connection_string)
        else:
            # Fallback to environment variable if connection string isn't explicitly passed
            conn_str = os.environ.get('AZURE_STORAGE_CONNECTION_STRING')
            if conn_str:
                blob_service_client = BlobServiceClient.from_connection_string(conn_str)
            else:
                logger.error("No Azure connection string provided or found in environment variables.")
                return Result(None, status=3)
                
        container_client = blob_service_client.get_container_client(container_name)
        logger.info(f"Azure Connection established. Container '{container_name}' loaded.")
        return Result(container_client)
        
    except ImportError:
        logger.error("Missing dependency. Run: conda install -c conda-forge azure-storage-blob -y")
        return Result(None, status=3)
    except Exception as e:
        logger.error(f"Failed to connect to Azure: {e}")
        return Result(None, status=3)