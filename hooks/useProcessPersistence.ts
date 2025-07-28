import { useState, useCallback } from 'react';

/**
 * Defines the shape of the state that will be persisted in localStorage.
 * It includes the actual process data, information about the file being
 * processed, and a timestamp.
 */
export interface PersistentProcessState<T> {
  processData: T;
  fileInfo: {
    name: string;
    size: number;
    lastModified: number;
  } | null;
  timestamp: number;
}

/**
 * A custom hook to manage persisting a complex process state to localStorage.
 * It is designed to save and restore the state of a process tied to a specific file.
 *
 * @param storageKey A unique key for the localStorage entry.
 * @returns An object with the current state and functions to manage it.
 */
export const useProcessPersistence = <T>(storageKey: string) => {
  const [persistedState, setPersistedState] = useState<PersistentProcessState<T> | null>(null);

  /**
   * Attempts to load a saved process state from localStorage for a given file.
   * It checks if the file's properties match the saved state.
   *
   * @param file The file to check for a saved state.
   * @returns The saved process data if a match is found, otherwise null.
   */
  const loadState = useCallback((file: File): T | null => {
    try {
      const item = window.localStorage.getItem(storageKey);
      if (item) {
        const savedState = JSON.parse(item) as PersistentProcessState<T>;
        // Check if the saved state corresponds to the selected file
        if (
          savedState.fileInfo &&
          savedState.fileInfo.name === file.name &&
          savedState.fileInfo.size === file.size &&
          savedState.fileInfo.lastModified === file.lastModified
        ) {
          console.log(`Found and loaded existing process state for: ${file.name}`);
          setPersistedState(savedState);
          return savedState.processData;
        }
      }
    } catch (error) {
      console.error(`Error reading state from localStorage for key "${storageKey}":`, error);
    }
    console.log(`No existing process state found for: ${file.name}`);
    setPersistedState(null);
    return null;
  }, [storageKey]);

  /**
   * Saves the current process state to localStorage, associating it with the file.
   *
   * @param processData The current state of the process to save.
   * @param file The file being processed.
   */
  const saveState = useCallback((processData: T, file: File) => {
    try {
      const stateToSave: PersistentProcessState<T> = {
        processData,
        fileInfo: {
          name: file.name,
          size: file.size,
          lastModified: file.lastModified,
        },
        timestamp: Date.now(),
      };
      window.localStorage.setItem(storageKey, JSON.stringify(stateToSave));
      setPersistedState(stateToSave);
    } catch (error) {
      console.error(`Error saving state to localStorage for key "${storageKey}":`, error);
    }
  }, [storageKey]);

  /**
   * Clears the saved state from localStorage.
   */
  const clearState = useCallback(() => {
    try {
      window.localStorage.removeItem(storageKey);
      setPersistedState(null);
    } catch (error) {
      console.error(`Error clearing state from localStorage for key "${storageKey}":`, error);
    }
  }, [storageKey]);

  return {
    persistedProcessState: persistedState?.processData ?? null,
    loadState,
    saveState,
    clearState,
  };
};
