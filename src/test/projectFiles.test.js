import { describe, it, expect } from 'vitest';
import {
  normalizePath,
  buildTree,
  resolveEntry,
  rewriteRefs,
  buildInlineDoc,
  buildPreviewDoc,
  applyFileEdits,
  extractFileEdits,
  isTextFile,
  isImageFile,
  imageMime,
  collectProjectFiles,
  readZipEntryContent,
  MAX_IMAGE_SIZE,
} from '../lib/projectFiles';

describe('normalizePath', () => {
  it('чистит путь', () => {
    expect(normalizePath('./a//b/../c.css')).toBe('a/c.css');
    expect(normalizePath('/index.html')).toBe('index.html');
    expect(normalizePath('..\\..\\etc')).toBe('etc');
  });
});

describe('buildTree', () => {
  it('строит дерево', () => {
    const t = buildTree(['index.html', 'css/a.css', 'css/b.css']);
    expect(t.map((n) => n.name)).toEqual(['css', 'index.html']);
    expect(t[0].children.map((n) => n.name)).toEqual(['a.css', 'b.css']);
  });
});

describe('resolveEntry', () => {
  it('index.html в приоритете', () => {
    expect(resolveEntry({ 'x.html': '', 'index.html': '' })).toBe('index.html');
  });
  it('иначе первый html', () => {
    expect(resolveEntry({ 'b.html': '', 'a.html': '' })).toBe('a.html');
  });
  it('без html — null', () => {
    expect(resolveEntry({ 'a.css': '' })).toBeNull();
  });
});

describe('rewriteRefs', () => {
  it('переписывает относительные, трогает абсолютные', () => {
    const html = '<link href="css/a.css"><script src="./js/b.js"></script><img src="https://x/y.png"><a href="#top">';
    const out = rewriteRefs(html, { 'css/a.css': 'blob:1', 'js/b.js': 'blob:2' }, 'index.html');
    expect(out).toContain('href="blob:1"');
    expect(out).toContain('src="blob:2"');
    expect(out).toContain('https://x/y.png');
    expect(out).toContain('#top');
  });
  it('учитывает подпапку entry', () => {
    const out = rewriteRefs('<script src="../js/a.js">', { 'js/a.js': 'blob:9' }, 'pages/index.html');
    expect(out).toContain('blob:9');
  });
});

describe('buildInlineDoc', () => {
  const files = {
    'index.html': '<html><head><link rel="stylesheet" href="css/a.css"></head><body><script src="js/b.js"></script><img src="https://x/y.png"></body></html>',
    'css/a.css': 'body{color:red}',
    'js/b.js': 'console.log(1)',
  };
  it('инлайнит локальные css/js, внешние не трогает', () => {
    const out = buildInlineDoc(files, 'index.html');
    expect(out).toContain('<style>\nbody{color:red}\n</style>');
    expect(out).toContain('<script>\nconsole.log(1)\n</script>');
    expect(out).toContain('https://x/y.png');
    expect(out).not.toContain('blob:');
  });
  it('нет entry — пусто', () => {
    expect(buildInlineDoc({}, 'index.html')).toBe('');
  });
});

describe('applyFileEdits', () => {
  it('create/update/delete/rename', () => {
    const r = applyFileEdits({ 'a.html': 'A' }, [
      { op: 'create', path: 'b.css', content: 'B' },
      { op: 'update', path: 'a.html', content: 'A2' },
      { op: 'rename', path: 'b.css', to: 'c.css' },
      { op: 'delete', path: 'a.html' },
    ]);
    expect(r.files).toEqual({ 'c.css': 'B' });
    expect(r.applied).toHaveLength(4);
    expect(r.skipped).toHaveLength(0);
  });
  it('мусор в skipped, файлы целы', () => {
    const r = applyFileEdits({ 'a.html': 'A' }, [
      { op: 'nuke', path: '/' },
      { op: 'delete', path: 'nope.html' },
      null,
      { op: 'create', path: 'a.html', content: 'dup' },
    ]);
    expect(r.files).toEqual({ 'a.html': 'A' });
    expect(r.skipped).toHaveLength(4);
  });
});

describe('extractFileEdits', () => {
  it('достаёт edits из fences', () => {
    const raw = '```json\n{"edits":[{"op":"update","path":"a.html","content":"x"}]}\n```';
    expect(extractFileEdits(raw)).toEqual([{ op: 'update', path: 'a.html', content: 'x' }]);
  });
  it('отсекает левые op', () => {
    expect(extractFileEdits('{"edits":[{"op":"hack"}]}')).toEqual([]);
  });
  it('мусор → null', () => {
    expect(extractFileEdits('просто текст')).toBeNull();
  });
});

describe('isTextFile', () => {
  it('фильтрует бинарное', () => {
    expect(isTextFile('a.png')).toBe(false);
    expect(isTextFile('a.HTML')).toBe(true);
    expect(isTextFile('js/app.js')).toBe(true);
  });
});

