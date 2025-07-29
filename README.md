# PDF OCR Pro

## Nova Arquitetura Híbrida de Processamento de Documentos

Este projeto implementa um sistema avançado de OCR e formatação de documentos PDF utilizando uma arquitetura híbrida de 3 estágios que combina o poder da IA com a precisão de processamento determinístico.

### Arquitetura do Sistema

```
ESTÁGIO 1 (Extração) → ESTÁGIO 2 (IA Tags) → ESTÁGIO 3 (Parser)
     ↓                      ↓                    ↓
  Texto Bruto    →    <h><p><li><fn>    →   Formatação Final
```

- **Estágio 1: Extração de Texto** - Obtém texto bruto do PDF via OCR
- **Estágio 2: Enriquecimento Estrutural** - A IA analisa e marca elementos com tags estruturais
- **Estágio 3: Formatação Determinística** - Parser processa o texto marcado e aplica formatação final

Esta arquitetura resolve o problema da "desconexão arquitetural" encontrado em sistemas tradicionais, onde a formatação é aplicada sem compreensão estrutural do documento.

## Principais Recursos

- Extração de texto via OCR com alta precisão
- Processamento de documentos extensos por chunks
- Detecção e formatação correta de elementos estruturais (títulos, listas, parágrafos)
- Gerenciamento de notas de rodapé
- Preservação da integridade do texto original
- Interface de usuário para visualização e edição

## Como Iniciar o Projeto

### Pré-requisitos

- Node.js (v16+)
- npm ou yarn
- Conta Google Cloud Platform com API Gemini habilitada

### Instalação

1. Clone o repositório:
   ```bash
   git clone https://github.com/RafaelBritoChoco/pdf-ocr-pro.git
   cd pdf-ocr-pro
   ```

2. Instale as dependências:
   ```bash
   npm install
   ```

3. Configure as variáveis de ambiente:
   Crie um arquivo `.env.local` na raiz do projeto e adicione sua chave da API Gemini:
   ```
   GEMINI_API_KEY=SUA_CHAVE_API_AQUI
   ```

4. Inicie o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```

5. Acesse a aplicação em seu navegador:
   ```
   http://localhost:5173
   ```

## Fluxo de Processamento

1. Faça upload de um documento PDF
2. O sistema extrai o texto via OCR (Estágio 1)
3. A IA analisa e adiciona tags estruturais (Estágio 2)
4. O parser determinístico aplica a formatação final (Estágio 3)
5. O documento formatado é apresentado na interface

## Estrutura do Projeto

- `/services` - Serviços principais (OCR, IA, processamento de texto)
- `/hooks` - Hooks React para orquestração do pipeline
- `/components` - Componentes de UI
- `/types` - Definições de tipos TypeScript

## Tecnologias Utilizadas

- React/Vite
- TypeScript
- Google Gemini API
- TailwindCSS
