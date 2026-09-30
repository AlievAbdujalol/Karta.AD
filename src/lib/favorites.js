const FAVS_KEY = 'karta_favorite_routes';

export function getFavoriteRoutes() {
  return JSON.parse(localStorage.getItem(FAVS_KEY) || '[]');
}

export function toggleFavoriteRoute(route) {
  const favorites = getFavoriteRoutes();
  const index = favorites.findIndex(f => f.id === route.id);
  
  if (index > -1) {
    favorites.splice(index, 1);
  } else {
    favorites.push({ ...route, id: Date.now() });
  }
  
  localStorage.setItem(FAVS_KEY, JSON.stringify(favorites));
  return favorites;
}

export function isRouteFavorite(routeId) {
  return getFavoriteRoutes().some(f => f.id === routeId);
}
