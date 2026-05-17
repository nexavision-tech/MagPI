import React, { useRef, useEffect, useState } from 'react';
import { Terminal as TermIcon, X, Loader2, Copy, Check } from 'lucide-react';

export default function Terminal({ showTerminal, setShowTerminal, logs, isProcessing }) {
  const bottomRef = useRef(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, showTerminal]);

  // Fallback-safe clipboard copy function
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
    <div className="h-64 bg-[#0a0a0a] border-t border-slate-700 flex flex-col font-mono text-xs shadow-2xl relative z-50">
      
      {/* Terminal Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center text-slate-400 font-bold tracking-widest text-[10px]">
          <TermIcon size={14} className="mr-2 text-emerald-500" /> MAGPI EXECUTION LOG
        </div>
        <div className="flex space-x-4 items-center">
          
          {/* NEW: Copy Console Button */}
          <button 
            onClick={handleCopy} 
            className="text-slate-500 hover:text-cyan-400 transition-colors flex items-center" 
            title="Copy Logs to Clipboard"
          >
            {copied ? <span className="flex items-center text-emerald-500"><Check size={14} className="mr-1"/> Copied</span> : <span className="flex items-center"><Copy size={14} className="mr-1"/> Copy Logs</span>}
          </button>
          
          <div className="w-px h-3 bg-slate-700"></div>
          
          <button onClick={() => setShowTerminal(false)} className="text-slate-500 hover:text-red-400 transition-colors">
            <X size={14} />
          </button>
        </div>
      </div>
      
      {/* Terminal Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1 custom-scrollbar">
        {logs.map((log, i) => {
          let color = 'text-slate-300';
          if (log.type === 'error') color = 'text-red-400 font-bold';
          else if (log.type === 'success') color = 'text-emerald-400 font-bold';
          else if (log.type === 'warn') color = 'text-yellow-400';
          
          return (
            <div key={i} className="flex">
              <span className="text-slate-600 mr-3 shrink-0">[{new Date().toLocaleTimeString()}] MagPI 🧭</span>
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
          <div className="flex items-center text-cyan-400 mt-2">
            <Loader2 size={12} className="animate-spin mr-2" /> Processing matrix payload...
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}