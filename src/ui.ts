import { element, html as $ } from './dom.ts';
import { required } from './assert.ts';
import type { InspectionTarget } from './inspection.ts';
import type { Player } from './player.ts';
import type { Actor } from './actors.ts';
import type { PlayableContent, PlayableLayout, Room, RoomId } from './worldTypes.ts';
import { Statechart } from './machines/statechart.ts';
import { sessionMachine } from './machines/ui/session.ts';
import type { SessionEvent } from './machines/ui/session.ts';
import { feedbackMachine } from './machines/ui/feedback.ts';
import { inhabitantDiscovery, landmarkDiscovery } from './discoveries.ts';
import type { DiscoveryRecord } from './discoveries.ts';
import type { AgendaClock } from './lastEmber.ts';
import type { PracticeRound } from './practiceRoom.ts';
import { VIEW_RANGES } from './visualTrial.ts';
import type { ViewSettings } from './visualTrial.ts';
import type { ViewMode, VisualTrialEvent } from './machines/ui/visualTrial.ts';

export function bindVisualTrialPanel(send: (event: VisualTrialEvent) => boolean) {
  const original = element('view-original', HTMLButtonElement);
  const tuned = element('view-tuned', HTMLButtonElement);
  const palette = element('view-palette', HTMLInputElement);
  const text = element('view-copy-text', HTMLTextAreaElement);
  const status = $('view-copy-status');
  const inputs = (
    [
      ['lensDegrees', 'view-lens'],
      ['fisheyePercent', 'view-fisheye'],
      ['roomHue', 'view-hue'],
      ['shadowCoverage', 'view-coverage'],
      ['inkWidth', 'view-ink'],
    ] as const
  ).map(([key, id]) => {
    const range = element(id, HTMLInputElement);
    const value = element(`${id}-value`, HTMLInputElement);
    const [min, max] = VIEW_RANGES[key];
    for (const input of [range, value]) {
      input.min = String(min);
      input.max = String(max);
    }
    range.oninput = () => send({ type: 'EDIT', key, value: range.valueAsNumber });
    // step="any" lets a copied value round-trip precisely. Give arrows an explicit step.
    range.onkeydown = (event) => {
      const delta = ['ArrowLeft', 'ArrowDown'].includes(event.key)
        ? -1
        : ['ArrowRight', 'ArrowUp'].includes(event.key)
          ? 1
          : 0;
      if (!delta) return;
      event.preventDefault();
      send({ type: 'EDIT', key, value: range.valueAsNumber + delta });
    };
    value.onchange = () => {
      if (!send({ type: 'EDIT', key, value: value.valueAsNumber })) value.value = range.value;
    };
    return { key, range, value };
  });
  original.onclick = () => send({ type: 'SELECT', mode: 'original' });
  tuned.onclick = () => send({ type: 'SELECT', mode: 'tuned' });
  palette.onchange = () => send({ type: 'PALETTE', enabled: palette.checked });
  $('view-reset').onclick = () => send({ type: 'RESET' });
  $('view-copy').onclick = () => send({ type: 'COPY' });
  let copyRequest = 0;
  return {
    update(mode: ViewMode, settings: ViewSettings) {
      copyRequest++;
      text.hidden = true;
      status.textContent = '';
      original.setAttribute('aria-pressed', String(mode === 'original'));
      tuned.setAttribute('aria-pressed', String(mode === 'tuned'));
      palette.disabled = mode === 'original';
      palette.checked = settings.paletteEnabled;
      for (const { key, range, value } of inputs) {
        range.disabled = value.disabled = mode === 'original';
        range.value = value.value = String(settings[key]);
      }
    },
    async copy(settings: string) {
      const request = ++copyRequest;
      try {
        await navigator.clipboard.writeText(settings);
        if (request !== copyRequest) return;
        text.hidden = true;
        status.textContent = 'Settings copied.';
      } catch {
        if (request !== copyRequest) return;
        status.textContent = 'Select and copy these settings:';
        text.value = settings;
        text.hidden = false;
        if (document.activeElement === $('view-copy')) {
          text.focus();
          text.select();
        }
      }
    },
  };
}

export function fromVisualTrial(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('#visual-trial') !== null;
}

