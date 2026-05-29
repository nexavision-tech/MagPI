import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet-draw';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
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
    const highlightGroup = useRef(null);
    const osmLayerRef = useRef(null);
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

        // Zeroized global extent [0, 0] zoom 2
        const map = L.map(mapRef.current, { zoomControl: false }).setView([0, 0], 2);
        mapInstance.current = map;

        osmLayerRef.current = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OSM'
        }).addTo(map);

        L.control.zoom({ position: 'topright' }).addTo(map);

        highlightGroup.current = new L.FeatureGroup();
        map.addLayer(highlightGroup.current);

        const drawControl = new L.Control.Draw({
            draw: {
                polyline: true, polygon: true, circle: false, marker: true, circlemarker: false,
                rectangle: { shapeOptions: { color: '#00ffff', weight: 2, fillOpacity: 0.15 } } 
            },
            edit: false 
        });
        map.addControl(drawControl);

        const style = document.createElement('style');
        style.innerHTML = '.leaflet-draw-toolbar { display: none !important; }';
        document.head.appendChild(style);

        map.on(L.Draw.Event.CREATED, function (e) {
            let bounds;
            if (e.layerType === 'marker') {
                const latlng = e.layer.getLatLng();
                bounds = L.latLngBounds(latlng, latlng); // Zero-size bounds for a point
            } else {
                bounds = e.layer.getBounds();
            }
            
            if (onAoiDrawn) {
                onAoiDrawn({
                    xmin: bounds.getWest().toFixed(5),
                    ymin: bounds.getSouth().toFixed(5),
                    xmax: bounds.getEast().toFixed(5),
                    ymax: bounds.getNorth().toFixed(5)
                });
            }
        });

        const resizeObserver = new ResizeObserver(() => {
            if (mapInstance.current) {
                mapInstance.current.invalidateSize();
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
        if (!mapInstance.current || !highlightGroup.current) return;
        highlightGroup.current.clearLayers();

        const baseLayer = layers.find(l => l.isBase);
        if (osmLayerRef.current && baseLayer) {
            osmLayerRef.current.setOpacity(baseLayer.visible ? baseLayer.opacity / 100 : 0);
        }

        layers.forEach(layer => {
            if (!layer.isBase && layer.visible && layer.extent) {
                const { xmin, ymin, xmax, ymax } = layer.extent;
                const y1 = parseFloat(ymin), x1 = parseFloat(xmin), y2 = parseFloat(ymax), x2 = parseFloat(xmax);
                if (!isNaN(y1) && !isNaN(x1) && !isNaN(y2) && !isNaN(x2)) {
                    const bounds = [[y1, x1], [y2, x2]];
                    const isSelected = layer.selected;
                    const isSuccess = nodeStatuses && nodeStatuses[layer.id] === 'success';
                    const color = isSelected ? '#ff8c00' : (layer.id.includes('extent') ? '#00ffff' : layer.vectorColor);
                    const weight = isSelected ? 4 : 2;
                    
                    const rect = L.rectangle(bounds, { 
                        color: color, 
                        weight: weight, 
                        fillOpacity: layer.id.includes('extent') ? 0.2 : 0, 
                        dashArray: layer.id.includes('extent') ? '4, 4' : null 
                    });
                    
                    rect.bindTooltip(layer.name, { 
                        permanent: isSelected, 
                        direction: "center", 
                        className: "bg-slate-900 text-white font-bold text-[10px] border-none shadow-lg" 
                    });
                    
                    highlightGroup.current.addLayer(rect);
                    
                    // Render Raster
                    if (layer.isRaster && layer.filePath) {
                        if (layer.rasterData && layer.rasterBounds) {
                            const imgLayer = L.imageOverlay(layer.rasterData, layer.rasterBounds, {
                                opacity: layer.opacity / 100,
                                interactive: true
                            });
                            imgLayer.bindPopup(`<div class="text-xs font-bold text-slate-800">${layer.name}</div>`);
                            highlightGroup.current.addLayer(imgLayer);
                        } else if (!layer.isFetching) {
                            layer.isFetching = true;
                            fetch(`http://localhost:8080/api/raster?file=${encodeURIComponent(layer.filePath)}&cmap=${layer.cmap}`)
                                .then(r => r.ok ? r.json() : null)
                                .then(data => {
                                    if (data && data.image) {
                                        setLayers(current => current.map(l => l.id === layer.id ? { ...l, rasterData: data.image, rasterBounds: data.bounds, isFetching: false } : l));
                                    }
                                }).catch(() => { layer.isFetching = false; });
                        }
                    }
                    // Render GeoJSON
                    else if (layer.filePath && !layer.id.includes('extent')) {
                        if (layer.geojsonData) {
                            const gjLayer = L.geoJSON(layer.geojsonData, {
                                style: { color: layer.vectorColor, weight: 1.5, fillOpacity: layer.opacity / 100 },
                                onEachFeature: (feature, featureLayer) => {
                                    featureLayer.on('click', (e) => {
                                        L.DomEvent.stopPropagation(e);
                                        // Dispatch event to Attribute Table instead of popup
                                        window.dispatchEvent(new CustomEvent('magpi-feature-selected', { 
                                            detail: { feature: feature, layerName: layer.name }
                                        }));
                                    });
                                }
                            });
                            highlightGroup.current.addLayer(gjLayer);
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
                        mapInstance.current.flyToBounds(bounds, { duration: 0.8, padding: [30, 30] });
                    }
                }
            }
        });
    }, [layers]);

    const activateDrawTool = () => {
        if (mapInstance.current) {
            new L.Draw.Rectangle(mapInstance.current, { 
                shapeOptions: { color: '#00ffff', weight: 2, fillOpacity: 0.15 } 
            }).enable();
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
            <div className="flex-1 relative overflow-hidden z-0 leaflet-dark-mode-container flex">
                
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
                    
                    {/* Leaflet 2D Map (Hidden when in globe mode) */}
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
                    <p className="opacity-80">Click <strong className="text-cyan-400">DRAW</strong> to drag a bounding box. It will spawn a universal <strong className="text-yellow-500">Spatial Extent</strong> node on the canvas.</p>
                </div>
            )}
        </div>
    );
});

export default MapViewport;