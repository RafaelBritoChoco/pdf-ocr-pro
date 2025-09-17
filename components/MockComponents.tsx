// Mock components that don't exist yet
import React from 'react';

export const DetailedStatus: React.FC<any> = (props) => (
  <div className="p-4 bg-gray-50 rounded-lg">
    <h3 className="font-medium">Processing Status</h3>
    <p className="text-sm text-gray-600">Step {props.currentStep}</p>
  </div>
);

export const DebugPanel: React.FC<any> = (props) => (
  <div className="p-4 bg-gray-900 text-white rounded-lg">
    <h3 className="font-medium">Debug Information</h3>
    <pre className="text-sm mt-2">{JSON.stringify(props, null, 2)}</pre>
  </div>
);

export const AutoResumeDialog: React.FC<any> = (props) => (
  <div className="p-4 bg-blue-50 rounded-lg">
    <p>Auto-resume functionality</p>
  </div>
);