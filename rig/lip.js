// Lip-sync maths shared by the browser (window.HubieLip) and Node (require).
(function(root,factory){const L=factory();if(typeof module==='object'&&module.exports)module.exports=L;else root.HubieLip=L;})(typeof self!=='undefined'?self:this,function(){
// ------------------------------------------------------------------ lip-sync
const Lip={
  VOW:{a:'ah',e:'eh',i:'eh',o:'oh',u:'oh',y:'eh'},
  DIG:{oo:'oh',ou:'oh',ow:'oh',oa:'oh',ew:'oh',ue:'oh',ui:'oh',ea:'eh',ee:'eh',ie:'eh',ei:'eh',ey:'eh',ay:'eh',ai:'eh',au:'ah',aw:'ah',oi:'oh',oy:'oh'},
  // characters + start/end seconds  ->  [{t0,t1,v}]   v in ah|eh|oh|mm|sil
  buildTimeline(chars,starts,ends){
    const raw=[];const n=chars.length;
    for(let i=0;i<n;i++){
      const ch=(chars[i]||'').toLowerCase();const t0=starts[i],t1=ends[i];
      let v=null;
      if(/[a-z]/.test(ch)){
        const two=ch+((chars[i+1]||'').toLowerCase());
        const prev=(chars[i-1]||'').toLowerCase();
        if(this.DIG[prev+ch]&&/[aeiou]/.test(prev)){v='hold';}            // second letter of a vowel pair
        else if(this.DIG[two]){v=this.DIG[two];}
        else if(this.VOW[ch]){
          const nxt=(chars[i+1]||' ').toLowerCase();const after=/[^a-z]/.test(nxt);
          v=(ch==='e'&&after&&/[bcdfghjklmnpqrstvwxz]/.test(prev))?'hold':this.VOW[ch];   // silent final e
        }
        else if('bmp'.includes(ch))v='mm';
        else if(ch==='w')v='oh';
        else if('fv'.includes(ch))v='eh';
        else v='hold';
      }else{ // space / punctuation
        const gap=(i+1<n?starts[i+1]:t1)-t0;
        v=(gap>0.16||/[.!?…]/.test(ch))?'sil':'hold';
      }
      raw.push({t0,t1,v});
    }
    // resolve holds and merge
    const segs=[];
    for(const r of raw){
      if(r.v==='hold'){if(segs.length)segs[segs.length-1].t1=r.t1;else segs.push({t0:r.t0,t1:r.t1,v:'eh'});continue;}
      const last=segs[segs.length-1];
      if(last&&last.v===r.v){last.t1=r.t1;}else segs.push({t0:r.t0,t1:r.t1,v:r.v});
    }
    // absorb very short segments (they read as flicker)
    for(let k=0;k<3;k++)for(let i=segs.length-1;i>=0;i--){
      const s=segs[i];if(s.t1-s.t0<0.06&&s.v!=='sil'&&s.v!=='mm'&&segs.length>1){
        const nb=segs[i+1]||segs[i-1];if(nb&&nb.v!=='sil'){nb.t0=Math.min(nb.t0,s.t0);nb.t1=Math.max(nb.t1,s.t1);segs.splice(i,1);}}
    }
    const LEAD=0.035;return segs.map(s=>({t0:s.t0-LEAD,t1:s.t1-LEAD,v:s.v}));
  },
  // RMS envelope 0..1 at `hop` seconds
  envelope(buf,hop=0.01){
    const d=buf.getChannelData(0),sr=buf.sampleRate,step=Math.round(sr*hop),n=Math.floor(d.length/step);
    const e=new Float32Array(n);let mx=1e-6;
    for(let i=0;i<n;i++){let s=0;const o=i*step;for(let j=0;j<step;j++){const x=d[o+j];s+=x*x;}e[i]=Math.sqrt(s/step);if(e[i]>mx)mx=e[i];}
    for(let i=0;i<n;i++)e[i]=Math.pow(e[i]/mx,0.6);
    for(let i=1;i<n;i++)e[i]=e[i-1]*0.45+e[i]*0.55;         // light smoothing
    return {hop,data:e};
  },

  // same envelope but from raw mono Float32 samples (Node side, no AudioBuffer)
  envelopeFromPCM(d,sampleRate,hop=0.01){
    const step=Math.round(sampleRate*hop),n=Math.floor(d.length/step);
    const e=new Float32Array(n);let mx=1e-6;
    for(let i=0;i<n;i++){let s=0;const o=i*step;for(let j=0;j<step;j++){const x=d[o+j];s+=x*x;}e[i]=Math.sqrt(s/step);if(e[i]>mx)mx=e[i];}
    for(let i=0;i<n;i++)e[i]=Math.pow(e[i]/mx,0.6);
    for(let i=1;i<n;i++)e[i]=e[i-1]*0.45+e[i]*0.55;
    return {hop,data:e};
  },
  // when the TTS gives no timestamps: spread the letters over the voiced parts of the audio
  estimateAlignment(text,env){
    const {hop,data}=env,n=data.length;let thr=0.12;
    const voiced=[];let on=false,s0=0;
    for(let i=0;i<n;i++){const v=data[i]>thr;if(v&&!on){on=true;s0=i;}if(!v&&on){on=false;voiced.push([s0*hop,i*hop]);}}
    if(on)voiced.push([s0*hop,n*hop]);
    // merge gaps shorter than 90 ms
    const segs=[];for(const v of voiced){const l=segs[segs.length-1];if(l&&v[0]-l[1]<0.09)l[1]=v[1];else segs.push(v.slice());}
    const total=segs.reduce((a,s)=>a+(s[1]-s[0]),0)||1;
    const chars=[...text];const w=chars.map(c=>/[aeiouy]/i.test(c)?2:/[a-z]/i.test(c)?1:0);
    const W=w.reduce((a,b)=>a+b,0)||1;
    const at=f=>{let r=f*total;for(const s of segs){const d=s[1]-s[0];if(r<=d)return s[0]+r;r-=d;}return segs.length?segs[segs.length-1][1]:0;};
    const starts=[],ends=[];let cum=0;
    for(let i=0;i<chars.length;i++){starts.push(at(cum/W));cum+=w[i];ends.push(at(cum/W));}
    return {chars,starts,ends};
  },
  shapeAt(tl,t,from=0){ // returns [shape,index]
    let i=Math.max(0,Math.min(from,tl.length-1));
    while(i>0&&tl[i].t0>t)i--;
    while(i<tl.length-1&&tl[i].t1<t)i++;
    const s=tl[i];return s&&t>=s.t0&&t<s.t1+0.02?[s.v,i]:['sil',i];
  }
};
return Lip;
});
