import { decodeValue, encodeValue } from './cursor-capture-codec.ts';

// One filling buffer, one in flight, and one sealed buffer waiting for credit.
export const pageBytes = 2 * 1024 * 1024;
export const recordBytes = 128 * 1024;
export type Packet = {
  version: 1;
  visit: string;
  seq: number;
  final: boolean;
  bytes: number;
  digest: string;
  payload: string;
};
type Ack = Pick<Packet, 'visit' | 'seq' | 'digest'>;
type Send = (packet: Packet) => Promise<Ack>;
type State =
  | { kind: 'armed' | 'producing' }
  | { kind: 'draining'; final: number }
  | { kind: 'sealed'; final: number }
  | { kind: 'failed'; reason: string };
type Event =
  | { type: 'begin' }
  | { type: 'finish'; final: number }
  | { type: 'ack'; seq: number; final: boolean }
  | { type: 'fail'; reason: string };

export function liveTransition(state: State, event: Event): State {
  if (state.kind !== 'failed' && state.kind !== 'sealed' && event.type === 'fail')
    return { kind: 'failed', reason: event.reason.slice(0, 512) };
  if (state.kind === 'armed' && event.type === 'begin') return { kind: 'producing' };
  if (state.kind === 'producing' && event.type === 'finish')
    return { kind: 'draining', final: event.final };
  if (event.type === 'ack') {
    if (state.kind === 'producing' && !event.final) return state;
    if (state.kind === 'draining' && event.seq < state.final && !event.final) return state;
    if (state.kind === 'draining' && event.seq === state.final && event.final)
      return { kind: 'sealed', final: state.final };
  }
  throw new Error(`invalid live transition: ${state.kind}/${event.type}`);
}

// Compute the transmission checksum incrementally so dispatch does not wait
// on a crypto task on the page. The archive separately pins SHA-256.
const initialHash = 2166136261;
const hashRange = (data: Uint8Array, start: number, end: number, h: number) => {
  for (let i = start; i < end; i++) h = Math.imul(h ^ data[i], 16777619);
  return h;
};
const digestOf = (h: number) => (h >>> 0).toString(16).padStart(8, '0');

export function encodePageBase64(data: Uint8Array) {
  if (typeof Buffer !== 'undefined')
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('base64');
  if (typeof data.toBase64 === 'function') return data.toBase64();
  const parts: string[] = [];
  // The chunk size is divisible by three, so padding occurs only at the end.
  for (let start = 0; start < data.length; start += 12_288)
    parts.push(btoa(String.fromCharCode(...data.subarray(start, start + 12_288))));
  return parts.join('');
}

