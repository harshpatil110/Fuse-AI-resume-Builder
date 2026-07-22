import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, Square, CheckSquare, Star, ExternalLink } from 'lucide-react';

const GithubIcon = ({ size = 24, strokeWidth = 2, className = "" }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
);

const MOCK_REPOS = [
  {
    id: 1,
    name: 'fuse-career-app',
    description: 'A B2C career optimization platform built with React, Node.js, and FastAPI.',
    language: 'JavaScript',
    stars: 24,
    url: 'https://github.com/user/fuse-career-app',
  },
  {
    id: 2,
    name: 'distributed-cache',
    description: 'High-performance distributed caching layer using Redis and Go, handling 50k req/s.',
    language: 'Go',
    stars: 142,
    url: 'https://github.com/user/distributed-cache',
  },
  {
    id: 3,
    name: 'ml-pipeline-toolkit',
    description: 'End-to-end ML pipeline for data preprocessing, model training, and deployment on AWS.',
    language: 'Python',
    stars: 67,
    url: 'https://github.com/user/ml-pipeline-toolkit',
  },
  {
    id: 4,
    name: 'react-component-library',
    description: 'A design-system-first UI component library with full accessibility support.',
    language: 'TypeScript',
    stars: 31,
    url: 'https://github.com/user/react-component-library',
  },
];

const LANGUAGE_COLORS = {
  JavaScript: 'bg-yellow-400',
  TypeScript: 'bg-blue-500',
  Python: 'bg-green-500',
  Go: 'bg-cyan-500',
};

export default function Settings() {
  const [isConnected, setIsConnected] = useState(false);
  const [repositories, setRepositories] = useState(MOCK_REPOS);
  const [selectedRepos, setSelectedRepos] = useState(new Set());
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get('github_connected') === 'true') {
      setIsConnected(true);
      // Clean up the URL
      searchParams.delete('github_connected');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const toggleRepo = (id) => {
    setSelectedRepos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleConnect = () => {
    window.location.href = 'http://localhost:5000/api/auth/github';
  };

  return (
    <div>
      <p className="text-xs font-medium tracking-widest uppercase text-stone-400 mb-4">
        Configuration
      </p>
      <h1 className="text-4xl font-bold tracking-tight text-stone-900 mb-3">
        Settings
      </h1>
      <p className="text-base font-normal leading-relaxed text-stone-500 max-w-[65ch] mb-12">
        Manage your GitHub integration. Connect your account to let the AI engine analyze your
        repositories and weave relevant projects into your resume.
      </p>

      {/* GitHub Section */}
      <div className="bg-white border border-stone-200 p-8 mb-8">
        <div className="flex items-center gap-3 mb-6">
          <GithubIcon size={20} strokeWidth={1.5} className="text-stone-700" />
          <h2 className="text-lg font-semibold tracking-tight text-stone-900">
            GitHub Integration
          </h2>
        </div>

        {!isConnected ? (
          /* ── Disconnected State ── */
          <div>
            <p className="text-sm leading-relaxed text-stone-500 max-w-[65ch] mb-6">
              Connect your GitHub profile to automatically import your repositories. The AI engine
              will select the most relevant projects and integrate them into your tailored resume.
            </p>
            <button
              onClick={handleConnect}
              className="bg-stone-900 text-white rounded-sm px-6 py-2.5 text-sm font-medium tracking-wide hover:bg-stone-700 transition-colors duration-300"
            >
              Connect GitHub Profile
            </button>

            {/* Dev toggle for previewing the connected state */}
            <button
              onClick={() => setIsConnected(true)}
              className="ml-4 bg-transparent border border-stone-300 text-stone-500 rounded-sm px-4 py-2.5 text-xs font-medium tracking-wide hover:bg-stone-100 transition-colors duration-300"
            >
              Preview Connected State
            </button>
          </div>
        ) : (
          /* ── Connected State ── */
          <div>
            <div className="flex items-center gap-2 mb-6">
              <Check size={16} strokeWidth={1.5} className="text-green-600" />
              <p className="text-sm text-stone-600">
                Connected as <span className="font-semibold text-stone-900">harsh-dev</span>
              </p>
            </div>

            {/* Repository Selection */}
            <div className="mb-6">
              <p className="text-xs font-medium tracking-widest uppercase text-stone-500 mb-4">
                Select repositories for AI analysis
              </p>
              <p className="text-sm text-stone-400 mb-6">
                {selectedRepos.size} of {repositories.length} repositories selected
              </p>
            </div>

            <div className="grid gap-4">
              {repositories.map((repo) => {
                const isSelected = selectedRepos.has(repo.id);
                return (
                  <button
                    key={repo.id}
                    onClick={() => toggleRepo(repo.id)}
                    className={`w-full text-left p-5 border transition-colors duration-300 ${
                      isSelected
                        ? 'bg-blue-50/40 border-blue-300'
                        : 'bg-white border-stone-200 hover:bg-stone-50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2.5 mb-1.5">
                          {isSelected ? (
                            <CheckSquare
                              size={16}
                              strokeWidth={1.5}
                              className="text-blue-600 flex-shrink-0"
                            />
                          ) : (
                            <Square
                              size={16}
                              strokeWidth={1.5}
                              className="text-stone-400 flex-shrink-0"
                            />
                          )}
                          <span
                            className={`text-sm font-semibold tracking-tight ${
                              isSelected ? 'text-blue-900' : 'text-stone-900'
                            }`}
                          >
                            {repo.name}
                          </span>
                        </div>
                        <p className="text-sm text-stone-500 leading-relaxed pl-[26px] mb-3">
                          {repo.description}
                        </p>
                        <div className="flex items-center gap-4 pl-[26px]">
                          <span className="flex items-center gap-1.5 text-xs tracking-widest uppercase text-stone-500">
                            <span
                              className={`inline-block w-2 h-2 rounded-sm ${
                                LANGUAGE_COLORS[repo.language] || 'bg-stone-400'
                              }`}
                            />
                            {repo.language}
                          </span>
                          <span className="flex items-center gap-1 text-xs text-stone-400">
                            <Star size={12} strokeWidth={1.5} />
                            {repo.stars}
                          </span>
                        </div>
                      </div>
                      <a
                        href={repo.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-stone-400 hover:text-stone-700 transition-colors duration-300 flex-shrink-0 ml-4"
                      >
                        <ExternalLink size={14} strokeWidth={1.5} />
                      </a>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Disconnect */}
            <div className="mt-8 pt-6 border-t border-stone-200">
              <button
                onClick={() => {
                  setIsConnected(false);
                  setSelectedRepos(new Set());
                }}
                className="text-xs font-medium tracking-wide text-stone-400 hover:text-stone-700 transition-colors duration-300"
              >
                Disconnect GitHub
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
