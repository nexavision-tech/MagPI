# 🧭 **MagPI (Magnetic & Planetary Integrations)**
An open-source Python translation matrix designed to liberate geospatial workflows from proprietary dependencies.

## 🌍 **The Mission**
The modern geospatial industry is heavily reliant on proprietary, closed-source ecosystems (e.g., ESRI's `arcpy`). These systems mandate expensive licenses, lock users into Windows environments, and introduce massive computational bottlenecks by resisting native Linux deployment and vectorized array processing.

### **MagPI is a Trojan Horse for open-source freedom.** It operates on two fronts:

1. **The Translation Matrix:** It acts as an intercept layer. By simply changing one line of legacy code from import arcpy to import magpi as arcpy, users can execute their existing geospatial scripts natively on Linux servers. MagPI intercepts the legacy commands and routes them through lightning-fast, open-source libraries like geopandas, rasterio, and shapely.

2. **The Visual IDE:** A fully integrated, browser-based node editor that allows analysts to build topological processing pipelines via drag-and-drop, and execute them natively on the host OS via a local Python Daemon.

## 🚀 Quick Start (Conceptual)
### The goal of MagPI is zero-friction adoption for legacy GIS analysts. 

#### - Before: `import arcpy`
#### - Now: `import magpi as arcpy`
### **Training over for arcpy users!**

**Before** (Requires a Windows machine and an expensive Spatial Analyst license):
```
import arcpy 
arcpy.analysis.Buffer("roads.shp", "roads_buf.shp", "50 METERS"
```

**After** (Executes natively on an Ubuntu server using pure vectorized Python arrays):
```
import magpi as arcpy
arcpy.analysis.Buffer("roads.shp", "roads_buf.shp", "50 METERS")
```

## 🖥️ Quick Start (The Visual IDE)

### To launch the drag-and-drop Model Builder:

1. Launch the Matrix Daemon (The Execution Engine)
```
python -c "import magpi.ui; magpi.ui.LaunchCanvas()"
```

2. Launch the Web UI (In a new terminal)
```
cd magpi/gui
npm install
npm run dev
```

Navigate to http://localhost:5173 to access the IDE.


## 🌐 The MagPI Reference System (MRS) & Cellular Transcription
Traditional GIS engines attempt to load massive 50GB vector files into system memory all at once, leading to crashes and computational bottlenecks. MagPI resolves this using the **MagPI Reference System (MRS)**—a scalable, dynamic cellular architecture inspired by the military grid reference system (MGRS).

- **Hybrid Cellular Transcription**: MagPI never brute-forces rendering. Massive datasets are first visualized as glassmorphism "footprints". Users generate an MRS grid (a "Fishnet") over the footprint, and interactively transcribe specific grid cells to trigger high-resolution spatial queries on-demand.
- **Adaptive Seamline Buffers & Centroid Ownership**: To prevent building polygons from being split in half across grid lines, MagPI utilizes centroid-based ownership and adaptive seamline buffers. This ensures complete structural integrity for Computer Vision and Deep Learning pipelines.
- **Tensor Brew Integration**: By breaking massive regions into standardized MRS cells, MagPI can pipe perfectly standardized data chunks directly into the PyTorch-powered **Tensor Brew** engine for parallel processing and object detection.


## 🏗️ Architecture & Routing
MagPI operates by mapping proprietary modules to their open-source C-backed equivalents.

``` mermaid
graph TD
    %% Styling
    classDef ui fill:#0f172a,stroke:#10b981,stroke-width:2px,color:#f1f5f9
    classDef daemon fill:#1e293b,stroke:#3b82f6,stroke-width:2px,color:#f1f5f9
    classDef engine fill:#334155,stroke:#8b5cf6,stroke-width:2px,color:#f1f5f9
    classDef disk fill:#020617,stroke:#64748b,stroke-width:2px,color:#94a3b8
    classDef airflow fill:#4338ca,stroke:#818cf8,stroke-width:2px,color:#f1f5f9

    %% Nodes
    subgraph UI["Web Browser (React/Vite)"]
        Canvas[Node Canvas IDE]:::ui
        Script[Code Generator]:::ui
        AirflowExport[Airflow DAG Generator]:::ui
    end

    subgraph DAEMON["Local Python Server (Port 8080)"]
        API[MagPI HTTP POST/GET]:::daemon
        Interpreter[Conda Python Environment]:::daemon
        Registry[Academic Registry API]:::daemon
    end

    subgraph ENGINE["MagPI Translation Matrix"]
        ArcpyBridge[import magpi as arcpy]:::engine
        GeoPandas[Vector Engine: geopandas/shapely]:::engine
        Rasterio[Raster Engine: rasterio/scipy]:::engine
        Community[Community Plugins]:::engine
    end

    subgraph OS["Linux File System"]
        Inputs[(Raw Imagery / Shp)]:::disk
        Outputs[(Clipped / GeoAI Chips)]:::disk
    end

    %% Connections
    Canvas -->|Compiles Pipeline| Script
    Canvas -->|Exports Pipeline| AirflowExport
    AirflowExport -->|Deploys to| Airflow[Apache Airflow Orchestration]:::airflow
    Script -->|POST /api/run| API
    Canvas -->|Fetches Citations| Registry
    
    API -->|Executes Payload| Interpreter
    Interpreter --> ArcpyBridge
    Interpreter --> Community
    ArcpyBridge --> GeoPandas
    ArcpyBridge --> Rasterio
    
    Inputs -->|Read| Rasterio
    Inputs -->|Read| GeoPandas
    GeoPandas -->|Write| Outputs
    Rasterio -->|Write| Outputs
    
    API -->|Live Console Logs| Canvas
```
###

# 🗺️ **Project Roadmap & GitHub Projects**
The translation of an entire proprietary ecosystem is a massive undertaking. We are tracking progress via GitHub Projects (Kanban). The core modules are currently in the following states of development:

- [x] `arcpy.management` (Vector/Data handling via GeoPandas) - Active

- [x] `arcpy.analysis` (Spatial operations via Shapely) - Active

- [x] `arcpy.sa` (Map Algebra via Rasterio/NumPy) - Active

- [x] `arcpy.da` (Data Access / Cursor mapping) - Active

- [x] `arcpy.env` (Environment Settings) - Active

- [x] `arcpy.wfs` (Sovereign Data Pulls via AWS STAC/Copernicus) - Active

- [x] `arcpy.geoai` (HuggingFace Object Detection / Classification) - Active

- [x] `arcpy.ml` (Tensor Brew Deep Learning Engine via PyTorch) - Active
- [x] **Community Plugin Engine** (Dynamically loads 3rd party nodes) - Active
- [x] **Apache Airflow Export** (Enterprise Pipeline Generation) - Active
- [x] **Academic Registry** (Decoupled Scientific Validation) - Active

# 📖 **The MagPI Doctrine**
Before contributing or building complex pipelines, please review our official operating semantics:
👉 **[Read the MAGPI DOCTRINE](./MAGPI_DOCTRINE.md)**

# 🤝 Contributing
MagPI is an initiative of The NexaVision and the Tech Union. We welcome pull requests from data scientists, GIS developers, and open-source advocates who want to help translate specific modules.

Please review our translation philosophy before submitting a PR:
1. Speed: Always prioritize vectorized numpy/pandas operations over row-by-row iteration.
2. Parity: Function signatures (arguments) must match the legacy system exactly to prevent user-side refactoring.
3. Format Freedom: Encourage the conversion of proprietary formats (File Geodatabases) to open standards (GeoPackage, PostGIS).
### Built with intent by Christopher B. Hanni and the Gaian Mind.