import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Game } from './gameTypes.ts';
import type { Components } from './ecs.ts';
import { heightAt } from './world.ts';
import { readCorpseTerrain } from './corpseRendering.ts';
import { corpseHeightAt } from './corpseTerrain.ts';
import { drawnCorpseHeightAt } from './animationReviewMetrics.ts';

/** Imported only inside the DEV + ?debug boundary. This observer never samples a pose writer. */
export function createAnimationReview(
  current: () => Game,
  advance: () => void,
  clearAccumulator: () => void,
) {
  let speed = 1;
  let overlay: HTMLCanvasElement | null = null;
  let subject = 'player';
  let view: 'gameplay' | 'side' | null = null;
  let viewAlpha = -Math.PI / 4;
  let savedCamera: { alpha: number; beta: number; radius: number; target: Vector3 } | null = null;
  const identity = Matrix.Identity();
  const cutaways = new Map<Components['cutaway'], number>();

  const sample = (id: string) => {
    const g = current();
    const actor = g.combat.actor(id);
    if (!actor) throw new Error(`Unknown animation subject: ${id}`);
    const rig = actor.entity.require('rig');
    // Parent-first, actor-local matrix preparation, never a whole-scene update or animation tick.
    const nodes: [string, TransformNode][] = [
      ['root', rig.root],
      ['body', rig.body],
      ...(['left', 'right'] as const).flatMap((side, i): [string, TransformNode][] => [
        [`${side}Shoulder`, rig.arms[i]],
        [`${side}Elbow`, rig.forearms[i]],
        [`${side}Hip`, rig.legs[i]],
        [`${side}Knee`, rig.knees[i]],
        [`${side}Ankle`, rig.feet[i]],
      ]),
    ];
    if (rig.head) nodes.push(['head', rig.head]);
    for (const [name, node] of [
      ['shield', rig.shield],
      ['spear', rig.spear],
      ['javelin', rig.javelin],
    ] as const)
      if (node) nodes.push([name, node]);
    const joints = nodes.map(([name, node]) => {
      node.computeWorldMatrix(true);
      return {
        name,
        position: node.getAbsolutePivotPoint().asArray(),
        localRotation: node.rotation.asArray(),
        scale: node.scaling.asArray(),
      };
    });
    const point = (node: TransformNode, x: number, y: number, z: number) =>
      Vector3.TransformCoordinates(new Vector3(x, y, z), node.getWorldMatrix());
    const corpses = readCorpseTerrain(g.ecs);
    const feet = rig.feet.map((foot, i) => {
      const mesh = foot.getChildMeshes()[0];
      mesh.computeWorldMatrix(true);
      const box = mesh.getBoundingInfo().boundingBox;
      const local = box.minimum.add(box.maximum).scaleInPlace(0.5);
      local.y = box.minimum.y;
      const sole = Vector3.TransformCoordinates(local, mesh.getWorldMatrix());
      const floor = heightAt(g.world, sole.x, sole.z);
      const surface =
        floor === null ? null : floor + corpseHeightAt(corpses, { x: sole.x, z: sole.z, h: floor });
      const drawnSurface =
        floor === null
          ? null
          : floor + drawnCorpseHeightAt(corpses, { x: sole.x, z: sole.z, h: floor });
      const anchor = rig.footPlants[i].anchor;
      // Actual sole corners expose the old centre-contact solver's edge defects as well.
      const cornerClearances = [box.minimum.x, box.maximum.x].flatMap((x) =>
        [box.minimum.z, box.maximum.z].map((z) => {
          const p = point(mesh, x, box.minimum.y, z);
          const h = heightAt(g.world, p.x, p.z);
          return h === null
            ? null
            : {
                bounded: p.y - h - corpseHeightAt(corpses, { x: p.x, z: p.z, h }),
                drawn: p.y - h - drawnCorpseHeightAt(corpses, { x: p.x, z: p.z, h }),
              };
        }),
      );
      return {
        side: i ? 'right' : 'left',
        sole: sole.asArray(),
        surface,
        clearance: surface === null ? null : sole.y - surface,
        drawnSurface,
        drawnClearance: drawnSurface === null ? null : sole.y - drawnSurface,
        cornerClearances,
        anchor: anchor ? { ...anchor } : null,
        // A3 plants refer to the final sole centre rather than the old ankle proxy.
        anchorError: anchor ? Math.hypot(sole.x - anchor.x, sole.z - anchor.z) : null,
      };
    });
    const hands = rig.forearms.map((arm) => point(arm, 0, -0.27, 0));
    const grips: { name: string; hand: number; target: number[]; distance: number }[] = [];
    const grip = (name: string, hand: number, target: Vector3) =>
      grips.push({
        name,
        hand,
        target: target.asArray(),
        distance: Vector3.Distance(hands[hand], target),
      });
    const actions = actor.entity.require('rigPose').actions;
    const visible = (node: typeof rig.shield) =>
      node?.getChildMeshes().some((m) => m.isEnabled() && m.isVisible);
    if (visible(rig.shield)) grip('shield strap', 0, point(rig.shield!, 0, -0.12, -0.28));
    if (visible(rig.spear)) {
      grip('primary spear grip', 1, point(rig.spear!, 0, 0, -0.4));
      if (actions.mode === 'spear') grip('support spear grip', 0, point(rig.spear!, 0, 0, -0.1));
    }
    if (visible(rig.javelin)) grip('throwing grip', 1, point(rig.javelin!, 0, 0, 0));
    if (visible(rig.weapon)) {
      if (actions.mode === 'crossbow') {
        grip('crossbow trigger', 1, point(rig.weapon!, 0.18, 0, -0.12));
        grip('crossbow support', 0, point(rig.weapon!, -0.18, 0, 0.08));
      } else grip('weapon handle', 1, point(rig.weapon!, 0, 0, 0));
    }
    for (const [name, offset] of [
      ['pipe', [0.08, 0, 0]],
      ['held card', [0, 0, -0.1]],
    ] as const) {
      const mesh = g.scene.getMeshByName(`${actor.id}:${name}`);
      if (mesh?.isEnabled()) grip(name, 1, point(mesh, offset[0], offset[1], offset[2]));
    }
    if (actions.mode === 'carry') {
      const index = g.ecs
        .get('run')
        ?.get('tribute')
        ?.cargo.findIndex((e) => e.require('cargo').owner === actor.entity);
      const crate = g.scene.getTransformNodeByName(`Royal tribute crate ${index}`);
      if (crate?.isEnabled()) {
        grip('crate left', 0, point(crate, -0.325, 0.25, 0));
        grip('crate right', 1, point(crate, 0.325, 0.25, 0));
      }
    }
    return {
      id,
      kind: actor.kind,
      role: actor.entity.get('squadMember')?.role ?? null,
      step: g.steps,
      time: g.time,
      position: { ...actor.position },
      alive: actor.alive,
      enabled: rig.root.isEnabled(),
      speed: actor.motion.actualSpeed,
      stride: actor.motion.animation.stride,
      jump: actor.jump.height,
      defending: actor.defending,
      attack: actor.attack.swing ? { ...actor.attack.swing } : null,
      work: actor.entity.get('work')?.snapshot() ?? null,
      behavior: actor.brain?.state ?? null,
      corpseAge: actor.entity.get('corpse')?.age ?? null,
      squad: actor.entity.get('squadMember')?.group.get('koboldSquad')?.state ?? null,
      joints,
      feet,
      hands: hands.map((p) => p.asArray()),
      grips,
    };
  };

  const restoreCamera = () => {
    for (const [wall, scale] of cutaways) {
      wall.scale = scale;
      for (const mesh of wall.meshes) mesh.scaling.y = scale;
    }
    cutaways.clear();
    if (savedCamera) {
      const camera = current().camera;
      Object.assign(camera, {
        alpha: savedCamera.alpha,
        beta: savedCamera.beta,
        radius: savedCamera.radius,
      });
      camera.target.copyFrom(savedCamera.target);
    }
    savedCamera = null;
    view = null;
  };
  const prepare = () => {
    if (!view || current().inspection.active) return;
    const g = current(),
      actor = g.combat.actor(subject);
    if (!actor) return;
    const p = actor.position;
    g.camera.alpha = viewAlpha;
    g.camera.beta = view === 'side' ? 1.25 : 0.64;
    g.camera.radius = view === 'side' ? 6.5 : 27;
    g.camera.target.set(p.x, p.h + (view === 'side' ? 0.9 : 0.75), p.z);
    // A paused camera needs the ordinary camera-facing cutaway policy too, otherwise
    // a close-up can look straight into a full-height wall. Collision proxies are separate.
    for (const entity of g.ecs.query('cutaway')) {
      const wall = entity.require('cutaway');
      if (!cutaways.has(wall)) cutaways.set(wall, wall.scale);
      wall.scale = wall.dx * Math.cos(viewAlpha) + wall.dz * Math.sin(viewAlpha) > 0.15 ? 0.05 : 1;
      for (const mesh of wall.meshes) mesh.scaling.y = wall.scale;
    }
  };
  const draw = () => {
    if (!overlay) return;
    const g = current(),
      canvas = g.scene.getEngine().getRenderingCanvas();
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    overlay.width = Math.round(rect.width);
    overlay.height = Math.round(rect.height);
    overlay.style.left = `${rect.left}px`;
    overlay.style.top = `${rect.top}px`;
    const ctx = overlay.getContext('2d');
    if (!ctx || !g.combat.actor(subject)) return;
    const snapshot = sample(subject);
    const viewport = g.camera.viewport.toGlobal(overlay.width, overlay.height);
    const project = (p: number[]) =>
      Vector3.Project(Vector3.FromArray(p), identity, g.scene.getTransformMatrix(), viewport);
    const dot = (p: number[], label: string, color: string) => {
      const at = project(p);
      if (at.z < 0 || at.z > 1) return;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(at.x, at.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText(label, at.x + 5, at.y - 4);
    };
    ctx.font = '11px monospace';
    for (const joint of snapshot.joints) dot(joint.position, joint.name, '#c8e5ef');
    for (const foot of snapshot.feet) {
      dot(foot.sole, `${foot.side} sole`, '#ebcf79');
      if (foot.anchor) dot([foot.anchor.x, foot.anchor.h, foot.anchor.z], 'plant', '#6fe0aa');
    }
    for (const grip of snapshot.grips) {
      dot(grip.target, `${grip.distance.toFixed(3)} proxy`, '#ff8d80');
      const hand = project(snapshot.hands[grip.hand]),
        target = project(grip.target);
      ctx.strokeStyle = '#ff8d80';
      ctx.beginPath();
      ctx.moveTo(hand.x, hand.y);
      ctx.lineTo(target.x, target.y);
      ctx.stroke();
    }
  };
  const render = () => {
    prepare();
    current().scene.render();
    draw();
  };
  return {
    get speed() {
      return speed;
    },
    pause() {
      speed = 0;
      clearAccumulator();
    },
    play(rate = 1) {
      if (!Number.isFinite(rate) || rate <= 0 || rate > 1)
        throw new Error('Playback rate must be in (0, 1]');
      speed = rate;
      clearAccumulator();
    },
    step(frames = 1) {
      if (!Number.isInteger(frames) || frames < 1 || frames > 120)
        throw new Error('Step 1–120 whole frames per yielding batch');
      speed = 0;
      clearAccumulator();
      for (let i = 0; i < frames; i++) advance();
      render();
    },
    sample,
    resources() {
      const g = current();
      return {
        actors: g.combat.actors.length,
        meshes: g.scene.meshes.length,
        nodes: g.scene.transformNodes.length,
        materials: g.scene.materials.length,
        textures: g.scene.textures.length,
        entities: g.ecs.size,
      };
    },
    camera(mode: 'gameplay' | 'side' | null, id = 'player') {
      if (!mode) {
        restoreCamera();
        return;
      }
      if (!current().combat.actor(id)) throw new Error(`Unknown animation subject: ${id}`);
      if (!savedCamera) {
        const c = current().camera;
        savedCamera = { alpha: c.alpha, beta: c.beta, radius: c.radius, target: c.target.clone() };
      }
      subject = id;
      view = mode;
      // Lock the angle for the whole clip: a turn must not orbit the review camera.
      viewAlpha =
        mode === 'side' ? -0.28 - current().combat.actor(id)!.position.heading : -Math.PI / 4;
    },
    overlay(enabled: boolean, id = subject) {
      if (!current().combat.actor(id)) throw new Error(`Unknown animation subject: ${id}`);
      subject = id;
      if (!enabled) {
        overlay?.remove();
        overlay = null;
        return;
      }
      if (!overlay) {
        overlay = document.createElement('canvas');
        overlay.id = 'animation-review-overlay';
        overlay.style.cssText = 'position:fixed;pointer-events:none;z-index:100';
        document.body.append(overlay);
      }
    },
    reset() {
      restoreCamera();
      overlay?.remove();
      overlay = null;
      subject = 'player';
      clearAccumulator();
    },
    prepare,
    draw,
    render,
  };
}

export type AnimationReview = ReturnType<typeof createAnimationReview>;
