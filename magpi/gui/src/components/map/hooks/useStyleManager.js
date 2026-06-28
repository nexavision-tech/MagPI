import { useEffect } from 'react';
import L from 'leaflet';
import { featuresMatch } from '../../../utils/featureMatch';

export const useStyleManager = ({
    highlightGroup,
    mapInstance,
    activeWorkspace,
    computedLayers,
    selectedFeatures,
    explicitRender,
    renderedCells,
    isEditingMode
}) => {
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
                const isExplicitTarget = explicitRender && explicitRender.sourceLayerId === layerId;
                const renderMode = isExplicitTarget ? 'full' : (cLayer.renderMode || 'footprint');
                const isStandaloneFootprint = !isFishnet && renderMode !== 'full';

                layerObj.setStyle({
                    color: isSelected ? '#00ffff' : (isExtent ? '#00ffff' : (cLayer.vectorColor || '#32d74b')),
                    weight: isSelected ? 4 : (isExtent ? 2 : 1),
                    fillColor: isSelected ? '#00ffff' : (cLayer.vectorColor || '#32d74b'),
                    fillOpacity: isStandaloneFootprint ? (isSelected ? 0.3 : 0.1) : 0
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
                            color: isRenderedCell ? '#f59e0b' : (isSelected ? '#00ffff' : (cLayer.vectorColor || '#ff8c00')),
                            opacity: isRenderedCell ? 0.3 : 0.8,
                            fillColor: isRenderedCell ? 'transparent' : (isSelected ? '#00ffff' : (cLayer.vectorColor || '#ff8c00')),
                            fillOpacity: isRenderedCell ? 0.0 : (isSelected ? 0.2 : 0.0),
                            dashArray: isRenderedCell ? '4,4' : null,
                            interactive: !isRenderedCell
                        });
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
                        if (childLayer._magpiIsHiddenForEdit) return;
                        const baseOpacity = cLayer.opacity !== undefined ? cLayer.opacity / 100 : 1;
                        childLayer.setStyle({
                            color: isSelected ? (isEditingMode ? '#f59e0b' : '#00ffff') : (cLayer.vectorColor || '#3388ff'),
                            weight: isSelected ? (isEditingMode ? 4 : 3) : 1.5,
                            fillOpacity: (isSelected ? 0.6 : 0.2) * baseOpacity,
                            opacity: baseOpacity
                        });
                    }
                    
                });
            }
        });
    }, [selectedFeatures, computedLayers, activeWorkspace, isEditingMode, renderedCells, explicitRender, highlightGroup, mapInstance]);
};
