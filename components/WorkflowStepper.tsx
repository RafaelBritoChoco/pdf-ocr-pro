
import React from 'react';
import { CheckCircle } from './icons';

interface WorkflowStepperProps {
  steps: string[];
  currentStep: number;
}

export const WorkflowStepper: React.FC<WorkflowStepperProps> = ({ steps, currentStep }) => {
  return (
    <nav aria-label="Progress">
      <ol role="list" className="flex items-center justify-center">
        {steps.map((step, stepIdx) => (
          <li key={step} className={`relative ${stepIdx !== steps.length - 1 ? 'pr-8 sm:pr-20' : ''}`}>
            {stepIdx < currentStep ? (
              <>
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <div className="h-0.5 w-full bg-primary-500" />
                </div>
                <a href="#" className="relative flex h-8 w-8 items-center justify-center bg-primary-500 rounded-full hover:bg-primary-600">
                  <CheckCircle className="h-5 w-5 text-white" aria-hidden="true" />
                  <span className="sr-only">{step}</span>
                </a>
              </>
            ) : stepIdx === currentStep ? (
              <>
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <div className="h-0.5 w-full bg-slate-200 dark:bg-slate-700" />
                </div>
                <a href="#" className="relative flex h-8 w-8 items-center justify-center bg-white dark:bg-slate-800 border-2 border-primary-500 rounded-full" aria-current="step">
                  <span className="h-2.5 w-2.5 bg-primary-500 rounded-full" aria-hidden="true" />
                  <span className="sr-only">{step}</span>
                </a>
              </>
            ) : (
              <>
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <div className="h-0.5 w-full bg-slate-200 dark:bg-slate-700" />
                </div>
                <div className="relative flex h-8 w-8 items-center justify-center bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600 rounded-full">
                  <span className="sr-only">{step}</span>
                </div>
              </>
            )}
             <div className="absolute top-10 left-1/2 -translate-x-1/2 w-max text-center">
                <span className={`text-xs font-medium ${stepIdx <= currentStep ? 'text-primary-600 dark:text-primary-400' : 'text-slate-500 dark:text-slate-400'}`}>{step}</span>
            </div>
          </li>
        ))}
      </ol>
    </nav>
  );
};