const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
<head><script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1093096696607313"
     crossorigin="anonymous"></script></head>
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// ================= AUDIO =================
let audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function tone(f,t,type="sine",v=0.1){
  let o=audioCtx.createOscillator();
  let g=audioCtx.createGain();
  o.type=type;
  o.frequency.value=f;
  g.gain.value=v;
  o.connect(g);
  g.connect(audioCtx.destination);
  o.start();
  o.stop(audioCtx.currentTime+t);
}

function sfx(n){
  if(n==="death"){
    tone(80,0.2,"sawtooth",0.25);
    setTimeout(()=>tone(40,0.3,"square",0.2),120);
  }
  if(n==="win"){
    tone(500,0.1);
    setTimeout(()=>tone(700,0.1),120);
    setTimeout(()=>tone(900,0.2),240);
  }
  if(n==="pickup"){
    tone(900,0.05,"triangle",0.15);
  }
  if(n==="heartbeat"){
    tone(120,0.04,"sine",0.05);
  }
}

// ================= STATE =================
let state="menu";
let level=1;
let streak=0;
let best=0;

let startTime=0;
let levelTimer=0;

// ================= INPUT =================
const keys={};

// ================= WORLD =================
const tile=40;
let cols,rows;
let grid=[];
let walls=[];

// ================= ENTITIES =================
const player={x:0,y:0,size:20,speed:3};
const goal={x:0,y:0,size:25};
let enemy=null;

// ================= DIRECTOR =================
let stress=0;
let shake=0;

// ================= POWERUPS =================
let powerups=[];
let visionTimer=0;

// ================= HEARTBEAT =================
let hb=0;

// ================= INPUT =================
document.addEventListener("keydown",(e)=>{
  keys[e.key.toLowerCase()]=true;
  if(audioCtx.state==="suspended") audioCtx.resume();

  if(state==="menu" && e.code==="Space") startGame();
  if(state==="dead" && e.code==="Space") startGame();
  if(state==="level" && e.code==="Space") nextLevel();
});

document.addEventListener("keyup",(e)=>{
  keys[e.key.toLowerCase()]=false;
});

// ================= MAZE =================
function generateMaze(){
  cols=Math.floor(canvas.width/tile);
  rows=Math.floor(canvas.height/tile);

  grid=Array.from({length:rows},()=>Array(cols).fill(1));

  function carve(x,y){
    grid[y][x]=0;
    let dirs=[[1,0],[-1,0],[0,1],[0,-1]].sort(()=>Math.random()-0.5);

    for(let[dX,dY]of dirs){
      let nx=x+dX*2,ny=y+dY*2;
      if(nx>0&&ny>0&&nx<cols-1&&ny<rows-1&&grid[ny][nx]){
        grid[y+dY][x+dX]=0;
        carve(nx,ny);
      }
    }
  }

  carve(1,1);

  walls=[];
  for(let y=0;y<rows;y++){
    for(let x=0;x<cols;x++){
      if(grid[y][x]) walls.push({x:x*tile,y:y*tile});
    }
  }

  // borders
  for(let x=0;x<cols;x++){
    walls.push({x:x*tile,y:0});
    walls.push({x:x*tile,y:(rows-1)*tile});
  }
  for(let y=0;y<rows;y++){
    walls.push({x:0,y:y*tile});
    walls.push({x:(cols-1)*tile,y:y*tile});
  }
}

// ================= COLLISION =================
function hit(x,y,s){
  return walls.some(w =>
    x<w.x+tile &&
    x+s>w.x &&
    y<w.y+tile &&
    y+s>w.y
  );
}

// ================= MOVE =================
function move(o,dx,dy){
  let nx=o.x+dx*o.speed;
  let ny=o.y+dy*o.speed;

  if(!hit(nx,o.y,o.size)) o.x=nx;
  if(!hit(o.x,ny,o.size)) o.y=ny;
}

// ================= SPAWN =================
function free(){
  for(let i=0;i<5000;i++){
    let x=Math.floor(Math.random()*cols);
    let y=Math.floor(Math.random()*rows);
    if(grid[y][x]===0) return{x:x*tile,y:y*tile};
  }
  return{x:tile,y:tile};
}

// ================= POWERUPS =================
function spawnPowerups(){
  powerups=[];
  let count=3+Math.floor(level/2);

  for(let i=0;i<count;i++){
    powerups.push({...free(),type:"vision"});
  }
}

// ================= START =================
function startGame(){
  state="play";

  startTime=performance.now();
  levelTimer=0;

  generateMaze();

  let p=free();
  let g=free();

  player.x=p.x;
  player.y=p.y;

  goal.x=g.x;
  goal.y=g.y;

  enemy=null;

  if(level>=2){
    let e=free();
    enemy={x:e.x,y:e.y,size:20,speed:1.5};
  }

  spawnPowerups();
  visionTimer=0;
}

// ================= NEXT =================
function nextLevel(){
  level++;
  streak++;
  if(streak>best) best=streak;
  startGame();
}

// ================= DIRECTOR =================
function updateDirector(){
  let t=(performance.now()-startTime)/1000;

  stress=Math.min(100,t*(1+level*0.3+streak*0.2));
  shake=stress/15;

  player.speed=Math.max(1.2,3-stress/160);

  hb--;
  if(stress>50 && hb<=0){
    sfx("heartbeat");
    hb=Math.max(5,40-stress/3);
  }
}

