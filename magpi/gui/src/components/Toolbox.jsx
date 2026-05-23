import React, { useState } from 'react';
import { 
  Database, Layers, Cpu, Settings, Image as ImageIcon, 
  Hexagon, Leaf, Grid, Crosshair, Scissors, CircleDashed, 
  ChevronDown, ChevronRight, MousePointer2, Trash2, 
  SlidersHorizontal, Wrench, Check, FolderOpen, ListFilter,
  Search, Copy, Info, Fingerprint, Loader2, AlertCircle, 
  Cloud, Map as MapIcon, Satellite, Box, Globe, DownloadCloud, PaintBucket, 
  FileOutput, LineChart, Brain, Sparkles, RefreshCcw, Activity
} from 'lucide-react';

const TOOLBOX_CATEGORIES = [
  {
    name: "API Connector Hub", icon: <Cloud size={18} className="text-cyan-400" />,
    tools: [
      { id: 'wfs_sentinel2', name: "Sentinel-2 (AWS 4B)", type: 'input', icon: <Cloud size={14}/>, color: 'bg-cyan-700', border: 'border-cyan-500', 
        description: "Streams Cloud Optimized GeoTIFFs (COGs) from AWS Earth Search based on an AOI. Includes temporal filtering.",
        params: { max_cloud_cover: 10, start_date: { value: "2023-01-01", type: "date" }, end_date: { value: "2023-12-31", type: "date" }, out_folder: "./sentinel_data" } },
      { id: 'wfs_copernicus', name: "Copernicus Data Space", type: 'input', icon: <Satellite size={14}/>, color: 'bg-blue-600', border: 'border-blue-500', 
        description: "Connects directly to the ESA Copernicus Data Space Ecosystem (CDSE) to query Sentinel-1, 2, 3, 5P, and Landsat data using OData.",
        params: { 
            collection: { value: "SENTINEL-1", type: "select", options: ["SENTINEL-1", "SENTINEL-2", "SENTINEL-3", "SENTINEL-5P", "LANDSAT-8", "LANDSAT-9"] }, 
            product_type: { value: "IW_SLC__1S", type: "select", options: ["IW_SLC__1S", "IW_GRDH_1S", "S2MSI1C", "S2MSI2A", "SY_2_SYN___"] }, 
            start_date: { value: "2024-01-01T00:00", type: "datetime-local" }, 
            end_date: { value: "2024-12-31T23:59", type: "datetime-local" }, 
            cdse_token: "DEMO_TOKEN_REQUIRED",
            out_feature_class: "copernicus_metadata.json" 
        } 
      },
      { id: 'wfs_elevation', name: "Pull USGS DEM", type: 'input', icon: <Layers size={14}/>, color: 'bg-cyan-700', border: 'border-cyan-500', 
        description: "Extracts a 3D Digital Elevation Model (DEM) natively from the USGS 3DEP Web Coverage Service.",
        params: {} },
      { id: 'wfs_nlcd', name: "Pull NLCD Labels", type: 'input', icon: <Grid size={14}/>, color: 'bg-cyan-700', border: 'border-cyan-500', 
        description: "Streams categorical ground-truth labels via the free MRLC GeoServer WCS (bypassing the AWS 403 block).",
        params: { year: { value: "2021", type: "select", options: ["2021", "2019", "2016", "2011", "2001"] }, product: { value: "Land_Cover", type: "select", options: ["Land_Cover", "Impervious"] } } },
      { id: 'wfs_sciencebase', name: "USGS ScienceBase", type: 'input', icon: <DownloadCloud size={14}/>, color: 'bg-cyan-700', border: 'border-cyan-500', 
        description: "Downloads raw science assets directly from the USGS ScienceBase catalog using sciencebasepy.",
        params: { item_id: "655ceb8ad34ee4b6e05cc51a", out_folder: "./sb_downloads" } },
      { id: 'wfs_census', name: "US Census Tracts", type: 'input', icon: <MapIcon size={14}/>, color: 'bg-cyan-700', border: 'border-cyan-500', 
        description: "Downloads official TIGER shapefiles directly from the US Census Bureau.",
        params: { state_fips: 12, county_fips: 95, year: 2020 } },
      { id: 'wfs_universal', name: "Universal REST/WFS", type: 'input', icon: <Globe size={14}/>, color: 'bg-cyan-700', border: 'border-cyan-500', 
        description: "Connects to ANY global Open Data portal (e.g., Thai MOT, EU Inspire) via GeoJSON or REST API endpoints.",
        params: { url: "https://datagov.mot.go.th/dataset/...", format: { value: "GeoJSON", type: "select", options: ["GeoJSON", "ESRI REST", "WFS"] } } }
    ]
  },
  {
    name: "OpenEO Cloud Dispatch", icon: <Cloud size={18} className="text-blue-400" />,
    tools: [
      { id: 'openeo_authenticate', name: "CDSE Authenticate", type: 'input', icon: <Activity size={14}/>, color: 'bg-blue-700', border: 'border-blue-500', 
        description: "Authenticates with Copernicus Data Space Ecosystem via OIDC.",
        params: { method: { value: "OIDC", type: "select", options: ["OIDC", "Basic", "Refresh Token"] }, token: "" } },
      { id: 'openeo_load_collection', name: "Cloud Data Cube", type: 'transform', icon: <Grid size={14}/>, color: 'bg-blue-600', border: 'border-blue-400', 
        description: "Loads a massive Earth Observation data cube on the remote OpenEO cluster.",
        params: { collection: { value: "SENTINEL2_L2A", type: "select", options: ["SENTINEL1_GRD", "SENTINEL2_L2A", "SENTINEL3_OLCI"] }, start_date: { value: "2023-01-01", type: "date" }, end_date: { value: "2023-12-31", type: "date" }, bands: "B04,B08,B11" } },
      { id: 'openeo_train_rf', name: "Cloud Train Random Forest", type: 'transform', icon: <Activity size={14}/>, color: 'bg-fuchsia-700', border: 'border-fuchsia-500', 
        description: "Dispatches a Random Forest training job directly onto the ESA cloud supercomputers.",
        params: { num_trees: 200, max_depth: 20 } },
      { id: 'openeo_predict', name: "Cloud Batch Prediction", type: 'endpoint', icon: <DownloadCloud size={14}/>, color: 'bg-indigo-600', border: 'border-indigo-400', 
        description: "Executes a cloud batch job for inference and downloads the resulting GeoTIFF.",
        params: { out_format: { value: "GTiff", type: "select", options: ["GTiff", "NetCDF"] }, prefix: "dynamic_landcover", max_credits: 100 } }
    ]
  },
  {
    name: "Core Inputs", icon: <Database size={18} className="text-yellow-500/70" />,
    tools: [
      { id: 'core_extent', name: "Spatial Extent (AOI)", type: 'input', icon: <Hexagon size={14}/>, color: 'bg-yellow-600', border: 'border-yellow-500', 
        description: "A universal bounding box. Wire this into Cloud Pullers or Clip tools to define an area of interest.",
        params: { xmin: "-81.450", ymin: "28.450", xmax: "-81.250", ymax: "28.600" } },
      { id: 'load_raster', name: "Input Raster", type: 'input', icon: <ImageIcon size={14}/>, color: 'bg-blue-600', border: 'border-blue-500', 
        description: "Loads a multi-band imagery file (TIFF, IMG, JP2) into the MagPI processing matrix.",
        params: { file_path: "./test_data/noaa_florida/2021_4BandImagery.tif" } },
      { id: 'load_vector', name: "Input Vector", type: 'input', icon: <Hexagon size={14}/>, color: 'bg-blue-600', border: 'border-blue-500', 
        description: "Loads a vector feature class or shapefile containing points, lines, or polygons.",
        params: { file_path: "./test_data/Orange_County_Tracts.shp" } },
    ]
  },
  {
    name: "Image Analyst (ia)", icon: <Layers size={18} className="text-emerald-500/70" />,
    tools: [
      { id: 'ia_ndvi', name: "NDVI Calculator", type: 'process', icon: <Leaf size={14}/>, color: 'bg-emerald-600', border: 'border-emerald-500', 
        description: "Calculates the Normalized Difference Vegetation Index. Note: For Sentinel-2 (AWS 4B) use Red=3, NIR=4. For standard Sentinel-2 (L2A 13-band) use Red=4, NIR=8.",
        params: { nir_band: 4, red_band: 3 } },
      { id: 'ia_pansharpen', name: "Pansharpen Image", type: 'process', icon: <ImageIcon size={14}/>, color: 'bg-emerald-600', border: 'border-emerald-500', 
        description: "Fuses high-res black-and-white panchromatic data with blurry color data to create a high-res color output.",
        params: { method: { value: "BROVEY", type: "select", options: ["BROVEY", "ESRI", "IHS", "Gram-Schmidt"] } } },
      { id: 'ia_reclassify', name: "Reclassify Pixels", type: 'process', icon: <PaintBucket size={14}/>, color: 'bg-emerald-600', border: 'border-emerald-500', 
        description: "Maps specific pixel values to new values. e.g., mapping all NLCD Developed classes (21,22,23,24) to 1, and everything else (*) to 0.",
        params: { remap_string: "21:1,22:1,23:1,24:1,*:0" } },
      { id: 'ia_export_dl', name: "Export DL Tensors", type: 'process', icon: <Grid size={14}/>, color: 'bg-emerald-600', border: 'border-emerald-500', 
        description: "Chips massive rasters and paired ground-truth labels into perfectly sized tensors for PyTorch AI training.",
        params: { out_folder: "./dl_chips", tile_size: 256, stride: 128, shuffle: true } },
    ]
  },
  {
    name: "GeoAI (geoai)", icon: <Cpu size={18} className="text-emerald-500/70" />,
    tools: [
      { id: 'ai_train', name: "Train Deep Learning Model", type: 'process', icon: <Cpu size={14}/>, color: 'bg-purple-600', border: 'border-purple-500', 
        description: "Ingests exported DL chips and trains a PyTorch Neural Network (U-Net, ResNet) for semantic segmentation or object detection.",
        params: { out_folder: "./trained_model", max_epochs: 20, batch_size: 4, model_type: { value: "UNET", type: "select", options: ["UNET", "MASKRCNN", "DEEPLAB", "SEGFORMER"] } } 
      },
      { id: 'ai_detect', name: "Detect Objects", type: 'process', icon: <Crosshair size={14}/>, color: 'bg-purple-600', border: 'border-purple-500', 
        description: "Executes a pre-trained Deep Learning vision model across an input raster to extract vector features.",
        params: { out_shp: "pools.shp", model: { value: "facebook/detr-resnet-50", type: "select", options: ["facebook/detr-resnet-50", "facebook/mask2former-swin"] } } 
      },
      { id: 'ai_classify', name: "Classify Pixels", type: 'process', icon: <ImageIcon size={14}/>, color: 'bg-purple-600', border: 'border-purple-500', 
        description: "Performs Semantic Segmentation using Transformers to classify land cover (trees, roads, buildings).",
        params: { out_raster: "classified_mask.tif", model: { value: "nvidia/segformer-b0-finetuned-ade-512-512", type: "select", options: ["nvidia/segformer-b0-finetuned-ade-512-512", "nvidia/segformer-b1-finetuned-cityscapes-1024-1024"] } } 
      },
      { id: 'ai_insight', name: "Generate Insight (LLM)", type: 'process', icon: <Brain size={14}/>, color: 'bg-indigo-700', border: 'border-indigo-500', 
        description: "Sends geospatial metadata or stats to an LLM (Hugging Face) to generate natural language intelligence reports.",
        params: { prompt: "Analyze this spatial variance.", model_name: { value: "huggingface/transformers", type: "select", options: ["huggingface/transformers", "ollama/llama3", "anthropic/claude"] } } 
      },
      { id: 'ai_generate', name: "Super-Resolution (GAN)", type: 'process', icon: <Sparkles size={14}/>, color: 'bg-pink-700', border: 'border-pink-500', 
        description: "Uses a Generative Adversarial Network to mathematically hallucinate and up-sample raw imagery (e.g., 10m to 2m resolution).",
        params: { scale_factor: { value: 2, type: "select", options: [2, 4, 8] } } 
      },
      { id: 'ai_rl', name: "Agentic Optimizer (RL)", type: 'process', icon: <RefreshCcw size={14}/>, color: 'bg-orange-600', border: 'border-orange-500', 
        description: "Unleashes an autonomous Reinforcement Learning agent to iteratively optimize geoprocessing parameters.",
        params: { target_accuracy: 95.0, max_iterations: 100 } 
      },
      { id: 'ai_ml_train', name: "Train Classical ML", type: 'process', icon: <Cpu size={14}/>, color: 'bg-rose-700', border: 'border-rose-500', 
        description: "Trains a Classical Machine Learning algorithm using pixel spectral signatures and vector polygons.",
        params: { algorithm: { value: "RANDOM_FOREST", type: "select", options: ["RANDOM_FOREST", "XGBOOST", "SVM", "MAX_LIKELIHOOD"] }, max_trees: 50, out_model: "ml.model" } 
      },
      { id: 'ai_ml_predict', name: "Predict Classical ML", type: 'process', icon: <ImageIcon size={14}/>, color: 'bg-rose-700', border: 'border-rose-500', 
        description: "Executes a trained Classical ML model over a raster to produce a classified land cover map.",
        params: { out_raster: "ml_classified.tif" } 
      },
    ]
  },
  {
    name: "Data Management", icon: <Settings size={18} className="text-emerald-500/70" />,
    tools: [
      { id: 'mgt_clip', name: "Clip to AOI", type: 'process', icon: <Scissors size={14}/>, color: 'bg-slate-600', border: 'border-slate-500', 
        description: "Extracts a spatial subset of a raster or vector based on a drawn Spatial Extent node.",
        params: {} },
      { id: 'mgt_buffer', name: "Buffer", type: 'process', icon: <CircleDashed size={14}/>, color: 'bg-slate-600', border: 'border-slate-500', 
        description: "Creates polygon boundaries at a specified distance around input vector features.",
        params: { distance: 50, unit: { value: "Meters", type: "select", options: ["Meters", "Kilometers", "Feet", "Miles"] } } 
      },
      { id: 'mgt_project_raster', name: "Project Raster", type: 'process', icon: <MapIcon size={14}/>, color: 'bg-slate-600', border: 'border-slate-500', 
        description: "Warps a raster image from one coordinate system to another.",
        params: { out_crs: "EPSG:6438", resampling: { value: "NEAREST", type: "select", options: ["NEAREST", "BILINEAR", "CUBIC", "MAJORITY"] } } 
      },
      { id: 'mgt_create_fishnet', name: "Create Fishnet (Tiling)", type: 'process', icon: <Grid size={14}/>, color: 'bg-slate-600', border: 'border-slate-500', 
        description: "Creates a grid of rectangular cells (tessellation) over an extent. Essential for batch-processing massive areas.",
        params: { cell_width: 2560, cell_height: 2560 } 
      },
      { id: 'mgt_pyramids', name: "Build Pyramids & Stats", type: 'process', icon: <Layers size={14}/>, color: 'bg-slate-600', border: 'border-slate-500', 
        description: "Calculates multi-band statistics and builds internal overviews (pyramids) for massive speed boosts when rendering in desktop software.",
        params: { build_pyramids: true, calculate_stats: true } 
      },
    ]
  },
  {
    name: "Conversion Tools", icon: <FileOutput size={18} className="text-orange-400" />,
    tools: [
      { id: 'conv_raster_to_polygon', name: "Raster to Polygon", type: 'process', icon: <Hexagon size={14}/>, color: 'bg-orange-600', border: 'border-orange-500', 
        description: "Converts a classified pixel mask (e.g. AI inference output) into discrete vector polygons (Shapefile/GeoJSON).",
        params: { out_polygon_features: "extracted_features.shp", background_value: 0 } 
      },
    ]
  },
  {
    name: "Data ETL Pipelines", icon: <Database size={18} className="text-indigo-400" />,
    tools: [
      { id: 'etl_spatial_join', name: "Spatial Join", type: 'process', icon: <MapIcon size={14}/>, color: 'bg-indigo-600', border: 'border-indigo-500', 
        description: "Joins attributes from one feature to another based on spatial relationship.",
        params: { join_operation: { value: "JOIN_ONE_TO_ONE", type: "select", options: ["JOIN_ONE_TO_ONE", "JOIN_ONE_TO_MANY"] } } },
      { id: 'etl_field_calc', name: "Field Calculator", type: 'process', icon: <Wrench size={14}/>, color: 'bg-indigo-600', border: 'border-indigo-500', 
        description: "Calculates the values of a field for a feature class.",
        params: { field_name: "NEW_AREA", expression: "!shape.area@squaremeters!" } },
      { id: 'etl_db_writer', name: "PostGIS Writer", type: 'endpoint', icon: <Database size={14}/>, color: 'bg-indigo-600', border: 'border-indigo-500', 
        description: "Writes the output vector directly into a PostGIS database.",
        params: { connection_string: "postgresql://user:pass@localhost:5432/db", table_name: "output_table" } }
    ]
  },
  {
    name: "Spectral Processing", icon: <Layers size={18} className="text-pink-400" />,
    tools: [
      { id: 'envi_band_math', name: "Band Math", type: 'process', icon: <SlidersHorizontal size={14}/>, color: 'bg-pink-600', border: 'border-pink-500', 
        description: "Performs mathematical operations on image bands.",
        params: { expression: "(b1 - b2) / (b1 + b2)" } },
      { id: 'envi_pca', name: "Principal Components", type: 'process', icon: <LineChart size={14}/>, color: 'bg-pink-600', border: 'border-pink-500', 
        description: "Performs Principal Component Analysis (PCA) to reduce spectral dimensionality.",
        params: { components_to_retain: 3 } },
      { id: 'envi_tasseled_cap', name: "Tasseled Cap", type: 'process', icon: <Leaf size={14}/>, color: 'bg-pink-600', border: 'border-pink-500', 
        description: "Calculates Tasseled Cap transformation (Brightness, Greenness, Wetness).",
        params: { sensor: { value: "Landsat_8", type: "select", options: ["Landsat_8", "Sentinel_2", "Landsat_5"] } } }
    ]
  },
  // NEW: Spatial Statistics Subsystem (Chris's Academic Verification Module)
  {
    name: "Spatial Statistics", icon: <LineChart size={18} className="text-rose-400" />,
    tools: [
      { id: 'stats_confusion_matrix', name: "Compute Confusion Matrix", type: 'process', icon: <Grid size={14}/>, color: 'bg-rose-600', border: 'border-rose-500', 
        description: "Compares ground truth labels against AI classifications. Calculates User/Producer accuracies and Kappa coefficients.",
        params: { out_table: "confusion_matrix.csv" } 
      },
    ]
  }
];

