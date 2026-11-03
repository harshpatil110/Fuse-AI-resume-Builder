import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { GitBranch, Check, ExternalLink, Settings as SettingsIcon } from 'lucide-react';
import { motion } from 'framer-motion';

const MOCK_REPOS = [
  { id: 1, name: 'fuse-career-app', lang: 'JavaScript', desc: 'B2C career platform with React & Node', url: '#' },
  { id: 2, name: 'distributed-cache', lang: 'Go', desc: 'High-performance Redis cache', url: '#' },
  { id: 3, name: 'ml-pipeline-toolkit', lang: 'Python', desc: 'AWS ML Pipeline', url: '#' },
];

export default function Settings() {
  const [isConnected, setIsConnected] = useState(false);
  const [selectedRepos, setSelectedRepos] = useState(new Set());
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get('github_connected') === 'true') {
      setIsConnected(true);
      searchParams.delete('github_connected');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const toggleRepo = (id) => {
    setSelectedRepos(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="max-w-2xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-10 text-center">
        <div className="inline-flex items-center gap-1.5 bg-stone-200/50 text-ink-light px-3 py-1 rounded-full text-[12px] font-semibold tracking-wide uppercase mb-4">
          <SettingsIcon size={14} /> Configuration
        </div>
        <h1 className="text-4xl font-semibold tracking-tight text-ink mb-3">Settings</h1>
        <p className="text-[17px] text-ink-light leading-relaxed max-w-[55ch] mx-auto">
          Manage integrations and profile defaults for the AI engine.
        </p>
      </motion.div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}
        className="apple-card overflow-hidden"
      >
        <div className="p-6 border-b border-stone-100 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center text-stone-900">
            <GitBranch size={20} />
          </div>
          <div>
            <h2 className="text-[17px] font-semibold text-ink">GitHub Integration</h2>
            <p className="text-[13px] text-ink-light">Sync repositories to enrich your resume</p>
          </div>
        </div>

        <div className="p-6 bg-stone-50/50">
          {!isConnected ? (
            <div className="text-center py-6">
              <p className="text-[15px] text-ink-light mb-6 max-w-md mx-auto">
                Connect your account to allow the AI to weave relevant projects into your tailored resume.
              </p>
              <button 
                onClick={() => setIsConnected(true)} 
                className="apple-btn bg-stone-900 hover:bg-stone-800"
              >
                Connect GitHub Profile
              </button>
            </div>
          ) : (
            <div>
              <div className="flex justify-between items-center mb-6 bg-white p-4 rounded-xl border border-stone-100 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                  <span className="text-[15px] text-ink">Connected as <strong>harsh-dev</strong></span>
                </div>
                <button onClick={() => setIsConnected(false)} className="text-[13px] text-stone-400 hover:text-red-500 font-medium transition-colors">
                  Disconnect
                </button>
              </div>

              <p className="text-[13px] font-semibold tracking-wide uppercase text-ink-light mb-3 ml-1">
                Select Repositories
              </p>
              
              <div className="flex flex-col gap-3">
                {MOCK_REPOS.map(repo => {
                  const isSelected = selectedRepos.has(repo.id);
                  return (
                    <motion.div
                      key={repo.id}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={() => toggleRepo(repo.id)}
                      className={`apple-card p-4 flex items-center justify-between cursor-pointer transition-colors ${
                        isSelected ? 'border-accent bg-blue-50/30' : 'hover:border-stone-300'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-6 h-6 rounded-full border flex items-center justify-center transition-colors ${
                          isSelected ? 'bg-accent border-accent text-white' : 'border-stone-300 text-transparent'
                        }`}>
                          <Check size={14} strokeWidth={3} />
                        </div>
                        <div>
                          <p className={`text-[15px] font-semibold ${isSelected ? 'text-accent' : 'text-ink'}`}>{repo.name}</p>
                          <p className="text-[13px] text-ink-light">{repo.desc}</p>
                        </div>
                      </div>
                      <span className="text-[12px] font-medium px-2.5 py-1 bg-stone-100 text-stone-500 rounded-md">
                        {repo.lang}
                      </span>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
