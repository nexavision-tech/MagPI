import React from 'react';
import { Activity, Grid } from 'lucide-react';

export default function WorkflowWorkspace() {
  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-8 bg-slate-900 w-full h-full">
      <h2 className="text-xl font-bold text-slate-300 uppercase tracking-widest border-b border-slate-700 pb-4 mb-8 flex items-center">
          <Activity size={24} className="mr-3 text-emerald-400"/> Project Workflows
      </h2>
      
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-500 h-[60vh] bg-slate-800/30 rounded-xl border border-slate-700/50">
          <div className="w-24 h-24 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center mb-6 shadow-inner">
              <Grid size={40} className="opacity-50 text-emerald-400" />
          </div>
          <p className="text-xl font-bold text-slate-400 mb-4">Workflow Manager</p>
          <p className="text-sm max-w-lg leading-relaxed">
              This space is reserved for the GIS manager. Manage project timelines, track fishnet digitization workflows, and coordinate users across the enterprise.
          </p>
      </div>
    </div>
  );
}
