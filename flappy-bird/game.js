'use strict';
/* ---------- Constants & helpers ---------- */
const W=400,H=640,GROUND=560,PW=66,CAP=28,BR=12;   // logical game size (scaled to fit any screen)
const $=id=>document.getElementById(id);
const box=$('game'),cv=$('cv'),ctx=cv.getContext('2d');
const rand=(a,b)=>a+Math.random()*(b-a);
let scale=1,dpr=1;
 
function resize(){                     // keep 400x640 proportions on every screen
  scale=Math.min(innerWidth/W,innerHeight/H);
  dpr=Math.min(window.devicePixelRatio||1,2);
  box.style.width=W*scale+'px';box.style.height=H*scale+'px';box.style.fontSize=16*scale+'px';
  cv.width=Math.round(W*scale*dpr);cv.height=Math.round(H*scale*dpr);
}
addEventListener('resize',resize);resize();
 
/* ---------- Audio (synthesised with WebAudio, no files needed) ---------- */
const snd={on:true,ac:null,
  init(){if(!this.ac){try{this.ac=new(window.AudioContext||window.webkitAudioContext)()}catch(e){}}
    if(this.ac&&this.ac.state==='suspended')this.ac.resume()},
  tone(f0,f1,d,type='sine',v=.15,delay=0){
    if(!this.on||!this.ac)return;const t=this.ac.currentTime+delay,o=this.ac.createOscillator(),g=this.ac.createGain();
    o.type=type;o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(f1,t+d);
    g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.001,t+d);
    o.connect(g);g.connect(this.ac.destination);o.start(t);o.stop(t+d)},
  flap(){this.tone(380,760,.12,'triangle')},
  point(){this.tone(880,880,.08,'square',.07);this.tone(1320,1320,.16,'square',.07,.08)},
  hit(){this.tone(240,40,.4,'sawtooth',.2);this.tone(120,40,.3,'square',.1,.05)},
  click(){this.tone(600,950,.07,'sine',.12)},
  medal(){this.tone(659,988,.18,'triangle',.1);this.tone(988,1319,.28,'triangle',.09,.14)},
  coin(){this.tone(1180,1760,.09,'sine',.11);this.tone(1760,2100,.12,'sine',.08,.06)}};
 
/* ---------- Game state ---------- */
let state='start',started=false,t=0,score=0,best=0,scroll=0,shake=0,flash=0,dusk=0,duskT=0,overT=0,cyc=0,beat=false,zoom=0,camY=0;
try{best=+localStorage.getItem('flappy_best')||0}catch(e){}
let cfg={sound:1,diff:1,gfx:1,skin:0,map:0};
try{Object.assign(cfg,JSON.parse(localStorage.getItem('flappy_cfg')||'{}'))}catch(e){}
snd.on=!!cfg.sound;const saveCfg=()=>{try{localStorage.setItem('flappy_cfg',JSON.stringify(cfg))}catch(e){}};
// Bird skins: the first is free, the rest are bought with coins collected in-game
const SKINS=[{n:'Sunny',cost:0,a:'#ffe86e',b:'#ffab2b',w:'#ff9a1f',t:'#f29a1f',tr:'#ffe9a0'},
 {n:'Rosie',cost:60,a:'#ffc2e2',b:'#ff6fae',w:'#ff4f93',t:'#e0407f',tr:'#ffb3d6'},
 {n:'Bluey',cost:100,a:'#a8e6ff',b:'#3aa0ff',w:'#2b7de0',t:'#2267c2',tr:'#9edcff'},
 {n:'Mint',cost:150,a:'#c9ffb0',b:'#3fd07a',w:'#22a85c',t:'#1a8a4a',tr:'#b5ffcf'},
 {n:'Coral',cost:220,a:'#ffd0a8',b:'#ff7a3d',w:'#ef5f22',t:'#c94a17',tr:'#ffc9a0'},
 {n:'Grape',cost:300,a:'#e2c2ff',b:'#9a5cff',w:'#7d3fe0',t:'#6127c2',tr:'#d6b3ff'},
 {n:'Ember',cost:400,a:'#ffd08a',b:'#ff4d3d',w:'#e0281a',t:'#a81a10',tr:'#ffb07a'},
 {n:'Frost',cost:520,a:'#eaffff',b:'#8fdfff',w:'#5fc0e6',t:'#3f9ac2',tr:'#d6f7ff'},
 {n:'Shadow',cost:660,a:'#8a8aa8',b:'#3a3a5c',w:'#2a2a48',t:'#22223a',tr:'#b8a0ff'},
 {n:'Aurelia',cost:820,a:'#fff3b0',b:'#ffcf33',w:'#e6a41a',t:'#b8790a',tr:'#fff0a0'}];