export function decodePageBase64(data: string) {
  if (typeof Buffer !== 'undefined') return Buffer.from(data, 'base64');
  if (typeof Uint8Array.fromBase64 === 'function') return Uint8Array.fromBase64(data);
  const raw = atob(data);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function packetBytes(packet: Packet) {
  if (
    packet.version !== 1 ||
    !Number.isSafeInteger(packet.seq) ||
    packet.seq < 0 ||
    typeof packet.final !== 'boolean' ||
    !Number.isSafeInteger(packet.bytes) ||
    packet.bytes < 0 ||
    packet.bytes > pageBytes ||
    typeof packet.payload !== 'string' ||
    packet.payload.length !== Math.ceil(packet.bytes / 3) * 4
  )
    throw new Error('invalid live packet header');
  const bytes = decodePageBase64(packet.payload);
  if (
    bytes.length !== packet.bytes ||
    digestOf(hashRange(bytes, 0, bytes.length, initialHash)) !== packet.digest
  )
    throw new Error('live page integrity mismatch');
  return bytes;
}

export function liveReceiver(
  visit: string,
  persist: (packet: Packet, bytes: Uint8Array) => Promise<void>,
) {
  let next = 0,
    busy = false,
    sealed = false,
    failure: string | null = null;
  let bytes = 0,
    peakBytes = 0,
    peakPayloadChars = 0;
  return {
    status: () => ({ committed: next, sealed, failure, bytes, peakBytes, peakPayloadChars }),
    fail(reason: string) {
      if (!sealed) failure ??= reason.slice(0, 512);
    },
    async receive(packet: Packet): Promise<Ack> {
      if (failure || sealed || busy || packet.visit !== visit || packet.seq !== next) {
        failure ??= 'invalid live delivery order or credit';
        throw new Error(failure);
      }
      busy = true;
      try {
        const data = await packetBytes(packet);
        peakBytes = Math.max(peakBytes, data.length);
        peakPayloadChars = Math.max(peakPayloadChars, packet.payload.length);
        if (failure) throw new Error(failure);
        await persist(packet, data);
        bytes += data.length;
        next++;
        if (failure) throw new Error(failure);
        sealed = packet.final;
        return { visit, seq: packet.seq, digest: packet.digest };
      } catch (error) {
        failure ??= String(error).slice(0, 512);
        throw error;
      } finally {
        busy = false;
      }
    },
  };
}

export function liveProducer(visit: string, send: Send) {
  let state: State = { kind: 'armed' };
  const workspace = new Uint8Array(recordBytes);
  const floats = new Map<number, number>();
  let filling = new Uint8Array(pageBytes),
    offset = 0,
    next = 0,
    committed = 0;
  let pending: Promise<void> | null = null;
  let checksum = initialHash;
  let finalWaiting = false;
  type Page = { data: Uint8Array<ArrayBuffer>; final: boolean; seq: number; digest: string };
  let sealed: Page | null = null;
  let records = 0,
    bytes = 0,
    peakPageBytes = pageBytes,
    peakPending = 0,
    peakPayloadChars = 0,
    peakDictionaryEntries = 0;
  function fail(reason: string) {
    if (state.kind === 'failed' || state.kind === 'sealed') return;
    state = liveTransition(state, { type: 'fail', reason });
    sealed = null;
    offset = 0;
  }
  function sendSealed() {
    if (pending || !sealed || state.kind === 'failed') return;
    const { data, seq, final, digest } = sealed;
    sealed = null;
    pending = Promise.resolve().then(async () => {
      try {
        if (failed()) return;
        const payload = encodePageBase64(data);
        peakPayloadChars = Math.max(peakPayloadChars, payload.length);
        const ack = await Promise.resolve(
          send({
            version: 1,
            visit,
            seq,
            final,
            bytes: data.length,
            digest,
            payload,
          }),
        );
        if (failed()) return;
        if (ack.visit !== visit || ack.seq !== seq || ack.digest !== digest || seq !== committed)
          throw new Error('invalid live ACK');
        committed++;
        state = liveTransition(state, { type: 'ack', seq, final });
      } catch (error) {
        fail(String(error));
      } finally {
        pending = null;
        sendSealed();
        if (finalWaiting && !sealed && !failed()) {
          finalWaiting = false;
          flush(true);
        }
      }
    });
  }
  const failed = () => state.kind === 'failed';
  function flush(final = false) {
    if (!offset && !final) return;
    if (sealed) {
      if (final) {
        finalWaiting = true;
        return;
      }
      fail('live capture exhausted page credit');
      return;
    }
    sealed = { data: filling.subarray(0, offset), final, seq: next++, digest: digestOf(checksum) };
    peakPending = Math.max(peakPending, pending ? 2 : 1);
    peakPageBytes = Math.max(peakPageBytes, pageBytes * (pending ? 3 : 2));
    filling = new Uint8Array(pageBytes);
    offset = 0;
    checksum = initialHash;
    floats.clear();
    sendSealed();
  }
  return {
    status: () => ({
      ...state,
      committed,
      records,
      bytes,
      peakPageBytes,
      peakPending,
      peakPayloadChars,
      workspaceBytes: recordBytes,
      peakDictionaryEntries,
    }),
    begin() {
      state = liveTransition(state, { type: 'begin' });
    },
    append(record: unknown) {
      if (state.kind === 'failed') return;
      if (state.kind !== 'producing') throw new Error('invalid live append');
      // Callers supply bounded records, not a scene or frame serialization.
      let written: number;
      try {
        written = encodeValue(record, workspace, floats);
        peakDictionaryEntries = Math.max(peakDictionaryEntries, floats.size);
        if (offset + written + 4 > pageBytes) {
          flush();
          if (failed()) return;
          written = encodeValue(record, workspace, floats);
          peakDictionaryEntries = Math.max(peakDictionaryEntries, floats.size);
        }
      } catch (error) {
        fail(String(error));
        return;
      }
      filling.set(workspace.subarray(0, written), offset + 4);
      new DataView(filling.buffer).setUint32(offset, written, true);
      checksum = hashRange(filling, offset, offset + written + 4, checksum);
      offset += written + 4;
      bytes += written + 4;
      records++;
    },
    flush() {
      if (state.kind === 'producing') flush();
    },
    handoff() {
      if (state.kind === 'producing' && !pending && !sealed) flush();
    },
    finish() {
      if (state.kind === 'failed') return;
      state = liveTransition(state, { type: 'finish', final: next });
      flush(true);
    },
    fail,
    async settled() {
      while (pending) await pending;
    },
  };
}

export function* pageRecords(bytes: Uint8Array): Generator<unknown> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const floats: number[] = [];
  for (let start = 0; start < bytes.length;) {
    if (start + 4 > bytes.length) throw new Error('truncated live record length');
    const size = view.getUint32(start, true);
    start += 4;
    if (!size || size > recordBytes || start + size > bytes.length)
      throw new Error('truncated or oversize live record');
    yield decodeValue(bytes.subarray(start, start + size), floats);
    start += size;
  }
}
