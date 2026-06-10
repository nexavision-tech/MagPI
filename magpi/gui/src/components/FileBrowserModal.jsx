import React, { useState, useEffect } from 'react';
import { X, Folder, File as FileIcon, ArrowLeft, Home, HardDrive, AlertTriangle, Loader2, CheckSquare, Save } from 'lucide-react';

export default function FileBrowserModal({ isOpen, onClose, onSelect, initialPath, isSaveMode = false, defaultSaveName = "Untitled_1" }) {
  const [currentPath, setCurrentPath] = useState(initialPath || ".");
  const [parentPath, setParentPath] = useState("");
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [saveName, setSaveName] = useState(defaultSaveName);

  // The API bridge to the local Python Daemon (Default port 8282)
  const API_URL = `http://${window.location.hostname}:8282/api/browse`;

  const fetchDirectory = async (targetDir) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}?dir=${encodeURIComponent(targetDir)}`);
      if (!response.ok) {
        throw new Error("Failed to connect to MagPI Daemon on port 8282.");
      }
      const data = await response.json();
      
      if (data.error) throw new Error(data.error);
      
      setCurrentPath(data.current_dir);
      setParentPath(data.parent_dir);
      setFolders(data.folders);
      setFiles(data.files);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchDirectory(currentPath);
    }
  }, [isOpen, currentPath]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[200] flex items-center justify-center p-4 sm:p-8 animate-fadeIn">
      <div className="bg-slate-800 rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.5)] w-full max-w-4xl border border-slate-600 flex flex-col overflow-hidden h-[85vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-700 shrink-0">
          <h3 className="font-bold text-slate-200 flex items-center tracking-wide">
            <HardDrive size={16} className="mr-2 text-emerald-500" /> NATIVE OS FILE BROWSER
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors bg-slate-800 w-7 h-7 rounded-full flex items-center justify-center hover:bg-red-500/80">
            <X size={14} />
          </button>
        </div>

        {/* Address Bar and Folder Selection */}
        <div className="bg-slate-950 px-4 py-2 flex items-center space-x-2 border-b border-slate-700 shrink-0">
            <button 
                onClick={() => fetchDirectory(parentPath)}
                className="p-1.5 rounded hover:bg-slate-700 text-slate-300 transition-colors shrink-0"
                title="Go Up One Level"
            >
                <ArrowLeft size={16} />
            </button>
            <button 
                onClick={() => fetchDirectory("~")}
                className="p-1.5 rounded hover:bg-slate-700 text-slate-300 transition-colors shrink-0"
                title="Go to Home Directory"
            >
                <Home size={16} />
            </button>
            <div className="flex-1 bg-slate-800 px-3 py-1.5 rounded border border-slate-700 font-mono text-xs text-emerald-400 overflow-x-auto whitespace-nowrap shadow-inner custom-scrollbar">
                {currentPath}
            </div>
            
            {isSaveMode ? (
                <div className="flex items-center ml-2 bg-slate-800 border border-slate-600 rounded">
                    <input 
                        type="text" 
                        value={saveName} 
                        onChange={(e) => setSaveName(e.target.value)}
                        className="bg-transparent text-white px-2 py-1.5 text-xs outline-none w-32"
                        placeholder="Project name..."
                    />
                    <button 
                        onClick={() => {
                            if (!saveName) return;
                            onSelect({ dir: currentPath, name: saveName });
                            onClose();
                        }}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-r text-xs font-bold flex items-center shadow-md transition-colors shrink-0"
                    >
                        <Save size={14} className="mr-1.5" /> Save
                    </button>
                </div>
            ) : (
                <button 
                    onClick={() => {
                        onSelect(currentPath);
                        onClose();
                    }}
                    className="ml-2 bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded text-xs font-bold flex items-center shadow-md transition-colors shrink-0"
                    title="Use this folder as output destination"
                >
                    <CheckSquare size={14} className="mr-2" /> Select this Folder
                </button>
            )}
        </div>
        
        {/* File and Folder List */}
        <div className="flex-1 overflow-y-auto bg-[#0d1117] p-4">
            {loading ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500">
                    <Loader2 size={24} className="animate-spin mb-2 text-emerald-500" />
                    <span className="text-sm font-mono tracking-widest">QUERYING DAEMON...</span>
                </div>
            ) : error ? (
                <div className="h-full flex flex-col items-center justify-center text-red-400 p-8 text-center">
                    <AlertTriangle size={32} className="mb-3" />
                    <p className="font-bold mb-2">Daemon Connection Failed</p>
                    <p className="text-xs text-slate-400">Make sure the MagPI Python Daemon is running in a separate terminal:<br/><br/><code>python -c "import magpi.ui; magpi.ui.LaunchCanvas()"</code></p>
                    <p className="text-xs text-slate-500 mt-2">Error: {error}</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {/* Render Folders */}
                    {folders.map(folder => (
                        <div 
                            key={folder} 
                            onClick={() => fetchDirectory(`${currentPath}/${folder}`)}
                            title={folder}
                            className="flex items-start p-3 rounded cursor-pointer bg-slate-900/50 hover:bg-slate-800 border border-slate-700/50 hover:border-slate-600 transition-colors group"
                        >
                            <Folder size={18} className="text-blue-400 mr-3 mt-0.5 shrink-0 group-hover:scale-110 transition-transform" />
                            <span className="text-sm text-slate-300 break-all font-medium leading-snug">{folder}</span>
                        </div>
                    ))}

                    {/* Render Files */}
                    {files.map(file => {
                        const isGIS = file.endsWith('.tif') || file.endsWith('.shp') || file.endsWith('.geojson') || file.endsWith('.gdb') || file.endsWith('.h5');
                        return (
                        <div 
                            key={file} 
                            onClick={() => {
                                onSelect(`${currentPath}/${file}`);
                                onClose();
                            }}
                            title={file}
                            className="flex items-start p-3 rounded cursor-pointer bg-slate-900/30 hover:bg-emerald-900/20 border border-transparent hover:border-emerald-500/30 transition-colors group"
                        >
                            <FileIcon size={18} className={`${isGIS ? 'text-emerald-400' : 'text-slate-500'} mr-3 mt-0.5 shrink-0 group-hover:scale-110 transition-transform`} />
                            <span className={`text-sm break-all font-mono leading-snug ${isGIS ? 'text-emerald-200' : 'text-slate-400'}`}>{file}</span>
                        </div>
                    )})}

                    {/* Empty Directory Message */}
                    {folders.length === 0 && files.length === 0 && (
                         <div className="col-span-full text-center text-slate-500 py-10 text-sm">Directory is empty.</div>
                    )}
                </div>
            )}
        </div>
      </div>
    </div>
  );
}