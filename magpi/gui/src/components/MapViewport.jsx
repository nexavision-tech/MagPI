import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet-draw';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import 'leaflet.vectorgrid';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { Map as MapIcon, Satellite, Edit, Globe, Layers, Eye, EyeOff, XCircle, Upload } from 'lucide-react';
import { Viewer, Entity, ImageryLayer, GeoJsonDataSource } from 'resium';
import { Cartesian3, Color, OpenStreetMapImageryProvider } from 'cesium';

window.type = ''; 

const getAncestralExtent = (nodeId, nodes, connections) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return null;
    
    // Check if the node itself has explicit bounds assigned (e.g. from Auto-Scan)
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

const MapViewport = React.memo(({ onAoiDrawn, onAoiImported, selectedNode, activeWorkspace, nodes = [], nodeStatuses = {}, connections = [], globalEnv, mapLayers = [], autoZoom, selectedFeatures, setSelectedFeatures }) => {
    const mapRef = useRef(null);
    const mapInstance = useRef(null); 
    const highlightGroup = useRef(null);
    const osmLayerRef = useRef(null);
    const cesiumRef = useRef(null);
    const osmImageryProvider = React.useMemo(() => new OpenStreetMapImageryProvider({ url: 'https://a.tile.openstreetmap.org/' }), []);
    const [loadedData, setLoadedData] = React.useState({}); // Cache for raster/geojson data
    const lastZoomedNode = useRef(null);
    const activeFeatureLayer = useRef(null);
    const [currentZoom, setCurrentZoom] = React.useState(2);
    const [viewportBBox, setViewportBBox] = React.useState("");
    const [viewportBBoxTimestamp, setViewportBBoxTimestamp] = React.useState(Date.now());
    const [isEditingMode, setIsEditingMode] = React.useState(false);
    
    // Explicit render state to lock a fishnet cell override
    const [explicitRender, setExplicitRender] = React.useState(null); // { bbox, sourceLayerId }
    const drawMode = useRef(null);

    useEffect(() => {
        if (!mapRef.current) return;
        if (mapInstance.current) return; 

        // Zeroized global extent [0, 0] zoom 2
        const map = L.map(mapRef.current, { zoomControl: false, doubleClickZoom: false }).setView([0, 0], 2);
        mapInstance.current = map;
        map.on('zoomend', () => {
            setCurrentZoom(map.getZoom());
        });

        // Add moveend listener for dynamic viewport streaming
        map.on('moveend', () => {
            const bounds = map.getBounds();
            const bboxStr = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
            setViewportBBox(bboxStr);
            setViewportBBoxTimestamp(Date.now());
        });

        // Global map click to deselect features
        map.on('click', (e) => {
            if (!e.originalEvent || !e.originalEvent._magpiFeatureClicked) {
                window.dispatchEvent(new CustomEvent('magpi-feature-selected', { detail: null }));
            }
        });

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
                bounds = L.latLngBounds(latlng, latlng); // Zero-size bounds for a point
            } else {
                bounds = e.layer.getBounds();
            }
            
            if (drawMode.current === 'marquee' || drawMode.current === 'lasso') {
                // Find all loaded vectors and check intersection!
                const selectedFeaturesArr = [];
                if (highlightGroup.current) {
                    highlightGroup.current.eachLayer(layerObj => {
                        const layerId = layerObj.magpi_layer_id;
                        if (!layerId) return;
                        if (layerObj instanceof L.GeoJSON) {
                            layerObj.eachLayer(childLayer => {
                                if (childLayer.feature && childLayer.getBounds) {
                                    if (bounds.intersects(childLayer.getBounds())) {
                                        selectedFeaturesArr.push({
                                            feature: childLayer.feature,
                                            layerName: childLayer.feature.properties?.layer_name || layerId,
                                            nodeId: layerId,
                                            shiftKey: true // Act as multi-select
                                        });
                                    }
                                }
                            });
                        }
                    });
                }
                
                if (selectedFeaturesArr.length > 0) {
                    // We must dispatch them sequentially or as a batch.
                    // Currently handleFeatureSelect supports shiftKey for adding.
                    // Since we want to SET them, maybe we clear first, then add.
                    // But we don't have a bulk set event. 
                    // Let's just dispatch one by one with shiftKey.
                    selectedFeaturesArr.forEach((sf, idx) => {
                        window.dispatchEvent(new CustomEvent('magpi-feature-selected', { detail: { ...sf, isBulk: idx > 0 } }));
                    });
                } else {
                    console.log("[MagPI] No features found in marquee bounds.");
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
                    console.log("[MagPI] Feature geometry updated locally:", layer.feature);
                }
            });
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
        const handleFeatureSelect = (e) => {
            if (!e.detail && activeFeatureLayer.current) {
                // If deselected, reset color
                if (activeFeatureLayer.current.layer && activeFeatureLayer.current.layer.setStyle) {
                    activeFeatureLayer.current.layer.setStyle({ 
                        color: activeFeatureLayer.current.originalColor, 
                        weight: 1.5, 
                        fillOpacity: activeFeatureLayer.current.originalOpacity 
                    });
                }
                activeFeatureLayer.current = null;
            } else if (e.detail && e.detail.isFromTable) {
                let foundLayer = null;
                highlightGroup.current.eachLayer((gjLayer) => {
                    if (gjLayer.magpi_layer_id === e.detail.nodeId && !foundLayer) {
                        gjLayer.eachLayer((featureLayer) => {
                            if (featureLayer.feature && featureLayer.feature.properties && !foundLayer) {
                                const p1 = featureLayer.feature.properties;
                                const p2 = e.detail.feature.properties;
                                
                                // 1. Try exact primary key match first
                                const idKeys = ['OBJECTID', 'FID', 'id', 'ID', 'uuid'];
                                let matchedById = false;
                                for (const key of idKeys) {
                                    if (p1[key] !== undefined && p2[key] !== undefined && String(p1[key]) === String(p2[key])) {
                                        matchedById = true;
                                        break;
                                    }
                                }
                                
                                if (matchedById) {
                                    foundLayer = featureLayer;
                                } else {
                                    // 2. Fallback to fuzzy property match (at least 3 attributes must match)
                                    let matchCount = 0;
                                    let totalKeys = 0;
                                    for (const key in p2) {
                                        if (key !== 'geometry' && p2[key] !== null) {
                                            totalKeys++;
                                            if (String(p1[key]) === String(p2[key])) matchCount++;
                                        }
                                    }
                                    if (totalKeys > 0 && matchCount >= Math.min(3, totalKeys)) {
                                        foundLayer = featureLayer;
                                    }
                                }
                            }
                        });
                    }
                });

                if (foundLayer) {
                    if (activeFeatureLayer.current && activeFeatureLayer.current.layer && activeFeatureLayer.current.layer.setStyle) {
                        activeFeatureLayer.current.layer.setStyle({ 
                            color: activeFeatureLayer.current.originalColor, 
                            weight: 1.5, 
                            fillOpacity: activeFeatureLayer.current.originalOpacity 
                        });
                    }
                    const originalColor = foundLayer.options.color || '#32d74b';
                    const originalOpacity = foundLayer.options.fillOpacity || 0.2;
                    if (foundLayer.setStyle) {
                        foundLayer.setStyle({ color: '#00ffff', weight: 4, fillOpacity: 0.5 });
                        if (foundLayer.bringToFront) foundLayer.bringToFront();
                    }
                    activeFeatureLayer.current = { layer: foundLayer, originalColor, originalOpacity, id: e.detail.nodeId };
                    
                    // Pan to it
                    if (foundLayer.getBounds && mapInstance.current) {
                        mapInstance.current.fitBounds(foundLayer.getBounds(), { maxZoom: 18, animate: true, padding: [50, 50] });
                    }
                }
            }
        };
        const handleDrawAoi = () => activateDrawTool('aoi');
        const handleDrawMarquee = () => activateDrawTool('marquee');
        const handleDrawLasso = () => activateDrawTool('lasso');

        const handleZoomLayer = (e) => {
            if (!mapInstance.current) return;
            const { layerId } = e.detail;
            
            let foundBounds = null;
            highlightGroup.current.eachLayer((layer) => {
                if (layer.magpi_layer_id === layerId && layer.getBounds) {
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
                mapInstance.current.fitBounds(foundBounds, { animate: true, padding: [50, 50] });
            }
        };

        window.addEventListener('magpi-feature-selected', handleFeatureSelect);
        window.addEventListener('magpi-draw-aoi', handleDrawAoi);
        window.addEventListener('magpi-draw-marquee', handleDrawMarquee);
        window.addEventListener('magpi-draw-lasso', handleDrawLasso);
        window.addEventListener('magpi-zoom-layer', handleZoomLayer);

        const handleRenderFishnet = (e) => {
            console.log('[MagPI] Fishnet render event received:', e.detail);
            setExplicitRender({ bbox: e.detail.bbox, sourceLayerId: e.detail.sourceLayerId || null });
        };
        window.addEventListener('magpi-render-fishnet', handleRenderFishnet);
        
        const handleClearSelection = () => {
            console.log('[MagPI] Clearing selection and render locks.');
            setExplicitRender(null);
            setIsEditingMode(false);
            window.dispatchEvent(new CustomEvent('magpi-feature-selected', { detail: null }));
        };
        window.addEventListener('magpi-clear-selection', handleClearSelection);
        
        const handleEditVector = () => {
            setIsEditingMode(true);
            console.log('[MagPI] Edit mode enabled.');
        };
        window.addEventListener('magpi-edit-vector', handleEditVector);
        
        return () => {
            window.removeEventListener('magpi-feature-selected', handleFeatureSelect);
            window.removeEventListener('magpi-draw-aoi', handleDrawAoi);
            window.removeEventListener('magpi-zoom-layer', handleZoomLayer);
            window.removeEventListener('magpi-render-fishnet', handleRenderFishnet);
            window.removeEventListener('magpi-clear-selection', handleClearSelection);
            window.removeEventListener('magpi-edit-vector', handleEditVector);
        };
    }, [loadedData]);

    // Compute extents and file paths purely for rendering
    const computedLayers = React.useMemo(() => {
        const computed = mapLayers.map(layer => {
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
                vectorColor: layer.vectorColor || '#32d74b',
                _bboxTimestamp: viewportBBoxTimestamp // Mix timestamp into dependency
            };
        });

        return computed;
    }, [mapLayers, nodes, connections, viewportBBoxTimestamp]);
    useEffect(() => {
        if (activeWorkspace === 'planar' && mapInstance.current) {
            const map = mapInstance.current;
            highlightGroup.current.clearLayers();
            
            [...computedLayers].reverse().forEach(layer => {
                if (!layer.visible) return;
                
                if (layer.isBase) {
                    if (!map.hasLayer(osmLayerRef.current)) {
                        map.addLayer(osmLayerRef.current);
                    }
                    osmLayerRef.current.setOpacity(layer.opacity / 100);                } 
                
                // Create a guaranteed Z-Index Pane for this layer based on MapLayers catalog order!
                const paneName = `magpi_pane_${layer.id}`;
                if (!map.getPane(paneName)) {
                    map.createPane(paneName);
                }
                const layerIndex = mapLayers.findIndex(l => l.id === layer.id);
                // The item at the TOP of the CatalogBrowser (index 0) gets the HIGHEST Z-index.
                map.getPane(paneName).style.zIndex = 400 + ((mapLayers.length - layerIndex) * 10);

                if (layer.extent) {
                    const { xmin, ymin, xmax, ymax } = layer.extent;
                    const y1 = parseFloat(ymin), x1 = parseFloat(xmin), y2 = parseFloat(ymax), x2 = parseFloat(xmax);
                    if (!isNaN(y1) && !isNaN(x1) && !isNaN(y2) && !isNaN(x2)) {
                        const bounds = [[y1, x1], [y2, x2]];
                        const isSelected = selectedFeatures && selectedFeatures.some(f => f?.nodeId === layer.id && f?.isFootprint);
                        const isExtent = layer.toolId === 'core_extent';
                        const isFishnet = layer.toolId === 'core_fishnet';
                        
                        // Check if this layer is rendering features. If it's NOT rendering features, it's just a standalone extent footprint.
                        const isExplicitTarget = explicitRender && explicitRender.sourceLayerId === layer.id;
                        const renderMode = isExplicitTarget ? 'full' : (layer.renderMode || 'footprint');
                        const isStandaloneFootprint = !isFishnet && renderMode !== 'full';
                        const isActiveLayer = selectedNode && selectedNode.id === layer.id;
                        
                        const rect = L.rectangle(bounds, { 
                            color: isSelected ? '#00ffff' : (isExtent ? '#00ffff' : layer.vectorColor), 
                            weight: isSelected ? 4 : 2, 
                            fillOpacity: isFishnet ? 0.0 : 0.2, 
                            dashArray: isExtent ? '4, 4' : null,
                            interactive: isActiveLayer && (isExtent || isStandaloneFootprint), // ONLY interactive if it's not rendering features, so it doesn't block cell clicks!
                            pane: paneName // Assign to guaranteed Z-index pane!
                        });
                        
                        rect.bindTooltip(layer.name, { 
                            permanent: isSelected, 
                            direction: "top", 
                            className: "bg-slate-900 text-white font-bold text-[10px] border-none shadow-lg" 
                        });
                        
                        rect.magpi_layer_id = layer.id;
                        
                        // Add click handler to the footprint rectangle so users can select the layer even when vectors aren't fully rendered
                        rect.on('click', (e) => {
                            window.dispatchEvent(new CustomEvent('magpi-feature-selected', { 
                                detail: { 
                                    layerName: layer.name || layer.id, 
                                    nodeId: layer.id,
                                    isFootprint: true,
                                    bounds: { xmin, ymin, xmax, ymax }
                                } 
                            }));
                        });
                        
                        highlightGroup.current.addLayer(rect);
                        
                        if (autoZoom && isSelected && lastZoomedNode.current !== layer.id) {
                            lastZoomedNode.current = layer.id;
                            map.fitBounds(bounds, { animate: true, padding: [100, 100] });
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
                        imgLayer.magpi_layer_id = layer.id;
                        highlightGroup.current.addLayer(imgLayer);
                        
                        if (autoZoom && selectedNode && selectedNode.id === layer.id && lastZoomedNode.current !== layer.id) {
                            lastZoomedNode.current = layer.id;
                            map.fitBounds(cached.bounds, { animate: true, padding: [100, 100] });
                        }
                    } else if (!cached || !cached.isFetching) {
                        setLoadedData(prev => ({ ...prev, [layer.id]: { isFetching: true } }));
                        fetch(`http://${window.location.hostname}:${window.MAGPI_PORT || '8282'}/api/raster?file=${encodeURIComponent(layer.filePath)}&cmap=${layer.cmap}`)
                            .then(r => r.ok ? r.json() : null)
                            .then(data => {
                                if (data && data.image) {
                                    setLoadedData(prev => ({ ...prev, [layer.id]: { type: 'raster', image: data.image, bounds: data.bounds, isFetching: false } }));
                                }
                            }).catch(() => { setLoadedData(prev => ({ ...prev, [layer.id]: { isFetching: false } })); });
                    }
                }
                // Render GeoJSON or Vector Image based on Zoom
                else if ((layer.filePath || layer.syntheticType) && !layer.id.includes('extent')) {
                    const cached = loadedData[layer.id];
                    const isFishnet = layer.toolId === 'core_fishnet';
                    
                    // Check if this layer is the explicit render target (a fishnet grid cell was clicked)
                    const isExplicitTarget = explicitRender && explicitRender.sourceLayerId === layer.id;
                    const renderMode = isExplicitTarget ? 'full' : (layer.renderMode || 'footprint');
                    
                    if (!isFishnet && renderMode !== 'full') {
                        return;
                    }

                    const fetchBbox = isExplicitTarget ? explicitRender.bbox : viewportBBox;
                    
                    // Use GeoLibre WASM for rendering local vector files over an explicit grid cell!
                    const useGeolibre = false; // Reverted to raw GeoJSON editing flow per user request
                    const expectedType = useGeolibre ? 'vector_image' : 'geojson';
                    
                    const isFullRender = isExplicitTarget && explicitRender.bbox === null;
                    const needsFetch = (fetchBbox || isFullRender) && (!cached || cached.type !== expectedType || (!cached.isFetching && (!cached.bbox || cached.bbox !== fetchBbox)));

                    if (needsFetch) {
                        setLoadedData(prev => ({ ...prev, [layer.id]: { ...(prev[layer.id] || {}), isFetching: true, bbox: fetchBbox } }));
                        const bboxParam = fetchBbox ? `&bbox=${encodeURIComponent(fetchBbox)}` : '';
                        
                        if (useGeolibre) {
                            const colorParam = `&color=${encodeURIComponent(layer.vectorColor || '#3388ff')}`;
                            fetch(`http://${window.location.hostname}:${window.MAGPI_PORT || '8282'}/api/vector_image?file=${encodeURIComponent(layer.filePath)}&layer_name=${encodeURIComponent(layer.layerName || '')}${bboxParam}${colorParam}`)
                                .then(r => r.ok ? r.blob() : null)
                                .then(blob => {
                                    if (blob) {
                                        const imageUrl = URL.createObjectURL(blob);
                                        const [w, s, e, n] = fetchBbox.split(',').map(Number);
                                        const bounds = [[s, w], [n, e]];
                                        setLoadedData(prev => ({ ...prev, [layer.id]: { type: expectedType, imageUrl, bounds, isFetching: false, bbox: fetchBbox } }));
                                    } else {
                                        setLoadedData(prev => ({ ...prev, [layer.id]: { ...(prev[layer.id] || {}), type: expectedType, isFetching: false, bbox: fetchBbox } }));
                                    }
                                }).catch(() => { setLoadedData(prev => ({ ...prev, [layer.id]: { ...(prev[layer.id] || {}), type: expectedType, isFetching: false, bbox: fetchBbox } })); });
                        } else {
                            let fetchPromise;
                            if (layer.syntheticType === 'wfs_osm_buildings') {
                                const [w, s, e, n] = fetchBbox.split(',').map(Number);
                                fetchPromise = fetch(`http://${window.location.hostname}:${window.MAGPI_PORT || '8282'}/api/stac_query`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ sensor: 'wfs_osm_buildings', bbox: [w, s, e, n] })
                                });
                            } else {
                                fetchPromise = fetch(`http://${window.location.hostname}:${window.MAGPI_PORT || '8282'}/api/geojson?file=${encodeURIComponent(layer.filePath)}&layer_name=${encodeURIComponent(layer.layerName || '')}&limit=${globalEnv.vector_draw_limit || 10000}${bboxParam}`);
                            }
                            
                            fetchPromise
                                .then(r => r.ok ? r.json() : null)
                                .then(data => {
                                    if (data) {
                                        setLoadedData(prev => {
                                            const oldData = prev[layer.id]?.data;
                                            let mergedFeatures = data.features || [];
                                            if (oldData && oldData.features) {
                                                const existingHashes = new Set(oldData.features.map(f => JSON.stringify(f.geometry?.coordinates || [])));
                                                const newUnique = mergedFeatures.filter(f => !existingHashes.has(JSON.stringify(f.geometry?.coordinates || [])));
                                                mergedFeatures = [...oldData.features, ...newUnique];
                                            }
                                            return { ...prev, [layer.id]: { type: expectedType, data: { ...data, features: mergedFeatures }, isFetching: false, bbox: fetchBbox } };
                                        });
                                    } else {
                                        setLoadedData(prev => ({ ...prev, [layer.id]: { ...(prev[layer.id] || {}), type: expectedType, isFetching: false, bbox: fetchBbox } }));
                                    }
                                }).catch(() => { setLoadedData(prev => ({ ...prev, [layer.id]: { ...(prev[layer.id] || {}), type: expectedType, isFetching: false, bbox: fetchBbox } })); });
                        }
                    }
                    
                    if (cached && (cached.imageUrl || cached.data)) {
                        if (cached.type === 'vector_image' && cached.imageUrl) {
                            const imgLayer = L.imageOverlay(cached.imageUrl, cached.bounds, {
                                opacity: layer.opacity !== undefined ? layer.opacity / 100 : 1,
                                interactive: false,
                                pane: paneName
                            });
                            highlightGroup.current.addLayer(imgLayer);
                        } else if (cached.type === 'geojson' && cached.data) {
                            const canvasRenderer = L.canvas({ padding: 0.5, pane: paneName });

                            const isActiveLayer = selectedNode && selectedNode.id === layer.id;
                            const gjLayer = L.geoJSON(cached.data, {
                                renderer: canvasRenderer,
                                interactive: isActiveLayer, // Restrict interaction to ONLY the highlighted layer in the CatalogPane
                                style: (feature) => {
                                    // Use nodeId instead of layerId because the dispatcher sets nodeId
                                    const isSelected = selectedFeatures && selectedFeatures.some(sf => sf?.nodeId === layer.id && JSON.stringify(sf?.feature?.properties) === JSON.stringify(feature.properties));
                                    if (isFishnet) {
                                        return {
                                            weight: isSelected ? 4 : 2,
                                            color: isSelected ? '#00ffff' : '#ff8c00', // Cyan when selected, Orange outline
                                            opacity: 0.8,
                                            fillColor: isSelected ? '#00ffff' : '#ff8c00',
                                            fillOpacity: isSelected ? 0.2 : 0.05 // Ensure it remains clickable via hit detection!
                                        };
                                    }
                                return {
                                    weight: 1,
                                    color: layer.vectorColor || '#3388ff',
                                    opacity: 1,
                                    fillColor: layer.vectorColor || '#3388ff',
                                    fillOpacity: 0.5
                                };
                            },
                            pointToLayer: (feature, latlng) => {
                                return L.circleMarker(latlng, {
                                    radius: 4,
                                    weight: 1,
                                    color: layer.vectorColor || '#3388ff',
                                    opacity: 1,
                                    fillColor: layer.vectorColor || '#3388ff',
                                    fillOpacity: 0.5,
                                    pane: paneName // Ensure points obey Z-Index!
                                });
                            },
                            onEachFeature: (feature, layerObj) => {
                                if (isFishnet && feature.properties?.id) {
                                    // Use a popup instead of tooltip for interaction
                                    const coords = feature.geometry?.coordinates?.[0];
                                    let bboxStr = "";
                                    if (coords) {
                                        const xs = coords.map(c => c[0]);
                                        const ys = coords.map(c => c[1]);
                                        bboxStr = `${Math.min(...xs)},${Math.min(...ys)},${Math.max(...xs)},${Math.max(...ys)}`;
                                    }
                                    
                                    // Find the parent vector node connected to this fishnet node
                                    // by traversing the connections graph
                                    const incomingConnections = connections.filter(c => c.to === layer.id);
                                    let parentVectorId = '';
                                    for (const cx of incomingConnections) {
                                        const parentNode = nodes.find(n => n.id === cx.from);
                                        if (parentNode && (parentNode.toolId.startsWith('load_') || parentNode.toolId.startsWith('wfs_') || parentNode.toolId.startsWith('core_input_'))) {
                                            parentVectorId = parentNode.id;
                                            break;
                                        }
                                    }
                                    // If no direct parent vector found, fall back to ANY parent
                                    if (!parentVectorId && incomingConnections.length > 0) {
                                        parentVectorId = incomingConnections[0].from;
                                    }
                                    
                                    const popupContent = `
                                        <div class="p-2 text-center bg-slate-800 text-white rounded">
                                            <div class="font-bold text-sm mb-2">Grid Cell: ${feature.properties.id}</div>
                                            <button 
                                                onclick="window.dispatchEvent(new CustomEvent('magpi-render-fishnet', { detail: { bbox: '${bboxStr}', sourceLayerId: '${parentVectorId}' } }))"
                                                class="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-1 px-3 rounded shadow transition-colors"
                                            >
                                                RENDER ${feature.properties.id} FEATURES
                                            </button>
                                        </div>
                                    `;
                                    
                                    layerObj.bindPopup(popupContent, {
                                        className: 'magpi-dark-popup'
                                    });
                                }
                                
                                if (layer.showLabels && feature.properties) {
                                    const props = feature.properties;
                                    let labelText = '';
                                    if (layer.labelField && props[layer.labelField] !== undefined) {
                                        labelText = String(props[layer.labelField]);
                                    } else {
                                        labelText = props.name || props.NAME || props.Name || props.id || props.ID || props.uuid || props.OBJECTID || props.FID;
                                        if (!labelText) {
                                            const keys = Object.keys(props);
                                            if (keys.length > 0 && keys[0] !== 'geometry') labelText = String(props[keys[0]]);
                                        }
                                    }
                                    if (labelText) {
                                        layerObj.bindTooltip(String(labelText), {
                                            permanent: true,
                                            direction: 'center',
                                            className: 'bg-slate-900/80 text-white font-bold text-[9px] border border-slate-700 shadow-md rounded px-1 py-0.5 whitespace-nowrap bg-transparent shadow-none',
                                            opacity: 0.9
                                        });
                                    }
                                }
                            }
                        });

                        gjLayer.on('click', (e) => {
                            if (!e.layer || !e.layer.feature) return;
                            
                            if (e.originalEvent) e.originalEvent._magpiFeatureClicked = true;

                            const feature = e.layer.feature;
                            window.dispatchEvent(new CustomEvent('magpi-feature-selected', { detail: { feature: feature, layerName: layer.name || layer.id, nodeId: layer.id, shiftKey: e.originalEvent?.shiftKey } }));
                        });

                        gjLayer.magpi_layer_id = layer.id;
                        highlightGroup.current.addLayer(gjLayer);
                        
                        if (autoZoom && selectedNode && selectedNode.id === layer.id && lastZoomedNode.current !== layer.id) {
                            lastZoomedNode.current = layer.id;
                            try {
                                map.fitBounds(gjLayer.getBounds(), { animate: true, padding: [100, 100], maxZoom: 18 });
                            } catch (err) {
                                console.warn("Could not fit bounds to geojson layer", err);
                            }
                        }
                        } // END geojson block
                    }
                }
            });
            
        if (!computedLayers.find(l => l.isBase)?.visible && map.hasLayer(osmLayerRef.current)) {
            map.removeLayer(osmLayerRef.current);
        }
    }
}, [computedLayers, activeWorkspace, loadedData, selectedNode]);

    // Lightweight effect for styling selection changes WITHOUT rebuilding the DOM
    useEffect(() => {
        if (!highlightGroup.current || !mapInstance.current || activeWorkspace !== 'planar') return;
        
        highlightGroup.current.eachLayer(layerObj => {
            const layerId = layerObj.magpi_layer_id;
            if (!layerId) return;
            
            const cLayer = computedLayers.find(l => l.id === layerId);
            if (!cLayer) return;
            
            const isExtent = cLayer.toolId === 'core_extent';
            const isFishnet = cLayer.toolId === 'core_fishnet';
            
            if (layerObj instanceof L.Rectangle && !layerObj.feature) {
                // It's the bounding box rectangle
                const isSelected = selectedFeatures && selectedFeatures.some(f => f?.nodeId === layerId && f?.isFootprint);
                layerObj.setStyle({
                    color: isSelected ? '#00ffff' : (isExtent ? '#00ffff' : cLayer.vectorColor),
                    weight: isSelected ? 4 : 2,
                    fillColor: isSelected ? '#00ffff' : cLayer.vectorColor,
                    fillOpacity: isSelected ? 0.3 : (isFishnet ? 0.0 : 0.2)
                });
            } else if (layerObj instanceof L.GeoJSON) {
                // It's the vector features
                layerObj.eachLayer(childLayer => {
                    if (!childLayer.feature) return;
                    const feature = childLayer.feature;
                    const isSelected = selectedFeatures && selectedFeatures.some(sf => sf?.nodeId === layerId && JSON.stringify(sf?.feature?.properties) === JSON.stringify(feature.properties));
                    if (isFishnet) {
                        childLayer.setStyle({
                            weight: isSelected ? 4 : 2,
                            color: isSelected ? '#00ffff' : '#ff8c00',
                            opacity: 0.8,
                            fillColor: isSelected ? '#00ffff' : '#ff8c00',
                            fillOpacity: isSelected ? 0.2 : 0.05
                        });
                    } else {
                        childLayer.setStyle({
                            color: isSelected ? (isEditingMode ? '#f59e0b' : '#00ffff') : cLayer.vectorColor,
                            weight: isSelected ? (isEditingMode ? 4 : 3) : 1.5,
                            fillOpacity: isSelected ? 0.6 : 0.2
                        });
                    }
                    
                    // Handle Leaflet-Draw Editing State
                    if (isSelected && isEditingMode) {
                        if (childLayer.editing && typeof childLayer.editing.enable === 'function' && !childLayer.editing.enabled()) {
                            childLayer.editing.enable();
                        }
                    } else {
                        if (childLayer.editing && typeof childLayer.editing.disable === 'function' && childLayer.editing.enabled()) {
                            childLayer.editing.disable();
                        }
                    }
                });
            }
        });
    }, [selectedFeatures, computedLayers, activeWorkspace, isEditingMode]);

    const activateDrawTool = (mode = 'aoi') => {
        if (mapInstance.current) {
            drawMode.current = mode;
            if (mode === 'lasso') {
                new L.Draw.Polygon(mapInstance.current, { 
                    shapeOptions: { color: '#ec4899', weight: 2, fillOpacity: 0.1, dashArray: '5, 5' }
                }).enable();
            } else if (mode === 'marquee') {
                new L.Draw.Rectangle(mapInstance.current, { 
                    shapeOptions: { color: '#a855f7', weight: 2, fillOpacity: 0.1, dashArray: '5, 5' }
                }).enable();
            } else {
                new L.Draw.Rectangle(mapInstance.current, { 
                    shapeOptions: { color: '#eab308', weight: 2, fillOpacity: 0.15 } 
                }).enable();
            }
        }
    };

    useEffect(() => {
        // Handle resizing when activeWorkspace changes
        if (activeWorkspace === 'globe' && cesiumRef.current && cesiumRef.current.cesiumElement) {
            setTimeout(() => {
                cesiumRef.current.cesiumElement.resize();
            }, 100);
        } else if (activeWorkspace !== 'globe' && mapInstance.current) {
            setTimeout(() => {
                mapInstance.current.invalidateSize(true);
            }, 100);
        }

        const handleDragEnter = (e) => {
            if (activeWorkspace === 'planar') {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
            }
        };

        const handleDragOver = (e) => {
            if (activeWorkspace === 'planar') {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                e.dataTransfer.dropEffect = 'move';
            }
        };

        const handleDrop = (e) => {
            if (activeWorkspace === 'planar') {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                let data = null;
                if (window.__draggedMagPITool) {
                    data = window.__draggedMagPITool;
                    window.__draggedMagPITool = null;
                } else {
                    const dataStr = e.dataTransfer.getData('application/reactflow');
                    if (dataStr) {
                        try { data = JSON.parse(dataStr); } catch (err) {}
                    }
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
                                    markerSymbol={""}
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

            {/* Attribute Table Panel */}

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