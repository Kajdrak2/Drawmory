import { apiError } from '@/lib/server/api';
import { getPublicDrawing } from '@/lib/server/repository';

export async function GET(
  _request: Request,
  context: { params: Promise<{ publicSlug: string; drawingId: string }> },
) {
  try {
    const { publicSlug, drawingId } = await context.params;
    const image = await getPublicDrawing(publicSlug, drawingId);
    return new Response(image.body, {
      headers: {
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Type': image.mimeType,
        'Content-Security-Policy': "default-src 'none'",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
