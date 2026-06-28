import React from 'react';
import { Viewer, ImageryLayer, Entity, GeoJsonDataSource } from 'resium';
import { Cartesian3, Color } from 'cesium';

export const CesiumViewport = ({ 
    activeWorkspace, 
    cesiumRef, 
    osmImageryProvider, 
    selectedNode, 
    computedLayers, 
    loadedData 
}) => {
    return (
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
    );
};
