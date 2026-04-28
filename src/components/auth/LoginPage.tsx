import React, { useState, useEffect, type FormEvent } from 'react';
import Particles, { initParticlesEngine } from '@tsparticles/react';
import { loadSlim } from '@tsparticles/slim';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { get2faSetup, enable2fa } from '../../api/identity';

type LoginStep =
  | { step: 'credentials' }
  | { step: 'totp_verify'; username: string; hashedPassword: string }
  | { step: 'totp_setup'; username: string; hashedPassword: string; tempToken: string; qrUri: string; sharedKey: string };

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

// 6-digit TOTP input component
const TotpInput = ({ value, onChange, onSubmit, isLoading, error }: {
  value: string;
  onChange: (val: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  error: string | null;
}) => {
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const val = e.target.value.replace(/[^0-9]/g, '');
    if (val.length > 1) {
      // Handle paste: split multi-digit input
      const newValue = (value.slice(0, index) + val + value.slice(index + 1)).slice(0, 6);
      onChange(newValue);
      // Focus the last input if complete
      if (newValue.length === 6) {
        (document.getElementById('totp-5') as HTMLInputElement)?.focus();
      }
    } else {
      const newValue = value.slice(0, index) + val + value.slice(index + 1);
      onChange(newValue);
      // Auto-advance to next input
      if (val && index < 5) {
        (document.getElementById(`totp-${index + 1}`) as HTMLInputElement)?.focus();
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Backspace' && !value[index] && index > 0) {
      (document.getElementById(`totp-${index - 1}`) as HTMLInputElement)?.focus();
    } else if (e.key === 'Enter') {
      onSubmit();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-center gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <input
            key={i}
            id={`totp-${i}`}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={value[i] ?? ''}
            onChange={(e) => handleInputChange(e, i)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            disabled={isLoading}
            className="w-10 h-12 text-center text-lg font-mono border border-gray-300 rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
        ))}
      </div>
      {error && <p className="text-sm text-red-500 dark:text-red-400 text-center">{error}</p>}
      <button
        type="button"
        onClick={onSubmit}
        disabled={isLoading || value.length !== 6}
        className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-light hover:shadow-[0_8px_24px_-8px_rgba(18,189,206,0.4)] focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 cursor-pointer"
      >
        {isLoading ? (
          <span className="inline-flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Verifying...
          </span>
        ) : (
          'Verify'
        )}
      </button>
    </div>
  );
};

