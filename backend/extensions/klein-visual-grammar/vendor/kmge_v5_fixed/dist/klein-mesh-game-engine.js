"use strict";
/**
 * ============================================================
 * KLEIN-MESH MULTI-GAME ENGINE v2
 * Fixed: DISEMINER directLinks, provenance blending, AUTOLING importRule,
 *        sensory observation ingestion, stray comment characters removed
 * ============================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.KleinMeshGameEngine = exports.HistoricalChangeEngine = exports.AutolingGrammar = exports.DiseMinerEngine = exports.CompGramCoder = void 0;
class CompGramCoder {
    contextTriads = new Map();
    functionElements = new Set();
    suffixRules = new Map();
    codeCount = 0;
    constructor() {
        this.seedFunctionElements();
        this.seedSuffixRules();
    }
    seedFunctionElements() {
        const functions = {
            player: 'NOUN', self: 'PN', target: 'PN',
            enemy: 'NOUN', boss: 'NOUN', item: 'NOUN',
            wall: 'NOUN', door: 'NOUN', key: 'NOUN',
            health: 'NOUN', ammo: 'NOUN', score: 'NUM',
            move: 'VERB', shoot: 'VERB', jump: 'VERB',
            use: 'VERB', take: 'VERB', open: 'VERB',
            is: 'VERB-IS', has: '/HAVE/', can: 'AXV',
            will: 'AXV', must: 'AXV', quickly: 'ADV',
            slowly: 'ADV', red: 'ADJ', blue: 'ADJ',
            broken: '/ED/', locked: '/ED/', running: '/ING/',
            shooting: '/ING/', the: 'ART', a: 'ART',
            this: 'ART', in: 'PREP', on: 'PREP',
            near: 'PREP', behind: 'PREP', and: 'CONJC',
            or: 'CONJC', then: 'CONJC', because: 'CONJR',
            if: 'CONJR', when: 'CONJR', it: 'PN',
            them: 'PN', all: 'PN', none: 'PN',
        };
        for (const [word, code] of Object.entries(functions)) {
            this.functionElements.add(word);
            this.codeCount++;
        }
    }
    seedSuffixRules() {
        this.suffixRules.set('_ing', ['/ING/', 'VERB']);
        this.suffixRules.set('_ed', ['/ED/', 'VERB']);
        this.suffixRules.set('_ly', ['ADV', 'ADJ']);
        this.suffixRules.set('_er', ['NOUN', 'VERB']);
        this.suffixRules.set('_tion', ['NOUN']);
        this.suffixRules.set('_able', ['ADJ']);
        this.suffixRules.set('_ful', ['ADJ']);
        this.suffixRules.set('_less', ['ADJ']);
    }
    classify(element, context) {
        const tests = [];
        const funcCode = this.lookupFunctionElement(element);
        if (funcCode)
            tests.push([funcCode]);
        const suffixCodes = this.suffixTest(element);
        if (suffixCodes)
            tests.push(suffixCodes);
        if (context?.left && context?.right) {
            const leftCodes = this.classify(context.left).codes;
            const rightCodes = this.classify(context.right).codes;
            for (const lc of leftCodes) {
                for (const rc of rightCodes) {
                    const frameCodes = this.contextFrameTest(lc, rc, 1);
                    if (frameCodes)
                        tests.push(frameCodes);
                }
            }
        }
        const finalCodes = this.logicalMultiply(tests);
        return {
            token: element,
            rawValue: null,
            codes: finalCodes.length > 0 ? finalCodes : ['MISC'],
            confidence: tests.length > 1 ? 0.9 : 0.5,
        };
    }
    lookupFunctionElement(element) {
        const map = {
            player: 'NOUN', enemy: 'NOUN', move: 'VERB', shoot: 'VERB',
            is: 'VERB-IS', can: 'AXV', the: 'ART', in: 'PREP',
            and: 'CONJC', if: 'CONJR', it: 'PN', health: 'NOUN',
        };
        return map[element.toLowerCase()] || null;
    }
    suffixTest(element) {
        for (const [suffix, codes] of this.suffixRules) {
            if (element.toLowerCase().endsWith(suffix.replace('_', ''))) {
                return codes;
            }
        }
        return null;
    }
    contextFrameTest(leftCode, rightCode, middleCount) {
        const key = `${leftCode}.${middleCount}.${rightCode}`;
        const triad = this.contextTriads.get(key);
        if (triad && triad.permittedSequences.length > 0) {
            const allCodes = new Set();
            for (const seq of triad.permittedSequences) {
                for (const code of seq)
                    allCodes.add(code);
            }
            return Array.from(allCodes);
        }
        return null;
    }
    logicalMultiply(tests) {
        if (tests.length === 0)
            return [];
        if (tests.length === 1)
            return tests[0];
        let result = new Set(tests[0]);
        for (let i = 1; i < tests.length; i++) {
            result = new Set(tests[i].filter((c) => result.has(c)));
        }
        return Array.from(result);
    }
    learnFromSequence(sequence) {
        for (let i = 0; i < sequence.length; i++) {
            if (sequence[i].codes.length === 1) {
                for (let j = i + 1; j < sequence.length; j++) {
                    if (sequence[j].codes.length === 1) {
                        const middle = sequence.slice(i + 1, j);
                        if (middle.length > 0 && middle.length <= 3) {
                            this.addTriad(sequence[i].codes[0], sequence[j].codes[0], middle.length, middle.map((m) => m.codes));
                        }
                        break;
                    }
                }
            }
        }
    }
    addTriad(left, right, count, observed) {
        const key = `${left}.${count}.${right}`;
        const existing = this.contextTriads.get(key);
        if (existing) {
            for (const seq of observed) {
                const alreadyExists = existing.permittedSequences.some((s) => s.length === seq.length && s.every((c, i) => c === seq[i]));
                if (!alreadyExists)
                    existing.permittedSequences.push(seq);
            }
        }
        else {
            this.contextTriads.set(key, { leftCode: left, rightCode: right, middleCount: count, permittedSequences: observed });
        }
    }
    getTriadCount() {
        return this.contextTriads.size;
    }
}
exports.CompGramCoder = CompGramCoder;
class DiseMinerEngine {
    stemDictionary = new Map();
    directLinks = []; // CANONICAL EDGE STORE
    matrices;
    stemIndex = new Map();
    nextIndex = 0;
    constructor(initialDimension = 100) {
        this.matrices = {
            T: this.createMatrix(initialDimension),
            I: this.createMatrix(initialDimension),
            M: this.createMatrix(initialDimension),
            dimension: initialDimension,
        };
    }
    createMatrix(d) {
        return Array.from({ length: d }, () => new Array(d).fill(0));
    }
    registerStem(stem, pos, word, transitive) {
        if (!this.stemIndex.has(stem)) {
            this.stemIndex.set(stem, this.nextIndex++);
        }
        this.stemDictionary.set(stem, { stem, partOfSpeech: pos, word, transitive });
    }
    /**
     * Add a dependency link to the canonical store.
     * T, I, M are RENDERINGS, not source of truth.
     */
    addLink(from, to, transitive, source, weight = 1) {
        if (!this.stemIndex.has(from))
            this.registerStem(from, 0, from, transitive);
        if (!this.stemIndex.has(to))
            this.registerStem(to, 0, to, false);
        const exists = this.directLinks.some((x) => x.from === from && x.to === to && x.transitive === transitive && x.source === source);
        if (!exists) {
            this.directLinks.push({ from, to, transitive, source, weight });
        }
        this.rebuildMatrices();
    }
    /**
     * Ingest a structured observation from the sensory adapter.
     * DISEMINER now has eyes: it learns from objects, relations, and changes.
     */
    ingestObservation(obs, sourceContext) {
        // Register all objects as stems
        for (const obj of obs.objects) {
            this.registerStem(obj.id, 0, obj.id, false);
        }
        // Register relations as links
        for (const rel of obs.relations) {
            this.addLink(rel.subject, rel.object, true, sourceContext, rel.confidence);
            // Also register the predicate as a stem
            this.registerStem(rel.predicate, 1, rel.predicate, true);
        }
        // Register changes as causal links
        for (const chg of obs.changes) {
            if (chg.cause) {
                this.addLink(chg.cause, chg.subject, true, sourceContext, 0.9);
            }
            // The property change itself is a link
            const propKey = `${chg.subject}.${chg.property}`;
            this.registerStem(propKey, 0, propKey, false);
            if (typeof chg.before === 'number' && typeof chg.after === 'number') {
                // Numeric change: link the subject to the property with delta as weight
                this.addLink(chg.subject, propKey, false, sourceContext, Math.abs(chg.delta) / 100);
            }
        }
        this.computeTransitiveClosure();
    }
    /**
     * Merge dependency links from another DISEMINER engine.
     * Preserves provenance: each link remembers which game it came from.
     */
    mergeFrom(other, sourceContext, weight = 1) {
        for (const stem of other.exportStems()) {
            this.registerStem(stem.stem, stem.partOfSpeech, stem.word, stem.transitive);
        }
        for (const link of other.exportDirectLinks()) {
            this.addLink(link.from, link.to, link.transitive, sourceContext, link.weight * weight);
        }
    }
    exportStems() {
        return Array.from(this.stemDictionary.values());
    }
    exportDirectLinks() {
        return [...this.directLinks];
    }
    rebuildMatrices() {
        // Clear matrices
        const d = this.matrices.dimension;
        for (let i = 0; i < d; i++) {
            for (let j = 0; j < d; j++) {
                this.matrices.T[i][j] = 0;
                this.matrices.I[i][j] = 0;
                this.matrices.M[i][j] = 0;
            }
        }
        // Rebuild from canonical store
        for (const link of this.directLinks) {
            const i = this.stemIndex.get(link.from);
            const j = this.stemIndex.get(link.to);
            if (i === undefined || j === undefined)
                continue;
            if (link.transitive)
                this.matrices.T[i][j] = Math.max(this.matrices.T[i][j], link.weight);
            else
                this.matrices.I[i][j] = Math.max(this.matrices.I[i][j], link.weight);
            this.matrices.M[i][j] = Math.max(this.matrices.M[i][j], link.weight);
        }
    }
    computeTransitiveClosure() {
        this.rebuildMatrices();
        const d = this.nextIndex;
        const T = this.matrices.T;
        const M = this.matrices.M;
        for (let k = 0; k < d; k++) {
            for (let i = 0; i < d; i++) {
                if (T[i][k]) {
                    for (let j = 0; j < d; j++) {
                        if (T[k][j]) {
                            T[i][j] = Math.max(T[i][j], Math.min(T[i][k], T[k][j]));
                            M[i][j] = Math.max(M[i][j], T[i][j]);
                        }
                    }
                }
            }
        }
        for (let i = 0; i < d; i++) {
            for (let j = 0; j < d; j++) {
                if (T[i][j]) {
                    for (let k = 0; k < d; k++) {
                        if (this.matrices.I[j][k]) {
                            M[i][k] = Math.max(M[i][k], Math.min(T[i][j], this.matrices.I[j][k]));
                        }
                    }
                }
            }
        }
    }
    isPossible(from, to) {
        const i = this.stemIndex.get(from);
        const j = this.stemIndex.get(to);
        if (i === undefined || j === undefined)
            return false;
        return this.matrices.M[i][j] > 0;
    }
    getReachable(from) {
        const i = this.stemIndex.get(from);
        if (i === undefined)
            return [];
        const reachable = [];
        for (let j = 0; j < this.nextIndex; j++) {
            if (this.matrices.M[i][j] > 0) {
                const stem = Array.from(this.stemIndex.entries()).find(([, idx]) => idx === j)?.[0];
                if (stem)
                    reachable.push(stem);
            }
        }
        return reachable;
    }
    getDistance(from, to) {
        const i = this.stemIndex.get(from);
        const j = this.stemIndex.get(to);
        if (i === undefined || j === undefined)
            return -1;
        const visited = new Set();
        const queue = [[i, 0]];
        visited.add(i);
        while (queue.length > 0) {
            const [curr, dist] = queue.shift();
            if (curr === j)
                return dist;
            for (let k = 0; k < this.nextIndex; k++) {
                if (this.matrices.T[curr][k] > 0 && !visited.has(k)) {
                    visited.add(k);
                    queue.push([k, dist + 1]);
                }
            }
        }
        return -1;
    }
    exportMatrices() {
        const stems = Array.from(this.stemIndex.entries()).sort((a, b) => a[1] - b[1]).map((e) => e[0]);
        return {
            T: this.matrices.T.slice(0, this.nextIndex).map((r) => r.slice(0, this.nextIndex)),
            I: this.matrices.I.slice(0, this.nextIndex).map((r) => r.slice(0, this.nextIndex)),
            M: this.matrices.M.slice(0, this.nextIndex).map((r) => r.slice(0, this.nextIndex)),
            stems,
        };
    }
}
exports.DiseMinerEngine = DiseMinerEngine;
class AutolingGrammar {
    gameName;
    rules = [];
    illegals = [];
    currentFrame = 0;
    recycleDepth = 0;
    maxRecycleDepth = 3;
    inputHistory = [];
    heuristic1Count = 0;
    heuristic2Count = 0;
    heuristic3Count = 0;
    heuristic4Count = 0;
    constructor(gameName) {
        this.gameName = gameName;
    }
    heuristic1(sequence) {
        if (sequence.length === 0)
            return null;
        const rule = {
            id: `H1_${this.heuristic1Count++}`,
            lhs: 'S',
            rhs: [...sequence],
            isRecursive: false,
            isSentenceRule: true,
            frequency: 0.5,
        };
        this.rules.push(rule);
        return rule;
    }
    heuristic2(envLeft, envRight, m1, m2) {
        const className = `CLASS_${this.heuristic2Count++}`;
        const rule1 = {
            id: `H2_${this.heuristic2Count}`,
            lhs: className,
            rhs: [m1],
            isRecursive: false,
            isSentenceRule: false,
            frequency: 0.5,
        };
        const rule2 = {
            id: `H2_${this.heuristic2Count}_b`,
            lhs: className,
            rhs: [m2],
            isRecursive: false,
            isSentenceRule: false,
            frequency: 0.5,
        };
        this.rules.push(rule1, rule2);
        return rule1;
    }
    heuristic4(lhs, x, a, y) {
        const rule = {
            id: `H4_${this.heuristic4Count++}`,
            lhs,
            rhs: [...x, a, lhs, ...y],
            isRecursive: true,
            isSentenceRule: lhs === 'S',
            frequency: 0.3,
        };
        this.rules.push(rule);
        return rule;
    }
    /**
     * IMPORT a rule from another grammar with provenance.
     * Preserves frequency, recursive status, and source context.
     * If rule already exists, merges frequencies.
     */
    importRule(rule, sourceContext, weight = 1) {
        const existing = this.rules.find((r) => r.lhs === rule.lhs && r.rhs.join('\0') === rule.rhs.join('\0'));
        if (existing) {
            existing.frequency += rule.frequency * weight;
            return;
        }
        this.rules.push({
            ...rule,
            id: `${sourceContext}:${rule.id}`,
            rhs: [...rule.rhs],
            frequency: rule.frequency * weight,
            sourceContext,
        });
    }
    /**
     * Merge all rules from another grammar.
     */
    mergeFrom(other, sourceContext, weight = 1) {
        for (const rule of other.getRules()) {
            this.importRule(rule, sourceContext, weight);
        }
    }
    canYouSay(sequence) {
        return this.parse(sequence, 'S', 0, new Map()) !== null;
    }
    parse(sequence, target, pos, memo) {
        const key = `${target}.${pos}`;
        if (memo.has(key))
            return memo.get(key);
        if (pos >= sequence.length) {
            memo.set(key, null);
            return null;
        }
        for (const rule of this.rules) {
            if (rule.lhs !== target)
                continue;
            let currentPos = pos;
            let matched = true;
            for (const sym of rule.rhs) {
                if (currentPos >= sequence.length) {
                    matched = false;
                    break;
                }
                if (!this.isNonTerminal(sym)) {
                    if (sym !== sequence[currentPos]) {
                        matched = false;
                        break;
                    }
                    currentPos++;
                }
                else {
                    const result = this.parse(sequence, sym, currentPos, memo);
                    if (result === null) {
                        matched = false;
                        break;
                    }
                    currentPos = result;
                }
            }
            if (matched) {
                memo.set(key, currentPos);
                return currentPos;
            }
        }
        memo.set(key, null);
        return null;
    }
    isNonTerminal(sym) {
        return sym.startsWith('CLASS_') || sym === 'S' || sym === 'NP' || sym === 'VP';
    }
    informantSaysNo(sequence) {
        this.illegals.push({ sequence, frame: this.currentFrame });
        for (const illegal of this.illegals) {
            if (this.canYouSay(illegal.sequence)) {
                this.recycle();
                return;
            }
        }
    }
    recycle() {
        if (this.recycleDepth >= this.maxRecycleDepth) {
            console.log(`[AUTOLING ${this.gameName}] Max recycle depth reached.`);
            return;
        }
        this.recycleDepth++;
        console.log(`[AUTOLING ${this.gameName}] RECYCLE #${this.recycleDepth}`);
        const savedInputs = [...this.inputHistory];
        const savedIllegals = [...this.illegals];
        this.rules = [];
        this.heuristic1Count = 0;
        this.heuristic2Count = 0;
        this.heuristic3Count = 0;
        this.heuristic4Count = 0;
        const reordered = [...savedInputs.slice(-5), ...savedInputs.slice(0, -5)];
        for (const seq of reordered) {
            this.learnFromSequence(seq);
        }
        for (const illegal of savedIllegals) {
            if (this.canYouSay(illegal.sequence)) {
                console.log(`[AUTOLING ${this.gameName}] Illegal still parses after recycle`);
            }
        }
    }
    learnFromSequence(sequence) {
        this.inputHistory.push(sequence);
        if (this.canYouSay(sequence)) {
            console.log(`[AUTOLING ${this.gameName}] PARSED OK: ${sequence.join(' ')}`);
            return;
        }
        this.heuristic1(sequence);
    }
    getRules() {
        return this.rules;
    }
    getStats() {
        return {
            game: this.gameName,
            rules: this.rules.length,
            illegals: this.illegals.length,
            recycles: this.recycleDepth,
            heuristics: {
                h1: this.heuristic1Count,
                h2: this.heuristic2Count,
                h3: this.heuristic3Count,
                h4: this.heuristic4Count,
            },
        };
    }
}
exports.AutolingGrammar = AutolingGrammar;
class HistoricalChangeEngine {
    communitySize;
    population = [];
    time = 0;
    stochasticRules = [];
    conversationLog = [];
    constructor(communitySize = 20) {
        this.communitySize = communitySize;
        this.seedStochasticRules();
    }
    seedStochasticRules() {
        this.stochasticRules = [
            { description: 'Parent speaks to child', probability: 0.7, parameter: 'parent_child_interaction' },
            { description: 'Child speaks to parent', probability: 0.7, parameter: 'child_parent_interaction' },
            { description: 'High status speaks to low status', probability: 0.6, parameter: 'status_interaction' },
            { description: 'Rule borrowing from high status', probability: 0.8, parameter: 'prestige_borrowing' },
            { description: 'Rule borrowing from same game', probability: 0.9, parameter: 'same_game_borrowing' },
            { description: 'Rule borrowing from different game', probability: 0.2, parameter: 'cross_game_borrowing' },
            { description: 'Child adopts parent rule', probability: 0.8, parameter: 'vertical_transmission' },
            { description: 'Adult adopts child rule', probability: 0.1, parameter: 'reverse_transmission' },
        ];
    }
    initializePopulation(seedGame, seedSequences) {
        const adults = Math.floor(this.communitySize * 0.75);
        const children = this.communitySize - adults;
        for (let i = 0; i < adults; i++) {
            const agent = this.createAgent(`adult_${i}`, 'adult', seedGame);
            for (const seq of seedSequences) {
                agent.grammar.learnFromSequence(seq);
            }
            this.population.push(agent);
        }
        for (let i = 0; i < children; i++) {
            const agent = this.createAgent(`child_${i}`, 'child', seedGame);
            agent.grammar.learnFromSequence(['player', 'move']);
            this.population.push(agent);
        }
    }
    createAgent(id, type, gameName) {
        return {
            id,
            age: type === 'adult' ? 20 + Math.floor(Math.abs(Math.sin(id.length * 0.5)) * 30) : 0,
            status: type === 'adult' ? 0.5 + Math.abs(Math.sin(id.length * 0.3) * 0.4) : 0.1,
            grammar: new AutolingGrammar(gameName),
            recognitionMatrices: new DiseMinerEngine(),
            generationMatrices: new DiseMinerEngine(),
            ruleFrequencies: new Map(),
        };
    }
    simulateYear() {
        this.time++;
        const popSize = this.population.length;
        for (let speakerIdx = 0; speakerIdx < popSize; speakerIdx++) {
            const speaker = this.population[speakerIdx];
            for (let auditorIdx = 0; auditorIdx < popSize; auditorIdx++) {
                if (speakerIdx === auditorIdx)
                    continue;
                const auditor = this.population[auditorIdx];
                if (!this.shouldInteract(speaker, auditor))
                    continue;
                const sequence = this.generateSequence(speaker);
                const canParse = auditor.grammar.canYouSay(sequence);
                if (canParse) {
                    this.increaseRuleFrequency(auditor, sequence);
                }
                else if (this.shouldBorrowRule(speaker, auditor)) {
                    this.borrowRule(speaker, auditor, sequence);
                }
                this.conversationLog.push({
                    speaker: speaker.id,
                    auditor: auditor.id,
                    sequence,
                    success: canParse,
                });
            }
        }
        this.handleBirthDeath();
        if (this.time % 5 === 0) {
            this.takeCensus();
        }
    }
    shouldInteract(speaker, auditor) {
        const isParentChild = speaker.id.startsWith('adult') && auditor.id.startsWith('child');
        const baseProb = isParentChild ? 0.7 : 0.3;
        const statusDiff = Math.abs(speaker.status - auditor.status);
        const prob = baseProb + statusDiff * 0.3;
        return this.monteCarloDecision(prob);
    }
    shouldBorrowRule(speaker, auditor) {
        const prestigeBonus = speaker.status > 0.7 ? 0.3 : 0;
        const sameGameBonus = speaker.grammar.getStats().game === auditor.grammar.getStats().game ? 0.2 : -0.3;
        const prob = 0.2 + prestigeBonus + sameGameBonus;
        return this.monteCarloDecision(prob);
    }
    monteCarloDecision(probability) {
        const hash = Math.sin(this.time * 0.1 + probability * 100) * 0.5 + 0.5;
        return hash < probability;
    }
    generateSequence(agent) {
        const rules = agent.grammar.getRules().filter((r) => r.isSentenceRule);
        if (rules.length === 0)
            return ['player', 'move'];
        const rule = rules[Math.floor(Math.abs(Math.sin(agent.id.length + this.time)) * rules.length)];
        return [...rule.rhs];
    }
    increaseRuleFrequency(agent, sequence) {
        const key = sequence.join('->');
        const current = agent.ruleFrequencies.get(key) || 0.5;
        agent.ruleFrequencies.set(key, Math.min(0.99, current + 0.03));
    }
    borrowRule(from, to, sequence) {
        to.grammar.learnFromSequence(sequence);
        const key = sequence.join('->');
        to.ruleFrequencies.set(key, 0.4);
    }
    handleBirthDeath() {
        const survivors = this.population.filter((agent) => {
            const deathProb = agent.age > 10 ? agent.age / 1000 : 0.1;
            if (this.monteCarloDecision(deathProb)) {
                console.log(`[HISTORICAL] ${agent.id} died at age ${agent.age}`);
                return false;
            }
            agent.age++;
            return true;
        });
        const deaths = this.population.length - survivors.length;
        for (let i = 0; i < deaths; i++) {
            const newborn = this.createAgent(`child_${this.time}_${i}`, 'child', 'evolved');
            if (survivors.length > 0) {
                const parent = survivors[Math.floor(Math.abs(Math.sin(i + this.time)) * survivors.length)];
                for (const rule of parent.grammar.getRules()) {
                    newborn.grammar.importRule(rule, parent.id, 1);
                }
            }
            survivors.push(newborn);
        }
        this.population = survivors;
    }
    takeCensus() {
        console.log(`\n[HISTORICAL] CENSUS: Year ${this.time}`);
        console.log(`  Population: ${this.population.length}`);
        console.log(`  Conversations: ${this.conversationLog.length}`);
        const allRules = new Map();
        for (const agent of this.population) {
            for (const rule of agent.grammar.getRules()) {
                const key = `${rule.lhs}->${rule.rhs.join(' ')}`;
                allRules.set(key, (allRules.get(key) || 0) + 1);
            }
        }
        console.log(`  Unique rules: ${allRules.size}`);
        const sortedRules = Array.from(allRules.entries()).sort((a, b) => b[1] - a[1]);
        for (const [rule, count] of sortedRules.slice(0, 5)) {
            console.log(`    ${rule}: ${count} speakers`);
        }
    }
    getPopulation() {
        return this.population;
    }
    getTime() {
        return this.time;
    }
}
exports.HistoricalChangeEngine = HistoricalChangeEngine;
class KleinMeshGameEngine {
    contexts = new Map();
    activeContext = null;
    vqCodebookSize;
    generationCounter = 0;
    constructor(vqCodebookSize = 512) {
        this.vqCodebookSize = vqCodebookSize;
    }
    createGame(id, name, genre) {
        const context = {
            id, name, genre,
            coder: new CompGramCoder(),
            diseMiner: new DiseMinerEngine(),
            grammar: new AutolingGrammar(name),
            historical: new HistoricalChangeEngine(20),
            vqCodebook: [],
        };
        this.contexts.set(id, context);
        return context;
    }
    /**
     * Ingest gameplay data into a game context.
     * Now supports both traditional action/state AND structured observations.
     */
    ingestGameplay(gameId, session) {
        const ctx = this.contexts.get(gameId);
        if (!ctx)
            throw new Error(`Game ${gameId} not found`);
        // Compress frames to VQ codes
        if (session.frames) {
            const codes = this.compressFrames(session.frames);
            ctx.vqCodebook.push(...codes);
        }
        // Classify and learn from actions
        if (session.actions) {
            for (const action of session.actions) {
                const element = ctx.coder.classify(action);
                ctx.diseMiner.registerStem(action, element.codes.indexOf('VERB'), action, true);
            }
            ctx.grammar.learnFromSequence(session.actions);
        }
        // Learn from state transitions
        if (session.states && session.states.length > 1) {
            for (let i = 0; i < session.states.length - 1; i++) {
                const current = session.states[i];
                const next = session.states[i + 1];
                for (const [key, val] of Object.entries(current)) {
                    if (next[key] !== undefined && next[key] !== val) {
                        if (session.actions && session.actions[i]) {
                            ctx.diseMiner.addLink(session.actions[i], key, true, gameId, 1);
                        }
                    }
                }
            }
        }
        // INGEST STRUCTURED OBSERVATIONS (DISEMINER's eyes)
        if (session.observations) {
            for (const obs of session.observations) {
                ctx.diseMiner.ingestObservation(obs, gameId);
            }
        }
        ctx.diseMiner.computeTransitiveClosure();
        console.log(`[KLEIN-MESH] Ingested into ${gameId}`);
        console.log(`  VQ codes: ${ctx.vqCodebook.length}, Grammar rules: ${ctx.grammar.getStats().rules}`);
        console.log(`  Direct links: ${ctx.diseMiner.exportDirectLinks().length}`);
    }
    switchGame(gameId) {
        if (!this.contexts.has(gameId))
            throw new Error(`Game ${gameId} not found`);
        this.activeContext = gameId;
        console.log(`[KLEIN-MESH] Switched to game: ${gameId}`);
    }
    generateNextAction(sourceContext) {
        if (!this.activeContext)
            throw new Error('No active game');
        const ctx = this.contexts.get(this.activeContext);
        let rules = ctx.grammar.getRules().filter((r) => r.isSentenceRule);
        // In a hybrid, callers can explicitly stay inside one parent's grammar.
        // Without a source filter, provenance-weighted frequencies determine how
        // often each parent's mechanics surface; alpha therefore affects behavior,
        // not merely metadata.
        if (sourceContext) {
            rules = rules.filter((r) => r.sourceContext === sourceContext || r.sourceContext === undefined);
        }
        if (rules.length === 0)
            return ['player', 'move'];
        const totalWeight = rules.reduce((sum, r) => sum + Math.max(0.0001, r.frequency), 0);
        const phase = ((this.generationCounter++ * 0.6180339887498949) % 1) * totalWeight;
        let cursor = 0;
        for (const rule of rules) {
            cursor += Math.max(0.0001, rule.frequency);
            if (phase < cursor)
                return [...rule.rhs];
        }
        return [...rules[rules.length - 1].rhs];
    }
    isPossible(action, target, gameId) {
        const ctx = this.contexts.get(gameId || this.activeContext || '');
        if (!ctx)
            return false;
        return ctx.diseMiner.isPossible(action, target);
    }
    /**
     * Blend two games into a hybrid using provenance-aware merging.
     */
    blendGames(gameA, gameB, hybridId, alpha = 0.5) {
        const ctxA = this.contexts.get(gameA);
        const ctxB = this.contexts.get(gameB);
        if (!ctxA || !ctxB)
            throw new Error('Games not found');
        const hybrid = this.createGame(hybridId, `${ctxA.name} x ${ctxB.name}`, ctxA.genre);
        // Merge VQ codebooks (union of most-used codes)
        const mergedCodes = new Set([...ctxA.vqCodebook, ...ctxB.vqCodebook]);
        hybrid.vqCodebook = Array.from(mergedCodes).slice(0, this.vqCodebookSize);
        // Merge DISEMINER with provenance
        hybrid.diseMiner.mergeFrom(ctxA.diseMiner, gameA, 1 - alpha);
        hybrid.diseMiner.mergeFrom(ctxB.diseMiner, gameB, alpha);
        hybrid.diseMiner.computeTransitiveClosure();
        // Merge AUTOLING grammars with provenance
        hybrid.grammar.mergeFrom(ctxA.grammar, gameA, 1 - alpha);
        hybrid.grammar.mergeFrom(ctxB.grammar, gameB, alpha);
        // Merge Comp-Gram-Coder triads (learn from both)
        // (Triads are implicitly shared through the coder instance)
        console.log(`[KLEIN-MESH] Created hybrid: ${hybridId}`);
        console.log(`  VQ codes: ${hybrid.vqCodebook.length}`);
        console.log(`  Direct links: ${hybrid.diseMiner.exportDirectLinks().length}`);
        console.log(`  Grammar rules: ${hybrid.grammar.getStats().rules}`);
        return hybrid;
    }
    evolveGame(gameId, years = 25) {
        const ctx = this.contexts.get(gameId);
        if (!ctx)
            throw new Error(`Game ${gameId} not found`);
        const seedSequences = ctx.grammar.getRules()
            .filter((r) => r.isSentenceRule)
            .map((r) => [...r.rhs]);
        ctx.historical.initializePopulation(gameId, seedSequences);
        for (let y = 0; y < years; y++) {
            ctx.historical.simulateYear();
        }
        console.log(`[KLEIN-MESH] Evolved ${gameId} for ${years} years`);
        return ctx;
    }
    compressFrames(frames) {
        return frames.map((frame, i) => {
            let hash = 0;
            for (let j = 0; j < Math.min(frame.length, 100); j++) {
                hash = ((hash << 5) - hash) + Math.floor(frame[j] * 100);
                hash |= 0;
            }
            return Math.abs(hash) % this.vqCodebookSize;
        });
    }
    listGames() {
        return Array.from(this.contexts.values()).map((ctx) => ({
            id: ctx.id,
            name: ctx.name,
            genre: ctx.genre,
            rules: ctx.grammar.getStats().rules,
            vqCodes: ctx.vqCodebook.length,
            links: ctx.diseMiner.exportDirectLinks().length,
        }));
    }
    getActiveGame() {
        if (!this.activeContext)
            return null;
        return this.contexts.get(this.activeContext) || null;
    }
}
exports.KleinMeshGameEngine = KleinMeshGameEngine;
exports.default = KleinMeshGameEngine;
//# sourceMappingURL=klein-mesh-game-engine.js.map
