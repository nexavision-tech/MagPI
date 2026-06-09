import React, { useState, useEffect, useRef } from 'react';
import { X, Search, Check, Loader2, Calendar, Map as MapIcon, Cloud, MousePointer2 } from 'lucide-react';

export default function StacQueryModal({ isOpen, onClose, selectedNode, nodes, connections, updateNodeParam }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const footprintsLayer = useRef(null);
  const aoiLayer = useRef(null);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState([]);
  const [groupedResults, setGroupedResults] = useState({});
  const [activeDate, setActiveDate] = useState(null);
  const [hoveredScene, setHoveredScene] = useState(null);
  
  const [parsedBbox, setParsedBbox] = useState(null);

  // Derive BBOX from connections
  useEffect(() => {
    if (!isOpen || !selectedNode) return;
    
    const incomingEdges = connections.filter(c => c.to === selectedNode.id);
    let bbox = null;
    if (incomingEdges.length > 0) {
      const extentNodes = incomingEdges
        .map(edge => nodes.find(n => n.id === edge.from))
        .filter(n => n && n.toolId === 'core_extent' && n.params);

      if (extentNodes.length > 0) {
        let minX = 180, minY = 90, maxX = -180, maxY = -90;
        extentNodes.forEach(node => {
          minX = Math.min(minX, parseFloat(node.params.xmin));
          minY = Math.min(minY, parseFloat(node.params.ymin));
          maxX = Math.max(maxX, parseFloat(node.params.xmax));
          maxY = Math.max(maxY, parseFloat(node.params.ymax));
        });
        bbox = [minX, minY, maxX, maxY];
      } else {
        const fileNodes = incomingEdges
          .map(edge => nodes.find(n => n.id === edge.from))
          .filter(n => n && n.params && n.params.file_path);
        if (fileNodes.length > 0) {
          bbox = fileNodes[0].params.file_path; 
        }
      }
    }
    setParsedBbox(bbox);
  }, [isOpen, selectedNode, connections, nodes]);

  // Init Map
  useEffect(() => {
    if (!isOpen || !mapRef.current) return;
    if (!mapInstance.current) {
      mapInstance.current = window.L.map(mapRef.current).setView([0, 0], 2);
      window.L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 20
      }).addTo(mapInstance.current);
    }
    
    // Resize map when modal opens
    setTimeout(() => {
      if (mapInstance.current) {
        mapInstance.current.invalidateSize();
      }
    }, 100);
  }, [isOpen]);

  const queryStac = async () => {
    if (!parsedBbox || (Array.isArray(parsedBbox) && parsedBbox.length !== 4)) {
      setError("No Spatial Extent connected! Please connect an AOI or Vector node.");
      return;
    }

    setLoading(true);
    setError(null);
    setResults([]);
    setGroupedResults({});
    setActiveDate(null);

    const date_range = `${selectedNode?.params.start_date?.value || selectedNode?.params.start_date}/${selectedNode?.params.end_date?.value || selectedNode?.params.end_date}`;

    try {
      const response = await fetch(`http://${window.location.hostname}:8282/api/stac_query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bbox: parsedBbox,
          max_cloud_cover: selectedNode?.params.max_cloud_cover,
          date_range: date_range
        })
      });
      const data = await response.json();

      if (response.ok && data.results) {
        setResults(data.results);
        
        // Group by Date
        const grouped = {};
        data.results.forEach(res => {
          const d = res.date.split('T')[0];
          if (!grouped[d]) grouped[d] = [];
          grouped[d].push(res);
        });
        
        // Sort dates descending
        const sortedDates = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));
        const sortedGrouped = {};
        sortedDates.forEach(d => sortedGrouped[d] = grouped[d]);
        
        setGroupedResults(sortedGrouped);
        if (sortedDates.length > 0) setActiveDate(sortedDates[0]);
        
        // Draw AOI using the resolved bbox from the backend
        const resolvedBbox = data.parsed_bbox || (Array.isArray(parsedBbox) ? parsedBbox : null);
        
        if (resolvedBbox && resolvedBbox.length === 4) {
          if (aoiLayer.current) mapInstance.current.removeLayer(aoiLayer.current);
          
          if (data.parsed_geojson) {
             aoiLayer.current = window.L.geoJSON(data.parsed_geojson, {
               style: { color: "#10b981", weight: 2, fillOpacity: 0.1, dashArray: '5, 5' }
             }).addTo(mapInstance.current);
          } else {
             const bounds = [[resolvedBbox[1], resolvedBbox[0]], [resolvedBbox[3], resolvedBbox[2]]];
             aoiLayer.current = window.L.rectangle(bounds, { color: "#10b981", weight: 2, fillOpacity: 0.1, dashArray: '5, 5' }).addTo(mapInstance.current);
          }
          
          const bounds = [[resolvedBbox[1], resolvedBbox[0]], [resolvedBbox[3], resolvedBbox[2]]];
          mapInstance.current.fitBounds(bounds, { padding: [50, 50] });
        }
      } else {
        setError(data.error || "Failed to query STAC.");
      }
    } catch (err) {
      setError("Daemon offline or unreachable.");
    } finally {
      setLoading(false);
    }
  };

  // Auto-query on first open if we have a bbox
  useEffect(() => {
    if (isOpen && parsedBbox && results.length === 0 && !error) {
      queryStac();
    }
  }, [isOpen, parsedBbox]);

  // Draw footprints when activeDate or selectedItems change
  useEffect(() => {
    if (!mapInstance.current || !activeDate || !groupedResults[activeDate]) return;

    if (footprintsLayer.current) {
      mapInstance.current.removeLayer(footprintsLayer.current);
    }

    const selectedIds = selectedNode?.params.selected_items ? selectedNode?.params.selected_items.split(',').map(s => s.trim()).filter(Boolean) : [];

    const geojsonData = {
      type: "FeatureCollection",
      features: groupedResults[activeDate].map(scene => ({
        type: "Feature",
        id: scene.id,
        geometry: scene.geometry,
        properties: { ...scene, isSelected: selectedIds.includes(scene.id) }
      }))
    };

    footprintsLayer.current = window.L.geoJSON(geojsonData, {
      style: (feature) => {
        const isSel = feature.properties.isSelected;
        const isHov = hoveredScene === feature.id;
        return {
          color: isSel ? '#06b6d4' : (isHov ? '#3b82f6' : '#64748b'),
          weight: isSel || isHov ? 3 : 1,
          fillColor: isSel ? '#06b6d4' : (isHov ? '#3b82f6' : '#64748b'),
          fillOpacity: isSel ? 0.3 : (isHov ? 0.2 : 0.05)
        };
      },
      onEachFeature: (feature, layer) => {
        layer.on({
          mouseover: () => setHoveredScene(feature.id),
          mouseout: () => setHoveredScene(null),
          click: () => toggleSelection(feature.id)
        });
        // Tooltip
        layer.bindTooltip(`<b>${feature.id}</b><br/>Cloud Cover: ${feature.properties.cloud_cover.toFixed(1)}%`, { sticky: true });
      }
    }).addTo(mapInstance.current);

  }, [activeDate, groupedResults, selectedNode?.params.selected_items, hoveredScene]);

  const toggleSelection = (id) => {
    let current = selectedNode?.params.selected_items ? selectedNode?.params.selected_items.split(',').map(s => s.trim()).filter(Boolean) : [];
    if (current.includes(id)) {
      current = current.filter(x => x !== id);
    } else {
      current.push(id);
    }
    updateNodeParam(selectedNode.id, 'selected_items', current.join(','));
  };

  if (!isOpen) return null;

  const selectedIds = selectedNode?.params.selected_items ? selectedNode?.params.selected_items.split(',').map(s => s.trim()).filter(Boolean) : [];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 w-[90vw] h-[90vh] rounded-xl border border-slate-700 shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="h-14 bg-slate-800 border-b border-slate-700 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-cyan-900/50 rounded flex items-center justify-center mr-3 border border-cyan-500/30">
              <Search size={18} className="text-cyan-400" />
            </div>
            <div>
              <h2 className="text-white font-bold text-lg leading-tight">Advanced STAC Explorer</h2>
              <p className="text-slate-400 text-xs">Visual footprint selection for AWS Earth Search</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors p-2 rounded-full hover:bg-slate-700"><X size={20} /></button>
        </div>

        {/* Content Body */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Left Pane: Interactive Map */}
          <div className="flex-1 relative bg-slate-950 flex flex-col">
            <div ref={mapRef} className="flex-1 w-full h-full" />
            
            {/* Map Overlay Controls */}
            <div className="absolute top-4 right-4 z-[400] flex space-x-2">
              <button 
                onClick={queryStac} 
                disabled={loading}
                className="bg-slate-800/90 backdrop-blur-md hover:bg-slate-700 text-white px-4 py-2 rounded shadow-lg border border-slate-600 flex items-center text-sm font-bold transition-all disabled:opacity-50"
              >
                {loading ? <Loader2 size={16} className="animate-spin mr-2" /> : <Search size={16} className="mr-2" />}
                {loading ? "Scanning..." : "Re-Query Area"}
              </button>
            </div>
            
            {/* Hover tooltip for footprint inside map */}
            <div className="absolute bottom-4 left-4 z-[400] bg-slate-900/90 backdrop-blur-md border border-slate-700 rounded-lg p-3 max-w-xs shadow-xl pointer-events-none">
               <h3 className="text-xs font-bold text-slate-300 uppercase tracking-widest mb-1 flex items-center"><MapIcon size={12} className="mr-2"/> Instructions</h3>
               <p className="text-xs text-slate-400 leading-tight">
                 Select a date on the right. Then click footprints on the map to add them to your processing queue. Selected tiles turn <span className="text-cyan-400 font-bold">cyan</span>.
               </p>
            </div>
          </div>

          {/* Right Pane: Chronological List */}
          <div className="w-[400px] bg-slate-800 border-l border-slate-700 flex flex-col shrink-0">
            <div className="p-4 border-b border-slate-700 bg-slate-800/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center"><Calendar size={12} className="mr-2"/> Timeline</span>
                <span className="text-[10px] bg-cyan-900/40 text-cyan-400 px-2 py-0.5 rounded border border-cyan-800">{results.length} Scenes Found</span>
              </div>
              
              {/* Horizontal Date Scroller */}
              <div className="flex space-x-2 overflow-x-auto pb-2 custom-scrollbar">
                {Object.keys(groupedResults).length === 0 && !loading && <span className="text-xs text-slate-500 italic">No scenes available</span>}
                {Object.keys(groupedResults).map(date => (
                  <button
                    key={date}
                    onClick={() => setActiveDate(date)}
                    className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${activeDate === date ? 'bg-cyan-600 text-white border-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.3)]' : 'bg-slate-700 text-slate-300 border-slate-600 hover:bg-slate-600'}`}
                  >
                    {date}
                    <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded-full bg-black/30">{groupedResults[date].length}</span>
                  </button>
                ))}
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar bg-slate-900/30">
              {error && (
                <div className="bg-red-900/20 p-4 rounded border border-red-800/50 flex items-start text-sm text-red-400">
                  <span className="leading-tight">{error}</span>
                </div>
              )}
              
              {activeDate && groupedResults[activeDate] && (
                <>
                  <h4 className="text-sm font-bold text-white mb-2 flex items-center justify-between">
                    <span>Scenes for {activeDate}</span>
                  </h4>
                  
                  {groupedResults[activeDate].map(scene => {
                    const isSelected = selectedIds.includes(scene.id);
                    return (
                      <div 
                        key={scene.id}
                        onMouseEnter={() => setHoveredScene(scene.id)}
                        onMouseLeave={() => setHoveredScene(null)}
                        onClick={() => toggleSelection(scene.id)}
                        className={`p-3 rounded-lg border cursor-pointer transition-all flex flex-col relative overflow-hidden group ${isSelected ? 'bg-cyan-900/30 border-cyan-500 shadow-md' : 'bg-slate-800 border-slate-700 hover:border-slate-500'}`}
                      >
                        {isSelected && <div className="absolute top-0 right-0 w-0 h-0 border-t-[30px] border-l-[30px] border-t-cyan-500 border-l-transparent"></div>}
                        {isSelected && <Check size={12} className="absolute top-1 right-1 text-white z-10" />}
                        
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-mono font-bold text-slate-200 truncate pr-6" title={scene.id}>{scene.id.split('_').slice(-2).join('_')}</span>
                          <div className={`flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded ${scene.cloud_cover < 10 ? 'bg-emerald-900/50 text-emerald-400' : scene.cloud_cover < 30 ? 'bg-yellow-900/50 text-yellow-400' : 'bg-red-900/50 text-red-400'}`}>
                            <Cloud size={10} className="mr-1" /> {scene.cloud_cover.toFixed(1)}%
                          </div>
                        </div>
                        <span className="text-[10px] text-slate-500 truncate">{scene.id}</span>
                      </div>
                    )
                  })}
                </>
              )}
            </div>

            {/* Bottom Queue Footer */}
            <div className="p-4 bg-slate-800 border-t border-slate-700">
               <div className="flex items-center justify-between mb-3">
                 <span className="text-sm font-bold text-slate-300">Selected Queue</span>
                 <span className="text-sm font-bold text-cyan-400 bg-cyan-900/40 px-2 py-0.5 rounded">{selectedIds.length}</span>
               </div>
               <button 
                 onClick={onClose}
                 className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded shadow-lg transition-colors flex items-center justify-center"
               >
                 <Check size={16} className="mr-2"/> Confirm & Close
               </button>
            </div>
            
          </div>
        </div>
      </div>
    </div>
  );
}
