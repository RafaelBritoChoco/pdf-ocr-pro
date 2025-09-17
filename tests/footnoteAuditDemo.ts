import { auditInlineNumericRefs } from '../services/footnoteAudit';

// Simple manual demo: run with ts-node or compile & run.
// This does NOT call any API – just demonstrates detection of lost inline numeric refs.

const before = `Agreement obligations shall survive termination 3.\n3 This obligation survives termination for 2 years.\nMore text continues 12 and clause ends.`;
const afterLost = `Agreement obligations shall survive termination .\nThis obligation survives termination for 2 years.\nMore text continues and clause ends.`;

const audit = auditInlineNumericRefs(before, afterLost);
console.log('[DEMO][FootnoteAudit] Result:', audit);

/* Expected output example:
[DEMO][FootnoteAudit] Result: {
  lost: ['3','12'],
  beforeCount: 2,
  afterCount: 0,
  lossRatio: 1,
  details: [ { num: '3', before:1, after:0 }, { num: '12', before:1, after:0 } ]
}
*/