export function LoginPage() {
  const { login, loginWith2fa } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [currentStep, setCurrentStep] = useState<LoginStep>({ step: 'credentials' });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [showSharedKey, setShowSharedKey] = useState(false);

  const handleCredentialsSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await login(username, password, false);

      if (result.status === 'success') {
        // Login successful, app will redirect
        return;
      } else if (result.status === '2fa_required') {
        if (result.isSetupRequired) {
          // Fetch setup info
          setLoading(true);
          try {
            const setupData = await get2faSetup(result.tempToken!);
            setCurrentStep({
              step: 'totp_setup',
              username: result.username,
              hashedPassword: result.hashedPassword,
              tempToken: result.tempToken!,
              qrUri: setupData.authenticatorUri,
              sharedKey: setupData.sharedKey,
            });
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load 2FA setup');
          }
        } else {
          // Setup already done, just need verification code
          setCurrentStep({
            step: 'totp_verify',
            username: result.username,
            hashedPassword: result.hashedPassword,
          });
        }
      } else if (result.status === 'failed') {
        setError(result.message ?? 'Login failed');
        setShakeKey((k) => k + 1);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      setShakeKey((k) => k + 1);
    } finally {
      setLoading(false);
    }
  };

  const handleTotpVerify = async (code: string) => {
    if (currentStep.step !== 'totp_verify') return;
    setError(null);
    setLoading(true);

    try {
      const result = await loginWith2fa(currentStep.username, currentStep.hashedPassword, code);

      if (result.status === 'success') {
        // Login successful, app will redirect
        return;
      } else if (result.status === 'failed') {
        setError(result.message ?? 'Invalid code, please try again');
        setTotpCode('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code, please try again');
      setTotpCode('');
    } finally {
      setLoading(false);
    }
  };

  const handleTotpSetupEnable = async (code: string) => {
    if (currentStep.step !== 'totp_setup') return;
    setError(null);
    setLoading(true);

    try {
      await enable2fa(currentStep.tempToken, code);

      // Now complete login with the code
      const result = await loginWith2fa(currentStep.username, currentStep.hashedPassword, code);

      if (result.status === 'success') {
        // Login successful, app will redirect
        return;
      } else if (result.status === 'failed') {
        setError(result.message ?? 'Failed to complete setup');
        setTotpCode('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code, please try again');
      setTotpCode('');
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
        className="absolute z-10 top-4 right-4 p-2 rounded-lg !text-primary hover:text-heading dark:text-slate-400 dark:hover:text-white transition-colors cursor-pointer"
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
        <div key={shakeKey} className={`border border-gray-200 dark:bg-black/20 bg-white/50 dark:border-gray-700 shadow-xl dark:shadow-[0_24px_64px_-16px_rgba(18,189,206,0.12),0_8px_24px_-8px_rgba(0,0,0,0.3)] rounded-2xl p-8 transition-transform duration-300 ${error && currentStep.step === 'credentials' ? 'animate-shake' : ''}`}>
          {currentStep.step === 'credentials' && (
            <>
              {/* Header */}
              <div className="text-center mb-8">
                <img src="https://swittle.com/swittle%20logo.png" alt="Swittle" className="h-8 mx-auto mb-7" />
                <h1 className="text-xl font-semibold text-heading dark:text-white">Transactions Enrichment Program</h1>
                <p className="text-sm text-muted dark:text-slate-400 mt-1">Sign in to continue</p>
              </div>

              {/* Form */}
              <form onSubmit={handleCredentialsSubmit} className="space-y-5">
                <div className="space-y-1.5">
                  <label htmlFor="username" className="block text-xs font-medium text-body-secondary dark:text-slate-300 pl-1">
                    Email
                  </label>
                  <input
                    id="username"
                    type="email"
                    name="tepEmail"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      setError(null);
                    }}
                    className="w-full rounded-lg border backdrop-blur-2xl border-gray-300 bg-white px-3.5 py-2.5 text-sm text-heading placeholder:text-faint focus:border-primary/50 focus:ring-1 focus:ring-primary/50 outline-none transition-all dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-slate-500 dark:focus:bg-white/[0.07]"
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
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      name="tepPass"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setError(null);
                      }}
                      className="w-full rounded-lg border backdrop-blur-2xl border-gray-300 bg-white px-3.5 py-2.5 pr-10 text-sm text-heading placeholder:text-faint focus:border-primary/50 focus:ring-1 focus:ring-primary/50 outline-none transition-all dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-slate-500 dark:focus:bg-white/[0.07]"
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-600 transition-colors"
                      tabIndex={-1}
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4.5 h-4.5">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4.5 h-4.5">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {/* Error message */}
                {error && (
                  <p className="text-sm text-red-500 dark:text-red-400 text-center">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
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
            </>
          )}

          {currentStep.step === 'totp_verify' && (
            <>
              <div className="text-center mb-8">
                <h1 className="text-xl font-semibold text-heading dark:text-white">Two-Factor Authentication</h1>
                <p className="text-sm text-muted dark:text-slate-400 mt-1">Enter the 6-digit code from your authenticator app</p>
              </div>

              <div className="space-y-6">
                <TotpInput
                  value={totpCode}
                  onChange={setTotpCode}
                  onSubmit={() => handleTotpVerify(totpCode)}
                  isLoading={loading}
                  error={error}
                />

                <button
                  type="button"
                  onClick={() => {
                    setCurrentStep({ step: 'credentials' });
                    setTotpCode('');
                    setError(null);
                  }}
                  className="w-full text-sm text-primary hover:underline dark:text-primary"
                >
                  Use a different account
                </button>
              </div>
            </>
          )}

          {currentStep.step === 'totp_setup' && (
            <>
              <div className="text-center mb-8">
                <h1 className="text-xl font-semibold text-heading dark:text-white">Set Up Two-Factor Authentication</h1>
                <p className="text-sm text-muted dark:text-slate-400 mt-2">Your administrator requires two-factor authentication. Scan the QR code with your authenticator app.</p>
              </div>

              <div className="space-y-6">
                {/* QR Code */}
                <div className="flex justify-center">
                  <div className="bg-white p-4 rounded-lg">
                    <QRCodeSVG value={currentStep.qrUri} size={200} level="H" marginSize={4} />
                  </div>
                </div>

                {/* Shared Key Fallback */}
                <div className="border border-gray-300 dark:border-white/10 rounded-lg p-4">
                  <button
                    type="button"
                    onClick={() => setShowSharedKey(!showSharedKey)}
                    className="w-full text-left text-sm font-medium text-heading dark:text-white hover:text-primary dark:hover:text-primary flex items-center gap-2"
                  >
                    <span>{showSharedKey ? '▼' : '▶'}</span>
                    Can't scan? Enter this key manually
                  </button>
                  {showSharedKey && (
                    <div className="mt-3 p-3 bg-gray-50 dark:bg-white/5 rounded font-mono text-sm text-center text-body dark:text-slate-300 break-all">
                      {currentStep.sharedKey}
                    </div>
                  )}
                </div>

                {/* TOTP Code Entry */}
                <div>
                  <label className="block text-xs font-medium text-body-secondary dark:text-slate-300 pl-1 mb-3">
                    6-digit code from your app
                  </label>
                  <TotpInput
                    value={totpCode}
                    onChange={setTotpCode}
                    onSubmit={() => handleTotpSetupEnable(totpCode)}
                    isLoading={loading}
                    error={error}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted dark:text-slate-500 mt-6">
          Brought to you by <a href="https://swittle.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Swittle</a>
        </p>
      </div>
    </div>
  );
}
