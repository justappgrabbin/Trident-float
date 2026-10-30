// Pure Synthia Automata — recursive-descent parser for the tool-call grammar (spec §10)

/**
 * Recursive-descent parser over tokens from ./tokens.js, implementing GRAMMAR
 * (./grammar.js). Tokens are L1 states, lexemes L2/L3, and the returned parse
 * tree is an L4/L5 composite (chained calls form L6 discourse).
 *
 * Exports (contract src/grammar/parser.js):
 *   parseChain(input)  -> { calls: [ParsedCall], chainLength }
 *   ParseError         -> Error subclass carrying { position, expected }
 *   posTagWords(words) -> [{ word, pos }] via lexicon.posGuess
 *
 * ParsedCall = {
 *   tool:     canonical tool id (resolved through lexicon.TOOL_ALIASES),
 *   args:     [string|number],       // strings, bare-word groups, numbers
 *   address:  null | { gate, line?, color?, tone?, base? },
 *   flags:    { name: true|string|number },
 *   raw:      exact source substring of this call,
 *   ast:      { node: 'call', children: [...] },
 * }
 */

import { TOOL_IDS, TOOL_ALIASES, KEYWORDS, posGuess } from '../state-space/lexicon.js';
import { tokenize } from './tokens.js';

const CHAIN_KEYWORD = (KEYWORDS.chain && KEYWORDS.chain[0]) || 'then';
const ADDRESS_MARKER = (KEYWORDS.addressMarker && KEYWORDS.addressMarker[0]) || 'at';

const ADDRESS_FIELDS = [
  ['gate', 1, 64],
  ['line', 1, 6],
  ['color', 1, 6],
  ['tone', 1, 6],
  ['base', 1, 5],
];

export class ParseError extends Error {
  constructor(message, { position = null, expected = null } = {}) {
    super(message);
    this.name = 'ParseError';
    this.position = position;
    this.expected = expected;
  }
}

/** Resolve a tool name or alias to its canonical id, or null. */
function resolveToolId(word) {
  const key = String(word).toLowerCase();
  if (TOOL_IDS.includes(key)) return key;
  if (Object.prototype.hasOwnProperty.call(TOOL_ALIASES, key)) return TOOL_ALIASES[key];
  return null;
}

function unknownToolError(word, position) {
  return new ParseError(
    `Unknown tool "${word}". Known tools (16): ${TOOL_IDS.join(', ')}`,
    { position, expected: TOOL_IDS.slice() }
  );
}

