// Ambient type declarations

declare module '@google/genai';

declare namespace NodeJS {
  interface ProcessEnv {
    GEMINI_API_KEY?: string;
    API_KEY?: string;
  }
}

declare var process: {
  env: NodeJS.ProcessEnv;
};
