import type { WizardStep } from '../../types';

interface WizardStepIndicatorProps {
  currentStep: WizardStep;
  onStepClick: (step: WizardStep) => void;
  canLeaveCurrentStep?: boolean;
}

const steps: { step: WizardStep; label: string }[] = [
  { step: 1, label: 'Basic Info' },
  { step: 2, label: 'Rules' },
  { step: 3, label: 'Attributes' },
  { step: 4, label: 'Review' },
];

export function WizardStepIndicator({ currentStep, onStepClick, canLeaveCurrentStep = true }: WizardStepIndicatorProps) {
  return (
    <nav className="flex items-center justify-center gap-2 mb-6">
      {steps.map(({ step, label }, i) => {
        const isActive = step === currentStep;
        const isCompleted = step < currentStep;
        const isDisabled = !isActive && !canLeaveCurrentStep;
        return (
          <div key={step} className="flex items-center">
            {i > 0 && (
              <div
                className={`w-8 h-px mx-1 ${
                  step <= currentStep ? 'bg-blue-400' : 'bg-gray-200'
                }`}
              />
            )}
            <button
              onClick={() => onStepClick(step)}
              disabled={isDisabled}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors
                ${
                  isDisabled
                    ? 'bg-gray-100 text-gray-400 opacity-50 cursor-not-allowed'
                    : isActive
                    ? 'bg-blue-600 text-white cursor-pointer'
                    : isCompleted
                    ? 'bg-blue-100 text-blue-700 hover:bg-blue-200 cursor-pointer'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200 cursor-pointer'
                }`}
            >
              <span
                className={`flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold
                  ${
                    isActive
                      ? 'bg-white text-blue-600'
                      : isCompleted
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-300 text-white'
                  }`}
              >
                {isCompleted ? (
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  step
                )}
              </span>
              {label}
            </button>
          </div>
        );
      })}
    </nav>
  );
}
