import { CustomMaterial } from '@babylonjs/materials/custom/customMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { part } from './geometry.ts';
import type { Scene } from '@babylonjs/core/scene';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import type { Materials, MaterialName } from './materials.ts';
import type { Triple, World } from './worldTypes.ts';
import type { Portrait } from './renderTypes.ts';

const artwork = `
varying vec2 vRoyalUV;
varying vec4 vRoyalTraits;
varying float vRoyalDetail;
float royalHash(float n){return fract(sin(n*127.1+vRoyalTraits.x*1.31)*43758.5453);}
bool rect(vec2 p,vec2 a,vec2 b){return all(greaterThanEqual(p,a))&&all(lessThanEqual(p,b));}
vec3 royalPortrait(vec2 uv){
  float detail=max(1.,vRoyalDetail);
  vec2 finePixel=floor(clamp(vec2(uv.x,1.-uv.y),0.,.9999)*vec2(32.,40.)*detail);
  vec2 p=finePixel/detail,cell=floor(p);
  float scheme=vRoyalTraits.y;
  float hairStyle=mod(vRoyalTraits.z,4.);
  float beard=mod(floor(vRoyalTraits.z/4.),3.);
  float crown=floor(vRoyalTraits.z/12.);
  vec3 ink=vec3(.065,.06,.075),gold=vec3(.83,.61,.25),ivory=vec3(.86,.80,.63);
  vec3 robe=vec3(.49,.12,.15);
  if(scheme>0.5)robe=vec3(.12,.34,.39);
  if(scheme>1.5)robe=vec3(.24,.34,.18);
  if(scheme>2.5)robe=vec3(.38,.19,.43);
  if(scheme>3.5)robe=vec3(.25,.29,.51);
  if(scheme>4.5)robe=vec3(.58,.32,.16);
  vec3 skin=vec3(.79,.57,.40);
  if(vRoyalTraits.w<1.)skin=vec3(.91,.74,.56);
  else if(vRoyalTraits.w<2.)skin=vec3(.61,.38,.24);
  else if(vRoyalTraits.w<3.)skin=vec3(.42,.25,.19);
  else if(vRoyalTraits.w<4.)skin=vec3(.82,.64,.46);
  else if(vRoyalTraits.w<5.)skin=vec3(.69,.48,.36);
  else skin=vec3(.89,.80,.68);
  vec3 hair=vec3(.12,.10,.10);
  if(hairStyle>0.5)hair=vec3(.43,.24,.12);
  if(hairStyle>1.5)hair=vec3(.66,.62,.52);
  if(hairStyle>2.5)hair=vec3(.22,.24,.25);
  float cx=15.+floor(royalHash(2.)*3.),dx=p.x-cx;
  float pixelDx=cell.x-cx;
  float fw=5.+floor(royalHash(3.)*2.);
  vec3 col=mix(robe*.29,vec3(.12,.15,.17),.35);
  float heraldry=floor(royalHash(7.)*3.);
  if(heraldry<1.&&mod(floor(p.x/8.),2.)<1.)col*=1.35;
  if(heraldry>=1.&&heraldry<2.&&abs(p.x+p.y*.55-26.)<4.)col=robe*.5;
  if(heraldry>=2.&&mod(cell.x,8.)==3.&&mod(cell.y,8.)==3.)col=gold*.48;
  // A stepped heraldic arch behind the monarch.
  float archWidth=p.y<7.?9.-floor((7.-p.y)/2.):12.;
  if(abs(pixelDx)==archWidth&&p.y<31.)col=gold*.35;
  // Broad cloak and angular shoulders.
  float shoulder=8.+(detail>1.?max(0.,p.y-28.)*.45:floor(max(0.,p.y-28.)*.45));
  if(p.y>=27.&&abs(dx)<=shoulder+1.)col=ink;
  if(p.y>=28.&&abs(dx)<=shoulder)col=robe*(dx<0.?.65:1.);
  if(p.y>=31.&&abs(dx)<2.)col=gold*.75;
  if(p.y>=33.&&mod(cell.y,4.)==1.&&abs(dx)<1.)col=ivory;
  if(detail>1.&&p.y>=32.&&abs(dx)<=shoulder){
    if(abs(abs(dx)-4.5)<.25&&mod(floor(p.y*2.),5.)<2.)col=gold*.7;
    if(abs(dx)<1.5&&mod(floor(p.y*4.),12.)==1.)col=mix(col,ivory,.3);
    col*=.94+.06*royalHash(finePixel.x+finePixel.y*71.);
  }
  // Hair silhouette, ears, neck, and a pixel-cut oval face.
  vec2 head=vec2(dx/(fw+1.),(p.y-20.)/9.);
  if(dot(head,head)<1.15)col=ink;
  if(dot(head,head)<1.)col=hair;
  if(hairStyle>1.5&&p.y>=19.&&p.y<=30.&&abs(dx)<=fw+1.)col=hair*(dx<0.?.65:1.);
  if(rect(p,vec2(cx-2.,24.),vec2(cx+2.,30.)))col=skin*.72;
  if(abs(pixelDx)==fw&&p.y>=19.&&p.y<=22.)col=skin*.75;
  vec2 face=vec2(dx/fw,(p.y-20.)/7.5);
  if(dot(face,face)<1.&&p.y>=14.){
    col=skin*(dx<0.?.72:1.);
    if(dx>=2.&&p.y<=20.)col=mix(col,ivory,.16);
    if(cell.y==18.&&abs(pixelDx)>=2.&&abs(pixelDx)<=3.)col=hair;
    if(cell.y==20.&&abs(pixelDx)>=2.&&abs(pixelDx)<=3.)col=ink;
    if(cell.y==20.&&pixelDx==3.)col=ivory*.8;
    if(p.y>=21.&&p.y<=23.&&pixelDx==0.)col=skin*.53;
    if(cell.y==25.&&abs(pixelDx)<=1.)col=vec3(.35,.16,.15);
    if(detail>1.){
      // Iris, catchlight, nose bridge, lower lip, and small cheek highlights.
      if(p.y>=20.25&&p.y<20.75&&(rect(p,vec2(cx-2.75,20.),vec2(cx-1.25,21.))||rect(p,vec2(cx+2.25,20.),vec2(cx+3.75,21.)))){
        col=ivory*.78;
        if(abs(dx+2.)<.4||abs(dx-3.)<.4)col=mix(vec3(.14,.23,.2),vec3(.16,.2,.32),royalHash(9.));
        if(abs(dx+1.75)<.13||abs(dx-3.25)<.13)col=ivory;
      }
      if(p.y>21.&&p.y<23.&&dx>.25&&dx<.75)col=skin*1.08;
      if(p.y>25.5&&p.y<26.&&abs(dx)<1.)col=mix(skin,vec3(.55,.28,.24),.45);
      if(p.y>21.5&&p.y<23.&&abs(dx)>3.&&abs(dx)<fw-.5)col=mix(col,skin*.85,.35);
    }
  }
  bool beardArea=beard>.5&&p.y>=24.&&p.y<=29.&&abs(dx)<=max(0.,4.-(detail>1.?(p.y-24.)*.65:floor((p.y-24.)*.65)));
  if(beardArea)col=hair*(dx<0.?.7:1.);
  if(beard>1.5&&cell.y==23.&&abs(dx)<=3.)col=hair;
  bool hairArea=(dot(head,head)<1.&&dot(face,face)>=1.)||(hairStyle>1.5&&abs(dx)>fw&&abs(dx)<=fw+1.);
  if(detail>1.&&(hairArea||beardArea)&&p.y>=15.&&p.y<28.){
    float strand=mod(floor(p.x*4.+sin(p.y*.6)),4.);
    col*=strand<1.?1.2:.92;
  }
  // Ermine collar and a jewel at the throat.
  if(p.y>=28.&&p.y<=30.&&abs(dx)>=3.&&abs(dx)<=8.)col=ivory;
  if(cell.y==30.&&mod(abs(pixelDx),3.)==1.&&abs(dx)<=8.&&abs(dx)>=3.)col=ink;
  if(detail>1.&&p.y>=28.&&p.y<=30.&&abs(dx)>=3.&&abs(dx)<=8.&&royalHash(finePixel.x+finePixel.y*17.)>.97)col=ink;
  if(p.y>=29.&&p.y<=31.&&abs(dx)<=1.)col=gold;
  if(cell.y==30.&&pixelDx==0.)col=robe*1.5;
  // Three crown silhouettes, with stepped points and inset jewels.
  bool band=cell.y>=12.&&cell.y<=14.&&abs(dx)<=fw+1.;
  bool points=p.y>=8.&&p.y<12.&&(abs(dx)<=1.||abs(abs(dx)-4.)<1.);
  if(crown>0.5)points=p.y>=9.&&p.y<12.&&(mod(abs(dx),3.)<1.&&abs(dx)<=fw);
  if(crown>1.5)points=(p.y>=7.&&p.y<12.&&abs(dx)<=2.)||(p.y>=10.&&p.y<12.&&abs(dx)<=fw);
  if(band||points)col=gold*(dx<0.?.73:1.);
  if(cell.y==13.&&mod(abs(pixelDx),4.)==0.&&abs(dx)<=fw)col=robe*1.4;
  if(cell.y==12.&&abs(dx)<=fw+1.)col=ivory*.95;
  if(crown>1.5&&cell.y==6.&&abs(dx)<=1.)col=gold;
  if(detail>1.&&(band||points)){
    if(p.y>=13.25&&p.y<13.5&&mod(abs(dx),4.)<.5)col=ivory;
    if(p.y>=14.5&&p.y<14.75&&abs(dx)<=fw)col=gold*.55;
  }
  // A tiny dynastic seal, canvas wear, and an ink border.
  if(abs(p.x-27.)+abs(p.y-35.)<=2.)col=gold*.75;
  if(royalHash(cell.x+cell.y*37.)>.994)col*=.62;
  if(detail>1.)col*=.97+.03*royalHash(finePixel.x+finePixel.y*113.);
  if(p.x<1.||p.x>30.||p.y<1.||p.y>38.)col=ink;
  return col;
}`;

