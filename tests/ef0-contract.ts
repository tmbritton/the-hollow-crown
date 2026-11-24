import { createHash } from 'node:crypto';

export const ef0Revision = '398a1cf01fdebf8c072741c3de20670012795439';
export const ef0Lock = '565e12186123643d38540a2773ff1253c081955952d1bfec3987cb67328fa93f';
export const candidateLock = 'a32adb7ea1df998bb678a544d52a551ac9bbd06a7bcc6655651286c57f901b3f';
export const captureEnvironment = {
  node: 'v26.0.0',
  zlib: '1.3.1.zlib-ng',
  npm: '11.12.1',
  level: 9,
} as const;
export const serializerVersion = 1;
export const originalHarness = '051d7e328b4acd27193d5a115e83c359f4560e23845ce79ee17642fdd69026f8';

// Pins from the original EF0 bytes, not from the candidate. See docs/ef0-baseline.md.
export const kits = {
  'generation-ef0': {
    manifest: 'b67b2d6243b84f7024f6857195566ba397ed0f57e18eefa897f6db9dca96816a',
    tree: 'b0fec09a8e072cc6452b81664104e0e374628a38d9c258027793bb26b04c61de',
    corpus: '4f8f83b5a893446054d3075a13666a4b2ac43d2e6e0632eb51fd1dcd0ece7e38',
    count: 103,
  },
  'generation-ef0-scenarios': {
    manifest: '9c50c6c9a20eeb6ebc4e5e1c3c43b57ac16522b1df0eaf6c0d82fd9cde43bda3',
    tree: 'cb8a3b8c52f28ac3395c555d116a33bd0517ffee925df8336d2e8c2ff5de298c',
    corpus: '5cf35270025cac779b0a0579a795e873aa66566743d0508795eba7f39b2eb4be',
    count: 9,
  },
} as const;
export type KitName = keyof typeof kits;

export interface FixtureInput {
  seed: string;
  options: { maxAttempts?: number };
  core: boolean;
  defaultSeed?: true;
}
const named = ['MOURNING-731', 'trial-27', 'trial-23', 'ember-70', 'tribute-12'];
export const coreInputs = (): FixtureInput[] => [
  ...named.map((seed): FixtureInput => ({
    seed,
    options: {},
    core: true,
    ...(seed === named[0] ? { defaultSeed: true } : {}),
  })),
  { seed: 'trial-23', options: { maxAttempts: 1 }, core: true },
];
export function fixtureInputs(): FixtureInput[] {
  const core = coreInputs();
  return [
    ...core.slice(0, -1),
    ...['CINDER-42', 'VIOLET-7', ...Array.from({ length: 97 }, (_, i) => `trial-${i}`)]
      .filter((seed) => !named.includes(seed))
      .map((seed) => ({ seed, options: {}, core: false })),
    core[core.length - 1],
  ];
}
export const scenarioFixtureInputs = (): FixtureInput[] =>
  [
    'scene-world-3',
    'scene-world-36',
    'ember-78',
    'ember-6',
    'ember-96',
    'tribute-17',
    'tribute-98',
    'tribute-2',
    'tribute-86',
  ].map((seed) => ({ seed, options: {}, core: false }));

export const coreDigests = [
  '28806fd31f1e6b6e45b2350158d2ee75badca62be4863c09d283a807247d8b38',
  'a12eda83e7a66670feeaddf9dc8fc0e373eada59f3adac740c4b7bc7bc2d98ba',
  'c84a1fb0cec44482f49bacbe75e3937a0fa76ce56c23caaba1f3d2cafb813144',
  'f9cdf993ca779a4313aabd3a2f5c44d1db1bde533a112f6b98e43fbf1cd88f99',
  'ca5d05860bedb9a5179a254ea617bb301db3804a2390c9623e8b6f3c3314dc57',
  'b7cec90f5a4f1f2869543ae23792c7be7e88c2a1dd9b57aebfb37fa32a733cde',
] as const;

export const sha = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
export function framedDigest(entries: Iterable<readonly [string, string]>) {
  const digest = createHash('sha256');
  for (const [name, hex] of entries) {
    if (!/^[0-9a-f]{64}$/.test(hex)) throw Error('Invalid SHA-256 leaf');
    const length = Buffer.alloc(4);
    length.writeUInt32BE(Buffer.byteLength(name));
    digest.update(length).update(name).update(Buffer.from(hex, 'hex'));
  }
  return digest.digest('hex');
}
export const inputIdentity = (input: FixtureInput) =>
  JSON.stringify([input.seed, input.options.maxAttempts ?? null, input.core, !!input.defaultSeed]);
export const corpusDigest = (leaves: readonly { input: FixtureInput; sha256: string }[]) =>
  framedDigest(leaves.map(({ input, sha256 }) => [inputIdentity(input), sha256]));

export const historicalNative = [
  '23c5fb0543acd8de2d1313f6bec9ca9ad9a1f193bc85a14aedb8587c3789c9da',
  'f42f670da35059073fc63ef93ab9a9ce0b05fa98dda3ea79f86b5dfa22706974',
] as const;
// [midpoint, addition] in ms, literal IEEE-754 results of the original two windows.
export const historicalTiming = [
  {
    seed: 'MOURNING-731',
    median: [58.76793599999996, 5.8767935999999965],
    p95: [69.56645000000026, 10.434967500000038],
  },
  {
    seed: 'trial-23',
    median: [228.9374875000001, 22.89374875000001],
    p95: [247.0389620000003, 37.05584430000005],
  },
  {
    seed: 'trial-27',
    median: [55.48203099999989, 5.54820309999999],
    p95: [63.46208350000006, 9.519312525000009],
  },
  {
    seed: 'ember-70',
    median: [71.19097050000028, 7.119097050000028],
    p95: [79.35665400000039, 11.903498100000059],
  },
  {
    seed: 'tribute-12',
    median: [63.0741965000002, 6.30741965000002],
    p95: [71.81951050000043, 10.772926575000065],
  },
] as const;
