// Version-1 record values. Small integers and repeated tags take one byte;
// non-integer numbers use IEEE-754 binary64 (including negative zero).
const tags = [
  'start',
  'id',
  'seed',
  'begin',
  'write',
  'write-delta',
  'check',
  'mesh',
  'mesh-delta',
  'thin',
  'end-check',
  'end',
  'trailer',
  'write-span',
  'mesh-span',
];
const fields = [
  'id',
  'input',
  'world',
  'min',
  'max',
  'aggregate',
  'lineage',
  'eligible',
  'fallback',
  'authored',
  'boundsDirty',
  'thin',
  'mesh',
  'name',
  'runId',
  'kind',
  'provenance',
  'at',
  'phase',
  'tick',
  'ray',
  'x',
  'z',
  'dx',
  'dz',
  'length',
];
const words = new Map([...tags, ...fields].map((s, i) => [s, i + 192]));
const strings = [...tags, ...fields];
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const invalid = () => new Error('invalid or oversize live record');

export const floatDictionaryEntries = 16_384;

export function encodeValue(value: unknown, dest: Uint8Array, floats?: Map<number, number>) {
  const view = new DataView(dest.buffer, dest.byteOffset, dest.byteLength);
  let at = 0;
  function reserve(n: number) {
    if (at + n > dest.length) throw invalid();
  }
  function byte(n: number) {
    reserve(1);
    dest[at++] = n;
  }
  function int(n: number) {
    do {
      const rest = n >>> 7;
      byte((n & 127) + (rest ? 128 : 0));
      n = rest;
    } while (n);
  }
  function put(v: unknown, depth: number) {
    if (depth > 12) throw invalid();
    if (typeof v === 'number') {
      if (Object.is(v, -0) || !Number.isSafeInteger(v) || v < 0 || v > 0xffff_ffff) {
        if (!Number.isFinite(v)) throw invalid();
        // Intern binary64 operands within one page. Keep signed zero out of
        // the dictionary because Map keys compare +0 and -0 as equal.
        if (floats && !Object.is(v, -0)) {
          const slot = floats.get(v);
          if (slot !== undefined) {
            byte(137);
            int(slot);
            return;
          }
          if (floats.size < floatDictionaryEntries) floats.set(v, floats.size);
        }
        byte(131);
        reserve(8);
        view.setFloat64(at, v, true);
        at += 8;
      } else if (v < 128) byte(v);
      else {
        byte(132);
        int(v);
      }
    } else if (v === null) byte(128);
    else if (v === false) byte(129);
    else if (v === true) byte(130);
    else if (typeof v === 'string') {
      const word = words.get(v);
      if (word !== undefined) {
        byte(word);
        return;
      }
      if (v.length > 1024) throw invalid();
      byte(133);
      // The string itself is bounded; use a fixed-width length for encodeInto.
      reserve(2);
      const length = at;
      at += 2;
      const { read, written } = encoder.encodeInto(v, dest.subarray(at));
      if (read !== v.length) throw invalid();
      view.setUint16(length, written, true);
      at += written;
    } else if (Array.isArray(v)) {
      byte(134);
      int(v.length);
      for (const item of v) put(item, depth + 1);
    } else if (typeof v === 'object' && v !== null) {
      const pairs = Object.entries(v);
      if (pairs.length > 32) throw invalid();
      byte(135);
      byte(pairs.length);
      for (const [key, item] of pairs) {
        put(key, depth + 1);
        put(item, depth + 1);
      }
    } else if (v === undefined) byte(136);
    else throw invalid();
  }
  put(value, 0);
  return at;
}

export function decodeValue(src: Uint8Array, floats?: number[]) {
  const view = new DataView(src.buffer, src.byteOffset, src.byteLength);
  let at = 0;
  function byte() {
    if (at >= src.length) throw invalid();
    return src[at++];
  }
  function int() {
    let result = 0;
    for (let shift = 0; shift <= 28; shift += 7) {
      const n = byte();
      result += (n & 127) * 2 ** shift;
      if (n < 128 && result <= 0xffff_ffff) return result;
    }
    throw invalid();
  }
  function get(depth: number): unknown {
    if (depth > 12) throw invalid();
    const tag = byte();
    if (tag < 128) return tag;
    if (tag === 128) return null;
    if (tag === 129) return false;
    if (tag === 130) return true;
    if (tag === 131) {
      const n = view.getFloat64(at, true);
      at += 8;
      if (!Number.isFinite(n)) throw invalid();
      if (floats && floats.length < floatDictionaryEntries && !Object.is(n, -0)) floats.push(n);
      return n;
    }
    if (tag === 132) return int();
    if (tag === 133) {
      const n = view.getUint16(at, true);
      at += 2;
      if (n > 3072 || at + n > src.length) throw invalid();
      const s = decoder.decode(src.subarray(at, at + n));
      at += n;
      return s;
    }
    if (tag === 134) {
      const n = int();
      if (n > src.length - at) throw invalid();
      const array: unknown[] = [];
      for (let i = 0; i < n; i++) array.push(get(depth + 1));
      return array;
    }
    if (tag === 135) {
      const n = byte();
      if (n > 32) throw invalid();
      const pairs: [string, unknown][] = [];
      for (let i = 0; i < n; i++) {
        const key = get(depth + 1);
        if (typeof key !== 'string') throw invalid();
        pairs.push([key, get(depth + 1)]);
      }
      return Object.fromEntries(pairs);
    }
    if (tag === 136) return undefined;
    if (tag === 137) {
      const i = int();
      if (!floats || i >= floats.length) throw invalid();
      return floats[i];
    }
    if (tag >= 192 && tag < 192 + strings.length) return strings[tag - 192];
    throw invalid();
  }
  const result = get(0);
  if (at !== src.length) throw invalid();
  return result;
}
