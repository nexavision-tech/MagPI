import React, { useState, useEffect } from 'react';
import { Layers, Grid, Type } from 'lucide-react';

const DebouncedColorPicker = ({ color, onChange }) => {
    const [localColor, setLocalColor] = useState(color || '#32d74b');
    useEffect(() => { setLocalColor(color || '#32d74b'); }, [color]);
    return (
        <input 
            type="color"
            className="w-full h-6 rounded cursor-pointer bg-slate-800 border-none p-0"
            value={localColor}
            onChange={(e) => setLocalColor(e.target.value)}
            onBlur={() => onChange(localColor)}
        />
    );
};

export default function LayerConfigPanel({ layer, nodes, setNodes, setMapLayers, selectedFeatures }) {
    return (
        <div className="mt-2 pl-5 space-y-3 bg-slate-900/50 p-2 rounded border border-slate-700/50">
            <div className="flex items-center space-x-2">
                <span className="text-[9px] text-slate-500 uppercase tracking-widest w-12 shrink-0">Opacity</span>
                <input 
                    type="range" 
                    min="0" max="100" 
                    value={layer.opacity}
                    onChange={(e) => {
                        const newOpacity = parseInt(e.target.value);
                        if (setMapLayers) {
                            setMapLayers(prev => prev.map(l => l.id === layer.id ? { ...l, opacity: newOpacity } : l));
                        }
                    }}
                    className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer" 
                />
                <span className="text-[9px] text-slate-400 w-6 text-right shrink-0">{layer.opacity}%</span>
            </div>
            
            {layer.isBase === false && (() => {
                const node = nodes.find(n => n.id === layer.id);
                if (node && node.toolId === 'core_extent') {
                    return (
                        <div className="flex flex-col space-y-1 mt-2 border-t border-slate-700/50 pt-2">
                            <span className="text-[9px] text-slate-500 uppercase tracking-widest shrink-0">Spatial Coordinates (AOI)</span>
                            <div className="grid grid-cols-2 gap-1 mt-1">
                                <div className="flex items-center space-x-1">
                                    <span className="text-[9px] text-slate-400 w-2 shrink-0">W</span>
                                    <input type="number" step="0.001" className="flex-1 min-w-0 bg-slate-800 text-[10px] text-slate-300 border border-slate-700 rounded px-1 py-0.5 outline-none" value={node.params.xmin || ''} onChange={(e) => setNodes && setNodes(prev => prev.map(n => n.id === layer.id ? { ...n, params: { ...n.params, xmin: parseFloat(e.target.value) } } : n))} />
                                </div>
                                <div className="flex items-center space-x-1">
                                    <span className="text-[9px] text-slate-400 w-2 shrink-0">S</span>
                                    <input type="number" step="0.001" className="flex-1 min-w-0 bg-slate-800 text-[10px] text-slate-300 border border-slate-700 rounded px-1 py-0.5 outline-none" value={node.params.ymin || ''} onChange={(e) => setNodes && setNodes(prev => prev.map(n => n.id === layer.id ? { ...n, params: { ...n.params, ymin: parseFloat(e.target.value) } } : n))} />
                                </div>
                                <div className="flex items-center space-x-1">
                                    <span className="text-[9px] text-slate-400 w-2 shrink-0">E</span>
                                    <input type="number" step="0.001" className="flex-1 min-w-0 bg-slate-800 text-[10px] text-slate-300 border border-slate-700 rounded px-1 py-0.5 outline-none" value={node.params.xmax || ''} onChange={(e) => setNodes && setNodes(prev => prev.map(n => n.id === layer.id ? { ...n, params: { ...n.params, xmax: parseFloat(e.target.value) } } : n))} />
                                </div>
                                <div className="flex items-center space-x-1">
                                    <span className="text-[9px] text-slate-400 w-2 shrink-0">N</span>
                                    <input type="number" step="0.001" className="flex-1 min-w-0 bg-slate-800 text-[10px] text-slate-300 border border-slate-700 rounded px-1 py-0.5 outline-none" value={node.params.ymax || ''} onChange={(e) => setNodes && setNodes(prev => prev.map(n => n.id === layer.id ? { ...n, params: { ...n.params, ymax: parseFloat(e.target.value) } } : n))} />
                                </div>
                            </div>
                        </div>
                    );
                } else if (node && (node.toolId === 'load_vector' || node.toolId === 'core_fishnet' || node.toolId.startsWith('wfs_') || node.toolId === 'core_input_vector' || node.params?.file_path?.endsWith('.shp') || node.params?.file_path?.endsWith('.geojson'))) {
                    return (
                        <div className="flex flex-col mt-2 pt-2 border-t border-slate-700/50 space-y-2">
                            <button 
                                onClick={() => {
                                    let bbox = null;
                                    if (selectedFeatures && selectedFeatures.length > 0) {
                                        let xmin = 180, ymin = 90, xmax = -180, ymax = -90;
                                        selectedFeatures.forEach(sf => {
                                            const coords = sf.feature?.geometry?.coordinates;
                                            if (!coords) return;
                                            const getBounds = (arr) => {
                                                if (typeof arr[0] === 'number') {
                                                    xmin = Math.min(xmin, arr[0]);
                                                    ymin = Math.min(ymin, arr[1]);
                                                    xmax = Math.max(xmax, arr[0]);
                                                    ymax = Math.max(ymax, arr[1]);
                                                } else {
                                                    arr.forEach(getBounds);
                                                }
                                            };
                                            getBounds(coords);
                                        });
                                        if (xmin === xmax) { xmin -= 0.0001; xmax += 0.0001; }
                                        if (ymin === ymax) { ymin -= 0.0001; ymax += 0.0001; }
                                        if (xmin < 180) {
                                            bbox = `${xmin},${ymin},${xmax},${ymax}`;
                                        }
                                    }
                                    window.dispatchEvent(new CustomEvent('magpi-render-fishnet', { detail: { bbox: bbox, sourceLayerId: node.id } }));
                                }}
                                className="flex items-center justify-center text-[10px] w-full py-1.5 bg-cyan-600 hover:bg-cyan-500 rounded font-bold text-white uppercase tracking-wider shadow transition-colors"
                            >
                                <Layers size={12} className="mr-2" /> Render Map Features
                            </button>
                            
                            <button
                                onClick={() => {
                                    window.dispatchEvent(new CustomEvent('magpi-open-fishnet-modal', { detail: { nodeId: node.id } }));
                                }}
                                className="flex items-center justify-center text-[10px] w-full py-1.5 bg-purple-600 hover:bg-purple-500 rounded font-bold text-white uppercase tracking-wider shadow transition-colors"
                            >
                                <Grid size={12} className="mr-2" /> Generate Fishnet
                            </button>
                            
                            <div className="flex items-center space-x-2">
                                <input
                                    type="text"
                                    placeholder="Label Field"
                                    value={layer.labelField || ''}
                                    onChange={(e) => {
                                        if (setMapLayers) {
                                            setMapLayers(prev => prev.map(l => l.id === layer.id ? { ...l, labelField: e.target.value } : l));
                                        }
                                    }}
                                    className="flex-1 min-w-0 bg-slate-800 text-[10px] text-slate-300 border border-slate-700 rounded px-2 py-1.5 outline-none focus:border-cyan-500 placeholder-slate-500 font-mono"
                                />
                                <button
                                    onClick={() => {
                                        if (setMapLayers) {
                                            setMapLayers(prev => prev.map(l => l.id === layer.id ? { ...l, showLabels: !l.showLabels } : l));
                                        }
                                    }}
                                    className={`flex items-center justify-center text-[10px] px-3 py-1.5 rounded font-bold uppercase tracking-wider shadow transition-colors shrink-0 ${layer.showLabels ? 'bg-cyan-600 hover:bg-cyan-500 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}
                                >
                                    <Type size={12} className="mr-2" /> {layer.showLabels ? "Hide Labels" : "Show Labels"}
                                </button>
                            </div>
                        </div>
                    );
                }

                return (
                    <div className="flex items-center space-x-2 mt-2 pt-2 border-t border-slate-700/50">
                        {layer.name.includes('.tif') || layer.name.includes('Raster') || layer.name.includes('Extract') ? (
                            <>
                                <span className="text-[9px] text-slate-500 uppercase tracking-widest w-12 shrink-0">Colormap</span>
                                <select 
                                    className="flex-1 bg-slate-800 text-[10px] text-slate-300 border border-slate-700 rounded px-1 py-0.5 outline-none"
                                    value={layer.cmap || 'viridis'}
                                    onChange={(e) => {
                                        if (setMapLayers) {
                                            setMapLayers(prev => prev.map(l => l.id === layer.id ? { ...l, cmap: e.target.value } : l));
                                        }
                                    }}
                                >
                                    <option value="viridis">Viridis</option>
                                    <option value="plasma">Plasma</option>
                                    <option value="inferno">Inferno</option>
                                    <option value="magma">Magma</option>
                                    <option value="cividis">Cividis</option>
                                    <option value="gray">Gray</option>
                                    <option value="terrain">Terrain</option>
                                </select>
                            </>
                        ) : (
                              <>
                                  <span className="text-[9px] text-slate-500 uppercase tracking-widest w-12 shrink-0">Color</span>
                                  <DebouncedColorPicker 
                                      color={layer.vectorColor}
                                      onChange={(newColor) => {
                                          if (setMapLayers) {
                                              setMapLayers(prev => prev.map(l => l.id === layer.id ? { ...l, vectorColor: newColor } : l));
                                          }
                                      }}
                                  />
                              </>
                        )}
                    </div>
                );
            })()}
        </div>
    );
}
