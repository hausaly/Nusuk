// Booking slip: HTML preview + PDF download. Shared by the public site and the admin dashboard.
(()=>{
const CO={name:'NUSUK CONSULT',tag:'Beyond Compliance',phone:'+2348131227047',email:'nusuk@hausaly.com',web:'www.hausaly.com/nusuk',addr:'Bosso Plaza, Along Gombe Road, Biu, Borno State, Nigeria'};
const ICO={
 phone:'<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
 mail:'<rect x="2.5" y="4.5" width="19" height="15" rx="2"/><path d="m3 7 9 6.5L21 7"/>',
 globe:'<circle cx="12" cy="12" r="9.5"/><path d="M2.5 12h19M12 2.5c2.8 2.7 4.2 5.9 4.2 9.5s-1.4 6.8-4.2 9.5c-2.8-2.7-4.2-5.9-4.2-9.5S9.2 5.2 12 2.5z"/>',
 pin:'<path d="M12 21.5s-7-6.2-7-11.5a7 7 0 0 1 14 0c0 5.3-7 11.5-7 11.5z"/><circle cx="12" cy="10" r="2.6"/>'};
const icoSvg=(n,color,s)=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="${color}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICO[n]}</svg>`;
const icoPng=n=>new Promise(ok=>{const im=new Image();im.onload=()=>{const c=document.createElement('canvas');c.width=c.height=96;c.getContext('2d').drawImage(im,0,0,96,96);ok(c.toDataURL('image/png'))};im.onerror=()=>ok(null);im.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(icoSvg(n,'#8a6a36',96))});
const INFO=[['phone',()=>CO.phone],['mail',()=>CO.email],['globe',()=>CO.web],['pin',()=>CO.addr]];
const LOGO_W=503,LOGO_H=172;   // public/img/logo-white.png size (for the PDF aspect ratio)
const num=n=>Number(n||0).toLocaleString('en-NG');
const dt=d=>d?new Date(d+(d.length==10?'T00:00:00':'')).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'';
const dtm=d=>d?new Date(d).toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'';
const guests=d=>`${d.adults} adult${d.adults==1?'':'s'}${d.children?`, ${d.children} child${d.children==1?'':'ren'}`:''}`;
const TYPE={hotel:'Hotel booking',train:'HHR Train request',transfer:'Transfer request',visa:'Umrah visa request'};

function status(o){
  if(o.type=='hotel'){ if(o.status=='Cancelled')return['CANCELLED','red']; if(o.paymentStatus=='paid')return[o.status=='Fulfilled'?'CONFIRMED · FULFILLED':'CONFIRMED · PAID','green']; return[o.payment?.mode=='manual'?'RESERVED · PAYMENT PENDING':'AWAITING PAYMENT','amber']; }
  if(o.type=='visa'){ if(o.status=='Cancelled')return['CANCELLED','red']; if(o.paymentStatus=='paid')return[o.status=='Fulfilled'?'FULFILLED':'PAID','green']; return['REQUEST RECEIVED · PAYMENT PENDING','amber']; }
  return o.status=='Fulfilled'?['FULFILLED','green']:o.status=='Cancelled'?['CANCELLED','red']:['REQUEST RECEIVED','amber'];
}
function sections(o){
  const d=o.details,c=o.customer;
  const client=[['Full name',c.fullName],['WhatsApp / Mobile',c.phone],['Email',c.email]]; if(c.address)client.push(['Address',c.address]);
  let book=[],pay=[];
  if(o.type=='hotel'){
    book=[['Hotel',d.hotelName+(d.stars?`  (${d.stars}★)`:'')],['City',d.city],['Address',d.address||'—'],['Distance',d.distance||'—'],['Room type',d.roomType],['Check-in',dt(d.checkIn)],['Check-out',dt(d.checkOut)],['Total nights',String(d.nights)],['Rooms',String(d.rooms)],['Guests',guests(d)]];
    if(d.facilities&&d.facilities.length)book.push(['Facilities',d.facilities.join(', ')]);
    pay=[['Rate per night',`NGN ${num(d.perNight)}`],['Nights × rooms',`${d.nights} × ${d.rooms}`],['Payment status',o.paymentStatus=='paid'?'Paid':'Pending']];
    if(o.payment?.reference)pay.push(['Payment reference',o.payment.reference]);
    if(o.payment?.paidAt)pay.push(['Paid on',dtm(o.payment.paidAt)]);
    if(o.paymentStatus!='paid'&&o.payment?.mode=='manual')pay.push(['Next step','Our team will contact you with payment details. Your room is confirmed once payment is received.']);
  }else if(o.type=='visa'){
    book=[['Service','Umrah Visa'],['Adults',String(d.adults)]]; if(d.children)book.push(['Children',String(d.children)]); if(d.infants)book.push(['Infants',String(d.infants)]);
    book.push(['Terms accepted',dtm(d.termsAcceptedAt)||'Yes']);
    if(d.priced){ pay=[]; if(d.adults)pay.push([`${d.adults} × Adult visa`,`NGN ${num(d.adults*d.adultFee)}`]); if(d.children)pay.push([`${d.children} × Child visa`,`NGN ${num(d.children*d.childFee)}`]); if(d.infants)pay.push([`${d.infants} × Infant visa`,`NGN ${num(d.infants*d.infantFee)}`]); pay.push(['Service charges',`NGN ${num(d.serviceFee)}`]); pay.push(['Payment status',o.paymentStatus=='paid'?'Paid':'Pending']); }
    else pay=[['Pricing','Our team will confirm the visa fee and payment details.']];
    if(o.paymentStatus!='paid')pay.push(['Next step','Our team will contact you to collect one passport per pilgrim and payment details.']);
  }else if(o.type=='train'){
    book=[['Service',d.service],['From',d.from],['To',d.to],['Travel date',dt(d.date)+(d.time?`, ${d.time}`:'')]]; if(d.returnDate)book.push(['Return date',dt(d.returnDate)+(d.returnTime?`, ${d.returnTime}`:'')]); book.push(['Passengers',guests(d)]);
    pay=[['Pricing','Our team will contact you with the fare and payment details.']];
  }else{
    book=[['Service',d.service],['Pick-up',d.pickup],['Drop-off',d.dropoff],['Date',dt(d.date)],['Pick-up time',d.time],['Vehicle',`${d.vehicle} — ${d.capacity}`],['Number of vehicles',String(d.quantity)]]; if(d.notes)book.push(['Notes',d.notes]);
    pay=[['Pricing','Our team will contact you with the price and payment details.']];
  }
  return {client,book,pay};
}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function html(o){
  const [st,col]=status(o),S=sections(o);
  const tbl=r=>`<table class="sl-t">${r.map(x=>`<tr><th>${esc(x[0])}</th><td>${esc(x[1])}</td></tr>`).join('')}</table>`;
  return `<div class="slip" id="slipCard">
  <div class="sl-head"><div class="slh-brand"><img src="img/logo-white.png" alt="NUSUK CONSULT"><em>${CO.tag}</em></div><ul class="slh-info">${INFO.map(([n,f])=>`<li><i>${icoSvg(n,'#8a6a36',15)}</i><span>${esc(f())}</span></li>`).join('')}</ul></div>
  <div class="sl-title"><div><div class="eyebrow">${TYPE[o.type]}</div><h2>BOOKING SLIP</h2><small>Issued ${dtm(o.createdAt)}</small></div><div class="sl-id"><small>BOOKING ID</small><b>${esc(o.bookingId)}</b><span class="chip ${col}">${st}</span></div></div>
  <div class="sl-grid"><section><h4>Client information</h4>${tbl(S.client)}</section><section><h4>Booking details</h4>${tbl(S.book)}</section></div>
  <section><h4>${o.type=='hotel'||(o.type=='visa'&&o.details.priced)?'Payment summary':'Pricing'}</h4>${tbl(S.pay)}${o.type=='hotel'||(o.type=='visa'&&o.details.priced)?`<div class="sl-total"><span>TOTAL ${o.paymentStatus=='paid'?'PAID':'DUE'}</span><b>₦${num(o.amount)}</b></div>`:''}</section>
  <div class="sl-foot">Keep this slip and quote your Booking ID when contacting us.<br>${esc(CO.addr)}</div></div>`;
}

const mods={};
const loadJs=src=>mods[src]??=new Promise((ok,no)=>{const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=()=>{delete mods[src];no(new Error('Could not load '+src))};document.head.appendChild(s)});
const dataUrl=async u=>{const b=await (await fetch(u)).blob();return new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result);f.readAsDataURL(b)})};

