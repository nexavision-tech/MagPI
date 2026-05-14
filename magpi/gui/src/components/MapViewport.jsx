import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet-draw';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import { Map as MapIcon, Satellite } from 'lucide-react';

export default function MapViewport({ onAoiDrawn }) {
    const mapRef = useRef(null);
    const mapInstance = useRef(null); 

    useEffect(() => {
        if (!mapRef.current) return;
        
        // Prevent React StrictMode from initializing the map twice
        if (mapInstance.current) return; 

        // Initialize map centered on Orange County, FL
        const map = L.map(mapRef.current, { zoomControl: false }).setView([28.5383, -81.3792], 10);
        mapInstance.current = map;

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OSM'
        }).addTo(map);

        L.control.zoom({ position: 'topright' }).addTo(map);

        const drawnItems = new L.FeatureGroup();
        map.addLayer(drawnItems);

        const drawControl = new L.Control.Draw({
            position: 'topleft',
            draw: {
                polyline: false, polygon: false, circle: false, marker: false, circlemarker: false,
                rectangle: { shapeOptions: { color: '#10b981', weight: 2, fillOpacity: 0.1 } }
            },
            edit: { featureGroup: drawnItems, remove: true }
        });
        map.addControl(drawControl);

        // Map -> React Bridge: Send GPS coordinates up to the Canvas!
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

    return (
        <div className="w-[320px] border-r border-slate-800 bg-[#0f172a] relative flex flex-col hidden lg:flex shadow-[-10px_0_20px_rgba(0,0,0,0.3)] z-10">
            <div className="px-4 py-3 bg-slate-800 text-xs font-bold tracking-widest text-slate-300 flex items-center border-b border-slate-700">
                <MapIcon size={14} className="mr-2 text-emerald-500" /> LIVE VIEWPORT
            </div>
            
            {/* The Leaflet Container with our Custom Dark Mode CSS Class */}
            <div className="flex-1 relative bg-[#111827] overflow-hidden z-0 leaflet-dark-mode-container">
                <div ref={mapRef} style={{ width: '100%', height: '100%', backgroundColor: '#1f2937' }}></div>
            </div>
            
            <div className="bg-slate-900 p-4 border-t border-slate-700 text-xs text-slate-400 font-mono leading-relaxed">
                <p className="text-emerald-400 font-bold mb-2 flex items-center">
                   <Satellite size={14} className="mr-2" /> OSM Connected
                </p>
                <p className="opacity-80">Use the rectangle tool (top left of map) to draw an AOI. It will dynamically spawn a clipping node on your canvas.</p>
            </div>
        </div>
    );
}