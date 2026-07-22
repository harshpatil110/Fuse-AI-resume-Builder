import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, Upload, PenLine, Settings, Clock } from 'lucide-react';

const navItems = [
  { to: '/upload', label: 'Upload', icon: Upload },
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/history', label: 'History', icon: Clock },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function Layout() {
  return (
    <div className="min-h-screen bg-canvas">
      {/* Top Navigation */}
      <nav className="bg-white border-b border-stone-200">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between h-14">
          {/* Logo / Wordmark */}
          <span className="text-lg font-bold tracking-tight text-stone-900">
            Fuse
          </span>

          {/* Navigation Links */}
          <div className="flex items-center gap-8">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-2 text-sm font-medium transition-colors duration-300 ${
                    isActive
                      ? 'text-stone-900'
                      : 'text-stone-500 hover:text-stone-900'
                  }`
                }
              >
                <Icon size={16} strokeWidth={1.5} />
                {label}
              </NavLink>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto px-6 py-12">
        <Outlet />
      </main>
    </div>
  );
}
