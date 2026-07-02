// CLI: npm run v3:recompute (root). Recomputes against the active config version.
import { recompute } from './run';

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error('✗ SUPABASE_DB_URL is not set (run via npm run v3:recompute at the repo root).');
  process.exit(1);
}

recompute(url)
  .then((s) => {
    console.log(`✓ v3 recompute (config v${s.configVersion}, as-of ${s.date}): ` +
      `${s.developers} developers · ${s.links} links · ${s.kpiRows} KPI rows · ` +
      `${s.insights} insights · ${s.recommendations} recommendations.`);
  })
  .catch((err) => {
    console.error('✗ recompute failed:', err.message);
    process.exit(1);
  });
