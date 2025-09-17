import React from 'react';

interface WorkflowStepperProps {
  currentStep: number;
}

export const WorkflowStepper: React.FC<WorkflowStepperProps> = ({ currentStep }) => {
  const steps = [
    'Upload PDF',
    'Configure',
    'Process',
    'Review'
  ];

  return (
    <div className="flex items-center justify-center space-x-4 mb-6">
      {steps.map((step, index) => (
        <div key={index} className="flex items-center">
          <div 
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              index <= currentStep 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-200 text-gray-600'
            }`}
          >
            {index + 1}
          </div>
          <span className={`ml-2 text-sm ${
            index <= currentStep ? 'text-gray-900' : 'text-gray-400'
          }`}>
            {step}
          </span>
          {index < steps.length - 1 && (
            <div className={`w-8 h-0.5 ml-4 ${
              index < currentStep ? 'bg-blue-600' : 'bg-gray-200'
            }`} />
          )}
        </div>
      ))}
    </div>
  );
};