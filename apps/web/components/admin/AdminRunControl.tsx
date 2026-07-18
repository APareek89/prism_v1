'use client';

import { useState } from 'react';

interface RunSummary {
  ok?: boolean;
  pipeline?: {
    functionL1?: number | null;
    confidence?: string;
    counts?: { windowPrs?: number; sessions?: number };
  };
  warnings?: string[];
  error?: string;
}

export function AdminRunControl({ date }: { date: string }) {
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setMessage('Ingesting GitHub and telemetry, then recomputing the deterministic index…');
    try {
      const response = await fetch('/api/pipeline/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ date }),
      });
      const data = (await response.json()) as RunSummary;
      if (!response.ok || data.error) throw new Error(data.error ?? `Pipeline returned ${response.status}`);
      if (data.ok === false) {
        throw new Error(data.warnings?.[0] ?? 'The pipeline completed with a failed step.');
      }
      const prs = data.pipeline?.counts?.windowPrs ?? 0;
      const sessions = data.pipeline?.counts?.sessions ?? 0;
      const l1 = data.pipeline?.functionL1 ?? null;
      if (data.warnings?.length) {
        setMessage(`Completed with warning · ${prs} PRs · ${data.warnings[0]}`);
        setRunning(false);
        return;
      }
      setMessage(`Complete · ${prs} PRs · ${sessions} sessions · function L1 ${l1 ?? 'suppressed'}`);
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Pipeline failed.');
      setRunning(false);
    }
  }

  return (
    <div className="admin-run-control">
      <button className="button primary" type="button" onClick={run} disabled={running}>
        {running ? 'Running live pipeline…' : 'Ingest + recalculate now'}
      </button>
      {message ? <span role="status">{message}</span> : null}
    </div>
  );
}
