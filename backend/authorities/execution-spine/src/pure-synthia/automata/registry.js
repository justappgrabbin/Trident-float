// Pure Synthia Automata — tool registry: 16 automaton classes, alias resolution, factory

import { TOOL_ALIASES } from '../state-space/lexicon.js';

import * as tool01 from './tools/tool-01-autoling-lite.js';
import * as tool02 from './tools/tool-02-diseminer-lite.js';
import * as tool03 from './tools/tool-03-klein-analogy.js';
import * as tool04 from './tools/tool-04-iching-grammar.js';
import * as tool05 from './tools/tool-05-language-contact.js';
import * as tool06 from './tools/tool-06-historical-monte-carlo.js';
import * as tool07 from './tools/tool-07-autonovel.js';
import * as tool08 from './tools/tool-08-messy.js';
import * as tool09 from './tools/tool-09-success.js';
import * as tool10 from './tools/tool-10-conversation.js';
import * as tool11 from './tools/tool-11-browser-form.js';
import * as tool12 from './tools/tool-12-research-browser.js';
import * as tool13 from './tools/tool-13-computational-grammar-coder.js';
import * as tool14 from './tools/tool-14-autoling.js';
import * as tool15 from './tools/tool-15-diseminer.js';
import * as tool16 from './tools/tool-16-morph-mir.js';

// Pick the exported class whose static descriptor carries the expected id.
// (Class names and the static field name — `registry` or `descriptor` — are up to
// each tool file; the descriptor contents are the contract.)
function pickClass(moduleNamespace, id) {
  for (const value of Object.values(moduleNamespace)) {
    const d = typeof value === 'function' ? (value.registry || value.descriptor) : null;
    if (d && d.id === id) return value;
  }
  throw new Error(`tool module for '${id}' does not export a class with static registry/descriptor id='${id}'`);
}

const TOOL_CLASSES = [
  ['autoling-lite', tool01],
  ['diseminer-lite', tool02],
  ['klein-analogy', tool03],
  ['iching-grammar', tool04],
  ['language-contact', tool05],
  ['historical-monte-carlo', tool06],
  ['autonovel', tool07],
  ['messy', tool08],
  ['success', tool09],
  ['conversation', tool10],
  ['browser-form', tool11],
  ['research-browser', tool12],
  ['computational-grammar-coder', tool13],
  ['autoling', tool14],
  ['diseminer', tool15],
  ['morph-mir', tool16],
].map(([id, ns]) => pickClass(ns, id));

export const TOOL_REGISTRY = Object.freeze(TOOL_CLASSES.map((cls) => {
  const d = cls.registry || cls.descriptor;
  return Object.freeze({
    id: d.id,
    aliases: Object.freeze([...(d.aliases || [])]),
    className: cls.name,
    gate: d.gate,
    channels: Object.freeze([...(d.channels || [])]),
    capabilities: Object.freeze([...(d.capabilities || [])]),
    ports: d.ports,
    automatonForm: d.automatonForm,
    dimension: d.dimension,
    description: d.description,
  });
}));

export function resolveTool(nameOrAlias) {
  const query = String(nameOrAlias || '').toLowerCase();
  if (!query) return null;
  const canonical = (TOOL_ALIASES && TOOL_ALIASES[query]) || query;
  return TOOL_REGISTRY.find((entry) => entry.id === canonical
    || entry.id === query
    || entry.aliases.includes(query)
    || entry.aliases.includes(canonical)) || null;
}

export function createAllTools() {
  return TOOL_CLASSES.map((cls) => new cls());
}

