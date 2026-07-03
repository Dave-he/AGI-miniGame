/**
 * FeedbackService tests.
 */

import { FeedbackService } from '../feedback/FeedbackService';
import { Analytics } from '../analytics/Analytics';

function make() {
    const a = new Analytics();
    const f = new FeedbackService(a);
    return { a, f };
}

describe('FeedbackService', () => {
    test('submit returns a normalised entry', () => {
        const { f } = make();
        const r = f.submit({ kind: 'bug', rating: 4, text: 'match3 is too easy' });
        expect('error' in r).toBe(false);
        if ('error' in r) return;
        expect(r.kind).toBe('bug');
        expect(r.rating).toBe(4);
        expect(r.text).toBe('match3 is too easy');
        expect(r.ts).toBeGreaterThan(0);
    });

    test('text longer than 500 chars is truncated', () => {
        const { f } = make();
        const huge = 'a'.repeat(800);
        const r = f.submit({ kind: 'idea', rating: 3, text: huge });
        if ('error' in r) throw new Error('expected entry');
        expect(r.text.length).toBe(500);
    });

    test('rating is clamped to 1..5', () => {
        const { f } = make();
        const a = f.submit({ kind: 'other', rating: -7, text: '' });
        const b = f.submit({ kind: 'other', rating: 99, text: '' });
        if ('error' in a || 'error' in b) throw new Error('expected entry');
        expect(a.rating).toBe(1);
        expect(b.rating).toBe(5);
    });

    test('unknown kind falls back to other', () => {
        const { f } = make();
        const r = f.submit({ kind: 'not-a-kind' as any, rating: 3, text: 'x' });
        if ('error' in r) throw new Error('expected entry');
        expect(r.kind).toBe('other');
    });

    test('count, averageRating, countsByKind', () => {
        const { f } = make();
        f.submit({ kind: 'bug', rating: 1, text: 'a' });
        f.submit({ kind: 'bug', rating: 3, text: 'b' });
        f.submit({ kind: 'praise', rating: 5, text: 'c' });
        expect(f.count()).toBe(3);
        expect(f.averageRating()).toBeCloseTo(3, 5);
        expect(f.countsByKind().bug).toBe(2);
        expect(f.countsByKind().praise).toBe(1);
    });

    test('list returns entries in submission order', () => {
        const { f } = make();
        f.submit({ kind: 'other', rating: 1, text: 'first' });
        f.submit({ kind: 'other', rating: 2, text: 'second' });
        const list = f.list();
        expect(list[0].text).toBe('first');
        expect(list[1].text).toBe('second');
    });

    test('submit fires a feedback.submitted Analytics event', () => {
        const { a, f } = make();
        f.submit({ kind: 'idea', rating: 4, text: 'cool' });
        expect(a.count('feedback.submitted')).toBe(1);
    });
});
