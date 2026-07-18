import { createAdminClient } from '@/lib/supabase/admin';
import { DATA_CATALOGUE } from './catalog';

export interface ProcessingPolicy {
  confirmed: boolean;
  measurementStartDate: string | null;
  enabledKeys: ReadonlySet<string>;
  enabled: (key: string) => boolean;
}

/**
 * Unconfirmed workspaces retain the pre-0037 behavior for safe backwards
 * compatibility. Once the admin confirms Data configuration, only explicitly
 * enabled catalogue keys are admitted to future pipeline assembly.
 */
export async function getProcessingPolicy(functionId: string): Promise<ProcessingPolicy> {
  const db: any = createAdminClient();
  const [profileResult, preferenceResult] = await Promise.all([
    db.from('workspace_configuration').select('data_confirmed_at,measurement_start_date').eq('function_id', functionId).maybeSingle(),
    db.from('data_processing_preferences').select('data_key,enabled').eq('function_id', functionId),
  ]);
  const error = profileResult.error ?? preferenceResult.error;
  if (error) throw new Error(`Processing policy read failed: ${error.message}`);
  const confirmed = Boolean(profileResult.data?.data_confirmed_at);
  const measurementStartDate = typeof profileResult.data?.measurement_start_date === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(profileResult.data.measurement_start_date)
    ? profileResult.data.measurement_start_date
    : null;
  const enabledKeys = confirmed
    ? new Set<string>(((preferenceResult.data ?? []) as Array<{ data_key: string; enabled: boolean }>).filter((row) => row.enabled).map((row) => row.data_key))
    : new Set<string>(DATA_CATALOGUE.map((item) => item.key));
  return { confirmed, measurementStartDate, enabledKeys, enabled: (key: string) => enabledKeys.has(key) };
}
