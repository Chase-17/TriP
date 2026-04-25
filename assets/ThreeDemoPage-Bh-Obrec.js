import{C as T,S as D,a as b,O as R,W as A,A as I,D as q,b as B,V as P,M as G,G as F,R as N,c as V,d as Y,e as $}from"./three.module-C3psmx4Q.js";import{H as U}from"./grid-UW31KRQy.js";import{_ as O,r as g,o as W,R as X,x as Z,b as C,c as S,d as u,t as _,h as j,e as J}from"./index-C8Jpld1K.js";const K=`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`,Q=`
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
  
  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                        -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v -   i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                           + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
                            dot(x12.zw,x12.zw)), 0.0);
    m = m*m;
    m = m*m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }
  
  // FBM (Fractal Brownian Motion)
  float fbm(vec2 p, int octaves, float persistence, float lacunarity) {
    float value = 0.0;
    float amplitude = 1.0;
    float frequency = 1.0;
    float maxValue = 0.0;
    
    for (int i = 0; i < 8; i++) {
      if (i >= octaves) break;
      value += amplitude * snoise(p * frequency);
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }
    
    return value / maxValue;
  }
`,ee=`
  ${Q}
  
  uniform vec3 baseColor;
  uniform float noiseScale;
  uniform int noiseOctaves;
  uniform float noisePersistence;
  uniform float noiseLacunarity;
  uniform float noiseContrast;
  uniform float time;
  uniform vec2 worldOffset;
  
  varying vec2 vUv;
  
  void main() {
    vec2 worldPos = vUv * 256.0 + worldOffset;
    
    float n = fbm(worldPos * noiseScale, noiseOctaves, noisePersistence, noiseLacunarity);
    n = (n + 1.0) * 0.5; // Normalize to 0-1
    
    // Apply contrast
    n = pow(n, noiseContrast);
    
    // Animated shimmer (optional)
    // n += sin(time + worldPos.x * 0.1) * 0.05;
    
    vec3 color = baseColor * n;
    gl_FragColor = vec4(color, 1.0);
  }
`;function te(x){const e=new V;for(let t=0;t<6;t++){const i=Math.PI/3*t-Math.PI/6,l=x*Math.cos(i),a=x*Math.sin(i);t===0?e.moveTo(l,a):e.lineTo(l,a)}return e.closePath(),new Y(e)}class ae{constructor(e,t={}){this.container=e,this.options={antialias:!0,alpha:!1,...t},this.hexSize=t.hexSize||30,this.hexMeshes=new Map,this.materials=new Map,this._initScene(),this._initCamera(),this._initRenderer(),this._initLighting(),this.clock=new T,this.animationId=null,this._setupResizeObserver()}_initScene(){this.scene=new D,this.scene.background=new b(1710638)}_initCamera(){const e=this.container.clientWidth,t=this.container.clientHeight;this.camera=new R(-e/2,e/2,t/2,-t/2,.1,1e3),this.camera.position.set(0,100,0),this.camera.lookAt(0,0,0),this.camera.up.set(0,0,-1)}_initRenderer(){this.renderer=new A({antialias:this.options.antialias,alpha:this.options.alpha}),this.renderer.setSize(this.container.clientWidth,this.container.clientHeight),this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,2)),this.container.innerHTML="",this.container.appendChild(this.renderer.domElement)}_initLighting(){const e=new I(16777215,.6);this.scene.add(e),this.sunLight=new q(16777215,.8),this.sunLight.position.set(50,100,50),this.scene.add(this.sunLight)}_setupResizeObserver(){this.resizeObserver=new ResizeObserver(()=>{this.resize()}),this.resizeObserver.observe(this.container)}resize(){const e=this.container.clientWidth,t=this.container.clientHeight;this.camera.left=-e/2,this.camera.right=e/2,this.camera.top=t/2,this.camera.bottom=-t/2,this.camera.updateProjectionMatrix(),this.renderer.setSize(e,t)}createNoiseMaterial(e){const i=(e.layers||[]).find(a=>a.enabled!==!1)||{},l=new b(i.color||e.color||"#888888");return new B({vertexShader:K,fragmentShader:ee,uniforms:{baseColor:{value:l},noiseScale:{value:i.noiseScale||.01},noiseOctaves:{value:i.noiseOctaves||4},noisePersistence:{value:i.noisePersistence||.5},noiseLacunarity:{value:i.noiseLacunarity||2},noiseContrast:{value:i.noiseContrast||1},time:{value:0},worldOffset:{value:new P(0,0)}}})}createColorMaterial(e){return new G({color:new b(e),roughness:.8,metalness:.1})}getMaterial(e){const t=e.id||e.color||"default";if(this.materials.has(t))return this.materials.get(t);let i;if(e.layers&&e.layers.some(l=>l.enabled!==!1&&l.type==="noise"))i=this.createNoiseMaterial(e);else{const l=e.color||e.fallbackColor||"#888888";i=this.createColorMaterial(l)}return this.materials.set(t,i),i}renderHexes(e,t){this.hexSize=(t==null?void 0:t.hexSize)||this.hexSize;const i=te(this.hexSize);this.hexGroup&&this.scene.remove(this.hexGroup),this.hexGroup=new F;const l=(a,o)=>{var p;const c=a.terrain||{},r=t.hexToPixel(a.q,a.r),m=this.getMaterial(c),n=new $(i,m);n.position.set(r.x,0,r.y),n.rotation.x=-Math.PI/2;const d=((p=c.categoryTags)==null?void 0:p.elevation)||"flat",f={submerged:-5,low:-2,flat:0,elevated:3,high:6,cliff:10};n.position.y=f[d]||0,n.userData={hex:a,terrain:c,q:a.q,r:a.r},this.hexGroup.add(n)};e instanceof Map?e.forEach((a,o)=>l(a)):Array.isArray(e)&&e.forEach((a,o)=>l(a,`${a.q},${a.r}`)),this.scene.add(this.hexGroup)}setCamera(e,t,i=1){const l=this.container.clientWidth/i,a=this.container.clientHeight/i;this.camera.left=-l/2,this.camera.right=l/2,this.camera.top=a/2,this.camera.bottom=-a/2,this.camera.position.x=e,this.camera.position.z=t,this.camera.updateProjectionMatrix()}animate(){this.animationId=requestAnimationFrame(()=>this.animate());const e=this.clock.getElapsedTime();this.materials.forEach(t=>{t.uniforms&&t.uniforms.time&&(t.uniforms.time.value=e)}),this.renderer.render(this.scene,this.camera)}start(){this.animationId||(this.clock.start(),this.animate())}stop(){this.animationId&&(cancelAnimationFrame(this.animationId),this.animationId=null)}render(){this.renderer.render(this.scene,this.camera)}dispose(){var e;this.stop(),(e=this.resizeObserver)==null||e.disconnect(),this.scene.traverse(t=>{t.geometry&&t.geometry.dispose(),t.material&&(Array.isArray(t.material)?t.material.forEach(i=>i.dispose()):t.material.dispose())}),this.materials.clear(),this.renderer.dispose(),this.renderer.domElement.parentNode&&this.renderer.domElement.parentNode.removeChild(this.renderer.domElement)}getHexAtPoint(e,t){var r;const i=this.renderer.domElement.getBoundingClientRect(),l=(e-i.left)/i.width*2-1,a=-((t-i.top)/i.height)*2+1,o=new N;o.setFromCamera(new P(l,a),this.camera);const c=o.intersectObjects(((r=this.hexGroup)==null?void 0:r.children)||[]);return c.length>0?c[0].object.userData:null}}const ie={class:"three-hex-demo"},se={class:"info-overlay"},ne={class:"zoom-info"},oe={key:0,class:"hover-info"},re={__name:"ThreeHexDemo",props:{hexes:{type:[Map,Array],default:()=>new Map},hexSize:{type:Number,default:30},getTerrainById:{type:Function,default:()=>null}},emits:["hex-hover","hex-click"],setup(x,{expose:e,emit:t}){const i=x,l=t,a=g(null);let o=null,c=null;const r=g(0),m=g(0),n=g(1),d=g(null);let f=!1,p=0,M=0;W(()=>{if(!a.value)return;c=new U({hexSize:i.hexSize}),o=new ae(a.value,{hexSize:i.hexSize,antialias:!0});const s=z();o.renderHexes(s,c),o.start(),a.value.addEventListener("mousedown",H),a.value.addEventListener("mousemove",L),a.value.addEventListener("mouseup",y),a.value.addEventListener("mouseleave",y),a.value.addEventListener("wheel",E),a.value.addEventListener("click",k)}),X(()=>{o&&o.dispose(),a.value&&(a.value.removeEventListener("mousedown",H),a.value.removeEventListener("mousemove",L),a.value.removeEventListener("mouseup",y),a.value.removeEventListener("mouseleave",y),a.value.removeEventListener("wheel",E),a.value.removeEventListener("click",k))});function z(){const s=[],h=v=>{let w=v.terrain;typeof w=="string"&&i.getTerrainById&&(w=i.getTerrainById(w)||{color:"#888888"}),s.push({q:v.q,r:v.r,terrain:w||{color:"#888888"}})};return i.hexes instanceof Map?i.hexes.forEach(v=>h(v)):Array.isArray(i.hexes)&&i.hexes.forEach(v=>h(v)),s}Z(()=>i.hexes,()=>{if(o&&c){const s=z();o.renderHexes(s,c)}},{deep:!0});function H(s){(s.button===0||s.button===1)&&(f=!0,p=s.clientX,M=s.clientY)}function L(s){if(f){const h=s.clientX-p,v=s.clientY-M;r.value-=h/n.value,m.value-=v/n.value,o.setCamera(r.value,m.value,n.value),p=s.clientX,M=s.clientY}else{const h=o.getHexAtPoint(s.clientX,s.clientY);h?(d.value={q:h.q,r:h.r},l("hex-hover",h)):d.value=null}}function y(){f=!1}function E(s){s.preventDefault();const h=s.deltaY>0?.9:1.1;n.value=Math.max(.1,Math.min(5,n.value*h)),o.setCamera(r.value,m.value,n.value)}function k(s){const h=o.getHexAtPoint(s.clientX,s.clientY);h&&l("hex-click",h)}return e({getRenderer:()=>o,setCamera:(s,h,v)=>{r.value=s,m.value=h,n.value=v,o==null||o.setCamera(s,h,v)}}),(s,h)=>(C(),S("div",ie,[u("div",{ref_key:"containerRef",ref:a,class:"renderer-container"},null,512),u("div",se,[u("div",ne,"Zoom: "+_(n.value.toFixed(2)),1),d.value?(C(),S("div",oe," Hex: "+_(d.value.q)+", "+_(d.value.r),1)):j("",!0)]),h[0]||(h[0]=u("div",{class:"controls"},[u("span",{class:"control-hint"},"🖱️ Drag to pan | Scroll to zoom")],-1))]))}},le=O(re,[["__scopeId","data-v-8ac48e4a"]]),ce={class:"three-demo-page"},he={class:"demo-container"},ue={__name:"ThreeDemoPage",setup(x){const e=g(new Map),t={grass:{id:"grass",name:"Трава",color:"#4a7c59",categoryTags:{elevation:"flat"},layers:[{type:"noise",enabled:!0,color:"#5a8c69",noiseScale:.02,noiseOctaves:4}]},water:{id:"water",name:"Вода",color:"#2563eb",categoryTags:{elevation:"submerged"},layers:[{type:"noise",enabled:!0,color:"#3b82f6",noiseScale:.03,noiseOctaves:3}]},mountain:{id:"mountain",name:"Горы",color:"#6b7280",categoryTags:{elevation:"high"},layers:[{type:"noise",enabled:!0,color:"#9ca3af",noiseScale:.05,noiseOctaves:5}]},sand:{id:"sand",name:"Песок",color:"#d4a574",categoryTags:{elevation:"low"},layers:[{type:"noise",enabled:!0,color:"#e4b584",noiseScale:.04,noiseOctaves:2}]},forest:{id:"forest",name:"Лес",color:"#2d5a27",categoryTags:{elevation:"elevated"},layers:[{type:"noise",enabled:!0,color:"#3d6a37",noiseScale:.025,noiseOctaves:4}]}};function i(){const c=new Map,r=8;for(let m=-r;m<=r;m++)for(let n=-r;n<=r;n++)if(Math.abs(m+n)<=r){let d="grass";const f=Math.sqrt(m*m+n*n+m*n);f<2?d="water":f>6?d=Math.random()>.5?"mountain":"forest":m>3&&n<0?d="sand":Math.random()>.8&&(d="forest"),c.set(`${m},${n}`,{q:m,r:n,terrain:t[d]})}e.value=c}i();const l=c=>t[c]||null,a=c=>{console.log("Clicked hex:",c)},o=c=>{};return(c,r)=>(C(),S("div",ce,[u("header",{class:"demo-header"},[r[0]||(r[0]=u("h1",null,"🎮 Three.js Hex Map Demo",-1)),r[1]||(r[1]=u("p",null,"3D рендер с ортографической камерой — выглядит как 2D!",-1)),u("button",{onClick:i,class:"regen-btn"},"🔄 Regenerate Map")]),u("div",he,[J(le,{hexes:e.value,"hex-size":35,"get-terrain-by-id":l,onHexClick:a,onHexHover:o},null,8,["hexes"])]),r[2]||(r[2]=u("div",{class:"features"},[u("h3",null,"Что демонстрируется:"),u("ul",null,[u("li",null,"✅ Ортографическая камера (2D вид)"),u("li",null,"✅ GPU шейдеры для генерации шума"),u("li",null,"✅ Высоты гексов (elevation)"),u("li",null,"✅ Pan/Zoom управление"),u("li",null,"✅ Hover detection через Raycast"),u("li",null,"✅ Освещение (ambient + directional)")])],-1))]))}},fe=O(ue,[["__scopeId","data-v-2e0c4803"]]);export{fe as default};
