import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { featuresMatch } from '../../../utils/featureMatch';

export const useMapRenderer = ({
    mapInstance,
    highlightGroup,
    computedLayers,
    loadedData,
    connections,
    nodes,
    explicitRender,
    renderedCells,
    selectedFeatures,
    selectedNodeRef,
    interactionModeRef,
    lastZoomedNode,
    autoZoom
}) => {
    useEffect(() => {
        if (!mapInstance.current || !highlightGroup.current) return;
        const map = mapInstance.current;
        highlightGroup.current.clearLayers();
        
        [...computedLayers].reverse().forEach(layer => {
            if (!layer.visible) return;
            
            const paneName = `magpi_pane_${layer.id}`;
            if (!map.getPane(paneName)) {
                map.createPane(paneName);
            }
            const layerIndex = computedLayers.findIndex(l => l.id === layer.id);
            let calculatedIndex = layerIndex;
            
            const isChild = connections.some(c => c.to === layer.id);
            if (isChild) {
                const parentConnection = connections.find(c => c.to === layer.id);
                const parentIndex = computedLayers.findIndex(l => l.id === parentConnection.from);
                if (parentIndex !== -1) {
                    calculatedIndex = parentIndex - 0.5;
                }
            }
            
            const baseZIndex = 400 + ((computedLayers.length - calculatedIndex) * 10);
            const isLayerExplicitTarget = explicitRender && explicitRender.sourceLayerId === layer.id;
            map.getPane(paneName).style.zIndex = isLayerExplicitTarget ? 800 : baseZIndex;

            if (layer.extent) {
                const { xmin, ymin, xmax, ymax } = layer.extent;
                const y1 = parseFloat(ymin), x1 = parseFloat(xmin), y2 = parseFloat(ymax), x2 = parseFloat(xmax);
                const isSaneBounds = Math.abs(y1) < 1e10 && Math.abs(x1) < 1e10 && Math.abs(y2) < 1e10 && Math.abs(x2) < 1e10;
                
                if (!isNaN(y1) && !isNaN(x1) && !isNaN(y2) && !isNaN(x2) && isSaneBounds) {
                    const bounds = [[y1, x1], [y2, x2]];
                    const isSelected = selectedFeatures && selectedFeatures.some(f => f?.nodeId === layer.id && f?.isFootprint);
                    const isExtent = layer.toolId === 'core_extent';
                    const isFishnet = layer.toolId === 'core_fishnet';
                    
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
                        pane: paneName 
                    });
                    
                    rect.bindTooltip(layer.name, { 
                        permanent: isSelected, 
                        direction: "top", 
                        className: "bg-slate-900 text-white font-bold text-[10px] border-none shadow-lg" 
                    });
                    
                    rect.magpi_layer_id = layer.id;
                    
                    if (isStandaloneFootprint) {
                        rect.on('click', (e) => {
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
                    }
                    
                    highlightGroup.current.addLayer(rect);
                    
                    if (autoZoom && isSelected && lastZoomedNode.current !== layer.id) {
                        lastZoomedNode.current = layer.id;
                        map.fitBounds(bounds, { animate: true, padding: [100, 100] });
                    }
                }
            }

            if (layer.isRaster && layer.filePath) {
                const cached = loadedData[layer.id];
                if (cached && cached.type === 'raster') {
                    const imgLayer = L.imageOverlay(cached.image, cached.bounds, {
                        opacity: layer.opacity / 100,
                        interactive: true,
                        pane: paneName
                    });
                    imgLayer.bindPopup(`<div class="text-xs font-bold text-slate-800">${layer.name}</div>`);
                    imgLayer.magpi_layer_id = layer.id;
                    highlightGroup.current.addLayer(imgLayer);
                    
                    if (autoZoom && selectedNodeRef.current && selectedNodeRef.current.id === layer.id && lastZoomedNode.current !== layer.id) {
                        lastZoomedNode.current = layer.id;
                        map.fitBounds(cached.bounds, { animate: true, padding: [100, 100] });
                    }
                }
            }
            else if ((layer.filePath || layer.syntheticType) && !layer.id.includes('extent')) {
                const cached = loadedData[layer.id];
                const isFishnet = layer.toolId === 'core_fishnet';
                const isExplicitTarget = explicitRender && explicitRender.sourceLayerId === layer.id;
                
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

                        const gjLayer = L.geoJSON(cached.data, {
                            renderer: canvasRenderer,
                            interactive: true,
                            style: (feature) => {
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
                                    pane: paneName
                                });
                            },
                            onEachFeature: (feature, layerObj) => {
                                if (isFishnet && feature.properties?.id) {
                                    const coords = feature.geometry?.coordinates?.[0];
                                    let bboxStr = "";
                                    if (coords) {
                                        const xs = coords.map(c => c[0]);
                                        const ys = coords.map(c => c[1]);
                                        bboxStr = `${Math.min(...xs)},${Math.min(...ys)},${Math.max(...xs)},${Math.max(...ys)}`;
                                    }
                                    
                                    const incomingConnections = connections.filter(c => c.to === layer.id);
                                    let parentVectorId = '';
                                    for (const cx of incomingConnections) {
                                        const parentNode = nodes.find(n => n.id === cx.from);
                                        if (parentNode && (parentNode.toolId.startsWith('load_') || parentNode.toolId.startsWith('wfs_') || parentNode.toolId.startsWith('core_input_'))) {
                                            parentVectorId = parentNode.id;
                                            break;
                                        }
                                    }
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
                            if (e.originalEvent?._magpiFeatureClicked) return;
                            if (!e.layer || !e.layer.feature) return;
                            if (e.originalEvent) e.originalEvent._magpiFeatureClicked = true;

                            const feature = e.layer.feature;
                            window.dispatchEvent(new CustomEvent('magpi-feature-selected', { 
                                detail: { 
                                    feature: feature, 
                                    layerName: layer.name || layer.id, 
                                    nodeId: layer.id, 
                                    shiftKey: e.originalEvent?.shiftKey, 
                                    ctrlKey: e.originalEvent?.ctrlKey || e.originalEvent?.metaKey 
                                } 
                            }));
                        });

                        gjLayer.magpi_layer_id = layer.id;
                        highlightGroup.current.addLayer(gjLayer);
                        
                        if (autoZoom && selectedNodeRef.current && selectedNodeRef.current.id === layer.id && lastZoomedNode.current !== layer.id) {
                            lastZoomedNode.current = layer.id;
                            map.fitBounds(gjLayer.getBounds(), { animate: true, padding: [100, 100] });
                        }
                    }
                }
            }
        });
    }, [computedLayers, loadedData, explicitRender, renderedCells, selectedFeatures, connections, nodes]);
};