let wallet=0;try{wallet=Math.max(0,+localStorage.getItem('flappy_wallet')||0)}catch(e){}
let owned=[0];try{const o=JSON.parse(localStorage.getItem('flappy_owned')||'[0]');if(Array.isArray(o))owned=o}catch(e){}
if(!owned.includes(0))owned.push(0);
if(!owned.includes(cfg.skin))cfg.skin=0;                 // don't equip a bird you don't own
const saveWallet=()=>{try{localStorage.setItem('flappy_wallet',wallet)}catch(e){}};
const saveOwned=()=>{try{localStorage.setItem('flappy_owned',JSON.stringify(owned))}catch(e){}};
// Maps: pickable locations. Palette keys drive sky/hills; sh=silhouette shape; g=[grass,grassShade,darkLine,dirtTop,dirtBot]
const MAPS=[
 {n:'Meadow',cost:0,dusk:0,sh:'hills',top:[74,183,246],bot:[205,240,255],m:[150,185,225],h1:[118,196,150],h2:[80,170,110],t:[50,140,84],sil:[92,150,175],g:['#78d03b','#5cae2a','#4a8f20','#e3cd86','#b9993f']},
 {n:'Sunset',cost:100,dusk:.4,sh:'hills',top:[255,138,88],bot:[255,206,150],m:[196,120,140],h1:[150,92,120],h2:[112,66,96],t:[74,46,72],sil:[150,92,120],g:['#c79a4a','#a87a2a','#7a5518','#8a5a2a','#5a3a18']},
 {n:'Night City',cost:150,dusk:1,sh:'city',top:[10,14,44],bot:[46,40,92],m:[30,34,68],h1:[36,40,78],h2:[28,32,60],t:[22,26,52],sil:[24,30,66],g:['#2c3040','#242836','#1a1d28','#2a2d36','#181a22']},
 {n:'Desert',cost:200,dusk:.1,sh:'dunes',top:[130,196,236],bot:[247,224,168],m:[214,178,120],h1:[224,190,128],h2:[206,168,104],t:[178,140,80],sil:[200,170,120],g:['#e6cd8a','#d8b96a','#b8964a','#d8b46a','#a67e38']},
 {n:'Ocean',cost:280,dusk:.05,sh:'dunes',top:[120,200,224],bot:[196,240,244],m:[120,190,200],h1:[86,176,196],h2:[56,150,176],t:[40,120,150],sil:[120,180,200],g:['#4fb8c8','#3a9aae','#2a7d90','#e6dfa8','#c9be78']},
 {n:'Blossom',cost:350,dusk:0,sh:'hills',top:[255,214,232],bot:[255,238,246],m:[240,196,220],h1:[236,170,200],h2:[224,140,180],t:[210,96,150],sil:[236,180,210],g:['#8ed05a','#6fae3a','#5a8f28','#e0cd9a','#b89a5a']},
 {n:'Snowfall',cost:420,dusk:.15,sh:'peaks',top:[150,196,236],bot:[224,240,252],m:[196,214,236],h1:[210,226,244],h2:[224,236,250],t:[190,206,224],sil:[200,216,238],g:['#eef4fb','#d6e2ee','#b8c8d8','#dfe8f0','#c0ccd8']},
 {n:'Volcano',cost:500,dusk:.75,sh:'peaks',top:[40,20,30],bot:[150,50,30],m:[70,34,36],h1:[56,28,30],h2:[42,22,24],t:[30,16,18],sil:[90,40,36],g:['#4a2622','#361a18','#241010','#3a1c18','#1c0c0a']},
 {n:'Arctic',cost:550,dusk:1,sh:'peaks',aur:1,top:[8,18,48],bot:[30,54,90],m:[26,46,74],h1:[34,56,84],h2:[26,44,68],t:[20,36,56],sil:[28,50,80],g:['#dfeef6','#c2d6e2','#a4bccc','#cfe0ea','#aec2d0']},
 {n:'Space',cost:600,dusk:1,sh:'space',aur:1,top:[6,4,26],bot:[26,14,58],m:[24,16,52],h1:[30,20,60],h2:[22,14,44],t:[18,12,38],sil:[30,20,66],g:['#3a2a5a','#2c1f48','#1e1436','#332552','#1a1030']}];
let mapOwned=[0];try{const o=JSON.parse(localStorage.getItem('flappy_maps')||'[0]');if(Array.isArray(o))mapOwned=o}catch(e){}
if(!mapOwned.includes(0))mapOwned.push(0);
if(!mapOwned.includes(cfg.map))cfg.map=0;                // don't use a map you don't own
const saveMaps=()=>{try{localStorage.setItem('flappy_maps',JSON.stringify(mapOwned))}catch(e){}};
let MAP=MAPS[cfg.map];
let pipes=[],particles=[],flocks=[],leaves=[],fireflies=[],coins=[];   // coins=collectible entities on screen
function updateCoinHud(pop){$('coinN').textContent=wallet;const h=$('coinHud');if(pop){h.classList.remove('pop');void h.offsetWidth;h.classList.add('pop')}}
for(let i=0;i<14;i++)fireflies.push({x:rand(0,W),y:rand(40,GROUND-40),ph:rand(0,6.3),sp:rand(.3,.8),r:rand(1.2,2.4),vx:rand(-.15,.15),vy:rand(-.15,.15)});
// Pre-rendered glow sprite so fireflies don't allocate a gradient every frame (avoids GC stutter)
const glowSprite=(()=>{const c=document.createElement('canvas');c.width=c.height=32;const x=c.getContext('2d');
  const g=x.createRadialGradient(16,16,0,16,16,16);g.addColorStop(0,'rgba(255,248,190,1)');g.addColorStop(.4,'rgba(255,246,150,.55)');g.addColorStop(1,'rgba(255,246,150,0)');
  x.fillStyle=g;x.fillRect(0,0,32,32);return c})();
function setState(s){state=s;box.dataset.state=s}
function show(id,on){$(id).classList.toggle('show',on);
  box.classList.toggle('blur',!!cfg.gfx&&!!document.querySelector('.screen.show:not(#start):not(#settings)'))}   // blur game behind overlays
 
/* Difficulty ramps with score: faster scroll, smaller gap, moving pipes later on */
const DM=[[.88,1.16],[1,1],[1.12,.88]];   // [speed, gap] multipliers for Easy/Normal/Hard
const speed=()=>(2.3+Math.min(score*.05,1.6))*DM[cfg.diff][0];
const gapSize=()=>Math.max(112,(162-score*1.6)*DM[cfg.diff][1]);
 
