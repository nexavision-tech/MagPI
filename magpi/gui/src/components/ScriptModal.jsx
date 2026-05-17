import React from 'react';
import { Code, X, Copy, Rocket, CheckCircle, Download } from 'lucide-react';

export default function ScriptModal({ 
  showScript, setShowScript, 
  generatedCode, processingScope, onDeploy 
}) {
  if (!showScript) return null;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedCode);
  };

  const downloadPythonScript = () => {
    const element = document.createElement("a");
    const file = new Blob([generatedCode], {type: 'text/x-python'});
    element.href = URL.createObjectURL(file);
    element.download = "magpi_pipeline.py";
    document.body.appendChild(element); // Required for Firefox
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-8 animate-fadeIn">
      <div className="bg-slate-800 rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.5)] w-full max-w-4xl border border-slate-600 flex flex-col overflow-hidden transform transition-all">
        
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-700">
          <h3 className="font-bold text-emerald-400 flex items-center tracking-wide">
            <Code size={18} className="mr-3 text-lg" /> GENERATED PIPELINE SCRIPT
          </h3>
          <button 
            onClick={() => setShowScript(false)} 
            className="text-slate-400 hover:text-white transition-colors bg-slate-800 w-8 h-8 rounded-full flex items-center justify-center hover:bg-red-500/80"
          >
            <X size={14} />
          </button>
        </div>
        
        <div className="p-6 bg-[#0d1117] flex-1 relative group">
          <pre className="text-[13px] font-mono text-emerald-400/90 overflow-auto h-[400px] whitespace-pre-wrap selection:bg-emerald-900 selection:text-white leading-relaxed">
            {generatedCode}
          </pre>
          
          <div className="absolute top-4 right-4 flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button 
              onClick={downloadPythonScript}
              className="bg-slate-800 hover:bg-slate-700 text-emerald-400 px-3 py-1.5 rounded-md text-xs font-bold border border-emerald-900 shadow-md flex items-center transition-colors" 
            >
              <Download size={14} className="mr-2" /> Download .py
            </button>
            <button 
              onClick={copyToClipboard}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-md text-xs font-bold border border-slate-600 shadow-md flex items-center transition-colors" 
            >
              <Copy size={12} className="mr-2" /> Copy
            </button>
          </div>
        </div>
        
        <div className="p-4 bg-slate-900 border-t border-slate-700 flex justify-between items-center">
          <span className="text-xs text-slate-500 font-mono flex items-center">
            <CheckCircle size={14} className="text-emerald-600 mr-2" /> Python 3.8+ Compatible
          </span>
          <div className="flex space-x-3">
            <button onClick={() => setShowScript(false)} className="px-5 py-2.5 rounded-md text-sm font-bold text-slate-300 hover:bg-slate-700 hover:text-white border border-transparent hover:border-slate-600 transition-all">
              Close
            </button>
            <button onClick={onDeploy} className="px-5 py-2.5 rounded-md text-sm bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg flex items-center transition-all hover:scale-105 active:scale-95">
              <Rocket size={14} className="mr-2" /> Deploy to {processingScope}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}