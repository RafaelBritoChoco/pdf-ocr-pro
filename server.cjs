const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
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

/**
 * Gestor de tarefas em memória para processamento assíncrono
 * Cada tarefa tem: status, message, result, error, createdAt
 */
const tasks = {};

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

// Endpoint para processamento assíncrono do Gemini
app.post('/api/generate', async (req, res) => {
  addLog('info', 'Gemini API async task initiated', { model: req.body.model }, 'gemini');
  
  try {
    const { apiKey, model, contents, config } = req.body;
    if (!apiKey) {
      addError('Missing API key in request', undefined, { body: req.body });
      return res.status(400).json({ error: 'apiKey is required' });
    }
    
    // Gerar taskId único e inicializar tarefa
    const taskId = crypto.randomUUID();
    tasks[taskId] = {
      status: 'pending',
      message: 'Tarefa iniciada, preparando processamento...',
      result: null,
      error: null,
      createdAt: new Date().toISOString()
    };
    
    addLog('info', 'Task created', { taskId, model }, 'task-manager');
    
    // Responder imediatamente com taskId
    res.status(202).json({ taskId });
    
    // Iniciar processamento assíncrono
    (async () => {
      try {
        // Atualizar status para processamento
        tasks[taskId].status = 'processing';
        tasks[taskId].message = 'Conectando com IA Gemini...';
        addLog('debug', 'Task processing started', { taskId }, 'task-manager');
        
        // Criar cliente Gemini
        const ai = new GoogleGenAI({ apiKey });
        tasks[taskId].message = 'Enviando dados para análise de IA...';
        
        // Fazer chamada para Gemini
        addLog('debug', 'Sending request to Gemini', { taskId, model, contentsLength: contents?.length }, 'gemini');
        const response = await ai.models.generateContent({ model, contents, config });
        
        // Atualizar para formatação
        tasks[taskId].status = 'formatting';
        tasks[taskId].message = 'Formatando resposta final...';
        
        // Simular tempo de formatação (remover em produção se não houver formatação adicional)
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Concluir tarefa
        tasks[taskId].status = 'completed';
        tasks[taskId].message = 'Processamento concluído com sucesso!';
        tasks[taskId].result = response.text;
        
        addLog('info', 'Task completed successfully', { 
          taskId, 
          model, 
          responseLength: response.text?.length 
        }, 'task-manager');
        
      } catch (err) {
        // Falha na tarefa
        tasks[taskId].status = 'failed';
        tasks[taskId].message = `Erro no processamento: ${err.message}`;
        tasks[taskId].error = err.message;
        
        addError(`Task ${taskId} failed`, err.stack, {
          message: err.message,
          code: err.code,
          taskId
        });
      }
    })();
    
  } catch (err) {
    addError('Task creation error', err.stack, {
      message: err.message,
      body: req.body
    });
    
    res.status(500).json({ error: 'Failed to create task', message: err.message });
  }
});

/**
 * Endpoint para polling do status da tarefa
 * GET /api/task-status/:taskId
 */
app.get('/api/task-status/:taskId', (req, res) => {
  const { taskId } = req.params;
  const task = tasks[taskId];
  
  if (!task) {
    addLog('warn', 'Task not found', { taskId }, 'task-manager');
    return res.status(404).json({ error: 'Task not found' });
  }
  
  addLog('debug', 'Task status requested', { taskId, status: task.status }, 'task-manager');
  
  res.json({
    status: task.status,
    message: task.message
  });
});

/**
 * Endpoint para obter o resultado final da tarefa
 * GET /api/task-result/:taskId
 */
app.get('/api/task-result/:taskId', (req, res) => {
  const { taskId } = req.params;
  const task = tasks[taskId];
  
  if (!task) {
    addLog('warn', 'Task not found for result', { taskId }, 'task-manager');
    return res.status(404).json({ error: 'Task not found' });
  }
  
  if (task.status !== 'completed') {
    addLog('warn', 'Task result requested but not completed', { taskId, status: task.status }, 'task-manager');
    return res.status(404).json({ error: 'Task not completed yet' });
  }
  
  addLog('info', 'Task result delivered', { taskId }, 'task-manager');
  
  // Opcional: remover tarefa após entregar resultado
  const result = task.result;
  delete tasks[taskId];
  
  res.json({ result });
});

/**
 * Endpoint para streaming de dados da tarefa em tempo real
 * GET /api/task-stream/:taskId
 */
app.get('/api/task-stream/:taskId', (req, res) => {
  const { taskId } = req.params;
  const task = tasks[taskId];
  
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }
  
  // Configurar cabeçalhos para Server-Sent Events (SSE)
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });
  
  // Função para enviar dados
  const sendData = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  
  // Enviar estado atual imediatamente
  sendData({
    status: task.status,
    message: task.message,
    timestamp: new Date().toISOString()
  });
  
  // Configurar polling para atualizações
  const intervalId = setInterval(() => {
    const currentTask = tasks[taskId];
    
    if (!currentTask) {
      // Tarefa foi removida, encerrar stream
      res.write('event: close\ndata: Task completed and cleaned up\n\n');
      res.end();
      clearInterval(intervalId);
      return;
    }
    
    // Enviar atualização de status
    sendData({
      status: currentTask.status,
      message: currentTask.message,
      timestamp: new Date().toISOString()
    });
    
    // Se completou, encerrar stream após enviar resultado
    if (currentTask.status === 'completed' || currentTask.status === 'failed') {
      setTimeout(() => {
        res.write('event: close\ndata: Stream complete\n\n');
        res.end();
        clearInterval(intervalId);
      }, 1000); // Aguardar 1 segundo antes de fechar
    }
  }, 1000); // Atualizar a cada 1 segundo para stream mais responsivo
  
  // Limpar recursos quando cliente desconectar
  req.on('close', () => {
    clearInterval(intervalId);
    addLog('debug', 'Client disconnected from task stream', { taskId }, 'task-manager');
  });
  
  addLog('debug', 'Task stream started', { taskId }, 'task-manager');
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
