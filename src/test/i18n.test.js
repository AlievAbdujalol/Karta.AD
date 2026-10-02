import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ru from '../locales/ru.json';
import tg from '../locales/tg.json';
import en from '../locales/en.json';
import { CATEGORIES } from '../components/PoiOverlay';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function collectTKeys() {
  const keys = new Set();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== 'locales' && e.name !== 'test') walk(p);
      } else if (/\.(jsx?|tsx?)$/.test(e.name)) {
        const s = fs.readFileSync(p, 'utf8');
        const re = /\bt\(\s*['"`]([A-Za-z0-9_.]+)['"`]\s*\)/g;
        let m;
        while ((m = re.exec(s))) keys.add(m[1]);
      }
    }
  };
  walk(path.join(root));
  return keys;
}

function get(obj, dotted) {
  return dotted.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

// Динамические ключи, которых нет в виде литералов t('...')
const DYNAMIC_KEYS = [
  // TILE_LAYERS labelKey (MapControls)
  'mapControls.layerStandard',
  'mapControls.layerDark',
  'mapControls.layerGoogle',
  'mapControls.layerHybrid',
  'mapControls.layerOsm',
  'mapControls.layerEsriStreet',
  'mapControls.layerEsriTopo',
  'mapControls.layerGoogleSat',
  'mapControls.layerGoogleHybrid',
  // Выбор языка в профиле
  'profile.langRu',
  'profile.langTg',
  'profile.langEn',
  // Категории POI + фолбэк
  ...Object.keys(CATEGORIES).map((c) => `busmap.poi.${c}`),
  'busmap.poi.other',
];

describe('i18n coverage', () => {
  it('каждый t() ключ из кода есть в ru/tg/en и не пуст', () => {
    const keys = new Set([...collectTKeys(), ...DYNAMIC_KEYS]);
    expect(keys.size).toBeGreaterThan(100);
    const missing = [];
    const empty = [];
    for (const k of keys) {
      for (const [lang, dict] of [['ru', ru], ['tg', tg], ['en', en]]) {
        const v = get(dict, k);
        if (typeof v !== 'string') missing.push(`${lang}:${k}`);
        else if (!v.trim()) empty.push(`${lang}:${k}`);
      }
    }
    expect(missing).toEqual([]);
    expect(empty).toEqual([]);
  });

  it('структуры ru/tg/en совпадают', () => {
    const flat = (o, prefix = '') =>
      Object.entries(o).flatMap(([k, v]) =>
        v && typeof v === 'object' ? flat(v, prefix + k + '.') : [prefix + k],
      );
    const ruKeys = new Set(flat(ru));
    const tgKeys = new Set(flat(tg));
    const enKeys = new Set(flat(en));
    for (const k of ruKeys) {
      expect(tgKeys.has(k), `tg missing ${k}`).toBe(true);
      expect(enKeys.has(k), `en missing ${k}`).toBe(true);
    }
  });
});
