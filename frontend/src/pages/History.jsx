import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, FileText, Download, Edit3, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const MOCK_HISTORY = [
  {
    id: 1,
    targetRole: 'Senior Frontend Engineer',
    companyName: 'Acme Corp',
    snippet: 'Looking for a senior frontend engineer with deep expertise in React, TypeScript, and modern state management...',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    json: { basics: { name: 'Harsh', role: 'Senior Frontend Engineer' } }
  },
  {
    id: 2,
    targetRole: 'Full-Stack Developer',
    companyName: 'Startup Inc',
    snippet: 'We need a versatile developer to own our Node.js microservices and build responsive React dashboards...',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
    json: { basics: { name: 'Harsh', role: 'Full-Stack Developer' } }
  }
];

export default function History() {
  const navigate = useNavigate();
  const [history, setHistory] = useState([]);

  useEffect(() => {
    setHistory(MOCK_HISTORY);
  }, []);

  return (
    <div className="max-w-3xl mx-auto">
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', bounce: 0, duration: 0.5 }}
        className="mb-10 text-center"
      >
        <div className="inline-flex items-center gap-1.5 bg-stone-200/50 text-ink-light px-3 py-1 rounded-full text-[12px] font-semibold tracking-wide uppercase mb-4">
          <Clock size={14} /> Archive
        </div>
        <h1 className="text-4xl font-semibold tracking-tight text-ink mb-3">History</h1>
        <p className="text-[17px] leading-relaxed text-ink-light max-w-[55ch] mx-auto">
          Access your previously tailored resumes. Re-align them for new roles or download them directly as print-ready PDFs.
        </p>
      </motion.div>

      <motion.div 
        className="flex flex-col gap-4"
        initial="hidden"
        animate="visible"
        variants={{
          visible: { transition: { staggerChildren: 0.1 } }
        }}
      >
        <AnimatePresence>
          {history.map((item) => (
            <motion.div 
              key={item.id}
              variants={{
                hidden: { opacity: 0, y: 20 },
                visible: { opacity: 1, y: 0, transition: { type: 'spring', bounce: 0 } }
              }}
              whileHover={{ scale: 1.01 }}
              className="apple-card p-2 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer group"
              onClick={() => navigate('/resume-editor', { state: { resumeData: item.json } })}
            >
              <div className="flex-1 p-4 flex gap-4">
                <div className="bg-stone-100 h-12 w-12 rounded-xl flex items-center justify-center text-stone-400 shrink-0">
                  <FileText size={22} />
                </div>
                <div>
                  <h2 className="text-[17px] font-semibold text-ink group-hover:text-accent transition-colors">
                    {item.targetRole}
                  </h2>
                  <p className="text-[14px] text-ink-light mb-1">{item.companyName}</p>
                  <p className="text-[13px] text-stone-400">
                    {new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
              </div>
              
              <div className="flex gap-2 p-4 md:p-0 md:pr-4">
                <button
                  onClick={(e) => { e.stopPropagation(); console.log('Download', item.id); }}
                  className="apple-btn-secondary p-2 !rounded-full flex items-center justify-center aspect-square"
                  title="Download PDF"
                >
                  <Download size={16} />
                </button>
                <button
                  className="apple-btn-secondary p-2 !rounded-full flex items-center justify-center aspect-square text-accent bg-accent/10 hover:bg-accent/20"
                  title="Edit Resume"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {history.length === 0 && (
          <div className="text-center py-16 apple-card">
            <p className="text-[15px] text-ink-light">No generated resumes found.</p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
