import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { calcAvg, validatePhone, getGpsColor } from '../lib/utils';

describe('Utility Functions - Property Based Testing', () => {
  it('Property 7: calcAvg computes expected average', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            cleanliness: fc.integer({ min: 1, max: 5 }),
            politeness: fc.integer({ min: 1, max: 5 }),
            punctuality: fc.integer({ min: 1, max: 5 }),
          }),
          { minLength: 1 }
        ),
        (reviews) => {
          const avg = calcAvg(reviews);
          const expectedSum = reviews.reduce((acc, r) => {
            return acc + (Number(r.cleanliness) + Number(r.politeness) + Number(r.punctuality)) / 3;
          }, 0);
          const expectedAvg = expectedSum / reviews.length;
          expect(avg).toBeCloseTo(expectedAvg, 5);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 9: validatePhone validates phone number according to tajikistan format', () => {
    const validPhoneArb = fc.record({
      space1: fc.constantFrom('', ' '),
      digits1: fc.stringOf(fc.integer({ min: 0, max: 9 }), { minLength: 2, maxLength: 2 }),
      space2: fc.constantFrom('', ' '),
      digits2: fc.stringOf(fc.integer({ min: 0, max: 9 }), { minLength: 3, maxLength: 3 }),
      space3: fc.constantFrom('', ' '),
      digits3: fc.stringOf(fc.integer({ min: 0, max: 9 }), { minLength: 4, maxLength: 4 }),
    }).map(({ space1, digits1, space2, digits2, space3, digits3 }) => {
      return `+992${space1}${digits1}${space2}${digits2}${space3}${digits3}`;
    });

    fc.assert(
      fc.property(validPhoneArb, (phone) => {
        expect(validatePhone(phone)).toBe(true);
      }),
      { numRuns: 100 }
    );

    expect(validatePhone('')).toBe(true);
    expect(validatePhone(null)).toBe(true);
    expect(validatePhone(undefined)).toBe(true);

    fc.assert(
      fc.property(
        fc.string().filter(s => {
          const PHONE_REGEX = /^\+992\s?\d{2}\s?\d{3}\s?\d{4}$/;
          return s !== '' && !PHONE_REGEX.test(s);
        }),
        (phone) => {
          expect(validatePhone(phone)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 11: getGpsColor returns correct colors based on accuracy ranges', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 20, noNaN: true, noInfinity: true }),
        (accuracy) => {
          expect(getGpsColor(accuracy)).toBe('green');
        }
      ),
      { numRuns: 100 }
    );

    fc.assert(
      fc.property(
        fc.double({ min: 20.00001, max: 50, noNaN: true, noInfinity: true }),
        (accuracy) => {
          expect(getGpsColor(accuracy)).toBe('yellow');
        }
      ),
      { numRuns: 100 }
    );

    fc.assert(
      fc.property(
        fc.double({ min: 50.00001, max: 10000, noNaN: true, noInfinity: true }),
        (accuracy) => {
          expect(getGpsColor(accuracy)).toBe('red');
        }
      ),
      { numRuns: 100 }
    );

    expect(getGpsColor(null)).toBe('red');
    expect(getGpsColor(undefined)).toBe('red');
  });
});
