import { describe, it, expect } from 'vitest';
import {
  normalizePath,
  buildTree,
  resolveEntry,
  rewriteRefs,
  applyFileEdits,
  extractFileEdits,
  isTextFile,
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
