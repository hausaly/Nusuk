// Guide area: a Mutawef guide sees the bookings made on their profile and accepts or declines them.
(()=>{
const {api,esc,$}=NC;
const toast=m=>{const t=document.createElement('div');t.className='toast';t.setAttribute('role','status');t.textContent=m;document.body.appendChild(t);setTimeout(()=>t.remove(),2400)};
const fmt=d=>d?new Date(d).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}):'';
let items=[],tab='Pending',user,logout,timer;
const TABS=['Pending','Accepted','Declined','All'];
const tel=p=>String(p||'').replace(/[^\d+]/g,'');
const wa=p=>'https://wa.me/'+tel(p).replace(/^\+/,'');
function card(b){
  const st=b.guideStatus,cls=st=='Accepted'?'ok':st=='Declined'?'no':'pd';
  return `<article class="gb" data-id="${esc(b.id)}"><div class="gh"><b>${esc(b.bookingId)}</b><span class="gs ${cls}">${esc(st)}</span></div>
  <dl><div><dt>Date</dt><dd>${b.date?esc(b.date):'To be agreed'}</dd></div><div><dt>Pilgrims</dt><dd>${esc(b.people)}</dd></div><div class="fw"><dt>Meeting point</dt><dd>${esc(b.meetingPoint)}</dd></div>
  <div class="fw"><dt>Sightseeing</dt><dd>${esc((b.stops||[]).join(', '))}</dd></div></dl>
  <div class="gcu"><b>${esc(b.customer.name)}</b><span>${esc(b.customer.country||'')}${b.customer.gender?' · '+esc(b.customer.gender):''}</span>
  <div class="gl"><a class="btn sm o" href="tel:${esc(tel(b.customer.phone))}">Call</a><a class="btn sm o" href="${esc(wa(b.customer.phone))}" target="_blank" rel="noopener">WhatsApp</a></div></div>
  <p class="gm">${b.payLater&&b.paymentStatus!='paid'?'Pay later: our team collects payment. ':b.paymentStatus=='paid'?'Paid. ':''}Booked ${esc(fmt(b.createdAt))}</p>
  ${st=='Pending'?`<div class="ga"><button class="btn" data-a="accept">Accept</button><button class="btn o" data-a="decline">Decline</button></div><div class="gr" hidden><label>Reason for declining<textarea rows="2" maxlength="300" placeholder="e.g. I am not available on that date"></textarea></label><div class="err" role="alert"></div><div class="ga"><button class="btn" data-a="send">Send</button><button class="btn o" data-a="back">Back</button></div></div>`
  :st=='Declined'&&b.guideNote?`<p class="gm">Your reason: ${esc(b.guideNote)}</p>`:''}</article>`}
function draw(){
  const pend=items.filter(i=>i.guideStatus=='Pending').length;
  const list=items.filter(i=>tab=='All'||i.guideStatus==tab);
  $('gd').innerHTML=`<div class="gtop"><div><h1>My Bookings</h1><p class="mu">${esc(user.name)}</p></div><div class="gl"><button class="btn sm o" id="gr">Refresh</button><button class="btn sm o" id="go">Sign out</button></div></div>
  ${pend?`<p class="gn">${pend} booking${pend>1?'s':''} waiting for your answer</p>`:''}
  <div class="pills" role="tablist">${TABS.map(t=>`<button class="pill${t==tab?' on':''}" data-t="${t}" role="tab">${t}${t=='Pending'&&pend?' ('+pend+')':''}</button>`).join('')}</div>
  <div class="gg">${list.length?list.map(card).join(''):`<p class="mu">${items.length?'Nothing here.':'No bookings yet. When a customer books your profile, it appears here.'}</p>`}</div>`;
  $('gd').querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{tab=b.dataset.t;draw()});
  $('go').onclick=logout;$('gr').onclick=()=>load(true);
  $('gd').querySelectorAll('.gb').forEach(el=>el.addEventListener('click',async e=>{
    const a=e.target.closest('[data-a]');if(!a)return;const id=el.dataset.id,act=a.dataset.a,box=el.querySelector('.gr');
    if(act=='decline'){el.querySelector('.ga').hidden=true;box.hidden=false;box.querySelector('textarea').focus();return}
    if(act=='back'){box.hidden=true;el.querySelector('.ga').hidden=false;return}
    const note=box?box.querySelector('textarea').value:'';
    if(act=='accept'&&!confirm('Accept this booking?'))return;
    a.disabled=true;
    try{const r=await api('POST',`/api/guide/bookings/${id}/respond`,{action:act=='accept'?'accept':'decline',note});Object.assign(items.find(i=>i.id==id),r);toast(act=='accept'?'Booking accepted':'Booking declined');draw()}
    catch(er){a.disabled=false;if(er.status==401){logout();return}const x=box&&box.querySelector('.err');if(x)x.textContent=(er.errors&&er.errors.note)||er.message;else toast(er.message)}}))}
async function load(manual){
  try{items=(await api('GET','/api/guide/bookings')).items;draw();if(manual)toast('Updated')}
  catch(e){if(e.status==401){logout();return}$('gd').innerHTML=`<p class="err">${esc(e.message)}</p>`}}
NC.mountGuide=(u,out)=>{user=u;logout=out;clearInterval(timer);$('gd').innerHTML='<p>Loading…</p>';load();
  timer=setInterval(()=>{if(location.hash.startsWith('#/guide')&&!document.hidden&&!document.querySelector('.gr:not([hidden])'))load()},60000)};
})();
