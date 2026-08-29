import { apiError, apiJson } from '@/lib/server/api';
import { getPublicJourney } from '@/lib/server/repository';

export async function GET(
  _request: Request,
  context: { params: Promise<{ publicSlug: string }> },
) {
  try {
    const { publicSlug } = await context.params;
    return apiJson(await getPublicJourney(publicSlug));
  } catch (error) {
    return apiError(error);
  }
}
