import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { Components, Entity } from './ecs.ts';

type Render = Components['render'];

// Only the closed actor renderer opts in, after adding all anatomy, equipment and social props.
// The binding owns pose and equipment toggles. Other writes to member transforms, draw flags,
// bounds and parentage go through edit(); replace() takes membership from the same closed writer.
// Neither operation takes ownership of external ancestors or their writers.
export class ActorGeometry {
  private version = 0;
  private customized = false;
  private readonly observed = new WeakSet<AbstractMesh>();
  private readonly members = new Set<AbstractMesh>();
  private readonly render: Render;
  private readonly source: Render;
  private readonly root: Render['root'];
  private meshes: readonly AbstractMesh[];

  constructor(entity: Entity) {
    this.source = entity.require('render');
    const { root, meshes } = this.source;
    this.root = root;
    this.render = { root, meshes: this.membership(meshes) };
    this.meshes = this.render.meshes;
    entity.add('render', this.render);
    owners.set(this.render, this);
  }

  get revision() {
    return this.version;
  }

  get edited() {
    return this.customized;
  }

  owns(render: Render) {
    return render.root === this.root && render.meshes === this.meshes;
  }

  ownsLayout(source: Render | undefined) {
    return this.source === source || this.render === source;
  }

  includes(mesh: AbstractMesh) {
    return this.members.has(mesh);
  }

  private membership(meshes: readonly AbstractMesh[]) {
    const list = [...meshes];
    Object.freeze(list);
    this.members.clear();
    for (const mesh of list) {
      this.members.add(mesh);
      if (this.observed.has(mesh)) continue;
      this.observed.add(mesh);
      mesh.onDisposeObservable.addOnce(() => this.version++);
    }
    return list;
  }

  replace(meshes: readonly AbstractMesh[]) {
    this.customized = true;
    this.meshes = this.render.meshes = this.membership(meshes);
    this.version++;
  }

  edit(write: () => void) {
    this.customized = true;
    // Also invalidate if a writer throws after a partial edit.
    try {
      write();
    } finally {
      this.version++;
    }
  }
}

const owners = new WeakMap<Render, ActorGeometry>();
export function actorGeometry(render?: Render) {
  const owner = render && owners.get(render);
  return render && owner?.owns(render) ? owner : undefined;
}