describe('isImageFile / imageMime', () => {
  it('растровые распознаются, svg остаётся текстовым', () => {
    expect(isImageFile('img/sneakers.png')).toBe(true);
    expect(isImageFile('FOTO.JPG')).toBe(true);
    expect(isImageFile('a.webp')).toBe(true);
    expect(isImageFile('index.html')).toBe(false);
    expect(isImageFile('a.svg')).toBe(false);
    expect(isTextFile('a.svg')).toBe(true);
  });
  it('MIME по расширению', () => {
    expect(imageMime('a.png')).toBe('image/png');
    expect(imageMime('a.jpg')).toBe('image/jpeg');
    expect(imageMime('a.jpeg')).toBe('image/jpeg');
    expect(imageMime('a.ico')).toBe('image/x-icon');
    expect(imageMime('a.avif')).toBe('image/avif');
  });
});

describe('collectProjectFiles — картинки в imporте папки', () => {
  const textFile = (name, text) => ({ name, size: text.length, text: async () => text });
  const imageFile = (name, size, bytes) => ({
    name,
    size,
    arrayBuffer: async () => Uint8Array.from(bytes).buffer,
  });

  it('картинка становится data-URI, текст остаётся текстом', async () => {
    const map = await collectProjectFiles([
      textFile('index.html', '<img src="/a.png">'),
      imageFile('a.png', 3, [1, 2, 3]),
    ]);
    expect(map['index.html']).toBe('<img src="/a.png">');
    expect(map['a.png']).toBe('data:image/png;base64,AQID');
  });
  it('картинка сверх лимита пропускается, текст цел', async () => {
    const map = await collectProjectFiles([
      imageFile('big.png', MAX_IMAGE_SIZE + 1, [1]),
      textFile('ok.css', 'body{}'),
    ]);
    expect(map['big.png']).toBeUndefined();
    expect(map['ok.css']).toBe('body{}');
  });
  it('незнакомые расширения не берутся', async () => {
    const map = await collectProjectFiles([
      { name: 'a.psd', size: 4, text: async () => 'x', arrayBuffer: async () => new ArrayBuffer(4) },
    ]);
    expect(map).toEqual({});
  });
});

describe('readZipEntryContent — записи ZIP', () => {
  const entry = (size, results) => ({
    _data: { uncompressedSize: size },
    async: async (fmt) => results[fmt],
  });

  it('картинка → data-URI через base64', async () => {
    expect(await readZipEntryContent(entry(100, { base64: 'QUJD' }), 'img/a.png'))
      .toBe('data:image/png;base64,QUJD');
  });
  it('текст → строка', async () => {
    expect(await readZipEntryContent(entry(5, { string: 'body{}' }), 'a.css')).toBe('body{}');
  });
  it('картинка сверх лимита → null', async () => {
    expect(await readZipEntryContent(entry(MAX_IMAGE_SIZE + 1, { base64: 'QUJD' }), 'a.png')).toBeNull();
  });
  it('неизвестный бинарник → null', async () => {
    expect(await readZipEntryContent(entry(5, { string: 'x' }), 'a.psd')).toBeNull();
  });
});

describe('buildInlineDoc — локальные картинки', () => {
  it('инлайнит локальные картинки как data-URI', () => {
    const out = buildInlineDoc({
      'index.html': '<img src="img/a.png"><img src="/img/b.png"><img src="https://x/y.png">',
      'img/a.png': 'data:image/png;base64,QUJD',
      'img/b.png': 'data:image/png;base64,QUJD',
    }, 'index.html');
    expect(out).toContain('<img src="data:image/png;base64,QUJD">');
    expect(out).not.toContain('/img/b.png');
    expect(out).toContain('https://x/y.png');
  });
  it('svg-текст превращается в data-URI', () => {
    const out = buildInlineDoc({
      'index.html': '<img src="i/logo.svg">',
      'i/logo.svg': '<svg><rect/></svg>',
    }, 'index.html');
    expect(out).toContain('src="data:image/svg+xml;charset=utf-8,');
    expect(out).not.toContain('src="i/logo.svg"');
  });
  it('картинки нет в files — ссылка не трогается', () => {
    const out = buildInlineDoc({ 'index.html': '<img src="miss.png">' }, 'index.html');
    expect(out).toBe('<img src="miss.png">');
  });
});

describe('buildPreviewDoc — data-URI', () => {
  it('проходит напрямую, blob не создаётся', () => {
    const { doc, revoke } = buildPreviewDoc({
      'index.html': '<img src="a.png">',
      'a.png': 'data:image/png;base64,QUJD',
    }, 'index.html');
    expect(doc).toContain('data:image/png;base64,QUJD');
    expect(doc).not.toContain('blob:');
    revoke();
  });
});

describe('applyFileEdits — защита data-URI картинок', () => {
  it('текстовая правка image-файла отклоняется, delete разрешён', () => {
    const r = applyFileEdits({ 'a.png': 'data:image/png;base64,QUJD', 'b.html': 'B' }, [
      { op: 'update', path: 'a.png', content: 'сломанная правка' },
      { op: 'create', path: 'new.png', content: 'тоже мусор' },
      { op: 'delete', path: 'b.html' },
    ]);
    expect(r.files['a.png']).toBe('data:image/png;base64,QUJD');
    expect(r.files['new.png']).toBeUndefined();
    expect(r.files['b.html']).toBeUndefined();
    expect(r.applied).toHaveLength(1);
    expect(r.skipped).toHaveLength(2);
  });
});
