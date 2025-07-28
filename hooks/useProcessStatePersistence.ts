import { useState, useCallback } from 'react';

// Define the shape of the state we want to persist
export interface PersistedState<T> {
  data: T;
  fileInfo: {
    name:string;
    size: number;
    lastModified: number;
  } | null;
  timestamp: number;
}

// A key for storing the list of managed process states
// const PROCESS_HISTORY_KEY = 'pdf_process_history';

/**
 * A custom hook to manage persisting process state to localStorage.
 * It saves the state associated with a specific file.
 *
 * @param key A unique key for the localStorage entry.
 * @param initialState The initial state for the data.
 * @returns A set of functions and the state itself.
 */
export const useProcessStatePersistence = <T>(key: string, initialState: T) => {
  
  const [state, setState] = useState<PersistedState<T>>({
    data: initialState,
    fileInfo: null,
    timestamp: Date.now(),
  });

  // Function to load state for a specific file
  const loadStateForFile = useCallback((file: File): boolean => {
    try {
      const item = window.localStorage.getItem(key);
      if (item) {
        const parsed = JSON.parse(item) as PersistedState<T>;
        if (
          parsed.fileInfo &&
          parsed.fileInfo.name === file.name &&
          parsed.fileInfo.size === file.size &&
          parsed.fileInfo.lastModified === file.lastModified
        ) {
          console.log(`Restoring state for file: ${file.name}`);
          setState(parsed);
          return true; // State was found and restored
        }
      }
    } catch (error) {
      console.error(`Error reading localStorage key “${key}”:`, error);
    }
    // No matching state found, reset to initial for the new file
    setState({
      data: initialState,
      fileInfo: {
        name: file.name,
        size: file.size,
        lastModified: file.lastModified,
      },
      timestamp: Date.now(),
    });
    return false; // No state was restored
  }, [key, initialState]);

  // Function to update and persist the state
  const updateState = useCallback((newState: Partial<T>) => {
    setState(prevState => {
      const updatedData = { ...prevState.data, ...newState };
      const updatedState = { ...prevState, data: updatedData, timestamp: Date.now() };
      
      try {
        window.localStorage.setItem(key, JSON.stringify(updatedState));
      } catch (error) {
        console.error(`Error writing to localStorage key “${key}”:`, error);
      }
      
      return updatedState;
    });
  }, [key]);

  // Function to clear the state from memory and localStorage
  const clearState = useCallback(() => {
    setState({
      data: initialState,
      fileInfo: null,
      timestamp: Date.now(),
    });
    window.localStorage.removeItem(key);
  }, [key, initialState]);

  return {
    state: state.data,
    fileInfo: state.fileInfo,
    loadStateForFile,
    updateState,
    clearState,
  };
};
