import { apiError, apiJson } from '@/lib/server/api';
import { getReceipt } from '@/lib/server/repository';

export async function GET(
  _request: Request,
  context: { params: Promise<{ receiptToken: string }> },
) {
  try {
    const { receiptToken } = await context.params;
    return apiJson(await getReceipt(receiptToken));
  } catch (error) {
    return apiError(error);
  }
}
