import { element, html as $ } from './dom.ts';
import { required } from './assert.ts';
import type { InspectionTarget } from './inspection.ts';
import type { Player } from './player.ts';
import type { Actor } from './actors.ts';
import type { Room, RoomId, World } from './worldTypes.ts';

export class UI {
  readonly map: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  readonly menu: HTMLDialogElement;
  readonly victory: HTMLDialogElement;
  readonly inspection: HTMLDialogElement;
  private toastUntil = 0;
  private roomUntil = 0;
  private currentWorld: World | null = null;
  private visited = new Set<RoomId>();
  private revealed = new Set<RoomId>();
  roomId: RoomId | null = null;
  private mapScale = 1;
  private mapCenter = { x: 0, z: 0 };
  private flashTimer: ReturnType<typeof setTimeout> | undefined;

  private get world(): World {
    return required(this.currentWorld, 'UI has not been initialized');
  }
  constructor() {
    this.map = element('map', HTMLCanvasElement);
    this.context = required(this.map.getContext('2d'), 'Minimap canvas unavailable');
    this.menu = element('menu', HTMLDialogElement);
    this.victory = element('victory', HTMLDialogElement);
    this.inspection = element('inspection', HTMLDialogElement);
  }
  reset(world: World): void {
    this.currentWorld = world;
    this.visited = new Set(['entrance']);
    this.revealed = new Set();
    this.roomId = null;
    const b = world.bounds;
    this.mapScale = Math.min(216 / (b.maxX - b.minX), 188 / (b.maxZ - b.minZ));
    this.mapCenter = { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 };
    $('seed-label').textContent = world.seed.toUpperCase();
    element('seed-input', HTMLInputElement).value = world.seed;
    $('altar-check').classList.remove('done');
    $('throne-check').classList.remove('done');
    $('quest-description').innerHTML =
      'Find the sleeping altar.<br />Wake what the keep has forgotten.';
    this.setHealth(100);
    this.victory.close();
    this.menu.close();
    this.closeInspection();
  }
  toast(message: string, duration = 4000): void {
    $('toast').textContent = message;
    this.toastUntil = performance.now() + duration;
    $('toast').classList.add('visible');
  }
  room(room: Room): void {
    if (!room || room.id === this.roomId) return;
    this.roomId = room.id;
    this.visited.add(room.id);
    $('room-kicker').textContent = room.kicker;
    $('room-name').textContent = room.name;
    $('room-description').textContent = room.description;
    $('room-title').classList.remove('faded');
    this.roomUntil = performance.now() + 6500;
    $('explored-count').textContent =
      `${String(this.visited.size).padStart(2, '0')} / ${String(this.world.rooms.length).padStart(2, '0')}`;
  }
  setHealth(health: number): void {
    $('health-fill').style.width = `${health}%`;
    $('health-text').textContent = `${Math.ceil(health)} / 100`;
  }
  combatTarget(actor: Actor | null): void {
    const panel = $('combat-target');
    panel.hidden = !actor?.alive;
    if (actor)
      panel.textContent = `${actor.kind.toUpperCase()} · ${Math.ceil(actor.health.current)} / ${actor.health.max} · ${actor.brain?.state ?? 'attack'}`;
  }
  damage(): void {
    const flash = $('damage-flash');
    flash.style.opacity = '0.55';
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => (flash.style.opacity = '0'), 180);
  }
  prompt(text: string): void {
    $('interaction').hidden = !text;
    $('interaction-label').textContent = text || '';
  }
  openInspection(target: InspectionTarget): void {
    $('inspection-title').textContent = target.title;
    $('inspection-subtitle').textContent = target.subtitle || 'CLOSER LOOK';
    $('inspection-description').textContent = target.description || 'Press E or Escape to return.';
    document.body.classList.add('inspecting');
    this.prompt('');
    this.inspection.showModal();
    $('inspection-close').focus();
  }
  closeInspection() {
    this.inspection.close();
    document.body.classList.remove('inspecting');
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
    this.victory.showModal();
  }
  update(player: Player, fps: number): void {
    if (performance.now() > this.toastUntil) $('toast').classList.remove('visible');
    if (performance.now() > this.roomUntil) $('room-title').classList.add('faded');
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
