import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { cursorDiagnostic } from './cursor-attribution-probe.ts';
import { decodePageBase64, liveProducer, pageBytes } from './cursor-capture-stream.ts';
import type { Packet } from './cursor-capture-stream.ts';
import { writerDecoder } from './cursor-writer-stream.ts';
import type { WriterRecord } from './cursor-writer-stream.ts';
import { scratchPass } from './cursor-publication-replay.ts';
import type { ScratchArm } from './cursor-publication-replay.ts';

type Send = (p: Packet) => Promise<Pick<Packet, 'visit' | 'seq' | 'digest'>>;
type Fixture = { start: WriterRecord[]; dictionary: WriterRecord[][]; gaps: string[] };
const bridge = window as unknown as {
  capturePage: Send;
  __cursorWriterPage: Send;
};

export async function retainedVolume(visit: string, length: number) {
  if (length !== 60 && length !== 120) throw new Error('invalid volume length');
  const fixture: Fixture = await fetch('/retained-fixture').then((r) => r.json());
  if (fixture.dictionary.length !== 6) throw new Error('invalid fixture cycle');
  const cycleEvents = fixture.dictionary.slice(3).reduce((count, rows) => {
    for (const row of rows)
      count +=
        row[0] === 'write-span' ? row[2] : row[0] === 'write' || row[0] === 'write-delta' ? 1 : 0;
    return count;
  }, 0);
  const producer = liveProducer(visit, bridge.capturePage);
  let events = 0;
  let beforeEnd = 0;
  let tickStride = 0;
  let seqStride = 0;
  let firstFramePage = false;
  let nextFrame = 0;
  for (let i = 0; i < length; i++) {
    // The archive's frames advanced four or five fixed 60 Hz ticks apiece.
    // Schedule this transport-only source at that cadence, independent of ACKs.
    const now = await new Promise<number>((resolve) => {
      function frame(time: number) {
        if (time >= nextFrame) resolve(time);
        else requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
    nextFrame = now + (i % 3 === 2 ? 4 : 5) * (1000 / 60);
    if (producer.status().kind === 'failed') break;
    if (i === 0) {
      producer.begin();
      for (const row of fixture.start) producer.append(row);
    }
    const index = i < 3 ? i : 3 + (i % 3);
    if (i >= 6 && i % 3 === 0) {
      tickStride += 14;
      // Each steady cycle has the identical three native frames and reset writes.
      seqStride += cycleEvents;
    }
    beforeEnd = producer.status().committed;
    for (const row of fixture.dictionary[index]) {
      switch (row[0]) {
        case 'begin':
          producer.append(['begin', 65 + i, row[2] + tickStride]);
          break;
        case 'end':
          producer.append(['end', row[1] + tickStride]);
          break;
        case 'check':
          producer.append([
            'check',
            { ...row[1], tick: row[1].tick + tickStride, at: row[1].at + seqStride },
          ]);
          break;
        case 'write':
        case 'write-delta':
        case 'write-span': {
          const site = row[1].slice() as (typeof row)[1];
          site[1] += tickStride;
          producer.append([row[0], site, ...row.slice(2)]);
          events += row[0] === 'write-span' ? row[2] : 1;
          break;
        }
        default:
          producer.append(row);
      }
      if (i === 0 && !firstFramePage && row[0] === 'end-check') {
        producer.handoff(); // A committed page must straddle the first frame.
        firstFramePage = true;
      }
    }
  }
  if (producer.status().kind !== 'failed') {
    producer.append(['trailer', length, events, fixture.gaps]);
    producer.finish();
  }
  await producer.settled();
  return { ...producer.status(), beforeEnd, events };
}

export function startScratch(arm: ScratchArm) {
  const decoder = writerDecoder();
  let pass: ReturnType<typeof scratchPass> | undefined;
  return (encoded: string) => {
    if (encoded.length > Math.ceil(pageBytes / 3) * 4) throw new Error('scratch page cap');
    const data = decodePageBase64(encoded);
    if (data.length > pageBytes) throw new Error('scratch decode cap');
    for (const frame of decoder.consume(data)) {
      pass ??= scratchPass(decoder.header()!, arm, null);
      pass.frame(frame);
    }
    return decoder.status().ended ? { ...decoder.status(), ...pass!.result() } : null;
  };
}

// Exercise the actual probe and its scratch guard, without a game launch or GPU.
export function tinyCount(finalAck: () => void) {
  const canvas = document.querySelector('canvas')!;
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const camera = new FreeCamera('camera', new Vector3(0, 0, -10), scene);
  const box = CreateBox('fixture', {}, scene);
  const game = {
    steps: 0,
    scene,
    camera,
    player: { root: box },
    world: { rooms: [], connections: [], entities: [] },
    combat: { enemies: [] },
  } as unknown as Parameters<ReturnType<typeof cursorDiagnostic>['ready']>[0];
  bridge.__cursorWriterPage = async (packet) => {
    const ack = await bridge.capturePage(packet);
    if (packet.final) finalAck();
    return ack;
  };
  const unused = (): never => {
    throw new Error('idle probe used pick ports');
  };
  const diagnostic = cursorDiagnostic({
    canvas,
    pointerRay: unused,
    pickPointer: unused,
    currentOperation: unused,
    inUseReach: unused,
    ground: unused,
  });
  const probeEngine = engine as unknown as Parameters<typeof diagnostic.ready>[1];
  diagnostic.ready(game, probeEngine, 'fixture', {} as Parameters<typeof diagnostic.ready>[3]);
  return {
    probe: diagnostic.bridge,
    frame() {
      diagnostic.begin(game);
      diagnostic.retain(game, 1 / 60);
      diagnostic.fixed(game, () => diagnostic.fixedStep(++game.steps));
      diagnostic.render(game, probeEngine);
    },
  };
}
