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
  battingPosition:'', bowlingOverPosition:'', mode:'bowling', bowling:[], batting:[], startedAt:Date.now(), editingMatchId:null
});
const save = () => { localStorage.setItem('ctp_active', JSON.stringify(activeSession)); localStorage.setItem('ctp_matches', JSON.stringify(matches)); };
const legalBowlingBalls = () => activeSession?.bowling.filter(b=>!['Wide','No-ball'].includes(b.result)).length || 0;
const overNotation = n => `${Math.floor(n/6)}.${n%6}`;
const nextBallLabel = () => `${Math.floor(legalBowlingBalls()/6)+1}.${legalBowlingBalls()%6+1}`;
const battingRuns = b => Number(b.result)||0;
const bowlingRuns = b => Number(b.result)||(['Wide','No-ball'].includes(b.result)?1:0);
const dismissals = ['Bowled','LBW','Caught','Caught & bowled','Stumped','Run out','Hit wicket','Retired','Self out','Wicket caught'];
const bowlerWickets = ['Bowled','LBW','Caught','Caught & bowled','Stumped','Hit wicket'];
const dismissalLabel = value => ({'Caught & bowled':'Caught & bowled','Wicket caught':'Caught behind','Self out':'Self out'}[value] || value || 'Not out');
const zoneLabels = {'straight':'Straight','cover':'Cover','point':'Point','third-man':'Third man','fine-leg':'Fine leg','long-on':'Long on','mid-wicket':'Mid-wicket','square-leg':'Square leg','behind-square':'Behind square','long-off':'Long off'};
const lengthLabels = {'full-toss':'Full toss','yorker':'Yorker','full':'Full','good-length':'Good length','back-of-length':'Back of length','short':'Short / bouncer'};
const lineLabels = {leg:'Leg',middle:'Middle',off:'Off'};

function bowlingSummary(m){
  const balls=m.bowling||[];
  const legal=balls.filter(b=>!['Wide','No-ball'].includes(b.result));
  const runs=balls.reduce((s,b)=>s+bowlingRuns(b),0);
  const extras=balls.filter(b=>['Wide','No-ball'].includes(b.result)).length;
  const overs={};
  balls.forEach(b=>{const o=Number(String(b.ball).split('.')[0]);(overs[o]??=[]).push(b)});
  const maidens=Object.values(overs).filter(bs=>bs.filter(b=>!['Wide','No-ball'].includes(b.result)).length===6 && bs.reduce((s,b)=>s+bowlingRuns(b),0)===0).length;
  return {overs:overNotation(legal.length),dots:legal.filter(b=>b.result==='Dot').length,runs,wickets:balls.filter(b=>bowlerWickets.includes(b.result)).length,maidens,fours:balls.filter(b=>b.result==='4').length,sixes:balls.filter(b=>b.result==='6').length,extras,economy:legal.length?(runs*6/legal.length).toFixed(2):'0.00'};
}
function battingSummary(m){
  const balls=m.batting||[];
  const runs=balls.reduce((s,b)=>s+battingRuns(b),0);
  const outs=balls.filter(b=>b.dismissal||dismissals.includes(b.result));
  return {balls:balls.length,dots:balls.filter(b=>b.result==='0'||b.result==='Dot'||!b.result).length,runs,fours:balls.filter(b=>b.result==='4').length,sixes:balls.filter(b=>b.result==='6').length,wicket:outs.length?outs.map(b=>dismissalLabel(b.result)).join(', '):'Not out',strikeRate:balls.length?(runs*100/balls.length).toFixed(2):'0.00'};
}
function scorecardTables(m){
  const bat=battingSummary(m), bowl=bowlingSummary(m);
  return `<div class="score-section"><h3>Batting</h3><div class="table-wrap"><table><thead><tr><th>Balls</th><th>Dots</th><th>Runs</th><th>4s</th><th>6s</th><th>Type of wicket</th><th>Strike rate</th></tr></thead><tbody><tr><td>${bat.balls}</td><td>${bat.dots}</td><td>${bat.runs}</td><td>${bat.fours}</td><td>${bat.sixes}</td><td>${bat.wicket}</td><td>${bat.strikeRate}</td></tr></tbody></table></div></div>
  <div class="score-section"><h3>Bowling</h3><div class="table-wrap"><table><thead><tr><th>Overs</th><th>Dots</th><th>Runs</th><th>Wickets</th><th>Maidens</th><th>4s</th><th>6s</th><th>Extras</th><th>Economy</th></tr></thead><tbody><tr><td>${bowl.overs}</td><td>${bowl.dots}</td><td>${bowl.runs}</td><td>${bowl.wickets}</td><td>${bowl.maidens}</td><td>${bowl.fours}</td><td>${bowl.sixes}</td><td>${bowl.extras}</td><td>${bowl.economy}</td></tr></tbody></table></div></div>`;
}

