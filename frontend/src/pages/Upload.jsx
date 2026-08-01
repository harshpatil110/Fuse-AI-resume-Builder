import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileText, CheckCircle, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

function DropZone({ label, hint, tag, accept, file, onDrop, onClear }) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (accepted) => {
      if (accepted.length > 0) onDrop(accepted[0]);
    },
    accept,
    multiple: false,
  });

  return (
    <div>
      <p className="text-xs font-medium tracking-widest uppercase text-stone-500 mb-3">
        {label}
      </p>

      {file ? (
        <div className="bg-white border border-stone-200 p-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle size={20} strokeWidth={1.5} className="text-blue-700" />
            <div>
              <p className="text-sm font-medium text-stone-900">{file.name}</p>
              <p className="text-xs text-stone-400 mt-0.5">
                {(file.size / 1024).toFixed(1)} KB
              </p>
            </div>
          </div>
          <button
            onClick={onClear}
            className="text-stone-400 hover:text-stone-700 transition-colors duration-300"
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>
      ) : (
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors duration-200 ${
            isDragActive
              ? 'border-blue-300 bg-blue-50'
              : 'border-stone-300 bg-transparent hover:border-blue-300 hover:bg-blue-50'
          }`}
        >
          <input {...getInputProps()} />
          <UploadCloud
            size={32}
            strokeWidth={1.5}
            className="mx-auto mb-4 text-stone-400"
          />
          <p className="text-sm text-stone-600 mb-1">
            {isDragActive ? 'Drop file here' : 'Drag & drop or click to browse'}
          </p>
          <p className="text-xs text-stone-400">{hint}</p>
          {tag && (
            <span className="inline-block mt-3 font-mono text-xs font-medium tracking-wider uppercase text-stone-500 border border-stone-200 bg-white px-2 py-1">
              {tag}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default function Upload() {
  const navigate = useNavigate();
  const [resumeFile, setResumeFile] = useState(null);
  const [jdFile, setJdFile] = useState(null);
  const [jdText, setJdText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState(null);

  const hasResume = !!resumeFile;
  const hasJd = !!jdFile || jdText.trim().length > 0;
  const canGenerate = hasResume && hasJd && !isAnalyzing;

  const handleGenerate = async () => {
    setIsAnalyzing(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('resume', resumeFile);
      if (jdFile) formData.append('jd_file', jdFile);
      if (jdText) formData.append('jd_text', jdText);

      const response = await fetch('http://localhost:5000/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to analyze resume. Please try again.');
      }

      const data = await response.json();
      console.log("[upload] backend payload:", data);
      navigate('/editor', { state: { criticData: data } });
    } catch (err) {
      console.error("[upload] API error:", err);
      const errMsg = err.message || 'An unexpected error occurred.';
      setError(errMsg);
      alert(errMsg);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div>
      {/* Hero Section */}
      <div className="mb-16">
        <h1 className="text-5xl font-black tracking-tight text-stone-900 mb-4 leading-tight">
          Align your experience.
        </h1>
        <p className="text-base font-normal leading-relaxed text-stone-500 max-w-[65ch]">
          Upload your raw LaTeX (.tex) source and the target job description. The AI engine
          rewrites content inside each section — never the layout — so the original ATS-ready
          formatting of your document survives untouched.
        </p>
      </div>

      {error && (
        <div className="mb-8 p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-sm">
          {error}
        </div>
      )}

      {/* Upload Grid */}
      <div className="grid md:grid-cols-2 gap-8 mb-12">
        {/* Resume Dropzone */}
        <DropZone
          label="Resume"
          hint="Raw .tex source — flawless ATS formatting"
          tag=".tex"
          accept={{
            'application/x-tex': ['.tex'],
            'text/plain': ['.tex'],
            'application/octet-stream': ['.tex'],
          }}
          file={resumeFile}
          onDrop={setResumeFile}
          onClear={() => setResumeFile(null)}
        />

        {/* JD Dropzone */}
        <div>
          <DropZone
            label="Job Description"
            hint="PDF or TXT"
            tag=".pdf · .txt"
            accept={{
              'application/pdf': ['.pdf'],
              'text/plain': ['.txt'],
            }}
            file={jdFile}
            onDrop={setJdFile}
            onClear={() => setJdFile(null)}
          />

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-stone-200" />
            <span className="text-xs font-medium tracking-widest uppercase text-stone-400">
              Or paste text
            </span>
            <div className="flex-1 h-px bg-stone-200" />
          </div>

          {/* JD Text Area */}
          <textarea
            value={jdText}
            onChange={(e) => setJdText(e.target.value)}
            placeholder="Paste the full job description here..."
            rows={6}
            className="w-full bg-white border border-stone-300 rounded-sm px-4 py-3 text-sm leading-relaxed text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-blue-300 focus:border-blue-300 resize-none transition-all duration-300"
          />
        </div>
      </div>

      {/* Generate Button */}
      <button
        onClick={handleGenerate}
        disabled={!canGenerate}
        className={`bg-stone-900 text-white rounded-sm px-8 py-3 text-sm font-medium tracking-wide transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          canGenerate
            ? 'hover:bg-stone-700 cursor-pointer'
            : 'opacity-40 cursor-not-allowed'
        }`}
      >
        {isAnalyzing ? 'Analyzing Resume...' : 'Generate'}
      </button>

      {/* Helper Text */}
      {!canGenerate && (
        <p className="text-xs text-stone-400 mt-3">
          {!hasResume && !hasJd
            ? 'Upload the .tex source and provide a job description to begin.'
            : !hasResume
            ? 'Upload your .tex source to continue.'
            : 'Provide a job description to continue.'}
        </p>
      )}
    </div>
  );
}
