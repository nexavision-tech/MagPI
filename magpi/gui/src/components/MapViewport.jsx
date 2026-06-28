import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import 'leaflet-draw';
import 'leaflet.vectorgrid';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { Satellite } from 'lucide-react';
import { OpenStreetMapImageryProvider } from 'cesium';
import { Cartesian3 } from 'cesium';

// Internal modules
import { CesiumViewport } from './map/CesiumViewport';
import { useMapEvents } from './map/hooks/useMapEvents';
import { useLayerDataFetcher } from './map/hooks/useLayerDataFetcher';
import { useMapRenderer } from './map/hooks/useMapRenderer';
import { useStyleManager } from './map/hooks/useStyleManager';
import { useVertexSnapping } from './map/hooks/useVertexSnapping';

window.type = ''; 

const getAncestralExtent = (nodeId, nodes, connections) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return null;
    
    if (node.params && node.params.xmin !== undefined && node.params.ymin !== undefined && node.params.xmax !== undefined && node.params.ymax !== undefined) {
        return { xmin: node.params.xmin, ymin: node.params.ymin, xmax: node.params.xmax, ymax: node.params.ymax };
    }

    const incomingCxs = connections ? connections.filter(c => c.to === nodeId) : [];
    for (const cx of incomingCxs) {
        const extent = getAncestralExtent(cx.from, nodes, connections);
        if (extent) return extent;
    }
    return null;
};

