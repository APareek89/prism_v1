import type { AgenticFlowSnapshot } from '@/lib/admin/agentic-flow';

function text(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not recorded';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

const OUTPUT_FIELDS = [
  ['observation', 'Observation'],
  ['interpretation', 'Interpretation'],
  ['alternativeExplanation', 'Alternative explanation'],
  ['action', 'Controllable action'],
  ['expectedSignal', 'Expected leading signal'],
  ['verificationPlan', 'Verification plan'],
  ['doNoHarm', 'Do-no-harm guard'],
] as const;

export function AgenticFlowPanel({ snapshot }: { snapshot: AgenticFlowSnapshot }) {
  const selected = snapshot.selected;
  return <>
    <form className="admin-agent-filter card" method="get">
      <input type="hidden" name="tab" value="agentic" />
      <label>Scope<select name="subject" defaultValue={snapshot.subjectId}>{snapshot.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.label}</option>)}</select></label>
      <label>Insight or recommendation<select name="artifact" defaultValue={selected?.key ?? ''}>{snapshot.artifacts.map((artifact) => <option key={artifact.key} value={artifact.key}>{artifact.date} · {artifact.type} · {artifact.label}</option>)}</select></label>
      <button className="button" type="submit">Load flow</button>
    </form>
    {!selected ? <div className="card admin-agent-empty"><strong>No persisted artifact for this scope</strong><p>Run the scoring and narration pipeline after real evidence lands. Prism does not create a placeholder trace.</p></div> : <>
      <section className="agent-trace-hero card">
        <div><span className="page-kicker">{selected.type} · {selected.kind}</span><h2>{selected.label}</h2><p>{selected.ownership}</p></div>
        <div className="agent-trace-meta"><span>Trace <b>{selected.traceVersion}</b></span><span>Run date <b>{selected.date}</b></span><span>Artifact <b>{selected.type === 'insight' ? 'Agent narrated' : 'Rule selected'}</b></span></div>
        {selected.legacy ? <p className="agent-legacy-note">This artifact predates versioned tracing. Re-run the live pipeline to populate the complete stage ledger.</p> : null}
      </section>

      <section className="admin-section">
        <div className="cardhead"><div><span className="page-kicker">Execution ledger</span><h3>How the result moved through the bounded flow</h3></div><span className="sub">owners stay explicit</span></div>
        <div className="agent-stage-list">{selected.stages.map((stage, index) => <article key={`${text(stage.id)}-${index}`}><b>{index + 1}</b><div><span>{text(stage.owner)}</span><strong>{text(stage.id).replaceAll('_', ' ')}</strong><p>{text(stage.detail)}</p></div><em className={text(stage.status)}>{text(stage.status)}</em></article>)}</div>
      </section>

      <section className="agent-trace-grid">
        <article className="card"><div className="cardhead"><h3>Selected candidate</h3><span className="sub">deterministic</span></div><pre>{JSON.stringify(selected.candidate, null, 2)}</pre></article>
        <article className="card"><div className="cardhead"><h3>Confidence and validation</h3><span className="sub">publication gates</span></div><pre>{JSON.stringify({ confidence: selected.confidence, validation: selected.validation }, null, 2)}</pre></article>
      </section>

      <section className="card agent-output-contract">
        <div className="cardhead"><div><span className="page-kicker">Published contract</span><h3>Claim, action, alternative, and verification</h3></div><span className="sub">all required on new traces</span></div>
        <dl>{OUTPUT_FIELDS.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{text(selected.output[key])}</dd></div>)}</dl>
      </section>

      <section className="card agent-evidence-ledger">
        <div className="cardhead"><div><span className="page-kicker">Evidence snapshot</span><h3>Exactly what this artifact could cite</h3></div><span className="sub">no prompts, responses, or source code</span></div>
        <pre>{JSON.stringify(selected.evidence, null, 2)}</pre>
      </section>
    </>}
  </>;
}
