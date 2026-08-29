import { apiError, apiJson } from '@/lib/server/api';
import { requireAdmin } from '@/lib/server/admin-auth';
import { listAdminJourneys } from '@/lib/server/admin-repository';

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    return apiJson({ journeys: await listAdminJourneys() });
  } catch (error) {
    return apiError(error);
  }
}
