import React, { useState, useEffect, useRef, type FormEvent } from 'react';
import Particles, { initParticlesEngine } from '@tsparticles/react';
import { loadSlim } from '@tsparticles/slim';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { get2faSetup, enable2fa } from '../../api/identity';
import { BrandLogo } from '../shared/BrandLogo';

type LoginStep =
  | { step: 'credentials' }
  | { step: 'totp_verify'; username: string; hashedPassword: string }
  | { step: 'totp_setup'; username: string; hashedPassword: string; tempToken: string; qrUri: string; sharedKey: string };

type SetupWizardStep = 'app' | 'qrcode' | 'verify';

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
            // Auto-focus the first cell on mount so users can start typing
            // their code immediately without clicking into the field.
            autoFocus={i === 0}
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
  const { theme, toggleTheme, brand, setBrand } = useTheme();

  // Hidden brand-flip easter egg: typing the literal word `bwatech` while focus
  // is on the document body **toggles** the brand between swittle and bwatech.
  // Gives a demo operator a way to load the user-portal look BEFORE auth so the
  // post-login swap doesn't visibly flash, and a way to undo it without
  // clearing localStorage. Ignored while an <input>/<textarea> is focused so it
  // can't fire while the user is typing their password.
  //
  // The current brand is read via a ref so the listener can flip to the opposite
  // value without the effect tearing down + remounting on every flip (which
  // would reset the keystroke buffer mid-word and make the toggle feel flaky).
  const brandRef = useRef(brand);
  brandRef.current = brand;
  useEffect(() => {
    const TARGET = 'bwatech';
    let buffer = '';
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
      if (!/^[a-z]$/i.test(e.key)) return;
      buffer = (buffer + e.key.toLowerCase()).slice(-TARGET.length);
      if (buffer === TARGET) {
        setBrand(brandRef.current === 'bwatech' ? 'swittle' : 'bwatech');
        buffer = ''; // force a fresh re-type to flip again
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setBrand]);

  const [currentStep, setCurrentStep] = useState<LoginStep>({ step: 'credentials' });
  const [wizardStep, setWizardStep] = useState<SetupWizardStep>('app');
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
            setWizardStep('app');
            setTotpCode('');
            setShowSharedKey(false);
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

      <div className="relative w-full mx-4 max-w-sm">
        {/* Card */}
        <div key={shakeKey} className={`border border-gray-200 dark:bg-black/20 bg-white/50 dark:border-gray-700 shadow-xl dark:shadow-[0_24px_64px_-16px_rgba(18,189,206,0.12),0_8px_24px_-8px_rgba(0,0,0,0.3)] rounded-2xl p-8 transition-transform duration-300 ${error && currentStep.step === 'credentials' ? 'animate-shake' : ''}`}>
          {currentStep.step === 'credentials' && (
            <>
              {/* Header */}
              <div className="text-center mb-8">
                <div className="mb-6 flex justify-center"><BrandLogo className="h-8" /></div>
                <h1 className="text-2xl font-semibold text-heading dark:text-white">Welcome</h1>
                <p className="text-sm text-muted dark:text-slate-400 mt-2">Enter your credentials to access the Transactions Enrichment Program</p>
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
                <h1 className="text-2xl font-semibold text-heading dark:text-white">Verify Your Identity</h1>
                <p className="text-sm text-muted dark:text-slate-400 mt-3">Your organization requires an extra security step. Open your authenticator app and enter the 6-digit code below.</p>
              </div>

              <div className="space-y-6">
                {/* Guidance box */}
                <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-lg p-4">
                  <p className="text-xs font-medium text-blue-900 dark:text-blue-300 mb-2">Where to find your code:</p>
                  <ul className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
                    <li>• Open your authenticator app (Google Authenticator, Microsoft Authenticator, Authy, etc.)</li>
                    <li>• Look for your organization or account name</li>
                    <li>• Copy the 6-digit number shown next to it</li>
                  </ul>
                </div>

                <div>
                  <label className="block text-xs font-medium text-body-secondary dark:text-slate-300 pl-1 mb-3">
                    Enter your 6-digit code
                  </label>
                  <TotpInput
                    value={totpCode}
                    onChange={setTotpCode}
                    onSubmit={() => handleTotpVerify(totpCode)}
                    isLoading={loading}
                    error={error}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setCurrentStep({ step: 'credentials' });
                    setTotpCode('');
                    setError(null);
                  }}
                  className="w-full text-sm text-primary hover:underline dark:text-primary"
                >
                  ← Back to login
                </button>
              </div>
            </>
          )}

          {currentStep.step === 'totp_setup' && (
            <>
              {/* Shared header */}
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-100 dark:bg-blue-500/20 rounded-full mb-4">
                  <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2zm10-10V7a4 4 0 0 0-8 0v4h8z" />
                  </svg>
                </div>
                <h1 className="text-2xl font-semibold text-heading dark:text-white">Set Up Security</h1>
                <p className="text-sm text-muted dark:text-slate-400 mt-3">Your organization requires an extra security step. Let's do it in 3 minutes.</p>

                {/* Progress indicator */}
                <div className="flex items-center justify-center gap-2 mt-5">
                  {(['app', 'qrcode', 'verify'] as const).map((step, i) => {
                    const stepIndex = (['app', 'qrcode', 'verify'] as const).indexOf(wizardStep);
                    const isCompleted = i < stepIndex;
                    const isCurrent = step === wizardStep;
                    return (
                      <React.Fragment key={step}>
                        {i > 0 && (
                          <div className={`h-px w-6 transition-colors ${isCompleted ? 'bg-primary' : 'bg-gray-200 dark:bg-white/10'}`} />
                        )}
                        <div className={`w-7 h-7 rounded-full text-xs font-semibold flex items-center justify-center transition-colors ${
                          isCurrent ? 'bg-primary text-white' : isCompleted ? 'bg-primary/20 text-primary dark:bg-primary/30' : 'bg-gray-100 dark:bg-white/10 text-muted dark:text-slate-500'
                        }`}>
                          {isCompleted ? (
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                          ) : (
                            i + 1
                          )}
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>

              <div key={wizardStep}>
                {/* Step 1: Get an authenticator app */}
                {wizardStep === 'app' && (
                  <div className="space-y-5">
                    <div>
                      <h3 className="text-sm font-semibold text-heading dark:text-white mb-1.5">Get an authenticator app</h3>
                      <p className="text-xs text-muted dark:text-slate-400 mb-3">Download one (they all work the same way):</p>
                      <div className="space-y-2">
                        <div className="flex items-center gap-3 p-3  rounded-lg ">
                          <div className="shrink-0 w-8 h-8 bg-linear-to-br from-blue-500 to-green-500 rounded-lg flex items-center justify-center">
                            <span className="text-white text-xs font-bold">G</span>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-heading dark:text-white">Google Authenticator</p>
                            <p className="text-xs text-muted dark:text-slate-400">Most common, works great</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 p-3  rounded-lg ">
                          <div className="shrink-0 w-8 h-8 bg-linear-to-br from-blue-600 to-blue-400 rounded-lg flex items-center justify-center">
                            <span className="text-white text-xs font-bold">M</span>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-heading dark:text-white">Microsoft Authenticator</p>
                            <p className="text-xs text-muted dark:text-slate-400">If you use Microsoft 365</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 p-3  rounded-lg ">
                          <div className="shrink-0 w-8 h-8 bg-linear-to-br from-red-500 to-red-400 rounded-lg flex items-center justify-center">
                            <span className="text-white text-xs font-bold">A</span>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-heading dark:text-white">Authy</p>
                            <p className="text-xs text-muted dark:text-slate-400">User-friendly, backup codes included</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <p className="text-xs text-muted dark:text-slate-400 text-center">Already have an authenticator app? Tap Next.</p>

                    <button
                      type="button"
                      onClick={() => setWizardStep('qrcode')}
                      className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-light hover:shadow-[0_8px_24px_-8px_rgba(18,189,206,0.4)] focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-900 transition-all duration-300 cursor-pointer"
                    >
                      Next
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setCurrentStep({ step: 'credentials' });
                        setTotpCode('');
                        setError(null);
                      }}
                      className="w-full text-sm text-primary hover:underline dark:text-primary cursor-pointer"
                    >
                      ← Back to login
                    </button>
                  </div>
                )}

                {/* Step 2: Scan the QR code */}
                {wizardStep === 'qrcode' && (
                  <div className="space-y-5">
                    <p className="text-sm text-muted dark:text-slate-400 text-center">Open your authenticator app and tap <strong className="text-heading dark:text-white">+</strong>. Then scan this code.</p>

                    <div className="flex justify-center">
                      <div className="bg-white p-3 rounded-lg">
                        <QRCodeSVG value={currentStep.qrUri} size={160} level="H" marginSize={3} />
                      </div>
                    </div>

                    <p className="text-xs text-muted dark:text-slate-400 text-center">
                      Having trouble scanning?{' '}
                      <button
                        type="button"
                        onClick={() => setShowSharedKey(!showSharedKey)}
                        className="text-primary hover:underline font-medium"
                      >
                        Enter the code manually instead
                      </button>
                    </p>

                    {showSharedKey && (
                      <div className="p-3 bg-white dark:bg-white/10 rounded-lg border border-gray-200 dark:border-white/20">
                        <p className="text-xs text-muted dark:text-slate-400 mb-2">Paste this code into your app:</p>
                        <code className="text-sm font-mono text-heading dark:text-white block text-center select-all cursor-pointer p-2 bg-gray-50 dark:bg-white/5 rounded">
                          {currentStep.sharedKey}
                        </code>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setWizardStep('verify');
                        setTotpCode('');
                        setError(null);
                      }}
                      className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-light hover:shadow-[0_8px_24px_-8px_rgba(18,189,206,0.4)] focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-900 transition-all duration-300 cursor-pointer"
                    >
                      I scanned it, next
                    </button>

                    <button
                      type="button"
                      onClick={() => setWizardStep('app')}
                      className="w-full text-sm text-primary hover:underline dark:text-primary cursor-pointer"
                    >
                      ← Back
                    </button>
                  </div>
                )}

                {/* Step 3: Enter the verification code */}
                {wizardStep === 'verify' && (
                  <div className="space-y-5">
                    <p className="text-sm text-muted dark:text-slate-400 text-center">Your app should now show a 6-digit number that changes every 30 seconds.</p>

                    <div>
                      <label className="block text-xs font-medium text-body-secondary dark:text-slate-300 pl-1 mb-3">
                        Enter the code from your app
                      </label>
                      <TotpInput
                        value={totpCode}
                        onChange={setTotpCode}
                        onSubmit={() => handleTotpSetupEnable(totpCode)}
                        isLoading={loading}
                        error={error}
                      />
                    </div>

                    <p className="text-xs text-muted dark:text-slate-500 text-center">Once verified, you'll use your authenticator app every time you log in.</p>

                    <button
                      type="button"
                      onClick={() => {
                        setWizardStep('qrcode');
                        setTotpCode('');
                        setError(null);
                      }}
                      className="w-full text-sm text-primary hover:underline dark:text-primary cursor-pointer"
                    >
                      ← Back to scan
                    </button>
                  </div>
                )}
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
