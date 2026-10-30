// Pure Synthia Automata — L0 distinctive features and L1 phoneme bundles (spec §8, App. A)

// Sub-letter distinctive features. Feature ids encode axis[:value]:
//   f.voice / f.voiceless   → [±voice]
//   f.place.<p>             → place ∈ {lab, alv, vel, dent, pal, glot}
//   f.manner.<m>            → manner ∈ {stop, fricative, nasal, liquid, glide, vowel}
//   f.high f.low f.front f.back f.round f.tense f.diphthong → binary vowel/diphthong marks
export const FEATURES = Object.freeze([
  { id:'f.voice',     contrast:'[±voice]', axis:'voice',  value:'+' },
  { id:'f.voiceless', contrast:'[±voice]', axis:'voice',  value:'-' },
  { id:'f.place.lab',  contrast:'place=labial',   axis:'place', value:'lab' },
  { id:'f.place.alv',  contrast:'place=alveolar', axis:'place', value:'alv' },
  { id:'f.place.vel',  contrast:'place=velar',    axis:'place', value:'vel' },
  { id:'f.place.dent', contrast:'place=dental',   axis:'place', value:'dent' },
  { id:'f.place.pal',  contrast:'place=palatal',  axis:'place', value:'pal' },
  { id:'f.place.glot', contrast:'place=glottal',  axis:'place', value:'glot' },
  { id:'f.manner.stop',      contrast:'manner=stop',      axis:'manner', value:'stop' },
  { id:'f.manner.fricative', contrast:'manner=fricative', axis:'manner', value:'fricative' },
  { id:'f.manner.nasal',     contrast:'manner=nasal',     axis:'manner', value:'nasal' },
  { id:'f.manner.liquid',    contrast:'manner=liquid',    axis:'manner', value:'liquid' },
  { id:'f.manner.glide',     contrast:'manner=glide',     axis:'manner', value:'glide' },
  { id:'f.manner.vowel',     contrast:'manner=vowel',     axis:'manner', value:'vowel' },
  { id:'f.high',      contrast:'[±high]',   axis:'high',   value:'+' },
  { id:'f.low',       contrast:'[±low]',    axis:'low',    value:'+' },
  { id:'f.front',     contrast:'[±front]',  axis:'front',  value:'+' },
  { id:'f.back',      contrast:'[±back]',   axis:'back',   value:'+' },
  { id:'f.round',     contrast:'[±round]',  axis:'round',  value:'+' },
  { id:'f.tense',     contrast:'[±tense]',  axis:'tense',  value:'+' },
  { id:'f.diphthong', contrast:'[±diphthong]', axis:'diphthong', value:'+' },
]);

const FEATURE_SIG = new Map(FEATURES.map((f) => [f.id, `${f.axis}:${f.value}`]));

const V = ['f.manner.vowel']; // every vowel/diphthong bundle starts here

