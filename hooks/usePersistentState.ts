import { useState, useCallback } from 'react';

// Define the shape of the state we want to persist
export interface PersistedState<T> {
  data: T;
  fileInfo: {
    name: string;
    size: number;
    lastModified: number;
  } | null;
  timestamp: number | null;
}

// A custom hook to manage persisting state to localStorage
export const usePersistentState = <T>(key: string, initialState: T) => {
  const [state, setState] = useState<PersistedState<T>>(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (item) {
        const parsed = JSON.parse(item) as PersistedState<T>;
        // Optional: Add a check for how old the data is, e.g., expire after 24 hours
        const oneDay = 24 * 60 * 60 * 1000;
        if (parsed.timestamp && (Date.now() - parsed.timestamp < oneDay)) {
          return parsed;
        }
      }
    } catch (error) {
      console.error(`Error reading localStorage key “${key}”:`, error);
    }
    // Return a fresh initial state if nothing is found or data is expired
    return { data: initialState, fileInfo: null, timestamp: null };
  });

  // Function to update the state and persist it
  const setPersistedState = useCallback((newData: T, file: File | null) => {
    const newState: PersistedState<T> = {
      data: newData,
      fileInfo: file ? {
        name: file.name,
        size: file.size,
        lastModified: file.lastModified,
      } : null,
      timestamp: Date.now(),
    };
    setState(newState);
    try {
      window.localStorage.setItem(key, JSON.stringify(newState));
    } catch (error) {
      console.error(`Error writing to localStorage key “${key}”:`, error);
    }
  }, [key]);

  // Function to clear the persisted state
  const clearPersistedState = useCallback(() => {
    setState({ data: initialState, fileInfo: null, timestamp: null });
    window.localStorage.removeItem(key);
  }, [key, initialState]);

  return [state, setPersistedState, clearPersistedState] as const;
};
