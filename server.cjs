const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const path = require("path");
const { spawn } = require("child_process"); // Import child_process
require("dotenv").config({ path: path.resolve(process.cwd(), ".env.local") });
require("dotenv").config(); // Fallback para .env

// Check for Google GenAI - use require for CommonJS
let GoogleGenAI;
try {
  GoogleGenAI = require("@google/genai").GoogleGenAI;
} catch (error) {
  console.log("⚠️ Google GenAI not found, running in mock mode");
}

// Verificar se a API key está disponível
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error("🚨 ERRO CRÍTICO: GEMINI_API_KEY não encontrada nas variáveis de ambiente!");
  console.error("📝 Certifique-se de que .env.local contém: GEMINI_API_KEY=sua_api_key");
  console.log("🔄 Continuando em modo mock para desenvolvimento...");
} else {
  console.log("✅ API Key carregada com sucesso (length:", GEMINI_API_KEY.length, ")");
}

const app = express();
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5175'],
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));

// In-memory storage for tasks
const tasks = {};

// Logging functions
function addLog(level, message, data, category) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level.toUpperCase()}] [${category || 'SERVER'}] ${message}`, data || '');
}

function addError(message, error, data) {
  addLog('error', message, { error: error?.message || error, data }, 'ERROR');
}

// Mock python script runner for development
function runPythonScript(scriptPath, inputText) {
  return new Promise((resolve) => {
    // Mock processing - just return the input with a note
    setTimeout(() => {
      resolve(inputText + "\n\n[Mock processing: footnotes corrected]");
    }, 1000);
  });
}

// Middleware to log all requests
app.use((req, res, next) => {
  addLog("info", `${req.method} ${req.path}`, {
    body: req.body,
    query: req.query,
    headers: req.headers
  }, "middleware");
  next();
});

// Endpoint para processamento assíncrono do Gemini
app.post("/api/generate", async (req, res) => {
  addLog("info", "Gemini API async task initiated", { model: req.body.model }, "gemini");
  
  try {
    const { apiKey, model, contents, config } = req.body;
    if (!apiKey) {
      addError("Missing API key in request", undefined, { body: req.body });
      return res.status(400).json({ error: "apiKey is required" });
    }
    
    // Gerar taskId único e inicializar tarefa
    const taskId = crypto.randomUUID();
    tasks[taskId] = {
      status: "pending",
      message: "Tarefa iniciada, preparando processamento...",
      result: null,
      error: null,
      createdAt: new Date().toISOString(),
      processingLog: [] // Initialize processing log
    };
    
    // Return taskId immediately for polling
    res.json({ taskId });
    
    // Process in background
    (async () => {
      try {
        tasks[taskId].status = "processing_ai";
        tasks[taskId].message = "Processando com Gemini AI...";
        
        let processedText;
        
        if (GoogleGenAI && GEMINI_API_KEY) {
          // Real API processing
          const ai = new GoogleGenAI({ apiKey: apiKey });
          const response = await ai.models.generateContent({ model, contents, config });
          processedText = response.text;
          tasks[taskId].processingLog.push({ 
            step: "Gemini API Call", 
            status: "completed", 
            timestamp: new Date().toISOString(), 
            outputLength: processedText.length 
          });
        } else {
          // Mock processing for development
          processedText = typeof contents === 'string' ? contents : JSON.stringify(contents);
          processedText += "\n\n[Mock AI processing completed - GEMINI_API_KEY not configured]";
          tasks[taskId].processingLog.push({ 
            step: "Mock AI Processing", 
            status: "completed", 
            timestamp: new Date().toISOString(), 
            outputLength: processedText.length 
          });
        }

        // Apply footnote processing
        tasks[taskId].status = "processing_footnote";
        tasks[taskId].message = "Aplicando correção de notas de rodapé...";
        addLog("debug", "Running footnote correction", { taskId }, "python-script");
        tasks[taskId].processingLog.push({ 
          step: "Footnote Processing", 
          status: "started", 
          timestamp: new Date().toISOString() 
        });
        
        processedText = await runPythonScript("footnote_correction.py", processedText);
        tasks[taskId].processingLog.push({ 
          step: "Footnote Processing", 
          status: "completed", 
          timestamp: new Date().toISOString(),
          outputLength: processedText.length 
        });
        
        // Complete task
        tasks[taskId].status = "completed";
        tasks[taskId].message = "Processamento concluído com sucesso!";
        tasks[taskId].result = processedText;
        tasks[taskId].completedAt = new Date().toISOString();
        
        addLog("info", "Task completed successfully", { 
          taskId, 
          outputLength: processedText.length,
          processingTime: new Date() - new Date(tasks[taskId].createdAt)
        }, "gemini");
        
      } catch (error) {
        tasks[taskId].status = "error";
        tasks[taskId].error = error.message || "Unknown error occurred";
        tasks[taskId].message = `Erro: ${error.message}`;
        addError("Task processing failed", error, { taskId });
      }
    })();
    
  } catch (error) {
    addError("Failed to initiate task", error, { body: req.body });
    res.status(500).json({ error: "Failed to initiate processing task" });
  }
});

// Endpoint para verificar status da tarefa
app.get("/api/task/:taskId", (req, res) => {
  const { taskId } = req.params;
  const task = tasks[taskId];
  
  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }
  
  res.json(task);
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    hasGeminiKey: !!GEMINI_API_KEY,
    activeTasks: Object.keys(tasks).length
  });
});

// Cleanup old tasks (older than 1 hour)
setInterval(() => {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  Object.keys(tasks).forEach(taskId => {
    const task = tasks[taskId];
    if (new Date(task.createdAt) < oneHourAgo) {
      delete tasks[taskId];
    }
  });
}, 10 * 60 * 1000); // Run every 10 minutes

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`API server running on http://localhost:${port}`);
  addLog("info", "Server listening", { port }, "server");
});