/* ---------- Bird ---------- */
const bird={x:110,y:300,vy:0,rot:0,wing:0,boost:0,spin:0,
  reset(){this.y=300;this.vy=0;this.rot=0;this.boost=0;this.spin=0},
  flap(){this.vy=-7.7;this.boost=1;snd.flap();
    for(let i=0;i<7;i++)particles.push({x:this.x-14,y:this.y+6,vx:rand(-3,-1),vy:rand(-.5,1.5),l:1,c:i%2?'#fff':'#ffe9a0',r:rand(2,4),g:.05})},
  update(dt,active){
    this.boost*=Math.pow(.92,dt);
    this.wing=Math.sin(t*(.35+.4*this.boost))*.85-.1;
    if(!active){this.y=300+Math.sin(t/10)*8;this.rot=Math.sin(t/10)*.05;return}
    this.vy=Math.min(this.vy+.45*dt,11);this.y+=this.vy*dt;
    // tilt up while rising, nose-dive while falling (smoothed)
    const target=Math.max(-.5,Math.min(1.45,this.vy*.08));
    this.rot+=state==='over'?this.spin*dt:(target-this.rot)*Math.min(1,.22*dt);
    if(this.y<BR){this.y=BR;if(this.vy<0)this.vy=0}     // ceiling collision
  },
  drawShadow(){                       // soft shadow cast on the ground
    const gy=GROUND-4,d=Math.max(0,Math.min(1,(gy-this.y)/300)),w=16*(1-d*.45);
    ctx.save();ctx.globalAlpha=(1-dusk*.6)*(.28*(1-d*.5));ctx.fillStyle='#000';
    ctx.beginPath();ctx.ellipse(this.x,gy,w,w*.28,0,0,7);ctx.fill();ctx.restore();
  },
  draw(dead){
    ctx.save();ctx.translate(this.x,this.y);ctx.rotate(this.rot);
    const K=SKINS[cfg.skin]||SKINS[0],s=1+this.boost*.12;ctx.scale(1/s,s);          // squash & stretch on flap
    ctx.lineJoin='round';ctx.strokeStyle='#8a4b08';ctx.lineWidth=2.4;
    // little dangling legs (tuck up on flap)
    const legK=dead?.5:(.5-this.boost*.9);ctx.strokeStyle='#e69328';ctx.lineWidth=2;ctx.lineCap='round';
    for(const lx of [-3,4]){ctx.beginPath();ctx.moveTo(lx,11);ctx.lineTo(lx-1,15+legK*3);ctx.lineTo(lx+3,17+legK*3);ctx.stroke()}
    ctx.strokeStyle='#8a4b08';ctx.lineWidth=2.4;
    ctx.fillStyle=K.t;ctx.beginPath();ctx.moveTo(-14,-1);ctx.lineTo(-26,-6);ctx.lineTo(-23,2);ctx.lineTo(-26,9);ctx.lineTo(-13,6);ctx.closePath();ctx.fill();ctx.stroke();
    const g=ctx.createLinearGradient(0,-14,0,14);g.addColorStop(0,K.a);g.addColorStop(1,K.b);
    ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(0,0,18,14,0,0,7);ctx.fill();ctx.stroke();
    ctx.fillStyle='#fff3c4';ctx.beginPath();ctx.ellipse(3,6,11,6,.1,0,7);ctx.fill();
    ctx.fillStyle=K.t;ctx.beginPath();ctx.moveTo(-3,-13);ctx.lineTo(0,-20);ctx.lineTo(3,-13);ctx.moveTo(1,-13.5);ctx.lineTo(6,-19);ctx.lineTo(8,-11);ctx.fill();
    ctx.fillStyle='rgba(255,100,90,.5)';ctx.beginPath();ctx.arc(8,4,3.6,0,7);ctx.fill();
    // eye
    ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(8,-5,6.3,0,7);ctx.fill();ctx.stroke();
    if(dead){ctx.lineWidth=1.8;ctx.beginPath();ctx.moveTo(6,-7);ctx.lineTo(11,-3);ctx.moveTo(11,-7);ctx.lineTo(6,-3);ctx.stroke();ctx.lineWidth=2.4}
    else{ctx.fillStyle='#222';ctx.beginPath();ctx.arc(10,-5,3,0,7);ctx.fill();ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(11,-6.3,1.1,0,7);ctx.fill()}
    // beak
    ctx.fillStyle='#ff6a3d';ctx.beginPath();ctx.moveTo(14,-1);ctx.quadraticCurveTo(26,-2,26,2);ctx.quadraticCurveTo(24,7,14,6);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.beginPath();ctx.moveTo(15,2.5);ctx.lineTo(24,2.5);ctx.stroke();
    // wing rotates around its shoulder
    ctx.save();ctx.translate(-4,2);ctx.rotate(dead?.9:this.wing);
    ctx.fillStyle=K.w;ctx.beginPath();ctx.ellipse(-6,0,11,6,0,0,7);ctx.fill();ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,.35)';ctx.beginPath();ctx.ellipse(-7,-1.5,6,2,0,0,7);ctx.fill();ctx.restore();
    ctx.restore();
  }};
/* ---------- Pipes ---------- */
function addPipe(x){
  const gap=gapSize(),base=rand(75,GROUND-gap-75);
  pipes.push({x,base,top:base,gap,passed:false,ph:rand(0,6.3),amp:score>=10?Math.min(28,(score-9)*2.5):0,seed:rand(0,100)});
  coins.push({px:x+PW/2,pipe:pipes[pipes.length-1],off:gap/2,got:false,ph:rand(0,6.3)});   // a coin floats in the gap
}
// Circle (bird) vs rectangle test - accurate for round bird against flat pipe edges
function hitRect(cx,cy,r,x,y,w,h){
  const nx=Math.max(x,Math.min(cx,x+w)),ny=Math.max(y,Math.min(cy,y+h)),dx=cx-nx,dy=cy-ny;
  return dx*dx+dy*dy<r*r;
}
function pipeHit(p){
  const r=BR-1,x=bird.x,y=bird.y,b=p.top+p.gap;
  return hitRect(x,y,r,p.x+4,0,PW-8,p.top-CAP)||hitRect(x,y,r,p.x-2,p.top-CAP,PW+4,CAP)||
         hitRect(x,y,r,p.x-2,b,PW+4,CAP)||hitRect(x,y,r,p.x+4,b+CAP,PW-8,H);
}
 
/* ---------- Flow ---------- */
function burst(x,y,n,cols,sp){for(let i=0;i<n;i++){const a=rand(0,6.28),v=rand(1,sp);
  particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-1,l:1,c:cols[i%cols.length],r:rand(2,5),g:.12})}}
function dust(x,y){for(let i=0;i<10;i++)particles.push({x:x+rand(-8,8),y,vx:rand(-2.5,2.5),vy:rand(-2,-.3),l:.9,d:.03,c:'#e3cd86',r:rand(2,4.5),g:.12})}
function setScore(n){score=n;const el=$('score');el.textContent=n;el.classList.remove('pop');void el.offsetWidth;el.classList.add('pop')}
function medalFor(s){return s>=100?'plat':s>=50?'gold':s>=25?'silver':s>=10?'bronze':null}
function setMedal(s){const m=$('medal'),k=medalFor(s);
  m.className='medal';if(!k){m.classList.add('m-none');return}
  m.classList.add('m-'+k);m.textContent={bronze:'★',silver:'★',gold:'★',plat:'✦'}[k];
  requestAnimationFrame(()=>m.classList.add('on'))}
