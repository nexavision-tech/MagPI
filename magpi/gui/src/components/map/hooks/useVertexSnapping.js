import { useEffect } from 'react';
import L from 'leaflet';

export const useVertexSnapping = ({
    mapInstance,
    highlightGroup,
    isEditingMode
}) => {
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
    }, [isEditingMode, mapInstance, highlightGroup]);
};
