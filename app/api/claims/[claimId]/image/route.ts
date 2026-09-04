import { apiError } from '@/lib/server/api';
import { getClaimImage } from '@/lib/server/repository';

export async function GET(
  request: Request,
  context: { params: Promise<{ claimId: string }> },
) {
  try {
    const { claimId } = await context.params;
    const includeNsfw = new URL(request.url).searchParams.get('includeNsfw') === '1';
    const image = await getClaimImage(request, claimId, includeNsfw);
    return new Response(image.body, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Content-Type': image.mimeType,
        'Content-Security-Policy': "default-src 'none'",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