// ================= ENEMY (FAIR MODE FIXED) =================
function updateEnemy(){
  if(!enemy) return;

  let dx=player.x-enemy.x;
  let dy=player.y-enemy.y;
  let d=Math.max(1,Math.hypot(dx,dy));

  // 🧠 FAIR AI BALANCE
  let baseSpeed = 0.45;          // slower start
  let levelBoost = level * 0.05; // gentle scaling
  let stressBoost = stress / 450;

  let finalSpeed = baseSpeed + levelBoost + stressBoost;

  // HARD CAP (no impossible speed)
  finalSpeed = Math.min(finalSpeed, 1.85);

  // 🧠 FAIR CATCH-UP (important!)
  if(d > 320){
    finalSpeed *= 0.7;
  }

  // movement
  enemy.x += dx/d * finalSpeed;
  enemy.y += dy/d * finalSpeed;

  if(Math.hypot(player.x-enemy.x,player.y-enemy.y)<18){
    sfx("death");
    streak=0;
    state="dead";
  }
}

// ================= UPDATE =================
function update(){
  if(state!=="play" && state!=="level") return;

  updateDirector();

  let dx=0,dy=0;
  if(keys["w"])dy--;
  if(keys["s"])dy++;
  if(keys["a"])dx--;
  if(keys["d"])dx++;

  move(player,dx,dy);

  updateEnemy();

  // powerups
  for(let i=powerups.length-1;i>=0;i--){
    let p=powerups[i];

    if(
      player.x<p.x+20 &&
      player.x+player.size>p.x &&
      player.y<p.y+20 &&
      player.y+player.size>p.y
    ){
      visionTimer=1200;
      sfx("pickup");
      powerups.splice(i,1);
    }
  }

  if(visionTimer>0) visionTimer--;

  // win
  if(
    player.x<goal.x+goal.size &&
    player.x+player.size>goal.x &&
    player.y<goal.y+goal.size &&
    player.y+player.size>goal.y
  ){
    sfx("win");
    state="level";
    levelTimer=60;
  }

  if(state==="level"){
    levelTimer--;
    if(levelTimer<=0){
      nextLevel();
    }
  }
}

// ================= DRAW =================
function draw(){
  ctx.save();

  ctx.translate(
    (Math.random()-0.5)*shake,
    (Math.random()-0.5)*shake
  );

  ctx.clearRect(0,0,canvas.width,canvas.height);

  if(state==="menu"){
    ctx.fillStyle="#000";
    ctx.fillRect(0,0,canvas.width,canvas.height);

    ctx.fillStyle="#fff";
    ctx.textAlign="center";
    ctx.font="40px Arial";
    ctx.fillText("CHAOS MAZE",canvas.width/2,canvas.height/2);

    ctx.font="16px Arial";
    ctx.fillText("SPACE TO START",canvas.width/2,canvas.height/2+40);

    ctx.restore();
    return;
  }

  let vision=visionTimer>0?9999:Math.max(110,260-stress*0.35);

  for(let w of walls){
    let d=Math.hypot(player.x-w.x,player.y-w.y);
    if(d<vision){
      ctx.fillStyle="#222";
      ctx.fillRect(w.x,w.y,tile,tile);
    }
  }

  for(let p of powerups){
    ctx.fillStyle="cyan";
    ctx.fillRect(p.x,p.y,20,20);
  }

  ctx.fillStyle="red";
  ctx.fillRect(goal.x,goal.y,goal.size,goal.size);

  if(enemy){
    ctx.fillStyle="purple";
    ctx.fillRect(enemy.x,enemy.y,enemy.size,enemy.size);
  }

  ctx.fillStyle="lime";
  ctx.fillRect(player.x,player.y,player.size,player.size);

  ctx.fillStyle=`rgba(0,0,0,${visionTimer>0?0.05:stress/420})`;
  ctx.fillRect(0,0,canvas.width,canvas.height);

  ctx.fillStyle="#fff";
  ctx.textAlign="left";
  ctx.fillText("Level: "+level,20,30);
  ctx.fillText("Streak: "+streak,20,50);
  ctx.fillText("Best: "+best,20,70);
  ctx.fillText("Stress: "+Math.floor(stress),20,90);

  if(state==="dead"){
    ctx.fillStyle="rgba(0,0,0,0.85)";
    ctx.fillRect(0,0,canvas.width,canvas.height);

    ctx.fillStyle="red";
    ctx.textAlign="center";
    ctx.font="30px Arial";
    ctx.fillText("YOU DIED",canvas.width/2,canvas.height/2);

    ctx.font="16px Arial";
    ctx.fillText("SPACE TO RESTART",canvas.width/2,canvas.height/2+40);
  }

  if(state==="level"){
    ctx.fillStyle="rgba(0,0,0,0.7)";
    ctx.fillRect(0,0,canvas.width,canvas.height);

    ctx.fillStyle="yellow";
    ctx.textAlign="center";
    ctx.font="30px Arial";
    ctx.fillText("LEVEL COMPLETE",canvas.width/2,canvas.height/2);

    ctx.font="16px Arial";
    ctx.fillText("NEXT LEVEL...",canvas.width/2,canvas.height/2+40);
  }

  ctx.restore();
}

// ================= LOOP =================
function loop(){
  update();
  draw();
  requestAnimationFrame(loop);
}

loop();