function startGame(){
  snd.click();pipes=[];particles=[];coins=[];bird.reset();started=false;score=0;beat=false;cyc=0;$('score').textContent=0;$('best').textContent='Best '+best;updateCoinHud(false);
  show('start',false);show('over',false);setState('play');box.dataset.hint='1';
}
function firstFlap(){started=true;box.dataset.hint='0';addPipe(W+40)}
function die(){
  setState('over');overT=t;shake=14;flash=1;snd.hit();box.dataset.hint='0';bird.vy=-6;bird.spin=.3;   // pop up and spin as it falls
 
  burst(bird.x,bird.y,30,['#ffd23f','#ff7b3a','#fff'],6);
  const isNew=score>best&&score>0;
  if(score>best){best=score;try{localStorage.setItem('flappy_best',best)}catch(e){}}
  countUp($('fScore'),score);$('fBest').textContent=best;$('badge').classList.toggle('on',isNew);$('best').textContent='Best '+best;
  $('medal').className='medal m-none';   // reset before the reveal
  setTimeout(()=>{if(state!=='over')return;show('over',true);setMedal(score);if(medalFor(score))snd.medal();if(isNew)confetti()},650);   // let the fall play out first
}
function restart(){                     // quick white fade hides the reset
  snd.click();const c=$('curtain');c.classList.add('on');show('over',false);
  setTimeout(()=>{startGame();c.classList.remove('on')},220);
}
function togglePause(){
  if(state==='play'){setState('pause');show('pause',true);snd.click()}
  else if(state==='pause'){setState('play');show('pause',false);snd.click()}
}
function act(){                          // single input action for tap / click / Space
  snd.init();
  if($('settings').classList.contains('show'))return;
  if(state==='start')startGame();
  else if(state==='play'){if(!started)firstFlap();bird.flap()}
  else if(state==='over'&&t-overT>40)restart();
}
/* ---------- Effects & settings ---------- */
function countUp(el,to){const t0=performance.now();(function f(n){const k=Math.min(1,(n-t0)/700);el.textContent=Math.round(to*(1-Math.pow(1-k,3)));if(k<1)requestAnimationFrame(f)})(t0)}
function mile(txt){const m=$('mile');m.textContent=txt;m.classList.remove('go');void m.offsetWidth;m.classList.add('go')}
function milestone(){mile(score+'!');zoom=.05;[660,880,1320].forEach((f,i)=>snd.tone(f,f,.12,'square',.06,i*.1));
  burst(bird.x,bird.y,cfg.gfx?36:14,['#ff4d6d','#ffd23f','#5fd0ff','#8be04a','#c07bff'],7)}
function confetti(){snd.tone(523,1046,.25,'triangle',.12);const cs=['#ffd23f','#ff6a3d','#ff4d6d','#5fd0ff','#8be04a'];
  for(let i=0;i<(cfg.gfx?70:25);i++)particles.push({x:rand(0,W),y:rand(-60,0),vx:rand(-1,1),vy:rand(1,3),g:.05,l:1.8,d:.008,c:cs[i%5],r:rand(3,5),rect:1})}
function renderSettings(){   // just the toggles now — birds & maps live in the Shop
  document.querySelectorAll('.seg').forEach(g=>g.querySelectorAll('button').forEach(b=>b.classList.toggle('on',+b.dataset.v===+cfg[g.dataset.k])));
}
function rgbOf(a){return `rgb(${a[0]},${a[1]},${a[2]})`}
function wiggle(el){if(!el)return;el.style.transition='transform .07s';el.style.transform='translateX(-4px)';setTimeout(()=>el.style.transform='translateX(4px)',70);setTimeout(()=>el.style.transform='',140)}
function renderShop(){
  $('walletLbl').textContent=wallet;$('coinN').textContent=wallet;
  // --- Characters ---
  const box2=$('skins');box2.innerHTML='';
  SKINS.forEach((k,i)=>{
    const have=owned.includes(i),can=wallet>=k.cost,eq=cfg.skin===i;
    const cell=document.createElement('div');cell.className='skcell';
    const b=document.createElement('button');
    b.className='sk'+(eq?' on':'')+(have?'':' lock');
    b.style.background=`linear-gradient(${k.a},${k.b})`;
    b.title=have?k.n:k.n+' — '+k.cost+' coins';
    if(eq)b.innerHTML='<span class="tick">✓</span>';else if(!have)b.innerHTML='<span class="tick">🔒</span>';
    b.onclick=e=>{e.stopPropagation();
      if(have){cfg.skin=i;saveCfg();snd.click();renderShop();return}
      if(wallet>=k.cost){wallet-=k.cost;owned.push(i);cfg.skin=i;
        saveWallet();saveOwned();saveCfg();snd.coin();updateCoinHud(true);mile('Unlocked '+k.n+'!');renderShop();}
      else{snd.tone(200,150,.15,'square',.08);wiggle(box2.querySelectorAll('.skcell')[i])}
    };
    const name=document.createElement('div');name.className='skname';name.textContent=k.n;
    const cost=document.createElement('div');cost.className='skcost '+(have?'own':can?'can':'no');
    cost.innerHTML=have?(eq?'Equipped':'Owned'):'<span class="coinIcon"></span>'+k.cost;
    cell.appendChild(b);cell.appendChild(name);cell.appendChild(cost);box2.appendChild(cell);
  });
  // --- Maps ---
  const box3=$('maps');box3.innerHTML='';
  MAPS.forEach((k,i)=>{
    const have=mapOwned.includes(i),can=wallet>=k.cost,eq=cfg.map===i;
    const cell=document.createElement('div');cell.className='mpcell';
    const b=document.createElement('button');
    b.className='mp'+(eq?' on':'')+(have?'':' lock');
    b.style.background=`linear-gradient(to bottom, ${rgbOf(k.top)} 0%, ${rgbOf(k.bot)} 58%, ${k.g[0]} 58%, ${k.g[4]} 100%)`;
    b.title=have?k.n:k.n+' — '+k.cost+' coins';
    if(eq)b.innerHTML='<span class="tick">✓</span>';else if(!have)b.innerHTML='<span class="tick">🔒</span>';
    b.onclick=e=>{e.stopPropagation();
      if(have){cfg.map=i;MAP=MAPS[i];saveCfg();snd.click();renderShop();return}
      if(wallet>=k.cost){wallet-=k.cost;mapOwned.push(i);cfg.map=i;MAP=MAPS[i];
        saveWallet();saveMaps();saveCfg();snd.coin();updateCoinHud(true);mile('Unlocked '+k.n+'!');renderShop();}
      else{snd.tone(200,150,.15,'square',.08);wiggle(box3.querySelectorAll('.mpcell')[i])}
    };
    const name=document.createElement('div');name.className='mpname';name.textContent=k.n;
    const cost=document.createElement('div');cost.className='skcost '+(have?'own':can?'can':'no');
    cost.innerHTML=have?(eq?'Playing':'Owned'):'<span class="coinIcon"></span>'+k.cost;
    cell.appendChild(b);cell.appendChild(name);cell.appendChild(cost);box3.appendChild(cell);
  });
  // --- tab visibility ---
  $('skins').style.display=shopTab==='maps'?'none':'';
  $('maps').style.display=shopTab==='maps'?'':'none';
  $('tabBirds').classList.toggle('on',shopTab!=='maps');
  $('tabMaps').classList.toggle('on',shopTab==='maps');
  $('shopNote').textContent=shopTab==='maps'
    ?'Unlock new locations with coins, then tap one to play there.'
    :'Fly through the pipes to grab coins, then tap a locked character to unlock it.';
}
let setFrom='start',shopFrom='start',shopTab='birds';
function openSet(from){setFrom=from;snd.click();show(from,false);renderSettings();show('settings',true)}
function openShop(from){shopFrom=from;snd.click();renderShop();show(from,false);show('shop',true)}
/* ---------- Input ---------- */
box.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;e.preventDefault();act()});
addEventListener('keydown',e=>{
  if(e.code==='Space'){e.preventDefault();if(!e.repeat)act()}
  else if((e.code==='KeyP'||e.code==='Escape')&&!e.repeat)togglePause();
});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&state==='play'&&started)togglePause()});
const wire=(id,fn)=>$(id).addEventListener('click',e=>{e.stopPropagation();snd.init();fn();e.currentTarget.blur()});
wire('setBtn',()=>openSet('start'));wire('setBtn2',()=>openSet('pause'));
wire('shopBtn',()=>openShop('start'));wire('shopBtn2',()=>openShop('pause'));
wire('tabBirds',()=>{shopTab='birds';renderShop()});wire('tabMaps',()=>{shopTab='maps';renderShop()});
wire('backBtn',()=>{snd.click();show('settings',false);show(setFrom,true)});
wire('shopBackBtn',()=>{snd.click();show('shop',false);show(shopFrom,true)});
document.querySelectorAll('.seg button').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();snd.init();
  const k=b.parentNode.dataset.k;cfg[k]=+b.dataset.v;if(k==='sound'){snd.on=!!cfg.sound;$('soundBtn').textContent=snd.on?'🔊':'🔇'}
  saveCfg();snd.click();renderSettings();show('settings',true)}));
