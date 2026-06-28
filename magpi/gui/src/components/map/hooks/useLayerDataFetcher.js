import { useEffect } from 'react';

export const useLayerDataFetcher = ({
    computedLayers,
    loadedData,
    setLoadedData,
    explicitRender,
    viewportBBox,
    globalEnv
}) => {
    useEffect(() => {
        computedLayers.forEach(layer => {
            if (!layer.visible) return;

            // Fetch Raster Data
            if (layer.isRaster && layer.filePath) {
                const cached = loadedData[layer.id];
                if (!cached || (!cached.isFetching && cached.type !== 'raster')) {
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
            
            // Fetch Vector / GeoJSON Data
            else if ((layer.filePath || layer.syntheticType) && !layer.id.includes('extent')) {
                const cached = loadedData[layer.id];
                const isFishnet = layer.toolId === 'core_fishnet';
                
                const isExplicitTarget = explicitRender && explicitRender.sourceLayerId === layer.id;
                const renderMode = isExplicitTarget ? 'full' : (layer.renderMode || 'footprint');
                
                if (!isFishnet && renderMode !== 'full') {
                    return;
                }

                const fetchBbox = isExplicitTarget ? explicitRender.bbox : (isFishnet ? null : viewportBBox);
                const useGeolibre = false; 
                const expectedType = useGeolibre ? 'vector_image' : 'geojson';
                const isFullRender = (isExplicitTarget && explicitRender.bbox === null) || isFishnet;
                
                const needsFetch = (fetchBbox || isFullRender) && 
                    (!cached || cached.type !== expectedType || (!cached.isFetching && cached.bbox !== fetchBbox));

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
            }
        });
    }, [computedLayers, explicitRender, viewportBBox, globalEnv, setLoadedData, loadedData]);
};
