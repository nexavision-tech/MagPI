import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet-draw';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { Map as MapIcon, Satellite, Edit, Globe, Layers, Eye, EyeOff, XCircle, Upload } from 'lucide-react';
import { Viewer, Entity, ImageryLayer, GeoJsonDataSource } from 'resium';
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

const MapViewport = React.memo(({ onAoiDrawn, onAoiImported, selectedNode, activeWorkspace, nodes = [], nodeStatuses = {}, connections = [], globalEnv, mapLayers = [] }) => {
    const mapRef = useRef(null);
    const mapInstance = useRef(null); 
    const highlightGroup = useRef(null);
    const osmLayerRef = useRef(null);
    const cesiumRef = useRef(null);
    const osmImageryProvider = React.useMemo(() => new OpenStreetMapImageryProvider({ url: 'https://a.tile.openstreetmap.org/' }), []);
    const [selectedFeature, setSelectedFeature] = React.useState(null);
    const [loadedData, setLoadedData] = React.useState({}); // Cache for raster/geojson data
    const lastZoomedNode = useRef(null);

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
    
    // Fix Leaflet tile loading when switching views AND Sync Cesium Camera
    useEffect(() => {
        if (activeWorkspace === 'globe' && mapInstance.current && cesiumRef.current && cesiumRef.current.cesiumElement) {
            const center = mapInstance.current.getCenter();
            const zoom = mapInstance.current.getZoom();
            // Calculate approximate height based on Leaflet zoom level
            const height = 20000000 / Math.pow(2, zoom); 
            
            const viewer = cesiumRef.current.cesiumElement;
            viewer.camera.flyTo({
                destination: Cartesian3.fromDegrees(center.lng, center.lat, height),
                duration: 1.0
            });
        } else if (activeWorkspace !== 'globe' && mapInstance.current) {
            setTimeout(() => {
                mapInstance.current.invalidateSize(true);
            }, 100);
        }
    }, [activeWorkspace]);
    
    // Custom Event Listeners
    useEffect(() => {
        const handleFeatureSelect = (e) => setSelectedFeature(e.detail);
        const handleDrawAoi = () => activateDrawTool();
        const handleZoomLayer = (e) => {
            if (!mapInstance.current) return;
            const { layerId } = e.detail;
            
            // Check highlight group layers first
            let foundBounds = null;
            highlightGroup.current.eachLayer((layer) => {
                // If it's a marker, rectangle, or image overlay
                if (layer.getBounds && layer.options && (layer.options.className === layerId || layerId.includes('extent'))) {
                   foundBounds = layer.getBounds();
                }
            });
            
            // Fallback to loaded data cache
            if (!foundBounds && loadedData[layerId]) {
                const cached = loadedData[layerId];
                if (cached.bounds) foundBounds = cached.bounds;
                else if (cached.data) {
                    const gj = L.geoJSON(cached.data);
                    foundBounds = gj.getBounds();
                }
            }
            
            if (foundBounds && foundBounds.isValid && foundBounds.isValid()) {
                const mapPad = [window.innerWidth * 0.25, window.innerHeight * 0.25];
                mapInstance.current.fitBounds(foundBounds, { animate: true, padding: mapPad });
            }
        };

        window.addEventListener('magpi-feature-selected', handleFeatureSelect);
        window.addEventListener('magpi-draw-aoi', handleDrawAoi);
        window.addEventListener('magpi-zoom-layer', handleZoomLayer);
        
        return () => {
            window.removeEventListener('magpi-feature-selected', handleFeatureSelect);
            window.removeEventListener('magpi-draw-aoi', handleDrawAoi);
            window.removeEventListener('magpi-zoom-layer', handleZoomLayer);
        };
    }, [loadedData]);

    // Compute extents and file paths purely for rendering
    const computedLayers = React.useMemo(() => {
        return mapLayers.map(layer => {
            if (layer.isBase) return layer;
            const node = nodes.find(n => n.id === layer.id);
            if (!node) return layer;
            
            const extent = getAncestralExtent(node.id, nodes, connections);
            let filePath = null;
            if (node.params && (node.params.file_path || node.params.out_shp || node.params.out_feature_class || node.params.out_raster)) {
                let raw = node.params.file_path || node.params.out_shp || node.params.out_feature_class || node.params.out_raster;
                if (!raw.startsWith('/') && !raw.startsWith('./')) {
                    filePath = `./magpi_output/${raw}`;
                } else {
                    filePath = raw;
                }
            }
            const isRaster = filePath && (filePath.endsWith('.tif') || filePath.endsWith('.tiff'));
            
            return {
                ...layer,
                extent,
                filePath,
                isRaster,
                cmap: layer.cmap || 'viridis',
                vectorColor: layer.vectorColor || '#32d74b'
            };
        });
    }, [mapLayers, nodes, connections]);
    useEffect(() => {
        if (activeWorkspace === 'planar' && mapInstance.current) {
            const map = mapInstance.current;
            highlightGroup.current.clearLayers();
            
            computedLayers.forEach(layer => {
                if (!layer.visible) return;
                
                if (layer.isBase) {
                    if (!map.hasLayer(osmLayerRef.current)) {
                        map.addLayer(osmLayerRef.current);
                    }
                    osmLayerRef.current.setOpacity(layer.opacity / 100);                } 
                
                if (layer.extent) {
                    const { xmin, ymin, xmax, ymax } = layer.extent;
                    const y1 = parseFloat(ymin), x1 = parseFloat(xmin), y2 = parseFloat(ymax), x2 = parseFloat(xmax);
                    if (!isNaN(y1) && !isNaN(x1) && !isNaN(y2) && !isNaN(x2)) {
                        const bounds = [[y1, x1], [y2, x2]];
                        const isSelected = layer.selected;
                        const rect = L.rectangle(bounds, { 
                            color: isSelected ? '#ff8c00' : (layer.id.includes('extent') ? '#00ffff' : layer.vectorColor), 
                            weight: isSelected ? 4 : 2, 
                            fillOpacity: layer.id.includes('extent') ? 0.2 : 0, 
                            dashArray: layer.id.includes('extent') ? '4, 4' : null 
                        });
                        
                        rect.bindTooltip(layer.name, { 
                            permanent: isSelected, 
                            direction: "center", 
                            className: "bg-slate-900 text-white font-bold text-[10px] border-none shadow-lg" 
                        });
                        
                        highlightGroup.current.addLayer(rect);
                        
                        if (isSelected && activeWorkspace !== 'globe' && lastZoomedNode.current !== layer.id) {
                            try { 
                                if (y1 === y2 && x1 === x2) {
                                    mapInstance.current.setView([y1, x1], 15, { animate: false });
                                } else {
                                    const mapPad = [window.innerWidth * 0.25, window.innerHeight * 0.25];
                                    mapInstance.current.fitBounds(bounds, { animate: false, padding: mapPad }); 
                                }
                                lastZoomedNode.current = layer.id;
                            } catch (e) {}
                        }
                    }
                }

                // Render Raster
                if (layer.isRaster && layer.filePath) {
                    const cached = loadedData[layer.id];
                    if (cached && cached.type === 'raster') {
                        const imgLayer = L.imageOverlay(cached.image, cached.bounds, {
                            opacity: layer.opacity / 100,
                            interactive: true
                        });
                        imgLayer.bindPopup(`<div class="text-xs font-bold text-slate-800">${layer.name}</div>`);
                        highlightGroup.current.addLayer(imgLayer);
                        
                        if (layer.selected && !layer.extent && activeWorkspace !== 'globe' && lastZoomedNode.current !== layer.id) {
                            try { 
                                const mapPad = [window.innerWidth * 0.25, window.innerHeight * 0.25];
                                mapInstance.current.fitBounds(cached.bounds, { animate: false, padding: mapPad }); 
                                lastZoomedNode.current = layer.id;
                            } catch (e) {}
                        }
                    } else if (!cached || !cached.isFetching) {
                        setLoadedData(prev => ({ ...prev, [layer.id]: { isFetching: true } }));
                        fetch(`http://${window.location.hostname}:8282/api/raster?file=${encodeURIComponent(layer.filePath)}&cmap=${layer.cmap}`)
                            .then(r => r.ok ? r.json() : null)
                            .then(data => {
                                if (data && data.image) {
                                    setLoadedData(prev => ({ ...prev, [layer.id]: { type: 'raster', image: data.image, bounds: data.bounds, isFetching: false } }));
                                }
                            }).catch(() => { setLoadedData(prev => ({ ...prev, [layer.id]: { isFetching: false } })); });
                    }
                }
                // Render GeoJSON
                else if (layer.filePath && !layer.id.includes('extent')) {
                    const cached = loadedData[layer.id];
                    if (cached && cached.type === 'geojson') {
                        const gjLayer = L.geoJSON(cached.data, {
                            style: { color: layer.vectorColor, weight: 1.5, fillOpacity: layer.opacity / 100 },
                            onEachFeature: (feature, featureLayer) => {
                                featureLayer.on('click', (e) => {
                                    L.DomEvent.stopPropagation(e);
                                    window.dispatchEvent(new CustomEvent('magpi-feature-selected', { detail: { feature: feature, layerName: layer.name } }));
                                });
                            }
                        });
                        highlightGroup.current.addLayer(gjLayer);
                        
                        if (layer.selected && !layer.extent && activeWorkspace !== 'globe' && lastZoomedNode.current !== layer.id) {
                            try { 
                                const bounds = gjLayer.getBounds();
                                if (bounds.isValid()) {
                                    if (bounds.getNorth() === bounds.getSouth() && bounds.getEast() === bounds.getWest()) {
                                        mapInstance.current.setView(bounds.getCenter(), 15, { animate: false });
                                    } else {
                                        const mapPad = [window.innerWidth * 0.25, window.innerHeight * 0.25];
                                        mapInstance.current.fitBounds(bounds, { animate: false, padding: mapPad }); 
                                    }
                                }
                                lastZoomedNode.current = layer.id;
                            } catch (e) {}
                        }
                    } else if (!cached || !cached.isFetching) {
                        setLoadedData(prev => ({ ...prev, [layer.id]: { isFetching: true } }));
                        fetch(`http://${window.location.hostname}:8282/api/geojson?file=${encodeURIComponent(layer.filePath)}`)
                            .then(r => r.ok ? r.json() : null)
                            .then(data => {
                                if (data) {
                                    setLoadedData(prev => ({ ...prev, [layer.id]: { type: 'geojson', data: data, isFetching: false } }));
                                }
                            }).catch(() => { setLoadedData(prev => ({ ...prev, [layer.id]: { isFetching: false } })); });
                    }
                }
            });
            
            if (!computedLayers.find(l => l.isBase)?.visible && map.hasLayer(osmLayerRef.current)) {
                map.removeLayer(osmLayerRef.current);
            }
        }
    }, [computedLayers, activeWorkspace, loadedData]);

    const activateDrawTool = () => {
        if (mapInstance.current) {
            new L.Draw.Rectangle(mapInstance.current, { 
                shapeOptions: { color: '#00ffff', weight: 2, fillOpacity: 0.15 } 
            }).enable();
        }
    };

    useEffect(() => {
        if (!mapInstance.current) return;
        const container = mapInstance.current.getContainer();
        
        const handleDragOver = (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        };

        const handleDrop = (e) => {
            e.preventDefault();
            let data = null;
            if (window.__draggedMagPITool) {
                data = window.__draggedMagPITool;
                window.__draggedMagPITool = null;
            } else {
                const dataStr = e.dataTransfer.getData('application/reactflow');
                if (dataStr) {
                    try {
                        data = JSON.parse(dataStr);
                    } catch (err) {
                        console.error("Failed to parse dropped file data", err);
                    }
                }
            }
            
            if (data) {
                window.dispatchEvent(new CustomEvent('magpi-map-drop', { detail: data }));
            }
        };

        container.addEventListener('dragover', handleDragOver);
        container.addEventListener('drop', handleDrop);
        
        return () => {
            container.removeEventListener('dragover', handleDragOver);
            container.removeEventListener('drop', handleDrop);
        };
    }, [activeWorkspace]);

    return (
        <div className="w-full h-full flex flex-col relative bg-[#111827]">
            {/* Header */}
            <div className="px-4 py-3 bg-slate-800 text-xs font-bold tracking-widest text-slate-300 flex items-center justify-between border-b border-slate-700 z-10 shrink-0">
                <div className="flex items-center">
                    <MapIcon size={14} className={`mr-2 ${activeWorkspace === 'globe' ? 'text-cyan-400' : 'text-emerald-500'}`} /> 
                    {activeWorkspace === 'globe' ? 'GLOBE NEXUS' : 'LIVE VIEWPORT'}
                </div>
                {/* Tools migrated to TopRibbon */}
            </div>
            
            {/* Map Container */}
            <div className="flex-1 relative overflow-hidden z-0 leaflet-dark-mode-container flex">
                
                {/* Maps Container (Flex-1) */}
                <div className="flex-1 relative overflow-hidden">
                    {/* Cesium Globe (Hidden when not in globe mode) */}
                    <div 
                        className="absolute inset-0 w-full h-full bg-[#111827]" 
                        style={{ 
                            visibility: activeWorkspace === 'globe' ? 'visible' : 'hidden', 
                            zIndex: activeWorkspace === 'globe' ? 10 : 1 
                        }}
                    >
                        <Viewer 
                            ref={cesiumRef}
                            full 
                            timeline={false} 
                            animation={false} 
                            baseLayerPicker={false}
                            navigationHelpButton={true}
                            geocoder={false}
                            sceneModePicker={true}
                            homeButton={true}
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
                                        outlineColor: Color.CYAN,
                                        height: 0
                                    }}
                                />
                            )}
                            
                            {computedLayers.filter(l => l.visible !== false && loadedData[l.id]?.type === 'geojson').map(layer => (
                                <GeoJsonDataSource 
                                    key={`globe-${layer.id}`}
                                    data={loadedData[layer.id].data}
                                    stroke={Color.fromCssColorString(layer.vectorColor || '#22d3ee')}
                                    fill={Color.fromCssColorString(layer.vectorColor || '#22d3ee').withAlpha(0.3)}
                                    markerColor={Color.fromCssColorString(layer.vectorColor || '#22d3ee')}
                                    markerSize={5}
                                    clampToGround={false}
                                />
                            ))}
                        </Viewer>
                    </div>
                    
                    {/* Leaflet 2D Map (Hidden when in globe mode) */}
                    <div 
                        ref={mapRef} 
                        className="absolute inset-0 w-full h-full"
                        style={{ 
                            visibility: activeWorkspace === 'globe' ? 'hidden' : 'visible',
                            zIndex: activeWorkspace === 'globe' ? 1 : 10,
                            backgroundColor: '#1f2937', 
                            touchAction: 'none' 
                        }}
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