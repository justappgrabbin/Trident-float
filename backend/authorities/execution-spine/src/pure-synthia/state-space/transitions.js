// Pure Synthia Automata — the 16 named, typed, sound+color-carrying state transitions (spec §7)

// soundEffect/colorEffect are deterministic modifier objects consumed by
// transitionSound() (sounds.js) and transitionColor() (colors.js).
// Activation-dynamic edges (ignition…reactivation) ride o_transform; the rest
// ride their own operator from spec §4.
export const NAMED_TRANSITIONS = Object.freeze([
  { id:'ignition',     symbol:'→*', effect:'dormant → active (α: 0→σ(input))',        soundEffect:{ gliss:+1 },                       colorEffect:{ hueShift:+40 },                  operatorId:'o_transform' },
  { id:'flow',         symbol:'→',  effect:'active → active (α propagates w/ weight)', soundEffect:{ sustain:true },                    colorEffect:{ hueHold:true },                  operatorId:'o_transform' },
  { id:'weakening',    symbol:'⇢',  effect:'active → weakening (α decays by λ)',       soundEffect:{ diminuendo:-1, velocityScale:0.7 }, colorEffect:{ satShift:-10 },                 operatorId:'o_transform' },
  { id:'dormancy',     symbol:'⇝',  effect:'weakening → dormant (α<θ; topology kept)', soundEffect:{ rest:true, duration:0 },           colorEffect:{ satSet:20 },                     operatorId:'o_transform' },
  { id:'reactivation', symbol:'↬',  effect:'dormant → active via resonance',           soundEffect:{ recall:true, gliss:+1 },           colorEffect:{ satRestore:true },               operatorId:'o_transform' },
  { id:'fusion',       symbol:'⊕',  effect:'n states → bundle (o_bundle)',             soundEffect:{ chord:true },                      colorEffect:{ hueAverage:true },               operatorId:'o_bundle' },
  { id:'chain',        symbol:'▸',  effect:'ordered append (o_sequence)',              soundEffect:{ sequence:true },                   colorEffect:{ hueWalk:+5 },                    operatorId:'o_sequence' },
  { id:'mirror',       symbol:'≍',  effect:'o_reverse (Fu Xi reverse variation)',      soundEffect:{ retrograde:true },                 colorEffect:{ hueShift:+180 },                 operatorId:'o_reverse' },
  { id:'shadow',       symbol:'◐',  effect:'o_inverse (yin↔yang line inversion)',      soundEffect:{ pitchInversion:true },             colorEffect:{ valueInvert:true },              operatorId:'o_inverse' },
  { id:'rotation',     symbol:'⟳',  effect:'o_converse (180° wheel rotation)',         soundEffect:{ transpose:+6 },                    colorEffect:{ hueShift:+90 },                  operatorId:'o_converse' },
  { id:'core',         symbol:'⊙',  effect:'o_nuclear (nuclear trigram)',              soundEffect:{ innerVoices:true },                colorEffect:{ satShift:+15, lightShift:-15 },  operatorId:'o_nuclear' },
  { id:'becoming',     symbol:'⇒',  effect:'o_change (moving line → target state)',    soundEffect:{ cadence:'resolve' },               colorEffect:{ hueLerpTo:'target' },            operatorId:'o_change' },
  { id:'perspective',  symbol:'◇',  effect:'o_project T_{i→j} (dimension change)',     soundEffect:{ octaveShift:+1 },                  colorEffect:{ layerChange:true },              operatorId:'o_project' },
  { id:'recursion',    symbol:'↺',  effect:'o_recurse (output re-enters as operand)',  soundEffect:{ loop:true, decay:0.8 },            colorEffect:{ lightShift:-10, spiral:true },   operatorId:'o_recurse' },
  { id:'weave',        symbol:'⋈',  effect:'o_discourse (L5 units → L6)',              soundEffect:{ polyphony:true },                  colorEffect:{ gradientBlend:true },            operatorId:'o_discourse' },
  { id:'automatize',   symbol:'⚙',  effect:'o_automaton (state set → machine)',        soundEffect:{ rhythmicCycle:true },              colorEffect:{ frame:true },                    operatorId:'o_automaton' },
]);

const BY_ID = new Map(NAMED_TRANSITIONS.map((t) => [t.id, t]));

export function transitionById(id) {
  return BY_ID.get(id) || null;
}