wire('playBtn',startGame);wire('restartBtn',restart);wire('resumeBtn',togglePause);wire('pauseBtn',togglePause);
wire('soundBtn',()=>{snd.on=!snd.on;cfg.sound=+snd.on;saveCfg();$('soundBtn').textContent=snd.on?'🔊':'🔇';snd.click()});
/* ---------- Update ---------- */
// three cloud layers: far (small, slow, faint) to near (big, faster, opaque)
const clouds=Array.from({length:9},(_,i)=>{const l=i%3;return{x:i*50,y:rand(30,250),s:[.5,.8,1.25][l],v:[.12,.25,.5][l],a:[.45,.65,.88][l]}}).sort((a,b)=>a.s-b.s);
const stars=Array.from({length:44},()=>({x:rand(0,W),y:rand(0,300),r:rand(.5,1.6),p:rand(0,6)}));
function update(dt){
  t+=dt;
  const running=state==='play'&&started;
  if(state!=='over')scroll+=speed()*dt*(state==='start'||!started?.6:1);
  clouds.forEach(c=>{c.x-=c.v*dt;if(c.x<-100)c.x=W+60;});
  cyc=0;dusk+=(MAP.dusk-dusk)*.06*dt;   // fixed per map, eased so switching maps fades smoothly
    // smooth day/night cycle
  bird.update(dt,state==='over'||running);
  if(running&&(cfg.gfx||(t|0)%3===0))particles.push({x:bird.x-12,y:bird.y+2,vx:-speed()*.6,vy:rand(-.2,.2),g:0,l:.7,d:.04,c:SKINS[cfg.skin].tr,r:rand(3,5)});   // bird trail
  camY+=(Math.max(-10,Math.min(10,(bird.y-300)*.05))-camY)*.08*dt;zoom*=Math.pow(.93,dt);   // camera follow + zoom punch
  if(cfg.gfx&&Math.random()<.004*dt&&flocks.length<3){const d=Math.random()<.5?1:-1;flocks.push({x:d>0?-40:W+40,y:rand(60,260),d,n:3+(Math.random()*4|0),v:rand(.5,.9),ph:rand(0,6)})}
  flocks.forEach(f=>f.x+=f.d*f.v*dt);flocks=flocks.filter(f=>f.x>-60&&f.x<W+60);
  // ambient: drifting leaves by day, fireflies by night
  if(cfg.gfx&&dusk<.6&&Math.random()<.03*dt&&leaves.length<12)
    leaves.push({x:rand(-20,W),y:-10,vx:rand(-.6,-.1)-speed()*.1,vy:rand(.4,.9),rot:rand(0,6.3),vr:rand(-.06,.06),sway:rand(0,6.3),r:rand(3,5.5),c:['#8be04a','#ffcf4d','#ff9a4d','#e0c04a'][Math.random()*4|0]});
  leaves.forEach(l=>{l.sway+=.03*dt;l.x+=(l.vx+Math.sin(l.sway)*.5)*dt;l.y+=l.vy*dt;l.rot+=l.vr*dt});
  leaves=leaves.filter(l=>l.y<GROUND+10&&l.x>-30);
  fireflies.forEach(f=>{f.ph+=f.sp*.05*dt;f.x+=f.vx*dt;f.y+=f.vy*dt;
    if(f.x<0||f.x>W)f.vx*=-1;if(f.y<30||f.y>GROUND-20)f.vy*=-1});
  if(running){
    pipes.forEach(p=>{p.x-=speed()*dt;p.top=p.base+Math.sin(t*.03+p.ph)*p.amp});
    if(pipes[0].x<-PW-10)pipes.shift();
    if(pipes[pipes.length-1].x<W-rand(195,225))addPipe(W+30);
    for(const p of pipes){
      if(!p.passed&&p.x+PW<bird.x){p.passed=true;setScore(score+1);snd.point();burst(bird.x+8,bird.y,cfg.gfx?14:6,['#ffd23f','#fff','#ffb02e'],4);
        if(score%10===0)milestone();     // combo effect every 10 points
        else if(!beat&&best>0&&score>best){beat=true;mile('NEW HIGH SCORE!');snd.tone(784,1568,.3,'triangle',.1)}}
      if(pipeHit(p)){die();break}
    }
    // coins: ride along with their pipe, collected when the bird overlaps them
    for(const c of coins){
      c.px-=speed()*dt;c.ph+=.12*dt;
      if(!c.got){
        const cx=c.px,cy=c.pipe.top+c.off,dx=bird.x-cx,dy=bird.y-cy;
        if(dx*dx+dy*dy<(BR+11)*(BR+11)){
          c.got=true;wallet++;saveWallet();updateCoinHud(true);snd.coin();
          burst(cx,cy,10,['#ffe86e','#ffc02e','#fff6c0'],3.5);
        }
      }
    }
    coins=coins.filter(c=>!c.got&&c.px>-20);
    if(bird.y+BR>=GROUND){bird.y=GROUND-BR;dust(bird.x,GROUND);die()}      // ground collision
  }
  if(state==='over'&&bird.vy>=0&&bird.y+BR>=GROUND){if(bird.vy>1.5)dust(bird.x,GROUND);bird.y=GROUND-BR;bird.vy=0;bird.spin*=Math.pow(.8,dt)}
  particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=p.g*dt;p.l-=(p.d||.03)*dt});
  particles=particles.filter(p=>p.l>0);
  shake*=Math.pow(.86,dt);flash*=Math.pow(.88,dt);
}
/* ---------- Rendering ---------- */
// Colors come from the selected map's palette (fixed per location, no day/night cycling)
const col=k=>{const a=MAP[k];return `rgb(${a[0]},${a[1]},${a[2]})`};
 
