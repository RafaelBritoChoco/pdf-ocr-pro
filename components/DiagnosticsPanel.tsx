import React, { useEffect, useState } from 'react';
import { getAuditEvents, clearAuditEvents, AuditEvent } from '../services/auditLogService';

interface Props {
  max?: number;
}

const badge = (label: string, color: string) => (
  <span style={{
    background: color,
    color: '#fff',
    borderRadius: 4,
    padding: '2px 6px',
    fontSize: 11,
    marginRight: 6,
    display: 'inline-block'
  }}>{label}</span>
);

export const DiagnosticsPanel: React.FC<Props> = ({ max = 30 }) => {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [showOnlyLost, setShowOnlyLost] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const refresh = () => {
    const all = getAuditEvents();
    setEvents(all.slice(0, max));
  };

  useEffect(() => {
    refresh();
    if (autoRefresh) {
      const id = setInterval(refresh, 2500);
      return () => clearInterval(id);
    }
  }, [autoRefresh]);

  const filtered = showOnlyLost ? events.filter(e => (e.numericLost && e.numericLost.length) || (e.headingLost && e.headingLost.length)) : events;

  return (
    <div style={{ border: '1px solid #000000ff', borderRadius: 8, padding: 12, fontFamily: 'sans-serif', background:'#000000ff' }}>
      <div style={{ display: 'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
        <strong>AI Diagnostics</strong>
        <div style={{ display:'flex', gap:8 }}>
          <label style={{ fontSize:12 }}>
            <input type="checkbox" checked={showOnlyLost} onChange={e=>setShowOnlyLost(e.target.checked)} /> apenas perdas
          </label>
          <label style={{ fontSize:12 }}>
            <input type="checkbox" checked={autoRefresh} onChange={e=>setAutoRefresh(e.target.checked)} /> auto refresh
          </label>
          <button onClick={()=>{refresh();}} style={{ fontSize:12 }}>Atualizar</button>
          <button onClick={()=>{clearAuditEvents(); refresh();}} style={{ fontSize:12, color:'rgba(169, 36, 36, 1)' }}>Limpar</button>
        </div>
      </div>
      {filtered.length === 0 && <div style={{ fontSize:12, opacity:0.7 }}>Nenhum evento.</div>}
      <div style={{ maxHeight: 260, overflowY:'auto', fontSize:12, lineHeight:1.3 }}>
        {filtered.map(ev => {
          const dt = new Date(ev.time).toLocaleTimeString();
          const problem = (ev.numericLost && ev.numericLost.length) || (ev.headingLost && ev.headingLost.length);
          return (
            <div key={ev.time + '_' + Math.random()} style={{
              border:'1px solid #aaaaaaff',
              borderRadius:6,
              padding:6,
              marginBottom:6,
              background: problem ? '#000000ff' : '#000000ff'
            }}>
              <div style={{ display:'flex', justifyContent:'space-between' }}>
                <div>
                  {badge(ev.provider,'#555')}
                  {ev.retried && !ev.final && badge('retry','orange')}
                  {ev.final && badge('final','green')}
                  {problem && badge('loss','red')}
                  <span style={{ opacity:0.7 }}>{dt}</span>
                </div>
                <div style={{ fontSize:10, opacity:0.6 }}>{ev.model}</div>
              </div>
              <div style={{ marginTop:4 }}>
                <strong>Preview:</strong> {ev.chunkPreview}
              </div>
              {ev.numericLost && ev.numericLost.length > 0 && (
                <div style={{ marginTop:4 }}>Números perdidos: {ev.numericLost.join(', ')} (ratio:{' '}{(ev.lossRatio ?? 0).toFixed(2)})</div>
              )}
              {ev.headingLost && ev.headingLost.length > 0 && (
                <div style={{ marginTop:4 }}>Headings perdidas: {ev.headingLost.join(' | ')}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DiagnosticsPanel;
