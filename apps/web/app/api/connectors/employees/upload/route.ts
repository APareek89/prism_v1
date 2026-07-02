// app/api/connectors/employees/upload/route.ts
//
// POST /api/connectors/employees/upload — import an engineer roster CSV.
//
// Accepts the CSV either as a raw text/csv body or as multipart/form-data with a `file`
// field (the RosterUpload dropzone posts the latter). Parses + idempotently provisions
// every row into the bootstrap function via the onboarding service, returning a per-row
// summary so the Admin table can refresh.
//
// Expected columns (case/space-insensitive): name, designation, github_handle, email,
// claude_account_uuid. Only `name` is required.
//
// Admin-gated. Never throws.

import { withAdmin } from '@/lib/auth/guards';
import { importRosterCsv } from '@/lib/onboarding/roster-csv';
import {
  ok,
  badRequest,
  serverError,
  resolveBootstrapFunctionId,
  errMessage,
} from '../../_lib/route-helpers';

export const dynamic = 'force-dynamic';

/** Pull the CSV text from either a multipart `file` field or a raw text body. */
async function readCsv(req: Request): Promise<string | null> {
  const contentType = req.headers.get('content-type') ?? '';
  try {
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file');
      if (file && typeof file !== 'string') return await (file as File).text();
      const csvField = form.get('csv');
      if (typeof csvField === 'string') return csvField;
      return null;
    }
    // raw text/csv (or text/plain) body
    const text = await req.text();
    return text.length ? text : null;
  } catch {
    return null;
  }
}

export const POST = withAdmin(async (req: Request): Promise<Response> => {
  const functionId = await resolveBootstrapFunctionId();
  if (!functionId) return badRequest('no bootstrap function');

  const csv = await readCsv(req);
  if (!csv) return badRequest('no CSV provided (send a text/csv body or multipart `file`)');

  try {
    const result = await importRosterCsv(functionId, csv);
    return ok({
      ok: result.errors.length === 0,
      provisioned: result.provisioned,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors,
    });
  } catch (e) {
    return serverError(errMessage(e));
  }
});
