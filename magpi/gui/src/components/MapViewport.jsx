import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import 'leaflet-draw';
import { featuresMatch } from '../utils/featureMatch';
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

const MapViewport = React.memo(({ onAoiDrawn, onAoiImported, selectedNode, activeWorkspace, nodes = [], nodeStatuses = {}, connections = [], globalEnv, mapLayers = [], autoZoom, selectedFeatures, setSelectedFeatures, interactionMode = 'nav' }) => {
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
    const nodesRef = useRef(nodes);
    const loadedDataRef = useRef(loadedData);
    const selectedNodeRef = useRef(selectedNode);
    const selectedFeaturesRef = useRef(selectedFeatures);
    
    useEffect(() => {
        nodesRef.current = nodes;
    }, [nodes]);
    
    useEffect(() => {
        loadedDataRef.current = loadedData;
    }, [loadedData]);
    
    useEffect(() => {
        selectedNodeRef.current = selectedNode;
    }, [selectedNode]);
    
    useEffect(() => {
        selectedFeaturesRef.current = selectedFeatures;
    }, [selectedFeatures]);
    
    // Explicit render state to lock a fishnet cell override
    const [explicitRender, setExplicitRender] = React.useState(null); // { bbox, sourceLayerId }
    const [renderedCells, setRenderedCells] = React.useState(new Set()); // Set of bbox strings
    const drawMode = useRef(null);
    const interactionModeRef = useRef(interactionMode);
    
    useEffect(() => {
        interactionModeRef.current = interactionMode;
        // Safety: re-add basemap if it vanished during mode toggle
        if (mapInstance.current && osmLayerRef.current && !mapInstance.current.hasLayer(osmLayerRef.current)) {
            mapInstance.current.addLayer(osmLayerRef.current);
        }
        // Toggle cursor CSS class on map container
        if (mapInstance.current) {
            const container = mapInstance.current.getContainer();
            container.classList.remove('magpi-nav-mode', 'magpi-select-mode');
            container.classList.add(interactionMode === 'select' ? 'magpi-select-mode' : 'magpi-nav-mode');
        }
    }, [interactionMode]);

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

        // Override Leaflet's default boxZoom to use for Marquee selection instead
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
            // Find all loaded vectors and check intersection with the shift-drag box
            const selectedFeaturesArr = [];
            if (highlightGroup.current) {
                highlightGroup.current.eachLayer(layerObj => {
                    const layerId = layerObj.magpi_layer_id;
                    if (!layerId) return;
                    if (layerObj instanceof L.GeoJSON) {
                        layerObj.eachLayer(childLayer => {
                            if (childLayer.feature && childLayer.getBounds) {
                                if (e.boxZoomBounds.intersects(childLayer.getBounds())) {
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
                selectedFeaturesArr.forEach((sf, idx) => {
                    window.dispatchEvent(new CustomEvent('magpi-feature-selected', { detail: { ...sf, isBulk: idx > 0 } }));
                });
            } else {
                console.log("[MagPI] No features found in shift-drag bounds.");
            }
        });


        // Global map click to deselect features
        map.on('click', (e) => {
            if (!e.originalEvent || !e.originalEvent._magpiFeatureClicked) {
                // Only dispatch deselection if there are actually features selected (prevents empty [] → [] cascades)
                if (selectedFeaturesRef.current && selectedFeaturesRef.current.length > 0) {
                    window.dispatchEvent(new CustomEvent('magpi-feature-selected', { detail: null }));
                }
            }
        });
        
        // Custom CSS for Powerpoint-like cursor: arrow for selection, grab for pan
        const cursorStyle = document.createElement('style');
        cursorStyle.innerHTML = `
            /* Navigation Mode (Default) - Grab/Grabbing */
            .leaflet-container { cursor: grab !important; }
            .leaflet-grab { cursor: grab !important; }
            .leaflet-dragging .leaflet-grab { cursor: grabbing !important; }
            .leaflet-interactive { cursor: pointer !important; }
            
            /* Editing Mode - Arrow */
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
                                            shiftKey: true, // Act as multi-select
                                            isMarquee: true // Make it purely additive in App.js
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
            if (e.detail.bbox) {
                setRenderedCells(prev => {
                    const newSet = new Set(prev);
                    newSet.add(e.detail.bbox);
                    return newSet;
                });
            }
            setExplicitRender({ bbox: e.detail.bbox, sourceLayerId: e.detail.sourceLayerId || null });
        };
        window.addEventListener('magpi-render-fishnet', handleRenderFishnet);
        
        const handleClearSelection = () => {
            console.log('[MagPI] Clearing selection and render locks.');
            setExplicitRender(null);
            setIsEditingMode(false);
            if (mapInstance.current) L.DomUtil.removeClass(mapInstance.current.getContainer(), 'magpi-edit-mode');
            window.dispatchEvent(new CustomEvent('magpi-feature-selected', { detail: null }));
        };
        window.addEventListener('magpi-clear-selection', handleClearSelection);
        
        const handleEditVector = () => {
            setIsEditingMode(true);
            if (mapInstance.current) {
                L.DomUtil.addClass(mapInstance.current.getContainer(), 'magpi-edit-mode');
                // Enable Leaflet.Draw editing on the selected feature
                if (activeFeatureLayer.current && activeFeatureLayer.current.layer && activeFeatureLayer.current.layer.editing) {
                    activeFeatureLayer.current.layer.editing.enable();
                }
            }
            console.log('[MagPI] Edit mode enabled.');
        };
        window.addEventListener('magpi-edit-vector', handleEditVector);
        
        const handleSaveEdits = (e) => {
            const { nodeId } = e.detail;
            if (!nodeId) return;
            const cached = loadedDataRef.current[nodeId];
            if (cached && cached.data && cached.data.features) {
                
                // Commit edits from the map layer to the cached GeoJSON
                if (activeFeatureLayer.current && activeFeatureLayer.current.layer) {
                    const editedGeoJSON = activeFeatureLayer.current.layer.toGeoJSON();
                    const f = cached.data.features.find(feat => 
                        JSON.stringify(feat.properties) === JSON.stringify(editedGeoJSON.properties)
                    );
                    if (f) {
                        f.geometry = editedGeoJSON.geometry;
                    }
                    if (activeFeatureLayer.current.layer.editing) {
                        activeFeatureLayer.current.layer.editing.disable();
                    }
                }

                const node = nodesRef.current.find(n => n.id === nodeId);
                if (node && node.params && node.params.file_path) {
                    let filePath = node.params.file_path;
                    if (!filePath.startsWith('/') && !filePath.startsWith('./')) {
                        filePath = `./magpi_output/${filePath}`;
                    }
                    console.log('[MagPI] Saving edits for', filePath);
                    fetch(`http://${window.location.hostname}:${window.MAGPI_PORT || '8282'}/api/save_geojson`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ file_path: filePath, features: cached.data.features })
                    })
                    .then(res => res.json())
                    .then(data => {
                        if (data.status === 'success') {
                            console.log('[MagPI] Edits saved successfully.');
                            setIsEditingMode(false);
                            if (mapInstance.current) L.DomUtil.removeClass(mapInstance.current.getContainer(), 'magpi-edit-mode');
                        } else {
                            console.error('[MagPI] Error saving edits:', data.error);
                        }
                    })
                    .catch(err => console.error('[MagPI] Save fetch error:', err));
                }
            }
        };
        window.addEventListener('magpi-save-edits', handleSaveEdits);
        
        const handleZoomFeature = (e) => {
            if (!mapInstance.current) return;
            const features = e.detail.features;
            if (!features || features.length === 0) return;
            
            const group = new L.FeatureGroup();
            features.forEach(sf => {
                if (sf.feature && sf.feature.geometry) {
                    group.addLayer(L.geoJSON(sf.feature));
                } else if (sf.bounds) {
                    const { xmin, ymin, xmax, ymax } = sf.bounds;
                    group.addLayer(L.rectangle([[ymin, xmin], [ymax, xmax]]));
                }
            });
            
            if (group.getLayers().length > 0) {
                mapInstance.current.fitBounds(group.getBounds(), { animate: true, padding: [50, 50], maxZoom: 18 });
            }
        };
        window.addEventListener('magpi-zoom-feature', handleZoomFeature);

        const handleResetEdits = (e) => {
            const { nodeId } = e.detail;
            if (!nodeId) return;
            console.log('[MagPI] Resetting edits for', nodeId);
            setLoadedData(prev => {
                const newData = { ...prev };
                delete newData[nodeId]; // Force re-fetch
                return newData;
            });
            setIsEditingMode(false);
            if (mapInstance.current) L.DomUtil.removeClass(mapInstance.current.getContainer(), 'magpi-edit-mode');
            window.dispatchEvent(new CustomEvent('magpi-clear-selection'));
        };
        window.addEventListener('magpi-reset-edits', handleResetEdits);

        const handleDeleteSelected = (e) => {
            const { features } = e.detail;
            if (!features || features.length === 0) return;
            
            const byNodeId = {};
            features.forEach(f => {
                if (!byNodeId[f.nodeId]) byNodeId[f.nodeId] = [];
                byNodeId[f.nodeId].push(f.feature);
            });
            
            setLoadedData(prev => {
                const newData = { ...prev };
                for (const nodeId in byNodeId) {
                    if (newData[nodeId] && newData[nodeId].data && newData[nodeId].data.features) {
                        const toDeleteStrs = new Set(byNodeId[nodeId].map(f => JSON.stringify(f)));
                        const remaining = newData[nodeId].data.features.filter(f => !toDeleteStrs.has(JSON.stringify(f)));
                        newData[nodeId] = { ...newData[nodeId], data: { ...newData[nodeId].data, features: remaining } };
                    }
                }
                return newData;
            });
            console.log('[MagPI] Deleted selected features.');
        };
        window.addEventListener('magpi-delete-selected', handleDeleteSelected);
        
        const handleDuplicateSelected = (e) => {
            const { features } = e.detail;
            if (!features || features.length === 0) return;
            
            const byNodeId = {};
            features.forEach(f => {
                if (!byNodeId[f.nodeId]) byNodeId[f.nodeId] = [];
                const newFeature = JSON.parse(JSON.stringify(f.feature));
                if (newFeature.properties) {
                    if (newFeature.properties.id) newFeature.properties.id = newFeature.properties.id + '_copy';
                    if (newFeature.properties.ID) newFeature.properties.ID = newFeature.properties.ID + '_copy';
                    if (newFeature.properties.FID) newFeature.properties.FID = newFeature.properties.FID + '_copy';
                }
                byNodeId[f.nodeId].push(newFeature);
            });
            
            setLoadedData(prev => {
                const newData = { ...prev };
                for (const nodeId in byNodeId) {
                    if (newData[nodeId] && newData[nodeId].data && newData[nodeId].data.features) {
                        const newFeatures = [...newData[nodeId].data.features, ...byNodeId[nodeId]];
                        newData[nodeId] = { ...newData[nodeId], data: { ...newData[nodeId].data, features: newFeatures } };
                    }
                }
                return newData;
            });
            console.log('[MagPI] Duplicated selected features.');
        };
        window.addEventListener('magpi-duplicate-selected', handleDuplicateSelected);
        
        const handleSpatialModify = (e) => {
            const { features, action } = e.detail;
            if (!features || features.length === 0) return;
            
            const byNodeId = {};
            features.forEach(f => {
                if (!byNodeId[f.nodeId]) byNodeId[f.nodeId] = [];
                byNodeId[f.nodeId].push(f.feature);
            });
            
            for (const nodeId in byNodeId) {
                const nodeFeatures = byNodeId[nodeId];
                if (action === 'merge' && nodeFeatures.length < 2) {
                    console.warn('[MagPI] Merge requires at least 2 features.');
                    continue;
                }
                
                let requestBody = { action: action, features: nodeFeatures };
                
                if (action === 'snap') {
                    const cached = loadedDataRef.current[nodeId];
                    if (!cached || !cached.data || !cached.data.features) {
                        console.warn('[MagPI] Snap requires cached reference features in the layer.');
                        continue;
                    }
                    const selectedStrs = new Set(nodeFeatures.map(f => JSON.stringify(f)));
                    const referenceFeatures = cached.data.features.filter(f => !selectedStrs.has(JSON.stringify(f)));
                    
                    if (referenceFeatures.length === 0) {
                        console.warn('[MagPI] Snap requires other features in the layer to snap to.');
                        continue;
                    }
                    requestBody.reference_features = referenceFeatures;
                    requestBody.tolerance = (action === 'snap' && typeof e.detail.tolerance === 'number') ? e.detail.tolerance : 0.005; // Default ~500m at equator
                }

                
                fetch(`http://${window.location.hostname}:${window.MAGPI_PORT || '8282'}/api/spatial_modify`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody)
                })
                .then(res => res.json())
                .then(data => {
                    if (data.status === 'success') {
                        let resultFeatures = data.result.features || [data.result];
                        if (data.result.type === 'FeatureCollection') {
                             resultFeatures = data.result.features;
                        } else if (data.result.type === 'Feature') {
                             resultFeatures = [data.result];
                        }
                        
                        setLoadedData(prev => {
                            const newData = { ...prev };
                            if (newData[nodeId] && newData[nodeId].data && newData[nodeId].data.features) {
                                const toDeleteStrs = new Set(nodeFeatures.map(f => JSON.stringify(f)));
                                const remaining = newData[nodeId].data.features.filter(f => !toDeleteStrs.has(JSON.stringify(f)));
                                newData[nodeId] = { ...newData[nodeId], data: { ...newData[nodeId].data, features: [...remaining, ...resultFeatures] } };
                            }
                            return newData;
                        });
                        
                        window.dispatchEvent(new CustomEvent('magpi-clear-selection'));
                        console.log(`[MagPI] ${action} successful.`);
                    } else {
                        console.error(`[MagPI] Error in ${action}:`, data.error);
                    }
                })
                .catch(err => console.error(`[MagPI] ${action} fetch error:`, err));
            }
        };
        
        const handleMerge = (e) => handleSpatialModify({ detail: { ...e.detail, action: 'merge' } });
        const handleSplit = (e) => handleSpatialModify({ detail: { ...e.detail, action: 'split' } });
        const handleSnap = (e) => handleSpatialModify({ detail: { ...e.detail, action: 'snap' } });
        window.addEventListener('magpi-merge-selected', handleMerge);
        window.addEventListener('magpi-split-polygon', handleSplit);
        window.addEventListener('magpi-snap-vertices', handleSnap);
        
        return () => {
            window.removeEventListener('magpi-feature-selected', handleFeatureSelect);
            window.removeEventListener('magpi-draw-aoi', handleDrawAoi);
            window.removeEventListener('magpi-draw-marquee', handleDrawMarquee);
            window.removeEventListener('magpi-draw-lasso', handleDrawLasso);
            window.removeEventListener('magpi-zoom-layer', handleZoomLayer);
            window.removeEventListener('magpi-render-fishnet', handleRenderFishnet);
            window.removeEventListener('magpi-clear-selection', handleClearSelection);
            window.removeEventListener('magpi-edit-vector', handleEditVector);
            window.removeEventListener('magpi-save-edits', handleSaveEdits);
            window.removeEventListener('magpi-zoom-feature', handleZoomFeature);
            window.removeEventListener('magpi-reset-edits', handleResetEdits);
            window.removeEventListener('magpi-delete-selected', handleDeleteSelected);
            window.removeEventListener('magpi-duplicate-selected', handleDuplicateSelected);
            window.removeEventListener('magpi-merge-selected', handleMerge);
            window.removeEventListener('magpi-split-polygon', handleSplit);
            window.removeEventListener('magpi-snap-vertices', handleSnap);
        };
    }, []); // Mount-only: callbacks use refs for current data

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
                vectorColor: layer.vectorColor || '#32d74b'
            };
        });

        return computed;
    }, [mapLayers, nodes, connections]);
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
                let calculatedIndex = layerIndex;
                
                // If it's a child tool vector (like a fishnet), it should draw ON TOP of its parent
                const isChild = connections.some(c => c.to === layer.id);
                if (isChild) {
                    const parentConnection = connections.find(c => c.to === layer.id);
                    const parentIndex = mapLayers.findIndex(l => l.id === parentConnection.from);
                    if (parentIndex !== -1) {
                        calculatedIndex = parentIndex - 0.5; // Lower numerical index = higher Z-Index
                    }
                }
                
                // The item at the TOP of the CatalogBrowser (index 0) gets the HIGHEST Z-index.
                const baseZIndex = 400 + ((mapLayers.length - calculatedIndex) * 10);
                
                // Boost z-index for explicitly rendered parent vectors so they draw ABOVE the fishnet grid
                const isLayerExplicitTarget = explicitRender && explicitRender.sourceLayerId === layer.id;
                map.getPane(paneName).style.zIndex = isLayerExplicitTarget ? 800 : baseZIndex;

                if (layer.extent) {
                    const { xmin, ymin, xmax, ymax } = layer.extent;
                    const y1 = parseFloat(ymin), x1 = parseFloat(xmin), y2 = parseFloat(ymax), x2 = parseFloat(xmax);
                    
                    // Prevent Leaflet projection crash by verifying coordinates are not Float MAX (e.g. from an invalid shapefile extent)
                    const isSaneBounds = Math.abs(y1) < 1e10 && Math.abs(x1) < 1e10 && Math.abs(y2) < 1e10 && Math.abs(x2) < 1e10;
                    
                    if (!isNaN(y1) && !isNaN(x1) && !isNaN(y2) && !isNaN(x2) && isSaneBounds) {
                        const bounds = [[y1, x1], [y2, x2]];
                        const isSelected = selectedFeatures && selectedFeatures.some(f => f?.nodeId === layer.id && f?.isFootprint);
                        const isExtent = layer.toolId === 'core_extent';
                        const isFishnet = layer.toolId === 'core_fishnet';
                        
                        // Check if this layer is rendering features. If it's NOT rendering features, it's just a standalone extent footprint.
                        const isExplicitTarget = explicitRender && explicitRender.sourceLayerId === layer.id;
                        const renderMode = isExplicitTarget ? 'full' : (layer.renderMode || 'footprint');
                        const isStandaloneFootprint = !isFishnet && renderMode !== 'full';
                        const isActiveLayer = selectedNodeRef.current && selectedNodeRef.current.id === layer.id;
                        const baseOpacity = layer.opacity !== undefined ? layer.opacity / 100 : 1;
                        
                        const rect = L.rectangle(bounds, { 
                            color: isActiveLayer ? '#00ffff' : (layer.vectorColor || '#32d74b'),
                            weight: isActiveLayer ? 2 : 1,
                            opacity: baseOpacity,
                            fillColor: isActiveLayer ? '#00ffff' : (layer.vectorColor || '#32d74b'),
                            fillOpacity: isStandaloneFootprint ? ((isActiveLayer ? 0.2 : 0.1) * baseOpacity) : 0, 
                            interactive: isStandaloneFootprint,
                            dashArray: isStandaloneFootprint ? null : '4,4',
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
                            // In NAV mode, only the active (highlighted) layer is clickable for identification
                            if (interactionModeRef.current === 'nav') {
                                if (!selectedNodeRef.current || selectedNodeRef.current.id !== layer.id) return;
                            }
                            if (e.originalEvent?._magpiFeatureClicked) return;
                            if (e.originalEvent) e.originalEvent._magpiFeatureClicked = true;
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
                        
                        if (autoZoom && selectedNodeRef.current && selectedNodeRef.current.id === layer.id && lastZoomedNode.current !== layer.id) {
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

                    const fetchBbox = isExplicitTarget ? explicitRender.bbox : (isFishnet ? null : viewportBBox);
                    
                    // Use GeoLibre WASM for rendering local vector files over an explicit grid cell!
                    const useGeolibre = false; // Reverted to raw GeoJSON editing flow per user request
                    const expectedType = useGeolibre ? 'vector_image' : 'geojson';
                    
                    const isFullRender = (isExplicitTarget && explicitRender.bbox === null) || isFishnet;
                    const needsFetch = (fetchBbox || isFullRender) && (!cached || cached.type !== expectedType || (!cached.isFetching && (cached.bbox !== fetchBbox)));

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
                                            // When rendering a fishnet cell (explicit target), REPLACE data — don't merge with old extent
                                            if (!isExplicitTarget && oldData && oldData.features && fetchBbox !== null) {
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

                            const isActiveLayer = selectedNodeRef.current && selectedNodeRef.current.id === layer.id;
                            const gjLayer = L.geoJSON(cached.data, {
                                renderer: canvasRenderer,
                                interactive: true, // Allow clicking any feature to select its layer
                                style: (feature) => {
                                    // Use nodeId instead of layerId because the dispatcher sets nodeId
                                    const isSelected = selectedFeatures && selectedFeatures.some(sf => sf?.nodeId === layer.id && featuresMatch(sf?.feature?.properties, feature.properties));
                                    if (isFishnet) {
                                        const coords = feature.geometry?.coordinates;
                                        let bboxStr = null;
                                        if (coords) {
                                            let xmin = 180, ymin = 90, xmax = -180, ymax = -90;
                                            const getBounds = (arr) => {
                                                if (typeof arr[0] === 'number') {
                                                    xmin = Math.min(xmin, arr[0]); ymin = Math.min(ymin, arr[1]);
                                                    xmax = Math.max(xmax, arr[0]); ymax = Math.max(ymax, arr[1]);
                                                } else { arr.forEach(getBounds); }
                                            };
                                            getBounds(coords);
                                            if (xmin === xmax) { xmin -= 0.0001; xmax += 0.0001; }
                                            if (ymin === ymax) { ymin -= 0.0001; ymax += 0.0001; }
                                            if (xmin < 180) bboxStr = `${xmin},${ymin},${xmax},${ymax}`;
                                        }
                                        const isRenderedCell = renderedCells.has(bboxStr);
                                        const baseOpacity = layer.opacity !== undefined ? layer.opacity / 100 : 0.8;
                                        return {
                                            weight: isRenderedCell ? 2 : (isSelected ? 4 : 2),
                                            color: isRenderedCell ? '#f59e0b' : (isSelected ? '#00ffff' : (layer.vectorColor || '#ff8c00')),
                                            opacity: isRenderedCell ? 0.3 : baseOpacity,
                                            fillColor: isRenderedCell ? 'transparent' : (isSelected ? '#00ffff' : (layer.vectorColor || '#ff8c00')),
                                            fillOpacity: isRenderedCell ? 0.0 : (isSelected ? 0.3 * baseOpacity : 0.0),
                                            dashArray: isRenderedCell ? '4,4' : null,
                                            interactive: !isRenderedCell
                                        };
                                    }
                                const baseOpacity = layer.opacity !== undefined ? layer.opacity / 100 : 1;
                                return {
                                    weight: isSelected ? 3 : 1,
                                    color: isSelected ? '#00ffff' : (layer.vectorColor || '#3388ff'),
                                    opacity: baseOpacity,
                                    fillColor: isSelected ? '#00ffff' : (layer.vectorColor || '#3388ff'),
                                    fillOpacity: isSelected ? 0.8 * baseOpacity : 0.5 * baseOpacity
                                };
                            },
                            pointToLayer: (feature, latlng) => {
                                const baseOpacity = layer.opacity !== undefined ? layer.opacity / 100 : 1;
                                const isSelected = selectedFeatures && selectedFeatures.some(sf => sf?.nodeId === layer.id && featuresMatch(sf?.feature?.properties, feature.properties));
                                return L.circleMarker(latlng, {
                                    radius: isSelected ? 6 : 4,
                                    weight: isSelected ? 2 : 1,
                                    color: isSelected ? '#00ffff' : (layer.vectorColor || '#3388ff'),
                                    opacity: baseOpacity,
                                    fillColor: isSelected ? '#00ffff' : (layer.vectorColor || '#3388ff'),
                                    fillOpacity: isSelected ? 0.8 * baseOpacity : 0.5 * baseOpacity,
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
                            if (interactionModeRef.current === 'nav') {
                                // Default interaction mode is nav, which is now allowed to act as an identify mode 
                                // to make the user flow more intuitive. We just don't do marquee selection.
                                // We don't restrict clicks to active nodes anymore to allow fluid data exploration.
                            }
                            if (e.originalEvent?._magpiFeatureClicked) return; // Prevent overlapping layers from all firing
                            if (!e.layer || !e.layer.feature) return;
                            
                            if (e.originalEvent) e.originalEvent._magpiFeatureClicked = true;

                            const feature = e.layer.feature;
                            window.dispatchEvent(new CustomEvent('magpi-feature-selected', { detail: { feature: feature, layerName: layer.name || layer.id, nodeId: layer.id, shiftKey: e.originalEvent?.shiftKey, ctrlKey: e.originalEvent?.ctrlKey || e.originalEvent?.metaKey } }));
                        });

                        gjLayer.magpi_layer_id = layer.id;
                        highlightGroup.current.addLayer(gjLayer);
                        
                        if (autoZoom && selectedNodeRef.current && selectedNodeRef.current.id === layer.id && lastZoomedNode.current !== layer.id) {
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
            
        // Basemap guard: only remove OSM if user explicitly toggled the base layer off
        const baseLayerConfig = computedLayers.find(l => l.isBase);
        if (baseLayerConfig && !baseLayerConfig.visible && map.hasLayer(osmLayerRef.current)) {
            map.removeLayer(osmLayerRef.current);
        } else if (baseLayerConfig && baseLayerConfig.visible && !map.hasLayer(osmLayerRef.current)) {
            map.addLayer(osmLayerRef.current);
        }
        
        }
    }, [computedLayers, activeWorkspace, loadedData, explicitRender, renderedCells]); // selectedNode removed — use ref to prevent full rebuild on selection changes

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
                    const isSelected = selectedFeatures && selectedFeatures.some(sf => sf?.nodeId === layerId && featuresMatch(sf?.feature?.properties, feature.properties));
                    if (isFishnet) {
                        const coords = feature.geometry?.coordinates;
                        let bboxStr = null;
                        if (coords) {
                            let xmin = 180, ymin = 90, xmax = -180, ymax = -90;
                            const getBounds = (arr) => {
                                if (typeof arr[0] === 'number') {
                                    xmin = Math.min(xmin, arr[0]); ymin = Math.min(ymin, arr[1]);
                                    xmax = Math.max(xmax, arr[0]); ymax = Math.max(ymax, arr[1]);
                                } else { arr.forEach(getBounds); }
                            };
                            getBounds(coords);
                            if (xmin === xmax) { xmin -= 0.0001; xmax += 0.0001; }
                            if (ymin === ymax) { ymin -= 0.0001; ymax += 0.0001; }
                            if (xmin < 180) bboxStr = `${xmin},${ymin},${xmax},${ymax}`;
                        }
                        const isRenderedCell = renderedCells.has(bboxStr);
                        childLayer.setStyle({
                            weight: isRenderedCell ? 2 : (isSelected ? 4 : 2),
                            color: isRenderedCell ? '#f59e0b' : (isSelected ? '#00ffff' : '#ff8c00'),
                            opacity: isRenderedCell ? 0.3 : 0.8,
                            fillColor: isRenderedCell ? 'transparent' : (isSelected ? '#00ffff' : '#ff8c00'),
                            fillOpacity: isRenderedCell ? 0.0 : (isSelected ? 0.2 : 0.05),
                            dashArray: isRenderedCell ? '4,4' : null,
                            interactive: !isRenderedCell
                        });
                        // update DOM for interactivity
                        if (childLayer._path) {
                            if (isRenderedCell) {
                                childLayer._path.classList.add('magpi-non-interactive');
                                childLayer._path.style.pointerEvents = 'none';
                            } else {
                                childLayer._path.classList.remove('magpi-non-interactive');
                                childLayer._path.style.pointerEvents = 'auto';
                            }
                        }
                    } else {
                        const baseOpacity = cLayer.opacity !== undefined ? cLayer.opacity / 100 : 1;
                        childLayer.setStyle({
                            color: isSelected ? (isEditingMode ? '#f59e0b' : '#00ffff') : cLayer.vectorColor,
                            weight: isSelected ? (isEditingMode ? 4 : 3) : 1.5,
                            fillOpacity: (isSelected ? 0.6 : 0.2) * baseOpacity,
                            opacity: baseOpacity
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
    }, [selectedFeatures, computedLayers, activeWorkspace, isEditingMode, renderedCells]);

    // Visual feedback for Vertex Snapping
    useEffect(() => {
        if (!mapInstance.current || !isEditingMode) return;
        const map = mapInstance.current;
        
        const snapLine = L.polyline([], {
            color: '#f0f',
            dashArray: '5, 5',
            weight: 3,
            interactive: false,
            pane: 'popupPane' // Draw on top
        }).addTo(map);

        let vertexDragActive = false;

        const extractVertices = (geometry) => {
            let coords = [];
            const processArray = (arr) => {
                if (arr.length >= 2 && typeof arr[0] === 'number') coords.push(arr);
                else arr.forEach(processArray);
            };
            if (geometry && geometry.coordinates) processArray(geometry.coordinates);
            return coords;
        };

        const handleMouseDown = (e) => {
            if (e.target && e.target.classList && e.target.classList.contains('leaflet-marker-icon')) {
                vertexDragActive = true;
            }
        };

        const handleMouseUp = () => {
            vertexDragActive = false;
            snapLine.setLatLngs([]);
        };

        const handleMouseMove = (e) => {
            if (!vertexDragActive || e.buttons !== 1) {
                snapLine.setLatLngs([]);
                return;
            }

            const latlng = map.mouseEventToLatLng(e);
            let closestLatLng = null;
            let minDist = Infinity;
            const thresholdPx = 30; // 30 pixels snapping threshold for preview

            if (highlightGroup.current) {
                highlightGroup.current.eachLayer((layer) => {
                    if (layer instanceof L.GeoJSON) {
                        layer.eachLayer((childLayer) => {
                            if (childLayer.editing && childLayer.editing.enabled()) return;
                            if (childLayer.feature && childLayer.feature.geometry) {
                                const coords = extractVertices(childLayer.feature.geometry);
                                coords.forEach(coord => {
                                    const pLatLng = L.latLng(coord[1], coord[0]);
                                    const p1 = map.latLngToLayerPoint(latlng);
                                    const p2 = map.latLngToLayerPoint(pLatLng);
                                    const dist = p1.distanceTo(p2);
                                    if (dist < minDist && dist < thresholdPx) {
                                        minDist = dist;
                                        closestLatLng = pLatLng;
                                    }
                                });
                            }
                        });
                    }
                });
            }

            if (closestLatLng) {
                snapLine.setLatLngs([latlng, closestLatLng]);
            } else {
                snapLine.setLatLngs([]);
            }
        };

        const container = map.getContainer();
        container.addEventListener('mousedown', handleMouseDown, true);
        window.addEventListener('mouseup', handleMouseUp, true);
        container.addEventListener('mousemove', handleMouseMove, true);
        
        return () => {
            container.removeEventListener('mousedown', handleMouseDown, true);
            window.removeEventListener('mouseup', handleMouseUp, true);
            container.removeEventListener('mousemove', handleMouseMove, true);
            if (map.hasLayer(snapLine)) {
                map.removeLayer(snapLine);
            }
        };
    }, [isEditingMode]);

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