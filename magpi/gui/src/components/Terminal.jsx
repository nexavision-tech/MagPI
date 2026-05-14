import React, { useEffect, useRef } from 'react';
import { Terminal as TerminalIcon, CheckCircle, X, Loader2 } from 'lucide-react';

export default function Terminal({ showTerminal, setShowTerminal, logs = [], isProcessing = false }) {
  const terminalEndRef = useRef(null);

  // Auto-scroll to the bottom when new logs arrive
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, showTerminal]);

  return (
    <div className={`bg-black border-t-2 border-slate-700 transition-all duration-500 flex flex-col ${showTerminal ? 'h-[30vh]' : 'h-0 border-transparent opacity-0'}`}>
      
      {/* Terminal Header */}
      <div className="bg-slate-900 px-4 py-2 border-b border-slate-800 flex justify-between items-center text-xs font-bold text-slate-400 tracking-wider">
        <div className="flex items-center">
          <TerminalIcon size={14} className="mr-2 text-emerald-500" /> MAGPI EXECUTION LOG
        </div>
        <div className="flex items-center space-x-4">
          {isProcessing ? (
            <span className="text-yellow-500 flex items-center">
              <Loader2 size={12} className="animate-spin mr-2" /> Processing...
            </span>
          ) : (
            <span className="text-emerald-500 flex items-center">
              <CheckCircle size={12} className="mr-2" /> Ready
            </span>
          )}
          <button onClick={() => setShowTerminal(false)} className="hover:text-white transition-colors">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Terminal Output Body */}
      <div className="flex-1 p-4 font-mono text-[13px] overflow-y-auto" style={{fontFamily: "'Courier New', Courier, monospace"}}>
        {logs.length === 0 && !isProcessing && (
           <div className="text-slate-600 italic">Awaiting pipeline deployment...</div>
        )}
        
        {logs.map((log, i) => (
          <div key={i} className="mb-1">
            <span className="text-slate-500 mr-3">[{new Date().toLocaleTimeString()}]</span>
            {log.type === 'info' && <span className="text-blue-400">MagPI 🧭 [INFO]: </span>}
            {log.type === 'success' && <span className="text-emerald-400">MagPI 🧭 [SUCCESS]: </span>}
            {log.type === 'error' && <span className="text-red-400">MagPI 🧭 [ERROR]: </span>}
            <span className={log.type === 'success' ? 'text-emerald-400 font-bold' : 'text-slate-300'}>
              {log.msg}
            </span>
          </div>
        ))}
        
        {isProcessing && (
          <div className="text-slate-500 mt-2 flex items-center">
            <Loader2 size={14} className="animate-spin mr-2" /> ...
          </div>
        )}
        <div ref={terminalEndRef}></div>
      </div>
      
    </div>
  );
}