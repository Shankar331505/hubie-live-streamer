(function(){
const params=new URLSearchParams(location.search);
const WS_URL=params.get('ws')||('ws://'+location.host+'/ws');
const hubie=new Hubie(document.getElementById('hubie'),{viewbox:{x:335,y:20,w:710,h:624},side:'right'});
window.hubie=hubie;
const $=id=>document.getElementById(id);
const chatEl=$('chat'),capEl=$('caption');
const colors=['#7ae0cf','#e9b44c','#f08a6b','#9db8ff','#c79bff','#8be28b','#ffb3d1'];
const colorFor=u=>{let h=0;for(const ch of u)h=(h*31+ch.charCodeAt(0))>>>0;return colors[h%colors.length];};
let ws;const send=o=>{try{ws&&ws.readyState===1&&ws.send(JSON.stringify(o));}catch(e){}};
function addChat(user,text){
  const d=document.createElement('div');d.className='msg';setTimeout(()=>{d.style.opacity='0';setTimeout(()=>d.remove(),700);},45000);
  const u=document.createElement('span');u.className='u';u.style.color=colorFor(user);u.textContent=user+':';
  const t=document.createElement('span');t.textContent=text.slice(0,120);
  d.append(u,t);chatEl.appendChild(d);while(chatEl.children.length>5)chatEl.removeChild(chatEl.firstChild);
}
function setCaption(text){/* captions are switched off on purpose */}
function showVote(msg){
  const box=$('vote'),rows=$('voterows');
  if(!msg||!msg.options){box.style.display='none';return;}
  box.style.display='block';rows.innerHTML='';
  const total=msg.options.reduce((a,o)=>a+o.count,0)||1;
  for(const o of msg.options.slice(0,3)){const r=document.createElement('div');r.className='row';r.innerHTML='<div class="bar" style="width:'+Math.round(100*o.count/total)+'%"></div><div class="lab"><span></span><span>'+o.count+'</span></div>';r.querySelector('.lab span').textContent=o.name;rows.appendChild(r);}
}
async function onMsg(m){
  if(m.t==='say'){
    setCaption(m.text);
    const env={hop:m.env.hop,data:Float32Array.from(m.env.data)};
    await hubie.sayPrepared({tl:m.tl,env,dur:m.dur,emotion:m.emotion,text:m.text},{gaze:m.gaze});
    setTimeout(()=>{setCaption(null);},300);
    send({t:'say_done',id:m.id});
  }
  else if(m.t==='chat')addChat(m.user,m.text);
  else if(m.t==='game'){const c=$('chip');if(m.game){c.textContent='Now playing: '+m.game.name;c.style.display='block';}Arena.set({phase:'game',game:m.game});}
  else if(m.t==='round'){Arena.set(m);}
  else if(m.t==='cursor'){const c=$('cursor');c.style.display='block';c.style.transform='translate('+m.x+'px,'+m.y+'px)';
    if(m.click){const r=$('ripple');r.style.left=m.x+'px';r.style.top=m.y+'px';r.classList.remove('go');void r.offsetWidth;r.classList.add('go');}}
  else if(m.t==='vote')showVote(m);
  else if(m.t==='break'){const b=$('break');b.textContent=m.text||'';b.style.background=m.opaque?'#071a21':'';b.style.display=m.on?'flex':'none';}
  else if(m.t==='standin'){$('standin').style.display=m.show?'block':'none';}
  else if(m.t==='emotion')hubie.setEmotion(m.emotion);
}
function connect(){
  ws=new WebSocket(WS_URL);ws.binaryType='arraybuffer';
  ws.onopen=()=>send({t:'ready'});
  // Game pictures: only the NEWEST waiting picture is decoded. A game that animates all the time (the roulette wheel) sends far more frames than
  // can be drawn; decoding every one made the queue, and the picture's delay, grow without limit (the picture drifted behind the sound).
  let pendingPic=null,decoding=false;
  const pumpPics=async()=>{decoding=true;while(pendingPic){const d=pendingPic;pendingPic=null;try{const b=await createImageBitmap(new Blob([d],{type:'image/jpeg'}));Arena.feed(b);$('standin').style.display='none';$('chip').style.display='none';}catch(err){}}decoding=false;};
  ws.onmessage=e=>{if(e.data instanceof ArrayBuffer){pendingPic=e.data;if(!decoding)pumpPics();return;}try{onMsg(JSON.parse(e.data));}catch(err){console.error(err);}};
  ws.onclose=()=>setTimeout(connect,1000);
}
connect();
})();