// Phonemes as feature bundles (o_bundle of L0 features). 24 consonants + 12 vowels + 5 diphthongs.
// Diphthong ids are ASCII-folded (p.ai, p.ei, …) with the true IPA kept in `ipa`.
export const PHONEMES = Object.freeze([
  // --- consonants (24) ---
  { id:'p.p',  ipa:'p',  bundle:['f.place.lab',  'f.manner.stop', 'f.voiceless'], scale:'phoneme' },
  { id:'p.b',  ipa:'b',  bundle:['f.place.lab',  'f.manner.stop', 'f.voice'],     scale:'phoneme' },
  { id:'p.t',  ipa:'t',  bundle:['f.place.alv',  'f.manner.stop', 'f.voiceless'], scale:'phoneme' },
  { id:'p.d',  ipa:'d',  bundle:['f.place.alv',  'f.manner.stop', 'f.voice'],     scale:'phoneme' },
  { id:'p.k',  ipa:'k',  bundle:['f.place.vel',  'f.manner.stop', 'f.voiceless'], scale:'phoneme' },
  { id:'p.g',  ipa:'g',  bundle:['f.place.vel',  'f.manner.stop', 'f.voice'],     scale:'phoneme' },
  { id:'p.f',  ipa:'f',  bundle:['f.place.lab',  'f.manner.fricative', 'f.voiceless'], scale:'phoneme' },
  { id:'p.v',  ipa:'v',  bundle:['f.place.lab',  'f.manner.fricative', 'f.voice'],     scale:'phoneme' },
  { id:'p.s',  ipa:'s',  bundle:['f.place.alv',  'f.manner.fricative', 'f.voiceless'], scale:'phoneme' },
  { id:'p.z',  ipa:'z',  bundle:['f.place.alv',  'f.manner.fricative', 'f.voice'],     scale:'phoneme' },
  { id:'p.m',  ipa:'m',  bundle:['f.place.lab',  'f.manner.nasal', 'f.voice'], scale:'phoneme' },
  { id:'p.n',  ipa:'n',  bundle:['f.place.alv',  'f.manner.nasal', 'f.voice'], scale:'phoneme' },
  { id:'p.ng', ipa:'ŋ',  bundle:['f.place.vel',  'f.manner.nasal', 'f.voice'], scale:'phoneme' },
  { id:'p.l',  ipa:'l',  bundle:['f.place.alv',  'f.manner.liquid', 'f.voice'], scale:'phoneme' },
  { id:'p.r',  ipa:'r',  bundle:['f.place.alv',  'f.manner.liquid', 'f.voice'], scale:'phoneme' },
  { id:'p.w',  ipa:'w',  bundle:['f.place.lab',  'f.manner.glide', 'f.voice'], scale:'phoneme' },
  { id:'p.j',  ipa:'j',  bundle:['f.place.pal',  'f.manner.glide', 'f.voice'], scale:'phoneme' },
  { id:'p.sh', ipa:'ʃ',  bundle:['f.place.pal',  'f.manner.fricative', 'f.voiceless'], scale:'phoneme' },
  { id:'p.zh', ipa:'ʒ',  bundle:['f.place.pal',  'f.manner.fricative', 'f.voice'],     scale:'phoneme' },
  { id:'p.ch', ipa:'tʃ', bundle:['f.place.pal',  'f.manner.stop', 'f.manner.fricative', 'f.voiceless'], scale:'phoneme' },
  { id:'p.dzh',ipa:'dʒ', bundle:['f.place.pal',  'f.manner.stop', 'f.manner.fricative', 'f.voice'],     scale:'phoneme' },
  { id:'p.th', ipa:'θ',  bundle:['f.place.dent', 'f.manner.fricative', 'f.voiceless'], scale:'phoneme' },
  { id:'p.dh', ipa:'ð',  bundle:['f.place.dent', 'f.manner.fricative', 'f.voice'],     scale:'phoneme' },
  { id:'p.h',  ipa:'h',  bundle:['f.place.glot', 'f.manner.fricative', 'f.voiceless'], scale:'phoneme' },
  // --- vowels (12) ---
  { id:'p.i',   ipa:'i',  bundle:[...V, 'f.high', 'f.front', 'f.tense'],          scale:'phoneme' },
  { id:'p.ih',  ipa:'ɪ',  bundle:[...V, 'f.high', 'f.front'],                     scale:'phoneme' },
  { id:'p.e',   ipa:'e',  bundle:[...V, 'f.front', 'f.tense'],                    scale:'phoneme' },
  { id:'p.eh',  ipa:'ɛ',  bundle:[...V, 'f.front'],                               scale:'phoneme' },
  { id:'p.ae',  ipa:'æ',  bundle:[...V, 'f.low', 'f.front'],                      scale:'phoneme' },
  { id:'p.schwa', ipa:'ə', bundle:[...V],                                         scale:'phoneme' },
  { id:'p.uh',  ipa:'ʌ',  bundle:[...V, 'f.back'],                                scale:'phoneme' },
  { id:'p.ah',  ipa:'ɑ',  bundle:[...V, 'f.low', 'f.back'],                       scale:'phoneme' },
  { id:'p.aw',  ipa:'ɔ',  bundle:[...V, 'f.back', 'f.round'],                     scale:'phoneme' },
  { id:'p.o',   ipa:'o',  bundle:[...V, 'f.back', 'f.round', 'f.tense'],          scale:'phoneme' },
  { id:'p.ooh', ipa:'ʊ',  bundle:[...V, 'f.high', 'f.back', 'f.round'],           scale:'phoneme' },
  { id:'p.u',   ipa:'u',  bundle:[...V, 'f.high', 'f.back', 'f.round', 'f.tense'],scale:'phoneme' },
  // --- diphthongs (5) ---
  { id:'p.ai', ipa:'aɪ', bundle:[...V, 'f.diphthong', 'f.low', 'f.high', 'f.front'],          scale:'phoneme' },
  { id:'p.au', ipa:'aʊ', bundle:[...V, 'f.diphthong', 'f.low', 'f.high', 'f.back', 'f.round'],scale:'phoneme' },
  { id:'p.oi', ipa:'ɔɪ', bundle:[...V, 'f.diphthong', 'f.back', 'f.round', 'f.high', 'f.front'], scale:'phoneme' },
  { id:'p.ei', ipa:'eɪ', bundle:[...V, 'f.diphthong', 'f.front', 'f.tense', 'f.high'],        scale:'phoneme' },
  { id:'p.ou', ipa:'oʊ', bundle:[...V, 'f.diphthong', 'f.back', 'f.round', 'f.tense', 'f.high'], scale:'phoneme' },
]);

export const PHONEME_BY_ID = new Map(PHONEMES.map((p) => [p.id, p]));

// canonical "axis:value|axis:value|…" string for a feature bundle (sorted, deduped).
// Unknown ids fall back to their raw id so signatures remain total and deterministic.
export function bundleSignature(featureIds) {
  const parts = [...new Set(featureIds)].map((id) => FEATURE_SIG.get(id) || id);
  return parts.sort().join('|');
}

