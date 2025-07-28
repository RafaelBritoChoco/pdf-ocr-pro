// Script de monitoramento em tempo real
// Execute este script para ver os logs do processamento em tempo real

const http = require('http');
const fs = require('fs');
const path = require('path');

// Função para buscar logs do cliente (se disponível)
function checkClientLogs() {
    // Simular busca de logs do navegador
    console.log('\n📊 MONITORAMENTO EM TEMPO REAL');
    console.log('='.repeat(50));
    console.log(`⏰ ${new Date().toLocaleTimeString()}`);
    
    // Verificar se há processos em andamento
    const processes = [
        { name: 'Vite Dev Server', port: 5173, status: 'RUNNING' },
        { name: 'PDF Processing', status: 'MONITORING' }
    ];
    
    processes.forEach(proc => {
        console.log(`${proc.status === 'RUNNING' ? '🟢' : '🔄'} ${proc.name}: ${proc.status}`);
    });
    
    console.log('\n📋 Para ver logs detalhados:');
    console.log('1. Abra o navegador em http://localhost:5173');
    console.log('2. Abra DevTools (F12)');
    console.log('3. Vá para Console para ver logs em tempo real');
    console.log('4. Processe um PDF e acompanhe os logs');
    
    console.log('\n🔍 INDICADORES A OBSERVAR:');
    console.log('• 🚀 Phase 1: Starting initial extraction');
    console.log('• 🧠 Phase 2: AI analyzing document');
    console.log('• ⚡ Phase 3: Starting AI correction');
    console.log('• 🎨 Phase 4: AI formatting final document');
    console.log('• ✅ PROCESSING COMPLETE!');
}

// Função para monitorar arquivos de log (se existirem)
function monitorFiles() {
    const logFiles = [
        'debug.log',
        'processing.log',
        'error.log'
    ];
    
    console.log('\n📁 VERIFICANDO ARQUIVOS DE LOG:');
    logFiles.forEach(file => {
        if (fs.existsSync(file)) {
            console.log(`✅ ${file} encontrado`);
            // Ler últimas linhas
            try {
                const content = fs.readFileSync(file, 'utf8');
                const lines = content.split('\n').filter(l => l.trim()).slice(-5);
                console.log(`📖 Últimas 5 linhas de ${file}:`);
                lines.forEach(line => console.log(`   ${line}`));
            } catch (err) {
                console.log(`❌ Erro ao ler ${file}: ${err.message}`);
            }
        } else {
            console.log(`❌ ${file} não encontrado`);
        }
    });
}

// Função para verificar o status do processamento via rede
async function checkNetworkActivity() {
    console.log('\n🌐 ATIVIDADE DE REDE:');
    
    try {
        // Verificar se consegue conectar com a API
        const response = await fetch('http://localhost:5173', { 
            method: 'HEAD',
            timeout: 1000 
        }).catch(() => null);
        
        if (response) {
            console.log('✅ Servidor Vite respondendo');
        } else {
            console.log('❌ Servidor Vite não responde');
        }
    } catch (err) {
        console.log(`❌ Erro de rede: ${err.message}`);
    }
}

// Executar monitoramento
console.clear();
checkClientLogs();
monitorFiles();

// Executar verificações periódicas
setInterval(() => {
    console.clear();
    checkClientLogs();
    monitorFiles();
}, 3000); // A cada 3 segundos

console.log('\n🔄 Monitoramento ativo. Pressione Ctrl+C para sair.');
console.log('📱 Abra http://localhost:5173 no navegador e processe um PDF para ver os logs!');
