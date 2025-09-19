import React, { useEffect, useState } from 'react';
import { DoclingMeta } from '../types';

interface Props {
  meta?: DoclingMeta | null;
  connectMessage?: string;
}

export const DoclingMetaPanel: React.FC<Props> = ({ meta, connectMessage }) => {
  const [stored, setStored] = useState<DoclingMeta | null>(null);
  useEffect(() => {
    if (!meta) {
      try {
        const raw = localStorage.getItem('last_docling_meta');
        if (raw) setStored(JSON.parse(raw));
      } catch {}
    }
  }, [meta]);
  const m = meta || stored;
  if (!m && !connectMessage) return null;
  return (
    <div style={{ border: '1px solid #333', borderRadius: 8, padding: 10, fontSize: 12, fontFamily: 'sans-serif', background:'#0b0b0b', color:'#ddd', marginTop:12 }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Docling Extraction Meta</div>
      {connectMessage && <div style={{ marginBottom:6, color:'#89b4fa' }}>{connectMessage}</div>}
      {m ? (
        <div style={{ display:'grid', gridTemplateColumns:'auto 1fr', gap:4 }}>
          {m.requested_mode && <><div style={{ opacity:0.7 }}>requested_mode</div><div>{m.requested_mode}</div></>}
          {m.mode && <><div style={{ opacity:0.7 }}>final_mode</div><div>{m.mode}</div></>}
          {m.progressive !== undefined && <><div style={{ opacity:0.7 }}>progressive</div><div>{String(m.progressive)}</div></>}
          {m.ocr_used !== undefined && <><div style={{ opacity:0.7 }}>ocr_used</div><div>{String(m.ocr_used)}</div></>}
          {m.ocr_needed !== undefined && <><div style={{ opacity:0.7 }}>ocr_needed</div><div>{String(m.ocr_needed)}</div></>}
          {m.second_phase_attempted !== undefined && <><div style={{ opacity:0.7 }}>2nd_phase</div><div>{String(m.second_phase_attempted)}</div></>}
          {m.memory_fallback !== undefined && <><div style={{ opacity:0.7 }}>memory_fallback</div><div>{String(m.memory_fallback)}</div></>}
          {m.fallback_used !== undefined && <><div style={{ opacity:0.7 }}>fallback_used</div><div>{String(m.fallback_used)}</div></>}
          {m.fallback_reason && <><div style={{ opacity:0.7 }}>fallback_reason</div><div>{m.fallback_reason}</div></>}
          {m.hard_fallback !== undefined && <><div style={{ opacity:0.7 }}>hard_fallback</div><div>{String(m.hard_fallback)}</div></>}
          {m.hard_fallback_reason && <><div style={{ opacity:0.7 }}>hard_fallback_reason</div><div>{m.hard_fallback_reason}</div></>}
          {m.forced_pypdf !== undefined && <><div style={{ opacity:0.7 }}>forced_pypdf</div><div>{String(m.forced_pypdf)}</div></>}
          {m.pages !== undefined && m.pages !== null && <><div style={{ opacity:0.7 }}>pages</div><div>{m.pages}</div></>}
          {m.heuristic && (
            <><div style={{ opacity:0.7 }}>heuristic_avg_chars</div><div>{m.heuristic.avg_chars_per_page}</div></>
          )}
          {m.heuristic_reasons && m.heuristic_reasons.length > 0 && (
            <><div style={{ opacity:0.7 }}>heuristic_reasons</div><div>{m.heuristic_reasons.join(', ')}</div></>
          )}
          {m.auto_threshold_chars_per_page && <><div style={{ opacity:0.7 }}>auto_threshold</div><div>{m.auto_threshold_chars_per_page}</div></>}
          {m.service_version && <><div style={{ opacity:0.7 }}>service_version</div><div>{m.service_version}</div></>}
          {m.filename && <><div style={{ opacity:0.7 }}>filename</div><div>{m.filename}</div></>}
        </div>
      ) : (
        <div style={{ opacity:0.6 }}>Sem meta ainda…</div>
      )}
    </div>
  );
};

export default DoclingMetaPanel;
