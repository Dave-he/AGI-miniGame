/**
 * FeedbackService — player-submitted feedback → Analytics events.
 *
 * The game is iterative; we want a tiny friction-free way for the
 * player to drop a rating + free-text note. The service stores the
 * feedback as ordinary `feedback.*` Analytics events so it shows up
 * alongside everything else in the Stats panel.
 *
 * The service is engine-agnostic and has no UI; bind it to a
 * button via a small form.
 */

import type { Analytics } from '../analytics/Analytics';

export type FeedbackKind = 'bug' | 'idea' | 'praise' | 'other';

export interface FeedbackEntry {
    kind: FeedbackKind;
    rating: number;        // 1..5
    text: string;          // up to 500 chars
    ts: number;
    pageUrl: string;       // window.location.href at the time
}

const MAX_TEXT = 500;
const ALLOWED_KINDS: FeedbackKind[] = ['bug', 'idea', 'praise', 'other'];

export class FeedbackService {
    private analytics: Analytics;
    private recent: FeedbackEntry[] = [];
    private maxRecent: number = 50;

    constructor(analytics: Analytics) {
        this.analytics = analytics;
    }

    /** Submit a new feedback entry. Returns the persisted entry. */
    submit(input: { kind: FeedbackKind; rating: number; text: string }): FeedbackEntry | { error: string } {
        const kind = ALLOWED_KINDS.includes(input.kind) ? input.kind : 'other';
        const rating = Math.max(1, Math.min(5, Math.round(input.rating)));
        const text = (input.text || '').slice(0, MAX_TEXT);
        const entry: FeedbackEntry = {
            kind,
            rating,
            text,
            ts: Date.now(),
            pageUrl: typeof window !== 'undefined' ? window.location.href : '<node>',
        };
        this.recent.push(entry);
        if (this.recent.length > this.maxRecent) this.recent.shift();
        this.analytics.track('feedback.submitted', {
            kind: entry.kind,
            rating: entry.rating,
        });
        return entry;
    }

    /** Return the recent feedback buffer. */
    list(): FeedbackEntry[] {
        return [...this.recent];
    }

    /** Total feedback submitted in this session. */
    count(): number { return this.recent.length; }

    /** Average rating across all submitted feedback (0 if none). */
    averageRating(): number {
        if (this.recent.length === 0) return 0;
        const sum = this.recent.reduce((n, e) => n + e.rating, 0);
        return sum / this.recent.length;
    }

    /** Counts by kind, useful for a quick breakdown. */
    countsByKind(): Record<FeedbackKind, number> {
        const out: Record<FeedbackKind, number> = { bug: 0, idea: 0, praise: 0, other: 0 };
        for (const e of this.recent) out[e.kind] += 1;
        return out;
    }
}
