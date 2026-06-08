import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

const MiniMap = () => {
    const mapRef = useRef(null);
    const mapInstance = useRef(null);

    useEffect(() => {
        if (!mapInstance.current && mapRef.current) {
            mapInstance.current = L.map(mapRef.current, {
                center: [0, 0],
                zoom: 1,
                zoomControl: false,
                attributionControl: false
            });
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                className: 'map-tiles'
            }).addTo(mapInstance.current);
        }
        return () => {
            if (mapInstance.current) {
                mapInstance.current.remove();
                mapInstance.current = null;
            }
        };
    }, []);

    return (
        <div className="w-full h-full relative leaflet-dark-mode-container border border-slate-700 rounded-md overflow-hidden">
            <div ref={mapRef} className="absolute inset-0 bg-[#1f2937]"></div>
        </div>
    );
};

export default MiniMap;
