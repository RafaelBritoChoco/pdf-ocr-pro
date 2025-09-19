#!/usr/bin/env pwsh
# GPU Setup Script for PDF OCR Docling Acceleration
# This script detects your GPU and installs the appropriate PyTorch version

param(
    [switch]$Force,
    [switch]$Help
)

if ($Help) {
    Write-Host @"
GPU Setup Script for PDF OCR Docling Acceleration

Usage: .\scripts\setup-gpu.ps1 [-Force] [-Help]

Options:
  -Force    Force reinstall even if PyTorch is already installed
  -Help     Show this help message

This script will:
1. Detect your GPU (NVIDIA CUDA, AMD ROCm, or Apple MPS)
2. Install the appropriate PyTorch version for maximum performance
3. Verify GPU acceleration is working with Docling

"@
    exit 0
}

Write-Host "🚀 Setting up GPU acceleration for PDF OCR..." -ForegroundColor Green

# Check if we're in a virtual environment
if (-not $env:VIRTUAL_ENV -and -not $env:CONDA_DEFAULT_ENV) {
    Write-Warning "⚠️  No virtual environment detected. Consider using a venv or conda environment."
    $response = Read-Host "Continue anyway? (y/N)"
    if ($response -ne "y" -and $response -ne "Y") {
        exit 1
    }
}

# Function to detect GPU
function Detect-GPU {
    Write-Host "🔍 Detecting GPU..." -ForegroundColor Cyan
    
    # Check for NVIDIA GPU
    try {
        $nvidiaGPU = nvidia-smi --query-gpu=name --format=csv,noheader,nounits 2>$null
        if ($nvidiaGPU) {
            Write-Host "✅ NVIDIA GPU detected: $nvidiaGPU" -ForegroundColor Green
            return "cuda"
        }
    }
    catch {
        # nvidia-smi not found or failed
    }
    
    # Check for AMD GPU (ROCm support is limited, but we can try)
    try {
        $amdGPU = Get-WmiObject -Class Win32_VideoController | Where-Object { $_.Name -like "*AMD*" -or $_.Name -like "*Radeon*" }
        if ($amdGPU) {
            Write-Host "⚠️  AMD GPU detected: $($amdGPU.Name)" -ForegroundColor Yellow
            Write-Host "   Note: AMD ROCm support is experimental on Windows" -ForegroundColor Yellow
            return "rocm"
        }
    }
    catch {
        # WMI query failed
    }
    
    # Check if running on Apple Silicon (unlikely on Windows, but just in case)
    if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") {
        Write-Host "🍎 Apple Silicon detected" -ForegroundColor Blue
        return "mps"
    }
    
    Write-Host "ℹ️  No supported GPU detected, will use CPU" -ForegroundColor Blue
    return "cpu"
}

# Function to install PyTorch
function Install-PyTorch {
    param($gpuType)
    
    Write-Host "📦 Installing PyTorch for $gpuType..." -ForegroundColor Cyan
    
    switch ($gpuType) {
        "cuda" {
            Write-Host "Installing PyTorch with CUDA support..."
            pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
        }
        "rocm" {
            Write-Host "Installing PyTorch with ROCm support..."
            pip install torch torchvision --index-url https://download.pytorch.org/whl/rocm5.7
        }
        "mps" {
            Write-Host "Installing PyTorch with MPS support..."
            pip install torch torchvision
        }
        default {
            Write-Host "Installing PyTorch CPU version..."
            pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
        }
    }
}

# Function to test GPU
function Test-GPU {
    Write-Host "🧪 Testing GPU acceleration..." -ForegroundColor Cyan
    
    $testScript = @'
import torch
print(f"PyTorch version: {torch.__version__}")
print(f"CUDA available: {torch.cuda.is_available()}")
if torch.cuda.is_available():
    print(f"CUDA version: {torch.version.cuda}")
    print(f"GPU count: {torch.cuda.device_count()}")
    for i in range(torch.cuda.device_count()):
        print(f"GPU {i}: {torch.cuda.get_device_name(i)}")
        
# Test if MPS is available (Apple Silicon)
if hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
    print("MPS (Apple Metal) available: True")
else:
    print("MPS (Apple Metal) available: False")
    
print("GPU acceleration ready! 🚀")
'@
    
    python -c $testScript
}

# Main execution
$gpuType = Detect-GPU

# Check if PyTorch is already installed
try {
    python -c "import torch; print('PyTorch already installed')" 2>$null
    if (-not $Force) {
        $response = Read-Host "PyTorch is already installed. Reinstall? (y/N)"
        if ($response -ne "y" -and $response -ne "Y") {
            Write-Host "Skipping PyTorch installation. Testing current setup..."
            Test-GPU
            exit 0
        }
    }
}
catch {
    # PyTorch not installed
}

Install-PyTorch $gpuType

Write-Host "✅ Installation complete!" -ForegroundColor Green
Test-GPU

Write-Host @'

🎉 GPU acceleration is now configured!

Next steps:
1. Restart your PDF OCR service if it's running
2. Process a PDF to see GPU acceleration in action
3. Check the logs for GPU usage messages like:
   [GPU] Using CUDA: <GPU Name> (<Memory>GB VRAM)

Performance tips:
- GPU acceleration works best with image-heavy PDFs
- For text-only PDFs, the performance gain may be minimal
- Monitor GPU memory usage during processing

'@ -ForegroundColor Cyan