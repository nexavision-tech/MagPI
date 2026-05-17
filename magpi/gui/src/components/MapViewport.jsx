import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet-draw';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import { Map as MapIcon, Satellite, Edit } from 'lucide-react';

window.type = ''; 

const MapViewport = React.memo(({ onAoiDrawn, selectedNode, activeWorkspace }) => {
    const mapRef = useRef(null);
    const mapInstance = useRef(null); 
    const highlightGroup = useRef(null);

    useEffect(() => {
        if (!mapRef.current) return;
        if (mapInstance.current) return; 

        const map = L.map(mapRef.current, { zoomControl: false }).setView([28.5383, -81.3792], 10);
        mapInstance.current = map;

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OSM'
        }).addTo(map);

        L.control.zoom({ position: 'topright' }).addTo(map);

        highlightGroup.current = new L.FeatureGroup();
        map.addLayer(highlightGroup.current);

        const drawControl = new L.Control.Draw({
            draw: {
                polyline: false, polygon: false, circle: false, marker: false, circlemarker: false,
                rectangle: { shapeOptions: { color: '#00ffff', weight: 2, fillOpacity: 0.15 } } 
            },
            edit: false 
        });
        map.addControl(drawControl);

        const style = document.createElement('style');
        style.innerHTML = '.leaflet-draw-toolbar { display: none !important; }';
        document.head.appendChild(style);

        map.on(L.Draw.Event.CREATED, function (e) {
            const bounds = e.layer.getBounds();
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

    const selectedNodeId = selectedNode?.id;
    const selectedNodeParamsString = JSON.stringify(selectedNode?.params || {});

    // THE OVERLAY ENGINE (Snapping Fix)
    useEffect(() => {
        if (!mapInstance.current || !highlightGroup.current) return;

        highlightGroup.current.clearLayers();

        if (selectedNode && selectedNode.params) {
            const p = selectedNode.params;

            // FIX: Robustly parse floats to ensure Leaflet accepts them instantly
            if ((selectedNode.toolId === 'core_extent' || selectedNode.toolId === 'mgt_clip') && p.xmin && p.ymin && p.xmax && p.ymax) {
                try {
                    const y1 = parseFloat(p.ymin);
                    const x1 = parseFloat(p.xmin);
                    const y2 = parseFloat(p.ymax);
                    const x2 = parseFloat(p.xmax);
                    
                    if (!isNaN(y1) && !isNaN(x1) && !isNaN(y2) && !isNaN(x2)) {
                        const bounds = [[y1, x1], [y2, x2]];
                        const rect = L.rectangle(bounds, { color: "#00ffff", weight: 2, fillOpacity: 0.15, dashArray: '4, 4' });
                        highlightGroup.current.addLayer(rect);
                        mapInstance.current.flyToBounds(bounds, { duration: 0.8, padding: [30, 30] });
                    }
                } catch (e) {
                    console.log("Waiting for complete coordinates...");
                }
            } 
            else if (selectedNode.toolId === 'load_raster' && p.file_path) {
                fetch(`http://localhost:8080/api/describe?file=${encodeURIComponent(p.file_path)}`)
                    .then(res => res.json())
                    .then(data => {
                        if (data && data.wgs84_extent) {
                            const rect = L.rectangle(data.wgs84_extent, { color: "#3b82f6", weight: 2, fillOpacity: 0.1 });
                            highlightGroup.current.addLayer(rect);
                            mapInstance.current.flyToBounds(data.wgs84_extent, { duration: 1.0, padding: [20, 20] });
                        }
                    })
                    .catch(err => console.log("Daemon footprint fetch failed", err));
            }
        }
    }, [selectedNodeId, selectedNodeParamsString]);

    const activateDrawTool = () => {
        if (mapInstance.current) {
            new L.Draw.Rectangle(mapInstance.current, { 
                shapeOptions: { color: '#00ffff', weight: 2, fillOpacity: 0.15 } 
            }).enable();
        }
    };

    return (
        <div className="w-full h-full flex flex-col relative bg-[#111827]">
            {/* Header */}
            <div className="px-4 py-3 bg-slate-800 text-xs font-bold tracking-widest text-slate-300 flex items-center justify-between border-b border-slate-700 z-10 shrink-0">
                <div className="flex items-center">
                    <MapIcon size={14} className={`mr-2 ${activeWorkspace === 'globe' ? 'text-cyan-400' : 'text-emerald-500'}`} /> 
                    {activeWorkspace === 'globe' ? 'GLOBE NEXUS' : 'LIVE VIEWPORT'}
                </div>
                <button 
                    onClick={activateDrawTool}
                    className="text-cyan-400 hover:text-cyan-200 bg-cyan-900/30 hover:bg-cyan-800/50 px-2 py-1 rounded transition-colors flex items-center border border-cyan-900/50"
                    title="Draw AOI Rectangle"
                >
                    <Edit size={14} className="mr-1" /> DRAW AOI
                </button>
            </div>
            
            {/* Map Container */}
            <div className="flex-1 relative overflow-hidden z-0 leaflet-dark-mode-container">
                <div ref={mapRef} style={{ width: '100%', height: '100%', backgroundColor: '#1f2937', touchAction: 'none' }}></div>
            </div>
            
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