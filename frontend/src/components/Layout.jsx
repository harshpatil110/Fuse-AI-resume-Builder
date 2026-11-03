import React, { useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, Upload, Settings, Clock, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const navItems = [
  { to: '/upload', label: 'Upload', icon: Upload },
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/history', label: 'History', icon: Clock },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function Layout() {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-canvas font-sans selection:bg-blue-200">
      {/* Top Navigation - Apple Style Translucent */}
      <nav className="fixed top-0 left-0 right-0 z-50 apple-blur apple-header">
        <div className="max-w-5xl mx-auto px-6 flex items-center justify-between h-14">
          {/* Logo */}
          <NavLink to="/" className="flex items-center gap-2 text-stone-900 group">
            <motion.div
              whileHover={{ scale: 1.05, rotate: 5 }}
              whileTap={{ scale: 0.95 }}
              className="bg-stone-900 text-white p-1.5 rounded-lg shadow-sm"
            >
              <Sparkles size={16} strokeWidth={2} />
            </motion.div>
            <span className="text-lg font-semibold tracking-tight">Fuse</span>
          </NavLink>

          {/* Navigation Links */}
          <div className="flex items-center gap-2">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `relative flex items-center gap-2 px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors duration-200 ${
                    isActive
                      ? 'text-stone-900'
                      : 'text-stone-500 hover:text-stone-900 hover:bg-stone-100'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.div
                        layoutId="nav-pill"
                        className="absolute inset-0 bg-stone-200/50 rounded-full -z-10"
                        transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
                      />
                    )}
                    <Icon size={14} strokeWidth={isActive ? 2 : 1.5} />
                    {label}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="max-w-5xl mx-auto px-6 pt-28 pb-20">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 12, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -12, filter: 'blur(4px)' }}
            transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
