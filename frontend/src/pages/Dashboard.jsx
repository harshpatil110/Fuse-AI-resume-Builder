import React from 'react';
import { motion } from 'framer-motion';
import { FileText, GitBranch, BarChart3, ChevronRight } from 'lucide-react';

const STATS = [
  { label: 'Resumes Processed', value: '12', icon: FileText, color: 'text-blue-500', bg: 'bg-blue-50' },
  { label: 'GitHub Repos Synced', value: '4', icon: GitBranch, color: 'text-purple-500', bg: 'bg-purple-50' },
  { label: 'Avg Alignment Score', value: '92%', icon: BarChart3, color: 'text-green-500', bg: 'bg-green-50' },
];

export default function Dashboard() {
  return (
    <div className="max-w-3xl">
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', bounce: 0, duration: 0.5 }}
      >
        <p className="text-[13px] font-semibold tracking-wide uppercase text-ink-light mb-2">Overview</p>
        <h1 className="text-4xl font-semibold tracking-tight text-ink mb-4">Dashboard</h1>
        <p className="text-[17px] leading-relaxed text-ink-light max-w-[55ch]">
          Your career alignment workspace. Upload a resume and job description to begin optimizing your professional narrative.
        </p>
      </motion.div>

      <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-5">
        {STATS.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.5, delay: i * 0.1 }}
            whileHover={{ y: -4, scale: 1.02 }}
            className="apple-card p-6 cursor-default"
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-4 ${stat.bg}`}>
              <stat.icon size={20} className={stat.color} />
            </div>
            <p className="text-[13px] font-medium text-ink-light mb-1">{stat.label}</p>
            <p className="text-3xl font-semibold tracking-tight text-ink">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', bounce: 0, duration: 0.6, delay: 0.3 }}
        className="mt-10 apple-card p-1"
      >
        <div className="px-6 py-5 border-b border-stone-100 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-ink">Recent Activity</h2>
          <button className="text-[13px] text-accent hover:text-accent-hover font-medium flex items-center gap-1 transition-colors">
            View All <ChevronRight size={14} />
          </button>
        </div>
        <div className="p-8 text-center text-ink-light text-[15px]">
          No recent activity to show.
        </div>
      </motion.div>
    </div>
  );
}
