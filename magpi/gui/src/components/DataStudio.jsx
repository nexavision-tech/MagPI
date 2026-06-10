import React, { useState, useEffect, useRef } from 'react';
import { Database, Folder, Table2, Play, Terminal, TerminalSquare, AlertCircle, RefreshCw, Plus, X, Server } from 'lucide-react';

export default function DataStudio() {
  const [databases, setDatabases] = useState([]);
  const [selectedDb, setSelectedDb] = useState(null);
  const [query, setQuery] = useState("SELECT * FROM table_name LIMIT 10;");
  const [queryResults, setQueryResults] = useState([]);
  const [columns, setColumns] = useState([]);
  const [isQuerying, setIsQuerying] = useState(false);
  const [error, setError] = useState(null);
  const [terminalLogs, setTerminalLogs] = useState([]);
  
  const [showNewConnectionModal, setShowNewConnectionModal] = useState(false);
  const [newConnName, setNewConnName] = useState("");
  const [newConnString, setNewConnString] = useState("postgresql://user:password@localhost:5432/dbname");
  
  const bottomPanelRef = useRef(null);

  const fetchDatabases = async () => {
    try {
      const res = await fetch(`http://${window.location.hostname}:${window.MAGPI_PORT || '8282'}/api/databases`);
      const data = await res.json();
      if (data.status === 'success') {
        setDatabases(data.databases);
      }
    } catch (err) {
      console.error("Failed to fetch databases", err);
    }
  };

  useEffect(() => {
    fetchDatabases();
  }, []);

  const executeQuery = async () => {
    if (!selectedDb) {
      setError("Please select a database from the Schema Explorer first.");
      return;
    }
    
    if (selectedDb.type === 'gdb') {
      setError(".gdb File Geodatabases do not support direct SQL querying yet. Support is coming soon via GeoPandas.");
      return;
    }

    setIsQuerying(true);
    setError(null);
    setTerminalLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Executing query on ${selectedDb.name}...`]);

    try {
      const res = await fetch(`http://${window.location.hostname}:${window.MAGPI_PORT || '8282'}/api/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ db_path: selectedDb.path, query: query })
      });
      const data = await res.json();
      
      if (data.status === 'success') {
        setColumns(data.columns || []);
        setQueryResults(data.results || []);
        setTerminalLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Query successful. Returned ${data.results?.length || 0} rows.`]);
      } else {
        setError(data.error);
        setTerminalLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ERROR: ${data.error}`]);
      }
    } catch (err) {
      setError(err.toString());
      setTerminalLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ERROR: ${err.toString()}`]);
    } finally {
      setIsQuerying(false);
      if (bottomPanelRef.current) {
        bottomPanelRef.current.scrollTop = bottomPanelRef.current.scrollHeight;
      }
    }
  };

  const handleAddConnection = async () => {
    if (!newConnName || !newConnString) return;
    try {
      const res = await fetch(`http://${window.location.hostname}:${window.MAGPI_PORT || '8282'}/api/db_connections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newConnName, connection_string: newConnString })
      });
      const data = await res.json();
      if (data.status === 'success') {
        setShowNewConnectionModal(false);
        setNewConnName("");
        fetchDatabases();
      } else {
        alert("Error saving connection: " + data.error);
      }
    } catch (err) {
      alert("Network Error: " + err);
    }
  };

  return (
    <div className="flex h-full w-full bg-[#1e1e1e] text-slate-300 font-sans relative">
      
      {/* NEW CONNECTION MODAL */}
      {showNewConnectionModal && (
        <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-[#252526] border border-[#444] rounded-lg shadow-2xl w-[450px] p-6 flex flex-col relative">
            <button onClick={() => setShowNewConnectionModal(false)} className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors">
              <X size={18} />
            </button>
            <h2 className="text-lg font-bold text-white mb-4 flex items-center">
              <Server size={20} className="mr-2 text-emerald-500" /> Add PostGIS Connection
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Connection Name</label>
                <input type="text" className="w-full bg-[#1e1e1e] border border-[#444] rounded p-2 text-sm text-slate-200 outline-none focus:border-emerald-500" placeholder="e.g. Gaza Master DB" value={newConnName} onChange={e => setNewConnName(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Connection String (SQLAlchemy)</label>
                <input type="text" className="w-full bg-[#1e1e1e] border border-[#444] rounded p-2 text-sm text-slate-200 outline-none focus:border-emerald-500 font-mono" placeholder="postgresql://user:password@localhost:5432/dbname" value={newConnString} onChange={e => setNewConnString(e.target.value)} />
              </div>
              <button onClick={handleAddConnection} className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 rounded text-white font-bold transition-colors shadow-lg">Save Connection</button>
            </div>
          </div>
        </div>
      )}
      
      {/* LEFT PANEL: SCHEMA EXPLORER */}
      <div className="w-64 border-r border-[#333333] flex flex-col bg-[#252526]">
        <div className="p-3 border-b border-[#333333] flex justify-between items-center bg-[#2d2d2d]">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center">
            <Database size={14} className="mr-2" />
            Schema Explorer
          </h2>
          <div className="flex space-x-1">
            <button onClick={() => setShowNewConnectionModal(true)} className="p-1 hover:bg-[#444] rounded transition-colors text-slate-400 hover:text-emerald-400" title="Add PostGIS Connection">
              <Plus size={14} />
            </button>
            <button onClick={fetchDatabases} className="p-1 hover:bg-[#444] rounded transition-colors text-slate-400 hover:text-emerald-400" title="Refresh Databases">
              <RefreshCw size={12} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {databases.length === 0 ? (
            <div className="text-xs text-slate-500 text-center mt-4">No local databases found in magpi_output/</div>
          ) : (
            databases.map((db, idx) => (
              <div key={idx} className="mb-2">
                <button 
                  onClick={() => { setSelectedDb(db); setQuery(`-- Querying ${db.name}\nSELECT * FROM ${(db.layers && db.layers[0]) || 'table_name'} LIMIT 10;`); }}
                  className={`w-full flex items-center p-2 rounded text-left text-sm transition-colors ${selectedDb?.path === db.path ? 'bg-[#37373d] text-emerald-400' : 'hover:bg-[#2a2d2e]'}`}
                >
                  <Folder size={14} className="mr-2 opacity-70 text-blue-400" />
                  <span className="truncate flex-1">{db.name}</span>
                  <span className="text-[10px] bg-[#333] px-1 rounded ml-1 text-slate-500 uppercase">{db.type}</span>
                </button>
                {selectedDb?.path === db.path && db.layers && db.layers.length > 0 && (
                  <div className="pl-6 mt-1 border-l border-[#444] ml-3 py-1 space-y-1">
                    {db.layers.map((layer, l_idx) => (
                      <div key={l_idx} className="text-xs text-slate-400 flex items-center hover:text-white cursor-pointer" onClick={() => setQuery(`SELECT * FROM ${layer} LIMIT 10;`)}>
                        <Table2 size={12} className="mr-2 text-slate-500" />
                        {layer}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* CENTER & BOTTOM PANELS */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* CENTER: IDE */}
        <div className="flex-1 flex flex-col border-b border-[#333333]">
          <div className="h-10 bg-[#2d2d2d] border-b border-[#1e1e1e] flex items-center px-4 justify-between">
            <div className="flex space-x-4">
              <div className="text-sm border-b-2 border-emerald-500 text-emerald-400 pb-2 translate-y-[9px] font-medium">SQL Editor</div>
              <div className="text-sm text-slate-500 hover:text-slate-300 cursor-not-allowed pb-2 translate-y-[9px] font-medium" title="Python Dataframes coming soon">Python (Pandas)</div>
            </div>
            <button 
              onClick={executeQuery}
              disabled={isQuerying || !selectedDb}
              className={`flex items-center text-xs font-bold px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white transition-colors ${isQuerying || !selectedDb ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Play size={12} className="mr-1.5" />
              {isQuerying ? 'Executing...' : 'Run Query'}
            </button>
          </div>
          <div className="flex-1 bg-[#1e1e1e] p-4 relative">
            {!selectedDb && (
              <div className="absolute inset-0 z-10 bg-[#1e1e1e]/80 flex items-center justify-center backdrop-blur-sm">
                <div className="bg-[#2d2d2d] p-6 rounded-xl border border-[#444] text-center shadow-2xl">
                  <Database size={48} className="mx-auto mb-4 text-emerald-500/50" />
                  <h3 className="text-lg font-bold text-white mb-2">No Database Selected</h3>
                  <p className="text-sm text-slate-400">Select a database from the Schema Explorer to begin querying.</p>
                </div>
              </div>
            )}
            <textarea 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full h-full bg-transparent text-slate-300 font-mono text-sm outline-none resize-none leading-relaxed"
              spellCheck="false"
              disabled={!selectedDb}
            />
          </div>
        </div>

        {/* BOTTOM: RESULTS & TERMINAL */}
        <div className="h-64 bg-[#1e1e1e] flex flex-col">
          <div className="h-9 bg-[#252526] flex items-center px-4 border-b border-[#333333]">
             <span className="text-xs uppercase tracking-wider font-bold flex items-center text-slate-400">
               <TerminalSquare size={14} className="mr-2" /> Results
             </span>
          </div>
          <div className="flex-1 overflow-auto relative p-0" ref={bottomPanelRef}>
            {error ? (
              <div className="p-4 text-red-400 flex items-start bg-red-900/10 h-full">
                <AlertCircle size={16} className="mr-2 mt-0.5 shrink-0" />
                <div className="font-mono text-sm">{error}</div>
              </div>
            ) : queryResults.length > 0 ? (
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-[#2d2d2d] sticky top-0 shadow-md">
                  <tr>
                    {columns.map((col, idx) => (
                      <th key={idx} className="p-2 border-b border-[#444] border-r text-slate-300 font-semibold whitespace-nowrap">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {queryResults.map((row, r_idx) => (
                    <tr key={r_idx} className="border-b border-[#333] hover:bg-[#2a2d2e] transition-colors">
                      {columns.map((col, c_idx) => (
                        <td key={c_idx} className="p-2 border-r border-[#333] text-slate-400 max-w-xs truncate" title={String(row[col])}>
                          {String(row[col])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-4 font-mono text-xs text-slate-500 space-y-1">
                <div className="text-slate-400 mb-4">MagPI Data Studio Terminal</div>
                {terminalLogs.map((log, idx) => (
                  <div key={idx} className={log.includes('ERROR') ? 'text-red-400' : 'text-slate-500'}>{log}</div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
