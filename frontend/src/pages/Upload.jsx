import React, { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, CheckCircle2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

function DropZone({ label, hint, tag, accept, file, onDrop, onClear }) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (accepted) => {
      if (accepted.length > 0) onDrop(accepted[0]);
    },
    accept,
    multiple: false,
  });

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] font-semibold tracking-wide uppercase text-ink-light ml-1">
        {label}
      </p>

      <AnimatePresence mode="wait">
        {file ? (
          <motion.div
            key="file"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
            className="apple-card p-5 flex items-center justify-between shadow-sm bg-white"
          >
            <div className="flex items-center gap-3">
              <CheckCircle2 size={24} className="text-accent" />
              <div>
                <p className="text-[15px] font-semibold text-ink line-clamp-1">{file.name}</p>
                <p className="text-[13px] text-ink-light mt-0.5">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </div>
            </div>
            <motion.button
              whileHover={{ scale: 1.1, backgroundColor: 'rgba(0,0,0,0.05)' }}
              whileTap={{ scale: 0.9 }}
              onClick={onClear}
              className="p-2 rounded-full text-ink-light transition-colors"
            >
              <X size={18} strokeWidth={2} />
            </motion.button>
          </motion.div>
        ) : (
          <motion.div
            key="dropzone"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            {...getRootProps()}
            className={`apple-card p-8 text-center cursor-pointer transition-all duration-300 border-2 ${
              isDragActive
                ? 'border-accent bg-blue-50/50 shadow-md scale-[1.02]'
                : 'border-transparent bg-white hover:shadow-md hover:scale-[1.01]'
            }`}
          >
            <input {...getInputProps()} />
            <motion.div 
              animate={{ y: isDragActive ? -4 : 0 }}
              transition={{ type: 'spring', bounce: 0.5 }}
            >
              <UploadCloud
                size={36}
                strokeWidth={1.5}
                className={`mx-auto mb-3 transition-colors ${isDragActive ? 'text-accent' : 'text-stone-300'}`}
              />
            </motion.div>
            <p className="text-[15px] font-semibold text-ink mb-1">
              {isDragActive ? 'Drop file to upload' : 'Click or drag file here'}
            </p>
            <p className="text-[13px] text-ink-light">{hint}</p>
            {tag && (
              <span className="inline-block mt-4 bg-stone-100 text-stone-500 rounded-md px-2.5 py-1 text-[11px] font-bold tracking-wider uppercase">
                {tag}
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
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

      if (!response.ok) throw new Error('Failed to analyze resume. Please try again.');
      
      const data = await response.json();
      navigate('/editor', { state: { criticData: data } });
    } catch (err) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-12 text-center">
        <motion.h1 
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          className="text-[44px] font-bold tracking-tight text-ink mb-4 leading-tight"
        >
          Align your experience.
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}
          className="text-[17px] leading-relaxed text-ink-light max-w-[55ch] mx-auto"
        >
          Upload your raw LaTeX source and the target job description. The AI engine tailors your content without altering your ATS-ready formatting.
        </motion.p>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="mb-8"
          >
            <div className="p-4 bg-red-50 text-red-600 rounded-xl text-[14px] font-medium border border-red-100 text-center">
              {error}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid md:grid-cols-2 gap-8 mb-12">
        <DropZone
          label="Resume"
          hint="Raw LaTeX source (.tex)"
          tag=".tex"
          accept={{
            'application/x-tex': ['.tex'],
            'text/plain': ['.tex'],
          }}
          file={resumeFile}
          onDrop={setResumeFile}
          onClear={() => setResumeFile(null)}
        />

        <div className="flex flex-col gap-5">
          <DropZone
            label="Job Description"
            hint="Upload PDF or TXT"
            tag=".pdf · .txt"
            accept={{
              'application/pdf': ['.pdf'],
              'text/plain': ['.txt'],
            }}
            file={jdFile}
            onDrop={setJdFile}
            onClear={() => setJdFile(null)}
          />

          <div className="relative flex items-center justify-center">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-stone-200"></div></div>
            <div className="relative bg-canvas px-4 text-[12px] font-semibold tracking-widest uppercase text-stone-400">Or Paste Text</div>
          </div>

          <motion.div
            whileFocus={{ scale: 1.01 }}
            transition={{ type: 'spring', bounce: 0 }}
          >
            <textarea
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              placeholder="Paste the full job description here..."
              rows={4}
              className="w-full apple-card p-4 text-[15px] leading-relaxed text-ink placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent resize-none transition-all shadow-sm"
            />
          </motion.div>
        </div>
      </div>

      <div className="flex flex-col items-center">
        <motion.button
          whileHover={canGenerate ? { scale: 1.02, backgroundColor: 'var(--color-accent-hover)' } : {}}
          whileTap={canGenerate ? { scale: 0.98 } : {}}
          onClick={handleGenerate}
          disabled={!canGenerate}
          className={`apple-btn px-10 py-3.5 text-[16px] shadow-sm ${
            !canGenerate ? 'opacity-50 cursor-not-allowed bg-stone-300 text-stone-500 hover:bg-stone-300' : ''
          }`}
        >
          {isAnalyzing ? 'Analyzing Resume...' : 'Generate Resume'}
        </motion.button>
        
        <AnimatePresence>
          {!canGenerate && (
            <motion.p 
              initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="text-[13px] text-ink-light mt-4"
            >
              {!hasResume && !hasJd
                ? 'Upload your resume and a job description to begin.'
                : !hasResume
                ? 'Upload your resume to continue.'
                : 'Provide a job description to continue.'}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
