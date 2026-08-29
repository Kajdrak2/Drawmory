import { apiError, apiJson } from '@/lib/server/api';
import { previewHandoff } from '@/lib/server/repository';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get('token') ?? undefined;
    const code = url.searchParams.get('code') ?? undefined;
    return apiJson(await previewHandoff({ token, code }));
  } catch (error) {
    return apiError(error);
  }
}
