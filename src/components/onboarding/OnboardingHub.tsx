import { useEffect, useRef } from 'react';
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
  const instanceRef = useRef<ReturnType<typeof introJs> | null>(null);

  // When the component unmounts (e.g. session expired and user is logged out), exit any
  // running tour so intro.js cleans up its DOM elements and body attributes.
  useEffect(() => {
    return () => {
      instanceRef.current?.exit(true);
    };
  }, []);

  const launchTour = (topicKey: string) => {
    onClose();
    const topic = tours[topicKey];
    const steps = topic.steps;

    // Switch to the first required tab, then wait for the DOM to settle
    const firstTab = steps.find((s) => s.tab !== undefined)?.tab ?? 1;
    onTabChange(firstTab);

    setTimeout(() => {
      const instance = introJs();
      instanceRef.current = instance;
      let currentStepIdx = 0;
      let prevStepIdx = 0;
      let cleanupInteractive: (() => void) | null = null;
      let wizardTrackedPage = 1;

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
        // Cancel any running simulation immediately so stray timers don't fire on the new step
        if (cleanupInteractive) {
          cleanupInteractive();
          cleanupInteractive = null;
        }

        prevStepIdx = currentStepIdx;
        currentStepIdx = stepIndex;
        const stepDef = steps[stepIndex];

        // Close TagEditModal when navigating out of wizard mode (e.g. pressing Back from first wizard step)
        if (steps[prevStepIdx]?.wizardStep && !stepDef?.wizardStep) {
          const cancelBtn = document.querySelector('[data-tour="tag-edit-cancel"]') as HTMLElement | null;
          cancelBtn?.click();
        }

        // Set wizard mode BEFORE intro.js renders so the CSS is already active when the
        // helperLayer is painted (avoids the 150 ms window where it shows with dark overlay).
        if (stepDef?.wizardStep) {
          // Scroll page to top so intro.js's absolute positioning (getBoundingClientRect + scrollY)
          // matches viewport-fixed coordinates for elements inside the position:fixed modal.
          // The modal covers the viewport so the user doesn't see this scroll.
          window.scrollTo({ top: 0, behavior: 'instant' });

          document.body.setAttribute('data-introjs-in-wizard', 'true');

          // Reset tracker whenever we first enter the wizard section of the tour
          if (!steps[prevStepIdx]?.wizardStep) {
            wizardTrackedPage = 1;
          }

          // Backward navigation: if user pressed Back while inside the wizard, navigate
          // the modal backward to match the target tour step's wizardPage.
          if (stepIndex < prevStepIdx && stepDef.wizardPage !== undefined) {
            const diff = wizardTrackedPage - stepDef.wizardPage;
            if (diff > 0) {
              const backBtn = document.querySelector('[data-tour="wizard-back-button"]') as HTMLButtonElement | null;
              for (let i = 0; i < diff; i++) {
                backBtn?.click();
              }
              wizardTrackedPage = stepDef.wizardPage;
            }
          }
        } else {
          document.body.removeAttribute('data-introjs-in-wizard');
        }

        if (stepDef?.tab !== undefined) {
          onTabChange(stepDef.tab);
        }
        // Always re-query the element — intro.js sets element=floatingPlaceholder and
        // position="floating" when an element isn't in the DOM at start() time.
        // The !element guard was always false because the placeholder is truthy.
        const items = (instance as unknown as { _steps: Array<{ element: HTMLElement | undefined; position: string }> })._steps;
        if (items && items[stepIndex] && stepDef?.element) {
          const el = document.querySelector(stepDef.element) as HTMLElement | null;
          if (el) {
            items[stepIndex].element = el;
            items[stepIndex].position = stepDef.position ?? 'bottom';
          }
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

        // Hide the helperLayer for any step that has no element — there is nothing to highlight,
        // and leaving it visible causes a stale bounding-box to show from a prior step.
        if (!stepDef?.element) {
          setTimeout(() => {
            const helperLayer = document.querySelector('.introjs-helperLayer') as HTMLElement | null;
            if (helperLayer) helperLayer.style.setProperty('display', 'none', 'important');
          }, 30);
        }

        // Scroll to top before the step content renders (e.g. to ensure the tree is in view)
        if (stepDef?.scrollToTopFirst) {
          window.scrollTo({ top: 0, behavior: 'instant' });
        }

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
        } else if (stepDef?.simulateClick) {
          if (nextBtn) { nextBtn.disabled = true; nextBtn.style.opacity = '0.35'; nextBtn.style.pointerEvents = 'none'; }
          document.body.setAttribute('data-introjs-simulating', 'true');
          const t = setTimeout(() => {
            (document.querySelector(stepDef.simulateClick!) as HTMLElement)?.click();
            document.body.removeAttribute('data-introjs-simulating');
            // Re-anchor the current step's element in case new DOM appeared after the click
            setTimeout(() => {
              if (nextBtn) { nextBtn.disabled = false; nextBtn.style.opacity = ''; nextBtn.style.pointerEvents = ''; }
              instance.refresh();
            }, 400);
          }, 1000);
          cleanupInteractive = () => {
            clearTimeout(t);
            document.body.removeAttribute('data-introjs-simulating');
            if (nextBtn) { nextBtn.disabled = false; nextBtn.style.opacity = ''; nextBtn.style.pointerEvents = ''; }
          };
        } else if (stepDef?.simulateType) {
          const { target, value, charDelay = 45 } = stepDef.simulateType;
          if (nextBtn) { nextBtn.disabled = true; nextBtn.style.opacity = '0.35'; nextBtn.style.pointerEvents = 'none'; }
          document.body.setAttribute('data-introjs-simulating', 'true');
          const savedScrollX = window.scrollX;
          const savedScrollY = window.scrollY;
          let i = 0;
          let current = '';
          const simTimers: ReturnType<typeof setTimeout>[] = [];
          const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
          const typeNext = () => {
            const input = document.querySelector(target) as HTMLInputElement | null;
            if (!input || i >= value.length) {
              window.scrollTo({ top: savedScrollY, left: savedScrollX, behavior: 'instant' });
              document.body.removeAttribute('data-introjs-simulating');
              if (nextBtn) { nextBtn.disabled = false; nextBtn.style.opacity = ''; nextBtn.style.pointerEvents = ''; }
              return;
            }
            current += value[i++];
            nativeSetter?.call(input, current);
            input.dispatchEvent(new Event('input', { bubbles: true }));
            simTimers.push(setTimeout(typeNext, charDelay));
          };
          simTimers.push(setTimeout(typeNext, 900));
          cleanupInteractive = () => {
            simTimers.forEach(clearTimeout);
            window.scrollTo({ top: savedScrollY, left: savedScrollX, behavior: 'instant' });
            document.body.removeAttribute('data-introjs-simulating');
            if (nextBtn) { nextBtn.disabled = false; nextBtn.style.opacity = ''; nextBtn.style.pointerEvents = ''; }
          };
        } else if (stepDef?.simulateSequence) {
          if (nextBtn) { nextBtn.disabled = true; nextBtn.style.opacity = '0.35'; nextBtn.style.pointerEvents = 'none'; }
          document.body.setAttribute('data-introjs-simulating', 'true');
          const simTimers: ReturnType<typeof setTimeout>[] = [];
          let lastAt = 0;
          const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
          // Snapshot scroll position so any click-triggered browser scroll can be undone
          const savedScrollX = window.scrollX;
          const savedScrollY = window.scrollY;
          // RAF scroll lock — runs every frame and immediately snaps back any scroll change
          let scrollLockId: ReturnType<typeof requestAnimationFrame> | null = null;
          const lockScroll = () => {
            if (window.scrollY !== savedScrollY || window.scrollX !== savedScrollX) {
              window.scrollTo({ top: savedScrollY, left: savedScrollX, behavior: 'instant' });
            }
            scrollLockId = requestAnimationFrame(lockScroll);
          };
          scrollLockId = requestAnimationFrame(lockScroll);
          const stopScrollLock = () => {
            if (scrollLockId !== null) { cancelAnimationFrame(scrollLockId); scrollLockId = null; }
          };
          stepDef.simulateSequence.forEach((action) => {
            if (action.at > lastAt) lastAt = action.at;
            const t = setTimeout(() => {
              const el = document.querySelector(action.target) as HTMLElement | null;
              if (!el) return;
              if (action.type === 'click') {
                el.click();
              } else if (action.type === 'select') {
                // Support both native <select> and SearchableSelect (custom dropdown)
                const selectEl = (el.tagName === 'SELECT' ? el : el.querySelector('select')) as HTMLSelectElement | null;
                if (selectEl) {
                  const targetValue =
                    action.value === 'first'
                      ? Array.from(selectEl.options).find((o) => o.value !== '')?.value ?? ''
                      : action.value ?? '';
                  const nativeSelectSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
                  nativeSelectSetter?.call(selectEl, targetValue);
                  selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                } else {
                  // SearchableSelect: click the trigger button, then find and click the matching option
                  const triggerBtn = el.querySelector('button') as HTMLElement | null;
                  if (triggerBtn) {
                    triggerBtn.click();
                    // Wait for the dropdown to render in a portal, then click the option
                    simTimers.push(setTimeout(() => {
                      const allButtons = document.querySelectorAll('.max-h-60 button');
                      for (const btn of allButtons) {
                        const btnText = btn.textContent?.trim() ?? '';
                        if (btnText === action.value || btn.querySelector('span')?.textContent?.trim() === action.value) {
                          (btn as HTMLElement).click();
                          break;
                        }
                      }
                    }, 300));
                  }
                }
              } else if (action.type === 'type' && action.value !== undefined) {
                const inputEl = el as HTMLInputElement;
                if (action.value === '') {
                  // Clear the input
                  nativeSetter?.call(inputEl, '');
                  inputEl.dispatchEvent(new Event('input', { bubbles: true }));
                } else {
                  let ci = 0;
                  let cur = '';
                  const typeChar = () => {
                    if (ci >= (action.value?.length ?? 0)) return;
                    cur += action.value![ci++];
                    nativeSetter?.call(inputEl, cur);
                    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
                    if (ci < (action.value?.length ?? 0)) simTimers.push(setTimeout(typeChar, 45));
                  };
                  typeChar();
                }
              }
            }, action.at);
            simTimers.push(t);
          });
          const doneTimer = setTimeout(() => {
            stopScrollLock();
            document.body.removeAttribute('data-introjs-simulating');
            if (nextBtn) { nextBtn.disabled = false; nextBtn.style.opacity = ''; nextBtn.style.pointerEvents = ''; }
            // Track wizard page advances driven by wizard-next-button simulation clicks
            if (stepDef.simulateSequence?.some((a) => a.target === '[data-tour="wizard-next-button"]')) {
              wizardTrackedPage++;
            }
          }, lastAt + 600);
          simTimers.push(doneTimer);
          cleanupInteractive = () => {
            stopScrollLock();
            simTimers.forEach(clearTimeout);
            document.body.removeAttribute('data-introjs-simulating');
            if (nextBtn) { nextBtn.disabled = false; nextBtn.style.opacity = ''; nextBtn.style.pointerEvents = ''; }
          };
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
        const prevStep = steps[prevStepIdx];
        // After a simulateClick step new DOM may still be animating in — wait longer
        const delay = prevStep?.simulateClick ? 500 : 150;

        setTimeout(() => {
          const items = (instance as unknown as { _steps: Array<{ element: HTMLElement | undefined; position: string }> })._steps;
          const stepDef = steps[currentStepIdx];

          // Helper: query the DOM for the step's element and update both element + position.
          // Must always re-query (not reuse items[i].element) because intro.js replaces a
          // missing element with a floating placeholder — which is truthy — so the old guard
          // `!items[i].element` never fired.
          const reanchor = (): HTMLElement | null => {
            if (!stepDef?.element || !items || !items[currentStepIdx]) return null;
            const el = document.querySelector(stepDef.element) as HTMLElement | null;
            if (el) {
              items[currentStepIdx].element = el;
              items[currentStepIdx].position = stepDef.position ?? 'bottom';
            }
            return el;
          };

          // Restore the helperLayer only for steps that actually have an element present in the DOM.
          // Keeping it hidden for element-less steps (or steps whose element isn't rendered yet)
          // prevents stale bounding-boxes from showing at wrong positions.
          if (!stepDef?.wizardStep && stepDef?.element) {
            const targetEl = document.querySelector(stepDef.element);
            if (targetEl) {
              // Remove wizard-mode position:fixed !important overrides so refresh() can reposition normally
              ['.introjs-helperLayer', '.introjs-tooltipReferenceLayer'].forEach((sel) => {
                const node = document.querySelector(sel) as HTMLElement | null;
                if (!node) return;
                node.style.removeProperty('display');
                node.style.removeProperty('position');
                node.style.removeProperty('top');
                node.style.removeProperty('left');
                node.style.removeProperty('width');
                node.style.removeProperty('height');
                node.style.removeProperty('transition');
              });
            }
          }

          if (prevStep?.simulateClick && stepDef?.element) {
            // After a simulateClick the new DOM may still be animating — poll until found
            const tryRefresh = (attemptsLeft: number) => {
              const el = reanchor();
              if (el) {
                // Wizard steps skip instance.refresh() — manual position:fixed override handles them
                if (!stepDef.wizardStep) instance.refresh();
              } else if (attemptsLeft > 0) {
                setTimeout(() => tryRefresh(attemptsLeft - 1), 150);
              }
            };
            tryRefresh(6); // up to ~900 ms of retries
          } else {
            reanchor();
            // Wizard steps skip instance.refresh() — calling it would position the helperLayer using
            // document-absolute coords (getBoundingClientRect + scrollY), which is wrong for elements
            // inside a position:fixed modal. The manual override below uses position:fixed instead.
            if (stepDef?.element && !stepDef.wizardStep) instance.refresh();
          }

          applyStepState();

          // Wizard steps: intro.js uses document-absolute positioning (getBoundingClientRect + scrollY)
          // which is wrong for elements inside the position:fixed modal. Override both layers to
          // use position:fixed with raw viewport coordinates so the highlight lands correctly.
          const wizardDef = steps[currentStepIdx];
          if (wizardDef?.wizardStep && wizardDef.element) {
            setTimeout(() => {
              const el = document.querySelector(wizardDef.element!) as HTMLElement | null;
              if (!el) return;
              const r = el.getBoundingClientRect();
              const pad = 4;
              ['.introjs-helperLayer', '.introjs-tooltipReferenceLayer'].forEach((sel) => {
                const node = document.querySelector(sel) as HTMLElement | null;
                if (!node) return;
                // Remove any prior display:none set by elementless-wizard-step logic
                node.style.removeProperty('display');
                // Suppress CSS transitions so the layer jumps directly to the correct position
                node.style.setProperty('transition', 'none', 'important');
                node.style.setProperty('position', 'fixed', 'important');
                node.style.setProperty('top', `${r.top - pad}px`, 'important');
                node.style.setProperty('left', `${r.left - pad}px`, 'important');
                node.style.setProperty('width', `${r.width + pad * 2}px`, 'important');
                node.style.setProperty('height', `${r.height + pad * 2}px`, 'important');
              });
            }, 60);
          }
        }, delay);
      });

      const teardown = () => {
        instanceRef.current = null;
        if (cleanupInteractive) {
          cleanupInteractive();
          cleanupInteractive = null;
        }
        wizardTrackedPage = 1;
        document.body.removeAttribute('data-introjs-interactive');
        document.body.removeAttribute('data-introjs-watch');
        document.body.removeAttribute('data-introjs-simulating');
        document.body.removeAttribute('data-introjs-in-wizard');
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