// aurora gradients are constant, so build them once (no per-frame allocation)
const AUR=[['#3ff0b0',60],['#7a6bff',95],['#ff7ad0',130]].map(([c,y0])=>{
  const g=ctx.createLinearGradient(0,0,0,y0+40);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,c);return {g,y0}});
function drawAurora(){                  // shimmering night sky ribbons
  if(!MAP.aur||dusk<.35)return;ctx.save();ctx.globalCompositeOperation='lighter';
  AUR.forEach((band,bi)=>{ctx.beginPath();ctx.moveTo(0,band.y0);
    for(let x=0;x<=W;x+=16){const y=band.y0+Math.sin(x/70+t*.02+bi)*18+Math.sin(x/33-t*.015)*7;ctx.lineTo(x,y)}
    ctx.lineTo(W,0);ctx.lineTo(0,0);ctx.closePath();
    ctx.fillStyle=band.g;ctx.globalAlpha=(dusk-.35)*.32;ctx.fill()});
  ctx.restore();ctx.globalAlpha=1;
}
function drawSky(){
  const g=ctx.createLinearGradient(0,0,0,GROUND);g.addColorStop(0,col('top'));g.addColorStop(1,col('bot'));
  ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  drawAurora();
  stars.forEach(s=>{ctx.globalAlpha=dusk*(.5+.5*Math.sin(t/25+s.p));ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,7);ctx.fill()});
  const c=((cyc%3)+3)%3,sy=110+(c<2?c*70:(3-c)*140),sg=ctx.createRadialGradient(305,sy,5,305,sy,70);
  sg.addColorStop(0,'rgba(255,245,200,.95)');sg.addColorStop(1,'rgba(255,245,200,0)');
  ctx.globalAlpha=1-dusk;ctx.fillStyle=sg;ctx.beginPath();ctx.arc(305,sy,70,0,7);ctx.fill();
  // soft god-rays fanning from the sun (daytime only)
  if((1-dusk)>.15){ctx.save();ctx.globalCompositeOperation='lighter';ctx.translate(305,sy);
    for(let i=0;i<7;i++){const a=t*.004+i*(6.283/7),len=170,wid=.09;ctx.globalAlpha=(1-dusk)*.05*(.6+.4*Math.sin(t*.03+i));
      ctx.fillStyle='#fff6cf';ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(a-wid)*len,Math.sin(a-wid)*len);ctx.lineTo(Math.cos(a+wid)*len,Math.sin(a+wid)*len);ctx.closePath();ctx.fill()}
    ctx.restore()}
  ctx.globalAlpha=dusk;const mg=ctx.createRadialGradient(80,90,10,80,90,95);mg.addColorStop(0,'rgba(200,220,255,.65)');mg.addColorStop(1,'rgba(200,220,255,0)');
  ctx.fillStyle=mg;ctx.beginPath();ctx.arc(80,90,95,0,7);ctx.fill();       // moon glow
  ctx.fillStyle='#fff8dc';ctx.beginPath();ctx.arc(80,90,22,0,7);ctx.fill();
  ctx.fillStyle='rgba(170,170,200,.45)';ctx.beginPath();ctx.arc(74,86,5,0,7);ctx.arc(88,97,4,0,7);ctx.fill();
  ctx.globalAlpha=1;
}
function drawClouds(){
  const R_=255-dusk*130|0,G_=255-dusk*115|0,B_=255-dusk*60|0;
  clouds.forEach(c=>{const s=c.s,x=c.x,y=c.y;ctx.fillStyle=`rgba(${R_},${G_},${B_},${c.a})`;ctx.beginPath();
    ctx.arc(x,y,16*s,0,7);ctx.arc(x+20*s,y-9*s,22*s,0,7);ctx.arc(x+44*s,y-2*s,18*s,0,7);ctx.arc(x+26*s,y+4*s,18*s,0,7);ctx.fill()});
}
// distant silhouette for extra depth (shape depends on the map: treeline, city, dunes, peaks)
function drawSilhouette(){
  const sh=MAP.sh,o=scroll*.06;ctx.fillStyle=col('sil');ctx.globalAlpha=.6;
  if(sh==='space'){ctx.globalAlpha=1;return}   // space has no horizon skyline
  if(sh==='city'){
    ctx.beginPath();ctx.moveTo(0,GROUND);
    const gap=34,off=((o%gap)+gap)%gap;
    for(let i=-1;i*gap-off<W+gap;i++){const x=i*gap-off,seed=((i*73)%100+100)%100,bw=22+seed%10,bh=90+ (seed*1.7)%110;
      ctx.lineTo(x,GROUND);ctx.lineTo(x,GROUND-bh);ctx.lineTo(x+bw,GROUND-bh);ctx.lineTo(x+bw,GROUND)}
    ctx.lineTo(W,GROUND);ctx.closePath();ctx.fill();
    // lit windows
    ctx.globalAlpha=.5;ctx.fillStyle='rgba(255,220,130,.9)';
    for(let i=-1;i*gap-off<W+gap;i++){const x=i*gap-off,seed=((i*73)%100+100)%100,bw=22+seed%10,bh=90+(seed*1.7)%110;
      for(let wy=GROUND-bh+8;wy<GROUND-8;wy+=14)for(let wx=x+4;wx<x+bw-4;wx+=9){if(((wx*7+wy*13+i)|0)%3===0)ctx.fillRect(wx,wy,4,6)}}
    ctx.globalAlpha=1;return;
  }
  if(sh==='peaks'){
    ctx.beginPath();ctx.moveTo(0,GROUND);const gap=70,off=((o%gap)+gap)%gap;
    for(let i=-1;i*gap-off<W+gap;i++){const x=i*gap-off,ph=170+(((i*37)%60)+60)%60;
      ctx.lineTo(x,GROUND);ctx.lineTo(x+gap/2,GROUND-ph);ctx.lineTo(x+gap,GROUND)}
    ctx.lineTo(W,GROUND);ctx.closePath();ctx.fill();
    // snowy caps
    ctx.fillStyle='rgba(255,255,255,.5)';
    for(let i=-1;i*gap-off<W+gap;i++){const x=i*gap-off,ph=170+(((i*37)%60)+60)%60,cx=x+gap/2;
      ctx.beginPath();ctx.moveTo(cx,GROUND-ph);ctx.lineTo(cx-16,GROUND-ph+30);ctx.lineTo(cx+16,GROUND-ph+30);ctx.closePath();ctx.fill()}
    ctx.globalAlpha=1;return;
  }
  const amp=sh==='dunes'?55:120,wl=sh==='dunes'?150:110,rough=sh==='dunes'?0:10;
  ctx.beginPath();ctx.moveTo(0,GROUND);
  for(let x=0;x<=W+20;x+=20){const h=amp+Math.sin((x+o)/wl)*30;
    ctx.lineTo(x,GROUND-h);ctx.lineTo(x+10,GROUND-h+Math.sin((x+o)/40)*rough)}
  ctx.lineTo(W,GROUND);ctx.closePath();ctx.fill();ctx.globalAlpha=1;
}
function drawFlocks(){   // decorative background birds
  ctx.strokeStyle=`rgba(${60-dusk*40|0},${60-dusk*40|0},${90-dusk*30|0},.6)`;ctx.lineWidth=1.6;ctx.lineCap='round';
  flocks.forEach(f=>{for(let i=0;i<f.n;i++){const x=f.x-f.d*i*16,y=f.y+Math.abs(i-f.n/2)*7,w=Math.sin(t*.22+f.ph+i*.6)*4;
    ctx.beginPath();ctx.moveTo(x-6,y-w);ctx.quadraticCurveTo(x-2,y-w-3,x,y);ctx.quadraticCurveTo(x+2,y-w-3,x+6,y-w);ctx.stroke()}})}
