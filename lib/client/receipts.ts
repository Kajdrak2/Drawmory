export type SavedReceipt = {
  token: string;
  journeyId: string;
  publicSlug: string;
  savedAt: number;
};

const STORAGE_KEY = 'drawmoryReceipts';

export function getSavedReceipts(): SavedReceipt[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SavedReceipt =>
        Boolean(
          item &&
            typeof item === 'object' &&
            typeof (item as SavedReceipt).token === 'string' &&
            typeof (item as SavedReceipt).journeyId === 'string' &&
            typeof (item as SavedReceipt).publicSlug === 'string' &&
            typeof (item as SavedReceipt).savedAt === 'number',
        ),
    );
  } catch {
    return [];
  }
}

export function saveReceipt(receipt: SavedReceipt) {
  const existing = getSavedReceipts().filter((item) => item.token !== receipt.token);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([receipt, ...existing].slice(0, 30)));
}
