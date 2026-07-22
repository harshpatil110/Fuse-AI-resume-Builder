import React from 'react';

export default function Dashboard() {
  return (
    <div>
      <p className="text-xs font-medium tracking-widest uppercase text-stone-400 mb-4">Overview</p>
      <h1 className="text-4xl font-bold tracking-tight text-stone-900 mb-3">Dashboard</h1>
      <p className="text-base font-normal leading-relaxed text-stone-500 max-w-[65ch]">
        Your career alignment workspace. Upload a resume and job description to begin optimizing your professional narrative.
      </p>

      <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border border-stone-200 p-6">
          <p className="text-xs font-medium tracking-widest uppercase text-stone-400 mb-2">Resumes Processed</p>
          <p className="text-3xl font-bold tracking-tight text-stone-900">0</p>
        </div>
        <div className="bg-white border border-stone-200 p-6">
          <p className="text-xs font-medium tracking-widest uppercase text-stone-400 mb-2">GitHub Repos Synced</p>
          <p className="text-3xl font-bold tracking-tight text-stone-900">0</p>
        </div>
        <div className="bg-white border border-stone-200 p-6">
          <p className="text-xs font-medium tracking-widest uppercase text-stone-400 mb-2">Alignment Score</p>
          <p className="text-3xl font-bold tracking-tight text-stone-900">—</p>
        </div>
      </div>
    </div>
  );
}
