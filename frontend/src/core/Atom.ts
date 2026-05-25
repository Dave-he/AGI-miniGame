export const AtomPhase = {
    Uninitialized: 'uninitialized',
    Initialized: 'initialized',
    Running: 'running',
    Paused: 'paused',
    Completed: 'completed',
    Failed: 'failed',
} as const;
export type AtomPhase = typeof AtomPhase[keyof typeof AtomPhase];

export interface AtomContext {
    worldState: any;
    deltaTime: number;
    sharedData: Record<string, any>;
}

export interface AtomMetadata {
    id: string;
    name: string;
    version: number;
    gameplayType: string;
    description: string;
    tags: string[];
}

export abstract class Atom {
    abstract readonly atomId: string;
    abstract readonly atomName: string;
    readonly atomVersion: number = 1;

    protected phase: AtomPhase = AtomPhase.Uninitialized;
    protected _score: number = 0;

    get currentPhase(): AtomPhase { return this.phase; }
    get currentScore(): number { return this._score; }

    abstract onInit(ctx: AtomContext): void;
    abstract onEnter(ctx: AtomContext): void;
    abstract onUpdate(ctx: AtomContext): void;
    abstract onExit(ctx: AtomContext): void;
    abstract onDestroy(): void;

    onPause(_ctx: AtomContext): void { this.phase = AtomPhase.Paused; }
    onResume(_ctx: AtomContext): void { this.phase = AtomPhase.Running; }

    abstract saveState(): Record<string, any>;
    abstract loadState(state: Record<string, any>): void;

    handleEvent(_event: string, _data: Record<string, any>, _ctx: AtomContext): void {}
}

export class AtomRegistry {
    private factories = new Map<string, () => Atom>();
    private metadataMap = new Map<string, AtomMetadata>();

    register(id: string, metadata: AtomMetadata, factory: () => Atom): void {
        this.factories.set(id, factory);
        this.metadataMap.set(id, metadata);
    }

    create(id: string): Atom | null {
        const factory = this.factories.get(id);
        return factory ? factory() : null;
    }

    getMetadata(id: string): AtomMetadata | undefined {
        return this.metadataMap.get(id);
    }

    listAll(): AtomMetadata[] {
        return Array.from(this.metadataMap.values());
    }

    findByTag(tag: string): AtomMetadata[] {
        return Array.from(this.metadataMap.values()).filter(m => m.tags.includes(tag));
    }

    findByGameplayType(type: string): AtomMetadata[] {
        return Array.from(this.metadataMap.values()).filter(m => m.gameplayType === type);
    }

    get count(): number { return this.factories.size; }
}

export class AtomRunner {
    private atom: Atom;

    constructor(atom: Atom) {
        this.atom = atom;
    }

    init(ctx: AtomContext): void {
        if (this.atom.currentPhase === AtomPhase.Uninitialized) {
            this.atom.onInit(ctx);
        }
    }

    enter(ctx: AtomContext): void {
        if (this.atom.currentPhase === AtomPhase.Initialized || this.atom.currentPhase === AtomPhase.Completed) {
            this.atom.onEnter(ctx);
        }
    }

    update(ctx: AtomContext): void {
        if (this.atom.currentPhase === AtomPhase.Running) {
            this.atom.onUpdate(ctx);
        }
    }

    pause(ctx: AtomContext): void {
        if (this.atom.currentPhase === AtomPhase.Running) {
            this.atom.onPause(ctx);
        }
    }

    resume(ctx: AtomContext): void {
        if (this.atom.currentPhase === AtomPhase.Paused) {
            this.atom.onResume(ctx);
        }
    }

    exit(ctx: AtomContext): void {
        if (this.atom.currentPhase === AtomPhase.Running || this.atom.currentPhase === AtomPhase.Paused) {
            this.atom.onExit(ctx);
        }
    }

    destroy(): void {
        this.atom.onDestroy();
    }

    getPhase(): AtomPhase { return this.atom.currentPhase; }
    getScore(): number { return this.atom.currentScore; }
    getAtom(): Atom { return this.atom; }

    saveState(): Record<string, any> { return this.atom.saveState(); }
    loadState(state: Record<string, any>): void { this.atom.loadState(state); }

    handleEvent(event: string, data: Record<string, any>, ctx: AtomContext): void {
        this.atom.handleEvent(event, data, ctx);
    }
}
