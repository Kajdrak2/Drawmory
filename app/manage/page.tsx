import type { Metadata } from 'next';
import { AdminPanel } from '@/components/admin-panel';

export const metadata: Metadata = {
  title: 'Administration · Drawmory',
  robots: { index: false, follow: false },
};

export default function ManagePage() {
  return <AdminPanel />;
}
