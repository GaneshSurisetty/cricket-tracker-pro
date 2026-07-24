const app = document.getElementById('app');
const nav = [...document.querySelectorAll('.bottom-nav button')];
const groundTpl = document.getElementById('groundTemplate');
const pitchTpl = document.getElementById('pitchTemplate');
let route = 'home';
let installPrompt;
let activeSession = JSON.parse(localStorage.getItem('ctp_active') || 'null');
let matches = JSON.parse(localStorage.getItem('ctp_matches') || '[]');

const newSession = () => ({
  id: crypto.randomUUID(), type:'Practice Session', opponent:'', date:new Date().toISOString().slice(0,10),
  battingPosition:'', bowlingOverPosition:'', mode:'bowling', bowling:[], batting:[], startedAt:Date.now()
});
const save = () => { localStorage.setItem('ctp_active', JSON.stringify(activeSession)); localStorage.setItem('ctp_matches', JSON.stringify(matches)); };
const legalBowlingBalls = () => activeSession?.bowling.filter(b=>!['Wide','No-ball'].includes(b.result)).length || 0;
const overNotation = n => `${Math.floor(n/6)}.${n%6}`;
const nextBallLabel = () => `${Math.floor(legalBowlingBalls()/6)+1}.${legalBowlingBalls()%6+1}`;
const battingRuns = b => Number(b.result)||0;
const bowlingRuns = b => Number(b.result)||(['Wide','No-ball'].includes(b.result)?1:0);
const dismissals = ['Bowled','LBW','Caught','Caught & bowled','Stumped','Run out','Hit wicket'];

window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt=e; document.getElementById('installBtn').classList.remove('hidden'); });
document.getElementById('installBtn').onclick = async()=>{ if(installPrompt){ installPrompt.prompt(); await installPrompt.userChoice; installPrompt=null; }};
if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
nav.forEach(b=>b.onclick=()=>{route=b.dataset.route; nav.forEach(x=>x.classList.toggle('active',x===b)); render();});

function cloneMap(type, onSelect){
  const node=(type==='ground'?groundTpl:pitchTpl).content.firstElementChild.cloneNode(true);
  node.querySelectorAll('[data-zone]').forEach(z=>z.addEventListener('click',()=>{node.querySelectorAll('[data-zone]').forEach(x=>x.classList.remove('selected'));z.classList.add('selected');onSelect(z.dataset.zone)}));
  return node;
}
function addMarkers(svg, records, kind){
  const g=svg.querySelector('.markers');
  records.forEach((r,i)=>{
    if(kind==='ground'){
      const centers={straight:[180,45],cover:[270,95],point:[320,175],'third-man':[290,255],'fine-leg':[240,310],'long-on':[180,315],'mid-wicket':[90,290],'square-leg':[45,220],'behind-square':[42,140],'long-off':[95,75]};
      const p=centers[r.shot]; if(!p)return;
      const line=document.createElementNS('http://www.w3.org/2000/svg','line'); line.setAttribute('x1',180);line.setAttribute('y1',180);line.setAttribute('x2',p[0]);line.setAttribute('y2',p[1]);line.setAttribute('class','marker-line');g.appendChild(line);
      const c=document.createElementNS('http://www.w3.org/2000/svg','circle');c.setAttribute('cx',p[0]);c.setAttribute('cy',p[1]);c.setAttribute('r',5+(i%3));c.setAttribute('class',r.dismissal?'dismissal-marker':'marker');g.appendChild(c);
    } else {
      const y={ 'full-toss':45,yorker:92,full:150,'good-length':228,'back-of-length':300,short:365}[r.length];
      if(!y)return; const x={leg:66,middle:130,off:194}[r.line]||130;
      const c=document.createElementNS('http://www.w3.org/2000/svg','circle');c.setAttribute('cx',x);c.setAttribute('cy',y);c.setAttribute('r',6);c.setAttribute('class',r.dismissal?'dismissal-marker':'marker');g.appendChild(c);
    }
  });
}

