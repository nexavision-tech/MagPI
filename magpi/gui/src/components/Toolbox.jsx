import React, { useState, useEffect } from 'react';
import {
  Database, Layers, Cpu, Settings, Image as ImageIcon,
  Hexagon, Leaf, Grid, Crosshair, Scissors, CircleDashed,
  ChevronDown, ChevronRight, MousePointer2, Trash2,
  SlidersHorizontal, Wrench, Check, FolderOpen, ListFilter,
  Search, Copy, Info, Fingerprint, Loader2, AlertCircle,
  Cloud, Map as MapIcon, Satellite, Box, Globe, DownloadCloud, PaintBucket,
  FileOutput, LineChart, Brain, Sparkles, RefreshCcw, Activity, BrainCircuit, Play, Compass, Calendar,
  BookOpen, ExternalLink, AlertTriangle, Users, Hash, ToggleLeft, FileJson
} from 'lucide-react';

const GdbLayerSelector = ({ selectedNode, updateNodeParam }) => {
  const [layers, setLayers] = useState([]);
  const [loading, setLoading] = useState(false);
  const filePath = selectedNode.params.file_path;
  
  useEffect(() => {
    if (!filePath) return;
    const fetchLayers = async () => {
      setLoading(true);
      try {
        const res = await fetch(`http://${window.location.hostname}:8080/api/list_layers?file_path=${encodeURIComponent(filePath)}`);
        const data = await res.json();
        if (data.status === 'success') {
          setLayers(data.layers);
          // Auto-select first layer if none selected
          if (!selectedNode.params.layer_name && data.layers.length > 0) {
            updateNodeParam(selectedNode.id, 'layer_name', data.layers[0]);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchLayers();
  }, [filePath]);

  return (
    <div className="relative">
      <Layers size={14} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500" />
      <select 
        value={selectedNode.params.layer_name || ""} 
        onChange={(e) => updateNodeParam(selectedNode.id, 'layer_name', e.target.value)} 
        className="w-full bg-slate-800 border border-slate-600 rounded-md pl-9 pr-8 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono appearance-none cursor-pointer"
        disabled={loading}
      >
        <option value="">{loading ? "Scanning Database..." : "Select Layer..."}</option>
        {layers.map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
      {loading ? (
        <Loader2 size={14} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-emerald-400 animate-spin pointer-events-none" />
      ) : (
        <ChevronDown size={14} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-500 pointer-events-none" />
      )}
    </div>
  );
};

export const TOOLBOX_CATEGORIES = [
  {
    name: "Core Inputs", icon: <Database size={18} className="text-yellow-500/70" />,
    tools: [
      {
        id: 'core_extent', name: "Spatial Extent (AOI)", type: 'input', icon: <Hexagon size={14} />, color: 'bg-yellow-600', border: 'border-yellow-500',
        description: "Defines the geographic bounding box for the entire pipeline. Automatically triggers WFS/WCS streaming on connected nodes.",
        inputs: [],
        outputs: [{ id: 'extent', type: 'EXTENT', label: 'EXTENT' }],
        params: { xmin: -122.5, ymin: 37.7, xmax: -122.3, ymax: 37.8 }
      },
      {
        id: 'load_raster', name: "Input Raster", type: 'input', icon: <ImageIcon size={14} />, color: 'bg-blue-600', border: 'border-blue-500',
        description: "Loads a multi-band imagery file (TIFF, IMG, JP2) into the MagPI processing matrix.",
        inputs: [
          { id: 'path_in', type: 'STRING', label: 'PATH IN' },
          { id: 'set_crs', type: 'STRING', label: 'SET CRS' },
          { id: 'set_nodata', type: 'FLOAT', label: 'SET NODATA' },
          { id: 'set_acq_date', type: 'STRING', label: 'SET ACQ DATE' }
        ],
        outputs: [
          { id: 'raster', type: 'RASTER', label: 'RASTER' },
          { id: 'path_out', type: 'STRING', label: 'PATH OUT' },
          { id: 'crs', type: 'STRING', label: 'CRS' },
          { id: 'extent', type: 'EXTENT', label: 'EXTENT' },
          { id: 'bands', type: 'ARRAY', label: 'BANDS' },
          { id: 'dtype', type: 'STRING', label: 'DTYPE' },
          { id: 'nodata', type: 'FLOAT', label: 'NODATA' },
          { id: 'acq_date', type: 'STRING', label: 'ACQ DATE' },
          { id: 'wavelengths', type: 'ARRAY', label: 'WAVELENGTHS' },
          { id: 'rpc', type: 'OBJECT', label: 'RPC' }
        ],
        params: { file_path: "./test_data/noaa_florida/2021_4BandImagery_Florida_J1378560tR0_C0.tif" }
      },
      {
        id: 'load_vector', name: "Input Vector", type: 'input', icon: <Hexagon size={14} />, color: 'bg-blue-600', border: 'border-blue-500',
        description: "Loads a feature class (e.g. Shapefile, GeoJSON, or File Geodatabase layer).",
        inputs: [ 
          { id: 'path_in', type: 'STRING', label: 'PATH IN' },
          { id: 'set_crs', type: 'STRING', label: 'SET CRS' },
          { id: 'set_geometry', type: 'STRING', label: 'SET GEOM TYPE' },
        ],
        outputs: [
          { id: 'vector', type: 'VECTOR', label: 'VECTOR' },
          { id: 'path_out', type: 'STRING', label: 'PATH OUT' },
          { id: 'crs', type: 'STRING', label: 'CRS' },
          { id: 'extent', type: 'EXTENT', label: 'EXTENT' },
          { id: 'geometry', type: 'STRING', label: 'GEOMETRY' },
          { id: 'feature_count', type: 'INT', label: 'FEATURE COUNT' }
        ],
        params: { file_path: "./test_data/noaa_florida/Orange_County_Tracts_2020.shp", layer_name: "" },
        custom_ui: GdbLayerSelector
      },
      {
        id: 'core_create_vector', name: "Create Feature Class", type: 'process', icon: <Hexagon size={14} />, color: 'bg-blue-600', border: 'border-blue-500',
        description: "Creates an empty feature class (shapefile) or an AOI polygon, serving as a blank canvas for vectors.",
        params: { out_feature_class: "new_vector.shp", crs: "EPSG:4326" }
      },
      {
        id: 'core_create_raster', name: "Create Constant Raster", type: 'process', icon: <ImageIcon size={14} />, color: 'bg-blue-600', border: 'border-blue-500',
        description: "Creates a new constant value raster based on an input extent and resolution.",
        params: { cell_size: 10, value: 0, crs: "EPSG:4326" }
      }
    ]
  },
  {
    name: "Open Data WFS (Free)", icon: <Cloud size={18} className="text-cyan-400" />,
    tools: [
      {
        id: 'wfs_sentinel2', name: "Sentinel-2 (AWS)", type: 'input', icon: <Cloud size={14} />, color: 'bg-cyan-700', border: 'border-cyan-500',
        description: "Streams Cloud Optimized GeoTIFFs (COGs) from AWS Earth Search based on an AOI. Includes temporal filtering.",
        inputs: [{ id: 'extent', type: 'EXTENT', label: 'AOI' }],
        outputs: [{ id: 'raster', type: 'RASTER', label: 'RASTER' }],
        params: { max_cloud_cover: 10, start_date: { value: "2023-01-01", type: "date" }, end_date: { value: "2023-12-31", type: "date" }, out_folder: "./sentinel_data", selected_items: "", selected_bands: "B02,B03,B04,B08" }
      },
      {
        id: 'wfs_sentinel1', name: "Sentinel-1 (SAR)", type: 'input', icon: <Satellite size={14} />, color: 'bg-cyan-700', border: 'border-cyan-500',
        description: "Streams Synthetic Aperture Radar (SAR) imagery via Planetary Computer. Perfect for cloud penetration.",
        inputs: [{ id: 'extent', type: 'EXTENT', label: 'AOI' }],
        outputs: [{ id: 'raster', type: 'RASTER', label: 'SAR' }],
        params: { start_date: { value: "2023-01-01", type: "date" }, end_date: { value: "2023-12-31", type: "date" }, selected_items: "" }
      },
      {
        id: 'wfs_elevation', name: "Pull USGS DEM", type: 'input', icon: <Layers size={14} />, color: 'bg-cyan-700', border: 'border-cyan-500',
        description: "Extracts a 3D Digital Elevation Model (DEM) natively from the USGS 3DEP Web Coverage Service.",
        params: {}
      },
      {
        id: 'wfs_arcgis_rest', name: "ArcGIS REST (MapServer)", type: 'input', icon: <Database size={14} />, color: 'bg-cyan-700', border: 'border-cyan-500',
        description: "Pulls map image data dynamically from an Esri MapServer or ImageServer.",
        params: { service_url: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer", width: 1024, height: 1024, format: "tiff" }
      },
      {
        id: 'wfs_nlcd', name: "Pull NLCD Labels", type: 'input', icon: <Grid size={14} />, color: 'bg-cyan-700', border: 'border-cyan-500',
        description: "Streams categorical ground-truth labels via the free MRLC GeoServer WCS (bypassing the AWS 403 block).",
        params: { year: { value: "2021", type: "select", options: ["2021", "2019", "2016", "2011", "2001"] }, product: { value: "Land_Cover", type: "select", options: ["Land_Cover", "Impervious"] } }
      },
      {
        id: 'wfs_sciencebase', name: "USGS ScienceBase", type: 'input', icon: <DownloadCloud size={14} />, color: 'bg-cyan-700', border: 'border-cyan-500',
        description: "Downloads raw science assets directly from the USGS ScienceBase catalog using sciencebasepy.",
        params: { item_id: "655ceb8ad34ee4b6e05cc51a", out_folder: "./sb_downloads" }
      },
      {
        id: 'wfs_census', name: "US Census Tracts", type: 'input', icon: <MapIcon size={14} />, color: 'bg-cyan-700', border: 'border-cyan-500',
        description: "Downloads official TIGER shapefiles directly from the US Census Bureau.",
        params: { state_fips: 12, county_fips: 95, year: 2020 }
      },
      {
        id: 'wfs_universal', name: "Universal REST/WFS", type: 'input', icon: <Globe size={14} />, color: 'bg-cyan-700', border: 'border-cyan-500',
        description: "Connects to ANY global Open Data portal (e.g., Thai MOT, EU Inspire) via GeoJSON or REST API endpoints.",
        params: { url: "https://datagov.mot.go.th/dataset/...", format: { value: "GeoJSON", type: "select", options: ["GeoJSON", "ESRI REST", "WFS"] } }
      }
    ]
  },
  {
    name: "Sovereign WFS (Auth)", icon: <Satellite size={18} className="text-blue-400" />,
    tools: [
      {
        id: 'wfs_copernicus', name: "Copernicus Data Space", type: 'input', icon: <Satellite size={14} />, color: 'bg-blue-600', border: 'border-blue-500',
        description: "Connects directly to the ESA Copernicus Data Space Ecosystem (CDSE) to query Sentinel-1, 2, 3, 5P, and Landsat data using OData.",
        params: {
          collection: { value: "SENTINEL-1", type: "select", options: ["SENTINEL-1", "SENTINEL-2", "SENTINEL-3", "SENTINEL-5P", "LANDSAT-8", "LANDSAT-9"] },
          product_type: { value: "IW_SLC__1S", type: "select", options: ["IW_SLC__1S", "IW_GRDH_1S", "S2MSI1C", "S2MSI2A", "SY_2_SYN___"] },
          start_date: { value: "2024-01-01T00:00", type: "datetime-local" },
          end_date: { value: "2024-12-31T23:59", type: "datetime-local" },
          cdse_token: "DEMO_TOKEN_REQUIRED",
          out_feature_class: "copernicus_metadata.json"
        }
      }
    ]
  },
  {
    name: "OpenEO Cloud Dispatch", icon: <Cloud size={18} className="text-blue-400" />,
    tools: [
      {
        id: 'openeo_authenticate', name: "CDSE Authenticate", type: 'input', icon: <Activity size={14} />, color: 'bg-blue-700', border: 'border-blue-500',
        description: "Authenticates with Copernicus Data Space Ecosystem via OIDC.",
        params: { method: { value: "OIDC", type: "select", options: ["OIDC", "Basic", "Refresh Token"] }, token: "" }
      },
      {
        id: 'openeo_load_collection', name: "Cloud Data Cube", type: 'transform', icon: <Grid size={14} />, color: 'bg-blue-600', border: 'border-blue-400',
        description: "Loads a massive Earth Observation data cube on the remote OpenEO cluster.",
        params: { collection: { value: "SENTINEL2_L2A", type: "select", options: ["SENTINEL1_GRD", "SENTINEL2_L2A", "SENTINEL3_OLCI"] }, start_date: { value: "2023-01-01", type: "date" }, end_date: { value: "2023-12-31", type: "date" }, bands: "B04,B08,B11" }
      },
      {
        id: 'openeo_train_rf', name: "Cloud Train Random Forest", type: 'transform', icon: <Activity size={14} />, color: 'bg-fuchsia-700', border: 'border-fuchsia-500',
        description: "Dispatches a Random Forest training job directly onto the ESA cloud supercomputers.",
        params: { num_trees: 200, max_depth: 20 }
      },
      {
        id: 'openeo_predict', name: "Cloud Batch Prediction", type: 'endpoint', icon: <DownloadCloud size={14} />, color: 'bg-indigo-600', border: 'border-indigo-400',
        description: "Executes a cloud batch job for inference and downloads the resulting GeoTIFF.",
        params: { out_format: { value: "GTiff", type: "select", options: ["GTiff", "NetCDF"] }, prefix: "dynamic_landcover", max_credits: 100 }
      }
    ]
  },
  {
    name: "Image Analyst (ia)", icon: <Layers size={18} className="text-emerald-500/70" />,
    tools: [
      {
        id: 'ia_ndvi', name: "NDVI Calculator", type: 'process', icon: <Leaf size={14} />, color: 'bg-emerald-600', border: 'border-emerald-500',
        description: "Calculates the Normalized Difference Vegetation Index. Note: For Sentinel-2 (AWS 4B) use Red=3, NIR=4. For standard Sentinel-2 (L2A 13-band) use Red=4, NIR=8.",
        params: { nir_band: 4, red_band: 3 }
      },
      {
        id: 'ia_pansharpen', name: "Pansharpen Image", type: 'process', icon: <ImageIcon size={14} />, color: 'bg-emerald-600', border: 'border-emerald-500',
        description: "Fuses high-res black-and-white panchromatic data with blurry color data to create a high-res color output.",
        params: { method: { value: "BROVEY", type: "select", options: ["BROVEY", "ESRI", "IHS", "Gram-Schmidt"] } }
      },
      {
        id: 'ia_reclassify', name: "Reclassify Pixels", type: 'process', icon: <PaintBucket size={14} />, color: 'bg-emerald-600', border: 'border-emerald-500',
        description: "Maps pixel values to new integer classes. Use discrete (21:1), ranges (-1.0~0.0:1), or fallback (*:0).",
        params: { remap_string: "-1~0:1, 0~0.2:2, 0.2~0.4:3, 0.4~1.0:4, *:0" }
      },
      {
        id: 'ia_export_dl', name: "Export DL Tensors", type: 'process', icon: <Grid size={14} />, color: 'bg-emerald-600', border: 'border-emerald-500',
        description: "Chips massive rasters and paired ground-truth labels into perfectly sized tensors for PyTorch AI training.",
        params: { out_folder: "./dl_chips", tile_size: 256, stride: 128, shuffle: true }
      },
      {
        id: 'ia_raster_math', name: "Raster Math", type: 'process', icon: <SlidersHorizontal size={14} />, color: 'bg-emerald-600', border: 'border-emerald-500',
        description: "Evaluates a mathematical expression (e.g. 'A - B' or '(A+B)/2') across two input rasters.",
        params: { expression: "A - B" }
      },
    ]
  },
  {
    name: "GeoAI (geoai)", icon: <Cpu size={18} className="text-emerald-500/70" />,
    tools: [
      {
        id: 'ai_train', name: "Train Deep Learning Model", type: 'process', icon: <Cpu size={14} />, color: 'bg-purple-600', border: 'border-purple-500',
        description: "Ingests exported DL chips and trains a PyTorch Neural Network (U-Net, ResNet) for semantic segmentation or object detection.",
        params: { out_folder: "./trained_model", max_epochs: 20, batch_size: 4, model_type: { value: "UNET", type: "select", options: ["UNET", "MASKRCNN", "DEEPLAB", "SEGFORMER"] } }
      },
      {
        id: 'ai_detect', name: "Detect Objects", type: 'process', icon: <Crosshair size={14} />, color: 'bg-purple-600', border: 'border-purple-500',
        description: "Executes a pre-trained Deep Learning vision model across an input raster to extract vector features.",
        params: { out_shp: "pools.shp", model: { value: "facebook/detr-resnet-50", type: "select", options: ["facebook/detr-resnet-50", "facebook/mask2former-swin"] } }
      },
      {
        id: 'ai_classify', name: "Classify Pixels", type: 'process', icon: <ImageIcon size={14} />, color: 'bg-purple-600', border: 'border-purple-500',
        description: "Performs Semantic Segmentation using Transformers to classify land cover (trees, roads, buildings).",
        params: { out_raster: "classified_mask.tif", model: { value: "nvidia/segformer-b0-finetuned-ade-512-512", type: "select", options: ["nvidia/segformer-b0-finetuned-ade-512-512", "nvidia/segformer-b1-finetuned-cityscapes-1024-1024"] } }
      },
      {
        id: 'ai_insight', name: "Generate Insight (LLM)", type: 'process', icon: <Brain size={14} />, color: 'bg-indigo-700', border: 'border-indigo-500',
        description: "Sends geospatial metadata or stats to an LLM (Hugging Face) to generate natural language intelligence reports.",
        params: { prompt: "Analyze this spatial variance.", model_name: { value: "huggingface/transformers", type: "select", options: ["huggingface/transformers", "ollama/llama3", "anthropic/claude"] } }
      },
      {
        id: 'ai_generate', name: "Super-Resolution (GAN)", type: 'process', icon: <Sparkles size={14} />, color: 'bg-pink-700', border: 'border-pink-500',
        description: "Uses a Generative Adversarial Network to mathematically hallucinate and up-sample raw imagery (e.g., 10m to 2m resolution).",
        params: { scale_factor: { value: 2, type: "select", options: [2, 4, 8] } }
      },
      {
        id: 'ai_change_detection', name: "Change Detection", type: 'process', icon: <Compass size={14} />, color: 'bg-indigo-600', border: 'border-indigo-500',
        description: "Mathematically analyzes the structural variance between a PRE and POST temporal raster.",
        params: { method: { value: "absolute_difference", type: "select", options: ["absolute_difference"] }, threshold: 0.1, out_raster: "change_mask.tif" }
      },
      {
        id: 'ai_rl', name: "Agentic Optimizer (RL)", type: 'process', icon: <RefreshCcw size={14} />, color: 'bg-orange-600', border: 'border-orange-500',
        description: "Unleashes an autonomous Reinforcement Learning agent to iteratively optimize geoprocessing parameters.",
        params: { target_accuracy: 95.0, max_iterations: 100 }
      },
      {
        id: 'ai_ml_train', name: "Train Classical ML", type: 'process', icon: <Cpu size={14} />, color: 'bg-rose-700', border: 'border-rose-500',
        description: "Trains a Classical Machine Learning algorithm using pixel spectral signatures and vector polygons.",
        params: { algorithm: { value: "RANDOM_FOREST", type: "select", options: ["RANDOM_FOREST", "XGBOOST", "SVM", "MAX_LIKELIHOOD"] }, max_trees: 50, out_model: "ml.model" }
      },
      {
        id: 'ai_ml_predict', name: "Predict Classical ML", type: 'process', icon: <ImageIcon size={14} />, color: 'bg-rose-700', border: 'border-rose-500',
        description: "Executes a trained Classical ML model over a raster to produce a classified land cover map.",
        params: { out_raster: "ml_classified.tif" }
      },
      {
        id: 'ml_pytorch_inference', name: "PyTorch Tensor Brew", type: 'process', icon: <BrainCircuit size={14} />, color: 'bg-red-700', border: 'border-red-500',
        description: "Runs advanced PyTorch model inference on raster imagery.",
        params: { model_script_path: "./dummy_model.py", tile_size: 256, batch_size: 4, device: { value: "cpu", type: "select", options: ["cpu", "cuda"] }, out_raster: "pytorch_inference_out.tif" }
      },
    ]
  },
  {
    name: "Data Management", icon: <Settings size={18} className="text-emerald-500/70" />,
    tools: [
      {
        id: 'mgt_array_index', name: "Array Indexer", type: 'process', icon: <ListFilter size={14} />, color: 'bg-slate-600', border: 'border-slate-500',
        description: "Extracts a single item from an array payload (like isolating the 2nd chip of a multi-AOI Sentinel-2 pull).",
        params: { index: 0 }
      },
      {
        id: 'mgt_extract_band', name: "Extract Band", type: 'process', icon: <Layers size={14} />, color: 'bg-slate-600', border: 'border-slate-500',
        description: "Extracts a specific single band from a multi-band raster (e.g. Band 1 VV from SAR, or Band 4 NIR from Sentinel-2).",
        params: { band_index: 1 }
      },
      {
        id: 'mgt_clip', name: "Clip to AOI", type: 'process', icon: <Scissors size={14} />, color: 'bg-slate-600', border: 'border-slate-500',
        description: "Extracts a spatial subset of a raster or vector based on a drawn Spatial Extent node.",
        inputs: [
            { id: 'target_in', type: 'ANY', label: 'TARGET IN' },
            { id: 'clip_extent', type: 'EXTENT', label: 'CLIP EXTENT' }
        ],
        outputs: [
            { id: 'clipped_out', type: 'ANY', label: 'CLIPPED OUT' }
        ],
        params: {}
      },
      {
        id: 'mgt_buffer', name: "Buffer", type: 'process', icon: <CircleDashed size={14} />, color: 'bg-slate-600', border: 'border-slate-500',
        description: "Creates polygon boundaries at a specified distance around input vector features.",
        inputs: [
            { id: 'vector_in', type: 'VECTOR', label: 'VECTOR IN' },
            { id: 'set_distance', type: 'FLOAT', label: 'SET DISTANCE' },
            { id: 'set_unit', type: 'STRING', label: 'SET UNIT' }
        ],
        outputs: [
            { id: 'vector_out', type: 'VECTOR', label: 'VECTOR OUT' },
            { id: 'distance', type: 'FLOAT', label: 'DISTANCE' },
            { id: 'unit', type: 'STRING', label: 'UNIT' }
        ],
        params: { distance: 50, unit: { value: "Meters", type: "select", options: ["Meters", "Kilometers", "Feet", "Miles"] } }
      },
      {
        id: 'mgt_intersect', name: "Intersect", type: 'process', icon: <Layers size={14} />, color: 'bg-slate-600', border: 'border-slate-500',
        description: "Computes a geometric intersection of the input features.",
        inputs: [
            { id: 'vector_a', type: 'VECTOR', label: 'VECTOR A' },
            { id: 'vector_b', type: 'VECTOR', label: 'VECTOR B' }
        ],
        outputs: [
            { id: 'vector_out', type: 'VECTOR', label: 'VECTOR OUT' }
        ],
        params: {}
      },
      {
        id: 'mgt_calculate_geometry', name: "Calculate Geometry", type: 'process', icon: <MapIcon size={14} />, color: 'bg-slate-600', border: 'border-slate-500',
        description: "Adds information to a feature's attribute fields representing spatial characteristics like Area, Length, and Centroid Coordinates.",
        inputs: [
            { id: 'vector_in', type: 'VECTOR', label: 'VECTOR IN' }
        ],
        outputs: [
            { id: 'vector_out', type: 'VECTOR', label: 'VECTOR OUT' }
        ],
        params: { property: { value: "Area", type: "select", options: ["Area", "Area (geodesic)", "Length", "Length (geodesic)", "Centroid x-coordinate", "Centroid y-coordinate", "Point x-coordinate", "Point y-coordinate"] }, unit: { value: "Meters", type: "select", options: ["Meters", "Kilometers", "Square Meters", "Hectares"] } }
      },
      {
        id: 'mgt_append_attribute', name: "Append Attribute", type: 'process', icon: <Database size={14} />, color: 'bg-slate-600', border: 'border-slate-500',
        description: "Appends a standalone array/list of values into a Vector shapefile as a new attribute column.",
        inputs: [
            { id: 'vector_in', type: 'VECTOR', label: 'VECTOR IN' },
            { id: 'array_in', type: 'ANY', label: 'ARRAY IN' }
        ],
        outputs: [
            { id: 'vector_out', type: 'VECTOR', label: 'VECTOR OUT' }
        ],
        params: { field_name: "new_field" }
      },
      {
        id: 'mgt_erase', name: "Erase", type: 'process', icon: <Scissors size={14} />, color: 'bg-slate-600', border: 'border-slate-500',
        description: "Creates a feature class by overlaying the Input Features with the polygons of the Erase Features.",
        params: {}
      },
      {
        id: 'mgt_merge', name: "Merge", type: 'process', icon: <Layers size={14} />, color: 'bg-slate-600', border: 'border-slate-500',
        description: "Combines multiple input datasets of the same data type into a single, new output dataset.",
        params: {}
      },
      {
        id: 'mgt_project_raster', name: "Project Raster", type: 'process', icon: <MapIcon size={14} />, color: 'bg-slate-600', border: 'border-slate-500',
        description: "Warps a raster image from one coordinate system to another.",
        params: { out_crs: "EPSG:6438", resampling: { value: "NEAREST", type: "select", options: ["NEAREST", "BILINEAR", "CUBIC", "MAJORITY"] } }
      },
      {
        id: 'mgt_project_vector', name: "Project Vector", type: 'process', icon: <MapIcon size={14} />, color: 'bg-slate-600', border: 'border-slate-500',
        description: "Projects spatial data from one coordinate system to another.",
        inputs: [
            { id: 'vector_in', type: 'VECTOR', label: 'VECTOR IN' },
            { id: 'set_out_crs', type: 'STRING', label: 'SET OUT CRS' }
        ],
        outputs: [
            { id: 'vector_out', type: 'VECTOR', label: 'VECTOR OUT' },
            { id: 'out_crs', type: 'STRING', label: 'OUT CRS' }
        ],
        params: { out_crs: "EPSG:6438", out_feature_class: "projected_vector.shp" }
      },
      {
        id: 'mgt_create_fishnet', name: "Create Fishnet (Tiling)", type: 'process', icon: <Grid size={14} />, color: 'bg-slate-600', border: 'border-slate-500',
        description: "Creates a grid of rectangular cells (tessellation) over an extent. Essential for batch-processing massive areas.",
        params: { cell_width: 2560, cell_height: 2560 }
      },
      {
        id: 'mgt_pyramids', name: "Build Pyramids & Stats", type: 'process', icon: <Layers size={14} />, color: 'bg-slate-600', border: 'border-slate-500',
        description: "Calculates multi-band statistics and builds internal overviews (pyramids) for massive speed boosts when rendering in desktop software.",
        params: { build_pyramids: true, calculate_stats: true }
      },
      {
        id: 'db_export_postgis', name: "PostGIS Exporter", type: 'endpoint', icon: <Database size={14} />, color: 'bg-indigo-600', border: 'border-indigo-500',
        description: "Pushes the incoming vector dataset directly into a remote PostGIS database table.",
        params: { connection_name: "", table_name: "new_table", if_exists: { value: "replace", type: "select", options: ["fail", "replace", "append"] } }
      },
      {
        id: 'export_to_map', name: "Export to Map", type: 'endpoint', icon: <MapIcon size={14} />, color: 'bg-indigo-600', border: 'border-indigo-400',
        description: "Pushes the incoming raster or vector dataset directly to the MapViewer canvas as a new interactive layer.",
        inputs: [
            { id: 'data_in', type: 'ANY', label: 'DATA IN' }
        ],
        params: { layer_name: "My New Layer", color: "#3388ff", opacity: 0.8 }
      },
    ]
  },
  {
    name: "Logic & Variables", icon: <SlidersHorizontal size={18} className="text-yellow-500/70" />,
    tools: [
      {
        id: 'logic_string', name: "String", type: 'input', icon: <FileJson size={14} />, color: 'bg-yellow-700', border: 'border-yellow-600',
        description: "A primitive string value.",
        inputs: [],
        outputs: [{ id: 'out', label: 'STRING', type: 'STRING' }],
        params: { value: "text" }
      },
      {
        id: 'logic_integer', name: "Integer", type: 'input', icon: <Hash size={14} />, color: 'bg-yellow-700', border: 'border-yellow-600',
        description: "A primitive whole number.",
        inputs: [],
        outputs: [{ id: 'out', label: 'INT', type: 'INT' }],
        params: { value: 0 }
      },
      {
        id: 'logic_float', name: "Float", type: 'input', icon: <Hash size={14} />, color: 'bg-yellow-700', border: 'border-yellow-600',
        description: "A primitive decimal number.",
        inputs: [],
        outputs: [{ id: 'out', label: 'FLOAT', type: 'FLOAT' }],
        params: { value: 0.0 }
      },
      {
        id: 'logic_boolean', name: "Boolean", type: 'input', icon: <ToggleLeft size={14} />, color: 'bg-yellow-700', border: 'border-yellow-600',
        description: "A primitive true/false value.",
        inputs: [],
        outputs: [{ id: 'out', label: 'BOOL', type: 'BOOL' }],
        params: { value: true }
      },
      {
        id: 'core_date_variable', name: "Date Variable", type: 'input', icon: <Calendar size={14} />, color: 'bg-yellow-600', border: 'border-yellow-500',
        description: "Defines a chronological date string or range (YYYY-MM-DD). Translates to {{ ds }} in Airflow.",
        inputs: [],
        outputs: [
          { id: 'start', label: 'START', type: 'STRING' },
          { id: 'end', label: 'END', type: 'STRING' }
        ],
        params: { start_date: new Date().toISOString().split('T')[0], end_date: "" }
      },
      {
        id: 'logic_math_add', name: "Math Add", type: 'process', icon: <Cpu size={14} />, color: 'bg-yellow-600', border: 'border-yellow-500',
        description: "Adds value A and value B together.",
        inputs: [{ id: 'a', type: 'FLOAT', label: 'A' }, { id: 'b', type: 'FLOAT', label: 'B' }],
        outputs: [{ id: 'out', type: 'FLOAT', label: 'RESULT' }],
        params: { value_a: 0.0, value_b: 0.0 }
      },
      {
        id: 'logic_math_subtract', name: "Math Subtract", type: 'process', icon: <Cpu size={14} />, color: 'bg-yellow-600', border: 'border-yellow-500',
        description: "Subtracts value B from value A.",
        inputs: [{ id: 'a', type: 'FLOAT', label: 'A' }, { id: 'b', type: 'FLOAT', label: 'B' }],
        outputs: [{ id: 'out', type: 'FLOAT', label: 'RESULT' }],
        params: { value_a: 0.0, value_b: 0.0 }
      },
      {
        id: 'logic_math_multiply', name: "Math Multiply", type: 'process', icon: <Cpu size={14} />, color: 'bg-yellow-600', border: 'border-yellow-500',
        description: "Multiplies value A and value B together.",
        inputs: [{ id: 'a', type: 'FLOAT', label: 'A' }, { id: 'b', type: 'FLOAT', label: 'B' }],
        outputs: [{ id: 'out', type: 'FLOAT', label: 'RESULT' }],
        params: { value_a: 0.0, value_b: 0.0 }
      },
      {
        id: 'logic_math_divide', name: "Math Divide", type: 'process', icon: <Cpu size={14} />, color: 'bg-yellow-600', border: 'border-yellow-500',
        description: "Divides value A by value B.",
        inputs: [{ id: 'a', type: 'FLOAT', label: 'A' }, { id: 'b', type: 'FLOAT', label: 'B' }],
        outputs: [{ id: 'out', type: 'FLOAT', label: 'RESULT' }],
        params: { value_a: 0.0, value_b: 1.0 }
      },
      {
        id: 'logic_extract_attr', name: "Extract Attribute", type: 'process', icon: <Database size={14} />, color: 'bg-yellow-600', border: 'border-yellow-500',
        description: "Extracts a scalar value from a Vector dataset column (e.g. max area, first ID).",
        params: { column: "Shape_Area", statistic: { value: "first", type: "select", options: ["first", "max", "min", "mean", "sum"] } }
      },
    ]
  },
  {
    name: "Conversion Tools", icon: <FileOutput size={18} className="text-orange-400" />,
    tools: [
      {
        id: 'conv_raster_to_polygon', name: "Raster to Polygon", type: 'process', icon: <Hexagon size={14} />, color: 'bg-orange-600', border: 'border-orange-500',
        description: "Converts a classified pixel mask (e.g. AI inference output) into discrete vector polygons (Shapefile/GeoJSON).",
        params: { out_polygon_features: "extracted_features.shp", background_value: 0 }
      },
    ]
  },
  {
    name: "Data ETL Pipelines", icon: <Database size={18} className="text-indigo-400" />,
    tools: [
      {
        id: 'etl_spatial_join', name: "Spatial Join", type: 'process', icon: <MapIcon size={14} />, color: 'bg-indigo-600', border: 'border-indigo-500',
        description: "Joins attributes from one feature to another based on spatial relationship.",
        params: { join_operation: { value: "JOIN_ONE_TO_ONE", type: "select", options: ["JOIN_ONE_TO_ONE", "JOIN_ONE_TO_MANY"] } }
      },
      {
        id: 'etl_vector_converter', name: "Vector Converter", type: 'process', icon: <Layers size={14} />, color: 'bg-indigo-600', border: 'border-indigo-500',
        description: "Converts vector inputs between Shapefile, GeoJSON, and GPKG on-the-fly.",
        params: { target_format: { value: ".geojson", type: "select", options: [".geojson", ".shp", ".gpkg"] } }
      },
      {
        id: 'etl_field_calc', name: "Field Calculator", type: 'process', icon: <Wrench size={14} />, color: 'bg-indigo-600', border: 'border-indigo-500',
        description: "Calculates the values of a field for a feature class.",
        params: { field_name: "NEW_AREA", expression: "!shape.area@squaremeters!" }
      },
      {
        id: 'etl_db_writer', name: "PostGIS Writer", type: 'endpoint', icon: <Database size={14} />, color: 'bg-indigo-600', border: 'border-indigo-500',
        description: "Writes the output vector directly into a PostGIS database.",
        params: { connection_string: "postgresql://user:pass@localhost:5432/db", table_name: "output_table" }
      }
    ]
  },
  {
    name: "Spectral Processing", icon: <Layers size={18} className="text-pink-400" />,
    tools: [
      {
        id: 'envi_band_math', name: "Band Math", type: 'process', icon: <SlidersHorizontal size={14} />, color: 'bg-pink-600', border: 'border-pink-500',
        description: "Performs mathematical operations on image bands.",
        params: { expression: "(b1 - b2) / (b1 + b2)" }
      },
      {
        id: 'envi_pca', name: "Principal Components", type: 'process', icon: <LineChart size={14} />, color: 'bg-pink-600', border: 'border-pink-500',
        description: "Performs Principal Component Analysis (PCA) to reduce spectral dimensionality.",
        params: { components_to_retain: 3 }
      },
      {
        id: 'envi_tasseled_cap', name: "Tasseled Cap", type: 'process', icon: <Leaf size={14} />, color: 'bg-pink-600', border: 'border-pink-500',
        description: "Calculates Tasseled Cap transformation (Brightness, Greenness, Wetness).",
        params: { sensor: { value: "Landsat_8", type: "select", options: ["Landsat_8", "Sentinel_2", "Landsat_5"] } }
      },
      {
        id: 'ia_glcm', name: "GLCM Textural Features", type: 'process', icon: <Grid size={14} />, color: 'bg-pink-600', border: 'border-pink-500',
        description: "Computes Gray-Level Co-occurrence Matrix textural features (Contrast, Correlation, Entropy, etc.).",
        params: { window_size: { value: "3x3", type: "select", options: ["3x3", "5x5", "7x7", "9x9", "11x11", "15x15"] }, shift_x: 1, shift_y: 1 },
        reference_keys: ["haralick_1973"]
      }
    ]
  },
  {
    name: "Spatial Statistics", icon: <LineChart size={18} className="text-rose-400" />,
    tools: [
      {
        id: 'stats_confusion_matrix', name: "Compute Confusion Matrix", type: 'process', icon: <Grid size={14} />, color: 'bg-rose-600', border: 'border-rose-500',
        description: "Compares ground truth labels against AI classifications. Calculates User/Producer accuracies and Kappa coefficients.",
        params: { out_table: "confusion_matrix.csv" }
      },
    ]
  },
  {
    name: "Tensor Brew Deep Learning", icon: <BrainCircuit size={18} className="text-violet-400" />,
    tools: [
      {
        id: 'ml_pytorch_inference', name: "PyTorch Inference", type: 'process', icon: <Brain size={14} />, color: 'bg-violet-600', border: 'border-violet-500',
        description: "Executes a custom compiled PyTorch neural network against a raster. Automatically tiles and batches the imagery.",
        params: { model_script_path: "./magpi_scratch/model.py", out_raster: "prediction.tif", tile_size: 256, batch_size: 4, device: { value: "cuda", type: "select", options: ["cuda", "cpu"] } }
      },
    ]
  },
  {
    name: "Optical Sensor Analytics", icon: <Globe size={18} className="text-amber-400" />,
    tools: [
      {
        id: 'optical_atm_corr', name: "Atmospheric Correction", type: 'process', icon: <Cloud size={14} />, color: 'bg-amber-600', border: 'border-amber-500',
        description: "Applies Dark Object Subtraction (DOS) or Top of Atmosphere (TOA) reflectance correction using satellite XML metadata.",
        params: { method: { value: "DOS", type: "select", options: ["DOS", "TOA Reflectance"] }, out_raster: "atm_corrected.tif" }
      },
      {
        id: 'optical_rpc_ortho', name: "RPC Orthorectification", type: 'process', icon: <Grid size={14} />, color: 'bg-amber-600', border: 'border-amber-500',
        description: "Orthorectifies raw satellite imagery (e.g. WorldView) using Rational Polynomial Coefficients (RPCs) and a DEM.",
        params: { out_raster: "ortho_imagery.tif" }
      },
    ]
  },
  {
    name: "Photogrammetry & Metrology", icon: <Compass size={18} className="text-fuchsia-400" />,
    tools: [
      {
        id: 'photo_shadow_mask', name: "Shadow Parallax Mask", type: 'process', icon: <Box size={14} />, color: 'bg-fuchsia-600', border: 'border-fuchsia-500',
        description: "Projects building footprints using solar azimuth/elevation to mask out moving shadows that cause false-positives in Change Detection.",
        params: { solar_azimuth: 135.5, solar_elevation: 45.0, in_buildings: "buildings.shp", out_mask: "shadow_mask.tif" }
      },
      {
        id: 'photo_tie_points', name: "Auto Tie-Point Generation", type: 'process', icon: <Crosshair size={14} />, color: 'bg-fuchsia-600', border: 'border-fuchsia-500',
        description: "Exploits building corners and shadow parallax to automatically generate Ground Control Points (GCPs) for co-registering unaligned imagery.",
        params: { method: { value: "SHADOW_CORNERS", type: "select", options: ["SHADOW_CORNERS", "SIFT", "SURF"] }, out_points: "tie_points.shp" }
      },
    ]
  },
  {
    name: "Web Services & Scraping", icon: <Globe size={18} className="text-cyan-400" />,
    tools: [
      {
        id: 'humangeo_osm_extract', name: "OSM Overpass Scraper", type: 'process', icon: <MapIcon size={14} />, color: 'bg-cyan-600', border: 'border-cyan-500',
        description: "Scrapes global vector features (buildings, roads, amenities) directly from OpenStreetMap within the specified extent.",
        params: { feature_type: { value: "buildings", type: "select", options: ["buildings", "roads", "water", "amenities", "landuse"] }, out_vector: "osm_extract.geojson" }
      },
      {
        id: 'humangeo_worldpop', name: "WorldPop Ingestor", type: 'process', icon: <Users size={14} />, color: 'bg-cyan-600', border: 'border-cyan-500',
        description: "Downloads high-resolution unconstrained global population density rasters directly from the WorldPop API.",
        params: { iso3_country: "HTI", year: "2020", out_raster: "worldpop.tif" }
      },
    ]
  },
  {
    name: "Plenum View & Space Weather", icon: <Satellite size={18} className="text-blue-500" />,
    tools: [
      {
        id: 'plenum_fits_ingest', name: "FITS Ingestor", type: 'input', icon: <Box size={14} />, color: 'bg-blue-700', border: 'border-blue-600',
        description: "Ingests NASA Flexible Image Transport System (FITS) astronomical data into the processing matrix.",
        params: { file_path: "input_telescope.fits", out_raster: "fits_converted.tif" }
      },
      {
        id: 'plenum_space_weather', name: "Live Space Weather", type: 'endpoint', icon: <Activity size={14} />, color: 'bg-blue-700', border: 'border-blue-600',
        description: "Streams live Geomagnetic Storm (Kp index) and Solar Flare data from the NOAA SWPC API.",
        params: { out_json: "space_weather.json" }
      },
      {
        id: 'plenum_starlink', name: "EM Mesh Tracker", type: 'process', icon: <Satellite size={14} />, color: 'bg-blue-700', border: 'border-blue-600',
        description: "Maps live Orbital Elements (TLEs) to track the active Starlink constellation in the Plenum View.",
        params: { out_vector: "starlink_mesh.geojson" }
      },
    ]
  }
];

export default function Toolbox({
  activeRightTab, setActiveRightTab,
  selectedNode, updateNodeParam, updateNodeName, deleteNode, addNode, duplicateNode,
  openFileBrowser, nodes, connections, handleRunUpToNode, masterReferences, masterGisServers
}) {
  const [expandedCategories, setExpandedCategories] = useState({});
  const [searchQuery, setSearchQuery] = useState('');

  const [hoveredTool, setHoveredTool] = useState(null);
  const [mouseY, setMouseY] = useState(0);

  const [metadata, setMetadata] = useState({});
  const [loadingMeta, setLoadingMeta] = useState(false);

  const [stacResults, setStacResults] = useState([]);
  const [stacLoading, setStacLoading] = useState(false);
  const [stacError, setStacError] = useState(null);

  const [communityCategories, setCommunityCategories] = useState([]);

  React.useEffect(() => {
    fetch(`http://${window.location.hostname}:8080/api/community_nodes`)
      .then(r => r.json())
      .then(data => {
        if (data.status === 'success' && data.nodes && data.nodes.length > 0) {
           setCommunityCategories([{
             name: "Community Plugins", icon: <Sparkles size={18} className="text-amber-400" />,
             tools: data.nodes
           }]);
        }
      })
      .catch(e => console.log("Failed to fetch community nodes", e));
  }, []);

  const toggleCategory = (name) => setExpandedCategories(prev => ({ ...prev, [name]: !prev[name] }));

  const handleDragStart = (e, tool) => {
    const dragPayload = { ...tool, _icon_key: tool.icon?.type?.name || 'Settings' };
    e.dataTransfer.setData("application/reactflow", JSON.stringify(dragPayload));
    e.dataTransfer.effectAllowed = 'move';
    window.__draggedMagPITool = dragPayload; // Robust fallback for ReactFlow drop
    setHoveredTool(null);
  };

  const ALL_CATEGORIES = [...TOOLBOX_CATEGORIES, ...communityCategories];

  const filteredCategories = ALL_CATEGORIES.map(cat => ({
    ...cat, tools: cat.tools.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()) || t.id.toLowerCase().includes(searchQuery.toLowerCase()))
  })).filter(cat => cat.tools.length > 0);

  const fetchMetadata = async (filePath, nodeId) => {
    setLoadingMeta(true);
    // Mark as fetching immediately to prevent duplicate calls
    setMetadata(prev => ({ ...prev, [nodeId]: { ...(prev[nodeId] || {}), fetching: true } }));
    try {
      const response = await fetch(`http://${window.location.hostname}:8080/api/describe?file=${encodeURIComponent(filePath)}`);
      const data = await response.json();

      if (response.ok) {
        setMetadata(prev => ({ ...prev, [nodeId]: { data, error: null, fetching: false } }));
      } else {
        setMetadata(prev => ({ ...prev, [nodeId]: { data: null, error: data.error, fetching: false } }));
      }
    } catch (err) {
      setMetadata(prev => ({ ...prev, [nodeId]: { data: null, error: "Daemon offline or unreachable.", fetching: false } }));
    } finally {
      setLoadingMeta(false);
    }
  };

  // Auto-describe feature: When a dataset is dropped/inspected, automatically fetch its metadata
  React.useEffect(() => {
    if (activeRightTab === 'inspector' && selectedNode && selectedNode.params && selectedNode.params.file_path) {
      if (!metadata[selectedNode.id] || metadata[selectedNode.id].error === "Daemon offline or unreachable.") {
        fetchMetadata(selectedNode.params.file_path, selectedNode.id);
      }
    }
  }, [activeRightTab, selectedNode?.id, selectedNode?.params?.file_path]);

  const fetchStacCatalog = async (nodeId, bbox, max_cloud_cover, date_range) => {
    setStacLoading(true);
    setStacError(null);
    try {
      let parsedBbox = [-180, -90, 180, 90];

      // Look for connected Spatial Extent nodes if none provided
      if (!bbox || bbox.length !== 4) {
        const incomingEdges = connections.filter(c => c.to === nodeId);
        if (incomingEdges.length > 0) {
          const extentNodes = incomingEdges
            .map(edge => nodes.find(n => n.id === edge.from))
            .filter(n => n && n.toolId === 'core_extent' && n.params);

          if (extentNodes.length > 0) {
            let minX = 180, minY = 90, maxX = -180, maxY = -90;
            extentNodes.forEach(node => {
              minX = Math.min(minX, parseFloat(node.params.xmin));
              minY = Math.min(minY, parseFloat(node.params.ymin));
              maxX = Math.max(maxX, parseFloat(node.params.xmax));
              maxY = Math.max(maxY, parseFloat(node.params.ymax));
            });
            parsedBbox = [minX, minY, maxX, maxY];
          }
        }
      } else {
        parsedBbox = bbox;
      }

      const payload = {
        bbox: parsedBbox,
        max_cloud_cover: max_cloud_cover,
        date_range: date_range
      };

      const response = await fetch(`http://${window.location.hostname}:8080/api/stac_query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();

      if (response.ok && data.results) {
        setStacResults(data.results);
      } else {
        setStacError(data.error || "Failed to query STAC");
        setStacResults([]);
      }
    } catch (err) {
      setStacError("Daemon offline or unreachable.");
      setStacResults([]);
    } finally {
      setStacLoading(false);
    }
  };

  return (
    <div
      className="w-[320px] h-full bg-slate-800 flex flex-col shadow-[-10px_0_20px_rgba(0,0,0,0.5)] z-20"
      onMouseMove={(e) => setMouseY(e.clientY)}
    >

      {hoveredTool && (
        <div
          className="fixed right-[330px] w-72 bg-slate-800 border border-slate-600 rounded-lg shadow-[0_0_40px_rgba(0,0,0,0.8)] p-4 z-50 animate-fadeIn pointer-events-none"
          style={{ top: Math.min(Math.max(mouseY - 50, 20), window.innerHeight - 150) }}
        >
          <div className="flex items-center mb-2 text-emerald-400 font-bold text-sm border-b border-slate-700 pb-2">
            <span className="bg-slate-900 p-1.5 rounded-md mr-3 shadow-inner">{hoveredTool.icon}</span>
            {hoveredTool.name}
          </div>
          <p className="text-xs text-slate-300 leading-relaxed mb-3">
            {hoveredTool.description}
          </p>
          <div className="flex items-center text-[9px] text-slate-500 uppercase tracking-widest font-bold bg-slate-900 px-2 py-1 rounded">
            <Info size={10} className="mr-1" /> Module: {hoveredTool.id.split('_')[0]}
          </div>
        </div>
      )}

      <div className="flex bg-slate-900 border-b border-slate-700">
        <button onClick={() => setActiveRightTab('toolbox')} className={`flex-1 py-4 text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-center ${activeRightTab === 'toolbox' ? 'text-emerald-400 border-b-2 border-emerald-400 bg-slate-800' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'}`}><Wrench size={12} className="mr-1" /> Tools</button>
        <button onClick={() => setActiveRightTab('inspector')} className={`flex-1 py-4 text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-center ${activeRightTab === 'inspector' ? 'text-emerald-400 border-b-2 border-emerald-400 bg-slate-800' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'}`}><SlidersHorizontal size={12} className="mr-1" /> Params</button>
        <button onClick={() => setActiveRightTab('explorer')} className={`flex-1 py-4 text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-center ${activeRightTab === 'explorer' ? 'text-emerald-400 border-b-2 border-emerald-400 bg-slate-800' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'}`}><FolderOpen size={12} className="mr-1" /> Explorer</button>
      </div>

      <div className="flex-1 overflow-y-auto bg-slate-800 flex flex-col">
        {activeRightTab === 'toolbox' && (
          <>
            <div className="p-3 pb-1 shrink-0">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500" />
                <input type="text" placeholder="Search tools..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-md pl-9 pr-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-slate-600" />
              </div>
            </div>
            <div className="p-3 space-y-3 flex-1 overflow-y-auto">
              {filteredCategories.length === 0 ? (<div className="text-center text-slate-500 text-xs mt-4">No tools found for "{searchQuery}"</div>) : (
                filteredCategories.map((cat, idx) => (
                  <div key={idx} className="bg-slate-900/80 rounded-lg border border-slate-700/80 overflow-hidden shadow-sm">
                    <button onClick={() => toggleCategory(cat.name)} className="w-full flex items-center justify-between px-4 py-3 bg-slate-800/80 hover:bg-slate-700 transition-colors">
                      <div className="flex items-center space-x-3 text-sm font-bold text-slate-200">{cat.icon}<span>{cat.name}</span></div>
                      {expandedCategories[cat.name] || searchQuery !== '' ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
                    </button>
                    {(expandedCategories[cat.name] || searchQuery !== '') && (
                      <div className="p-2 space-y-1 bg-slate-900/50">
                        {cat.tools.map(tool => (
                          <div
                            key={tool.id}
                            draggable="true"
                            onDragStart={(e) => handleDragStart(e, tool)}
                            onClick={() => { addNode(tool); setHoveredTool(null); }}
                            onMouseEnter={() => setHoveredTool(tool)}
                            onMouseLeave={() => setHoveredTool(null)}
                            className="flex items-center px-3 py-2.5 text-xs bg-slate-800 hover:bg-slate-700 rounded-md cursor-grab active:cursor-grabbing border border-transparent hover:border-emerald-500/50 transition-all group shadow-sm"
                          >
                            <div className={`w-3 h-3 rounded-full mr-3 ${tool.color} shadow-inner`}></div>
                            <span className="flex-1 text-slate-300 font-medium group-hover:text-white transition-colors">{tool.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {activeRightTab === 'inspector' && (
          <div className="p-3">
            {!selectedNode ? (
              <div className="text-center text-slate-500 mt-16 flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center mb-4 shadow-inner"><MousePointer2 size={24} className="opacity-50" /></div>
                <p className="text-sm font-medium">Select a node on the canvas to configure.</p>
              </div>
            ) : (
              <div className="space-y-4 animate-fadeIn pb-6">
                <div className={`px-2 py-2 rounded-lg text-white font-bold text-sm ${selectedNode.color} border border-t-white/20 border-b-black/50 shadow-lg flex items-center justify-between`}>
                  <div className="flex items-center flex-1 mr-2">
                    <input type="text" value={selectedNode.name} onChange={(e) => updateNodeName(selectedNode.id, e.target.value)} className="bg-transparent border-none text-white font-bold text-sm outline-none w-full focus:ring-1 focus:ring-white/50 rounded px-2 py-1 placeholder-white/50" placeholder="Node Name" />
                  </div>
                  <div className="flex space-x-2 shrink-0 pr-2">
                    <button onClick={() => handleRunUpToNode(selectedNode.id)} className="w-7 h-7 rounded bg-emerald-600 hover:bg-emerald-500 flex items-center justify-center transition-colors shadow-sm" title="Run Pipeline Up To This Node"><Play size={13} /></button>
                    <button onClick={() => duplicateNode(selectedNode.id)} className="w-7 h-7 rounded bg-black/20 hover:bg-emerald-500/80 flex items-center justify-center transition-colors shadow-sm" title="Duplicate Node"><Copy size={13} /></button>
                    <button onClick={() => deleteNode(selectedNode.id)} className="w-7 h-7 rounded bg-black/20 hover:bg-red-500/80 flex items-center justify-center transition-colors shadow-sm" title="Delete Node"><Trash2 size={13} /></button>
                  </div>
                </div>

                <div className="bg-slate-900 p-4 rounded-lg border border-slate-700 shadow-inner mb-4">
                  <h4 className="text-[10px] uppercase tracking-widest text-cyan-500 font-bold mb-4 flex items-center"><MapIcon size={12} className="mr-2" /> Visualization Settings</h4>
                  <div className="flex items-center bg-slate-800 px-3 py-2 rounded-md border border-slate-700 cursor-pointer" onClick={() => updateNodeParam(selectedNode.id, 'export_to_map', selectedNode.params?.export_to_map === false ? true : false)}>
                      <div className={`w-4 h-4 rounded-sm flex items-center justify-center mr-3 transition-colors ${(selectedNode.params?.export_to_map !== false) ? 'bg-cyan-500' : 'bg-slate-700 border border-slate-600'}`}>{(selectedNode.params?.export_to_map !== false) && <Check size={10} className="text-white" />}</div>
                      <span className={`text-sm font-medium ${(selectedNode.params?.export_to_map !== false) ? 'text-white' : 'text-slate-400'}`}>{(selectedNode.params?.export_to_map !== false) ? "Export to Maps (Active)" : "Export to Maps (Disabled)"}</span>
                  </div>
                </div>

                <div className="bg-slate-900 p-4 rounded-lg border border-slate-700 shadow-inner">
                  <h4 className="text-[10px] uppercase tracking-widest text-emerald-500 font-bold mb-4 flex items-center"><SlidersHorizontal size={12} className="mr-2" /> Parameters</h4>
                  {Object.entries(selectedNode.params || {}).filter(([key]) => key !== 'export_to_map').map(([key, val]) => {
                    const isComplexObj = val && typeof val === 'object' && val.type === 'select';
                    const isDateObj = val && typeof val === 'object' && val.type === 'date';
                    const isDateTimeObj = val && typeof val === 'object' && val.type === 'datetime-local';
                    const displayVal = (isComplexObj || isDateObj || isDateTimeObj) ? val.value : val;
                    return (
                      <div key={key} className="mb-4">
                        <label className="block text-[11px] font-bold text-slate-400 mb-1.5 uppercase tracking-wide">{key.replace(/_/g, ' ')}</label>
                        {typeof displayVal === 'boolean' ? (
                          <div className="flex items-center bg-slate-800 px-3 py-2 rounded-md border border-slate-700 cursor-pointer" onClick={() => updateNodeParam(selectedNode.id, key, !displayVal)}>
                            <div className={`w-4 h-4 rounded-sm flex items-center justify-center mr-3 transition-colors ${displayVal ? 'bg-emerald-500' : 'bg-slate-700 border border-slate-600'}`}>{displayVal && <Check size={10} className="text-white" />}</div>
                            <span className={`text-sm font-medium ${displayVal ? 'text-white' : 'text-slate-400'}`}>{displayVal ? "Enabled" : "Disabled"}</span>
                          </div>
                        ) : isComplexObj ? (
                          <div className="relative">
                            <ListFilter size={14} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500" />
                            <select value={displayVal} onChange={(e) => updateNodeParam(selectedNode.id, key, { ...val, value: e.target.value })} className="w-full bg-slate-800 border border-slate-600 rounded-md pl-9 pr-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono appearance-none cursor-pointer">{val.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}</select>
                            <ChevronDown size={14} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-500 pointer-events-none" />
                          </div>
                        ) : isDateObj ? (
                          <input type="date" value={displayVal} onChange={(e) => updateNodeParam(selectedNode.id, key, { ...val, value: e.target.value })} className="w-full bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono" />
                        ) : isDateTimeObj ? (
                          <input type="datetime-local" value={displayVal} onChange={(e) => updateNodeParam(selectedNode.id, key, { ...val, value: e.target.value })} className="w-full bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono" />
                        ) : typeof displayVal === 'number' ? (
                          <input type="number" value={displayVal} onChange={(e) => updateNodeParam(selectedNode.id, key, Number(e.target.value))} className="w-full bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono" />
                        ) : key === 'file_path' || key === 'out_folder' || key === 'out_polygon_features' || key === 'out_table' ? (
                          <div className="flex items-center space-x-2">
                            <input type="text" value={displayVal} onChange={(e) => updateNodeParam(selectedNode.id, key, e.target.value)} className="flex-1 bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono" />
                            <button onClick={() => openFileBrowser(selectedNode.id, key, displayVal)} className="p-2 bg-slate-700 hover:bg-slate-600 rounded border border-slate-600 transition-colors text-emerald-400" title="Browse OS Files"><FolderOpen size={16} /></button>
                          </div>
                        ) : key === 'service_url' && selectedNode.toolId === 'wfs_arcgis_rest' && masterGisServers && masterGisServers.length > 0 ? (
                          <select
                            value={displayVal}
                            onChange={(e) => updateNodeParam(selectedNode.id, key, e.target.value)}
                            className="w-full bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono"
                          >
                            <option value={displayVal}>{displayVal}</option>
                            <optgroup label="Centralized Registry">
                              {masterGisServers.map((server, idx) => (
                                <option key={idx} value={server.url}>{server.name}</option>
                              ))}
                            </optgroup>
                          </select>
                        ) : key === 'layer_name' && selectedNode.params.file_path && (selectedNode.params.file_path.endsWith('.gdb') || selectedNode.params.file_path.endsWith('.gpkg')) ? (
                          <GdbLayerSelector selectedNode={selectedNode} updateNodeParam={updateNodeParam} />
                        ) : (
                          <input type="text" value={displayVal} onChange={(e) => updateNodeParam(selectedNode.id, key, e.target.value)} className="w-full bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono" />
                        )}
                      </div>
                    )
                  })}

                  {Object.keys(selectedNode.params || {}).length === 0 && (
                    <p className="text-xs text-slate-500 italic bg-slate-800/50 p-3 rounded-md text-center">Wire inputs directly into this node on the canvas to configure parameters dynamically.</p>
                  )}
                </div>

                {selectedNode.params && selectedNode.params.file_path && (
                  <div className="bg-slate-900 p-4 rounded-lg border border-slate-700 shadow-inner mt-4 animate-fadeIn">
                    <h4 className="text-[10px] uppercase tracking-widest text-blue-400 font-bold mb-3 flex items-center">
                      <Fingerprint size={12} className="mr-2" /> Dataset Intelligence
                    </h4>

                    <button
                      onClick={() => fetchMetadata(selectedNode.params.file_path, selectedNode.id)}
                      disabled={loadingMeta}
                      className="w-full py-2 bg-blue-900/40 hover:bg-blue-600 text-blue-300 hover:text-white text-xs font-bold rounded border border-blue-800/50 hover:border-blue-500 transition-all flex items-center justify-center mb-3 disabled:opacity-50"
                    >
                      {loadingMeta ? <Loader2 size={14} className="animate-spin mr-2" /> : <Database size={14} className="mr-2" />}
                      {loadingMeta ? "Scanning Headers..." : "Scan File Headers"}
                    </button>

                    {metadata[selectedNode.id] && metadata[selectedNode.id].data && (
                      <div className="bg-black/50 p-3 rounded border border-slate-800 font-mono text-[10px] space-y-2 text-slate-300">
                        <div className="flex justify-between border-b border-slate-800 pb-1">
                          <span className="text-slate-500">TYPE</span>
                          <span className="text-emerald-400">{metadata[selectedNode.id].data.dataType}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-800 pb-1">
                          <span className="text-slate-500">BANDS / GEOM</span>
                          <span className="text-blue-300">
                            {metadata[selectedNode.id].data.dataType === 'RasterDataset' ? `${metadata[selectedNode.id].data.bandCount} Bands` : metadata[selectedNode.id].data.shapeType}
                          </span>
                        </div>
                        <div className="flex justify-between border-b border-slate-800 pb-1">
                          <span className="text-slate-500">CRS</span>
                          <span className="text-purple-400">{metadata[selectedNode.id].data.spatialReference}</span>
                        </div>
                        <div className="flex flex-col pt-1">
                          <span className="text-slate-500 mb-1">EXTENT BOUNDS</span>
                          <span className="text-[9px] text-slate-400 break-all">{metadata[selectedNode.id].data.extent}</span>
                        </div>
                      </div>
                    )}

                    {metadata[selectedNode.id] && metadata[selectedNode.id].error && (
                      <div className="bg-red-900/20 p-3 rounded border border-red-800/50 flex items-start text-xs text-red-400 mt-2">
                        <AlertCircle size={14} className="mr-2 mt-0.5 shrink-0" />
                        <span className="leading-tight">{metadata[selectedNode.id].error}</span>
                      </div>
                    )}

                  </div>
                )}

                {selectedNode.toolId === 'wfs_sentinel2' && (
                  <div className="bg-slate-900 p-4 rounded-lg border border-slate-700 shadow-inner mt-4 animate-fadeIn">
                    <h4 className="text-[10px] uppercase tracking-widest text-cyan-400 font-bold mb-3 flex items-center">
                      <Search size={12} className="mr-2" /> STAC Catalog Query
                    </h4>

                    {connections.filter(c => c.to === selectedNode.id).length > 1 && (
                      <div className="bg-orange-900/20 p-2 rounded border border-orange-800/50 flex items-start text-[10px] text-orange-400 mb-3">
                        <AlertTriangle size={12} className="mr-2 mt-0.5 shrink-0" />
                        <span className="leading-tight">Warning: 1-to-1 relationship enforced for accurate STAC querying. Ensure only one Spatial Extent is connected when using explicit scene selection.</span>
                      </div>
                    )}

                    <button
                      onClick={() => fetchStacCatalog(
                        selectedNode.id,
                        null,
                        selectedNode.params.max_cloud_cover,
                        `${selectedNode.params.start_date.value}/${selectedNode.params.end_date.value}`
                      )}
                      disabled={stacLoading}
                      className="w-full py-2 bg-cyan-900/40 hover:bg-cyan-600 text-cyan-300 hover:text-white text-xs font-bold rounded border border-cyan-800/50 hover:border-cyan-500 transition-all flex items-center justify-center mb-3 disabled:opacity-50"
                    >
                      {stacLoading ? <Loader2 size={14} className="animate-spin mr-2" /> : <Search size={14} className="mr-2" />}
                      {stacLoading ? "Querying AWS..." : "Query Catalog"}
                    </button>

                    {stacError && (
                      <div className="bg-red-900/20 p-3 rounded border border-red-800/50 flex items-start text-xs text-red-400 mt-2 mb-2">
                        <AlertCircle size={14} className="mr-2 mt-0.5 shrink-0" />
                        <span className="leading-tight">{stacError}</span>
                      </div>
                    )}

                    {stacResults && stacResults.length > 0 && (
                      <div className="mt-3">
                        <label className="block text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-wide">Available Scenes</label>
                        <div className="max-h-48 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                          {stacResults.map(res => {
                            const isSelected = selectedNode.params.selected_items && selectedNode.params.selected_items.includes(res.id);
                            return (
                              <div key={res.id}
                                className={`p-2 rounded border cursor-pointer transition-colors flex items-center justify-between ${isSelected ? 'bg-cyan-900/40 border-cyan-500' : 'bg-slate-800 border-slate-700 hover:border-slate-500'}`}
                                onClick={() => {
                                  let current = selectedNode.params.selected_items ? selectedNode.params.selected_items.split(',').map(s => s.trim()).filter(Boolean) : [];
                                  if (isSelected) current = current.filter(id => id !== res.id);
                                  else current.push(res.id);
                                  updateNodeParam(selectedNode.id, 'selected_items', current.join(','));
                                }}>
                                <div className="flex flex-col">
                                  <span className="text-[10px] font-mono text-slate-300">{res.date.split('T')[0]}</span>
                                  <span className="text-[9px] text-slate-500 truncate w-36">{res.id}</span>
                                </div>
                                <div className="flex items-center">
                                  <span className={`text-[10px] mr-2 ${res.cloud_cover < 10 ? 'text-emerald-400' : res.cloud_cover < 30 ? 'text-yellow-400' : 'text-red-400'}`}>{res.cloud_cover.toFixed(1)}% ☁</span>
                                  <div className={`w-3 h-3 rounded-sm flex items-center justify-center border ${isSelected ? 'bg-cyan-500 border-cyan-400' : 'bg-slate-900 border-slate-600'}`}>
                                    {isSelected && <Check size={8} className="text-white" />}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {selectedNode.reference_keys && selectedNode.reference_keys.length > 0 && (
                  <div className="bg-slate-900 p-4 rounded-lg border border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.1)] mt-4 animate-fadeIn">
                    <h4 className="text-[10px] uppercase tracking-widest text-purple-400 font-bold mb-3 flex items-center">
                      <BookOpen size={12} className="mr-2" /> Academic References
                    </h4>
                    <div className="space-y-3">
                      {selectedNode.reference_keys.map((refKey, idx) => {
                        const ref = masterReferences && masterReferences[refKey];
                        if (!ref) return null;
                        return (
                          <div key={idx} className="bg-black/50 p-3 rounded border border-purple-900/50 hover:border-purple-500/50 transition-colors">
                            <a href={ref.url} target="_blank" rel="noopener noreferrer" className="block group">
                              <h5 className="text-xs font-bold text-slate-200 group-hover:text-purple-300 transition-colors mb-1">{ref.title}</h5>
                              <p className="text-[10px] text-slate-400 italic font-mono flex items-center"><ExternalLink size={10} className="mr-1" /> {ref.authors}</p>
                            </a>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeRightTab === 'explorer' && (
          <div className="p-4 flex flex-col items-center justify-center h-full text-slate-500">
            <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center mb-4 shadow-inner">
              <FolderOpen size={24} className="opacity-50 text-emerald-500" />
            </div>
            <p className="text-sm font-bold text-slate-400 mb-2">Native OS Explorer</p>
            <p className="text-xs text-center px-4">
              To browse the local or remote filesystem, use the <strong className="text-emerald-500">Paths</strong> button in the Top Ribbon (Global Environment).
              <br /><br />
              All processed WFS and Tensor Brew layers will dynamically sync to the Live Viewport's Active Layers!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}