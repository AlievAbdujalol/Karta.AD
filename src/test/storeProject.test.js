import { describe, it, expect } from 'vitest';
import { buildStoreProject, findSecrets, SECRET_PATTERNS } from '../lib/storeProject';

const OPTS = {
  name: 'Магазин-AD',
  description: 'Спортивные товары',
  businessId: '5e90b003-02eb-425c-9fe0-d579bab6402e',
  supabaseUrl: 'https://example.supabase.co',
  anonKey: 'sb_publishable_test_key',
  appOrigin: 'https://karta-ad.vercel.app',
};

const files = buildStoreProject(OPTS);

describe('buildStoreProject: структура (спецификация §9)', () => {
  it('содержит обязательные файлы', () => {
    for (const path of [
      'package.json', 'README.md', '.env.example', 'index.html', 'vite.config.js',
      'src/main.jsx', 'src/App.jsx', 'src/styles.css', 'src/lib/kartaApi.js',
      'src/components/Header.jsx', 'src/components/Hero.jsx',
      'src/components/ProductGrid.jsx', 'src/components/Cart.jsx',
      'src/components/Checkout.jsx', 'src/components/Delivery.jsx',
      'src/components/Payment.jsx', 'src/components/Footer.jsx',
    ]) {
      expect(Object.keys(files), `нет ${path}`).toContain(path);
      expect(typeof files[path]).toBe('string');
      expect(files[path].length).toBeGreaterThan(0);
    }
  });

  it('package.json валиден: имя из slug, react 18, vite 6', () => {
    const pkg = JSON.parse(files['package.json']);
    expect(pkg.name).toMatch(/^[a-z0-9-]+$/);
    expect(pkg.dependencies.react).toMatch(/^\^?18\./);
    expect(Object.keys(pkg.devDependencies)).toContain('vite');
    expect(pkg.scripts.build).toBe('vite build');
  });

  it('index.html ссылается на src/main.jsx и содержит название', () => {
    expect(files['index.html']).toContain('src="/src/main.jsx"');
    expect(files['index.html']).toContain('Магазин-AD');
  });

  it('.env.example содержит только VITE_KARTA_API_URL и VITE_BUSINESS_ID', () => {
    const envKeys = files['.env.example']
      .split('\n')
      .filter((l) => l.includes('='))
      .map((l) => l.split('=')[0].trim());
    expect(envKeys).toEqual(['VITE_KARTA_API_URL', 'VITE_BUSINESS_ID']);
    expect(files['.env.example']).toContain(OPTS.businessId);
    expect(files['.env.example']).toContain(OPTS.appOrigin);
  });
});

describe('безопасность: в экспорте нет секретов', () => {
  it('findSecrets не находит масок ни в одном файле', () => {
    expect(findSecrets(files)).toEqual([]);
  });

  it('publishable anon key и url вшиты в kartaApi (публичные)', () => {
    expect(files['src/lib/kartaApi.js']).toContain(OPTS.supabaseUrl);
    expect(files['src/lib/kartaApi.js']).toContain(OPTS.anonKey);
  });

  it('маски секретов реально ищутся (самопроверка findSecrets)', () => {
    expect(SECRET_PATTERNS.length).toBeGreaterThanOrEqual(5);
    const bad = { 'x.js': 'const k = "sk-or-v1-abc123";' };
    expect(findSecrets(bad)).toHaveLength(1);
    expect(findSecrets({ 'ok.js': 'всё чисто' })).toEqual([]);
  });
});

describe('kartaApi: серверная валидация заказов', () => {
  const api = files['src/lib/kartaApi.js'];

  it('заказ уходит только через RPC create_store_order, без цен', () => {
    expect(api).toContain('create_store_order');
    expect(api).toContain('get_public_business');
    // create_store_order не принимает total — клиент его не считает
    expect(api).not.toMatch(/total:/);
  });

  it('предупреждение про секреты отсутствует (только publishable)', () => {
    expect(api).toContain('publishable');
    expect(api).not.toContain('SERVICE_ROLE');
  });

  it('валидирует business_id по UUID перед запросом', () => {
    expect(api).toMatch(/BIZ_ID_RE/);
    expect(api).toContain('UUID');
  });
});

describe('App.jsx: реальная сборка компонентов', () => {
  const app = files['src/App.jsx'];

  it('импортирует все компоненты из §9', () => {
    for (const c of ['Header', 'Hero', 'ProductGrid', 'Cart', 'Checkout', 'Delivery', 'Payment', 'Footer']) {
      expect(app, `нет импорта ${c}`).toContain(`components/${c}.jsx`);
    }
  });

  it('корзина собирает items с product_id/quantity и уходит в Checkout', () => {
    expect(app).toContain('product_id');
    expect(app).toContain('quantity');
    expect(app).toContain('<Checkout');
  });

  it('Checkout отправляет заказ через createStoreOrder', () => {
    const co = files['src/components/Checkout.jsx'];
    expect(co).toContain('createStoreOrder');
    expect(co).toContain('paymentMethod');
    expect(co).not.toContain('total:');
  });
});
