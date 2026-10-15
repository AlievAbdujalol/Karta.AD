import { describe, it, expect } from 'vitest';
import { LEGAL_DOCS, CONSENT_DOC_IDS, getLegalDoc } from '../lib/legalDocs';

// На экране регистрации обязательно показываются Пользовательское
// соглашение и Условия использования: обе галочки включены и не снимаются,
// а названия документов открываются в модалке с полным текстом.
describe('legalDocs — правовые тексты регистрации', () => {
  it('обязательные согласия — ровно соглашение и условия', () => {
    expect(CONSENT_DOC_IDS).toEqual(['agreement', 'terms']);
    for (const id of CONSENT_DOC_IDS) expect(LEGAL_DOCS[id]).toBeTruthy();
  });

  it('у каждого документа заголовок и не меньше 10 разделов с текстом', () => {
    expect(LEGAL_DOCS.agreement.title).toBe('Пользовательское соглашение');
    expect(LEGAL_DOCS.terms.title).toBe('Условия использования');
    for (const id of CONSENT_DOC_IDS) {
      const doc = getLegalDoc(id);
      expect(doc.id).toBe(id);
      expect(doc.sections.length).toBeGreaterThanOrEqual(10);
      const headings = new Set();
      for (const s of doc.sections) {
        expect(typeof s.heading).toBe('string');
        expect(s.heading.trim()).not.toBe('');
        expect(typeof s.text).toBe('string');
        expect(s.text.trim().length).toBeGreaterThan(30);
        expect(headings.has(s.heading)).toBe(false);
        headings.add(s.heading);
      }
    }
  });

  it('без черновиковых пометок и заглушек', () => {
    const all = CONSENT_DOC_IDS
      .map((id) => LEGAL_DOCS[id].sections.map((s) => `${s.heading} ${s.text}`).join(' '))
      .join(' ');
    expect(all).not.toMatch(/TODO|lorem|ipsum|заполнить позже|\{\{/i);
  });

  it('соглашение покрывает аккаунт/геоданные, условия — услуги такси и доставки', () => {
    const agreement = LEGAL_DOCS.agreement.sections.map((s) => s.text).join(' ');
    const terms = LEGAL_DOCS.terms.sections.map((s) => s.text).join(' ');
    expect(agreement).toMatch(/Google/);
    expect(agreement).toMatch(/геолокацион/i);
    expect(agreement).toMatch(/персональн/i);
    expect(terms).toMatch(/такси/i);
    expect(terms).toMatch(/доставк/i);
    expect(terms).toMatch(/маршрут/i);
  });

  it('getLegalDoc: неизвестный или пустой id → null', () => {
    expect(getLegalDoc('nope')).toBeNull();
    expect(getLegalDoc('')).toBeNull();
    expect(getLegalDoc(undefined)).toBeNull();
  });
});
