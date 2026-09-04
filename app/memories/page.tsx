import type { Metadata } from 'next';
import { DeviceMemories } from '@/components/device-memories';

export const metadata: Metadata = {
  title: 'Saved Drawmories',
  robots: { index: false, follow: false, noarchive: true },
};

export default function MemoriesPage() {
  return <DeviceMemories />;
}
