import React, { useEffect, useRef, useState } from 'react';
import { X, Layers, Maximize, Minimize } from 'lucide-react';

export default function MapViewer({ isOpen, onClose, selectedNode, globalEnv }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  useEffect(() => {
    if (!isOpen || !mapRef.current) return;
    
    // Initialize map if not already done
    if (!mapInstance.current) {
      mapInstance.current = window.L.map(mapRef.current).setView([0, 0], 2);
      
      // Dark mode basemap
      window.L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
      }).addTo(mapInstance.current);
    }
    
    // In a real implementation, we would fetch GeoJSON from /api/preview?node_id=...
    // For now, if there is a selected node, we just show a generic bounding box
    if (selectedNode) {
      // Clean up old layers
      mapInstance.current.eachLayer((layer) => {
        if (layer.options && layer.options.attribution) return; // Keep basemap
        mapInstance.current.removeLayer(layer);
      });
      
      // Example bounding box
      const bounds = [[-90, -180], [90, 180]];
      window.L.rectangle(bounds, { color: "#ff7800", weight: 1 }).addTo(mapInstance.current);
      mapInstance.current.fitBounds(bounds);
    }
    
    // Invalidate size because modal rendering can mess up leaflet's dimensions
    setTimeout(() => {
        if(mapInstance.current) mapInstance.current.invalidateSize();
    }, 100);
    
  }, [isOpen, selectedNode, isFullscreen]);
  
  if (!isOpen) return null;
  
  return (
    <div className={`fixed z-50 bg-slate-900 border-l border-t border-slate-700 shadow-2xl transition-all duration-300 flex flex-col ${isFullscreen ? 'inset-0' : 'bottom-0 right-0 w-2/3 h-2/3'}`}>
      <div className="flex items-center justify-between p-3 border-b border-slate-800 bg-slate-950">
        <div className="flex items-center gap-2 text-slate-300">
          <Layers size={16} className="text-cyan-400" />
          <span className="font-semibold text-sm tracking-wide uppercase">Interactive Cartography Preview</span>
          {selectedNode && (
            <span className="ml-2 px-2 py-0.5 rounded bg-slate-800 text-xs text-slate-400">
              {selectedNode.data?.label || selectedNode.type}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setIsFullscreen(!isFullscreen)} className="text-slate-400 hover:text-white transition-colors">
            {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>
          <button onClick={onClose} className="text-slate-400 hover:text-red-400 transition-colors">
            <X size={18} />
          </button>
        </div>
      </div>
      
      <div className="flex-1 w-full h-full relative" ref={mapRef}>
         {/* Map renders here */}
      </div>
    </div>
  );
}
