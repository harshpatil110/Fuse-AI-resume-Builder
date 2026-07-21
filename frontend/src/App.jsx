import React from 'react';

function App() {
  return (
    <div className="min-h-screen p-16 md:p-24 flex flex-col items-start max-w-5xl mx-auto">
      <div className="mb-16">
        <h1 className="text-5xl md:text-7xl font-black tracking-tight text-stone-900 mb-6 leading-tight">
          Align your <br /> experience.
        </h1>
        <p className="font-serif text-xl md:text-2xl text-stone-500 italic max-w-[65ch]">
          An elite career consultant designed to evaluate, refine, and structure your professional narrative.
        </p>
      </div>

      <div className="w-full bg-white border border-stone-200 p-10 flex flex-col md:flex-row gap-8 items-start">
        <div className="flex-1 w-full">
          <label className="text-xs font-medium tracking-wider uppercase text-stone-500 mb-1.5 block">
            Target Role
          </label>
          <input 
            type="text" 
            placeholder="e.g. Senior Frontend Engineer"
            className="w-full bg-white border border-stone-300 rounded-sm px-4 py-2.5 text-sm placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-blue-300 focus:border-blue-300 transition-all duration-300"
          />
        </div>
        <div className="flex-none pt-6 w-full md:w-auto">
          <button className="w-full bg-stone-900 text-white rounded-sm px-8 py-2.5 text-sm font-medium tracking-wide hover:bg-stone-700 transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]">
            Connect GitHub
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
