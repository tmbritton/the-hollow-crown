/** Pure catalog shared by the Node runner and browser fixture module. */
export const CPU_RECIPE_VERSION = 2;
export const cpuCases = [
  'entrance',
  'stable',
  'hitch',
  'movement',
  'doorway',
  'shield',
  'phalanx',
  'cargo',
  'ragdoll',
  'bones',
  'bolt',
  'javelin',
  'hazard',
  'landing',
  'airborne',
  'stairs',
  'burst',
  'settled',
  'frames-low',
  'frames-high',
  'live-low',
  'live-high',
] as const;
export type CpuCase = (typeof cpuCases)[number];
