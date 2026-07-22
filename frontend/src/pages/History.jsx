import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, FileText, Download, Edit3 } from 'lucide-react';

const MOCK_HISTORY = [
  {
    id: 1,
    targetRole: 'Senior Frontend Engineer',
    companyName: 'Acme Corp',
    snippet: 'Looking for a senior frontend engineer with deep expertise in React, TypeScript, and modern state management...',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    json: {
      basics: { name: 'Harshvardhan Patil', role: 'Senior Frontend Engineer' },
      work: [],
      projects: [],
      skills: 'React, TypeScript'
    }
  },
  {
    id: 2,
    targetRole: 'Full-Stack Developer',
    companyName: 'Startup Inc',
    snippet: 'We need a versatile developer to own our Node.js microservices and build responsive React dashboards...',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
    json: {
      basics: { name: 'Harshvardhan Patil', role: 'Full-Stack Developer' },
      work: [],
      projects: [],
      skills: 'React, Node.js'
    }
  }
];

export default function History() {
  const navigate = useNavigate();
  const [history, setHistory] = useState([]);

  useEffect(() => {
    // In a real app, fetch from /api/history/:userId
    // For now, load mock data
    setHistory(MOCK_HISTORY);
  }, []);

  const handleEdit = (item) => {
    // In a real app, you might pass the ID and fetch the JSON or pass via state
    navigate('/resume-editor', { state: { resumeData: item.json } });
  };

  const handleDownload = (item) => {
    // In a real app, POST to /api/export/pdf with item.json
    console.log('Downloading PDF for ID:', item.id);
  };

  return (
    <div>
      <div className="mb-10">
        <p className="text-xs font-medium tracking-widest uppercase text-stone-400 mb-4 flex items-center gap-2">
          <Clock size={14} strokeWidth={1.5} />
          Archive
        </p>
        <h1 className="text-4xl font-bold tracking-tight text-stone-900 mb-3">
          History
        </h1>
        <p className="text-base font-normal leading-relaxed text-stone-500 max-w-[65ch]">
          Access your previously tailored resumes. Re-align them for new roles or download them directly as print-ready PDFs.
        </p>
      </div>

      <div className="grid gap-6">
        {history.map((item) => (
          <div key={item.id} className="bg-white border border-stone-200 rounded-sm p-6 flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <FileText size={18} strokeWidth={1.5} className="text-stone-400" />
                <h2 className="text-xl font-bold tracking-tight text-stone-900">
                  {item.targetRole}
                </h2>
              </div>
              <p className="text-sm font-medium text-stone-600 mb-4">
                {item.companyName}
              </p>
              
              <div className="bg-stone-50 border border-stone-100 p-4 mb-4">
                <p className="text-xs font-medium tracking-widest uppercase text-stone-400 mb-2">
                  Job Description Snippet
                </p>
                <p className="text-sm text-stone-500 italic leading-relaxed">
                  "{item.snippet}"
                </p>
              </div>

              <p className="text-xs text-stone-400">
                Created on {new Date(item.createdAt).toLocaleDateString()}
              </p>
            </div>
            
            <div className="flex flex-row md:flex-col gap-3 shrink-0">
              <button
                onClick={() => handleDownload(item)}
                className="flex items-center justify-center gap-2 border border-stone-300 hover:bg-stone-100 text-stone-800 rounded-sm text-xs uppercase tracking-wider font-medium px-4 py-2.5 transition-colors duration-300 w-full"
              >
                <Download size={14} strokeWidth={1.5} />
                Download PDF
              </button>
              <button
                onClick={() => handleEdit(item)}
                className="flex items-center justify-center gap-2 bg-stone-900 text-white hover:bg-stone-700 rounded-sm text-xs uppercase tracking-wider font-medium px-4 py-2.5 transition-colors duration-300 w-full"
              >
                <Edit3 size={14} strokeWidth={1.5} />
                Edit / Re-align
              </button>
            </div>
          </div>
        ))}

        {history.length === 0 && (
          <div className="text-center py-12 bg-white border border-stone-200 rounded-sm">
            <p className="text-sm text-stone-500">No generated resumes found.</p>
          </div>
        )}
      </div>
    </div>
  );
}