export class UI {
  readonly map: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  readonly menu: HTMLDialogElement;
  readonly victory: HTMLDialogElement;
  readonly inspection: HTMLDialogElement;
  readonly flow = new Statechart(sessionMachine);
  private readonly toastState = new Statechart(feedbackMachine);
  private readonly roomState = new Statechart(feedbackMachine);
  private readonly damageState = new Statechart(feedbackMachine);
  private currentWorld: PlayableLayout | null = null;
  private currentRecord: DiscoveryRecord | null = null;
  private visited = new Set<RoomId>();
  private revealed = new Set<RoomId>();
  roomId: RoomId | null = null;
  private mapScale = 1;
  private mapCenter = { x: 0, z: 0 };
  private agendaText = '';

  get ready(): boolean {
    return (
      !this.flow.snapshot.matches({ mode: 'loading' }) &&
      !this.flow.snapshot.matches({ mode: 'failed' })
    );
  }
  get paused(): boolean {
    return (
      !this.ready ||
      this.flow.snapshot.matches({ visibility: 'hidden' }) ||
      this.flow.snapshot.matches({ mode: 'menu' }) ||
      this.flow.snapshot.matches({ mode: 'victory' })
    );
  }
  transition(event: SessionEvent): void {
    this.flow.send(event);
    for (const [mode, dialog] of [
      ['menu', this.menu],
      ['victory', this.victory],
      ['inspecting', this.inspection],
    ] as const) {
      const open = this.flow.snapshot.matches({ mode });
      if (open && !dialog.open) dialog.showModal();
      if (!open && dialog.open) dialog.close();
    }
    document.body.classList.toggle(
      'inspecting',
      this.flow.snapshot.matches({ mode: 'inspecting' }),
    );
    required(document.querySelector<HTMLElement>('.map-panel'), 'Map panel missing').hidden =
      this.flow.snapshot.matches({ map: 'hidden' });
  }

  private get world(): PlayableLayout {
    return required(this.currentWorld, 'UI has not been initialized');
  }
  private get record(): DiscoveryRecord {
    return required(this.currentRecord, 'Discovery record has not been initialized');
  }
  constructor() {
    this.map = element('map', HTMLCanvasElement);
    this.context = required(this.map.getContext('2d'), 'Minimap canvas unavailable');
    this.menu = element('menu', HTMLDialogElement);
    this.victory = element('victory', HTMLDialogElement);
    this.inspection = element('inspection', HTMLDialogElement);
    this.transition({ type: document.hidden ? 'HIDE' : 'SHOW' });
  }

