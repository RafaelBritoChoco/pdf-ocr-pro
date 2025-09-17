import { addAuditEvent } from '../services/auditLogService';

// Run this in the browser console transpiled environment (or bundle) to simulate events.
// Example: after build, expose a button that calls window.injectAuditDemo?.()

(function register(){
  (window as any).injectAuditDemo = function(){
    const base = Date.now();
    const samples = [
      { provider:'openrouter', numericLost:['3'], headingLost:[], lossRatio:0.5, retried:false, final:false, model:'qwen-test' },
      { provider:'openrouter', numericLost:['3'], headingLost:[], lossRatio:0.0, retried:true, final:true, model:'qwen-test' },
      { provider:'openrouter', numericLost:[], headingLost:['CHAPTER I GENERAL PROVISIONS'], lossRatio:0, retried:true, final:true, model:'qwen-test' }
    ];
    samples.forEach((s,i)=>addAuditEvent({
      time: base + i*1000,
      chunkPreview: 'Agreement obligations shall survive termination ...',
      ...s
    }));
    console.log('[injectAuditDemo] Eventos de auditoria sintéticos adicionados. Abra o painel de diagnósticos.');
  };
})();