async function pdf(o){
  await loadJs('js/vendor/jspdf.umd.min.js?v='+(window.NC?NC.v:''));
  const {jsPDF}=window.jspdf, doc=new jsPDF({unit:'mm',format:'a4'}), W=210, M=16, [st,col]=status(o), S=sections(o);
  const GOLD=[221,180,126],INK=[29,26,22],MU=[107,100,90],LINE=[231,224,212];
  const logo=await dataUrl('img/logo-white.png').catch(()=>null);
  // header band
  doc.setFillColor(...GOLD);doc.rect(0,0,W,40,'F');
  if(logo){doc.addImage(logo,'PNG',M,10,48,48*LOGO_H/LOGO_W);}
  doc.setTextColor(91,68,32);doc.setFont('helvetica','bold');doc.setFontSize(9);doc.text(CO.tag,M,29);
  const icons=await Promise.all(INFO.map(([n])=>icoPng(n))), X0=W-M-90;
  INFO.forEach(([n,f],i)=>{const cy=9.5+i*7.2;doc.setFillColor(255,255,255);doc.circle(X0+2.6,cy,2.6,'F');if(icons[i])doc.addImage(icons[i],'PNG',X0+0.9,cy-1.7,3.4,3.4);
    doc.setTextColor(...INK);doc.setFont('helvetica','normal');doc.setFontSize(8.5);doc.text(f(),X0+7.2,cy+1);});
  doc.setFillColor(138,106,54);doc.rect(0,40,W,1.6,'F');
  // title + id
  let y=54;
  doc.setTextColor(...MU);doc.setFont('helvetica','bold');doc.setFontSize(8);doc.text(TYPE[o.type].toUpperCase(),M,y);
  doc.setTextColor(...INK);doc.setFontSize(22);doc.text('BOOKING SLIP',M,y+9);
  doc.setFont('helvetica','normal');doc.setFontSize(8.5);doc.setTextColor(...MU);doc.text('Issued '+dtm(o.createdAt),M,y+15);
  doc.setFontSize(8);doc.text('BOOKING ID',W-M,y,{align:'right'});
  doc.setFont('courier','bold');doc.setFontSize(15);doc.setTextColor(...INK);doc.text(o.bookingId,W-M,y+8,{align:'right'});
  const fill={green:[222,241,228],amber:[251,238,215],red:[253,234,232]}[col],txt={green:[31,90,56],amber:[138,106,54],red:[179,38,30]}[col];
  doc.setFont('helvetica','bold');doc.setFontSize(8.5);const tw=doc.getTextWidth(st)+8;
  doc.setFillColor(...fill);doc.roundedRect(W-M-tw,y+11.5,tw,6.5,3,3,'F');doc.setTextColor(...txt);doc.text(st,W-M-tw/2,y+16,{align:'center'});
  y+=26;
  const need=h=>{if(y+h>281){doc.addPage();y=18}};
  const section=(title,rows)=>{
    need(14);doc.setFillColor(...GOLD);doc.rect(M,y-4,1.6,6,'F');doc.setTextColor(...INK);doc.setFont('helvetica','bold');doc.setFontSize(10.5);doc.text(title.toUpperCase(),M+4,y+0.6);y+=6;
    for(const [k,v] of rows){
      const txt=String(v||'—').replace(/\s*\((\d)★\)/,'  ($1-star)');   // PDF fonts have no ★
      const lines=doc.setFont('helvetica','normal').setFontSize(9.5).splitTextToSize(txt,W-2*M-50);
      const h=Math.max(6.1,lines.length*4.5+1.9);need(h);
      doc.setTextColor(...MU);doc.setFont('helvetica','normal');doc.setFontSize(8.5);doc.text(k,M+1,y+4.1);
      doc.setTextColor(...INK);doc.setFontSize(9.5);doc.text(lines,M+50,y+4.1,{lineHeightFactor:1.3});
      y+=h;doc.setDrawColor(...LINE);doc.setLineWidth(.2);doc.line(M,y,W-M,y);
    }
    y+=4.5;
  };
  section('Client information',S.client);
  section('Booking details',S.book);
  const priced=o.type=='hotel'||(o.type=='visa'&&o.details.priced);
  section(priced?'Payment summary':'Pricing',S.pay);
  if(priced){
    need(18);doc.setFillColor(...INK);doc.roundedRect(M,y,W-2*M,15,2.5,2.5,'F');
    doc.setTextColor(...GOLD);doc.setFont('helvetica','bold');doc.setFontSize(9);doc.text('TOTAL '+(o.paymentStatus=='paid'?'PAID':'DUE'),M+6,y+9);
    doc.setTextColor(255,255,255);doc.setFontSize(16);doc.text('NGN '+num(o.amount),W-M-6,y+9.8,{align:'right'});y+=20;
  }
  // footer on every page
  const n=doc.getNumberOfPages();
  for(let p=1;p<=n;p++){doc.setPage(p);doc.setDrawColor(...GOLD);doc.setLineWidth(.5);doc.line(M,284,W-M,284);doc.setFont('helvetica','normal');doc.setFontSize(7.8);doc.setTextColor(...MU);
    doc.text('Keep this slip and quote your Booking ID when contacting us.  '+CO.phone+'  |  '+CO.email,M,289);doc.text(`Page ${p} of ${n}`,W-M,289,{align:'right'});}
  doc.save(`${o.bookingId}-booking-slip.pdf`);
}
window.NCSlip={html,pdf,status,CO};
})();
