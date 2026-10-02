const HISTORY_KEY = 'karta_search_history';
const MAX_HISTORY = 5;

export function getSearchHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

export function addToSearchHistory(destination) {
  if (!destination || !destination.name || !destination.lat) return;
  
  const history = getSearchHistory();
  const filtered = history.filter(h => h.name !== destination.name);
  const newHistory = [destination, ...filtered].slice(0, MAX_HISTORY);
  
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
  } catch {}
}
