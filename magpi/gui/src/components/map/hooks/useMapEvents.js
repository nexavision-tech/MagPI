import { useEffect } from 'react';
import L from 'leaflet';

export const useMapEvents = ({
    mapInstance,
    highlightGroup,
    loadedData,
    loadedDataRef,
    setLoadedData,
    setExplicitRender,
    setRenderedCells,
    setIsEditingMode,
    activeFeatureLayer,
    nodesRef,
    activateDrawTool
}) => {
    useEffect(() => {
        const handleFeatureSelect = (e) => {
            if (!e.detail) {
                activeFeatureLayer.current = null;
                return;
            }
            if (!mapInstance.current) return;
            
            if (e.detail.isFootprint) {
                // Not a vector feature, just zoom to the bounds if needed
                return;
            }
            
            // Find the active Leaflet layer for editing
            let foundLayer = null;
            highlightGroup.current.eachLayer(layer => {
                if (layer.magpi_layer_id === e.detail.nodeId && layer instanceof L.GeoJSON) {
                    layer.eachLayer(childLayer => {
                        if (childLayer.feature && 
                            JSON.stringify(childLayer.feature.properties) === JSON.stringify(e.detail.feature.properties)) {
                            foundLayer = childLayer;
                        }
                    });
                }
            });
            
            if (foundLayer) {
                activeFeatureLayer.current = {
                    nodeId: e.detail.nodeId,
                    feature: e.detail.feature,
                    layer: foundLayer
                };
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
            setExplicitRender(prev => {
                if (prev && prev.sourceLayerId) {
                    setLoadedData(currentData => {
                        const newData = { ...currentData };
                        delete newData[prev.sourceLayerId];
                        return newData;
                    });
                }
                return null;
            });
            setRenderedCells(new Set());
            setIsEditingMode(false);
            if (mapInstance.current) L.DomUtil.removeClass(mapInstance.current.getContainer(), 'magpi-edit-mode');
            window.dispatchEvent(new CustomEvent('magpi-feature-selected', { detail: null }));
        };
        window.addEventListener('magpi-clear-selection', handleClearSelection);
        
        const handleEditVector = () => {
            setIsEditingMode(true);
            if (mapInstance.current) {
                L.DomUtil.addClass(mapInstance.current.getContainer(), 'magpi-edit-mode');
                
                // Enable editing for all features in highlightGroup
                if (highlightGroup.current) {
                    highlightGroup.current.eachLayer(layerObj => {
                        if (layerObj instanceof L.GeoJSON) {
                            layerObj.eachLayer(childLayer => {
                                if (childLayer.editing) {
                                    childLayer.editing.enable();
                                }
                            });
                        }
                    });
                }
            }
            console.log('[MagPI] Edit mode enabled for all features.');
        };
        window.addEventListener('magpi-edit-vector', handleEditVector);
        
        const handleSaveEdits = (e) => {
            const { nodeId } = e.detail;
            if (!nodeId) return;
            const cached = loadedDataRef.current[nodeId];
            if (cached && cached.data && cached.data.features) {
                if (highlightGroup.current) {
                    highlightGroup.current.eachLayer(layerObj => {
                        if (layerObj instanceof L.GeoJSON) {
                            layerObj.eachLayer(childLayer => {
                                if (childLayer.editing && childLayer.editing.enabled()) {
                                    childLayer.editing.disable();
                                    
                                    // Update cached data if modified
                                    const editedGeoJSON = childLayer.toGeoJSON();
                                    const f = cached.data.features.find(feat => 
                                        JSON.stringify(feat.properties) === JSON.stringify(editedGeoJSON.properties)
                                    );
                                    if (f) {
                                        f.geometry = editedGeoJSON.geometry;
                                    }
                                }
                            });
                        }
                    });
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
                    requestBody.tolerance = (action === 'snap' && typeof e.detail.tolerance === 'number') ? e.detail.tolerance : 0.005;
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
    }, []); // Empty deps because callbacks use refs for current data
};