function drawParallax(){
  let o=scroll*.12;ctx.fillStyle=col('m');ctx.beginPath();ctx.moveTo(0,GROUND);
  for(let x=0;x<=W+8;x+=8)ctx.lineTo(x,GROUND-95-Math.abs(Math.sin((x+o)/75))*55-Math.sin((x+o)/19)*4);
  ctx.lineTo(W,GROUND);ctx.fill();
  o=scroll*.3;ctx.fillStyle=col('h1');ctx.beginPath();ctx.moveTo(0,GROUND);
  for(let x=0;x<=W+8;x+=8)ctx.lineTo(x,GROUND-50-Math.sin((x+o)/48)*22-Math.sin((x+o)/17)*5);
  ctx.lineTo(W,GROUND);ctx.fill();
  o=scroll*.6;ctx.fillStyle=col('h2');ctx.beginPath();ctx.moveTo(0,GROUND);
  for(let x=0;x<=W+8;x+=8)ctx.lineTo(x,GROUND-22-Math.sin((x+o)/34)*10);
  ctx.lineTo(W,GROUND);ctx.fill();
  ctx.fillStyle=col('t');
  for(let i=Math.floor(o/36)-1;i<Math.floor((o+W)/36)+2;i++){const x=i*36-o,h=10+(((i*7)%5)+5)%5*4;
    ctx.beginPath();ctx.arc(x,GROUND-h/2,10+h/3,0,7);ctx.fill()}
  ctx.fillRect(0,GROUND-10,W,12);
}
function drawPipe(x,y,h,flip,seed){          // flip=true: hangs from the top
  const g=ctx.createLinearGradient(x,0,x+PW,0);
  g.addColorStop(0,'#2f7a1c');g.addColorStop(.28,'#a7e85f');g.addColorStop(.5,'#76c93a');g.addColorStop(.72,'#3f9a26');g.addColorStop(1,'#245c14');
  ctx.save();ctx.shadowColor='rgba(0,0,0,.28)';ctx.shadowBlur=cfg.gfx?8:0;ctx.shadowOffsetX=4;
  ctx.fillStyle=g;ctx.strokeStyle='#1d4a10';ctx.lineWidth=3;
  const bodyY=flip?y:y+CAP,bodyH=h-CAP,capY=flip?y+h-CAP:y;
  ctx.fillRect(x+4,bodyY,PW-8,bodyH);ctx.strokeRect(x+4,bodyY,PW-8,bodyH);
  ctx.fillStyle=g;ctx.beginPath();ctx.roundRect(x-2,capY,PW+4,CAP,7);ctx.fill();ctx.restore();
  // rivet scanlines + highlights (no shadow, cheap)
  ctx.save();ctx.beginPath();ctx.rect(x+4,bodyY,PW-8,bodyH);ctx.clip();
  ctx.strokeStyle='rgba(30,74,16,.22)';ctx.lineWidth=1;
  for(let ry=bodyY+6;ry<bodyY+bodyH;ry+=14){ctx.beginPath();ctx.moveTo(x+6,ry);ctx.lineTo(x+PW-6,ry);ctx.stroke()}
  ctx.restore();
  ctx.strokeStyle='#1d4a10';ctx.lineWidth=3;ctx.beginPath();ctx.roundRect(x-2,capY,PW+4,CAP,7);ctx.stroke();
  ctx.fillStyle='rgba(255,255,255,.35)';                         // glossy highlights
  ctx.fillRect(x+12,bodyY+3,6,bodyH-6);ctx.beginPath();ctx.roundRect(x+6,capY+5,6,CAP-10,3);ctx.fill();
  ctx.fillStyle='rgba(0,0,0,.14)';ctx.fillRect(x+PW-14,bodyY+3,5,bodyH-6);   // shaded right edge
  // a couple of little leaves sprouting near the cap (high graphics only)
  if(cfg.gfx){const ly=flip?capY:capY+CAP,dir=flip?-1:1,sw=Math.sin(t*.03+(seed||0))*.12;
    ctx.save();ctx.translate(x+(((seed||0)|0)%2?PW-8:8),ly);ctx.fillStyle='#4fae2c';ctx.strokeStyle='#2f7a1c';ctx.lineWidth=1.4;
    for(const s of [-1,1]){ctx.save();ctx.rotate(s*.7+sw+dir*.2);ctx.beginPath();ctx.ellipse(0,dir*-6,3.4,7,0,0,7);ctx.fill();ctx.stroke();ctx.restore()}
    ctx.restore()}
}
function drawGround(){
  const G=MAP.g;   // [grass, grassShade, darkLine, dirtTop, dirtBot]
  const dg=ctx.createLinearGradient(0,GROUND,0,H);dg.addColorStop(0,G[3]);dg.addColorStop(1,G[4]);
  ctx.fillStyle=dg;ctx.fillRect(0,GROUND,W,H-GROUND);
  ctx.fillStyle=G[0];ctx.fillRect(0,GROUND,W,16);
  ctx.fillStyle=G[1];const o=scroll%40;
  for(let x=-o-40;x<W+40;x+=40){ctx.beginPath();ctx.moveTo(x,GROUND);ctx.lineTo(x+20,GROUND);ctx.lineTo(x+8,GROUND+16);ctx.lineTo(x-12,GROUND+16);ctx.fill()}
  ctx.fillStyle=G[2];ctx.fillRect(0,GROUND+16,W,4);
  ctx.fillStyle='rgba(0,0,0,.08)';for(let x=-o;x<W;x+=40)ctx.fillRect(x,GROUND+34,14,5);
  if(dusk>.05){ctx.fillStyle=`rgba(20,20,50,${dusk*.3})`;ctx.fillRect(0,GROUND,W,H-GROUND)}   // darkens on night maps
}
function drawLeaves(){leaves.forEach(l=>{ctx.save();ctx.translate(l.x,l.y);ctx.rotate(l.rot);ctx.globalAlpha=.9;
  ctx.fillStyle=l.c;ctx.beginPath();ctx.ellipse(0,0,l.r,l.r*.5,0,0,7);ctx.fill();
  ctx.strokeStyle='rgba(0,0,0,.15)';ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(-l.r,0);ctx.lineTo(l.r,0);ctx.stroke();ctx.restore()});ctx.globalAlpha=1}
