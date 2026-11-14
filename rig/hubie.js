// Hubie face + lip-sync puppet (upper body). Canvas2D, no dependencies.
// Design space is 1376x768, matching assets/rig/manifest.json.
(function(){
const ASSET='../assets/rig/';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rad=d=>d*Math.PI/180;

class Spring{constructor(v=0,k=60,z=1){this.v=v;this.t=v;this.vel=0;this.k=k;this.z=z;}
  step(dt){const c=2*Math.sqrt(this.k)*this.z;this.vel+=(this.k*(this.t-this.v)-c*this.vel)*dt;this.v+=this.vel*dt;}}

const Lip=window.HubieLip;

// ---------------------------------------------------------------- emotions
// eyes: base eye state; peak: eye state flashed on loud syllables; map: viseme -> mouth sprite; rest: mouth sprite when silent
const EMO={
  smug:     {eyes:'open',peak:null,rest:'closed',map:{},tilt:2,glance:0.5},
  happy:    {eyes:'open',peak:'laugh',peakP:.18,rest:'closed',map:{ah:'ah'},loudMap:{ah:'grin'},tilt:-2,glance:0.4},
  excited:  {eyes:'open',peak:'laugh',peakP:.2,rest:'grin',map:{eh:'eh',ah:'grin'},loudMap:{ah:'grin',eh:'ah'},tilt:-3,glance:0.2},
  amused:   {eyes:'open',peak:'laugh',peakP:.35,rest:'closed',map:{ah:'ah'},loudMap:{ah:'laugh'},tilt:-4,glance:0.3},
  laugh:    {eyes:'laugh',peak:'open',peakP:.3,rest:'laugh',map:{ah:'laugh',eh:'grin',oh:'oh'},loudMap:{ah:'laugh'},tilt:-5,glance:0},
  surprised:{eyes:'open',peak:null,rest:'oh',map:{eh:'ah'},loudMap:{},tilt:0,scale:1.03,glance:0},
  sad:      {eyes:'sleepy',peak:'open',peakP:.1,rest:'frown',map:{},tilt:5,glance:0.2},
  thinking: {eyes:'open',peak:null,rest:'closed',map:{},tilt:6,glance:1.4},
  sleepy:   {eyes:'sleepy',peak:null,rest:'closed',map:{},tilt:-4,glance:0.1},
  serious:  {eyes:'open',peak:null,rest:'closed',map:{},tilt:0,glance:0.2},
};

class Hubie{
  constructor(canvas,opts={}){
    this.c=canvas;this.ctx=canvas.getContext('2d');
    this.vb=opts.viewbox||{x:358,y:18,w:660,h:580};this.side=opts.side||'right';
    this.bg=opts.background||null;           // function(ctx,w,h) or null (transparent)
    this.img={};this.man=null;this.ready=false;this.t=0;this.last=performance.now();
    const S=(v,k,z)=>new Spring(v,k,z);
    this.j={headRot:S(0,55,.8),headX:S(0,40,.8),headY:S(0,60,.7),headScale:S(1,40,.8),bodyY:S(0,30,.9),hatRot:S(0,60,.7)};
    this.emo='smug';this.baseEyes='open';
    this.eyeA='open';this.eyeB='open';this.eyeMix=1;      // crossfade eyes: A (below) -> B (above)
    this.mA='closed';this.mB='closed';this.mMix=1;         // crossfade mouth
    this.blinkT=2+Math.random()*3;this.blink=0;
    this.glanceT=3;this.glanceUntil=0;this.glance=null;
    this.peakUntil=0;
    this.sp=null;this.speechIdx=0;this.holdUntil=0;this.curShape='closed';
    this.noise=[Math.random()*100,Math.random()*100,Math.random()*100];
    this.ctxAudio=null;this.manualDt=false;
    this.load();
  }
  async load(){
    const man=await (await fetch(ASSET+'manifest.json')).json();this.man=man;
    const names=Object.keys(man.layers).filter(k=>man.layers[k].file);
    await Promise.all(names.map(n=>new Promise(res=>{const i=new Image();i.onload=res;i.onerror=res;i.src=ASSET+man.layers[n].file;this.img[n]=i;})));
    this.ready=true;if(!this.manualDt)requestAnimationFrame(t=>this.loop(t));
  }
  has(n){return this.img[n]&&this.img[n].naturalWidth>0;}
  layer(n,alpha=1,ctx=this.ctx){const e=this.man.layers[n];if(!e||!this.has(n)||alpha<=0)return;const a=ctx.globalAlpha;ctx.globalAlpha=alpha;ctx.drawImage(this.img[n],e.x,e.y,e.w,e.h);ctx.globalAlpha=a;}
  rot(ctx,px,py,deg){ctx.translate(px,py);ctx.rotate(rad(deg));ctx.translate(-px,-py);}
  // ------------------------------------------------------------ render
  render(){
    const ctx=this.ctx,c=this.c,vb=this.vb;ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,c.width,c.height);
    if(this.bg)this.bg(ctx,c.width,c.height);
    ctx.setTransform(c.width/vb.w,0,0,c.height/vb.h,0,0);ctx.translate(-vb.x,-vb.y);
    const j=this.j,nk=this.man.pivots.neck;
    ctx.save();
    const br=Math.sin(this.t*1.9)*0.004+Math.sin(this.t*0.7)*0.002;
    ctx.translate(690,735+j.bodyY.v);ctx.scale(1-br*.5,1+br);ctx.translate(-690,-735);
    this.layer('torso');
    ctx.save();
    ctx.translate(j.headX.v,j.headY.v);this.rot(ctx,nk[0],nk[1],j.headRot.v);
    ctx.translate(nk[0],nk[1]);ctx.scale(j.headScale.v,j.headScale.v);ctx.translate(-nk[0],-nk[1]);
    this.layer('head');
    // eyes (crossfade)
    for(const s of ['L','R']){this.layer('eyes_'+this.eyeA+'_'+s);this.layer('eyes_'+this.eyeB+'_'+s,this.eyeMix);}
    // mouth (crossfade)
    this.layer('mouth_'+this.mA);this.layer('mouth_'+this.mB,this.mMix);
    ctx.save();const hp=this.man.pivots.hat;this.rot(ctx,hp[0],hp[1]+60,j.hatRot.v);this.layer('hat');ctx.restore();
    ctx.restore();
    this.layer('bowtie');
    // arms rest (static for now)
    for(const s of ['R','L']){this.layer('arm'+s+'_upper');this.layer('arm'+s+'_fore');this.layer('hand'+s+'_relaxed');}
    ctx.restore();
  }
  // ------------------------------------------------------------ behaviour
  loop(now){const dt=Math.min(0.05,(now-this.last)/1000);this.last=now;this.step(dt);this.render();requestAnimationFrame(t=>this.loop(t));}
  n(i,f){return Math.sin(this.t*f+this.noise[i])*0.6+Math.sin(this.t*f*2.3+this.noise[i]*1.7)*0.4;}
  setEyes(name){if(name==='wide')name='open';/* the wide-open googly eyes looked creepy: never shown */if(!this.has('eyes_'+name+'_L'))name='open';if(name===this.eyeB)return;this.eyeA=this.eyeB;this.eyeB=name;this.eyeMix=0;}
  setMouth(name){if(!this.has('mouth_'+name))name='closed';if(name===this.mB)return;this.mA=this.mB;this.mB=name;this.mMix=0;}
  setEmotion(name){if(!EMO[name])name='smug';this.emo=name;this.E=EMO[name];}
  get E_(){return EMO[this.emo]||EMO.smug;}
  speechTime(){const s=this.sp;if(!s)return null;if(s.wall)return performance.now()/1000-s.t0;return s.offline?s.t:(this.ctxAudio.currentTime-s.t0);}
  step(dt){
    this.t+=dt;const E=this.E_,j=this.j;
    if(this.sp&&this.sp.offline)this.sp.t+=dt;
    const st=this.speechTime();const speaking=st!==null&&st<this.sp.utt.dur+0.15;
    let env=0;
    if(speaking){const e=this.sp.utt.env;env=e.data[Math.min(e.data.length-1,Math.max(0,Math.round(st/e.hop)))]||0;}
    // --- mouth
    let mouth=E.rest;
    if(speaking){
      const [v,idx]=Lip.shapeAt(this.sp.utt.tl,st,this.speechIdx);this.speechIdx=idx;
      let shape=(v==='sil'||v==='mm'||env<0.07)?'rest':v;
      if(shape==='ah'&&env<0.3)shape='eh';
      if(shape==='eh'&&env>0.85)shape='ah';
      if(shape==='rest')mouth=E.rest==='grin'||E.rest==='laugh'?'closed':E.rest;
      else{const loud=env>0.55;mouth=(loud&&E.loudMap&&E.loudMap[shape])||(E.map&&E.map[shape])||shape;}
      // hysteresis so the mouth does not flicker
      if(mouth!==this.curShape){if(this.t>=this.holdUntil||mouth==='closed'){this.curShape=mouth;this.holdUntil=this.t+0.055;}}
      mouth=this.curShape;
    }else{this.curShape=mouth;}
    this.setMouth(mouth);
    this.mMix=Math.min(1,this.mMix+dt*16);this.eyeMix=Math.min(1,this.eyeMix+dt*14);
    // --- eyes: emotion base, blinks, glances, peaks
    this.blinkT-=dt;if(this.blinkT<=0&&this.blink<=0){this.blink=this.emo==='sleepy'?0.2:0.11;this.blinkT=(this.emo==='sleepy'?1.4:2.0)+Math.random()*4.2;}
    if(this.blink>0)this.blink-=dt;
    this.glanceT-=dt;
    if(this.glanceT<=0){const g=E.glance;this.glanceT=1.2+Math.random()*3.2;
      if(Math.random()<g){this.glance=Math.random()<.5?'left':'right';this.glanceUntil=this.t+0.7+Math.random()*0.9;}}
    if(this.glanceUntil&&this.t>this.glanceUntil){this.glance=null;this.glanceUntil=0;}
    if(this.forceGlance&&this.t<this.forceGlance.until){this.glance=this.forceGlance.dir;}
    if(speaking&&E.peak&&env>0.8&&this.t>this.peakUntil&&Math.random()<(E.peakP||0)){this.peakUntil=this.t+0.45;}
    let eyes=E.eyes;
    if(this.glance&&eyes!=='laugh')eyes=this.glance;
    if(this.t<this.peakUntil)eyes=E.peak;
    if(this.blink>0)eyes='laugh';
    this.setEyes(eyes);
    // --- head: nods with loudness, tilt by emotion, tiny idle
    const nod=speaking?env*3.4:0;
    j.headY.t=-1+nod+this.n(0,0.5)*0.8;
    j.headRot.t=E.tilt+this.n(1,0.4)*1.0+(speaking?Math.sin(this.t*2.2)*0.9:0);
    j.headX.t=this.n(2,0.35)*1.2;
    j.headScale.t=E.scale||1;
    j.bodyY.t=0;
    for(const k in j)j[k].step(dt);
    // end of utterance
    if(this.sp&&st>this.sp.utt.dur+0.25){const r=this.sp.resolve;this.sp=null;this.lastSpoke=this.t;if(r)r();}
    if(!this.sp&&this.emo!=='smug'&&this.t-(this.lastSpoke||0)>6)this.setEmotion('smug');
  }
  advance(sec,fps=60){const n=Math.round(sec*fps);for(let i=0;i<n;i++)this.step(1/fps);this.render();}
  // live stage: timeline + envelope are prepared by the server; the clock starts now
  sayPrepared(utt,{gaze='camera'}={}){
    this.setEmotion(utt.emotion);this.speechIdx=0;
    const toward=this.side==='left'?'right':'left';if(gaze==='game'||gaze==='chat')this.forceGlance={dir:toward,until:this.t+1.4};
    return new Promise(resolve=>{this.sp={utt,offline:false,wall:true,t0:performance.now()/1000,resolve};});
  }
  // ------------------------------------------------------------ speech
  // audio: ArrayBuffer of a decodable file; alignment: {chars,starts,ends} (seconds) or null
  async prepare({audio,text,alignment,emotion='smug',decode}){
    let buf;
    if(decode)buf=decode;else{this.ctxAudio=this.ctxAudio||new (window.AudioContext||window.webkitAudioContext)();buf=await this.ctxAudio.decodeAudioData(audio.slice(0));}
    const env=Lip.envelope(buf);
    const al=alignment||Lip.estimateAlignment(text,env);
    const tl=Lip.buildTimeline(al.chars,al.starts,al.ends);
    return {buf,env,tl,dur:buf.duration,emotion,text,estimated:!alignment};
  }
  say(utt,{offline=false}={}){
    this.setEmotion(utt.emotion);this.speechIdx=0;
    return new Promise(resolve=>{
      if(offline){this.sp={utt,offline:true,t:0,resolve};return;}
      this.ctxAudio=this.ctxAudio||new (window.AudioContext||window.webkitAudioContext)();
      const src=this.ctxAudio.createBufferSource();src.buffer=utt.buf;src.connect(this.ctxAudio.destination);
      const t0=this.ctxAudio.currentTime+0.05;src.start(t0);this.sp={utt,offline:false,t0,resolve};
    });
  }
}
window.Hubie=Hubie;window.HUBIE_EMOTIONS=Object.keys(EMO);
})();
