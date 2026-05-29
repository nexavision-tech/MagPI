import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { Map as MapIcon, Satellite, Edit, Globe, Layers, Eye, EyeOff, XCircle } from 'lucide-react';
import { Viewer, Entity, ImageryLayer } from 'resium';
import { Cartesian3, Color, OpenStreetMapImageryProvider } from 'cesium';

window.type = ''; 

const getAncestralExtent = (nodeId, nodes, connections) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return null;
    if (node.toolId === 'core_extent' || node.toolId === 'mgt_clip') {
        if (node.params && node.params.xmin && node.params.ymin && node.params.xmax && node.params.ymax) {
            return node.params;
        }
    }
    const incomingCxs = connections ? connections.filter(c => c.to === nodeId) : [];
    for (const cx of incomingCxs) {
        const extent = getAncestralExtent(cx.from, nodes, connections);
        if (extent) return extent;
    }
    return null;
};

const MapViewport = React.memo(({ onAoiDrawn, selectedNode, activeWorkspace, nodes = [], nodeStatuses = {}, connections = [] }) => {
    const mapRef = useRef(null);
    const mapInstance = useRef(null); 
    const drawRef = useRef(null);
    const osmImageryProvider = React.useMemo(() => new OpenStreetMapImageryProvider({ url: 'https://a.tile.openstreetmap.org/' }), []);
    const [showLayers, setShowLayers] = React.useState(activeWorkspace !== 'builder');
    const [layers, setLayers] = React.useState([
        { id: 'base', name: 'Base Map (OSM)', visible: true, opacity: 100, isBase: true }
    ]);
    const [selectedFeature, setSelectedFeature] = React.useState(null);

    // Keep showLayers synced with workspace mode
    useEffect(() => {
        if (activeWorkspace !== 'builder') {
            setShowLayers(true);
        } else {
            setShowLayers(false);
        }
    }, [activeWorkspace]);

    // Dynamically update layers list based on node outputs
    useEffect(() => {
        const baseLayer = { id: 'base', name: 'Base Map (OSM)', visible: true, opacity: 100, isBase: true };
        const newLayers = [baseLayer];
        
        nodes.forEach(node => {
            const status = nodeStatuses[node.id];
            if (status === 'success' || node.toolId.startsWith('load_') || node.toolId === 'core_extent' || node.toolId.startsWith('wfs_')) {
                // Determine a good display name
                let layerName = node.name || node.toolId;
                if (node.params && node.params.out_raster) {
                    layerName = `${node.name} (${node.params.out_raster})`;
                } else if (node.params && node.params.file_path) {
                    layerName = `${node.name} (${node.params.file_path.split('/').pop()})`;
                }
                
                newLayers.push({
                    id: node.id,
                    name: layerName,
                    visible: true,
                    opacity: 100,
                    isBase: false,
                    selected: selectedNode && selectedNode.id === node.id
                });
            }
        });
        
        setLayers(newLayers);
    }, [nodes, nodeStatuses, selectedNode]);

    useEffect(() => {
        if (!mapRef.current) return;
        if (mapInstance.current) return; 

        // Initialize MapLibre
        const map = new maplibregl.Map({
            container: mapRef.current,
            style: {
                version: 8,
                sources: {
                    'osm': {
                        type: 'raster',
                        tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'],
                        tileSize: 256,
                        attribution: '© OpenStreetMap Contributors'
                    }
                },
                layers: [{
                    id: 'osm',
                    type: 'raster',
                    source: 'osm',
                    minzoom: 0,
                    maxzoom: 22
                }]
            },
            center: [0, 0],
            zoom: 2,
            pitch: 0,
            bearing: 0
        });
        mapInstance.current = map;

        map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');

        // Setup Draw Control
        const draw = new MapboxDraw({
            displayControlsDefault: false,
            controls: {
                polygon: false,
                trash: false
            }
        });
        drawRef.current = draw;
        map.addControl(draw);

        map.on('draw.create', function (e) {
            const data = e.features[0];
            if (data.geometry.type === 'Polygon') {
                const coordinates = data.geometry.coordinates[0];
                let xmin = 180, ymin = 90, xmax = -180, ymax = -90;
                coordinates.forEach(coord => {
                    xmin = Math.min(xmin, coord[0]);
                    xmax = Math.max(xmax, coord[0]);
                    ymin = Math.min(ymin, coord[1]);
                    ymax = Math.max(ymax, coord[1]);
                });
                
                if (onAoiDrawn) {
                    onAoiDrawn({
                        xmin: xmin.toFixed(5),
                        ymin: ymin.toFixed(5),
                        xmax: xmax.toFixed(5),
                        ymax: ymax.toFixed(5)
                    });
                }
                draw.deleteAll();
            }
        });

        // Feature Click Event for Attribute Table
        map.on('click', (e) => {
            const features = map.queryRenderedFeatures(e.point);
            if (features.length > 0) {
                // Find first non-base feature
                const feature = features.find(f => f.layer.id !== 'osm' && !f.layer.id.includes('extent'));
                if (feature) {
                    window.dispatchEvent(new CustomEvent('magpi-feature-selected', { 
                        detail: { feature: feature, layerName: feature.layer.id.split('-')[0] }
                    }));
                }
            }
        });

        const resizeObserver = new ResizeObserver(() => {
            if (mapInstance.current) {
                mapInstance.current.resize();
            }
        });
        resizeObserver.observe(mapRef.current);

        return () => {
            resizeObserver.disconnect();
            map.remove();
            mapInstance.current = null;
        };
    }, [onAoiDrawn]);
    
    // Feature selection listener
    useEffect(() => {
        const handleFeatureSelect = (e) => {
            setSelectedFeature(e.detail);
        };
        window.addEventListener('magpi-feature-selected', handleFeatureSelect);
        return () => window.removeEventListener('magpi-feature-selected', handleFeatureSelect);
    }, []);

    // THE OVERLAY ENGINE (Dynamic Sync)
    useEffect(() => {
        setLayers(prevLayers => {
            const baseLayer = prevLayers.find(l => l.isBase) || { id: 'base', name: 'Base Map (OSM)', visible: true, opacity: 100, isBase: true };
            
            const dynamicLayers = nodes
                .filter(n => n.toolId === 'core_extent' || nodeStatuses[n.id] === 'success')
                .map(n => {
                    const existing = prevLayers.find(l => l.id === n.id);
                    const extent = getAncestralExtent(n.id, nodes, connections);
                    let filePath = null;
                    if (n.params && (n.params.file_path || n.params.out_shp || n.params.out_feature_class || n.params.out_raster)) {
                        let raw = n.params.file_path || n.params.out_shp || n.params.out_feature_class || n.params.out_raster;
                        if (!raw.startsWith('/') && !raw.startsWith('./')) {
                            filePath = `./magpi_output/${raw}`;
                        } else {
                            filePath = raw;
                        }
                    }
                    
                    const isRaster = filePath && (filePath.endsWith('.tif') || filePath.endsWith('.tiff'));
                    
                    return {
                        id: n.id,
                        name: n.name || n.toolId,
                        visible: existing ? existing.visible : true,
                        opacity: existing ? existing.opacity : (n.toolId === 'core_extent' ? 15 : 80),
                        selected: n.selected || (selectedNode && selectedNode.id === n.id),
                        extent: extent,
                        filePath: filePath,
                        isRaster: isRaster,
                        geojsonData: existing ? existing.geojsonData : null,
                        rasterData: existing ? existing.rasterData : null,
                        rasterBounds: existing ? existing.rasterBounds : null,
                        cmap: existing ? existing.cmap : 'viridis',
                        vectorColor: existing ? existing.vectorColor : '#32d74b'
                    };
                })
                .filter(l => l.extent !== null);
                
            return [baseLayer, ...dynamicLayers];
        });
    }, [nodes, nodeStatuses, connections, selectedNode]);

    useEffect(() => {
        if (!mapInstance.current) return;
        const map = mapInstance.current;
        
        // Wait until map style is fully loaded before trying to add/update layers
        if (!map.isStyleLoaded()) {
            map.once('styledata', updateMapLayers);
            return;
        }

        updateMapLayers();

        function updateMapLayers() {
            const baseLayer = layers.find(l => l.isBase);
            if (baseLayer && map.getLayer('osm')) {
                map.setPaintProperty('osm', 'raster-opacity', baseLayer.visible ? baseLayer.opacity / 100 : 0);
            }

            layers.forEach(layer => {
                if (!layer.isBase && layer.visible && layer.extent) {
                    const { xmin, ymin, xmax, ymax } = layer.extent;
                    const y1 = parseFloat(ymin), x1 = parseFloat(xmin), y2 = parseFloat(ymax), x2 = parseFloat(xmax);
                    
                    if (!isNaN(y1) && !isNaN(x1) && !isNaN(y2) && !isNaN(x2)) {
                        const isSelected = layer.selected;
                        const color = isSelected ? '#ff8c00' : (layer.id.includes('extent') ? '#00ffff' : layer.vectorColor);
                        
                        // Render Extent Box
                        const extentId = `${layer.id}-extent`;
                        const extentGeoJson = {
                            type: 'Feature',
                            geometry: {
                                type: 'Polygon',
                                coordinates: [[[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]]]
                            }
                        };
                        
                        if (!map.getSource(extentId)) {
                            map.addSource(extentId, { type: 'geojson', data: extentGeoJson });
                            map.addLayer({
                                id: `${extentId}-fill`,
                                type: 'fill',
                                source: extentId,
                                paint: {
                                    'fill-color': color,
                                    'fill-opacity': layer.id.includes('extent') ? 0.2 : 0
                                }
                            });
                            map.addLayer({
                                id: `${extentId}-line`,
                                type: 'line',
                                source: extentId,
                                paint: {
                                    'line-color': color,
                                    'line-width': isSelected ? 4 : 2,
                                    'line-dasharray': layer.id.includes('extent') ? [4, 4] : [1]
                                }
                            });
                        } else {
                            map.getSource(extentId).setData(extentGeoJson);
                            if (map.getLayer(`${extentId}-fill`)) {
                                map.setPaintProperty(`${extentId}-fill`, 'fill-color', color);
                                map.setPaintProperty(`${extentId}-line`, 'line-color', color);
                                map.setPaintProperty(`${extentId}-line`, 'line-width', isSelected ? 4 : 2);
                            }
                        }

                        // Render GeoJSON
                        if (layer.filePath && !layer.id.includes('extent') && !layer.isRaster) {
                            if (layer.geojsonData) {
                                if (!map.getSource(layer.id)) {
                                    map.addSource(layer.id, { type: 'geojson', data: layer.geojsonData });
                                    map.addLayer({
                                        id: `${layer.id}-poly`,
                                        type: 'fill',
                                        source: layer.id,
                                        paint: {
                                            'fill-color': layer.vectorColor,
                                            'fill-opacity': layer.opacity / 100
                                        },
                                        filter: ['==', '$type', 'Polygon']
                                    });
                                    map.addLayer({
                                        id: `${layer.id}-line`,
                                        type: 'line',
                                        source: layer.id,
                                        paint: {
                                            'line-color': layer.vectorColor,
                                            'line-width': 1.5
                                        },
                                        filter: ['==', '$type', 'LineString']
                                    });
                                    map.addLayer({
                                        id: `${layer.id}-point`,
                                        type: 'circle',
                                        source: layer.id,
                                        paint: {
                                            'circle-color': layer.vectorColor,
                                            'circle-radius': 4
                                        },
                                        filter: ['==', '$type', 'Point']
                                    });
                                } else {
                                    map.getSource(layer.id).setData(layer.geojsonData);
                                    if (map.getLayer(`${layer.id}-poly`)) {
                                        map.setPaintProperty(`${layer.id}-poly`, 'fill-color', layer.vectorColor);
                                        map.setPaintProperty(`${layer.id}-poly`, 'fill-opacity', layer.opacity / 100);
                                        map.setPaintProperty(`${layer.id}-line`, 'line-color', layer.vectorColor);
                                        map.setPaintProperty(`${layer.id}-point`, 'circle-color', layer.vectorColor);
                                    }
                                }
                            } else if (!layer.isFetching) {
                                layer.isFetching = true;
                                fetch(`http://localhost:8080/api/geojson?file=${encodeURIComponent(layer.filePath)}`)
                                    .then(r => r.ok ? r.json() : null)
                                    .then(data => {
                                        if (data) {
                                            setLayers(current => current.map(l => l.id === layer.id ? { ...l, geojsonData: data, isFetching: false } : l));
                                        }
                                    }).catch(() => { layer.isFetching = false; });
                            }
                        }
                        
                        if (isSelected && !layer.isRaster) {
                            map.fitBounds([[x1, y1], [x2, y2]], { padding: 30, duration: 800 });
                        }
                    }
                } else if (!layer.isBase && !layer.visible) {
                    // Hide layers by setting opacity to 0
                    if (map.getLayer(`${layer.id}-extent-fill`)) {
                        map.setPaintProperty(`${layer.id}-extent-fill`, 'fill-opacity', 0);
                        map.setPaintProperty(`${layer.id}-extent-line`, 'line-opacity', 0);
                    }
                    if (map.getLayer(`${layer.id}-poly`)) {
                        map.setPaintProperty(`${layer.id}-poly`, 'fill-opacity', 0);
                        map.setPaintProperty(`${layer.id}-line`, 'line-opacity', 0);
                        map.setPaintProperty(`${layer.id}-point`, 'circle-opacity', 0);
                    }
                }
            });
        }
    }, [layers]);

    const activateDrawTool = () => {
        if (drawRef.current) {
            drawRef.current.changeMode('draw_polygon');
        }
    };

    return (
        <div className="w-full h-full flex flex-col relative bg-[#111827]">
            {/* Header */}
            <div className="px-4 py-3 bg-slate-800 text-xs font-bold tracking-widest text-slate-300 flex items-center justify-between border-b border-slate-700 z-10 shrink-0">
                <div className="flex items-center">
                    <MapIcon size={14} className={`mr-2 ${activeWorkspace === 'globe' ? 'text-cyan-400' : 'text-emerald-500'}`} /> 
                    {activeWorkspace === 'globe' ? 'GLOBE NEXUS' : 'LIVE VIEWPORT'}
                </div>
                <div className="flex items-center space-x-2">
                    <button 
                        onClick={() => setShowLayers(!showLayers)}
                        className={`px-2 py-1 rounded transition-colors flex items-center border ${showLayers ? 'bg-indigo-900/50 border-indigo-500/50 text-indigo-300' : 'bg-slate-900/50 border-slate-700 text-slate-400 hover:text-slate-200'}`}
                        title="Layer Management"
                    >
                        <Layers size={14} className="mr-1" /> LAYERS
                    </button>
                    <button 
                        onClick={activateDrawTool}
                        className="text-cyan-400 hover:text-cyan-200 bg-cyan-900/30 hover:bg-cyan-800/50 px-2 py-1 rounded transition-colors flex items-center border border-cyan-900/50"
                        title="Draw AOI Rectangle"
                    >
                        <Edit size={14} className="mr-1" /> DRAW AOI
                    </button>
                </div>
            </div>
            
            {/* Map Container */}
            <div className="flex-1 relative overflow-hidden z-0 maplibre-dark-mode-container flex">
                
                {/* Docked Layer Manager */}
                {showLayers && (
                    <div className="w-64 bg-slate-900 border-r border-slate-700 z-10 flex flex-col shrink-0 overflow-y-auto animate-fadeIn">
                        <div className="flex items-center text-xs font-bold text-slate-300 uppercase tracking-widest border-b border-slate-700 p-3 bg-slate-800/50 sticky top-0 z-20">
                            <Layers size={14} className="mr-2 text-indigo-400" /> Active Layers
                        </div>
                        <div className="p-3 flex flex-col space-y-4">
                            {layers.map((l, i) => (
                                <div key={l.id} className="flex flex-col space-y-2 pb-3 border-b border-slate-800/50 last:border-0">
                                    <div className="flex items-center justify-between">
                                        <span className={`text-xs font-medium ${l.selected ? 'text-[#ff8c00]' : 'text-slate-300'}`}>{l.name}</span>
                                        <button 
                                            onClick={() => {
                                                const newL = [...layers];
                                                newL[i].visible = !newL[i].visible;
                                                setLayers(newL);
                                            }}
                                            className={`${l.selected ? 'text-[#ff8c00]' : 'text-slate-500 hover:text-slate-300'}`}
                                        >
                                            {l.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                                        </button>
                                    </div>
                                    <input 
                                        type="range" 
                                        min="0" max="100" 
                                        value={l.opacity} 
                                        onChange={(e) => {
                                            const newL = [...layers];
                                            newL[i].opacity = e.target.value;
                                            setLayers(newL);
                                        }}
                                        className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                                    />
                                    
                                    {!l.isBase && !l.id.includes('extent') && (
                                        <div className="flex items-center space-x-2 mt-1">
                                            {l.isRaster ? (
                                                <select 
                                                    value={l.cmap}
                                                    onChange={(e) => {
                                                        const newL = [...layers];
                                                        newL[i].cmap = e.target.value;
                                                        newL[i].rasterData = null; // force refetch
                                                        setLayers(newL);
                                                    }}
                                                    className="w-full bg-slate-950 border border-slate-700 text-[9px] font-mono text-slate-400 p-1 rounded"
                                                >
                                                    <option value="viridis">Viridis</option>
                                                    <option value="plasma">Plasma</option>
                                                    <option value="inferno">Inferno</option>
                                                    <option value="magma">Magma</option>
                                                    <option value="gray">Grayscale</option>
                                                    <option value="turbo">Turbo</option>
                                                </select>
                                            ) : (
                                                <input 
                                                    type="color" 
                                                    value={l.vectorColor}
                                                    onChange={(e) => {
                                                        const newL = [...layers];
                                                        newL[i].vectorColor = e.target.value;
                                                        setLayers(newL);
                                                    }}
                                                    className="w-full h-6 bg-transparent border-0 cursor-pointer rounded"
                                                />
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                
                {/* Maps Container (Flex-1) */}
                <div className="flex-1 relative">
                    {/* Cesium Globe (Hidden when not in globe mode) */}
                    <div className={`w-full h-full bg-[#111827] ${activeWorkspace === 'globe' ? 'block' : 'hidden'}`}>
                        <Viewer 
                            full 
                            timeline={false} 
                            animation={false} 
                            baseLayerPicker={false}
                            navigationHelpButton={false}
                            geocoder={false}
                            sceneModePicker={false}
                            homeButton={false}
                            fullscreenButton={false}
                            infoBox={false}
                            selectionIndicator={false}
                        >
                            <ImageryLayer imageryProvider={osmImageryProvider} />
                            {selectedNode && selectedNode.params && selectedNode.params.xmin && (
                                <Entity
                                    name="AOI"
                                    polygon={{
                                        hierarchy: Cartesian3.fromDegreesArray([
                                            parseFloat(selectedNode.params.xmin), parseFloat(selectedNode.params.ymin),
                                            parseFloat(selectedNode.params.xmax), parseFloat(selectedNode.params.ymin),
                                            parseFloat(selectedNode.params.xmax), parseFloat(selectedNode.params.ymax),
                                            parseFloat(selectedNode.params.xmin), parseFloat(selectedNode.params.ymax)
                                        ]),
                                        material: Color.CYAN.withAlpha(0.2),
                                        outline: true,
                                        outlineColor: Color.CYAN
                                    }}
                                />
                            )}
                        </Viewer>
                    </div>
                    
                    {/* MapLibre 2D/3D Map (Hidden when in globe mode) */}
                    <div 
                        ref={mapRef} 
                        className={`${activeWorkspace !== 'globe' ? 'block' : 'hidden'}`}
                        style={{ width: '100%', height: '100%', backgroundColor: '#1f2937', touchAction: 'none' }}
                    ></div>
                </div>
            </div>

            {/* Attribute Table Panel */}
            {selectedFeature && (
                <div className="h-48 bg-slate-900 border-t border-slate-700 shrink-0 flex flex-col z-20 animate-fadeIn">
                    <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700">
                        <span className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center">
                            <Layers size={14} className="mr-2 text-indigo-400" /> 
                            Attributes: {selectedFeature.layerName}
                        </span>
                        <button 
                            onClick={() => setSelectedFeature(null)}
                            className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white"
                        >
                            <XCircle size={14} />
                        </button>
                    </div>
                    <div className="flex-1 overflow-auto p-0">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-slate-950 sticky top-0 shadow">
                                <tr>
                                    <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase border-b border-slate-700">Field</th>
                                    <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase border-b border-slate-700">Value</th>
                                </tr>
                            </thead>
                            <tbody>
                                {Object.entries(selectedFeature.feature.properties || {}).map(([key, value], idx) => (
                                    <tr key={idx} className="hover:bg-slate-800/50 border-b border-slate-800/50 transition-colors">
                                        <td className="px-4 py-2 text-xs font-mono text-emerald-400">{key}</td>
                                        <td className="px-4 py-2 text-xs text-slate-300">{value?.toString() || 'null'}</td>
                                    </tr>
                                ))}
                                {(!selectedFeature.feature.properties || Object.keys(selectedFeature.feature.properties).length === 0) && (
                                    <tr>
                                        <td colSpan="2" className="px-4 py-8 text-center text-xs text-slate-500 italic">No attributes found for this feature.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Footer Text (Only show if in compact Builder mode to save space in Globe mode) */}
            {activeWorkspace === 'builder' && (
                <div className="bg-slate-900 p-4 border-t border-slate-700 text-xs text-slate-400 font-mono leading-relaxed shrink-0">
                    <p className="text-emerald-400 font-bold mb-2 flex items-center">
                    <Satellite size={14} className="mr-2" /> OSM Connected
                    </p>
                    <p className="opacity-80">Click <strong className="text-cyan-400">DRAW</strong> to draw a polygon. It will spawn a universal <strong className="text-yellow-500">Spatial Extent</strong> node on the canvas.</p>
                </div>
            )}
        </div>
    );
});

export default MapViewport;