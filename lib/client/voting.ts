const VOTER_TOKEN_KEY = 'drawmoryVoterToken';
const VOTED_JOURNEYS_KEY = 'drawmoryVotedJourneys';

export function readVotedJourneys() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(VOTED_JOURNEYS_KEY) ?? '[]');
    return new Set<string>(Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : []);
  } catch {
    return new Set<string>();
  }
}

export function rememberVote(publicSlug: string) {
  const voted = readVotedJourneys();
  voted.add(publicSlug);
  try {
    window.localStorage.setItem(VOTED_JOURNEYS_KEY, JSON.stringify([...voted]));
  } catch {
    // The server still enforces one vote for the current voter token.
  }
  return voted;
}

export function getOrCreateVoterToken() {
  try {
    const saved = window.localStorage.getItem(VOTER_TOKEN_KEY);
    if (saved) return saved;
    const created = crypto.randomUUID();
    window.localStorage.setItem(VOTER_TOKEN_KEY, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}
