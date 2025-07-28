const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

const app = express();
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'],
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Sistema de logs e debug para LLM monitoring
const logs = [];
const errors = [];
const MAX_LOGS = 1000;
const MAX_ERRORS = 100;

// Função helper para logging
function addLog(level, message, data, source = 'server') {
  const log = {
    id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
    timestamp: new Date(),
    level,
    message,
    data,
    source
  };
  
  logs.unshift(log);
  if (logs.length > MAX_LOGS) logs.pop();
  
  console.log(`[${level.toUpperCase()}] ${source}: ${message}`, data || '');
}

// Função helper para erros
function addError(error, stack, context) {
  const errorEntry = {
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
  } catch (err) {
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
  
  let filteredLogs = logs.filter(log => 
    // Filtrar apenas logs importantes, não logs internos da API
    log.source !== 'debug-api' && 
    log.message !== 'Logs requested' &&
    !log.message.startsWith('GET /api/debug')
  );
  
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
  
  addLog('debug', 'Errors requested', { limit }, 'debug-api');
  
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
      uptime: Math.floor(process.uptime()),
      memory: process.memoryUsage(),
      version: process.version,
      platform: process.platform
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

// Endpoint para limpar logs
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

// Endpoint para limpar tudo (logs + errors)
app.delete('/api/debug/all', (_req, res) => {
  const logsCount = logs.length;
  const errorsCount = errors.length;
  logs.length = 0;
  errors.length = 0;
  
  // Log apenas no console para não recriar logs após limpeza
  console.log(`[INFO] debug: Cleared all debug data - ${logsCount} logs, ${errorsCount} errors`);
  res.json({ 
    success: true, 
    cleared: { 
      logs: logsCount, 
      errors: errorsCount,
      total: logsCount + errorsCount
    } 
  });
});

// Log inicial do servidor
addLog('info', 'PDF OCR Pro server started', { port: process.env.PORT || 3001 }, 'server');

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`API server running on http://localhost:${port}`);
  addLog('info', 'Server listening', { port }, 'server');
});
