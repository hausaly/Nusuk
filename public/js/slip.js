// Booking slip: HTML preview + PDF download. Shared by the public site and the admin dashboard.
(()=>{
const CO={name:'NUSUK CONSULT',tag:'Beyond Compliance',phone:'+2348131227047',email:'nusuk@hausaly.com',web:'www.hausaly.com/nusuk',addr:'Bosso Plaza, Along Gombe Road, Biu, Borno State, Nigeria'};
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
  <div class="sl-head"><img src="img/logo-white.png" alt="NUSUK CONSULT"><div><b>${CO.name}</b><span>${CO.tag}</span><small>${esc(CO.phone)} · ${esc(CO.email)}<br>${esc(CO.web)}</small></div></div>
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
  if(logo){doc.addImage(logo,'PNG',M,8.5,48,48*LOGO_H/LOGO_W);}
  doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(15);doc.text(CO.name,W-M,16,{align:'right'});
  doc.setFontSize(9);doc.text(CO.tag,W-M,21.5,{align:'right'});
  doc.setTextColor(255,255,255);doc.setFont('helvetica','normal');doc.setFontSize(8);
  doc.text([CO.phone+'  |  '+CO.email,CO.web,CO.addr],W-M,27,{align:'right',lineHeightFactor:1.35});
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
