import { redirect } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { loginPath } from '@/lib/navigation';

export async function GET(
  _request: Request,
  ctx: RouteContext<'/orders/[id]/invoice'>,
) {
  const { id } = await ctx.params;
  const orderPath = `/orders/${encodeURIComponent(id)}`;

  let target: string;
  try {
    target = (await api.getOrderInvoice(id)).url;
  } catch (error) {
    if (!(error instanceof ApiError)) {
      throw error;
    }
    if (error.status === 400 || error.status === 404) {
      return new Response('Order not found', { status: 404 });
    }
    if (error.status === 401) {
      target = loginPath(orderPath, true);
    } else if (error.status === 409) {
      target = orderPath;
    } else {
      throw error;
    }
  }
  redirect(target);
}
