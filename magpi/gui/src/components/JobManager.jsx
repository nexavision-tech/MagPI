import React, { useState, useEffect } from 'react';
import { Activity, Cloud, TerminalSquare, AlertCircle, PlayCircle, CheckCircle2, Clock } from 'lucide-react';

export default function JobManager({ activeWorkspace }) {
  const [jobs, setJobs] = useState([]);

  useEffect(() => {
    let interval;
    if (activeWorkspace === 'jobs') {
      const fetchJobs = async () => {
        try {
          const res = await fetch(`http://${window.location.hostname}:8080/api/jobs`);
          if (res.ok) {
            const liveJobs = await res.json();
            setJobs(liveJobs.sort((a, b) => new Date(b.started) - new Date(a.started)));
          }
        } catch (e) {
          console.error("Failed to fetch jobs:", e);
        }
      };
      fetchJobs();
      interval = setInterval(fetchJobs, 2000);
    }
    return () => clearInterval(interval);
  }, [activeWorkspace]);

  if (activeWorkspace !== 'jobs') return null;

  return (
    <div className="w-full h-full bg-[#111827] text-slate-300 flex flex-col font-mono animate-fadeIn">
      {/* Header */}
      <div className="px-6 py-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0 shadow-md z-10">
        <div className="flex items-center space-x-3">
          <Activity className="text-rose-500" size={24} />
          <div>
            <h2 className="text-lg font-bold text-white tracking-wider">JOB ORCHESTRATION</h2>
            <p className="text-xs text-slate-500 mt-0.5">Manage Local PIDs and Remote OpenEO Cloud Tasks</p>
          </div>
        </div>
        <div className="flex space-x-4 text-xs font-bold tracking-widest text-slate-400">
          <div className="flex items-center"><Cloud size={14} className="mr-1.5 text-blue-400" /> OPENEO: {jobs.filter(j => j.target === 'OpenEO Cloud').length}</div>
          <div className="flex items-center"><TerminalSquare size={14} className="mr-1.5 text-emerald-400" /> LOCAL: {jobs.filter(j => j.target === 'Local Python').length}</div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-6xl mx-auto">
          
          <div className="grid grid-cols-1 gap-4">
            {jobs.length === 0 && (
                <div className="text-center p-10 border border-dashed border-slate-700/50 rounded-lg text-slate-500">
                    <TerminalSquare size={32} className="mx-auto mb-4 opacity-30" />
                    <p className="font-bold tracking-widest uppercase text-xs">No active or historic jobs found.</p>
                </div>
            )}
            {jobs.map(job => (
              <div key={job.id} className="bg-slate-800/50 border border-slate-700 rounded-lg p-5 flex flex-col hover:border-slate-600 transition-colors shadow-lg group relative overflow-hidden">
                
                {/* Progress Bar Background */}
                <div 
                  className={`absolute top-0 left-0 h-1 ${job.status === 'Finished' ? 'bg-emerald-500' : job.status === 'Running' ? 'bg-blue-500' : job.status === 'Failed' ? 'bg-rose-500' : 'bg-yellow-500'} transition-all duration-1000`} 
                  style={{ width: `${job.progress}%` }} 
                />

                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center">
                    {job.target === 'OpenEO Cloud' ? (
                      <div className="w-10 h-10 rounded bg-blue-900/30 flex items-center justify-center border border-blue-500/30 mr-4 shrink-0">
                        <Cloud className="text-blue-400" size={20} />
                      </div>
                    ) : job.target === 'Local Python' ? (
                      <div className="w-10 h-10 rounded bg-emerald-900/30 flex items-center justify-center border border-emerald-500/30 mr-4 shrink-0">
                        <TerminalSquare className="text-emerald-400" size={20} />
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded bg-rose-900/30 flex items-center justify-center border border-rose-500/30 mr-4 shrink-0">
                        <Activity className="text-rose-400" size={20} />
                      </div>
                    )}
                    <div>
                      <h3 className="text-white font-bold text-sm">{job.name}</h3>
                      <div className="text-xs text-slate-500 mt-1 flex items-center space-x-3">
                        <span className="flex items-center"><Clock size={12} className="mr-1" /> {job.started}</span>
                        <span>ID: {job.id}</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Status Badge */}
                  <div className={`shrink-0 px-3 py-1 rounded text-xs font-bold tracking-widest flex items-center ${job.status === 'Finished' ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-800' : job.status === 'Failed' ? 'bg-rose-900/50 text-rose-400 border border-rose-800' : job.status === 'Running' ? 'bg-blue-900/50 text-blue-400 border border-blue-800 animate-pulse' : 'bg-yellow-900/50 text-yellow-400 border border-yellow-800'}`}>
                    {job.status === 'Finished' && <CheckCircle2 size={14} className="mr-1.5" />}
                    {job.status === 'Running' && <PlayCircle size={14} className="mr-1.5" />}
                    {job.status === 'Queued' && <AlertCircle size={14} className="mr-1.5" />}
                    {job.status === 'Failed' && <AlertCircle size={14} className="mr-1.5" />}
                    {job.status.toUpperCase()} ({job.progress}%)
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 border-t border-slate-700/50 pt-4 mt-2 text-xs">
                  <div>
                    <span className="block text-slate-500 uppercase tracking-widest mb-1">Target Engine</span>
                    <span className="font-bold text-slate-300">{job.target}</span>
                  </div>
                  <div>
                    <span className="block text-slate-500 uppercase tracking-widest mb-1">Compute Time</span>
                    <span className="font-bold text-slate-300">{job.time}</span>
                  </div>
                  <div>
                    <span className="block text-slate-500 uppercase tracking-widest mb-1">Est. Cost</span>
                    <span className="font-bold text-emerald-400">{job.cost}</span>
                  </div>
                </div>
                
                {job.logs && job.logs.length > 0 && (
                    <div className="mt-4 bg-black/50 p-3 rounded font-mono text-[10px] text-slate-400 max-h-24 overflow-y-auto border border-slate-800">
                        {job.logs.map((l, i) => <div key={i}>{l}</div>)}
                    </div>
                )}

              </div>
            ))}
          </div>

          <div className="mt-8 text-center text-xs text-slate-500 font-medium p-4 border border-dashed border-slate-700 rounded-lg bg-slate-800/30">
            <Cloud size={16} className="mx-auto mb-2 opacity-50" />
            <p>MagPI Job Daemon actively listening for PID broadcasts and OpenEO Webhooks.</p>
          </div>

        </div>
      </div>
    </div>
  );
}
