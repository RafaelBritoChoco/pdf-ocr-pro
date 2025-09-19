@echo off
setlocal ENABLEDELAYEDEXPANSION

REM ===========================================================
REM  PDF OCR Pro - Start Application                          
REM  Auto-configura venv + Docling + Frontend + navegador
REM  Uso: basta dar duplo-clique.
REM ===========================================================

echo === PDF OCR Pro - Starting Application ===

set "ROOT_DIR=%~dp0"
pushd "%ROOT_DIR%"

REM ------------ Configuracoes ------------
set "DOCLING_HOST=127.0.0.1"
set "DOCLING_PORT=8008"
set "FRONTEND_PORT=5173"
set "DOCLING_URL=http://%DOCLING_HOST%:%DOCLING_PORT%"
set "FRONTEND_URL=http://localhost:%FRONTEND_PORT%"

REM Configuracao otimizada para PyTorch
set "PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:128"

REM ------------ Ambiente virtual ------------
if not exist ".venv\Scripts\python.exe" (
  echo [SETUP] Criando ambiente virtual...
  (py -3.12 -m venv .venv) || (py -3 -m venv .venv) || (python -m venv .venv)
  if errorlevel 1 (
    echo [ERRO] Falha ao criar venv.
    pause & exit /b 1
  )
)

echo [SETUP] Ativando ambiente virtual...
call ".venv\Scripts\activate.bat" || (
  echo [ERRO] Nao foi possivel ativar venv.
  pause & exit /b 1
)

REM ------------ Verificar dependencias ------------
echo [SETUP] Verificando dependencias...
python -c "import fastapi,uvicorn,docling" >nul 2>&1
if errorlevel 1 (
  echo [SETUP] Instalando dependencias Python...
  python -m pip install --upgrade pip >nul 2>&1
  if exist requirements.txt (
    pip install -r requirements.txt
  ) else (
    pip install fastapi uvicorn docling python-multipart
  )
)

REM ------------ Verificar Node.js ------------
where npm >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Node.js/npm nao encontrado. Instale Node.js primeiro.
  echo Baixe em: https://nodejs.org/
  pause & exit /b 1
)

echo [SETUP] Verificando dependencias Node.js...
if not exist "node_modules" (
  echo [SETUP] Instalando dependencias frontend...
  npm install
)

REM ------------ Iniciar servicos ------------
echo [START] Iniciando Docling backend (%DOCLING_URL%)...
start "PDF OCR - Docling Backend" cmd /k "cd /d \"%ROOT_DIR%\" && call .\.venv\Scripts\activate.bat && echo [DOCLING] Python: && python --version && echo [DOCLING] Iniciando servidor... && python -m uvicorn docling_service:app --host %DOCLING_HOST% --port %DOCLING_PORT% --log-level info"

echo [WAIT] Aguardando inicializacao do Docling...
timeout /t 5 > nul

echo [START] Iniciando Frontend React (%FRONTEND_URL%)...
start "PDF OCR - Frontend" cmd /k "cd /d \"%ROOT_DIR%\" && echo [FRONTEND] Node.js: && node --version && echo [FRONTEND] Iniciando aplicacao... && npm run dev"

echo [WAIT] Aguardando inicializacao do Frontend...
timeout /t 8 > nul

REM ------------ Abrir navegador ------------
echo [OPEN] Abrindo aplicacao no navegador...
start "" "%FRONTEND_URL%"

REM ------------ Informacoes finais ------------
echo.
echo === PDF OCR Pro - Aplicacao Iniciada ===
echo.
echo Backend Docling: %DOCLING_URL%
echo Frontend React: %FRONTEND_URL%
echo.
echo === Solucao de Problemas ===
echo.
echo Se aparecer "Docling: Offline" no frontend:
echo 1) Abra DevTools (F12) ^> Console
echo 2) Digite: localStorage.setItem('docling_endpoint','%DOCLING_URL%')
echo 3) Clique em "Verificar" na interface
echo.
echo Para parar os servicos:
echo - Feche as janelas "PDF OCR - Docling Backend" e "PDF OCR - Frontend"
echo.
echo Pressione qualquer tecla para fechar esta janela...
pause > nul

popd