function render(){
  if(route==='home') return renderHome();
  if(route==='new') return renderNew();
  if(route==='history') return renderHistory();
  if(route==='analysis') return renderAnalysis();
}
function renderHome(){
  const totalRuns=matches.reduce((s,m)=>s+m.batting.reduce((a,b)=>a+battingRuns(b),0),0);
  const wickets=matches.reduce((s,m)=>s+m.bowling.filter(b=>dismissals.includes(b.result)&&b.result!=='Run out').length,0);
  app.innerHTML=`<section class="card hero"><h2>Track every ball. Improve every match.</h2><p>Visual pitch maps, wagon wheels and position-based analysis.</p></section>
  <section class="grid three"><div class="stat"><strong>${matches.length}</strong><span>Saved matches</span></div><div class="stat"><strong>${totalRuns}</strong><span>Batting runs</span></div><div class="stat"><strong>${wickets}</strong><span>Bowling wickets</span></div></section>
  ${activeSession?`<section class="card"><div class="section-title"><h2>Match in progress</h2><span class="subtle">${activeSession.type}</span></div><p>${activeSession.opponent||'Personal session'} · ${activeSession.date}</p><button class="btn" id="continueBtn">Continue match</button></section>`:''}
  <section class="card"><h2>Start tracking</h2><p class="subtle">Practice, league or head-to-head performance.</p><button class="btn" id="startBtn">New Match</button></section>`;
  document.getElementById('startBtn').onclick=()=>{route='new';syncNav();render();};
  document.getElementById('continueBtn')?.addEventListener('click',()=>renderTracker());
}
function syncNav(){nav.forEach(x=>x.classList.toggle('active',x.dataset.route===route));}
function renderNew(){
  const s=activeSession||newSession();
  app.innerHTML=`<section class="card"><h2>New Match</h2>
  <label>Match type</label><select id="type"><option>Practice Session</option><option>League Match</option><option>Head-to-Head Match</option></select>
  <label>Opponent / team</label><input id="opponent" placeholder="Optional for practice" value="${s.opponent}">
  <label>Date</label><input id="date" type="date" value="${s.date}">
  <div class="grid"><div><label>Batting position</label><select id="batpos"><option value="">Optional</option>${[1,2,3,4,5,6,7,8,9,10,11].map(x=>`<option>${x}</option>`).join('')}</select></div><div><label>Bowling over position</label><input id="bowlpos" type="number" min="1" placeholder="e.g. 3"></div></div>
  <button class="btn" id="begin">Start Match</button></section>`;
  document.getElementById('type').value=s.type;
  document.getElementById('begin').onclick=()=>{activeSession=newSession();Object.assign(activeSession,{type:type.value,opponent:opponent.value,date:date.value,battingPosition:batpos.value,bowlingOverPosition:bowlpos.value});save();renderTracker();};
}
function renderTracker(){
  if(!activeSession){route='new';return render();}
  app.innerHTML=`<div class="segment"><button id="bowTab" class="${activeSession.mode==='bowling'?'active':''}">Bowling</button><button id="batTab" class="${activeSession.mode==='batting'?'active':''}">Batting</button></div><div id="tracker"></div><button class="btn danger" id="finish">Finish Match</button>`;
  bowTab.onclick=()=>{activeSession.mode='bowling';save();renderTracker();};batTab.onclick=()=>{activeSession.mode='batting';save();renderTracker();};
  finish.onclick=()=>{if(confirm('Finish and save this match?')){matches.unshift({...activeSession,finishedAt:Date.now()});activeSession=null;save();route='history';syncNav();render();}};
  activeSession.mode==='bowling'?renderBowling():renderBatting();
}
function renderBowling(){
  const box=document.getElementById('tracker');
  box.innerHTML=`<section class="card"><div class="section-title"><h2>Over ${Math.floor(legalBowlingBalls()/6)+1}</h2><span class="subtle">Ball ${nextBallLabel()}</span></div><div class="ball-row">${[1,2,3,4,5,6].map(x=>`<button class="ball-dot ${legalBowlingBalls()%6+1===x?'active':''}">${x}</button>`).join('')}</div></section>
  <section class="map-grid"><div class="map-card"><h3>Where did the ball land? *</h3><div id="pitchSel"></div><select id="line"><option value="">Select line *</option><option value="leg">Leg</option><option value="middle">Middle</option><option value="off">Off</option></select></div><div class="map-card"><h3>Where did the batter hit? *</h3><div id="groundSel"></div></div></section>
  <section class="card"><h3>Result (optional)</h3><div class="option-grid" id="results">${['Dot','1','2','3','4','6','Wide','No-ball','Bowled','LBW','Caught','Caught & bowled','Stumped','Run out','Hit wicket','Dropped catch'].map(x=>`<button class="chip" data-value="${x}">${x}</button>`).join('')}</div><button class="btn" id="saveBall">Save & Next Ball</button></section><section class="card" id="score"></section>`;
  let length='',shot='',result='';pitchSel.appendChild(cloneMap('pitch',v=>length=v));groundSel.appendChild(cloneMap('ground',v=>shot=v));
  results.querySelectorAll('button').forEach(b=>b.onclick=()=>{results.querySelectorAll('button').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');result=b.dataset.value;});
  saveBall.onclick=()=>{if(!length||!shot||!line.value)return alert('Select pitch location, line and shot area.');activeSession.bowling.push({ball:nextBallLabel(),length,line:line.value,shot,result:result||'',dismissal:dismissals.includes(result)});save();renderTracker();};renderBowlingScore();
}
function renderBowlingScore(){
  const overs={};activeSession.bowling.forEach(b=>{const o=Number(b.ball.split('.')[0]);overs[o]??=[];overs[o].push(b)});
  document.getElementById('score').innerHTML=`<h3>Bowling scorecard</h3><div class="table-wrap"><table><thead><tr><th>Over</th><th>Dots</th><th>Wkts</th><th>Runs</th><th>Extras</th></tr></thead><tbody>${Object.entries(overs).map(([o,bs])=>`<tr><td>${o}</td><td>${bs.filter(x=>x.result==='Dot').length}</td><td>${bs.filter(x=>dismissals.includes(x.result)&&x.result!=='Run out').length}</td><td>${bs.reduce((s,x)=>s+bowlingRuns(x),0)}</td><td>${bs.filter(x=>['Wide','No-ball'].includes(x.result)).length}</td></tr>`).join('')||'<tr><td colspan="5">No balls recorded</td></tr>'}</tbody></table></div>`;
}
function renderBatting(){
  const box=document.getElementById('tracker');
  box.innerHTML=`<section class="card"><div class="section-title"><h2>Ball ${activeSession.batting.length+1}</h2><span class="subtle">Continuous batting log</span></div></section><section class="map-grid"><div class="map-card"><h3>Delivery received *</h3><div id="pitchSel"></div><select id="line"><option value="">Select line *</option><option value="leg">Leg</option><option value="middle">Middle</option><option value="off">Off</option></select></div><div class="map-card"><h3>Where did you hit? *</h3><div id="groundSel"></div></div></section><section class="card"><h3>Result (optional)</h3><div class="option-grid" id="results">${['0','1','2','3','4','5','6','Bowled','LBW','Caught','Stumped','Run out','Hit wicket'].map(x=>`<button class="chip" data-value="${x}">${x}</button>`).join('')}</div><button class="btn" id="saveBall">Save & Next Ball</button></section><section class="card" id="batScore"></section>`;
  let length='',shot='',result='';pitchSel.appendChild(cloneMap('pitch',v=>length=v));groundSel.appendChild(cloneMap('ground',v=>shot=v));results.querySelectorAll('button').forEach(b=>b.onclick=()=>{results.querySelectorAll('button').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');result=b.dataset.value;});
  saveBall.onclick=()=>{if(!length||!shot||!line.value)return alert('Select pitch location, line and shot area.');activeSession.batting.push({ball:activeSession.batting.length+1,length,line:line.value,shot,result:result||'',dismissal:dismissals.includes(result)});save();renderTracker();};
  const bs=activeSession.batting;batScore.innerHTML=`<h3>Batting scorecard</h3><div class="grid three"><div class="stat"><strong>${bs.length}</strong><span>Balls</span></div><div class="stat"><strong>${bs.filter(x=>x.result==='0').length}</strong><span>Dots</span></div><div class="stat"><strong>${bs.reduce((s,x)=>s+battingRuns(x),0)}</strong><span>Runs</span></div><div class="stat"><strong>${bs.filter(x=>x.result==='4').length}</strong><span>4s</span></div><div class="stat"><strong>${bs.filter(x=>x.result==='6').length}</strong><span>6s</span></div><div class="stat"><strong>${bs.filter(x=>x.dismissal).length}</strong><span>Outs</span></div></div>`;
}
function renderHistory(){
  app.innerHTML=`<section class="card"><h2>Match History</h2>${matches.length?matches.map((m,i)=>`<div class="card"><strong>${m.type}</strong><p class="subtle">${m.date} · ${m.opponent||'No opponent'}</p><div class="grid"><div class="stat"><strong>${m.batting.reduce((s,b)=>s+battingRuns(b),0)}</strong><span>Runs</span></div><div class="stat"><strong>${m.bowling.filter(b=>dismissals.includes(b.result)&&b.result!=='Run out').length}</strong><span>Wickets</span></div></div><button class="btn secondary view" data-i="${i}">View analysis</button></div>`).join(''):'<div class="empty">No completed matches yet.</div>'}</section>`;
  document.querySelectorAll('.view').forEach(b=>b.onclick=()=>renderMatchAnalysis(matches[Number(b.dataset.i)]));
}
function renderMatchAnalysis(m){
  app.innerHTML=`<section class="card"><div class="section-title"><h2>${m.type}</h2><span class="subtle">${m.date}</span></div><p>${m.opponent||'Personal session'}</p></section><section class="card"><h2>Bowling analysis</h2><div class="map-grid"><div class="map-card"><h3>Where batters hit your bowling</h3><div id="bg"></div></div><div class="map-card"><h3>Where your balls landed</h3><div id="bp"></div></div></div></section><section class="card"><h2>Batting analysis</h2><div class="map-grid"><div class="map-card"><h3>Where you hit the ball</h3><div id="ag"></div></div><div class="map-card"><h3>Dismissal balls on pitch</h3><div id="ap"></div></div></div><div class="map-card"><h3>Where you were caught or dismissed</h3><div id="dg"></div></div><div class="legend"><span><i></i> Ball / shot</span><span><i class="out"></i> Dismissal</span></div></section>`;
  [['bg','ground',m.bowling],['bp','pitch',m.bowling],['ag','ground',m.batting],['ap','pitch',m.batting.filter(x=>x.dismissal)],['dg','ground',m.batting.filter(x=>x.dismissal)]].forEach(([id,t,r])=>{const svg=cloneMap(t,()=>{});addMarkers(svg,r,t);document.getElementById(id).appendChild(svg)});
}
function renderAnalysis(){
  if(!matches.length){app.innerHTML='<section class="card empty">Complete a match to unlock overall visual analysis.</section>';return;}
  const types=['Practice Session','League Match','Head-to-Head Match'];
  app.innerHTML=`<section class="card"><h2>Overall Analysis</h2><label>Match category</label><select id="filter"><option>All Matches</option>${types.map(x=>`<option>${x}</option>`).join('')}</select></section><div id="analysisBody"></div>`;
  const draw=()=>{const set=filter.value==='All Matches'?matches:matches.filter(m=>m.type===filter.value);const bowling=set.flatMap(m=>m.bowling),batting=set.flatMap(m=>m.batting);analysisBody.innerHTML=`<section class="card"><h2>Bowling</h2><div class="map-grid"><div class="map-card"><h3>Batter shot ground</h3><div id="obg"></div></div><div class="map-card"><h3>Your pitch map</h3><div id="obp"></div></div></div></section><section class="card"><h2>Batting</h2><div class="map-grid"><div class="map-card"><h3>Your shot ground</h3><div id="oag"></div></div><div class="map-card"><h3>Dismissal pitch map</h3><div id="oap"></div></div></div><div class="map-card"><h3>Caught / dismissal ground</h3><div id="odg"></div></div></section>`;[['obg','ground',bowling],['obp','pitch',bowling],['oag','ground',batting],['oap','pitch',batting.filter(x=>x.dismissal)],['odg','ground',batting.filter(x=>x.dismissal)]].forEach(([id,t,r])=>{const svg=cloneMap(t,()=>{});addMarkers(svg,r,t);document.getElementById(id).appendChild(svg)});};filter.onchange=draw;draw();
}
render();