export function parseChain(input) {
  const src = String(input);
  const tokens = tokenize(src);
  let pos = 0;

  const peek = () => tokens[pos] || null;
  const atEnd = () => pos >= tokens.length;

  const isKeywordWord = (tok, keyword) =>
    tok !== null && tok.type === 'word' && tok.value.toLowerCase() === keyword;

  const isDot = (tok) => tok !== null && tok.type === 'punct' && tok.value === '.';

  const fail = (message, tok, expected) => {
    throw new ParseError(message, {
      position: tok ? tok.position : null,
      expected: expected || null,
    });
  };

  // ADDRESS → 'at' NUMBER ('.' NUMBER){0,4}
  // A float NUMBER is re-split on its decimal point, so `at 41.2` ≡ `at 41 . 2`.
  const parseAddress = () => {
    const atTok = tokens[pos++]; // consume ADDRESS_MARKER
    const parts = [];
    let lastTok = atTok;

    const readComponent = () => {
      const tok = peek();
      if (!tok || tok.type !== 'number') {
        fail(
          `Expected a number after '${atTok.raw}' in address`,
          tok,
          ['NUMBER']
        );
      }
      pos++;
      lastTok = tok;
      for (const piece of String(tok.raw).split('.')) parts.push(Number(piece));
    };

    readComponent();
    while (isDot(peek())) {
      pos++; // consume '.'
      readComponent();
    }

    if (parts.length > ADDRESS_FIELDS.length) {
      fail(
        `Address has ${parts.length} components; maximum is ${ADDRESS_FIELDS.length} (gate.line.color.tone.base)`,
        lastTok,
        ['at gate[.line[.color[.tone[.base]]]]']
      );
    }

    const address = {};
    for (let k = 0; k < parts.length; k++) {
      const [field, min, max] = ADDRESS_FIELDS[k];
      const n = parts[k];
      if (!Number.isInteger(n) || n < min || n > max) {
        fail(
          `Address component ${field}=${n} out of range ${min}..${max}`,
          lastTok,
          [`${field} ${min}..${max}`]
        );
      }
      address[field] = n;
    }
    return { address, node: { node: 'address', ...address } };
  };

  // call → TOOL args
  const parseCall = () => {
    const toolTok = peek();
    if (!toolTok) {
      fail(`Unexpected end of input after '${CHAIN_KEYWORD}': expected a tool call`, null, TOOL_IDS.slice());
    }
    if (toolTok.type !== 'word') {
      fail(
        `Expected a tool name to start a call, got ${toolTok.type} ${JSON.stringify(toolTok.raw)}`,
        toolTok,
        TOOL_IDS.slice()
      );
    }
    const tool = resolveToolId(toolTok.value);
    if (!tool) throw unknownToolError(toolTok.value, toolTok.position);
    pos++;

    const startOffset = toolTok.position.offset;
    let endOffset = toolTok.position.offset + toolTok.raw.length;

    const args = [];
    const flags = {};
    let address = null;
    const children = [{ node: 'tool', value: toolTok.value, resolved: tool }];
    const argNodes = [];
    const flagNodes = [];
    let addressNode = null;

    const bumpEnd = () => {
      if (pos > 0) {
        const prev = tokens[pos - 1];
        endOffset = prev.position.offset + prev.raw.length;
      }
    };

    while (!atEnd()) {
      const tok = peek();

      // THEN terminates this call's args and continues the chain.
      if (isKeywordWord(tok, CHAIN_KEYWORD)) break;

      if (tok.type === 'string') {
        args.push(tok.value);
        argNodes.push({ node: 'string', value: tok.value });
        pos++;
        bumpEnd();
        continue;
      }

      if (tok.type === 'number') {
        args.push(tok.value);
        argNodes.push({ node: 'number', value: tok.value });
        pos++;
        bumpEnd();
        continue;
      }

      if (tok.type === 'flag') {
        flags[tok.value.name] = tok.value.value;
        flagNodes.push({ node: 'flag', name: tok.value.name, value: tok.value.value });
        pos++;
        bumpEnd();
        continue;
      }

      if (tok.type === 'word') {
        // ADDRESS → 'at' gate['.'line['.'color['.'tone['.'base]]]]
        if (isKeywordWord(tok, ADDRESS_MARKER)) {
          if (address !== null) {
            fail(`Duplicate address in call to '${tool}'; only one '${ADDRESS_MARKER}' address per call`, tok, null);
          }
          const parsed = parseAddress();
          address = parsed.address;
          addressNode = parsed.node;
          bumpEnd();
          continue;
        }
        // words → WORD+ (one string arg; keywords terminate the group)
        const group = [];
        while (
          !atEnd() &&
          peek().type === 'word' &&
          !isKeywordWord(peek(), CHAIN_KEYWORD) &&
          !isKeywordWord(peek(), ADDRESS_MARKER)
        ) {
          group.push(peek().value);
          pos++;
        }
        const joined = group.join(' ');
        args.push(joined);
        argNodes.push({ node: 'words', value: joined, words: group });
        bumpEnd();
        continue;
      }

      if (tok.type === 'punct' && (tok.value === ',' || tok.value === '(' || tok.value === ')')) {
        // Decorative separators / grouping: ignored (grammar.js notes).
        pos++;
        bumpEnd();
        continue;
      }

      fail(`Unexpected ${tok.type} ${JSON.stringify(tok.raw)} in call to '${tool}'`, tok, [
        'STRING',
        'WORD',
        'NUMBER',
        'FLAG',
        `'${ADDRESS_MARKER}' address`,
        `'${CHAIN_KEYWORD}'`,
      ]);
    }

    children.push({ node: 'args', children: argNodes });
    if (flagNodes.length) children.push({ node: 'flags', children: flagNodes });
    if (addressNode) children.push(addressNode);

    return {
      tool,
      args,
      address,
      flags,
      raw: src.slice(startOffset, endOffset),
      ast: { node: 'call', tool, children },
    };
  };

  if (atEnd()) {
    throw new ParseError('Empty input: expected at least one tool call', {
      position: null,
      expected: TOOL_IDS.slice(),
    });
  }

  // chain → call (THEN chain)?  — right-associative; collected left-to-right.
  const calls = [parseCall()];
  while (isKeywordWord(peek(), CHAIN_KEYWORD)) {
    pos++; // consume THEN
    calls.push(parseCall());
  }

  if (!atEnd()) {
    const tok = peek();
    fail(`Unexpected trailing ${tok.type} ${JSON.stringify(tok.raw)}`, tok, [
      `'${CHAIN_KEYWORD}'`,
      'end of input',
    ]);
  }

  return { calls, chainLength: calls.length };
}

/** POS-tag a list of words using the lexicon's closed classes + suffix heuristics. */
export function posTagWords(words) {
  return Array.from(words || [], (word) => ({ word, pos: posGuess(word) }));
}

