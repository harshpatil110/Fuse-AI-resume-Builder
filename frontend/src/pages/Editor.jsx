import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  TrendingUp,
  XCircle,
  ArrowRight,
  CheckCircle,
  Sparkles,
  User,
  Briefcase,
  Code,
  GraduationCap,
  Wrench,
  Plus,
  Trash2,
  Download,
  Loader2,
} from 'lucide-react';

// ── Mock Data ──
const MOCK_CRITIQUE = {
  overall_match_score: 62,
  summary:
    'The resume demonstrates solid frontend experience but critically lacks backend and database keywords required by the JD. Several bullet points use passive verbs that fail to demonstrate ownership or measurable impact.',
  missing_keywords: [
    'PostgreSQL',
    'Drizzle ORM',
    'Docker',
    'CI/CD',
    'Redis',
    'GraphQL',
    'Microservices',
    'Load Balancing',
  ],
  weak_verbs_found: [
    {
      original: 'Helped build the user authentication system using JWT tokens.',
      suggestion: 'Engineered a stateless JWT-based authentication system serving 12k daily active users.',
      reason: 'The JD requires candidates who demonstrate ownership of backend systems. "Helped" implies a supporting role.',
    },
    {
      original: 'Worked on improving page load performance across the platform.',
      suggestion: 'Optimized critical rendering path, reducing page load time by 40% across 15 routes.',
      reason: 'The JD emphasizes measurable impact on performance. "Worked on" is vague and lacks quantifiable results.',
    },
  ],
  irrelevant_experience: [],
};

const MOCK_RESUME_SECTIONS = [
  {
    title: 'Summary',
    content:
      'Full-stack developer with 3 years of experience in React and Node.js. Passionate about building clean, user-friendly web applications.',
  },
  {
    title: 'Experience',
    company: 'TechCorp Inc.',
    role: 'Software Engineer',
    period: 'Jan 2022 — Present',
    bullets: [
      'Helped build the user authentication system using JWT tokens.',
      'Developed and shipped 8 React components for the customer-facing dashboard.',
      'Worked on improving page load performance across the platform.',
      'Collaborated with the design team to implement a responsive layout system.',
    ],
  },
  {
    title: 'Experience',
    company: 'StartupXYZ',
    role: 'Junior Developer',
    period: 'Jun 2020 — Dec 2021',
    bullets: [
      'Built REST APIs using Express.js for the core product features.',
      'Wrote unit tests using Jest achieving 85% code coverage.',
    ],
  },
];

// ── Reusable form primitives ──
function FieldLabel({ children }) {
  return (
    <label className="text-xs font-medium tracking-widest uppercase text-stone-500 mb-1.5 block">
      {children}
    </label>
  );
}

function TextInput({ label, value, onChange, placeholder }) {
  return (
    <div>
      {label && <FieldLabel>{label}</FieldLabel>}
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-white border border-stone-200 rounded-sm px-4 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-300 transition-all duration-300"
      />
    </div>
  );
}

function TextArea({ label, value, onChange, rows = 3, placeholder }) {
  return (
    <div>
      {label && <FieldLabel>{label}</FieldLabel>}
      <textarea
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full bg-white border border-stone-200 rounded-sm px-4 py-2.5 text-sm text-stone-900 leading-relaxed placeholder:text-stone-400 focus:outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-300 resize-none transition-all duration-300"
      />
    </div>
  );
}

function SectionCard({ icon: Icon, title, children }) {
  return (
    <div className="bg-white border border-stone-200 rounded-sm p-6 mb-6">
      <div className="flex items-center gap-2.5 mb-6">
        <Icon size={18} strokeWidth={1.5} className="text-stone-500" />
        <h2 className="text-xl font-bold tracking-tight text-stone-900">{title}</h2>
      </div>
      {children}
    </div>
  );
}

