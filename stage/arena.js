// Stand-in game scene used to test the pipeline. It animates fake rounds; real House Games replace it.
(function(){
const c=document.getElementById('arena'),x=c.getContext('2d');const W=1280,H=720;
const A={game:null,phase:'idle',t0:0,outcome:null,seed:Math.random()};
const rnd=(a,b)=>a+Math.random()*(b-a);
const ease=t=>t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
function bg(){const g=x.createLinearGradient(0,0,0,H);g.addColorStop(0,'#0a2c33');g.addColorStop(1,'#051317');x.fillStyle=g;x.fillRect(0,0,W,H);
  x.strokeStyle='#ffffff08';for(let i=0;i<W;i+=40){x.beginPath();x.moveTo(i,0);x.lineTo(i,H);x.stroke();}for(let j=0;j<H;j+=40){x.beginPath();x.moveTo(0,j);x.lineTo(W,j);x.stroke();}}
function text(t,px,py,size=28,color='#e8f4f2',align='center',weight='700'){x.fillStyle=color;x.font=`${weight} ${size}px "Helvetica Neue",Arial`;x.textAlign=align;x.fillText(t,px,py);}
function drawDice(el,o){ // number line, target and a roll
  const L=140,R=W-140,y=400;x.lineWidth=10;x.lineCap='round';
  x.strokeStyle='#1c4b55';x.beginPath();x.moveTo(L,y);x.lineTo(R,y);x.stroke();
  const target=o?.target??50;const tx=L+(R-L)*target/100;
  x.strokeStyle='#2fb5a5';x.beginPath();x.moveTo(L,y);x.lineTo(tx,y);x.stroke();
  x.strokeStyle='#e9b44c';x.beginPath();x.moveTo(tx,y);x.lineTo(R,y);x.stroke();
  text('Roll under '+target,W/2,170,40,'#9fdad2');
  let val;if(A.phase==='start'){val=Math.floor(rnd(0,100));}else if(A.phase==='result'&&o){const k=ease(Math.min(1,el/1.2));val=o.roll;}else val=target;
  const vx=L+(R-L)*val/100;x.fillStyle='#f4fbfa';x.beginPath();x.arc(vx,y,22,0,7);x.fill();text(String(val),W/2,310,110,'#ffffff');
}
function drawMines(el,o){
  const n=5,s=84,gx=(W-n*s)/2,gy=150;const seed=Math.floor(A.seed*1e6);
  const mines=new Set();let r=seed;while(mines.size<4){r=(r*1664525+1013904223)%4294967296;mines.add(r%25);}
  let shown=A.phase==='result'?(o?.steps??3):Math.min(6,Math.floor(el/0.7));
  for(let i=0;i<25;i++){const cx=gx+(i%n)*s,cy=gy+Math.floor(i/n)*s;const open=i<shown+(A.phase==='result'&&!o?.win?0:0);
    x.fillStyle=open?'#103f48':'#0d2f37';x.strokeStyle='#26636e';x.lineWidth=2;x.beginPath();x.roundRect(cx+3,cy+3,s-6,s-6,10);x.fill();x.stroke();
    if(open){const hit=A.phase==='result'&&o&&!o.win&&i===shown-1;text(hit?'✹':'◆',cx+s/2,cy+s/2+10,hit?30:26,hit?'#ff6b5e':'#7ae0cf');}}
  text(A.phase==='result'&&o?(o.win?o.mult.toFixed(2)+'×':'Boom'):'Mines',W/2,105,42,A.phase==='result'&&o&&!o.win?'#ff8a7e':'#9fdad2');
}
function drawCrash(el,o){
  const t=Math.min(el,6),final=o?.mult||2;const end=A.phase==='result'&&o?1:0;
  const m=end?o.mult:1+t*t*0.12;x.strokeStyle='#2fb5a5';x.lineWidth=5;x.beginPath();x.moveTo(110,620);
  const steps=60;for(let i=0;i<=steps;i++){const u=i/steps,mm=1+(m-1)*u*u;x.lineTo(110+u*(W-220),620-Math.min(460,(mm-1)*52));}x.stroke();
  text(m.toFixed(2)+'×',W/2,230,120,end&&!o.win?'#ff8a7e':'#ffffff');text(end?(o.win?'Cashed out':'Crashed'):'Climbing…',W/2,290,30,'#9fdad2');
}
function drawGeneric(el,o){
  const n=A.phase==='result'&&o?o.mult:1+Math.abs(Math.sin(el*3))*6;
  text(A.game?.name||'Game',W/2,200,48,'#9fdad2');text(n.toFixed(2)+'×',W/2,370,130,A.phase==='result'&&o&&!o.win?'#ff8a7e':'#ffffff');
  x.strokeStyle='#2fb5a5';x.lineWidth=6;x.beginPath();x.arc(W/2,480,32+Math.sin(el*8)*3,0,7);x.stroke();
}
// The fake test scene below exists only for developer runs (?standin=1). On air the stage ALWAYS shows the real game:
// when no new picture arrives (a page loading, a quiet moment) it simply keeps the last real frame.
const DEV=new URLSearchParams(location.search).get('standin')==='1';
function frame(){
  x.setTransform(c.width/W,0,0,c.height/H,0,0);          // the canvas is 1920x1080 but everything is drawn on a 1280x720 grid
  x.imageSmoothingQuality='low';           // 'high' re-samples every frame in software: far too slow when the game picture changes every frame
  if(A.feed){if(A.fed!==A.feed){x.drawImage(A.feed,0,0,W,H);A.fed=A.feed;}requestAnimationFrame(frame);return;}   // repaint the game only when a new picture has arrived
  if(!DEV){x.fillStyle='#050e12';x.fillRect(0,0,W,H);requestAnimationFrame(frame);return;}
  const el=(performance.now()-A.t0)/1000;bg();
  const id=A.game?.id;
  if(!A.game){text('Waiting for the next game…',W/2,H/2,38,'#6fb1ba');}
  else{(id==='dice'?drawDice:id==='mines'?drawMines:id==='crash'?drawCrash:drawGeneric)(el,A.outcome);}
  if(A.phase==='result'&&A.outcome){const o=A.outcome;x.save();x.globalAlpha=Math.min(1,(performance.now()-A.rt)/400);
    x.fillStyle=o.win?'#1f8f6f':'#8f3a2f';x.beginPath();x.roundRect(W/2-130,H-150,260,56,28);x.fill();text(o.win?'WIN '+o.mult.toFixed(2)+'×':'LOSS',W/2,H-112,28,'#fff');x.restore();}
  requestAnimationFrame(frame);
}
window.Arena={feed(b){if(A.feed&&A.feed.close)A.feed.close();A.feed=b;A.feedAt=performance.now();},set(msg){
  if(msg.phase==='game'){A.game=msg.game;A.phase='idle';A.outcome=null;A.seed=Math.random();A.t0=performance.now();}
  if(msg.phase==='start'){A.game=msg.game;A.phase='start';A.outcome=null;A.seed=Math.random();A.t0=performance.now();}
  if(msg.phase==='result'){A.phase='result';A.outcome=msg.outcome;A.rt=performance.now();A.t0=performance.now();}
}};
frame();
})();
