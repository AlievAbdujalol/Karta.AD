import { useState } from 'react';
import { Search, X } from 'lucide-react';

export default function SearchBar({ routes, onSelect, onClear, placeholder }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const q = query.trim().toLowerCase();
  const results = q.length < 1 ? [] : routes.filter(r => {
    const matchNumber = r.number?.toLowerCase().includes(q);
    const matchName = r.name?.toLowerCase().includes(q);
    const matchStop = r.stops?.some(s => s.name?.toLowerCase().includes(q));
    return matchNumber || matchName || matchStop;
  }).slice(0, 8);

  const handleSelect = (route) => {
    setQuery(`#${route.number}${route.name ? ' — ' + route.name : ''}`);
    setOpen(false);
    onSelect(route);
  };

  const handleClear = () => {
    setQuery('');
    setOpen(false);
    onClear();
  };

  return (
    <div className="relative flex-1 min-w-[160px]">
      <div className="flex items-center border border-gray-200 rounded-lg bg-white overflow-hidden">
        <Search size={14} className="text-gray-400 ml-2.5 flex-shrink-0" />
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          className="flex-1 px-2 py-2 text-xs outline-none bg-transparent"
        />
        {query && (
          <button onClick={handleClear} className="pr-2 text-gray-400 hover:text-gray-600">
            <X size={13} />
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-50 mt-1 max-h-52 overflow-y-auto">
          {results.map(r => {
            const matchedStop = r.stops?.find(s => s.name?.toLowerCase().includes(q));
            return (
              <button
                key={r.id}
                onMouseDown={() => handleSelect(r)}
                className="w-full text-left px-3 py-2.5 hover:bg-blue-50 border-b border-gray-50 last:border-0 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                    #{r.number}
                  </span>
                  <span className="text-xs text-gray-700 font-medium truncate">{r.name || ''}</span>
                  <span className="text-[10px] text-gray-400 ml-auto">{r.type === 'bus' ? '🚌' : '🚐'}</span>
                </div>
                {matchedStop && (
                  <p className="text-[10px] text-blue-500 mt-0.5 pl-0.5">📍 {matchedStop.name}</p>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}