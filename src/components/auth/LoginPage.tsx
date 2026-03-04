import React, { useState, useEffect, type FormEvent } from 'react';
import Particles, { initParticlesEngine } from '@tsparticles/react';
import { loadSlim } from '@tsparticles/slim';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

const ParticlesBackground = React.memo(({ isDark }: { isDark: boolean }) => {
  const [init, setInit] = useState(false);

  useEffect(() => {
    initParticlesEngine(async (engine) => {
      await loadSlim(engine);
    }).then(() => {
      setInit(true);
    });
  }, []);

  if (!init) return null;

  return (
    <Particles
      id="tsparticles"
      className="absolute inset-0"
      options={{
        background: {
          color: {
            value: isDark ? '#0f172a' : '#f3f4f6',
          },
        },
        fpsLimit: 60,
        interactivity: {
          events: {
            onClick: {
              enable: true,
              mode: 'push',
            },
            onHover: {
              enable: false,
              mode: 'repulse',
            },
          },
          modes: {
            push: {
              quantity: 1,
            },
            repulse: {
              distance: 200,
              duration: 0.4,
            },
          },
        },
        particles: {
          color: {
            value: '#12bdce',
          },
          links: {
            color: '#0d7d8b',
            distance: 150,
            enable: true,
            opacity: 0.6,
            width: 1,
          },
          move: {
            direction: 'none',
            enable: true,
            outModes: {
              default: 'bounce',
            },
            random: false,
            speed: 0.2,
            straight: false,
          },
          number: {
            density: {
              enable: true,
              width: 800,
              height: 800,
            },
            value: 25,
          },
          opacity: {
            value: 0.1,
          },
          shape: {
            type: 'circle',
          },
          size: {
            value: { min: 1, max: 3 },
          },
        },
        detectRetina: true,
      }}
    />
  );
});

ParticlesBackground.displayName = 'ParticlesBackground';

export function LoginPage() {
  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [useDummy, setUseDummy] = useState(true);
  const [error, setError] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(false);
    setLoading(true);

    try {
      const success = await login(username, password, useDummy);
      if (!success) {
        setError(true);
        setShakeKey((k) => k + 1);
      }
    } catch {
      setError(true);
      setShakeKey((k) => k + 1);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Theme toggle — floating top-right */}
      <button
        type="button"
        onClick={toggleTheme}
        className="absolute z-10  top-4 right-4 p-2 rounded-lg !text-primary hover:text-heading dark:text-slate-400 dark:hover:text-white transition-colors cursor-pointer"
        aria-label="Toggle theme"
      >
        {theme === 'dark' ? (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
          </svg>
        )}
      </button>

      {/* Particles background */}
      <ParticlesBackground isDark={theme === 'dark'} />

      <div className="relative w-full max-w-sm mx-4">
        {/* Card */}
        <div key={shakeKey} className={`bg-white border border-gray-200 shadow-xl dark:bg-white/6 dark:backdrop-blur-xl dark:border-white/10 dark:shadow-[0_24px_64px_-16px_rgba(18,189,206,0.12),0_8px_24px_-8px_rgba(0,0,0,0.3)] rounded-2xl p-8 transition-transform duration-300 ${error ? 'animate-shake' : ''}`}>
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-primary/15 rounded-xl mb-4">
              <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-heading dark:text-white">Transactions Enrichment Program</h1>
            <p className="text-sm text-muted dark:text-slate-400 mt-1">Sign in to continue</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="username" className="block text-xs font-medium text-body-secondary dark:text-slate-300 pl-1">
                Email
              </label>
              <input
                id="username"
                type="email"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setError(false); }}
                className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-heading placeholder:text-faint focus:border-primary/50 focus:ring-1 focus:ring-primary/50 outline-none transition-all dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-slate-500 dark:focus:bg-white/[0.07]"
                placeholder="Enter your email"
                autoComplete="email"
                autoFocus
                required
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-xs font-medium text-body-secondary dark:text-slate-300 pl-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(false); }}
                className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-heading placeholder:text-faint focus:border-primary/50 focus:ring-1 focus:ring-primary/50 outline-none transition-all dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-slate-500 dark:focus:bg-white/[0.07]"
                placeholder="Enter your password"
                autoComplete="current-password"
                required
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={useDummy}
                onChange={(e) => setUseDummy(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary/50 dark:border-white/20 dark:bg-white/5 cursor-pointer"
              />
              <span className="text-xs text-body-secondary dark:text-slate-400">Use dummy transactions</span>
            </label>

            {/* Error message */}
            {error && (
              <p className="text-sm text-red-500 dark:text-red-400 text-center">
                Invalid username or password
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !username || !password}
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-light hover:shadow-[0_8px_24px_-8px_rgba(18,189,206,0.4)] focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 cursor-pointer"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in...
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted dark:text-slate-500 mt-6">
          Brought to you by <a href="https://swittle.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Swittle</a>
        </p>
      </div>
    </div>
  );
}
