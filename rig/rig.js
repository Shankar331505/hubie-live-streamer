// Hubie 2D skeletal puppet. Canvas2D, no dependencies. Design space = 1376x768 (matches assets/rig/manifest.json).
(function(){
const ASSET='../assets/rig/';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const rad=d=>d*Math.PI/180;

// critically-damped spring scalar
class Spring{constructor(v=0,k=60,z=1){this.v=v;this.t=v;this.vel=0;this.k=k;this.z=z;}
  step(dt){const c=2*Math.sqrt(this.k)*this.z;const a=this.k*(this.t-this.v)-c*this.vel;this.vel+=a*dt;this.v+=this.vel*dt;return this.v;}}

class Hubie{
  constructor(canvas,opts={}){
    this.c=canvas;this.ctx=canvas.getContext('2d');this.opts=opts;
    this.img={};this.man=null;this.ready=false;
    this.t=0;this.last=performance.now();
    const S=(v,k,z)=>new Spring(v,k,z);
    // joint springs (degrees / design px)
    this.j={
      bodyX:S(0,25,.9),bodyY:S(0,25,.9),lean:S(0,30,.8),
      headRot:S(0,45,.75),headX:S(0,40,.8),headY:S(0,40,.8),headScale:S(1,40,.8),
      hatLift:S(0,70,.6),hatRot:S(0,70,.6),
      shL:S(0,50,.7),elL:S(0,60,.7),wrL:S(0,70,.7),
      shR:S(0,50,.7),elR:S(0,60,.7),wrR:S(0,70,.7),
    };
    this.hand={L:'relaxed',R:'relaxed'};
    this.eyes='open';this.mouth='closed';this.mood='smug';
    this.level=0;            // 0..1 voice amplitude (set from audio)
    this.blinkT=2+Math.random()*3;this.blinking=0;
    this.gazeUntil=0;this.gaze='open';
    this.queue=[];this.cur=null;
    this.noise=[Math.random()*100,Math.random()*100,Math.random()*100];
    this.ik={L:null,R:null};  // {x,y,w} while pointing
    this.mouthHold=0;this.mouthState='closed';
    this.load();
  }
  async load(){
    const man=await (await fetch(ASSET+'manifest.json')).json();this.man=man;
    const names=Object.keys(man.layers).filter(k=>man.layers[k].file);
    await Promise.all(names.map(n=>new Promise(res=>{const i=new Image();i.onload=res;i.onerror=res;i.src=ASSET+man.layers[n].file;this.img[n]=i;})));
    this.g=man.layers.arm_geom;this.ready=true;
    this.restAng={};
    for(const s of ['L','R']){
      const S=this.g['shoulder'+s],E=this.g['elbow'+s],W=this.g['wrist'+s];
      this.restAng[s]={up:Math.atan2(E[1]-S[1],E[0]-S[0]),fore:Math.atan2(W[1]-E[1],W[0]-E[0]),
        l1:Math.hypot(E[0]-S[0],E[1]-S[1]),l2:Math.hypot(W[0]-E[0],W[1]-E[1])};
    }
    requestAnimationFrame(t=>this.loop(t));
  }
  has(n){return this.img[n]&&this.img[n].naturalWidth>0;}
  // ---------- drawing ----------
  draw(n,ctx=this.ctx){const e=this.man.layers[n];if(!e||!this.has(n))return;ctx.drawImage(this.img[n],e.x,e.y,e.w,e.h);}
  rot(ctx,px,py,deg){ctx.translate(px,py);ctx.rotate(rad(deg));ctx.translate(-px,-py);}
  render(){
    const ctx=this.ctx,c=this.c;ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,c.width,c.height);
    const sx=c.width/1376,sy=c.height/768;ctx.setTransform(sx,0,0,sy,0,0);
    const j=this.j;
    ctx.save();
    // body: sway + breathing about the feet
    const breath=Math.sin(this.t*1.9)*0.006+Math.sin(this.t*0.7)*0.003;
    ctx.translate(690+j.bodyX.v,735+j.bodyY.v);ctx.scale(1-breath*.6,1+breath);ctx.rotate(rad(j.lean.v)*0.35);ctx.translate(-690,-735);
    this.draw('torso');
    // head group
    ctx.save();
    const nk=this.man.pivots.neck;
    ctx.translate(j.headX.v,j.headY.v);this.rot(ctx,nk[0],nk[1],j.headRot.v);
    ctx.translate(nk[0],nk[1]);ctx.scale(j.headScale.v,j.headScale.v);ctx.translate(-nk[0],-nk[1]);
    this.draw('head');
    this.draw(this.mouthLayer());
    this.draw(this.eyeLayer('L'));this.draw(this.eyeLayer('R'));
    ctx.save();const hp=this.man.pivots.hat;ctx.translate(0,-j.hatLift.v);this.rot(ctx,hp[0],hp[1]+60,j.hatRot.v);this.draw('hat');ctx.restore();
    ctx.restore();
    this.draw('bowtie');
    // arms
    for(const s of ['R','L']) this.drawArm(ctx,s);
    ctx.restore();
  }
  drawArm(ctx,s){
    const g=this.g,j=this.j,S=g['shoulder'+s],E=g['elbow'+s],W=g['wrist'+s];
    const sg=s==='L'?1:-1;
    ctx.save();
    this.rot(ctx,S[0],S[1],sg*j['sh'+s].v);
    this.draw('arm'+s+'_upper');
    this.rot(ctx,E[0],E[1],sg*j['el'+s].v);
    this.draw('arm'+s+'_fore');
    this.rot(ctx,W[0],W[1],sg*j['wr'+s].v);
    let hn='hand'+s+'_'+this.hand[s];if(!this.has(hn))hn='hand'+s+'_relaxed';
    this.draw(hn);
    ctx.restore();
  }
  mouthLayer(){const m='mouth_'+this.mouthState;return this.has(m)?m:'mouth_closed';}
  eyeLayer(side){
    let e=this.blinking>0?'laugh':this.eyes==='open'?'open':this.eyes;
    let n='eyes_'+e+'_'+side;if(!this.has(n))n='eyes_open_'+side;return n;}
  // ---------- behaviour ----------
  loop(now){
    const dt=Math.min(0.05,(now-this.last)/1000);this.last=now;this.t+=dt;
    this.update(dt);this.render();requestAnimationFrame(t=>this.loop(t));
  }
  n(i,f){return Math.sin(this.t*f+this.noise[i])*0.6+Math.sin(this.t*f*2.3+this.noise[i]*1.7)*0.4;}
  update(dt){
    const j=this.j;
    // gesture playback
    if(this.cur){this.cur.t+=dt;while(this.cur.steps.length&&this.cur.t>=this.cur.steps[0].at){const st=this.cur.steps.shift();this.apply(st);}
      if(!this.cur.steps.length&&this.cur.t>=this.cur.end){this.cur=null;}}
    if(!this.cur&&this.queue.length){this.cur=this.queue.shift();}
    // pointing IK overrides arm targets
    for(const s of ['L','R']){const p=this.ik[s];if(p){const r=this.solveIK(s,p.x,p.y);if(r){j['sh'+s].t=r.sh;j['el'+s].t=r.el;j['wr'+s].t=0;}}}
    // idle micro-motion
    const idle=this.idle||{};
    const calm=this.mood==='sleepy'?0.5:1;
    j.bodyX.t=(this.base?.bodyX||0)+this.n(0,0.5)*3*calm;
    j.headRot.t=(this.base?.headRot||0)+this.n(1,0.45)*1.6*calm;
    j.headY.t=(this.base?.headY||0)+this.n(2,0.6)*1.4;
    // arms drift slightly when no explicit target
    for(const s of ['L','R']) if(!this.ik[s]&&!this.armHold?.[s]){j['sh'+s].t=(this.rest?.['sh'+s]??0)+this.n(s==='L'?0:1,0.4)*1.6;j['el'+s].t=(this.rest?.['el'+s]??0)+this.n(2,0.5)*1.2;j['wr'+s].t=0;}
    for(const k in j)j[k].step(dt);
    // blink
    this.blinkT-=dt;if(this.blinkT<=0&&this.blinking<=0){this.blinking=0.12;this.blinkT=(this.mood==='sleepy'?1.5:2.2)+Math.random()*4;}
    if(this.blinking>0)this.blinking-=dt;
    if(this.gazeUntil&&this.t>this.gazeUntil){this.eyes=this.baseEyes||'open';this.gazeUntil=0;}
    this.updateMouth(dt);
  }
  updateMouth(dt){
    this.mouthHold-=dt;
    if(this.mouthOverride){this.mouthState=this.mouthOverride;return;}
    const L=this.level;
    if(L>0.04){
      if(this.mouthHold<=0){
        const r=Math.random();
        this.mouthState=L>0.6?(r<.75?'ah':'oh'):L>0.28?(r<.7?'eh':(r<.85?'ah':'oh')):'eh';
        this.mouthHold=0.06+Math.random()*0.07;
      }
    }else{this.mouthState=this.moodMouth||'closed';}
  }
  advance(sec){const n=Math.round(sec*60);for(let i=0;i<n;i++){this.t+=1/60;this.update(1/60);}this.render();}  // deterministic stepping (tests, offline render)
  // ---------- API ----------
  setMouthLevel(l){this.level=clamp(l,0,1);}
  look(dir,secs=2){ // 'left'|'right'|'wide'|'open'|'sleepy'
    this.eyes=dir;this.gazeUntil=secs>0?this.t+secs:0;if(!secs)this.baseEyes=dir;}
  setMood(m){
    this.mood=m;
    const M={smug:{eyes:'open',mouth:'closed'},happy:{eyes:'open',mouth:'grin'},sad:{eyes:'open',mouth:'frown'},
      shock:{eyes:'wide',mouth:'oh'},laugh:{eyes:'laugh',mouth:'laugh'},sleepy:{eyes:'sleepy',mouth:'closed'},hype:{eyes:'wide',mouth:'grin'}}[m]||{eyes:'open',mouth:'closed'};
    this.baseEyes=M.eyes;this.eyes=M.eyes;this.moodMouth=M.mouth;
  }
  pointAt(side,x,y){this.ik[side]={x,y};this.hand[side]='point';}
  stopPoint(side){this.ik[side]=null;this.hand[side]='relaxed';}
  solveIK(s,tx,ty){
    const g=this.g,S=g['shoulder'+s],R=this.restAng[s];
    const hl=105; // fingertip beyond the wrist
    const l1=R.l1,l2=R.l2+hl;
    let dx=tx-S[0],dy=ty-S[1];let d=Math.hypot(dx,dy);
    d=clamp(d,Math.abs(l1-l2)+5,l1+l2-2);
    const base=Math.atan2(dy,dx);
    const a=Math.acos(clamp((l1*l1+d*d-l2*l2)/(2*l1*d),-1,1));
    const bend=(s==='L')?-1:1;   // elbow flares outward/down
    const th1=base+bend*a;
    const ex=S[0]+Math.cos(th1)*l1,ey=S[1]+Math.sin(th1)*l1;
    const th2=Math.atan2(ty-ey,tx-ex);
    const sgn=s==='L'?1:-1;
    const sh=(th1-R.up)*180/Math.PI*sgn,total=(th2-R.fore)*180/Math.PI*sgn;
    const norm=a=>{while(a>180)a-=360;while(a<-180)a+=360;return a;};
    return {sh:norm(sh),el:norm(total-norm(sh))};
  }
  apply(st){const j=this.j;
    for(const k in st){if(k==='at')continue;
      if(k==='hands'){Object.assign(this.hand,st.hands);}
      else if(k==='eyes'){this.look(st.eyes,st.eyesFor??1.2);}
      else if(k==='mouth'){this.mouthOverride=st.mouth||null;}
      else if(k==='mood'){this.setMood(st.mood);}
      else if(k==='point'){for(const s in st.point){if(st.point[s])this.pointAt(s,...st.point[s]);else this.stopPoint(s);}}
      else if(k==='hold'){this.armHold={...this.armHold,...st.hold};}
      else if(k==='rest'){this.rest={...this.rest,...st.rest};}
      else if(j[k])j[k].t=st[k];}
  }
  play(name,opts){const g=GESTURES[name];if(!g)return;const steps=g(opts||{}).map(s=>({...s}));
    steps.sort((a,b)=>a.at-b.at);const end=(steps.length?steps[steps.length-1].at:0)+0.2;
    this.queue.push({name,steps,t:0,end});}
  isBusy(){return !!this.cur||this.queue.length>0;}
}

// ---------- gesture library: each returns timed keyframes ----------
const R0={sh:0,el:0,wr:0};
const reset=(at)=>({at,hold:{L:false,R:false},point:{L:null,R:null},hands:{L:'relaxed',R:'relaxed'},headRot:0,headX:0,headY:0,headScale:1,lean:0,hatLift:0,hatRot:0,bodyY:0,mouth:null,
  shL:0,elL:0,shR:0,elR:0,wrL:0,wrR:0,eyes:'open',eyesFor:0.01});
const GESTURES={
  reset:()=>[reset(0)],
  wave:(o)=>{const s=o.side||'R';const k=s==='L'?'L':'R';const st=[{at:0,hold:{[k]:true},['sh'+k]:115,['el'+k]:35,hands:{[k]:'relaxed'},headRot:6*(s==='R'?-1:1),mood:'happy'}];
    for(let i=0;i<5;i++)st.push({at:0.35+i*0.32,['el'+k]:(i%2?25:75)});
    st.push(reset(2.4));return st;},
  point:(o)=>{const s=o.side||'R';const t=o.target||[450,300];return [{at:0,point:{[s]:t},headRot:s==='R'?-4:4,eyes:s==='R'?'left':'right',eyesFor:1.5},reset(o.hold||2.2)];},
  present:(o)=>{const s=o.side||'L';const k=s;return [{at:0,hold:{[k]:true},['sh'+k]:48,['el'+k]:30,hands:{[k]:'palm'},headRot:5,lean:3},reset(2.4)];},
  shrug:()=>[{at:0,hold:{L:true,R:true},shL:22,elL:75,shR:22,elR:75,headRot:-6,headY:6,bodyY:-5,hands:{L:'palm',R:'palm'},mouth:'frown'},reset(1.9)],
  hatTip:()=>[{at:0,point:{R:[790,110]},headRot:-5,hands:{R:'fist'}},{at:0.7,hatLift:12,hatRot:-9,mood:'smug'},{at:1.5,hatLift:0,hatRot:0},reset(2.2)],
  celebrate:()=>{const st=[{at:0,hold:{L:true,R:true},shL:150,elL:20,shR:150,elR:20,hands:{L:'fist',R:'fist'},headRot:-5,headY:-8,bodyY:-14,mood:'hype'}];
    for(let i=0;i<6;i++)st.push({at:0.25+i*0.28,bodyY:i%2?-4:-18,headRot:i%2?5:-5,shL:i%2?135:155,shR:i%2?155:135});st.push(reset(2.4));return st;},
  think:()=>[{at:0,point:{R:[705,335]},hands:{R:'fist'},headRot:7,headX:-4,eyes:'right',eyesFor:2},reset(2.6)],
  facepalm:()=>[{at:0,point:{R:[690,215]},hands:{R:'palm'},headRot:6,headY:8,lean:-3,mouth:'frown',eyes:'sleepy',eyesFor:1.8},reset(2.6)],
  bowtie:()=>[{at:0,point:{L:[650,360],R:[730,360]},hands:{L:'fist',R:'fist'},headRot:-4,headScale:1.02,mood:'smug'},reset(2.2)],
  lean:(o)=>[{at:0,lean:o.dir||-6,headX:(o.dir||-6)*1.5,headScale:1.04,headRot:(o.dir||-6)*.8},reset(2.0)],
  laugh:()=>{const st=[{at:0,mood:'laugh',headRot:-8,headY:-5,bodyY:-4,point:{L:[625,470],R:[755,470]},hands:{L:'fist',R:'fist'}}];
    for(let i=0;i<8;i++)st.push({at:0.2+i*0.22,bodyY:i%2?-1:-7,headRot:i%2?-4:-9});st.push({at:2.2,mood:'smug'},reset(2.4));return st;},
  shock:()=>[{at:0,mood:'shock',headScale:1.06,headY:-6,bodyY:-6,point:{L:[585,330],R:[795,330]},hands:{L:'palm',R:'palm'}},{at:1.6,mood:'smug'},reset(1.9)],
  yawn:()=>[{at:0,mood:'sleepy',headRot:-9,headY:6,point:{R:[775,300]},hands:{R:'fist'},mouth:'ah'},{at:1.8,mouth:null},reset(3)],
  clap:()=>{const st=[{at:0,hold:{L:true,R:true},point:{L:[640,430],R:[740,430]},hands:{L:'palm',R:'palm'},mood:'happy'}];
    for(let i=0;i<7;i++)st.push({at:0.3+i*0.22,point:{L:i%2?[630,430]:[672,430],R:i%2?[748,430]:[706,430]}});st.push(reset(2.4));return st;},
};
window.Hubie=Hubie;window.HUBIE_GESTURES=GESTURES;
})();
