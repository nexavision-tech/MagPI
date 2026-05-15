import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet-draw';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import { Map as MapIcon, Satellite } from 'lucide-react';

// ENHANCED: Receiving selectedNode to synchronize the map with the canvas
const MapViewport = React.memo(({ onAoiDrawn, selectedNode }) => {
    const mapRef = useRef(null);
    const mapInstance = useRef(null); 
    const highlightGroup = useRef(null); // Tracks the dynamic footprints

    useEffect(() => {
        if (!mapRef.current) return;
        if (mapInstance.current) return; 

        // Initialize map centered on Orlando as the default datum
        const map = L.map(mapRef.current, { zoomControl: false }).setView([28.5383, -81.3792], 10);
        mapInstance.current = map;

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OSM'
        }).addTo(map);

        L.control.zoom({ position: 'topright' }).addTo(map);

        const drawnItems = new L.FeatureGroup();
        map.addLayer(drawnItems);
        
        // NEW: Dedicated layer for Canvas synchronization highlights
        highlightGroup.current = new L.FeatureGroup();
        map.addLayer(highlightGroup.current);

        const drawControl = new L.Control.Draw({
            position: 'topleft',
            draw: {
                polyline: false, polygon: false, circle: false, marker: false, circlemarker: false,
                rectangle: { shapeOptions: { color: '#10b981', weight: 2, fillOpacity: 0.1 } }
            },
            edit: { featureGroup: drawnItems, remove: true }
        });
        map.addControl(drawControl);

        map.on(L.Draw.Event.CREATED, function (e) {
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

        return () => {
            map.remove();
            mapInstance.current = null;
        };
    }, [onAoiDrawn]);

    // NEW: The Cartographer's Sync
    // Watches the selected node and dynamically moves the map camera
    useEffect(() => {
        if (!mapInstance.current || !highlightGroup.current) return;

        // Clear previous highlights
        highlightGroup.current.clearLayers();

        if (selectedNode && selectedNode.params) {
            const p = selectedNode.params;

            // Scenario 1: User clicked an AOI Clip tool
            if (selectedNode.toolId === 'mgt_clip' && p.xmin && p.ymin && p.xmax && p.ymax) {
                try {
                    const bounds = [[parseFloat(p.ymin), float(p.xmin)], [parseFloat(p.ymax), parseFloat(p.xmax)]];
                    const rect = L.rectangle(bounds, { color: "#f69d3c", weight: 2, fillOpacity: 0.2, dashArray: '5, 5' });
                    highlightGroup.current.addLayer(rect);
                    mapInstance.current.flyToBounds(bounds, { duration: 1.0, padding: [20, 20] });
                } catch (e) {
                    console.log("Invalid coordinates in Clip Node, waiting for user input.");
                }
            } 
            // Scenario 2: User clicked a loaded Raster dataset
            else if (selectedNode.toolId === 'load_raster' && p.file_path) {
                // In a future full build, this would fetch the exact bounding box from the Python backend.
                // For this MVP, we use the known bounding box of your NOAA 4-Band test data!
                if (p.file_path.includes("noaa_florida")) {
                    const mockNoaaBounds = [[28.45, -81.55], [28.65, -81.25]]; // Rough Orlando footprint
                    const rect = L.rectangle(mockNoaaBounds, { color: "#3b82f6", weight: 2, fillOpacity: 0.1 });
                    highlightGroup.current.addLayer(rect);
                    mapInstance.current.flyToBounds(mockNoaaBounds, { duration: 1.0, padding: [20, 20] });
                }
            }
        }
    }, [selectedNode]);

    return (
        <div className="w-[320px] border-r border-slate-800 bg-[#0f172a] relative flex flex-col hidden lg:flex shadow-[-10px_0_20px_rgba(0,0,0,0.3)] z-10">
            <div className="px-4 py-3 bg-slate-800 text-xs font-bold tracking-widest text-slate-300 flex items-center border-b border-slate-700">
                <MapIcon size={14} className="mr-2 text-emerald-500" /> LIVE VIEWPORT
            </div>
            
            <div className="flex-1 relative bg-[#111827] overflow-hidden z-0 leaflet-dark-mode-container">
                <div ref={mapRef} style={{ width: '100%', height: '100%', backgroundColor: '#1f2937' }}></div>
            </div>
            
            <div className="bg-slate-900 p-4 border-t border-slate-700 text-xs text-slate-400 font-mono leading-relaxed">
                <p className="text-emerald-400 font-bold mb-2 flex items-center">
                   <Satellite size={14} className="mr-2" /> OSM Connected
                </p>
                <p className="opacity-80">The map camera is now synchronized. It will automatically fly to the extents of any valid spatial node selected on the canvas.</p>
            </div>
        </div>
    );
});

export default MapViewport;