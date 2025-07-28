const http = require('http');
const fs = require('fs');
const path = require('path');

console.log('🔍 Monitor de Backend - PDF OCR Pro');
console.log('📡 Monitorando servidor em localhost:5173...');
console.log('⏰ Iniciado em:', new Date().toLocaleString());
console.log('─────────────────────────────────────────────');

let requestCount = 0;
let lastActivity = Date.now();
let isProcessing = false;

// Monitora atividade de rede no servidor
function checkServerActivity() {
  const options = {
    hostname: 'localhost',
    port: 5173,
    path: '/health',
    method: 'GET',
    timeout: 1000
  };

  const req = http.request(options, (res) => {
    if (res.statusCode === 200) {
      console.log(`✅ [${new Date().toLocaleTimeString()}] Servidor ativo - Status: ${res.statusCode}`);
    }
  });

  req.on('error', (err) => {
    if (err.code !== 'ECONNREFUSED') {
      console.log(`❌ [${new Date().toLocaleTimeString()}] Erro de conexão: ${err.message}`);
    }
  });

  req.on('timeout', () => {
    req.destroy();
  });

  req.end();
}

// Monitora logs do console (se houver arquivo de log)
function checkLogFile() {
  const logPath = path.join(__dirname, 'server.log');
  if (fs.existsSync(logPath)) {
    try {
      const stats = fs.statSync(logPath);
      if (stats.mtime > lastActivity) {
        console.log(`📄 [${new Date().toLocaleTimeString()}] Atividade detectada no log do servidor`);
        lastActivity = stats.mtime;
      }
    } catch (err) {
      // Ignore errors
    }
  }
}

// Monitora processos Node.js
function checkNodeProcesses() {
  const { exec } = require('child_process');
  
  exec('wmic process where "name=\'node.exe\'" get processid,commandline /format:csv', (error, stdout, stderr) => {
    if (!error && stdout) {
      const lines = stdout.split('\n').filter(line => line.includes('vite') || line.includes('server'));
      if (lines.length > 0) {
        console.log(`🚀 [${new Date().toLocaleTimeString()}] Processos Node detectados: ${lines.length - 1}`);
      }
    }
  });
}

// Status do sistema
function showSystemStatus() {
  const uptime = Math.floor((Date.now() - lastActivity) / 1000);
  console.log(`📊 [${new Date().toLocaleTimeString()}] Status do Sistema:`);
  console.log(`   • Requests monitorados: ${requestCount}`);
  console.log(`   • Última atividade: ${uptime}s atrás`);
  console.log(`   • Processando: ${isProcessing ? '🟢 SIM' : '🔴 NÃO'}`);
  console.log('─────────────────────────────────────────────');
}

// Executa verificações a cada 3 segundos
setInterval(() => {
  checkServerActivity();
  checkLogFile();
  requestCount++;
}, 3000);

// Verifica processos a cada 10 segundos
setInterval(checkNodeProcesses, 10000);

// Status do sistema a cada 15 segundos
setInterval(showSystemStatus, 15000);

// Intercepta sinais para encerramento limpo
process.on('SIGINT', () => {
  console.log('\n🛑 Monitor encerrado pelo usuário');
  console.log('📈 Estatísticas finais:');
  console.log(`   • Total de verificações: ${requestCount}`);
  console.log(`   • Tempo de execução: ${Math.floor((Date.now() - lastActivity) / 1000)}s`);
  process.exit(0);
});

console.log('🎯 Pressione Ctrl+C para parar o monitor');