export default function Toolbox({ 
  activeRightTab, setActiveRightTab, 
  selectedNode, updateNodeParam, updateNodeName, deleteNode, addNode, duplicateNode,
  openFileBrowser 
}) {
  const [expandedCategories, setExpandedCategories] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  
  const [hoveredTool, setHoveredTool] = useState(null);
  const [mouseY, setMouseY] = useState(0);

  const [metadata, setMetadata] = useState({});
  const [loadingMeta, setLoadingMeta] = useState(false);

  const toggleCategory = (name) => setExpandedCategories(prev => ({ ...prev, [name]: !prev[name] }));

  const handleDragStart = (e, tool) => {
    const dragPayload = { ...tool, _icon_key: tool.icon.type.name || 'Settings' };
    e.dataTransfer.setData("application/reactflow", JSON.stringify(dragPayload));
    e.dataTransfer.effectAllowed = 'move';
    window.__draggedMagPITool = dragPayload; // Robust fallback for ReactFlow drop
    setHoveredTool(null); 
  };

  const filteredCategories = TOOLBOX_CATEGORIES.map(cat => ({
    ...cat, tools: cat.tools.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()) || t.id.toLowerCase().includes(searchQuery.toLowerCase()))
  })).filter(cat => cat.tools.length > 0);

  const fetchMetadata = async (filePath, nodeId) => {
    setLoadingMeta(true);
    try {
      const response = await fetch(`http://localhost:8080/api/describe?file=${encodeURIComponent(filePath)}`);
      const data = await response.json();
      
      if (response.ok) {
        setMetadata(prev => ({ ...prev, [nodeId]: { data, error: null } }));
      } else {
        setMetadata(prev => ({ ...prev, [nodeId]: { data: null, error: data.error } }));
      }
    } catch (err) {
      setMetadata(prev => ({ ...prev, [nodeId]: { data: null, error: "Daemon offline or unreachable." } }));
    } finally {
      setLoadingMeta(false);
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
        <button onClick={() => setActiveRightTab('toolbox')} className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest transition-all flex items-center justify-center ${activeRightTab === 'toolbox' ? 'text-emerald-400 border-b-2 border-emerald-400 bg-slate-800' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'}`}><Wrench size={14} className="mr-2" /> Tools</button>
        <button onClick={() => setActiveRightTab('inspector')} className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest transition-all flex items-center justify-center ${activeRightTab === 'inspector' ? 'text-emerald-400 border-b-2 border-emerald-400 bg-slate-800' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'}`}><SlidersHorizontal size={14} className="mr-2" /> Params</button>
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
              {filteredCategories.length === 0 ? ( <div className="text-center text-slate-500 text-xs mt-4">No tools found for "{searchQuery}"</div> ) : (
                filteredCategories.map((cat, idx) => (
                  <div key={idx} className="bg-slate-900/80 rounded-lg border border-slate-700/80 overflow-hidden shadow-sm">
                    <button onClick={() => toggleCategory(cat.name)} className="w-full flex items-center justify-between px-4 py-3 bg-slate-800/80 hover:bg-slate-700 transition-colors">
                      <div className="flex items-center space-x-3 text-sm font-bold text-slate-200">{cat.icon}<span>{cat.name}</span></div>
                      {expandedCategories[cat.name] || searchQuery !== '' ? <ChevronDown size={14} className="text-slate-500"/> : <ChevronRight size={14} className="text-slate-500"/>}
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
                    <button onClick={() => duplicateNode(selectedNode.id)} className="w-7 h-7 rounded bg-black/20 hover:bg-emerald-500/80 flex items-center justify-center transition-colors shadow-sm" title="Duplicate Node"><Copy size={13} /></button>
                    <button onClick={() => deleteNode(selectedNode.id)} className="w-7 h-7 rounded bg-black/20 hover:bg-red-500/80 flex items-center justify-center transition-colors shadow-sm" title="Delete Node"><Trash2 size={13} /></button>
                  </div>
                </div>

                <div className="bg-slate-900 p-4 rounded-lg border border-slate-700 shadow-inner">
                  <h4 className="text-[10px] uppercase tracking-widest text-emerald-500 font-bold mb-4 flex items-center"><SlidersHorizontal size={12} className="mr-2" /> Parameters</h4>
                  {Object.entries(selectedNode.params || {}).map(([key, val]) => {
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
                        <input type="date" value={displayVal} onChange={(e) => updateNodeParam(selectedNode.id, key, { ...val, value: e.target.value })} className="w-full bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono"/>
                      ) : isDateTimeObj ? (
                        <input type="datetime-local" value={displayVal} onChange={(e) => updateNodeParam(selectedNode.id, key, { ...val, value: e.target.value })} className="w-full bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono"/>
                      ) : typeof displayVal === 'number' ? (
                        <input type="number" value={displayVal} onChange={(e) => updateNodeParam(selectedNode.id, key, Number(e.target.value))} className="w-full bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono"/>
                      ) : key === 'file_path' || key === 'out_folder' || key === 'out_polygon_features' || key === 'out_table' ? (
                        <div className="flex items-center space-x-2">
                           <input type="text" value={displayVal} onChange={(e) => updateNodeParam(selectedNode.id, key, e.target.value)} className="flex-1 bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono"/>
                          <button onClick={() => openFileBrowser(selectedNode.id, key, displayVal)} className="p-2 bg-slate-700 hover:bg-slate-600 rounded border border-slate-600 transition-colors text-emerald-400" title="Browse OS Files"><FolderOpen size={16} /></button>
                        </div>
                      ) : (
                        <input type="text" value={displayVal} onChange={(e) => updateNodeParam(selectedNode.id, key, e.target.value)} className="w-full bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono"/>
                      )}
                    </div>
                  )})}
                  
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
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}