export function buildPortraits(
  scene: Scene,
  world: World,
  materials: Materials,
  shadow: ShadowGenerator,
): Portrait[] {
  const material = new CustomMaterial('royal pixel portraits', scene);
  material.diffuseColor = Color3.White();
  material.specularColor = Color3.Black();
  material.emissiveColor = new Color3(0.035, 0.025, 0.018);
  material.maxSimultaneousLights = 5;
  material.AddAttribute('royalTraits');
  material.AddAttribute('royalDetail');
  material.Vertex_Definitions(
    'attribute vec4 royalTraits; attribute float royalDetail; varying vec4 vRoyalTraits; varying float vRoyalDetail; varying vec2 vRoyalUV;',
  );
  material.Vertex_MainEnd(
    'vRoyalTraits=royalTraits; vRoyalDetail=royalDetail; vRoyalUV=positionUpdated.xy/vec2(1.6,2.0)+0.5;',
  );
  material.Fragment_Definitions(artwork);
  material.Fragment_Custom_Diffuse('diffuseColor=royalPortrait(vRoyalUV);');
  const portraits: Portrait[] = [];
  for (const entity of world.entities.filter((e) => e.type === 'portrait')) {
    const root = new TransformNode(entity.id, scene);
    root.position.set(entity.x, entity.h, entity.z);
    root.rotation.y = entity.rotation;
    const frame = (mat: MaterialName, name: string, size: Triple, pos: Triple) =>
      part(scene, materials[mat], name, size, pos, root, shadow);
    frame('wood', 'portrait backing', [1.94, 2.34, 0.13], [0, 1.8, 0]);
    for (const x of [-0.91, 0.91])
      frame('gold', 'carved portrait upright', [0.14, 2.34, 0.2], [x, 1.8, -0.06]);
    for (const y of [0.7, 2.9])
      frame('gold', 'portrait frame rail', [1.94, 0.14, 0.2], [0, y, -0.06]);
    for (const x of [-0.91, 0.91])
      for (const y of [0.7, 2.9]) frame('bone', 'frame corner', [0.14, 0.14, 0.05], [x, y, -0.18]);
    frame('dark', 'portrait nameplate', [1.1, 0.17, 0.1], [0, 0.49, -0.02]);
    frame('gold', 'dynastic seal', [0.13, 0.13, 0.04], [0, 0.49, -0.09]);
    const panel = MeshBuilder.CreatePlane(
      'procedural royal painting',
      { width: 1.6, height: 2 },
      scene,
    );
    panel.parent = root;
    panel.position.set(0, 1.8, -0.08);
    panel.material = material;
    panel.receiveShadows = true;
    panel.isPickable = false;
    const r = entity.royal,
      traits = [r.artSeed, r.palette, r.hair + r.beard * 4 + r.crown * 12, r.skin];
    panel.setVerticesData('royalTraits', Array.from({ length: 4 }, () => traits).flat(), false, 4);
    panel.setVerticesData('royalDetail', [1, 1, 1, 1], true, 1);
    entity.panel = panel;
    const portrait = {
      root,
      panel,
      entity,
      dx: entity.wallDirection[0],
      dz: entity.wallDirection[1],
      inspected: false,
      detailScale: 1,
    };
    const setDetail = (scale: number) => {
      portrait.detailScale = scale;
      panel.updateVerticesData('royalDetail', [scale, scale, scale, scale]);
    };
    entity.inspection = {
      id: entity.id,
      title: r.title,
      subtitle: `HOUSE ${r.house.toUpperCase()} · YEAR ${r.year}`,
      description: `${r.description ? `${r.description} ` : ''}128 × 160 procedural pixels · Press E or Escape to return.`,
      getView: () => ({
        focus: new Vector3(
          entity.x - portrait.dx * 0.08,
          entity.h + 1.72,
          entity.z - portrait.dz * 0.08,
        ),
        direction: new Vector3(-portrait.dx, 0, -portrait.dz),
        distance: 2.35,
        width: 2.15,
        height: 2.8,
      }),
      onEnter: () => {
        portrait.inspected = true;
        root.setEnabled(true);
        setDetail(4);
      },
      onExit: () => {
        portrait.inspected = false;
        setDetail(1);
      },
    };
    portraits.push(portrait);
  }
  return portraits;
}
