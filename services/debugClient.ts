// Mock services
export class DebugClient {
  static getInstance() {
    return new DebugClient();
  }

  async log(level: string, message: string, data?: any, category?: string) {
    console.log(`[${level.toUpperCase()}] ${category || 'DEBUG'}: ${message}`, data);
  }
}

export interface PageStatus {
  pageNumber: number;
  status: string;
  method: string;
}

export const mockTypes = {
  PageStatus
};