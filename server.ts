import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Sistema de logs e debug para LLM monitoring
interface LogEntry {
  id: string;
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  data?: any;
  source: string;
}

interface ErrorEntry {
  id: string;
  timestamp: Date;
  error: string;
  stack?: string;
  context?: any;
}

const logs: LogEntry[] = [];
const errors: ErrorEntry[] = [];
const MAX_LOGS = 1000;
const MAX_ERRORS = 100;

// Função helper para logging
function addLog(level: LogEntry['level'], message: string, data?: any, source: string = 'server') {
  const log: LogEntry = {
    id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
    timestamp: new Date(),
    level,
    message,
    data,
    source
  };
  
  logs.unshift(log);
  if (logs.length > MAX_LOGS) logs.pop();
  
  // Log no console também
  console.log(`[${level.toUpperCase()}] ${source}: ${message}`, data || '');
}

// Função helper para erros
function addError(error: string, stack?: string, context?: any) {
  const errorEntry: ErrorEntry = {
    id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
    timestamp: new Date(),
    error,
    stack,
    context
  };
  
  errors.unshift(errorEntry);
  if (errors.length > MAX_ERRORS) errors.pop();
  
  console.error(`[ERROR] ${error}`, { stack, context });
}

// Middleware para logging de requests
app.use((req, _res, next) => {
  addLog('info', `${req.method} ${req.path}`, {
    body: req.body,
    query: req.query,
    headers: req.headers
  }, 'middleware');
  next();
});

// Endpoint original do Gemini com logging melhorado
app.post('/api/generate', async (req, res) => {
  addLog('info', 'Gemini API request initiated', { model: req.body.model }, 'gemini');
  
  try {
    const { apiKey, model, contents, config } = req.body;
    if (!apiKey) {
      addError('Missing API key in request', undefined, { body: req.body });
      return res.status(400).json({ error: 'apiKey is required' });
    }
    
    addLog('debug', 'Creating Gemini client', { model }, 'gemini');
    const ai = new GoogleGenAI({ apiKey });
    
    addLog('debug', 'Sending request to Gemini', { model, contentsLength: contents?.length }, 'gemini');
    const response = await ai.models.generateContent({ model, contents, config });
    
    addLog('info', 'Gemini API request successful', { 
      model, 
      responseLength: response.text?.length 
    }, 'gemini');
    
    res.json({ text: response.text });
  } catch (err: any) {
    addError('LLM API error', err.stack, {
      message: err.message,
      code: err.code,
      body: req.body
    });
    
    const details = {
      message: err.message,
      code: err.code || null,
      stack: err.stack || null
    };
    res.status(500).json({ error: 'LLM error', ...details });
  }
});

// Endpoint para LLM acessar logs em tempo real
app.get('/api/debug/logs', (req, res) => {
  const { level, source, limit = 50 } = req.query;
  
  let filteredLogs = logs;
  
  if (level) {
    filteredLogs = filteredLogs.filter(log => log.level === level);
  }
  
  if (source) {
    filteredLogs = filteredLogs.filter(log => log.source === source);
  }
  
  res.json({
    logs: filteredLogs.slice(0, Number(limit)),
    total: filteredLogs.length,
    filters: { level, source, limit }
  });
});

// Endpoint para LLM acessar erros
app.get('/api/debug/errors', (req, res) => {
  const { limit = 20 } = req.query;
  
  res.json({
    errors: errors.slice(0, Number(limit)),
    total: errors.length
  });
});

// Endpoint para LLM receber logs do frontend
app.post('/api/debug/log', (req, res) => {
  const { level, message, data, source = 'frontend' } = req.body;
  
  if (!level || !message) {
    return res.status(400).json({ error: 'level and message are required' });
  }
  
  addLog(level, message, data, source);
  res.json({ success: true });
});

// Endpoint para LLM receber erros do frontend
app.post('/api/debug/error', (req, res) => {
  const { error, stack, context, source = 'frontend' } = req.body;
  
  if (!error) {
    return res.status(400).json({ error: 'error message is required' });
  }
  
  addError(`[${source}] ${error}`, stack, context);
  res.json({ success: true });
});

// Endpoint para status da aplicação
app.get('/api/debug/status', (_req, res) => {
  addLog('info', 'Status check requested', undefined, 'debug');
  
  res.json({
    server: {
      uptime: Math.floor(Date.now() / 1000),
      memory: { used: 'N/A', total: 'N/A' },
      version: 'Node.js',
      platform: 'cross-platform'
    },
    logs: {
      total: logs.length,
      byLevel: {
        info: logs.filter(l => l.level === 'info').length,
        warn: logs.filter(l => l.level === 'warn').length,
        error: logs.filter(l => l.level === 'error').length,
        debug: logs.filter(l => l.level === 'debug').length
      }
    },
    errors: {
      total: errors.length,
      recent: errors.slice(0, 5)
    }
  });
});

// Endpoint para limpar logs (útil para debugging)
app.delete('/api/debug/logs', (_req, res) => {
  const logsCount = logs.length;
  logs.length = 0;
  addLog('info', `Cleared ${logsCount} logs`, undefined, 'debug');
  res.json({ success: true, cleared: logsCount });
});

// Endpoint para limpar erros
app.delete('/api/debug/errors', (_req, res) => {
  const errorsCount = errors.length;
  errors.length = 0;
  addLog('info', `Cleared ${errorsCount} errors`, undefined, 'debug');
  res.json({ success: true, cleared: errorsCount });
});

// Log inicial do servidor
addLog('info', 'PDF OCR Pro server started', { port: process.env.PORT || 3001 }, 'server');

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`API server running on http://localhost:${port}`));
