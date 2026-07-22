import React from 'react';

export default function Settings() {
  return (
    <div>
      <p className="text-xs font-medium tracking-widest uppercase text-stone-400 mb-4">Configuration</p>
      <h1 className="text-4xl font-bold tracking-tight text-stone-900 mb-3">Settings</h1>
      <p className="text-base font-normal leading-relaxed text-stone-500 max-w-[65ch]">
        Manage your GitHub connection, API keys, and account preferences.
      </p>
    </div>
  );
}
