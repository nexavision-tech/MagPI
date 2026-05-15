import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet-draw';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import { Map as MapIcon, Satellite, Edit } from 'lucide-react';

window.type = ''; 

const MapViewport = React.memo(({ onAoiDrawn, selectedNode }) => {
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

        const drawnItems = new L.FeatureGroup();
        map.addLayer(drawnItems);
        
        highlightGroup.current = new L.FeatureGroup();
        map.addLayer(highlightGroup.current);

        const drawControl = new L.Control.Draw({
            draw: {
                polyline: false, polygon: false, circle: false, marker: false, circlemarker: false,
                rectangle: { shapeOptions: { color: '#f69d3c', weight: 2, fillOpacity: 0.1 } }
            },
            edit: { featureGroup: drawnItems, remove: true }
        });
        map.addControl(drawControl);

        const style = document.createElement('style');
        style.innerHTML = '.leaflet-draw-toolbar { display: none !important; }';
        document.head.appendChild(style);

        map.on(L.Draw.Event.CREATED, function (e) {
            drawnItems.clearLayers(); 
            drawnItems.addLayer(e.layer);
            
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

    useEffect(() => {
        if (!mapInstance.current || !highlightGroup.current) return;

        highlightGroup.current.clearLayers();

        if (selectedNode && selectedNode.params) {
            const p = selectedNode.params;

            if (selectedNode.toolId === 'mgt_clip' && p.xmin && p.ymin && p.xmax && p.ymax) {
                try {
                    const bounds = [[parseFloat(p.ymin), parseFloat(p.xmin)], [parseFloat(p.ymax), parseFloat(p.xmax)]];
                    const rect = L.rectangle(bounds, { color: "#f69d3c", weight: 2, fillOpacity: 0.2, dashArray: '5, 5' });
                    highlightGroup.current.addLayer(rect);
                    mapInstance.current.flyToBounds(bounds, { duration: 1.0, padding: [20, 20] });
                } catch (e) {
                    console.log("Invalid coordinates in Clip Node, waiting for user input.");
                }
            } 
            else if (selectedNode.toolId === 'load_raster' && p.file_path) {
                if (p.file_path.includes("noaa_florida")) {
                    const mockNoaaBounds = [[28.45, -81.55], [28.65, -81.25]]; 
                    const rect = L.rectangle(mockNoaaBounds, { color: "#3b82f6", weight: 2, fillOpacity: 0.1 });
                    highlightGroup.current.addLayer(rect);
                    mapInstance.current.flyToBounds(mockNoaaBounds, { duration: 1.0, padding: [20, 20] });
                }
            }
        }
    }, [selectedNodeId, selectedNodeParamsString]);

    const activateDrawTool = () => {
        if (mapInstance.current) {
            new L.Draw.Rectangle(mapInstance.current, { 
                shapeOptions: { color: '#f69d3c', weight: 2, fillOpacity: 0.2 } 
            }).enable();
        }
    };

    return (
        // CRITICAL FIX: Removed the redundant "flex" class. Now it perfectly states "hidden lg:flex flex-col"
        <div className="w-[320px] border-r border-slate-800 bg-[#0f172a] relative hidden lg:flex flex-col shadow-[-10px_0_20px_rgba(0,0,0,0.3)] z-10">
            <div className="px-4 py-3 bg-slate-800 text-xs font-bold tracking-widest text-slate-300 flex items-center justify-between border-b border-slate-700">
                <div className="flex items-center">
                    <MapIcon size={14} className="mr-2 text-emerald-500" /> LIVE VIEWPORT
                </div>
                <button 
                    onClick={activateDrawTool}
                    className="text-emerald-500 hover:text-white bg-emerald-900/30 hover:bg-emerald-600 px-2 py-1 rounded transition-colors flex items-center border border-emerald-900/50"
                    title="Draw AOI Rectangle"
                >
                    <Edit size={14} className="mr-1" /> DRAW
                </button>
            </div>
            
            <div className="flex-1 relative bg-[#111827] overflow-hidden z-0 leaflet-dark-mode-container">
                <div ref={mapRef} style={{ width: '100%', height: '100%', backgroundColor: '#1f2937', touchAction: 'none' }}></div>
            </div>
            
            <div className="bg-slate-900 p-4 border-t border-slate-700 text-xs text-slate-400 font-mono leading-relaxed">
                <p className="text-emerald-400 font-bold mb-2 flex items-center">
                   <Satellite size={14} className="mr-2" /> OSM Connected
                </p>
                <p className="opacity-80">Click the <strong className="text-emerald-400">DRAW</strong> button above to drag a bounding box. It will instantly generate a Clipping node on the canvas.</p>
            </div>
        </div>
    );
});

export default MapViewport;