function drawFireflies(){if(dusk<.3)return;ctx.save();ctx.globalCompositeOperation='lighter';
  fireflies.forEach(f=>{const a=dusk*(.35+.65*(.5+.5*Math.sin(f.ph))),s=f.r*8;ctx.globalAlpha=a;
    ctx.drawImage(glowSprite,f.x-s/2,f.y-s/2,s,s)});ctx.globalAlpha=1;ctx.restore()}
function drawSpeedLines(){const sp=speed();if(sp<3.2||state!=='play'||!started)return;const n=6,a=Math.min(.16,(sp-3.2)*.12);
  ctx.strokeStyle=`rgba(255,255,255,${a})`;ctx.lineWidth=2;ctx.lineCap='round';
  for(let i=0;i<n;i++){const y=((i*97+scroll*3)%(GROUND-40))+20,len=30+((i*53)%40),x=W-((scroll*4+i*130)%(W+120));
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+len,y);ctx.stroke()}}
let _vig=null;
function vignette(){if(!_vig){_vig=ctx.createRadialGradient(W/2,H*.42,H*.28,W/2,H*.5,H*.72);
    _vig.addColorStop(0,'rgba(0,0,0,0)');_vig.addColorStop(1,'rgba(0,0,0,.28)')}
  ctx.fillStyle=_vig;ctx.fillRect(0,0,W,H)}
function drawCoins(){
  for(const c of coins){
    if(c.got||c.px<-20||c.px>W+20)continue;
    const cy=c.pipe.top+c.off,r=11,sx=Math.abs(Math.cos(c.ph)),bob=Math.sin(c.ph*.7)*2;
    ctx.save();ctx.translate(c.px,cy+bob);
    // soft glow
    ctx.globalAlpha=.5;ctx.fillStyle='rgba(255,214,80,.7)';ctx.beginPath();ctx.arc(0,0,r+4,0,7);ctx.fill();ctx.globalAlpha=1;
    ctx.scale(Math.max(.12,sx),1);   // spin: squashes horizontally
    const g=ctx.createLinearGradient(-r,-r,r,r);g.addColorStop(0,'#fff3b0');g.addColorStop(.5,'#ffcf33');g.addColorStop(1,'#e0a41a');
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,r,0,7);ctx.fill();
    ctx.lineWidth=2;ctx.strokeStyle='#b8790a';ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,.55)';ctx.beginPath();ctx.arc(-r*.28,-r*.3,r*.28,0,7);ctx.fill();   // highlight
    ctx.fillStyle='#c48a12';ctx.font='bold '+(r*1.15)+'px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('$',0,r*.08);
    ctx.restore();
  }
}
function draw(){
  ctx.setTransform(scale*dpr,0,0,scale*dpr,0,0);
  ctx.save();const z=1.04+zoom,sx=shake>.4?rand(-1,1)*shake:0,sy2=shake>.4?rand(-1,1)*shake:0;ctx.translate(W/2,H/2);ctx.scale(z,z);ctx.translate(-W/2+sx,-H/2-camY+sy2);   // screen shake on crash
  drawSky();drawClouds();drawSilhouette();drawFlocks();drawParallax();drawFireflies();drawLeaves();
  pipes.forEach(p=>{drawPipe(p.x,0,p.top,true,p.seed);drawPipe(p.x,p.top+p.gap,GROUND-p.top-p.gap,false,p.seed)});
  drawCoins();
  drawGround();drawSpeedLines();
  particles.forEach(p=>{ctx.globalAlpha=Math.max(0,Math.min(1,p.l));ctx.fillStyle=p.c;if(p.rect)ctx.fillRect(p.x,p.y,p.r*1.6,p.r*.8);else{ctx.beginPath();ctx.arc(p.x,p.y,p.r*Math.min(1,p.l),0,7);ctx.fill()}});
  ctx.globalAlpha=1;
  bird.drawShadow();
  bird.draw(state==='over');
  ctx.restore();
  vignette();
  if(flash>.02){ctx.fillStyle=`rgba(255,255,255,${flash*.8})`;ctx.fillRect(0,0,W,H)}
}
 
/* ---------- Main loop (delta-time based so speed is identical at 60/120/144Hz) ---------- */
$('soundBtn').textContent=snd.on?'🔊':'🔇';
let last=performance.now();
// reset the clock when returning to the tab so we don't get one huge catch-up step
document.addEventListener('visibilitychange',()=>{if(!document.hidden)last=performance.now()});
function frame(now){
  const dt=Math.min(2.5,(now-last)/16.667||1);last=now;
  if(state!=='pause')update(dt);
  draw();requestAnimationFrame(frame);
}
$('best').textContent='Best '+best;
updateCoinHud(false);
requestAnimationFrame(frame);
