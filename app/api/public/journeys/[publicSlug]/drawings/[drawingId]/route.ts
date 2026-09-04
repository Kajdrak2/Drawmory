import { apiError } from '@/lib/server/api';
import { getPublicDrawing } from '@/lib/server/repository';

export async function GET(
  request: Request,
  context: { params: Promise<{ publicSlug: string; drawingId: string }> },
) {
  try {
    const { publicSlug, drawingId } = await context.params;
    const includeNsfw = new URL(request.url).searchParams.get('includeNsfw') === '1';
    const image = await getPublicDrawing(publicSlug, drawingId, includeNsfw);
    return new Response(image.body, {
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Type': image.mimeType,
        'Content-Security-Policy': "default-src 'none'",
        ...(image.isNsfw ? { 'X-Robots-Tag': 'noindex, nofollow' } : {}),
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
