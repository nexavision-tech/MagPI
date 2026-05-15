import React, { useState, useEffect } from 'react';
import { X, Folder, File as FileIcon, ArrowLeft, Home, HardDrive, AlertTriangle, Loader2, CheckSquare } from 'lucide-react';

export default function FileBrowserModal({ isOpen, onClose, onSelect, initialPath }) {
  const [currentPath, setCurrentPath] = useState(initialPath || ".");
  const [parentPath, setParentPath] = useState("");
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // The API bridge to the local Python Daemon (Default port 8080)
  const API_URL = "http://localhost:8080/api/browse";

  const fetchDirectory = async (targetDir) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}?dir=${encodeURIComponent(targetDir)}`);
      if (!response.ok) {
        throw new Error("Failed to connect to MagPI Daemon on port 8080.");
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
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 sm:p-8 animate-fadeIn">
      <div className="bg-slate-800 rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.5)] w-full max-w-2xl border border-slate-600 flex flex-col overflow-hidden h-[80vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-700">
          <h3 className="font-bold text-slate-200 flex items-center tracking-wide">
            <HardDrive size={16} className="mr-2 text-emerald-500" /> NATIVE OS FILE BROWSER
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors bg-slate-800 w-7 h-7 rounded-full flex items-center justify-center hover:bg-red-500/80">
            <X size={14} />
          </button>
        </div>

        {/* Address Bar and Folder Selection */}
        <div className="bg-slate-950 px-4 py-2 flex items-center space-x-2 border-b border-slate-700">
            <button 
                onClick={() => fetchDirectory(parentPath)}
                className="p-1.5 rounded hover:bg-slate-700 text-slate-300 transition-colors"
                title="Go Up One Level"
            >
                <ArrowLeft size={16} />
            </button>
            <button 
                onClick={() => fetchDirectory("~")}
                className="p-1.5 rounded hover:bg-slate-700 text-slate-300 transition-colors"
                title="Go to Home Directory"
            >
                <Home size={16} />
            </button>
            <div className="flex-1 bg-slate-800 px-3 py-1.5 rounded border border-slate-700 font-mono text-xs text-emerald-400 truncate shadow-inner">
                {currentPath}
            </div>
            
            {/* NEW BUTTON: Select current folder for output parameters */}
            <button 
                onClick={() => {
                    onSelect(currentPath);
                    onClose();
                }}
                className="ml-2 bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded text-xs font-bold flex items-center shadow-md transition-colors"
                title="Use this folder as output destination"
            >
                <CheckSquare size={14} className="mr-2" /> Select this Folder
            </button>
        </div>
        
        {/* File and Folder List */}
        <div className="flex-1 overflow-y-auto bg-[#0d1117] p-2">
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
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {/* Render Folders */}
                    {folders.map(folder => (
                        <div 
                            key={folder} 
                            onClick={() => fetchDirectory(`${currentPath}/${folder}`)}
                            className="flex items-center p-2 rounded cursor-pointer hover:bg-slate-800 border border-transparent hover:border-slate-600 transition-colors group"
                        >
                            <Folder size={18} className="text-blue-400 mr-3 group-hover:scale-110 transition-transform" />
                            <span className="text-sm text-slate-300 truncate font-medium">{folder}</span>
                        </div>
                    ))}

                    {/* Render Files */}
                    {files.map(file => {
                        const isGIS = file.endsWith('.tif') || file.endsWith('.shp') || file.endsWith('.geojson') || file.endsWith('.gdb');
                        return (
                        <div 
                            key={file} 
                            onClick={() => {
                                onSelect(`${currentPath}/${file}`);
                                onClose();
                            }}
                            className="flex items-center p-2 rounded cursor-pointer hover:bg-emerald-900/30 border border-transparent hover:border-emerald-500/50 transition-colors group"
                        >
                            <FileIcon size={18} className={`${isGIS ? 'text-emerald-400' : 'text-slate-500'} mr-3 group-hover:scale-110 transition-transform`} />
                            <span className={`text-sm truncate font-mono ${isGIS ? 'text-emerald-200' : 'text-slate-400'}`}>{file}</span>
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