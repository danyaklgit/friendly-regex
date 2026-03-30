import { AnimatePresence, motion } from 'motion/react';
import introJs from 'intro.js';
import './introjs-theme.css';
import { tours } from './tourSteps';

interface OnboardingHubProps {
  open: boolean;
  onClose: () => void;
  onTabChange: (index: number) => void;
}

export function OnboardingHub({ open, onClose, onTabChange }: OnboardingHubProps) {
  const launchTour = (topicKey: string) => {
    onClose();
    const topic = tours[topicKey];
    const steps = topic.steps;

    // Switch to the first required tab, then wait for the DOM to settle
    const firstTab = steps.find((s) => s.tab !== undefined)?.tab ?? 1;
    onTabChange(firstTab);

    setTimeout(() => {
      const instance = introJs();
      let currentStepIdx = 0;
      let cleanupInteractive: (() => void) | null = null;

      instance.setOptions({
        steps: steps.map((s) => ({
          element: s.element ?? undefined,
          title: s.title,
          intro: s.intro,
          position: s.position ?? 'bottom',
        })),
        showProgress: true,
        showBullets: false,
        exitOnOverlayClick: true,
        scrollToElement: true,
        nextLabel: 'Next',
        prevLabel: 'Back',
        skipLabel: 'Skip',
        doneLabel: 'Done',
      });

      // Track current step and switch tabs mid-tour
      instance.onBeforeChange((_targetElement, stepIndex) => {
        currentStepIdx = stepIndex;
        const stepDef = steps[stepIndex];
        if (stepDef?.tab !== undefined) {
          onTabChange(stepDef.tab);
        }
        // Pre-resolve element if it wasn't in DOM when start() was called
        const items = (instance as unknown as { _steps: Array<{ element: HTMLElement | undefined }> })._steps;
        if (items && items[stepIndex] && stepDef?.element && !items[stepIndex].element) {
          const el = document.querySelector(stepDef.element) as HTMLElement | null;
          if (el) items[stepIndex].element = el;
        }
        return true;
      });

      const applyStepState = () => {
        // Tear down any previous interactive listener / observer
        if (cleanupInteractive) {
          cleanupInteractive();
          cleanupInteractive = null;
        }

        const stepDef = steps[currentStepIdx];

        // Disable Back on first step
        const prevBtn = document.querySelector('.introjs-prevbutton') as HTMLButtonElement | null;
        if (prevBtn) {
          if (currentStepIdx === 0) {
            prevBtn.disabled = true;
            prevBtn.style.pointerEvents = 'none';
            prevBtn.style.opacity = '0.35';
          } else {
            prevBtn.disabled = false;
            prevBtn.style.pointerEvents = '';
            prevBtn.style.opacity = '';
          }
        }

        const nextBtn = document.querySelector('.introjs-nextbutton') as HTMLButtonElement | null;

        if (stepDef?.advanceOnAppear) {
          // Hide Next, pulse the highlighted element; auto-advance when target appears in DOM
          if (nextBtn) nextBtn.style.display = 'none';
          document.body.setAttribute('data-introjs-interactive', 'true');

          const advance = () => {
            document.body.removeAttribute('data-introjs-interactive');
            if (nextBtn) nextBtn.style.display = '';
            // Re-resolve all step elements that were null at start() — new DOM content is now available
            const allItems = (instance as unknown as { _steps: Array<{ element: HTMLElement | undefined }> })._steps;
            if (allItems) {
              steps.forEach((s, i) => {
                if (s.element && allItems[i] && !allItems[i].element) {
                  const el = document.querySelector(s.element) as HTMLElement | null;
                  if (el) allItems[i].element = el;
                }
              });
            }
            setTimeout(() => instance.nextStep(), 350);
          };

          if (document.querySelector(stepDef.advanceOnAppear)) {
            advance();
          } else {
            const observer = new MutationObserver(() => {
              if (document.querySelector(stepDef.advanceOnAppear!)) {
                observer.disconnect();
                advance();
              }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            cleanupInteractive = () => observer.disconnect();
          }
        } else if (stepDef?.advanceOnVisible) {
          // Hide Next; watch for the target element to lose 'invisible' class, then auto-advance
          if (nextBtn) nextBtn.style.display = 'none';
          document.body.setAttribute('data-introjs-watch', 'true');

          const watchEl = document.querySelector(stepDef.advanceOnVisible) as HTMLElement | null;
          if (watchEl) {
            const advance = () => {
              document.body.removeAttribute('data-introjs-watch');
              if (nextBtn) nextBtn.style.display = '';
              setTimeout(() => instance.nextStep(), 350);
            };

            if (!watchEl.classList.contains('invisible')) {
              // Already visible — advance immediately
              advance();
            } else {
              const observer = new MutationObserver(() => {
                if (!watchEl.classList.contains('invisible')) {
                  observer.disconnect();
                  advance();
                }
              });
              observer.observe(watchEl, { attributes: true, attributeFilter: ['class'] });
              cleanupInteractive = () => observer.disconnect();
            }
          }
        } else if (stepDef?.interactive && nextBtn) {
          nextBtn.style.display = 'none';
          document.body.setAttribute('data-introjs-interactive', 'true');

          const targetEl = stepDef.element
            ? (document.querySelector(stepDef.element) as HTMLElement | null)
            : null;

          if (targetEl) {
            const advance = () => {
              document.body.removeAttribute('data-introjs-interactive');
              if (nextBtn) nextBtn.style.display = '';
              setTimeout(() => instance.nextStep(), 350);
            };

            const btn = targetEl as HTMLButtonElement;
            if (btn.disabled) {
              // Element is currently disabled — watch for it to become enabled
              const observer = new MutationObserver(() => {
                if (!btn.disabled) {
                  observer.disconnect();
                  btn.addEventListener('click', advance, { once: true });
                  cleanupInteractive = () => btn.removeEventListener('click', advance);
                }
              });
              observer.observe(btn, { attributes: true, attributeFilter: ['disabled'] });
              cleanupInteractive = () => {
                observer.disconnect();
                btn.removeEventListener('click', advance);
              };
            } else {
              targetEl.addEventListener('click', advance, { once: true });
              cleanupInteractive = () => targetEl.removeEventListener('click', advance);
            }
          }
        } else {
          if (nextBtn) nextBtn.style.display = '';
          document.body.removeAttribute('data-introjs-interactive');
        }
      };

      // After each step renders: re-anchor element if it wasn't in the DOM at start()
      // (elements on other tabs resolve to null at start time, need to re-query after tab switch)
      instance.onAfterChange(() => {
        setTimeout(() => {
          const items = (instance as unknown as { _steps: Array<{ element: HTMLElement | undefined }> })._steps;
          const stepDef = steps[currentStepIdx];
          if (items && stepDef?.element && !items[currentStepIdx]?.element) {
            const el = document.querySelector(stepDef.element) as HTMLElement | null;
            if (el) {
              items[currentStepIdx].element = el;
              instance.refresh();
            }
          }
          applyStepState();
        }, 150);
      });

      const teardown = () => {
        if (cleanupInteractive) {
          cleanupInteractive();
          cleanupInteractive = null;
        }
        document.body.removeAttribute('data-introjs-interactive');
        document.body.removeAttribute('data-introjs-watch');
      };

      instance.oncomplete(teardown);
      instance.onexit(teardown);

      instance.start();
    }, 200);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-9998 bg-black/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />

          {/* Centered panel */}
          <motion.div
            className="fixed inset-0 z-9999 flex items-center justify-center p-6 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <motion.div
              className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-lg pointer-events-auto"
              initial={{ scale: 0.96, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: 10 }}
              transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            >
              {/* Header */}
              <div className="px-6 pt-5 pb-4 border-b border-border flex items-start justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-heading">What would you like to learn?</h2>
                  <p className="text-xs text-muted mt-0.5">Pick a topic and follow the guided tour.</p>
                </div>
                <button
                  onClick={onClose}
                  className="text-muted hover:text-heading transition-colors p-1 rounded-md hover:bg-surface-hover -mt-0.5 -mr-1"
                  aria-label="Close"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Topic grid */}
              <div className="p-4 grid grid-cols-2 gap-2.5">
                {Object.entries(tours).map(([key, topic], i) => (
                  <motion.button
                    key={key}
                    className="flex items-start gap-3 p-3.5 rounded-xl border border-border bg-surface-secondary hover:bg-surface-hover hover:border-primary/40 transition-all text-left cursor-pointer group"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 + i * 0.045, type: 'spring', stiffness: 400, damping: 26 }}
                    onClick={() => launchTour(key)}
                  >
                    <span className="text-lg mt-0.5 select-none">{topic.icon}</span>
                    <div>
                      <p className="text-xs font-semibold text-heading leading-snug group-hover:text-primary transition-colors">
                        {topic.label}
                      </p>
                      <p className="text-[11px] text-muted mt-0.5 leading-snug">{topic.description}</p>
                    </div>
                  </motion.button>
                ))}
              </div>

              {/* Footer hint */}
              <div className="px-5 pb-4 pt-0 text-center">
                <p className="text-[10px] text-faint">You can reopen this guide anytime from the help button in the header.</p>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