// ── Interactive Form Editor (viewMode === 'form') ──
function FormEditor({ resume, setResume, onExport, isExporting }) {
  const safe = (value, fallback) => (Array.isArray(value) ? value : Array.isArray(fallback) ? fallback : []);

  const updateBasics = (field, value) => {
    setResume((prev) => ({
      ...prev,
      basics: { ...(prev.basics || {}), [field]: value },
    }));
  };

  const updateWork = (index, field, value) => {
    setResume((prev) => {
      const work = [...safe(prev.work)];
      work[index] = { ...(work[index] || {}), [field]: value };
      return { ...prev, work };
    });
  };

  const addWork = () => {
    setResume((prev) => ({
      ...prev,
      work: [
        ...safe(prev.work),
        { company: '', position: '', startDate: '', endDate: '', summary: '', bullets: [] },
      ],
    }));
  };

  const removeWork = (index) => {
    setResume((prev) => ({ ...prev, work: safe(prev.work).filter((_, i) => i !== index) }));
  };

  const updateWorkBullet = (workIndex, bulletIndex, value) => {
    setResume((prev) => {
      const work = [...safe(prev.work)];
      const bullets = [...safe(work[workIndex].bullets)];
      bullets[bulletIndex] = value;
      work[workIndex] = { ...work[workIndex], bullets };
      return { ...prev, work };
    });
  };

  const addWorkBullet = (workIndex) => {
    setResume((prev) => {
      const work = [...safe(prev.work)];
      work[workIndex] = { ...work[workIndex], bullets: [...safe(work[workIndex].bullets), ''] };
      return { ...prev, work };
    });
  };

  const removeWorkBullet = (workIndex, bulletIndex) => {
    setResume((prev) => {
      const work = [...safe(prev.work)];
      work[workIndex] = {
        ...work[workIndex],
        bullets: safe(work[workIndex].bullets).filter((_, i) => i !== bulletIndex),
      };
      return { ...prev, work };
    });
  };

  const updateProject = (index, field, value) => {
    setResume((prev) => {
      const projects = [...safe(prev.projects)];
      projects[index] = { ...(projects[index] || {}), [field]: value };
      return { ...prev, projects };
    });
  };

  const addProject = () => {
    setResume((prev) => ({
      ...prev,
      projects: [...safe(prev.projects), { name: '', description: '', url: '', technologies: [], bullets: [] }],
    }));
  };

  const removeProject = (index) => {
    setResume((prev) => ({ ...prev, projects: safe(prev.projects).filter((_, i) => i !== index) }));
  };

  const updateProjectBullet = (projectIndex, bulletIndex, value) => {
    setResume((prev) => {
      const projects = [...safe(prev.projects)];
      const bullets = [...safe(projects[projectIndex].bullets)];
      bullets[bulletIndex] = value;
      projects[projectIndex] = { ...projects[projectIndex], bullets };
      return { ...prev, projects };
    });
  };

  const addProjectBullet = (projectIndex) => {
    setResume((prev) => {
      const projects = [...safe(prev.projects)];
      projects[projectIndex] = { ...projects[projectIndex], bullets: [...safe(projects[projectIndex].bullets), ''] };
      return { ...prev, projects };
    });
  };

  const removeProjectBullet = (projectIndex, bulletIndex) => {
    setResume((prev) => {
      const projects = [...safe(prev.projects)];
      projects[projectIndex] = {
        ...projects[projectIndex],
        bullets: safe(projects[projectIndex].bullets).filter((_, i) => i !== bulletIndex),
      };
      return { ...prev, projects };
    });
  };

  const updateSkill = (index, value) => {
    setResume((prev) => {
      const skills = [...safe(prev.skills)];
      skills[index] = value;
      return { ...prev, skills };
    });
  };

  const addSkill = () => {
    setResume((prev) => ({ ...prev, skills: [...safe(prev.skills), ''] }));
  };

  const removeSkill = (index) => {
    setResume((prev) => ({ ...prev, skills: safe(prev.skills).filter((_, i) => i !== index) }));
  };

  const basics = resume.basics || {};
  const work = safe(resume.work);
  const projects = safe(resume.projects);
  const skills = safe(resume.skills);

  return (
    <div>
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-stone-200 mb-8">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium tracking-widest uppercase text-stone-400 mb-0.5">
              Resume Builder
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-stone-900">Interactive Editor</h1>
          </div>
          <button
            onClick={onExport}
            disabled={isExporting}
            className="bg-stone-900 text-white rounded-sm px-6 py-2.5 text-sm font-medium tracking-wide hover:bg-stone-700 transition-colors duration-300 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExporting ? (
              <>
                <Loader2 size={16} strokeWidth={1.5} className="animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download size={16} strokeWidth={1.5} />
                Finalize & Export
              </>
            )}
          </button>
        </div>
      </div>

      {/* Basics */}
      <SectionCard icon={User} title="Basics">
        <div className="grid md:grid-cols-2 gap-4">
          <TextInput label="Name" value={basics.name} onChange={(v) => updateBasics('name', v)} />
          <TextInput label="Role" value={basics.role} onChange={(v) => updateBasics('role', v)} />
          <TextInput label="Email" value={basics.email} onChange={(v) => updateBasics('email', v)} />
          <TextInput label="Phone" value={basics.phone} onChange={(v) => updateBasics('phone', v)} />
          <TextInput label="Location" value={basics.location} onChange={(v) => updateBasics('location', v)} />
          <TextInput label="URL" value={basics.url} onChange={(v) => updateBasics('url', v)} />
        </div>
        <div className="mt-4">
          <TextArea
            label="Summary"
            rows={4}
            value={basics.summary}
            onChange={(v) => updateBasics('summary', v)}
            placeholder="Professional summary..."
          />
        </div>
      </SectionCard>

      {/* Work Experience */}
      <SectionCard icon={Briefcase} title="Work Experience">
        {work.length === 0 && (
          <p className="text-sm text-stone-400 mb-4">No work experience added yet.</p>
        )}
        {work.map((job, i) => (
          <div key={i} className="border border-stone-200 rounded-sm p-4 mb-4">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-stone-900">
                {job.position || 'Position'} — {job.company || 'Company'}
              </p>
              <button
                onClick={() => removeWork(i)}
                className="text-stone-400 hover:text-red-600 transition-colors duration-300"
                aria-label="Remove job"
              >
                <Trash2 size={16} strokeWidth={1.5} />
              </button>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <TextInput label="Company" value={job.company} onChange={(v) => updateWork(i, 'company', v)} />
              <TextInput label="Position" value={job.position} onChange={(v) => updateWork(i, 'position', v)} />
              <TextInput label="Start Date" value={job.startDate} onChange={(v) => updateWork(i, 'startDate', v)} placeholder="Jan 2022" />
              <TextInput label="End Date" value={job.endDate} onChange={(v) => updateWork(i, 'endDate', v)} placeholder="Present" />
            </div>
            <div className="mt-4">
              <TextArea
                label="Summary"
                rows={2}
                value={job.summary}
                onChange={(v) => updateWork(i, 'summary', v)}
              />
            </div>
            <div className="mt-4">
              <FieldLabel>Bullets</FieldLabel>
              {safe(job.bullets).map((bullet, j) => (
                <div key={j} className="flex items-center gap-2 mb-2">
                  <input
                    type="text"
                    value={bullet || ''}
                    onChange={(e) => updateWorkBullet(i, j, e.target.value)}
                    className="flex-1 bg-white border border-stone-200 rounded-sm px-3 py-2 text-sm text-stone-900 focus:outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-300 transition-all duration-300"
                  />
                  <button
                    onClick={() => removeWorkBullet(i, j)}
                    className="text-stone-400 hover:text-red-600 transition-colors duration-300"
                    aria-label="Remove bullet"
                  >
                    <XCircle size={16} strokeWidth={1.5} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => addWorkBullet(i)}
                className="text-xs font-medium tracking-wide text-blue-700 hover:text-blue-900 transition-colors duration-300 flex items-center gap-1"
              >
                <Plus size={14} strokeWidth={1.5} />
                Add Bullet
              </button>
            </div>
          </div>
        ))}
        <button
          onClick={addWork}
          className="border border-dashed border-stone-300 rounded-sm w-full py-3 text-sm font-medium text-stone-500 hover:border-blue-300 hover:text-blue-700 hover:bg-blue-50 transition-colors duration-300 flex items-center justify-center gap-2"
        >
          <Plus size={16} strokeWidth={1.5} />
          Add Work Experience
        </button>
      </SectionCard>

      {/* Projects */}
      <SectionCard icon={Code} title="Projects">
        {projects.length === 0 && (
          <p className="text-sm text-stone-400 mb-4">No projects added yet.</p>
        )}
        {projects.map((project, i) => (
          <div key={i} className="border border-stone-200 rounded-sm p-4 mb-4">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-stone-900">{project.name || 'Project'}</p>
              <button
                onClick={() => removeProject(i)}
                className="text-stone-400 hover:text-red-600 transition-colors duration-300"
                aria-label="Remove project"
              >
                <Trash2 size={16} strokeWidth={1.5} />
              </button>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <TextInput label="Name" value={project.name} onChange={(v) => updateProject(i, 'name', v)} />
              <TextInput
                label="Technologies"
                value={Array.isArray(project.technologies)
                  ? project.technologies.join(', ')
                  : typeof project.technologies === 'string'
                  ? project.technologies
                  : ''}
                onChange={(v) => updateProject(i, 'technologies', v.split(',').map((t) => t.trim()).filter(Boolean))}
                placeholder="React, Node.js, PostgreSQL"
              />
              <TextInput label="URL" value={project.url} onChange={(v) => updateProject(i, 'url', v)} />
            </div>
            <div className="mt-4">
              <TextArea
                label="Description"
                rows={2}
                value={project.description}
                onChange={(v) => updateProject(i, 'description', v)}
              />
            </div>
            <div className="mt-4">
              <FieldLabel>Bullets</FieldLabel>
              {safe(project.bullets).map((bullet, j) => (
                <div key={j} className="flex items-center gap-2 mb-2">
                  <input
                    type="text"
                    value={bullet || ''}
                    onChange={(e) => updateProjectBullet(i, j, e.target.value)}
                    className="flex-1 bg-white border border-stone-200 rounded-sm px-3 py-2 text-sm text-stone-900 focus:outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-300 transition-all duration-300"
                  />
                  <button
                    onClick={() => removeProjectBullet(i, j)}
                    className="text-stone-400 hover:text-red-600 transition-colors duration-300"
                    aria-label="Remove bullet"
                  >
                    <XCircle size={16} strokeWidth={1.5} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => addProjectBullet(i)}
                className="text-xs font-medium tracking-wide text-blue-700 hover:text-blue-900 transition-colors duration-300 flex items-center gap-1"
              >
                <Plus size={14} strokeWidth={1.5} />
                Add Bullet
              </button>
            </div>
          </div>
        ))}
        <button
          onClick={addProject}
          className="border border-dashed border-stone-300 rounded-sm w-full py-3 text-sm font-medium text-stone-500 hover:border-blue-300 hover:text-blue-700 hover:bg-blue-50 transition-colors duration-300 flex items-center justify-center gap-2"
        >
          <Plus size={16} strokeWidth={1.5} />
          Add Project
        </button>
      </SectionCard>

      {/* Skills */}
      <SectionCard icon={Wrench} title="Skills">
        {skills.map((skill, i) => (
          <div key={i} className="flex items-center gap-2 mb-2">
            <input
              type="text"
              value={skill || ''}
              onChange={(e) => updateSkill(i, e.target.value)}
              className="flex-1 bg-white border border-stone-200 rounded-sm px-3 py-2 text-sm text-stone-900 focus:outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-300 transition-all duration-300"
            />
            <button
              onClick={() => removeSkill(i)}
              className="text-stone-400 hover:text-red-600 transition-colors duration-300"
              aria-label="Remove skill"
            >
              <XCircle size={16} strokeWidth={1.5} />
            </button>
          </div>
        ))}
        <button
          onClick={addSkill}
          className="text-xs font-medium tracking-wide text-blue-700 hover:text-blue-900 transition-colors duration-300 flex items-center gap-1"
        >
          <Plus size={14} strokeWidth={1.5} />
          Add Skill
        </button>
      </SectionCard>
    </div>
  );
}

// ── Component ──
export default function Editor() {
  const location = useLocation();
  const navigate = useNavigate();

  const criticData = location.state?.criticData;
  const rawData = criticData || {};

  // Backend sends parsed_resume as a dict ({ raw_text, pages, metadata, chunks }) —
  // normalize to an array of sections so the resume panel never calls .map on a non-array.
  const rawParsed = rawData.parsed_resume || rawData.parsedResume;
  const initialSections = Array.isArray(rawParsed)
    ? rawParsed
    : rawParsed && typeof rawParsed === 'object' && rawParsed.raw_text
    ? [{ title: 'Extracted Resume', content: rawParsed.raw_text }]
    : MOCK_RESUME_SECTIONS;

  const [critique] = useState(rawData.critique || MOCK_CRITIQUE);
  const [resumeSections] = useState(initialSections);

  const [viewMode, setViewMode] = useState('critique');
  const [isRewriting, setIsRewriting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [resumeData, setResumeData] = useState(null);

  const handleApproveAndGenerate = async () => {
    const parsedResume =
      criticData?.parsed_resume ||
      criticData?.parsedResume ||
      criticData?.resume ||
      location.state?.parsed_resume ||
      location.state?.parsedResume;

    const jdText =
      criticData?.jd_text ||
      criticData?.jdText ||
      criticData?.jd?.text ||
      location.state?.jd_text ||
      location.state?.jdText ||
      location.state?.jd;

    const criticFeedback =
      criticData?.critic_feedback ||
      criticData?.criticFeedback ||
      criticData?.criticData ||
      criticData;

    if (!parsedResume || !jdText) {
      console.error('Missing required fields for rewrite:', { parsedResume, jdText });
      setErrorMessage('Missing resume or job description data. Please re-upload your resume to continue.');
      return;
    }

    setIsRewriting(true);
    setErrorMessage(null);
    // The multi-agent LLM workflow (Writer + QA loop) can take minutes.
    // Give it up to 5 minutes before aborting, matching the gateway timeout.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000);
    try {
      console.log('📤 REWRITE PAYLOAD BEING SENT:', { parsedResume, jdText, criticFeedback });
      const response = await fetch('http://localhost:5000/api/rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          criticData,
          parsedResume,
          jdText,
          criticFeedback,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to rewrite resume. Please try again.');
      }

      const data = await response.json();
      const rewritten = data.rewritten_resume || data;
      setResumeData(rewritten);
      setViewMode('form');
    } catch (err) {
      const detail = err?.response?.data || err?.message || err;
      console.error('Rewrite failed:', detail);
      if (err?.name === 'AbortError') {
        setErrorMessage('The rewrite took too long and timed out. Please try again.');
      } else {
        setErrorMessage(err?.message || 'Failed to rewrite resume. Please try again.');
      }
    } finally {
      clearTimeout(timeoutId);
      setIsRewriting(false);
    }
  };

  const handleExport = async () => {
    if (!resumeData) return;
    setIsExporting(true);
    setErrorMessage(null);
    try {
      const response = await fetch('http://localhost:5000/api/export/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resumeData),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to export PDF. Please try again.');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'optimized-resume.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
      setErrorMessage(err.message || 'Failed to export PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  // ── Form view ──
  if (viewMode === 'form') {
    return (
      <div className="min-h-screen bg-[#F7F5F0]">
        {errorMessage && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-sm px-4 py-3 mb-4">
            {errorMessage}
          </div>
        )}
        <FormEditor resume={resumeData} setResume={setResumeData} onExport={handleExport} isExporting={isExporting} />
      </div>
    );
  }

  // ── Critique view ──
  if (!critique || Object.keys(critique).length === 0) {
    return (
      <div className="min-h-[60vh] bg-[#F7F5F0] flex flex-col items-center justify-center p-8">
        <div className="bg-white border border-stone-200 p-10 text-center max-w-md">
          <AlertCircle size={32} strokeWidth={1.5} className="text-stone-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold tracking-tight text-stone-900 mb-2">No Analysis Data</h2>
          <p className="text-sm text-stone-500 mb-6">No analysis data found. Please try uploading your resume and job description again.</p>
          <button onClick={() => navigate('/upload')} className="bg-stone-900 text-white rounded-sm px-6 py-2.5 text-sm font-medium tracking-wide hover:bg-stone-700 transition-colors duration-300">
            Go to Upload
          </button>
        </div>
      </div>
    );
  }

  const weakPhrases = (critique?.weak_verbs_found || []).map((v) => v.original);
  const irrelevantCompanies = (critique?.irrelevant_experience || []).map((e) =>
    e.item?.split('(')[0]?.trim().split(' at ').pop()?.trim()
  );

  const highlightText = (text) => {
    for (const phrase of weakPhrases) {
      if (text === phrase) {
        return (
          <span className="bg-blue-50 border-b-2 border-blue-200 text-stone-900 px-0.5">
            {text}
          </span>
        );
      }
    }
    return text;
  };

  const isIrrelevantSection = (section) => {
    if (!section.company) return false;
    return irrelevantCompanies.some((c) => c && section.company.includes(c));
  };

  const scoreColor =
    (critique?.overall_match_score || 0) >= 80
      ? 'text-green-700'
      : (critique?.overall_match_score || 0) >= 60
      ? 'text-amber-700'
      : 'text-red-700';

  return (
    <div>
      {errorMessage && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-sm px-4 py-3 mb-6 flex items-center justify-between">
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="text-red-400 hover:text-red-700 transition-colors duration-300" aria-label="Dismiss error">
            <XCircle size={16} strokeWidth={1.5} />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="mb-10">
        <p className="text-xs font-medium tracking-widest uppercase text-stone-400 mb-4">
          AI Analysis
        </p>
        <h1 className="text-4xl font-bold tracking-tight text-stone-900 mb-3">
          Resume Critique
        </h1>
        <p className="text-base font-normal leading-relaxed text-stone-500 max-w-[65ch]">
          The Critic Agent has analyzed your resume against the target job description. Review the
          highlighted issues below, then approve to generate your optimized resume.
        </p>
      </div>

      {/* Score Bar */}
      <div className="bg-white border border-stone-200 p-6 mb-8 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium tracking-widest uppercase text-stone-500 mb-1">
            JD Alignment Score
          </p>
          <p className={`text-3xl font-bold tracking-tight ${scoreColor}`}>
            {critique?.overall_match_score || 0}
            <span className="text-lg text-stone-400 font-normal">/100</span>
          </p>
        </div>
        <div className="max-w-md">
          <p className="text-sm text-stone-500 leading-relaxed">{critique?.summary || ''}</p>
        </div>
      </div>

      {/* Split Screen */}
      <div className="grid lg:grid-cols-5 gap-0 border border-stone-200 mb-10">
        {/* ── Left Panel: Resume View ── */}
        <div className="lg:col-span-3 bg-white p-8 lg:border-r border-stone-200">
          <p className="text-xs font-medium tracking-widest uppercase text-stone-500 mb-6">
            Original Resume
          </p>

          {resumeSections.map((section, i) => {
            const irrelevant = isIrrelevantSection(section);
            return (
              <div
                key={i}
                className={`mb-8 ${
                  irrelevant ? 'border-l-2 border-red-300 pl-4 opacity-60' : ''
                }`}
              >
                {section.company ? (
                  <>
                    <div className="flex items-baseline justify-between mb-1">
                      <h3 className="text-base font-semibold tracking-tight text-stone-900">
                        {section.role}
                      </h3>
                      <span className="text-xs text-stone-400">{section.period}</span>
                    </div>
                    <p className="text-sm text-stone-500 mb-3">{section.company}</p>
                    {irrelevant && (
                      <p className="text-xs text-red-500 mb-2 flex items-center gap-1">
                        <XCircle size={12} strokeWidth={1.5} />
                        Flagged as irrelevant by AI
                      </p>
                    )}
                    <ul className="space-y-2">
                      {section.bullets.map((bullet, j) => (
                        <li key={j} className="text-sm text-stone-700 leading-relaxed flex gap-2">
                          <span className="text-stone-300 mt-0.5">•</span>
                          <span>{highlightText(bullet)}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <>
                    <h3 className="text-xs font-medium tracking-widest uppercase text-stone-400 mb-2">
                      {section.title}
                    </h3>
                    <p className="text-sm text-stone-700 leading-relaxed">{section.content}</p>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Right Panel: Critic Feedback ── */}
        <div className="lg:col-span-2 bg-stone-50 p-8">
          <p className="text-xs font-medium tracking-widest uppercase text-stone-500 mb-6">
            Critic Feedback
          </p>

          {/* Missing Keywords */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <AlertCircle size={14} strokeWidth={1.5} className="text-amber-600" />
              <h3 className="text-sm font-semibold tracking-tight text-stone-900">
                Missing Keywords
              </h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {(critique?.missing_keywords || []).map((kw, i) => (
                <span
                  key={i}
                  className="border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium tracking-widest uppercase text-stone-600"
                >
                  {kw}
                </span>
              ))}
            </div>
          </div>

          {/* Weak Verbs */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={14} strokeWidth={1.5} className="text-blue-600" />
              <h3 className="text-sm font-semibold tracking-tight text-stone-900">
                Weak Verbs Found
              </h3>
            </div>
            <div className="space-y-4">
              {(critique?.weak_verbs_found || []).map((item, i) => (
                <div key={i} className="bg-white border border-stone-200 p-4">
                  <p className="text-xs text-stone-900 leading-relaxed mb-2">
                    <span className="bg-blue-50 border-b border-blue-200 px-0.5">
                      {item.original?.split(' ').slice(0, 3).join(' ')}
                    </span>
                    {' ' + (item.original?.split(' ').slice(3).join(' ') || '')}
                  </p>
                  <div className="flex items-center gap-2 mb-2">
                    <ArrowRight size={12} strokeWidth={1.5} className="text-stone-400" />
                    <p className="text-xs font-medium text-green-800">{item.suggestion}</p>
                  </div>
                  <p className="text-xs text-stone-400 leading-relaxed">{item.reason}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Irrelevant Experience */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <XCircle size={14} strokeWidth={1.5} className="text-red-500" />
              <h3 className="text-sm font-semibold tracking-tight text-stone-900">
                Irrelevant Experience
              </h3>
            </div>
            <div className="space-y-3">
              {(critique?.irrelevant_experience || []).map((item, i) => (
                <div key={i} className="bg-white border border-stone-200 p-4">
                  <p className="text-xs font-medium text-stone-900 mb-1">{item.item}</p>
                  <p className="text-xs text-stone-400 leading-relaxed">{item.reason}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Action Button */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleApproveAndGenerate}
          disabled={isRewriting}
          className="bg-stone-900 text-white rounded-sm px-6 py-3 text-sm font-medium tracking-wide hover:bg-stone-700 transition-colors duration-300 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isRewriting ? (
            <>
              <Loader2 size={16} strokeWidth={1.5} className="animate-spin" />
              Rewriting Resume...
            </>
          ) : (
            <>
              <Sparkles size={16} strokeWidth={1.5} />
              Approve & Generate Resume
            </>
          )}
        </button>
        <p className="text-xs text-stone-400">
          The Writer Agent will rewrite your resume based on this critique.
        </p>
      </div>
    </div>
  );
}
