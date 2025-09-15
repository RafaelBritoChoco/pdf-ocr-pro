# Changelog

Todas as mudanças notáveis deste projeto serão documentadas aqui.

## [2.4.0] - 2025-09-15
### Adicionado
- Estrutura de repositório Git inicial.
- `.env.example` para configuração de chaves sem vazamento.
- Script `npm run scan:secrets` para detecção simples de segredos.
- Função central `buildProviderInstruction` para adaptar instruções a OpenRouter.
- Footer dinâmico indicando provedor (Gemini / OpenRouter + modelo).
- README revisado com branding "PDF OCR 2.4" e instruções de segurança.
- CHANGELOG inicial.

### Alterado
- `package.json` atualizado (nome, versão, repositório, licença MIT, script de scan).
- Instruções de limpeza/headlines/conteúdo agora centralizadas para manutenção fácil.

### Futuro (Ideias)
- Exportar em formatos estruturados (JSON / Markdown enriquecido).
- Suporte a modelos adicionais via OpenRouter (Llama, Mistral, etc.).
- Cache local de respostas para reduzir custos em reprocessamentos.

---

Formato inspirado em Keep a Changelog.
