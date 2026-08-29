import type { Metadata } from 'next';
import { ReceiptFlow } from '@/components/receipt-flow';

export const metadata: Metadata = {
  title: 'Your Drawmory memory link',
  robots: { index: false, follow: false },
  openGraph: { images: [] },
  twitter: { images: [] },
};

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ receiptToken: string }>;
}) {
  const { receiptToken } = await params;
  return <ReceiptFlow token={receiptToken} />;
}
