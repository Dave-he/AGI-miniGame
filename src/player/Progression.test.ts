/**
 * Progression tests.
 */

import { Progression, XP_PER_LEVEL, TALENT_LIBRARY } from '../player/Progression';

describe('Progression', () => {
    test('level 1 XP cost matches formula', () => {
        expect(XP_PER_LEVEL(1)).toBe(50 + 25 + 5);
    });

    test('addXp triggers level-ups', () => {
        const p = new Progression();
        const r = p.addXp(XP_PER_LEVEL(1) + 10);
        expect(p.level).toBe(2);
        expect(p.xp).toBe(10);
        expect(p.talentPoints).toBe(1);
        expect(r.levelsGained).toBe(1);
    });

    test('learnTalent enforces prerequisites and cost', () => {
        const p = new Progression();
        p.talentPoints = 5;
        // second_wind requires iron_skin
        expect(p.learnTalent('second_wind').ok).toBe(false);
        expect(p.learnTalent('iron_skin').ok).toBe(true);
        expect(p.learnTalent('second_wind').ok).toBe(true);
    });

    test('talent multiplier is 1.0 by default and reflects learned talent', () => {
        const p = new Progression();
        expect(p.talentMultiplier('damage')).toBe(1.0);
        p.talentPoints = 1;
        p.learnTalent('power_strike');
        expect(p.talentMultiplier('damage')).toBeCloseTo(1.10, 5);
    });

    test('snapshot exposes totalXp and talent points', () => {
        const p = new Progression();
        p.addXp(50); // half a level
        const s = p.snapshot();
        expect(s.totalXp).toBe(50);
        expect(s.level).toBe(1);
        expect(s.xp).toBe(50);
        expect(s.talentPoints).toBe(0);
    });

    test('talent library is non-empty and ids are unique', () => {
        expect(TALENT_LIBRARY.length).toBeGreaterThan(0);
        const ids = new Set(TALENT_LIBRARY.map(t => t.id));
        expect(ids.size).toBe(TALENT_LIBRARY.length);
    });
});