window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt=e; document.getElementById('installBtn').classList.remove('hidden'); });
document.getElementById('installBtn').onclick = async()=>{ if(installPrompt){ installPrompt.prompt(); await installPrompt.userChoice; installPrompt=null; }};
if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
nav.forEach(b=>b.onclick=()=>{route=b.dataset.route; nav.forEach(x=>x.classList.toggle('active',x===b)); render();});

function svgPoint(svg,event){
  const point=svg.createSVGPoint(); point.x=event.clientX; point.y=event.clientY;
  return point.matrixTransform(svg.getScreenCTM().inverse());
}
function clearSelectionMarker(svg){svg.querySelectorAll('.selection-marker,.selection-line').forEach(x=>x.remove());}
function appendCircle(svg,x,y){
  clearSelectionMarker(svg);
  const c=document.createElementNS('http://www.w3.org/2000/svg','circle');
  c.setAttribute('cx',x);c.setAttribute('cy',y);c.setAttribute('r',7);c.setAttribute('class','selection-marker');
  svg.appendChild(c);
}
function cloneMap(type, onSelect, interactive=true){
  const node=(type==='ground'?groundTpl:pitchTpl).content.firstElementChild.cloneNode(true);
  if(!interactive) return node;
  node.classList.add('interactive-map');
  node.addEventListener('click',event=>{
    const p=svgPoint(node,event);
    if(type==='pitch'){
      if(p.x<35||p.x>225||p.y<15||p.y>405) return;
      const line=p.x<98?'leg':p.x<162?'middle':'off';
      const length=p.y<70?'full-toss':p.y<115?'yorker':p.y<185?'full':p.y<270?'good-length':p.y<330?'back-of-length':'short';
      appendCircle(node,p.x,p.y); onSelect({length,line,x:p.x,y:p.y});
    } else {
      const dx=p.x-180,dy=p.y-180,r=Math.sqrt(dx*dx+dy*dy);
      if(r>166) return;
      const centers={straight:-90,cover:-45,point:0,'third-man':35,'fine-leg':62,'long-on':90,'mid-wicket':130,'square-leg':165,'behind-square':-165,'long-off':-130};
      let angle=Math.atan2(dy,dx)*180/Math.PI;
      let shot=Object.entries(centers).reduce((best,[name,a])=>{
        const diff=Math.abs(((angle-a+540)%360)-180); return diff<best.diff?{name,diff}:best;
      },{name:'straight',diff:999}).name;
      const ring=r<=105?'inside-30':'outside-30';
      appendCircle(node,p.x,p.y); onSelect({shot,ring,x:p.x,y:p.y});
    }
  });
  return node;
}
function addMarkers(svg, records, kind){
  const g=svg.querySelector('.markers');
  records.forEach((r,i)=>{
    let px,py;
    if(kind==='ground'){
      const outer={straight:[180,45],cover:[275,90],point:[320,180],'third-man':[290,260],'fine-leg':[245,310],'long-on':[180,315],'mid-wicket':[88,288],'square-leg':[42,220],'behind-square':[42,140],'long-off':[92,76]};
      const inner={straight:[180,92],cover:[237,120],point:[272,180],'third-man':[244,225],'fine-leg':[218,252],'long-on':[180,265],'mid-wicket':[125,245],'square-leg':[88,207],'behind-square':[88,153],'long-off':[123,118]};
      const point=(r.ring==='inside-30'?inner:outer)[r.shot] || outer[r.shot]; if(!point)return;
      [px,py]=point;
      const line=document.createElementNS('http://www.w3.org/2000/svg','line'); line.setAttribute('x1',180);line.setAttribute('y1',180);line.setAttribute('x2',px);line.setAttribute('y2',py);line.setAttribute('class','marker-line');g.appendChild(line);
    } else {
      py={ 'full-toss':45,yorker:92,full:150,'good-length':228,'back-of-length':300,short:365}[r.length];
      if(!py)return; px={leg:66,middle:130,off:194}[r.line]||130;
    }
    const c=document.createElementNS('http://www.w3.org/2000/svg','circle');c.setAttribute('cx',px);c.setAttribute('cy',py);c.setAttribute('r',kind==='ground'?6:7);c.setAttribute('class',r.dismissal?'dismissal-marker':'marker');g.appendChild(c);
    const label=document.createElementNS('http://www.w3.org/2000/svg','text');label.setAttribute('x',px);label.setAttribute('y',py-10);label.setAttribute('class','marker-label');label.textContent=String(r.ball ?? i+1);g.appendChild(label);
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
  const wickets=matches.reduce((s,m)=>s+m.bowling.filter(b=>bowlerWickets.includes(b.result)).length,0);
  app.innerHTML=`<section class="card hero"><h2>Track every ball. Improve every match.</h2><p>Visual pitch maps, wagon wheels and position-based analysis.</p></section>
  <section class="grid three"><div class="stat"><strong>${matches.length}</strong><span>Saved matches</span></div><div class="stat"><strong>${totalRuns}</strong><span>Batting runs</span></div><div class="stat"><strong>${wickets}</strong><span>Bowling wickets</span></div></section>
  ${activeSession?`<section class="card"><div class="section-title"><h2>Match in progress</h2><span class="subtle">${activeSession.type}</span></div><p>${activeSession.opponent||'Personal session'} · ${activeSession.date}</p><button class="btn" id="continueBtn">Continue match</button></section>`:''}
  <section class="card"><h2>Start tracking</h2><p class="subtle">Practice, league or head-to-head performance.</p><button class="btn" id="startBtn">New Match</button></section>`;
  document.getElementById('startBtn').onclick=()=>{route='new';syncNav();render();};
  document.getElementById('continueBtn')?.addEventListener('click',()=>renderTracker());
}
function syncNav(){nav.forEach(x=>x.classList.toggle('active',x.dataset.route===route));}
function renderNew(){
  const s=newSession();
  app.innerHTML=`<section class="card"><h2>New Match</h2>
  <label>Match type</label><select id="type"><option>Practice Session</option><option>League Match</option><option>Head-to-Head Match</option></select>
  <label>Opponent / team</label><input id="opponent" placeholder="Optional for practice">
  <label>Date</label><input id="date" type="date" value="${s.date}">
  <div class="notice">Batting position and bowling over position will be selected after the match starts. You can change them at any time before finishing.</div>
  <button class="btn" id="begin">Start Match</button></section>`;
  document.getElementById('begin').onclick=()=>{activeSession=newSession();Object.assign(activeSession,{type:type.value,opponent:opponent.value,date:date.value});save();renderTracker();};
}
function positionEditor(){
  const positions=[1,2,3,4,5,6,7,8,9,10,11];
  return `<section class="card match-settings"><div class="section-title"><h2>Match positions</h2><span class="subtle">Editable until finish</span></div>
  <div class="grid"><div><label>Batting position</label><select id="liveBatPos"><option value="">Not selected</option>${positions.map(x=>`<option value="${x}" ${String(activeSession.battingPosition)===String(x)?'selected':''}>${x}${x===1?' (Opening)':''}</option>`).join('')}</select></div>
  <div><label>Bowling over position</label><input id="liveBowlPos" type="number" min="1" placeholder="e.g. 3" value="${activeSession.bowlingOverPosition||''}"></div></div></section>`;
}
function bindPositionEditor(){
  liveBatPos.onchange=()=>{activeSession.battingPosition=liveBatPos.value;save();};
  liveBowlPos.onchange=()=>{activeSession.bowlingOverPosition=liveBowlPos.value;save();};
}
function renderTracker(){
  if(!activeSession){route='new';return render();}
  app.innerHTML=`<div class="segment"><button id="bowTab" class="${activeSession.mode==='bowling'?'active':''}">Bowling</button><button id="batTab" class="${activeSession.mode==='batting'?'active':''}">Batting</button></div>${positionEditor()}<div id="tracker"></div><button class="btn danger" id="finish">${activeSession.editingMatchId?'Save Match Changes':'Finish Match'}</button>`;
  bindPositionEditor();
  bowTab.onclick=()=>{activeSession.mode='bowling';save();renderTracker();};batTab.onclick=()=>{activeSession.mode='batting';save();renderTracker();};
  finish.onclick=()=>{if(confirm(activeSession.editingMatchId?'Save all changes to this match?':'Finish and save this match?')){
    const completed={...activeSession,finishedAt:activeSession.finishedAt||Date.now()}; delete completed.editingMatchId;
    const existingIndex=matches.findIndex(m=>m.id===activeSession.editingMatchId);
    if(existingIndex>=0) matches[existingIndex]=completed; else matches.unshift(completed);
    activeSession=null;save();route='history';syncNav();render();
  }};
  activeSession.mode==='bowling'?renderBowling():renderBatting();
}
function deliveryLog(records,type){
  if(!records.length) return '<div class="empty small">No balls recorded yet.</div>';
  return `<div class="delivery-list">${records.map((b,i)=>`<div class="delivery-item"><div><strong>${type==='bowling'?'Ball '+b.ball:'Ball '+b.ball}</strong><span>${lengthLabels[b.length]||b.length} · ${lineLabels[b.line]||b.line} · ${zoneLabels[b.shot]||b.shot}${b.ring?' · '+(b.ring==='inside-30'?'Inside 30-yard':'Outside 30-yard'):''} · ${b.result||'No result'}</span></div><div class="delivery-actions"><button class="mini edit-delivery" data-type="${type}" data-i="${i}">Edit</button><button class="mini danger delete-delivery" data-type="${type}" data-i="${i}">Delete</button></div></div>`).join('')}</div>`;
}
function bindDeliveryActions(){
  document.querySelectorAll('.delete-delivery').forEach(b=>b.onclick=()=>{const list=activeSession[b.dataset.type];if(confirm('Delete this ball?')){list.splice(Number(b.dataset.i),1);resequence();save();renderTracker();}});
  document.querySelectorAll('.edit-delivery').forEach(b=>b.onclick=()=>editDelivery(b.dataset.type,Number(b.dataset.i)));
}
function resequence(){
  let legal=0;activeSession.bowling.forEach(b=>{b.ball=`${Math.floor(legal/6)+1}.${legal%6+1}`;if(!['Wide','No-ball'].includes(b.result))legal++;});
  activeSession.batting.forEach((b,i)=>b.ball=i+1);
}
function editDelivery(type,index){
  const b=activeSession[type][index];
  const length=prompt('Delivery length: full-toss, yorker, full, good-length, back-of-length, short',b.length); if(length===null)return;
  const line=prompt('Line: leg, middle, off',b.line); if(line===null)return;
  const shot=prompt('Shot area: '+Object.keys(zoneLabels).join(', '),b.shot); if(shot===null)return;
  const ring=prompt('Ground distance: inside-30 or outside-30',b.ring||'outside-30'); if(ring===null)return;
  const result=prompt('Result',b.result||''); if(result===null)return;
  Object.assign(b,{length,line,shot,ring,result,dismissal:dismissals.includes(result)});resequence();save();renderTracker();
}
function renderBowling(){
  const box=document.getElementById('tracker');
  box.innerHTML=`<section class="card"><div class="section-title"><h2>Over ${Math.floor(legalBowlingBalls()/6)+1}</h2><span class="subtle">Ball ${nextBallLabel()}</span></div><div class="ball-row">${[1,2,3,4,5,6].map(x=>`<button class="ball-dot ${legalBowlingBalls()%6+1===x?'active':''}">${x}</button>`).join('')}</div></section>
  <section class="map-grid"><div class="map-card"><h3>Tap exact line and length *</h3><div id="pitchSel"></div><p id="pitchChoice" class="map-choice">Nothing selected</p></div><div class="map-card"><h3>Tap shot area and distance *</h3><div id="groundSel"></div><p id="groundChoice" class="map-choice">Tap inside or outside the dotted 30-yard circle</p></div></section>
  <section class="card"><h3>Result (optional)</h3><div class="option-grid" id="results">${['Dot','1','2','3','4','6','Wide','No-ball','Bowled','LBW','Caught','Caught & bowled','Wicket caught','Stumped','Run out','Hit wicket','Self out','Dropped catch'].map(x=>`<button class="chip" data-value="${x}">${x}</button>`).join('')}</div><button class="btn" id="saveBall">Save & Next Ball</button></section><section class="card" id="score"></section><section class="card"><h3>Recorded bowling balls</h3>${deliveryLog(activeSession.bowling,'bowling')}</section>`;
  let pitchChoice=null,groundChoice=null,result='';
  pitchSel.appendChild(cloneMap('pitch',v=>{pitchChoice=v;pitchChoiceEl.textContent=`${lengthLabels[v.length]} · ${lineLabels[v.line]}`;}));
  groundSel.appendChild(cloneMap('ground',v=>{groundChoice=v;groundChoiceEl.textContent=`${zoneLabels[v.shot]} · ${v.ring==='inside-30'?'Inside 30-yard circle':'Outside 30-yard circle'}`;}));
  const pitchChoiceEl=document.getElementById('pitchChoice'),groundChoiceEl=document.getElementById('groundChoice');
  results.querySelectorAll('button').forEach(b=>b.onclick=()=>{results.querySelectorAll('button').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');result=b.dataset.value;});
  saveBall.onclick=()=>{if(!pitchChoice||!groundChoice)return alert('Tap the pitch and ground maps first.');activeSession.bowling.push({ball:nextBallLabel(),...pitchChoice,...groundChoice,result:result||'',dismissal:dismissals.includes(result)});save();renderTracker();};
  renderBowlingScore();bindDeliveryActions();
}
function renderBowlingScore(){
  const overs={};activeSession.bowling.forEach(b=>{const o=Number(b.ball.split('.')[0]);overs[o]??=[];overs[o].push(b)});
  document.getElementById('score').innerHTML=`<h3>Bowling scorecard</h3><div class="table-wrap"><table><thead><tr><th>Over</th><th>Dots</th><th>Wkts</th><th>Runs</th><th>Extras</th></tr></thead><tbody>${Object.entries(overs).map(([o,bs])=>`<tr><td>${o}</td><td>${bs.filter(x=>x.result==='Dot').length}</td><td>${bs.filter(x=>bowlerWickets.includes(x.result)).length}</td><td>${bs.reduce((s,x)=>s+bowlingRuns(x),0)}</td><td>${bs.filter(x=>['Wide','No-ball'].includes(x.result)).length}</td></tr>`).join('')||'<tr><td colspan="5">No balls recorded</td></tr>'}</tbody></table></div>`;
}
function renderBatting(){
  const box=document.getElementById('tracker');
  box.innerHTML=`<section class="card"><div class="section-title"><h2>Ball ${activeSession.batting.length+1}</h2><span class="subtle">Continuous batting log</span></div></section><section class="map-grid"><div class="map-card"><h3>Tap delivery line and length *</h3><div id="pitchSel"></div><p id="pitchChoice" class="map-choice">Nothing selected</p></div><div class="map-card"><h3>Tap your shot area and distance *</h3><div id="groundSel"></div><p id="groundChoice" class="map-choice">Tap inside or outside the dotted 30-yard circle</p></div></section><section class="card"><h3>Result (optional)</h3><div class="option-grid" id="results">${['0','1','2','3','4','5','6','Bowled','LBW','Caught','Caught & bowled','Wicket caught','Stumped','Run out','Hit wicket','Self out','Retired'].map(x=>`<button class="chip" data-value="${x}">${x}</button>`).join('')}</div><button class="btn" id="saveBall">Save & Next Ball</button></section><section class="card" id="batScore"></section><section class="card"><h3>Recorded batting balls</h3>${deliveryLog(activeSession.batting,'batting')}</section>`;
  let pitchChoice=null,groundChoice=null,result='';
  pitchSel.appendChild(cloneMap('pitch',v=>{pitchChoice=v;pitchChoiceEl.textContent=`${lengthLabels[v.length]} · ${lineLabels[v.line]}`;}));
  groundSel.appendChild(cloneMap('ground',v=>{groundChoice=v;groundChoiceEl.textContent=`${zoneLabels[v.shot]} · ${v.ring==='inside-30'?'Inside 30-yard circle':'Outside 30-yard circle'}`;}));
  const pitchChoiceEl=document.getElementById('pitchChoice'),groundChoiceEl=document.getElementById('groundChoice');
  results.querySelectorAll('button').forEach(b=>b.onclick=()=>{results.querySelectorAll('button').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');result=b.dataset.value;});
  saveBall.onclick=()=>{if(!pitchChoice||!groundChoice)return alert('Tap the pitch and ground maps first.');activeSession.batting.push({ball:activeSession.batting.length+1,...pitchChoice,...groundChoice,result:result||'',dismissal:dismissals.includes(result)});save();renderTracker();};
  const bs=activeSession.batting;batScore.innerHTML=`<h3>Batting scorecard</h3><div class="grid three"><div class="stat"><strong>${bs.length}</strong><span>Balls</span></div><div class="stat"><strong>${bs.filter(x=>x.result==='0').length}</strong><span>Dots</span></div><div class="stat"><strong>${bs.reduce((s,x)=>s+battingRuns(x),0)}</strong><span>Runs</span></div><div class="stat"><strong>${bs.filter(x=>x.result==='4').length}</strong><span>4s</span></div><div class="stat"><strong>${bs.filter(x=>x.result==='6').length}</strong><span>6s</span></div><div class="stat"><strong>${bs.filter(x=>x.dismissal).length}</strong><span>Outs</span></div></div>`;
  bindDeliveryActions();
}
function renderHistory(){
  app.innerHTML=`<section class="card"><h2>Match History</h2>${matches.length?matches.map((m,i)=>`<article class="card match-history-card"><div class="section-title"><div><h2>${m.type}</h2><p class="subtle">${m.date} · ${m.opponent||'No opponent'}${m.battingPosition?' · Bat #'+m.battingPosition:''}${m.bowlingOverPosition?' · Bowl over '+m.bowlingOverPosition:''}</p></div></div>${scorecardTables(m)}<div class="history-actions"><button class="btn secondary view" data-i="${i}">View full analysis</button><button class="btn edit-match" data-i="${i}">Edit match</button><button class="btn danger delete-match" data-i="${i}">Delete match</button></div></article>`).join(''):'<div class="empty">No completed matches yet.</div>'}</section>`;
  document.querySelectorAll('.view').forEach(b=>b.onclick=()=>renderMatchAnalysis(matches[Number(b.dataset.i)]));
  document.querySelectorAll('.edit-match').forEach(b=>b.onclick=()=>{const m=matches[Number(b.dataset.i)];activeSession=JSON.parse(JSON.stringify(m));activeSession.editingMatchId=m.id;activeSession.mode='bowling';save();renderTracker();});
  document.querySelectorAll('.delete-match').forEach(b=>b.onclick=()=>{
    const index=Number(b.dataset.i);
    const match=matches[index];
    const label=`${match.type} on ${match.date}${match.opponent?' vs '+match.opponent:''}`;
    if(!confirm(`Delete ${label}?\n\nThis permanently removes the match, its balls, scorecards and analysis. This cannot be undone.`)) return;
    matches.splice(index,1);
    save();
    renderHistory();
  });
}
function analysisMapCard(id,title){
  return `<div class="map-card"><h3>${title}</h3><div id="${id}"></div></div>`;
}
function analysisPair(title,prefix,records,filter){
  const rows=records.filter(filter);
  return `<section class="card analysis-block"><div class="section-title"><h2>${title}</h2><span class="subtle">${rows.length} ball${rows.length===1?'':'s'}</span></div><div class="map-grid">${analysisMapCard(prefix+'g','Ground: where the ball went')}${analysisMapCard(prefix+'p','Pitch: which delivery was bowled')}</div></section>`;
}
function analysisPitchOnly(title,prefix,records,filter){
  const rows=records.filter(filter);
  return `<section class="card analysis-block"><div class="section-title"><h2>${title}</h2><span class="subtle">${rows.length} ball${rows.length===1?'':'s'}</span></div>${analysisMapCard(prefix+'p','Pitch: dismissal delivery')}</section>`;
}
function analysisBase(title,prefix,records,groundTitle,pitchTitle){
  return `<section class="card"><h2>${title}</h2><div class="map-grid">${analysisMapCard(prefix+'g',groundTitle)}${analysisMapCard(prefix+'p',pitchTitle)}</div></section>`;
}
function mountMap(id,type,records){
  const target=document.getElementById(id); if(!target)return;
  const svg=cloneMap(type,()=>{},false);addMarkers(svg,records,type);target.appendChild(svg);
  if(!records.length) target.insertAdjacentHTML('beforeend','<p class="empty-map">No matching balls recorded</p>');
}
function analysisData(records){
  return {
    fours:records.filter(x=>x.result==='4'),
    sixes:records.filter(x=>x.result==='6'),
    bowledSelf:records.filter(x=>['Bowled','Hit wicket','Self out'].includes(x.result)),
    wicketCaught:records.filter(x=>['Wicket caught','Caught behind','Stumped'].includes(x.result)),
    caught:records.filter(x=>['Caught','Caught & bowled'].includes(x.result))
  };
}
function detailedAnalysisHtml(bowling,batting,prefix=''){
  const b=analysisData(bowling),a=analysisData(batting);
  return `${analysisBase('Bowling overview',prefix+'bo',bowling,'Where batters hit your bowling','Where your balls landed')}
  ${analysisPair('Bowling — Fours conceded',prefix+'b4',bowling,x=>x.result==='4')}
  ${analysisPair('Bowling — Sixes conceded',prefix+'b6',bowling,x=>x.result==='6')}
  ${analysisPitchOnly('Bowling — Bowled / self wicket',prefix+'bbs',bowling,x=>['Bowled','Hit wicket','Self out'].includes(x.result))}
  ${analysisPitchOnly('Bowling — Wicketkeeper catch / stumping',prefix+'bwc',bowling,x=>['Wicket caught','Caught behind','Stumped'].includes(x.result))}
  ${analysisPair('Bowling — Caught dismissals',prefix+'bca',bowling,x=>['Caught','Caught & bowled'].includes(x.result))}
  ${analysisBase('Batting overview',prefix+'ba',batting,'Where you hit the ball','All deliveries received')}
  ${analysisPair('Batting — Fours scored',prefix+'a4',batting,x=>x.result==='4')}
  ${analysisPair('Batting — Sixes scored',prefix+'a6',batting,x=>x.result==='6')}
  ${analysisPitchOnly('Batting — Bowled / self wicket',prefix+'abs',batting,x=>['Bowled','Hit wicket','Self out'].includes(x.result))}
  ${analysisPitchOnly('Batting — Wicketkeeper catch / stumping',prefix+'awc',batting,x=>['Wicket caught','Caught behind','Stumped'].includes(x.result))}
  ${analysisPair('Batting — Caught dismissals',prefix+'aca',batting,x=>['Caught','Caught & bowled'].includes(x.result))}`;
}
function mountDetailedAnalysis(bowling,batting,prefix=''){
  const b=analysisData(bowling),a=analysisData(batting);
  mountMap(prefix+'bog','ground',bowling);mountMap(prefix+'bop','pitch',bowling);
  mountMap(prefix+'b4g','ground',b.fours);mountMap(prefix+'b4p','pitch',b.fours);
  mountMap(prefix+'b6g','ground',b.sixes);mountMap(prefix+'b6p','pitch',b.sixes);
  mountMap(prefix+'bbsp','pitch',b.bowledSelf);mountMap(prefix+'bwcp','pitch',b.wicketCaught);
  mountMap(prefix+'bcag','ground',b.caught);mountMap(prefix+'bcap','pitch',b.caught);
  mountMap(prefix+'bag','ground',batting);mountMap(prefix+'bap','pitch',batting);
  mountMap(prefix+'a4g','ground',a.fours);mountMap(prefix+'a4p','pitch',a.fours);
  mountMap(prefix+'a6g','ground',a.sixes);mountMap(prefix+'a6p','pitch',a.sixes);
  mountMap(prefix+'absp','pitch',a.bowledSelf);mountMap(prefix+'awcp','pitch',a.wicketCaught);
  mountMap(prefix+'acag','ground',a.caught);mountMap(prefix+'acap','pitch',a.caught);
}
function renderMatchAnalysis(m){
  app.innerHTML=`<section class="card"><div class="section-title"><h2>${m.type}</h2><span class="subtle">${m.date}</span></div><p>${m.opponent||'Personal session'}</p>${scorecardTables(m)}</section>${detailedAnalysisHtml(m.bowling||[],m.batting||[],'m')}<section class="card"><div class="legend"><span><i></i> Ball / shot marker</span><span><i class="out"></i> Dismissal marker</span><span>Marker text = ball number</span></div></section>`;
  mountDetailedAnalysis(m.bowling||[],m.batting||[],'m');
}
function renderAnalysis(){
  if(!matches.length){app.innerHTML='<section class="card empty">Complete a match to unlock overall visual analysis.</section>';return;}
  const types=['Practice Session','League Match','Head-to-Head Match'];
  app.innerHTML=`<section class="card"><h2>Overall Analysis</h2><label>Match category</label><select id="filter"><option>All Matches</option>${types.map(x=>`<option>${x}</option>`).join('')}</select></section><div id="analysisBody"></div>`;
  const draw=()=>{const set=filter.value==='All Matches'?matches:matches.filter(m=>m.type===filter.value);const bowling=set.flatMap(m=>m.bowling||[]),batting=set.flatMap(m=>m.batting||[]);analysisBody.innerHTML=detailedAnalysisHtml(bowling,batting,'o')+'<section class="card"><div class="legend"><span><i></i> Ball / shot marker</span><span><i class="out"></i> Dismissal marker</span><span>Marker text = recorded ball number</span></div></section>';mountDetailedAnalysis(bowling,batting,'o');};filter.onchange=draw;draw();
}

render();
