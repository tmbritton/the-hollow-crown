import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { CustomMaterial } from '@babylonjs/materials/custom/customMaterial';
import type { Scene } from '@babylonjs/core/scene';

export type Materials = ReturnType<typeof createMaterials>;
export type MaterialName = keyof Materials;

export const color = (hex: string): Color3 => Color3.FromHexString(hex);
const noise = `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float noise2(vec2 p) {
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);
}
// Cover roughly one pixel at a threshold, independent of camera zoom.
float aaStep(float edge, float value) {
  float width=max(fwidth(value)*0.75,0.0001);
  return smoothstep(edge-width,edge+width,value);
}`;

export function createMaterials(scene: Scene) {
  const palette = {
    stone: '#657575',
    trim: '#a29a79',
    dark: '#272e31',
    floor: '#65716d',
    wood: '#695039',
    iron: '#353f43',
    gold: '#bf9a51',
    bone: '#c0bb9d',
    cloth: '#883d40',
    moss: '#3d5c4c',
    skin: '#c6a47e',
    blue: '#598488',
    brick: '#925e47',
    bread: '#d2a15c',
    scales: '#638468',
    meat: '#984c51',
  };
  const surfaces = Object.fromEntries(
    Object.entries(palette).map(([name, hex]) => {
      const mat = new CustomMaterial(name, scene);
      mat.diffuseColor = color(hex);
      mat.specularColor = Color3.Black();
      mat.maxSimultaneousLights = 5;
      mat.Fragment_Definitions(noise);
      const pattern =
        name === 'wood'
          ? `
      float grain = noise2(vec2(vPositionW.x*13.0+vPositionW.z*3.0,vPositionW.y*1.5));
      diffuseColor *= 0.72 + step(0.43,grain)*0.28;
    `
          : name === 'floor'
            ? `
      vec2 p=vPositionW.xz+0.5;
      float tile=hash(floor(p));
      vec2 edge=abs(fract(p)-0.5);
      float seam=step(0.478,max(edge.x,edge.y));
      float inset=step(0.44,max(edge.x,edge.y))*(1.0-seam);
      diffuseColor *= (0.83+tile*0.25)*(1.0-seam*0.65)+inset*0.07;
      float scratch=step(0.987,noise2(floor(p*25.0)))*step(0.55,tile);
      diffuseColor *= 1.0-scratch*0.3;
    `
            : `
      vec3 p=floor(vPositionW*5.0);
      float fleck=hash(p.xz+p.y*0.17);
      float blocks=hash(floor(vPositionW.xz*1.2)+floor(vPositionW.y*2.0));
      diffuseColor *= 0.91+blocks*0.16;
      diffuseColor *= 1.0-step(0.977,fleck)*0.24;
    `;
      mat.Fragment_Custom_Diffuse(pattern);
      mat.Fragment_Before_Fog(`
      float luminance=max(0.05,dot(diffuseBase,vec3(0.299,0.587,0.114)));
      float lightWidth=max(0.03,fwidth(luminance)*0.75);
      float band=0.09+0.34*smoothstep(0.29-lightWidth,0.29+lightWidth,luminance)
        +0.39*smoothstep(0.67-lightWidth,0.67+lightWidth,luminance)+0.18*aaStep(1.0,luminance);
      color.rgb *= mix(1.0,band/luminance,0.72);
      color.rgb=mix(vec3(0.018,0.026,0.035),color.rgb,0.95);
    `);
      return [name, mat];
    }),
  ) as Record<keyof typeof palette, CustomMaterial>;
  function emissive(name: string, hex: string): StandardMaterial {
    const mat = new StandardMaterial(name, scene);
    mat.diffuseColor = Color3.Black();
    mat.emissiveColor = color(hex);
    mat.disableLighting = true;
    return mat;
  }
  const ember = emissive('ember', '#ffae51'),
    rune = emissive('rune', '#bd88f5'),
    eyes = emissive('eyes', '#f8df91');

  const vertex = `precision highp float;
    attribute vec3 position; attribute vec3 normal; attribute vec2 uv;
    uniform mat4 world; uniform mat4 worldViewProjection;
    varying vec3 pos; varying vec2 vUV;
    void main(){ pos=(world*vec4(position,1.)).xyz; vUV=uv; gl_Position=worldViewProjection*vec4(position,1.); }
  `;
  function effect(name: string, code: string): ShaderMaterial {
    const mat = new ShaderMaterial(
      name,
      scene,
      {
        vertexSource: vertex,
        fragmentSource: `precision highp float;
      uniform float time; uniform vec3 center; uniform vec3 bounds; varying vec3 pos; varying vec2 vUV;
      ${noise}
      void main(){ ${code} }
    `,
      },
      {
        attributes: ['position', 'normal', 'uv'],
        uniforms: ['world', 'worldViewProjection', 'time', 'center', 'bounds'],
      },
    );
    mat.setFloat('time', 0);
    mat.setVector3('center', Vector3.Zero());
    mat.setVector3('bounds', new Vector3(4.5, 4.5, 0));
    return mat;
  }
  const water = effect(
    'water',
    `
    vec2 p=pos.xz; float n=noise2(p*1.7+time*0.12);
    float wave=sin(p.x*4.0+p.y*2.0+n*6.0+time*1.4);
    float crest=smoothstep(0.94,1.0,wave);
    vec2 d=abs(p-center.xz);
    float shore=max(smoothstep(bounds.x-.55,bounds.x,d.x),smoothstep(bounds.y-.55,bounds.y,d.y));
    vec3 c=mix(vec3(.025,.13,.14),vec3(.06,.29,.29),aaStep(.48,n));
    c+=vec3(.12,.29,.25)*crest*.65;
    c=mix(c,vec3(.28,.49,.40),shore*(.35+.25*sin(time*2.+n*8.)));
    gl_FragColor=vec4(c,1.);
  `,
  );
  const lava = effect(
    'lava',
    `
    vec2 p=pos.xz*1.7;
    p+=vec2(noise2(p*.7+time*.08),noise2(p*.7-time*.09))*.6;
    vec2 g=floor(p), f=fract(p); float first=8., second=8.;
    for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){
      vec2 o=vec2(float(x),float(y)); vec2 r=o+vec2(hash(g+o),hash(g+o+9.))-f;
      float d=dot(r,r); if(d<first){second=first;first=d;}else{second=min(second,d);}
    }
    float crack=1.-smoothstep(.025,.12,second-first);
    float pulse=.83+.17*sin(time*1.6+pos.x*.8);
    vec3 crust=mix(vec3(.105,.035,.028),vec3(.23,.055,.025),noise2(pos.xz*3.));
    vec3 c=mix(crust,vec3(1.,.27,.025)*pulse,crack);
    c+=vec3(.5,.16,.01)*pow(crack,6.);
    gl_FragColor=vec4(c,1.);
  `,
  );
  const flameCode = `
    vec2 p=vUV; float sway=sin(time*5.+pos.x*4.+p.y*5.)*.08*p.y;
    float width=(1.-p.y)*.42;
    float edge=abs(p.x-.5+sway);
    float flicker=noise2(vec2(p.x*7.,p.y*5.-time*3.))*.12;
    if(edge>width-flicker || p.y<.02)discard;
    float core=aaStep(0.,(width-flicker)*.45-edge);
    vec3 c=mix(vec3(1.,.25,.035),vec3(1.,.83,.36),core);
    if(center.x>.5)c=mix(vec3(.45,.15,.85),vec3(.85,.6,1.),core);
    gl_FragColor=vec4(c,1.);
  `;
  const flame = effect('flame', flameCode);
  flame.backFaceCulling = false;
  const violetFlame = effect('violetFlame', flameCode);
  violetFlame.backFaceCulling = false;
  violetFlame.setVector3('center', new Vector3(1, 0, 0));
  const magic = effect(
    'magic',
    `
    vec2 p=(vUV-.5)*2.; float r=length(p);
    float ring=1.-smoothstep(.025,.055,abs(r-.78));
    ring+=1.-smoothstep(.015,.035,abs(r-.94));
    float a=atan(p.y,p.x)+time*.08;
    float ticks=step(.86,cos(a*12.))*step(.62,r)*step(r,.88);
    float star=1.-smoothstep(.015,.04,abs(abs(p.x)+abs(p.y)-.65));
    float line=max(max(ring,ticks),star);
    if(line<.1)discard;
    gl_FragColor=vec4(vec3(.53,.28,.85)*(1.+.2*sin(time*2.))+line*.14,1.);
  `,
  );
  magic.backFaceCulling = false;
  return { ...surfaces, ember, rune, eyes, water, lava, flame, violetFlame, magic };
}
