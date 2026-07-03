/**
 * ProgressionUI — adds an XP bar + level-up banner + talent panel to the
 * existing HUD. Talks to WorldState / Progression.
 */

import type { Progression, ProgressionSnapshot, TalentDef } from '../player/Progression';
import { TALENT_LIBRARY } from '../player/Progression';

export interface ProgressionUIHooks {
    onLevelUp: (oldLevel: number, newLevel: number) => void;
    onTalentLearned: (talent: TalentDef) => void;
}

export class ProgressionUI {
    private root: HTMLElement;
    private progression: Progression;
    private hooks: ProgressionUIHooks;
    private levelUpBanner: HTMLElement | null = null;

    constructor(root: HTMLElement, progression: Progression, hooks: ProgressionUIHooks = {
        onLevelUp: () => {},
        onTalentLearned: () => {},
    }) {
        this.root = root;
        this.progression = progression;
        this.hooks = hooks;
    }

    /** Apply XP gains; emit level-up events to the HUD. */
    applyXp(amount: number): { levelsGained: number; newLevel: number } {
        const before = this.progression.level;
        const r = this.progression.addXp(amount);
        if (r.levelsGained > 0) {
            this.hooks.onLevelUp(before, r.newLevel);
            this.flashLevelUpBanner(before, r.newLevel);
        }
        this.render();
        return r;
    }

    learnTalent(talentId: string): boolean {
        const r = this.progression.learnTalent(talentId);
        if (r.ok) {
            const def = TALENT_LIBRARY.find(t => t.id === talentId)!;
            this.hooks.onTalentLearned(def);
        }
        this.render();
        return r.ok;
    }

    render(): void {
        const snap = this.progression.snapshot();
        const pct = (snap.xp / snap.xpToNext) * 100;
        const talentRows = TALENT_LIBRARY.map(def => {
            const learned = snap.talents.includes(def.id);
            const canLearn = !learned && snap.talentPoints >= def.cost &&
                (!def.requires || def.requires.every(r => snap.talents.includes(r)));
            const reqs = def.requires && def.requires.length > 0
                ? `（前置：${def.requires.map(r => TALENT_LIBRARY.find(t => t.id === r)?.name ?? r).join('、')}）`
                : '';
            return `
                <div class="prog-talent ${learned ? 'is-learned' : ''} ${canLearn ? 'is-available' : ''}" data-talent="${def.id}">
                    <div class="prog-talent-head">
                        <b>${def.name}</b>
                        <span class="prog-talent-cost">${def.cost} pt</span>
                    </div>
                    <div class="prog-talent-desc">${def.description}${reqs}</div>
                    ${learned ? '<span class="prog-talent-tag">已学</span>' : (canLearn ? '<span class="prog-talent-tag is-go">可学</span>' : '')}
                </div>
            `;
        }).join('');

        this.root.innerHTML = `
            <div class="prog-panel prog-xp">
                <div class="prog-row">
                    <span class="prog-label">Lv</span>
                    <b class="prog-level">${snap.level}</b>
                    <span class="prog-xp-text">${snap.xp} / ${snap.xpToNext} XP</span>
                </div>
                <div class="prog-bar"><div class="prog-bar-fill" style="width:${pct.toFixed(1)}%"></div></div>
                <div class="prog-points">天赋点：<b>${snap.talentPoints}</b> · 总 XP：${snap.totalXp}</div>
            </div>
            <div class="prog-panel prog-talents">
                <div class="prog-title">天赋树</div>
                <div class="prog-talent-list">${talentRows}</div>
            </div>
        `;

        // Bind click handlers for available talents
        this.root.querySelectorAll<HTMLElement>('.prog-talent.is-available').forEach(el => {
            el.addEventListener('click', () => {
                const id = el.getAttribute('data-talent');
                if (id) this.learnTalent(id);
            });
        });
    }

    private flashLevelUpBanner(oldLevel: number, newLevel: number): void {
        const banner = document.createElement('div');
        banner.className = 'prog-levelup';
        banner.textContent = `✨ 升级！Lv ${oldLevel} → ${newLevel} (+1 天赋点)`;
        document.body.appendChild(banner);
        this.levelUpBanner?.remove();
        this.levelUpBanner = banner;
        setTimeout(() => {
            banner.classList.add('is-fading');
            setTimeout(() => banner.remove(), 800);
        }, 1800);
    }
}
