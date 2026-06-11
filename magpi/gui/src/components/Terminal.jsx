import React, { useRef, useEffect, useState } from 'react';
import { Terminal as TermIcon, ChevronDown, Loader2, Copy, Check, Table, AlertTriangle, ChevronRight, ChevronLeft } from 'lucide-react';

export default function Terminal({ showTerminal, setShowTerminal, logs, isProcessing, selectedNode }) {
  const bottomRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState('logs'); // 'logs' or 'data_studio'
  
  // Data Studio State
  const [tableData, setTableData] = useState(null);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [dataError, setDataError] = useState(null);
  const [page, setPage] = useState(0);
  const limit = 50;

  // DB Studio State
  const [dbConnections, setDbConnections] = useState([]);
  const [selectedDb, setSelectedDb] = useState(null);
  const [dbTables, setDbTables] = useState(null);
  const [isLoadingDb, setIsLoadingDb] = useState(false);
  const [dbError, setDbError] = useState(null);

  useEffect(() => {
    if (activeTab === 'logs') {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, showTerminal, activeTab]);

  useEffect(() => {
    const handleOpenDataStudio = () => setActiveTab('data_studio');
    window.addEventListener('magpi-open-data-studio', handleOpenDataStudio);
    return () => window.removeEventListener('magpi-open-data-studio', handleOpenDataStudio);
  }, []);

  // Fetch DB connections on tab open
  useEffect(() => {
      if (activeTab === 'db_studio') {
          fetch(`http://${window.location.hostname}:${window.MAGPI_PORT || '8282'}/api/db_connections`)
              .then(r => r.json())
              .then(data => setDbConnections(data.connections || []))
              .catch(e => setDbError("Failed to load connections."));
      }
  }, [activeTab]);

  // Fetch tables on DB select
  useEffect(() => {
      if (selectedDb) {
          setIsLoadingDb(true);
          setDbError(null);
          fetch(`http://${window.location.hostname}:${window.MAGPI_PORT || '8282'}/api/db_tables?connection=${encodeURIComponent(selectedDb)}`)
              .then(r => r.json())
              .then(data => {
                  if (data.error) setDbError(data.error);
                  else setDbTables(data.tables || []);
              })
              .catch(e => setDbError("Failed to fetch tables."))
              .finally(() => setIsLoadingDb(false));
      } else {
          setDbTables(null);
      }
  }, [selectedDb]);

  // Refetch table data when node changes or page changes
  useEffect(() => {
    if (activeTab !== 'data_studio') return;
    
    if (!selectedNode) {
        setTableData(null);
        setDataError("No node selected. Select a Vector node to view its attributes.");
        return;
    }
    
    // Check if it's a vector node that has a path output
    let path = null;
    if (selectedNode.params?.file_path) path = selectedNode.params.file_path; // Load Vector
    // If it's an appended or processed node, we might not have the path instantly unless it's in the node state...
    // But for now, let's look at params.file_path or outputs (we don't pass the real output path yet)
    
    if (!path) {
        setTableData(null);
        setDataError("Selected node does not have a static vector file path yet. (Try 'Input Vector')");
        return;
    }

    const fetchData = async () => {
        setIsLoadingData(true);
        setDataError(null);
        try {
            const res = await fetch(`http://${window.location.hostname}:${window.MAGPI_PORT || '8282'}/api/vector_data?file=${encodeURIComponent(path)}&limit=${limit}&offset=${page * limit}`);
            const data = await res.json();
            if (res.ok) {
                setTableData(data);
            } else {
                setDataError(data.error || "Failed to fetch table data");
            }
        } catch (err) {
            setDataError(err.message);
        } finally {
            setIsLoadingData(false);
        }
    };
    
    fetchData();
  }, [selectedNode, activeTab, page]);

  const handleCopy = () => {
    const text = logs.map(l => `[${l.type.toUpperCase()}] ${l.msg}`).join('\n');
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text);
    } else {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        try { document.execCommand("copy"); } catch (err) { console.error("Copy failed", err); }
        textArea.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!showTerminal) return null;

  return (
    <div className="h-72 bg-[#0a0a0a] border-t border-slate-700 flex flex-col font-mono text-xs shadow-2xl relative z-50">
      
      {/* HEADER WITH TABS */}
      <div className="flex items-center justify-between px-4 bg-slate-900 border-b border-slate-800">
        <div className="flex">
            <button 
                onClick={() => setActiveTab('logs')}
                className={`flex items-center px-4 py-2 font-bold tracking-widest text-[10px] uppercase border-b-2 transition-colors ${activeTab === 'logs' ? 'border-emerald-500 text-slate-200 bg-slate-800/50' : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'}`}
            >
                <TermIcon size={14} className={`mr-2 ${activeTab === 'logs' ? 'text-emerald-500' : 'text-slate-500'}`} /> EXECUTION LOG
            </button>
            <button 
                onClick={() => setActiveTab('data_studio')}
                className={`flex items-center px-4 py-2 font-bold tracking-widest text-[10px] uppercase border-b-2 transition-colors ${activeTab === 'data_studio' ? 'border-purple-500 text-slate-200 bg-slate-800/50' : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'}`}
            >
                <Table size={14} className={`mr-2 ${activeTab === 'data_studio' ? 'text-purple-500' : 'text-slate-500'}`} /> DATA STUDIO (BETA)
            </button>
            <button 
                onClick={() => setActiveTab('db_studio')}
                className={`flex items-center px-4 py-2 font-bold tracking-widest text-[10px] uppercase border-b-2 transition-colors ${activeTab === 'db_studio' ? 'border-amber-500 text-slate-200 bg-slate-800/50' : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'}`}
            >
                <Table size={14} className={`mr-2 ${activeTab === 'db_studio' ? 'text-amber-500' : 'text-slate-500'}`} /> DB STUDIO
            </button>
        </div>
        
        <div className="flex space-x-4 items-center h-full py-2">
          {activeTab === 'logs' && (
              <button onClick={handleCopy} className="text-slate-500 hover:text-cyan-400 transition-colors flex items-center" title="Copy Logs to Clipboard">
                {copied ? <span className="flex items-center text-emerald-500"><Check size={14} className="mr-1"/> Copied</span> : <span className="flex items-center"><Copy size={14} className="mr-1"/> Copy Logs</span>}
              </button>
          )}
          <div className="w-px h-3 bg-slate-700"></div>
          <button onClick={() => setShowTerminal(false)} className="text-slate-500 hover:text-red-400 transition-colors" title="Pin Down (Minimize)">
            <ChevronDown size={18} />
          </button>
        </div>
      </div>
      
      {/* TAB CONTENT: LOGS */}
      {activeTab === 'logs' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-1 custom-scrollbar select-text">
            {logs.map((log, i) => {
              let color = 'text-slate-300';
              if (log.type === 'error') color = 'text-red-400 font-bold';
              else if (log.type === 'success') color = 'text-emerald-400 font-bold';
              else if (log.type === 'warn') color = 'text-yellow-400';
              
              return (
                <div key={i} className="flex hover:bg-[#1a1a1a] px-1 py-[1px] transition-colors">
                  <span className="text-slate-600 mr-3 shrink-0 select-none">[{new Date().toLocaleTimeString()}] MagPI 🧭</span>
                  <span className={color}>
                    {log.type === 'error' && '[ERROR]: '}
                    {log.type === 'success' && '[SUCCESS]: '}
                    {log.type === 'info' && '[INFO]: '}
                    {log.msg}
                  </span>
                </div>
              );
            })}
            {isProcessing && (
              <div className="flex items-center text-cyan-400 mt-2 select-none">
                <Loader2 size={12} className="animate-spin mr-2" /> Processing matrix payload...
              </div>
            )}
            <div ref={bottomRef} />
          </div>
      )}

      {/* TAB CONTENT: DATA STUDIO */}
      {activeTab === 'data_studio' && (
          <div className="flex-1 flex flex-col overflow-hidden bg-[#0a0a0a]">
              {dataError ? (
                  <div className="flex-1 flex items-center justify-center text-slate-500">
                      <AlertTriangle size={16} className="mr-2 text-yellow-500" /> {dataError}
                  </div>
              ) : isLoadingData ? (
                  <div className="flex-1 flex items-center justify-center text-cyan-400">
                      <Loader2 size={16} className="animate-spin mr-2" /> Loading attribute table...
                  </div>
              ) : tableData && tableData.columns ? (
                  <>
                      {/* TABLE WRAPPER */}
                      <div className="flex-1 overflow-auto custom-scrollbar">
                          <table className="w-full text-left border-collapse whitespace-nowrap">
                              <thead className="sticky top-0 bg-slate-900 border-b border-slate-700 shadow-sm z-10">
                                  <tr>
                                      <th className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-r border-slate-700 bg-slate-800">#</th>
                                      {tableData.columns.map((col, idx) => (
                                          <th key={idx} className="px-4 py-2 text-[10px] font-bold text-emerald-400 uppercase tracking-widest border-r border-slate-700">
                                              {col}
                                          </th>
                                      ))}
                                  </tr>
                              </thead>
                              <tbody>
                                  {tableData.rows.map((row, rIdx) => (
                                      <tr key={rIdx} className="border-b border-slate-800/50 hover:bg-slate-800/50 transition-colors">
                                          <td className="px-3 py-1.5 text-slate-600 border-r border-slate-800/50">{page * limit + rIdx + 1}</td>
                                          {tableData.columns.map((col, cIdx) => (
                                              <td key={cIdx} className="px-4 py-1.5 text-slate-300 border-r border-slate-800/50 truncate max-w-[300px]" title={row[col]}>
                                                  {row[col] === null ? <span className="text-slate-600 italic">null</span> : String(row[col])}
                                              </td>
                                          ))}
                                      </tr>
                                  ))}
                              </tbody>
                          </table>
                      </div>
                      
                      {/* PAGINATION FOOTER */}
                      <div className="flex-none flex items-center justify-between px-4 py-2 bg-slate-900 border-t border-slate-800 text-[10px] text-slate-400 uppercase tracking-widest">
                          <div>
                              Showing {page * limit + 1} - {page * limit + tableData.count} of Dataset
                          </div>
                          <div className="flex items-center space-x-4">
                              <button 
                                  onClick={() => setPage(p => Math.max(0, p - 1))}
                                  disabled={page === 0}
                                  className="flex items-center hover:text-white disabled:text-slate-700 disabled:cursor-not-allowed transition-colors"
                              >
                                  <ChevronLeft size={14} className="mr-1" /> Prev
                              </button>
                              <span className="text-emerald-500 font-bold">Page {page + 1}</span>
                              <button 
                                  onClick={() => setPage(p => p + 1)}
                                  disabled={tableData.count < limit}
                                  className="flex items-center hover:text-white disabled:text-slate-700 disabled:cursor-not-allowed transition-colors"
                              >
                                  Next <ChevronRight size={14} className="ml-1" />
                              </button>
                          </div>
                      </div>
                  </>
              ) : (
                  <div className="flex-1 flex items-center justify-center text-slate-500">
                      Select a node to inspect its data structure.
                  </div>
              )}
          </div>
      )}

      {/* TAB CONTENT: DB STUDIO */}
      {activeTab === 'db_studio' && (
          <div className="flex-1 flex overflow-hidden bg-[#0a0a0a]">
              {/* SIDEBAR: CONNECTIONS */}
              <div className="w-1/4 border-r border-slate-800 bg-slate-900/50 flex flex-col">
                  <div className="p-2 border-b border-slate-800 font-bold text-slate-400 text-[10px] uppercase tracking-widest bg-slate-900 sticky top-0">
                      Connections
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                      {dbConnections.length === 0 ? (
                          <div className="text-slate-600 text-center italic mt-4">No connections</div>
                      ) : (
                          dbConnections.map((c, i) => (
                              <div 
                                  key={i} 
                                  onClick={() => setSelectedDb(c.name)}
                                  className={`p-2 rounded cursor-pointer transition-colors ${selectedDb === c.name ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-slate-800/30 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-transparent'}`}
                              >
                                  <div className="font-bold flex items-center">
                                      <Table size={12} className="mr-2" />
                                      {c.name}
                                  </div>
                              </div>
                          ))
                      )}
                  </div>
              </div>
              
              {/* MAIN: TABLES */}
              <div className="flex-1 flex flex-col bg-[#0a0a0a] relative">
                  {dbError ? (
                      <div className="flex-1 flex items-center justify-center text-slate-500">
                          <AlertTriangle size={16} className="mr-2 text-red-500" /> {dbError}
                      </div>
                  ) : isLoadingDb ? (
                      <div className="flex-1 flex items-center justify-center text-amber-400">
                          <Loader2 size={16} className="animate-spin mr-2" /> Introspecting database...
                      </div>
                  ) : dbTables ? (
                      <div className="flex-1 overflow-auto custom-scrollbar p-4">
                          <div className="mb-4 text-slate-500 italic">
                              Drag any table onto the canvas to spawn a Vector Loader node.
                          </div>
                          <div className="grid grid-cols-3 gap-3">
                              {dbTables.map((t, i) => (
                                  <div 
                                      key={i} 
                                      draggable 
                                      onDragStart={(e) => {
                                          e.dataTransfer.setData('application/magpi-db-node', JSON.stringify({ connection: selectedDb, table: t.table, schema: t.schema }));
                                      }}
                                      className="p-3 bg-slate-800/40 border border-slate-700/50 rounded flex items-center cursor-grab active:cursor-grabbing hover:bg-slate-800 hover:border-amber-500/50 transition-colors"
                                  >
                                      <Table size={14} className="mr-3 text-amber-500/70" />
                                      <div>
                                          <div className="text-amber-400 font-bold text-xs truncate">{t.table}</div>
                                          <div className="text-slate-500 text-[10px]">{t.schema} • {t.type}</div>
                                      </div>
                                  </div>
                              ))}
                          </div>
                      </div>
                  ) : (
                      <div className="flex-1 flex items-center justify-center text-slate-500">
                          Select a connection to view tables.
                      </div>
                  )}
              </div>
          </div>
      )}
    </div>
  );
}