const MapViewport = React.memo(({ onAoiDrawn, onAoiImported, selectedNode, activeWorkspace, nodes = [], nodeStatuses = {}, connections = [], globalEnv, mapLayers = [], autoZoom, selectedFeatures, setSelectedFeatures, interactionMode = 'nav', explicitRender, setExplicitRender }) => {
    const mapRef = useRef(null);
    const mapInstance = useRef(null); 
    const highlightGroup = useRef(null);
    const osmLayerRef = useRef(null);
    const cesiumRef = useRef(null);
    const osmImageryProvider = React.useMemo(() => new OpenStreetMapImageryProvider({ url: 'https://a.tile.openstreetmap.org/' }), []);
    
    const [loadedData, setLoadedData] = React.useState({});
    const [currentZoom, setCurrentZoom] = React.useState(2);
    const [viewportBBox, setViewportBBox] = React.useState("");
    const [isEditingMode, setIsEditingMode] = React.useState(false);
    const [renderedCells, setRenderedCells] = React.useState(new Set()); 

    const lastZoomedNode = useRef(null);
    const activeFeatureLayer = useRef(null);
    const drawMode = useRef(null);
    const interactionModeRef = useRef(interactionMode);
    
    const nodesRef = useRef(nodes);
    const loadedDataRef = useRef(loadedData);
    const selectedNodeRef = useRef(selectedNode);
    const selectedFeaturesRef = useRef(selectedFeatures);
    
    useEffect(() => { nodesRef.current = nodes; }, [nodes]);
    useEffect(() => { loadedDataRef.current = loadedData; }, [loadedData]);
    useEffect(() => { selectedNodeRef.current = selectedNode; }, [selectedNode]);
    useEffect(() => { selectedFeaturesRef.current = selectedFeatures; }, [selectedFeatures]);
    
    useEffect(() => {
        interactionModeRef.current = interactionMode;
        if (mapInstance.current && osmLayerRef.current && !mapInstance.current.hasLayer(osmLayerRef.current)) {
            mapInstance.current.addLayer(osmLayerRef.current);
        }
        if (mapInstance.current) {
            const container = mapInstance.current.getContainer();
            container.classList.remove('magpi-nav-mode', 'magpi-select-mode');
            if (!isEditingMode) {
                container.classList.add(interactionMode === 'select' ? 'magpi-select-mode' : 'magpi-nav-mode');
            }
        }
    }, [interactionMode, isEditingMode]);

    useEffect(() => {
        if (!mapRef.current || mapInstance.current) return; 

        const map = L.map(mapRef.current, { 
            zoomControl: false, 
            doubleClickZoom: false,
            preferCanvas: true // Use canvas instead of SVG for massive vector performance (400k+ footprints)
        }).setView([0, 0], 2);
        mapInstance.current = map;
        map.on('zoomend', () => setCurrentZoom(map.getZoom()));

        map.on('moveend', () => {
            const bounds = map.getBounds();
            const bboxStr = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
            setViewportBBox(bboxStr);
        });

        if (map.boxZoom) {
            map.boxZoom._onMouseUp = function (e) {
                if ((e.which !== 1) && (e.button !== 1)) { return; }
                this._finish();
                if (!this._moved) { return; }
                this._clearDeferredResetState();
                this._resetStateTimeout = setTimeout(L.bind(this._resetState, this), 0);
                var bounds = new L.LatLngBounds(
                    this._map.containerPointToLatLng(this._startPoint),
                    this._map.containerPointToLatLng(this._point));
                this._map.fire('boxzoomend', {boxZoomBounds: bounds});
            };
        }

        map.on('boxzoomend', (e) => {
            const selectedFeaturesArr = [];
            if (highlightGroup.current) {
                highlightGroup.current.eachLayer(layerObj => {
                    const layerId = layerObj.magpi_layer_id;
                    if (!layerId) return;
                    if (layerObj instanceof L.GeoJSON) {
                        layerObj.eachLayer(childLayer => {
                            if (childLayer.feature && childLayer.getBounds && e.boxZoomBounds.intersects(childLayer.getBounds())) {
                                selectedFeaturesArr.push({
                                    feature: childLayer.feature,
                                    layerName: childLayer.feature.properties?.layer_name || layerId,
                                    nodeId: layerId,
                                    shiftKey: true
                                });
                            }
                        });
                    }
                });
            }
            selectedFeaturesArr.forEach((sf, idx) => {
                window.dispatchEvent(new CustomEvent('magpi-feature-selected', { detail: { ...sf, isBulk: idx > 0 } }));
            });
        });

        map.on('click', (e) => {
            if (!e.originalEvent || !e.originalEvent._magpiFeatureClicked) {
                window.dispatchEvent(new CustomEvent('magpi-feature-selected', { detail: null }));
            }
        });
        
        const cursorStyle = document.createElement('style');
        cursorStyle.innerHTML = `
            .leaflet-container { cursor: grab !important; }
            .leaflet-grab { cursor: grab !important; }
            .leaflet-dragging .leaflet-grab { cursor: grabbing !important; }
            .leaflet-interactive { cursor: pointer !important; }
            .magpi-edit-mode.leaflet-container { cursor: default !important; }
            .magpi-edit-mode .leaflet-grab { cursor: default !important; }
            .magpi-edit-mode.leaflet-dragging .leaflet-grab { cursor: default !important; }
            .magpi-edit-mode .leaflet-interactive { cursor: pointer !important; }
        `;
        document.head.appendChild(cursorStyle);

        osmLayerRef.current = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OSM',
            maxNativeZoom: 19,
            maxZoom: 24
        }).addTo(map);

        L.control.zoom({ position: 'topright' }).addTo(map);
        L.control.scale({ position: 'bottomleft', imperial: true, metric: true }).addTo(map);

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
                bounds = L.latLngBounds(latlng, latlng);
            } else {
                bounds = e.layer.getBounds();
            }
            
            if (drawMode.current === 'marquee' || drawMode.current === 'lasso') {
                const selectedFeaturesArr = [];
                if (highlightGroup.current) {
                    highlightGroup.current.eachLayer(layerObj => {
                        const layerId = layerObj.magpi_layer_id;
                        if (!layerId) return;
                        if (layerObj instanceof L.GeoJSON) {
                            layerObj.eachLayer(childLayer => {
                                if (childLayer.feature && childLayer.getBounds && bounds.intersects(childLayer.getBounds())) {
                                    selectedFeaturesArr.push({
                                        feature: childLayer.feature,
                                        layerName: childLayer.feature.properties?.layer_name || layerId,
                                        nodeId: layerId,
                                        shiftKey: true,
                                        isMarquee: true
                                    });
                                }
                            });
                        }
                    });
                }
                selectedFeaturesArr.forEach((sf, idx) => {
                    window.dispatchEvent(new CustomEvent('magpi-feature-selected', { detail: { ...sf, isBulk: idx > 0 } }));
                });
            } else if (drawMode.current === 'polygon') {
                if (highlightGroup.current) {
                    let targetLayer = null;
                    highlightGroup.current.eachLayer(layerObj => {
                        if (layerObj instanceof L.GeoJSON) targetLayer = layerObj;
                    });
                    
                    if (targetLayer) {
                        const newFeature = e.layer.toGeoJSON();
                        newFeature.properties = { isNewFeature: true };
                        e.layer.feature = newFeature;
                        e.layer._magpiModified = true;
                        targetLayer.addLayer(e.layer);
                        
                        window.dispatchEvent(new CustomEvent('magpi-feature-selected', { 
                            detail: { 
                                feature: newFeature, 
                                layerName: targetLayer.magpi_layer_id || 'new_polygon', 
                                nodeId: targetLayer.magpi_layer_id, 
                            } 
                        }));
                        console.log('[MagPI] New polygon added to vector layer.');
                    }
                }
            } else {
                if (onAoiDrawn) {
                    onAoiDrawn({
                        xmin: bounds.getWest().toFixed(5),
                        ymin: bounds.getSouth().toFixed(5),
                        xmax: bounds.getEast().toFixed(5),
                        ymax: bounds.getNorth().toFixed(5)
                    });
                }
            }
            drawMode.current = null;
        });

        map.on(L.Draw.Event.EDITED, function (e) {
            e.layers.eachLayer(function (layer) {
                if (layer.feature && typeof layer.toGeoJSON === 'function') {
                    const newGeoJson = layer.toGeoJSON();
                    layer.feature.geometry = newGeoJson.geometry;
                }
            });
        });

        const resizeObserver = new ResizeObserver(() => {
            if (mapInstance.current) mapInstance.current.invalidateSize();
        });
        resizeObserver.observe(mapRef.current);

        return () => {
            resizeObserver.disconnect();
            map.remove();
            mapInstance.current = null;
        };
    }, [onAoiDrawn]);
    
    // Cesium camera sync
    useEffect(() => {
        if (activeWorkspace === 'globe' && mapInstance.current && cesiumRef.current && cesiumRef.current.cesiumElement) {
            const center = mapInstance.current.getCenter();
            const zoom = mapInstance.current.getZoom();
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
    
    const activateDrawTool = (mode = 'aoi') => {
        if (mapInstance.current) {
            drawMode.current = mode;
            if (mode === 'lasso') {
                new L.Draw.Polygon(mapInstance.current, { shapeOptions: { color: '#ec4899', weight: 2, fillOpacity: 0.1, dashArray: '5, 5' } }).enable();
            } else if (mode === 'marquee') {
                new L.Draw.Rectangle(mapInstance.current, { shapeOptions: { color: '#a855f7', weight: 2, fillOpacity: 0.1, dashArray: '5, 5' } }).enable();
            } else if (mode === 'polygon') {
                new L.Draw.Polygon(mapInstance.current, { shapeOptions: { color: '#38bdf8', weight: 2, fillOpacity: 0.4 } }).enable();
            } else {
                new L.Draw.Rectangle(mapInstance.current, { shapeOptions: { color: '#eab308', weight: 2, fillOpacity: 0.15 } }).enable();
            }
        }
    };

    // Computed layers mapping
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
                toolId: node.toolId,
                extent,
                filePath,
                isRaster,
                cmap: layer.cmap || 'viridis',
                vectorColor: layer.vectorColor || '#32d74b'
            };
        });
    }, [mapLayers, nodes, connections]);

    // Use Custom Hooks
    useMapEvents({
        mapInstance,
        highlightGroup,
        loadedData,
        loadedDataRef,
        setLoadedData,
        explicitRender,
        setRenderedCells,
        setIsEditingMode,
        activeFeatureLayer,
        nodesRef,
        activateDrawTool
    });

    useLayerDataFetcher({
        computedLayers,
        loadedData,
        setLoadedData,
        explicitRender,
        viewportBBox,
        globalEnv
    });

    useMapRenderer({
        mapInstance,
        highlightGroup,
        computedLayers,
        loadedData,
        connections,
        nodes,
        explicitRender,
        renderedCells,
        selectedFeaturesRef,
        selectedNodeRef,
        interactionModeRef,
        lastZoomedNode,
        autoZoom
    });

    useStyleManager({
        highlightGroup,
        mapInstance,
        activeWorkspace,
        computedLayers,
        selectedFeatures,
        explicitRender,
        renderedCells,
        isEditingMode
    });

    useVertexSnapping({
        mapInstance,
        highlightGroup,
        isEditingMode
    });

    useEffect(() => {
        // Handle resizing and drag/drop
        if (activeWorkspace === 'globe' && cesiumRef.current && cesiumRef.current.cesiumElement) {
            setTimeout(() => { cesiumRef.current.cesiumElement.resize(); }, 100);
        } else if (activeWorkspace !== 'globe' && mapInstance.current) {
            setTimeout(() => { mapInstance.current.invalidateSize(true); }, 100);
        }

        const handleDragEnter = (e) => { if (activeWorkspace === 'planar') { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); } };
        const handleDragOver = (e) => { if (activeWorkspace === 'planar') { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); e.dataTransfer.dropEffect = 'move'; } };
        const handleDrop = (e) => {
            if (activeWorkspace === 'planar') {
                e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
                let data = null;
                if (window.__draggedMagPITool) {
                    data = window.__draggedMagPITool;
                    window.__draggedMagPITool = null;
                } else {
                    const dataStr = e.dataTransfer.getData('application/reactflow');
                    if (dataStr) { try { data = JSON.parse(dataStr); } catch (err) {} }
                }
                if (data) {
                    window.dispatchEvent(new CustomEvent('magpi-map-drop', { detail: data }));
                }
            }
        };

        window.addEventListener('dragenter', handleDragEnter, { capture: true });
        window.addEventListener('dragover', handleDragOver, { capture: true });
        window.addEventListener('drop', handleDrop, { capture: true });

        return () => {
            window.removeEventListener('dragenter', handleDragEnter, { capture: true });
            window.removeEventListener('dragover', handleDragOver, { capture: true });
            window.removeEventListener('drop', handleDrop, { capture: true });
        };
    }, [activeWorkspace]);

    return (
        <div className="w-full h-full flex flex-col relative bg-[#111827]">
            <div className="flex-1 relative overflow-hidden z-0 leaflet-dark-mode-container flex">
                <div className="flex-1 relative overflow-hidden">
                    <CesiumViewport 
                        activeWorkspace={activeWorkspace}
                        cesiumRef={cesiumRef}
                        osmImageryProvider={osmImageryProvider}
                        selectedNode={selectedNode}
                        computedLayers={computedLayers}
                        loadedData={loadedData}
                    />
                    
                    <div 
                        ref={mapRef} 
                        className="absolute inset-0 w-full h-full magpi-nav-mode"
                        style={{ 
                            visibility: activeWorkspace === 'globe' ? 'hidden' : 'visible',
                            zIndex: activeWorkspace === 'globe' ? 1 : 10,
                            backgroundColor: '#1f2937', 
                            touchAction: 'none' 
                        }}
                    ></div>

                    {activeWorkspace !== 'globe' && (
                        <div className="absolute bottom-12 left-2 bg-slate-900/80 backdrop-blur border border-slate-700 text-[10px] text-slate-400 px-2 py-1 rounded shadow-lg z-[1000] pointer-events-none font-mono flex items-center">
                            <span className="text-cyan-400 mr-1 font-bold">Z</span> {currentZoom}
                        </div>
                    )}
                    <style>{`
                        .leaflet-control-scale-line {
                            background: rgba(15, 23, 42, 0.8) !important;
                            backdrop-filter: blur(4px);
                            border: 1px solid rgba(51, 65, 85, 1) !important;
                            color: #94a3b8 !important;
                            font-family: monospace;
                            text-shadow: none !important;
                            border-radius: 4px;
                            line-height: 1.2;
                            padding: 2px 5px !important;
                            border-top: none !important;
                        }
                    `}</style>
                    {activeWorkspace !== 'globe' && (
                        <div className="absolute top-20 right-3 z-[1000] pointer-events-none drop-shadow-lg opacity-80 mix-blend-screen bg-slate-900/40 p-2 rounded-full border border-slate-700">
                            <svg width="18" height="30" viewBox="0 0 24 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 0L24 40L12 30L0 40L12 0Z" fill="#ef4444" />
                                <path d="M12 0L24 40L12 30V0Z" fill="#b91c1c" />
                                <path d="M12 0L12 30L0 40L12 0Z" fill="#f87171" />
                                <text x="12" y="-5" fill="#f8fafc" fontSize="14" fontFamily="sans-serif" fontWeight="bold" textAnchor="middle">N</text>
                            </svg>
                        </div>
                    )}
                </div>
            </div>

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