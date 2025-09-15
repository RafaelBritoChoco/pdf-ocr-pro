<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1ucvV0KRGmBvZvLLpi7EDAZ_vUWuuzNqa

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Copie `.env.example` para `.env.local` e preencha as chaves (NÃO comite `.env.local`):
   - `GEMINI_API_KEY=...`
   - (Opcional) `OPENROUTER_API_KEY=...`
   - (Opcional) Model overrides: `GEMINI_MODEL=` / `OPENROUTER_MODEL=`
3. Execute localmente:
   `npm run dev`

### Variáveis de Ambiente

Arquivo exemplo: `.env.example`.

O arquivo real `.env.local` está no `.gitignore` para evitar vazamento de credenciais. Nunca coloque chaves em commits, issues ou screenshots.

### Fornecedores de IA

Por padrão o app usa Gemini. OpenRouter reutiliza as mesmas instruções-base e aplica ajustes para consistência.

### Segurança

Se uma chave for exposta, gere uma nova imediatamente e remova a antiga. Utilize permissões mínimas necessárias.
