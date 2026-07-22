import React, { useState } from 'react';
import {
  Briefcase,
  Code,
  GraduationCap,
  Save,
  RefreshCw,
  Plus,
  Trash2,
  User,
  Wrench,
  Download,
} from 'lucide-react';

const initialResumeData = {
  basics: {
    name: 'Harshvardhan Patil',
    role: 'Full-Stack Developer',
    summary:
      'Experienced developer specializing in scalable web applications and resilient system architecture.',
  },
  work: [
    {
      company: 'Tech Solutions',
      position: 'Software Engineer',
      bullets: [
        'Engineered responsive frontend interfaces using React.',
        'Optimized PostgreSQL database queries, reducing latency by 20%.',
      ],
    },
  ],
  projects: [
    {
      name: 'KIXX',
      description: 'Premium e-commerce platform with AR sneaker try-on.',
      technologies: 'React, Node.js, Drizzle ORM',
      bullets: [
        'Architected full-stack infrastructure and admin dashboard.',
        'Integrated AR viewing capabilities for product pages.',
      ],
    },
    {
      name: 'SentinelAI',
      description: 'Gmail extension for hyper-resilient DOM detection.',
      technologies: 'React, Docker',
      bullets: [
        'Developed resilient content scripts for scam detection.',
        'Deployed backend analytics services via Docker.',
      ],
    },
  ],
  skills: 'React, Node.js, Tailwind CSS, PostgreSQL, Drizzle ORM, Docker',
};

// ── Reusable Input Components ──

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
      <FieldLabel>{label}</FieldLabel>
      <input
        type="text"
        value={value}
        onChange={onChange}
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
        value={value}
        onChange={onChange}
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

// ── Main Component ──

