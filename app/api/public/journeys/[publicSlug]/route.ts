import { apiError, apiJson } from '@/lib/server/api';
import { getPublicJourney } from '@/lib/server/repository';

export async function GET(
  request: Request,
  context: { params: Promise<{ publicSlug: string }> },
) {
  try {
    const { publicSlug } = await context.params;
    const includeNsfw = new URL(request.url).searchParams.get('includeNsfw') === '1';
    return apiJson(await getPublicJourney(publicSlug, includeNsfw));
  } catch (error) {
    return apiError(error);
  }
}
