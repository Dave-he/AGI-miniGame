/**
 * TutorialOverlay — first-time walkthrough for new players.
 *
 * Shows 4 steps in sequence:
 *   1. 进入次元  — click a portal or press "进入次元"
 *   2. 模因突变  — combine memes into a DSL rule
 *   3. 纪元更迭  — trigger the 大坍缩
 *   4. 持久化    — save and load your progress
 *
 * The overlay is dismissed when the player completes the last step
 * (or clicks "skip"). A small badge in the HUD remembers the player
 * has graduated.
 */

export type TutorialStepId = 'enter' | 'meme' | 'epoch' | 'save';

export interface TutorialStep {
    id: TutorialStepId;
    title: string;
    body: string;
    /** Element to highlight (CSS selector) — null = no highlight. */
    highlight?: string;
    /** Events that mark this step complete. */
    advanceOn: string[];
}

export const TUTORIAL_STEPS: TutorialStep[] = [
    {
        id: 'enter',
        title: '第一步 · 进入次元',
        body: '点击任意立方体传送门，或在右下角按下「进入次元」，让 AI 中枢为你生成一个独一无二的试炼。',
        advanceOn: ['dimension-entered'],
    },
    {
        id: 'meme',
        title: '第二步 · 模因突变',
        body: '点击「模因→DSL」按钮，把 模因碎片 注入编译槽。AGI 会在编译充能 + 护盾激活后，将生成的 DSL 实时应用到 3D 世界。',
        advanceOn: ['hot-reload-applied'],
    },
    {
        id: 'epoch',
        title: '第三步 · 大坍缩',
        body: '当世界规则累积到 8 条，纪元将自动更迭；或点击「触发大坍缩」手动压缩历史遗迹，进入新纪元。',
        advanceOn: ['epoch-collapsed'],
    },
    {
        id: 'save',
        title: '第四步 · 持久化',
        body: '点击「存档」保存你的进度；「读档」随时恢复。AGI-miniGame 会每 30 秒自动保存。',
        advanceOn: ['save-persisted'],
    },
];

const DONE_KEY = 'agi_tutorial_done';

export class TutorialOverlay {
    private root: HTMLElement;
    private currentIdx: number = 0;
    private listeners: Array<(step: TutorialStep) => void> = [];
    private skipped: boolean = false;

    constructor(root: HTMLElement) {
        this.root = root;
        if (typeof localStorage !== 'undefined' && localStorage.getItem(DONE_KEY) === '1') {
            this.skipped = true;
        }
    }

    isComplete(): boolean {
        return this.skipped || this.currentIdx >= TUTORIAL_STEPS.length;
    }

    /** Notify the tutorial of a game event. */
    notify(event: string): void {
        if (this.isComplete()) return;
        const step = TUTORIAL_STEPS[this.currentIdx];
        if (step.advanceOn.includes(event)) {
            this.currentIdx += 1;
            this.render();
            if (this.currentIdx >= TUTORIAL_STEPS.length) {
                if (typeof localStorage !== 'undefined') {
                    try { localStorage.setItem(DONE_KEY, '1'); } catch { /* noop */ }
                }
                setTimeout(() => this.root.remove(), 1200);
            }
        }
    }

    skip(): void {
        this.skipped = true;
        this.currentIdx = TUTORIAL_STEPS.length;
        this.root.innerHTML = '';
        if (typeof localStorage !== 'undefined') {
            try { localStorage.setItem(DONE_KEY, '1'); } catch { /* noop */ }
        }
    }

    on(listener: (step: TutorialStep) => void): () => void {
        this.listeners.push(listener);
        return () => { this.listeners = this.listeners.filter(l => l !== listener); };
    }

    render(): void {
        if (this.isComplete()) {
            this.root.innerHTML = '';
            return;
        }
        const step = TUTORIAL_STEPS[this.currentIdx];
        const remaining = TUTORIAL_STEPS.length - this.currentIdx;
        this.root.innerHTML = `
            <div class="tut-card">
                <div class="tut-step">第 ${this.currentIdx + 1} 步 / 共 ${TUTORIAL_STEPS.length} 步</div>
                <div class="tut-title">${escapeHtml(step.title)}</div>
                <div class="tut-body">${escapeHtml(step.body)}</div>
                <div class="tut-foot">
                    <span class="tut-progress">剩余 ${remaining} 步</span>
                    <button class="tut-skip">跳过教程</button>
                </div>
            </div>
        `;
        this.root.querySelector('.tut-skip')?.addEventListener('click', () => this.skip());
        for (const l of this.listeners) l(step);
    }
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
