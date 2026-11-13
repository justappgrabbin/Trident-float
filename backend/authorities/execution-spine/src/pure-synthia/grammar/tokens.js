// Pure Synthia Automata — tokenizer for the tool-call grammar (spec §10)

/**
 * Tokenizer (L1/L2 of the scale ladder): raw input text → token states.
 *
 * Token shape: { type, value, raw, position }
 *   type     : 'word' | 'string' | 'number' | 'flag' | 'punct'
 *   value    : string (word/string), number (number), {name, value} (flag),
 *              one of '.' ',' '(' ')' (punct)
 *   raw      : exact source substring consumed by the token
 *   position : { offset, line, column } of the token's first character
 *              (line/column are 1-based; offset is 0-based)
 *
 * Rules (contract src/grammar/tokens.js):
 *   - words    : [A-Za-z_][A-Za-z0-9_-]*   (hyphens allowed inside words so
 *                tool ids like `autoling-lite` stay a single token)
 *   - strings  : 'single' or "double" quoted; escapes \\ \' \" \n \t
 *   - flags    : --name or --name=value (value may be quoted; numeric values
 *                become numbers, otherwise strings; bare flags have value true)
 *   - numbers  : int/float, optional leading '-'
 *   - punct    : . , ( )
 */

export class TokenizeError extends Error {
  constructor(message, position = null) {
    super(message);
    this.name = 'TokenizeError';
    this.position = position;
  }
}

const WORD_START = /[A-Za-z_]/;
const WORD_CHAR = /[A-Za-z0-9_-]/;
const DIGIT = /[0-9]/;
const PUNCT = new Set(['.', ',', '(', ')']);
const WHITESPACE = new Set([' ', '\t', '\r', '\n']);
const NUMERIC_RUN = /^-?\d+(\.\d+)?$/;

export function tokenize(input) {
  const src = String(input);
  const tokens = [];
  let i = 0;
  let line = 1;
  let column = 1;

  const position = () => ({ offset: i, line, column });

  const advance = (n = 1) => {
    for (let k = 0; k < n; k++) {
      if (src[i] === '\n') {
        line++;
        column = 1;
      } else {
        column++;
      }
      i++;
    }
  };

  // Reads a quoted string body; assumes src[i] is the opening quote.
  // Returns the unescaped string value and leaves i past the closing quote.
  const readQuoted = (startPos) => {
    const quote = src[i];
    advance(); // opening quote
    let value = '';
    while (i < src.length && src[i] !== quote) {
      if (src[i] === '\\') {
        const next = src[i + 1];
        if (next === 'n') value += '\n';
        else if (next === 't') value += '\t';
        else if (next === 'r') value += '\r';
        else if (next === quote) value += quote;
        else if (next === '\\') value += '\\';
        else if (next === undefined) break;
        else value += next; // unknown escape: literal character
        advance(2);
      } else {
        value += src[i];
        advance();
      }
    }
    if (i >= src.length) {
      throw new TokenizeError(
        `Unterminated string starting at line ${startPos.line}, column ${startPos.column}`,
        startPos
      );
    }
    advance(); // closing quote
    return value;
  };

  while (i < src.length) {
    const ch = src[i];

    if (WHITESPACE.has(ch)) {
      advance();
      continue;
    }

    // --- quoted string ---
    if (ch === "'" || ch === '"') {
      const pos = position();
      const value = readQuoted(pos);
      tokens.push({ type: 'string', value, raw: src.slice(pos.offset, i), position: pos });
      continue;
    }

    // --- flag: --name or --name=value ---
    if (ch === '-' && src[i + 1] === '-') {
      const pos = position();
      advance(2);
      let name = '';
      while (i < src.length && WORD_CHAR.test(src[i])) {
        name += src[i];
        advance();
      }
      if (!name) {
        throw new TokenizeError(
          `Expected flag name after "--" at line ${pos.line}, column ${pos.column}`,
          pos
        );
      }
      let value = true;
      if (src[i] === '=') {
        advance();
        if (src[i] === "'" || src[i] === '"') {
          value = readQuoted(pos);
        } else {
          let rawValue = '';
          while (i < src.length && !WHITESPACE.has(src[i])) {
            rawValue += src[i];
            advance();
          }
          if (rawValue === '') {
            throw new TokenizeError(
              `Expected value after "--${name}=" at line ${pos.line}, column ${pos.column}`,
              pos
            );
          }
          value = NUMERIC_RUN.test(rawValue) ? Number(rawValue) : rawValue;
        }
      }
      tokens.push({
        type: 'flag',
        value: { name, value },
        raw: src.slice(pos.offset, i),
        position: pos,
      });
      continue;
    }

    // --- number: int/float, optional leading '-' ---
    if (DIGIT.test(ch) || (ch === '-' && DIGIT.test(src[i + 1] || ''))) {
      const pos = position();
      let raw = '';
      if (src[i] === '-') {
        raw += '-';
        advance();
      }
      while (i < src.length && DIGIT.test(src[i])) {
        raw += src[i];
        advance();
      }
      if (src[i] === '.' && DIGIT.test(src[i + 1] || '')) {
        raw += '.';
        advance();
        while (i < src.length && DIGIT.test(src[i])) {
          raw += src[i];
          advance();
        }
      }
      tokens.push({ type: 'number', value: Number(raw), raw, position: pos });
      continue;
    }

    // --- word ---
    if (WORD_START.test(ch)) {
      const pos = position();
      let raw = '';
      while (i < src.length && WORD_CHAR.test(src[i])) {
        raw += src[i];
        advance();
      }
      tokens.push({ type: 'word', value: raw, raw, position: pos });
      continue;
    }

    // --- punctuation ---
    if (PUNCT.has(ch)) {
      tokens.push({ type: 'punct', value: ch, raw: ch, position: position() });
      advance();
      continue;
    }

    throw new TokenizeError(
      `Unexpected character ${JSON.stringify(ch)} at line ${line}, column ${column}`,
      position()
    );
  }

  return tokens;
}

