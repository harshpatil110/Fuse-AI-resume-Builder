import React, { useState } from 'react';
import { AlertCircle, TrendingUp, XCircle, ArrowRight, CheckCircle, Sparkles } from 'lucide-react';

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
    {
      original: 'Was responsible for maintaining the internal admin dashboard.',
      suggestion: 'Architected and maintained an internal admin dashboard used by 50+ operations staff daily.',
      reason: '"Was responsible for" is passive. The JD looks for proactive engineers who build, not maintain.',
    },
  ],
  irrelevant_experience: [
    {
      item: 'Part-time retail associate at Best Buy (2019–2020)',
      reason: 'No transferable technical skills. Occupies space better used for relevant project work.',
    },
  ],
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
      'Was responsible for maintaining the internal admin dashboard.',
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
      'Participated in weekly code reviews and sprint planning sessions.',
    ],
  },
  {
    title: 'Other',
    company: 'Best Buy',
    role: 'Part-time Retail Associate',
    period: '2019 — 2020',
    bullets: [
      'Assisted customers with product selection and technical support.',
      'Managed inventory tracking for the electronics department.',
    ],
  },
];

// ── Helpers ──
const WEAK_PHRASES = MOCK_CRITIQUE.weak_verbs_found.map((v) => v.original);
const IRRELEVANT_COMPANIES = MOCK_CRITIQUE.irrelevant_experience.map((e) =>
  e.item.split('(')[0].trim().split(' at ').pop()?.trim()
);

function highlightText(text) {
  for (const phrase of WEAK_PHRASES) {
    if (text === phrase) {
      return (
        <span className="bg-blue-50 border-b-2 border-blue-200 text-stone-900 px-0.5">
          {text}
        </span>
      );
    }
  }
  return text;
}

function isIrrelevantSection(section) {
  if (!section.company) return false;
  return IRRELEVANT_COMPANIES.some((c) => section.company.includes(c));
}

// ── Component ──
export default function Editor() {
  const [critique] = useState(MOCK_CRITIQUE);
  const [resumeSections] = useState(MOCK_RESUME_SECTIONS);

  const scoreColor =
    critique.overall_match_score >= 80
      ? 'text-green-700'
      : critique.overall_match_score >= 60
      ? 'text-amber-700'
      : 'text-red-700';

  return (
    <div>
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
            {critique.overall_match_score}
            <span className="text-lg text-stone-400 font-normal">/100</span>
          </p>
        </div>
        <div className="max-w-md">
          <p className="text-sm text-stone-500 leading-relaxed">{critique.summary}</p>
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
              {critique.missing_keywords.map((kw, i) => (
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
              {critique.weak_verbs_found.map((item, i) => (
                <div key={i} className="bg-white border border-stone-200 p-4">
                  <p className="text-xs text-stone-900 leading-relaxed mb-2">
                    <span className="bg-blue-50 border-b border-blue-200 px-0.5">
                      {item.original.split(' ').slice(0, 3).join(' ')}
                    </span>
                    {' ' + item.original.split(' ').slice(3).join(' ')}
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
              {critique.irrelevant_experience.map((item, i) => (
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
        <button className="bg-stone-900 text-white rounded-sm px-6 py-3 text-sm font-medium tracking-wide hover:bg-stone-700 transition-colors duration-300 flex items-center gap-2">
          <Sparkles size={16} strokeWidth={1.5} />
          Approve & Generate Resume
        </button>
        <p className="text-xs text-stone-400">
          The Writer Agent will rewrite your resume based on this critique.
        </p>
      </div>
    </div>
  );
}