  unload(): void {
    this.transition({ type: 'LOAD' });
    $('practice-controls').hidden = true;
    this.currentWorld = null;
    this.currentRecord = null;
    this.roomId = null;
    this.agenda([]);
    this.combatTarget(null);
  }
  showPracticeRound(round: PracticeRound): void {
    const singleFoe = round === 'singleFoe';
    $('practice-round').textContent = singleFoe ? 'Single-foe round' : 'Empty room';
    element('start-practice-foe', HTMLButtonElement).disabled = singleFoe;
    $('practice-controls').hidden = false;
  }
  reset(content: PlayableContent, record: DiscoveryRecord): void {
    const { world } = content;
    const practice = content.kind === 'practice';
    this.agenda([]);
    this.currentWorld = world;
    this.currentRecord = record;
    element('discovery-record', HTMLDetailsElement).open = false;
    this.refreshRecord();
    this.visited = new Set(['entrance']);
    this.revealed = new Set();
    this.roomId = null;
    const b = world.bounds;
    this.mapScale = Math.min(216 / (b.maxX - b.minX), 188 / (b.maxZ - b.minZ));
    this.mapCenter = { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 };
    $('quest-panel').hidden = practice;
    $('dungeon-menu-content').hidden = practice;
    $('leave-practice').hidden = !practice;
    $('enemy-tip').hidden = practice;
    $('world-label').textContent = practice ? 'PRACTICE ROOM' : 'SEED-BORN WORLD';
    $('map-heading').textContent = practice ? 'TRAINING GROUND' : 'THE KEEP';
    $('seed-label').textContent = practice
      ? required(world.roomById.entrance, 'Missing practice room').name
      : world.seed.toUpperCase();
    element('seed-input', HTMLInputElement).value = world.seed;
    $('altar-check').classList.remove('done');
    $('throne-check').classList.remove('done');
    $('quest-description').innerHTML =
      'Find the sleeping altar.<br />Wake what the keep has forgotten.';
    this.setHealth(100);
    for (const state of [this.toastState, this.roomState, this.damageState])
      state.send({ type: 'HIDE' });
    this.updateFeedback(performance.now());
  }
  toast(message: string, duration = 4000): void {
    $('toast').textContent = message;
    this.toastState.send({ type: 'SHOW', now: performance.now(), duration });
    $('toast').classList.add('visible');
  }
  agenda(clocks: AgendaClock[]): void {
    const serialized = JSON.stringify(clocks);
    if (serialized === this.agendaText) return;
    this.agendaText = serialized;
    const panel = $('agenda');
    panel.hidden = clocks.length === 0;
    panel.replaceChildren(
      ...clocks.map((clock) => {
        const row = document.createElement('article');
        row.dataset.objective = clock.id;
        row.classList.toggle('player-clock', clock.owner === 'You');
        const heading = document.createElement('strong');
        heading.textContent = `${clock.title} · ${clock.progress}/${clock.capacity}`;
        const owner = document.createElement('span');
        owner.textContent = `${clock.owner} · ${clock.status}`;
        const segments = document.createElement('div');
        segments.className = 'clock-segments';
        segments.setAttribute('aria-hidden', 'true');
        for (let i = 0; i < clock.capacity; i++) {
          const segment = document.createElement('i');
          segment.classList.toggle('filled', i < clock.progress);
          segments.append(segment);
        }
        const detail = document.createElement('small');
        detail.textContent = clock.detail;
        row.append(heading, owner, segments, detail);
        return row;
      }),
    );
  }
  room(room: Room, at = 0): void {
    if (!room || room.id === this.roomId) return;
    this.roomId = room.id;
    this.visited.add(room.id);
    $('room-kicker').textContent = room.kicker;
    $('room-name').textContent = room.name;
    $('room-description').textContent = room.description;
    this.record.present(landmarkDiscovery(room), at);
    $('room-title').classList.remove('faded');
    this.roomState.send({ type: 'SHOW', now: performance.now(), duration: 6500 });
    $('explored-count').textContent =
      `${String(this.visited.size).padStart(2, '0')} / ${String(this.world.rooms.length).padStart(2, '0')}`;
  }
  setHealth(health: number): void {
    $('health-fill').style.width = `${health}%`;
    $('health-text').textContent = `${Math.ceil(health)} / 100`;
  }
  combatTarget(actor: Actor | null, at = 0): void {
    const panel = $('combat-target');
    panel.hidden = !actor?.alive;
    if (actor) {
      const identity = actor.entity.get('inhabitant');
      const status = `${actor.kind.toUpperCase()} · ${Math.ceil(actor.health.current)} / ${actor.health.max} · ${actor.brain?.state ?? 'attack'}`;
      panel.textContent = identity
        ? `${identity.name}, ${identity.title}\n${status}\n${identity.description}`
        : status;
      panel.classList.toggle('named', !!identity);
      if (actor.alive && identity) this.record.present(inhabitantDiscovery(identity), at);
    }
  }
  damage(): void {
    const flash = $('damage-flash');
    flash.style.opacity = '0.55';
    this.damageState.send({ type: 'SHOW', now: performance.now(), duration: 180 });
  }
  prompt(text: string): void {
    $('interaction').hidden = !text;
    $('interaction-label').textContent = text || '';
  }
  openInspection(target: InspectionTarget, at = 0): void {
    $('inspection-title').textContent = target.title;
    $('inspection-subtitle').textContent = target.subtitle || 'CLOSER LOOK';
    $('inspection-description').textContent = target.description || 'Press E or Escape to return.';
    this.prompt('');
    this.transition({ type: 'INSPECT' });
    if (this.inspection.open && target.discovery) this.record.present(target.discovery, at);
    $('inspection-close').focus();
  }
  closeInspection() {
    this.transition({ type: 'CLOSE_INSPECTION' });
  }
  refreshRecord(): void {
    const snapshot = this.record.snapshot();
    const entries = [
      ...snapshot.discoveries.map((entry) => ({ ...entry, heading: entry.title })),
      ...snapshot.events.map((entry) => ({ ...entry, heading: entry.label })),
    ].sort((a, b) => a.order - b.order);
    $('discovery-count').textContent = String(entries.length);
    $('discovery-entries').replaceChildren(
      ...entries.map((entry) => {
        const item = document.createElement('li');
        item.dataset.discoveryId = entry.id;
        const heading = document.createElement('strong');
        heading.textContent = entry.heading;
        const text = document.createElement('p');
        text.textContent = entry.description;
        item.append(heading, text);
        return item;
      }),
    );
    $('discovery-empty').hidden = entries.length > 0;
  }
  altar() {
    $('altar-check').classList.add('done');
    this.revealed.add('throne');
    $('quest-description').innerHTML =
      'The old oath is rekindled.<br />Seek the crown on your map.';
  }
  complete(seconds: number, chests: number): void {
    $('throne-check').classList.add('done');
    $('quest-description').textContent = 'The keep remembers its king.';
    $('run-summary').textContent =
      `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s · ${this.visited.size} / ${this.world.rooms.length} chambers · ${chests} / 3 relics`;
    this.transition({ type: 'VICTORY' });
  }
  updateFeedback(now: number): void {
    for (const state of [this.toastState, this.roomState, this.damageState])
      if (state.snapshot.matches('visible')) state.send({ type: 'TICK', now });
    $('toast').classList.toggle('visible', this.toastState.snapshot.matches('visible'));
    $('room-title').classList.toggle('faded', this.roomState.snapshot.matches('hidden'));
    $('damage-flash').style.opacity = this.damageState.snapshot.matches('visible') ? '0.55' : '0';
  }
  update(player: Player, fps: number): void {
    $('fps').textContent = `${Math.round(fps)} FPS`;
    const ctx = this.context,
      world = this.world;
    ctx.clearRect(0, 0, 240, 220);
    const scale = this.mapScale,
      px = (x: number) => 120 + (x - this.mapCenter.x) * scale,
      pz = (z: number) => 110 - (z - this.mapCenter.z) * scale;
    const visible = new Set([...this.visited, ...this.revealed]);
    for (const c of world.connections)
      if (this.visited.has(c.a) || this.visited.has(c.b)) {
        visible.add(c.a);
        visible.add(c.b);
      }
    for (const c of world.connections) {
      if (!visible.has(c.a) || !visible.has(c.b)) continue;
      ctx.strokeStyle = this.visited.has(c.a) && this.visited.has(c.b) ? '#8b82634d' : '#4d56522d';
      ctx.lineWidth = 4;
      ctx.beginPath();
      c.points.forEach((p, i) => (i ? ctx.lineTo(px(p.x), pz(p.z)) : ctx.moveTo(px(p.x), pz(p.z))));
      ctx.stroke();
      if (c.door) {
        const e = world.entities.find((e) => e.id === c.door);
        if (e?.type === 'door' && !e.open) {
          ctx.fillStyle = e.locked ? '#ac78bd' : '#b0955c';
          ctx.fillRect(px(e.x) - 2, pz(e.z) - 2, 4, 4);
        }
      }
    }
    for (const r of world.rooms) {
      if (!visible.has(r.id)) continue;
      const visited = this.visited.has(r.id);
      ctx.fillStyle = visited ? '#283538' : '#182124';
      ctx.strokeStyle = visited ? (r.id === this.roomId ? '#b29b64' : '#666d60') : '#36403e';
      ctx.lineWidth = 0.8;
      const fill = ctx.fillStyle;
      ctx.beginPath();
      for (const tile of world.tiles.values()) {
        if (tile.room !== r.id) continue;
        ctx.fillStyle =
          visited && tile.surface === 'water'
            ? '#477d78'
            : visited && tile.surface === 'lava'
              ? '#a55b3c'
              : fill;
        ctx.fillRect(px(tile.x - 0.5), pz(tile.z + 0.5), scale + 0.1, scale + 0.1);
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          if (world.tiles.get(`${tile.x + dx},${tile.z + dz}`)?.room === r.id) continue;
          const x = tile.x + dx * 0.5,
            z = tile.z + dz * 0.5;
          ctx.moveTo(px(x - dz * 0.5), pz(z - dx * 0.5));
          ctx.lineTo(px(x + dz * 0.5), pz(z + dx * 0.5));
        }
      }
      ctx.stroke();
      for (const e of world.entities.filter((e) => e.room === r.id && e.type !== 'door')) {
        if (e.type === 'portrait') continue;
        if (!visited && e.type !== 'throne') continue;
        ctx.font = '12px Georgia';
        ctx.textAlign = 'center';
        ctx.fillStyle =
          e.type === 'altar' ? '#c39ae4' : e.type === 'chest' && e.open ? '#626b5f' : '#b79c62';
        ctx.fillText(
          e.type === 'altar' ? '◇' : e.type === 'throne' ? '♛' : '▪',
          px(e.x),
          pz(e.z) + 4,
        );
      }
    }
    ctx.save();
    ctx.translate(px(player.root.position.x), pz(player.root.position.z));
    ctx.rotate(player.heading);
    ctx.fillStyle = '#eee1b6';
    ctx.shadowColor = '#d6b875';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(-3, 3);
    ctx.lineTo(3, 3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#777e74';
    ctx.font = '9px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('N ↑', 232, 12);
  }
}
