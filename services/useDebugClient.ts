import { useMemo } from 'react';
import { DebugClient } from './debugClient';

export const useDebugClient = () => {
  const client = useMemo(() => DebugClient.getInstance(), []);
  return client;
};