export default function ResumeEditor() {
  const [resume, setResume] = useState(initialResumeData);

  // ── Basics Handlers ──
  const updateBasics = (field, value) => {
    setResume((prev) => ({
      ...prev,
      basics: { ...prev.basics, [field]: value },
    }));
  };

  // ── Work Handlers ──
  const updateWork = (index, field, value) => {
    setResume((prev) => {
      const work = [...prev.work];
      work[index] = { ...work[index], [field]: value };
      return { ...prev, work };
    });
  };

  const updateWorkBullet = (workIndex, bulletIndex, value) => {
    setResume((prev) => {
      const work = [...prev.work];
      const bullets = [...work[workIndex].bullets];
      bullets[bulletIndex] = value;
      work[workIndex] = { ...work[workIndex], bullets };
      return { ...prev, work };
    });
  };

  const addWorkBullet = (workIndex) => {
    setResume((prev) => {
      const work = [...prev.work];
      work[workIndex] = {
        ...work[workIndex],
        bullets: [...work[workIndex].bullets, ''],
      };
      return { ...prev, work };
    });
  };

  const removeWorkBullet = (workIndex, bulletIndex) => {
    setResume((prev) => {
      const work = [...prev.work];
      const bullets = work[workIndex].bullets.filter((_, i) => i !== bulletIndex);
      work[workIndex] = { ...work[workIndex], bullets };
      return { ...prev, work };
    });
  };

  // ── Project Handlers ──
  const updateProject = (index, field, value) => {
    setResume((prev) => {
      const projects = [...prev.projects];
      projects[index] = { ...projects[index], [field]: value };
      return { ...prev, projects };
    });
  };

  const updateProjectBullet = (projIndex, bulletIndex, value) => {
    setResume((prev) => {
      const projects = [...prev.projects];
      const bullets = [...projects[projIndex].bullets];
      bullets[bulletIndex] = value;
      projects[projIndex] = { ...projects[projIndex], bullets };
      return { ...prev, projects };
    });
  };

  const addProjectBullet = (projIndex) => {
    setResume((prev) => {
      const projects = [...prev.projects];
      projects[projIndex] = {
        ...projects[projIndex],
        bullets: [...projects[projIndex].bullets, ''],
      };
      return { ...prev, projects };
    });
  };

  const removeProjectBullet = (projIndex, bulletIndex) => {
    setResume((prev) => {
      const projects = [...prev.projects];
      const bullets = projects[projIndex].bullets.filter((_, i) => i !== bulletIndex);
      projects[projIndex] = { ...projects[projIndex], bullets };
      return { ...prev, projects };
    });
  };

  const handleFinalize = () => {
    console.log('Finalized Resume JSON:', JSON.stringify(resume, null, 2));
  };

  return (
    <div>
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-canvas border-b border-stone-200 -mx-6 px-6 py-4 mb-10 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium tracking-widest uppercase text-stone-400 mb-1">
            Finalize
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">Document Editor</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setResume(initialResumeData)}
            className="border border-stone-300 text-stone-600 rounded-sm px-4 py-2.5 text-xs font-medium tracking-wide hover:bg-stone-50 transition-colors duration-300 flex items-center gap-2"
          >
            <RefreshCw size={14} strokeWidth={1.5} />
            Reset
          </button>
          <button
            onClick={handleFinalize}
            className="bg-stone-900 text-white rounded-sm px-6 py-2.5 text-sm font-medium tracking-wide hover:bg-stone-700 transition-colors duration-300 flex items-center gap-2"
          >
            <Download size={14} strokeWidth={1.5} />
            Finalize & Export
          </button>
        </div>
      </div>

      {/* Editor Content */}
      <div className="max-w-4xl mx-auto">
        {/* ── Basics Section ── */}
        <SectionCard icon={User} title="Basics">
          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <TextInput
              label="Full Name"
              value={resume.basics.name}
              onChange={(e) => updateBasics('name', e.target.value)}
            />
            <TextInput
              label="Target Role"
              value={resume.basics.role}
              onChange={(e) => updateBasics('role', e.target.value)}
            />
          </div>
          <TextArea
            label="Professional Summary"
            value={resume.basics.summary}
            onChange={(e) => updateBasics('summary', e.target.value)}
            rows={3}
          />
        </SectionCard>

        {/* ── Work Experience Section ── */}
        <SectionCard icon={Briefcase} title="Work Experience">
          {resume.work.map((job, workIdx) => (
            <div
              key={workIdx}
              className={`${workIdx > 0 ? 'border-t border-stone-200 pt-6 mt-6' : ''}`}
            >
              <div className="grid md:grid-cols-2 gap-4 mb-4">
                <TextInput
                  label="Company"
                  value={job.company}
                  onChange={(e) => updateWork(workIdx, 'company', e.target.value)}
                />
                <TextInput
                  label="Position"
                  value={job.position}
                  onChange={(e) => updateWork(workIdx, 'position', e.target.value)}
                />
              </div>

              <FieldLabel>Bullet Points</FieldLabel>
              <div className="space-y-3">
                {job.bullets.map((bullet, bulletIdx) => (
                  <div key={bulletIdx} className="flex gap-2">
                    <span className="text-stone-300 mt-2.5 text-sm select-none">•</span>
                    <textarea
                      value={bullet}
                      onChange={(e) => updateWorkBullet(workIdx, bulletIdx, e.target.value)}
                      rows={2}
                      className="flex-1 bg-white border border-stone-200 rounded-sm px-4 py-2.5 text-sm text-stone-900 leading-relaxed placeholder:text-stone-400 focus:outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-300 resize-none transition-all duration-300"
                    />
                    <button
                      onClick={() => removeWorkBullet(workIdx, bulletIdx)}
                      className="text-stone-300 hover:text-red-500 transition-colors duration-300 mt-2"
                    >
                      <Trash2 size={14} strokeWidth={1.5} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={() => addWorkBullet(workIdx)}
                className="mt-3 text-xs font-medium text-stone-400 hover:text-stone-700 transition-colors duration-300 flex items-center gap-1"
              >
                <Plus size={12} strokeWidth={1.5} />
                Add bullet
              </button>
            </div>
          ))}
        </SectionCard>

        {/* ── Projects Section ── */}
        <SectionCard icon={Code} title="Projects">
          {resume.projects.map((project, projIdx) => (
            <div
              key={projIdx}
              className={`${projIdx > 0 ? 'border-t border-stone-200 pt-6 mt-6' : ''}`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1 grid md:grid-cols-2 gap-4">
                  <TextInput
                    label="Project Name"
                    value={project.name}
                    onChange={(e) => updateProject(projIdx, 'name', e.target.value)}
                  />
                  <TextInput
                    label="Technologies"
                    value={project.technologies}
                    onChange={(e) => updateProject(projIdx, 'technologies', e.target.value)}
                  />
                </div>
                <button className="ml-4 mt-5 border border-stone-300 text-stone-600 rounded-sm px-3 py-2 text-xs font-medium tracking-wide hover:bg-stone-50 transition-colors duration-300 flex items-center gap-1.5 flex-shrink-0">
                  <RefreshCw size={12} strokeWidth={1.5} />
                  Swap Project
                </button>
              </div>

              <div className="mb-4">
                <TextInput
                  label="Description"
                  value={project.description}
                  onChange={(e) => updateProject(projIdx, 'description', e.target.value)}
                />
              </div>

              <FieldLabel>Bullet Points</FieldLabel>
              <div className="space-y-3">
                {project.bullets.map((bullet, bulletIdx) => (
                  <div key={bulletIdx} className="flex gap-2">
                    <span className="text-stone-300 mt-2.5 text-sm select-none">•</span>
                    <textarea
                      value={bullet}
                      onChange={(e) =>
                        updateProjectBullet(projIdx, bulletIdx, e.target.value)
                      }
                      rows={2}
                      className="flex-1 bg-white border border-stone-200 rounded-sm px-4 py-2.5 text-sm text-stone-900 leading-relaxed placeholder:text-stone-400 focus:outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-300 resize-none transition-all duration-300"
                    />
                    <button
                      onClick={() => removeProjectBullet(projIdx, bulletIdx)}
                      className="text-stone-300 hover:text-red-500 transition-colors duration-300 mt-2"
                    >
                      <Trash2 size={14} strokeWidth={1.5} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={() => addProjectBullet(projIdx)}
                className="mt-3 text-xs font-medium text-stone-400 hover:text-stone-700 transition-colors duration-300 flex items-center gap-1"
              >
                <Plus size={12} strokeWidth={1.5} />
                Add bullet
              </button>
            </div>
          ))}
        </SectionCard>

        {/* ── Skills Section ── */}
        <SectionCard icon={Wrench} title="Skills">
          <TextArea
            label="Technical Skills"
            value={resume.skills}
            onChange={(e) =>
              setResume((prev) => ({ ...prev, skills: e.target.value }))
            }
            rows={3}
            placeholder="Comma-separated list of skills"
          />
          <p className="text-xs text-stone-400 mt-2">
            Separate skills with commas. These will be front-loaded to match JD keywords.
          </p>
        </SectionCard>
      </div>
    </div>
  );
}
