// Booking slip: HTML preview + PDF download. Shared by the public site and the admin dashboard.
(()=>{
const CO={name:'NUSUK CONSULT',tag:'Beyond Compliance',phone:'+2348131227047',email:'nusuk@hausaly.com',web:'www.hausaly.com/nusuk',addr:'Bosso Plaza, Along Gombe Road, Biu, Borno State, Nigeria'};
const LOGO_W=503,LOGO_H=172;   // public/img/logo-gold.png size (for the PDF aspect ratio)
const FIRM={name:'NUSUK CONSULT FIRM',contact:'+234 8131 227 047'};
// Hotel slip terms (plain-text parts; {b:..} = bold)
const HT={
  special:'All special requests are subject to availability upon arrival.',
  pay:[[ 'Booked and Payable Through: ',{b:'NUSUK CONSULT FIRM'}],['Company Address: Bosso Plaza, Gombe Road, Biu Borno, Nigeria.']],
  cancel:[{b:'CANCELLATION POLICY: '},"This booking is non-refundable and cannot be amended or modified. Failure to arrive at the hotel or property will be treated as a no-show and will incur a charge of 100% of the booking value, according to the hotel's policy."],
  notes:[[{b:'IMPORTANT'},': At check-in, you must present a valid photo ID with your address confirming the same name as the lead guest on the booking.'],
    ['Rooms are guaranteed on the day of arrival. In the event of a no-show, the room(s) will be released, and the applicable cancellation/no-show policy will apply.'],
    ['The total booking price excludes minibar items, telephone usage, laundry services, and other additional charges. The property will bill you directly.'],
    ['If breakfast is included, certain properties may charge extra for children travelling with their parents. Verify any applicable charges with the property.'],
    ['Check-in after 16:00 hours and check-out by 12:00 hours'],
    ['Hotel confirmation number (HCN) will be provided 24 hours prior to check-in']]};
const TERMS=['hotel','bedspace','mutawef'];   // slips that carry the booking terms
const guestNames=o=>[o.customer.fullName+' (lead guest)',...String(o.customer.guestList||'').split('\n').map(x=>x.trim()).filter(Boolean)];
const num=n=>Number(n||0).toLocaleString('en-NG');
const dt=d=>d?new Date(d+(d.length==10?'T00:00:00':'')).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'';
const dtm=d=>d?new Date(d).toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'';
const guests=d=>`${d.adults} adult${d.adults==1?'':'s'}${d.children?`, ${d.children} child${d.children==1?'':'ren'}`:''}`;
const PAY=['hotel','bedspace','mutawef'];
const TYPE={hotel:'Hotel booking',bedspace:'Bed space booking',mutawef:'Mutawef booking',train:'HHR Train request',transfer:'Transfer request',visa:'Umrah visa request'};

function status(o){
  if(PAY.includes(o.type)){ if(o.status=='Cancelled')return['CANCELLED','red']; if(o.paymentStatus=='paid')return[o.status=='Fulfilled'?'CONFIRMED · FULFILLED':'CONFIRMED · PAID','green']; return[o.payment?.mode=='manual'?'RESERVED · PAYMENT PENDING':'AWAITING PAYMENT','amber']; }
  if(o.type=='visa'){ if(o.status=='Cancelled')return['CANCELLED','red']; if(o.paymentStatus=='paid')return[o.status=='Fulfilled'?'FULFILLED':'PAID','green']; return['REQUEST RECEIVED · PAYMENT PENDING','amber']; }
  return o.status=='Fulfilled'?['FULFILLED','green']:o.status=='Cancelled'?['CANCELLED','red']:['REQUEST RECEIVED','amber'];
}
function sections(o){
  const d=o.details,c=o.customer;
  const client=[['Full name',c.fullName],['WhatsApp / Mobile',c.phone],['Email',c.email]]; if(['hotel','bedspace','mutawef'].includes(o.type)&&(c.country||!c.address)){if(c.country)client.push(['Country of residence',c.country]);if(c.gender)client.push(['Gender',c.gender])}else if(c.address)client.push(['Address',c.address]);
  let book=[],pay=[];
  if(o.type=='bedspace'){
    book=[['Accommodation',d.title+(d.stars?`  (${d.stars}★)`:'')],...(d.location?[['Description',d.location]]:[]),['Offer',d.offer],['Check-in',dt(d.checkIn)],['Check-out',dt(d.checkOut)],['Total nights',String(d.nights)]];
    pay=[['Total price',`NGN ${num(o.amount)}`],['Payment status',o.paymentStatus=='paid'?'Paid':'Pending']];
    if(o.payment?.reference)pay.push(['Payment reference',o.payment.reference]);
    if(o.payment?.paidAt)pay.push(['Paid on',dtm(o.payment.paidAt)]);
    if(o.paymentStatus!='paid'&&o.payment?.mode=='manual')pay.push(['Next step','Our team will contact you with payment details. Your bed space is confirmed once payment is received.']);
  }else if(o.type=='mutawef'){
    book=[['Mutawef service',d.title],['Description',d.description||'—'],['Sightseeing services',(d.stops||[]).join(', ')],['Number of pilgrims',String(d.people)],['Meeting point',d.meetingPoint||'—']]; if(d.date)book.push(['Preferred date',dt(d.date)]);
    pay=[['Price per sightseeing service',`NGN ${num(d.pricePerService)}`],['Services selected',String((d.stops||[]).length)],['Payment status',o.paymentStatus=='paid'?'Paid':'Pending']];
    if(o.payment?.reference)pay.push(['Payment reference',o.payment.reference]);
    if(o.payment?.paidAt)pay.push(['Paid on',dtm(o.payment.paidAt)]);
    if(o.paymentStatus!='paid'&&o.payment?.mode=='manual')pay.push(['Next step','Our team will contact you with payment details. Your mutawef service is confirmed once payment is received.']);
  }else if(o.type=='hotel'){
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

const rich=p=>p.map(x=>typeof x=='string'?esc(x):`<b>${esc(x.b)}</b>`).join('');
function hotelTerms(o){
  return `<div class="sl-terms">${o.type=='hotel'?`<div class="sl-nb sm"><h5>Guest list:</h5><ol class="sl-gl">${guestNames(o).map(n=>`<li>${esc(n)}</li>`).join('')}</ol></div>`:''}
  <div class="sl-nb sm"><h5>Special requests:</h5><p>${esc(HT.special)}</p><h5 style="margin-top:12px">Payment details</h5><ul>${HT.pay.map(l=>`<li>${rich(l)}</li>`).join('')}</ul></div>
  <div class="sl-nb sm"><p>${rich(HT.cancel)}</p></div>
  <div class="sl-nb sm"><h5>Notes</h5><ul>${HT.notes.map(l=>`<li>${rich(l)}</li>`).join('')}</ul></div></div>`;
}
function html(o){
  const [st,col]=status(o),S=sections(o);
  const tbl=r=>`<table class="sl-t">${r.map(x=>`<tr><th>${esc(x[0])}</th><td>${esc(x[1])}</td></tr>`).join('')}</table>`;
  return `<div class="slip" id="slipCard">
  <div class="sl-head"><img src="img/logo-gold.png" alt="NUSUK CONSULT"><div class="sl-co"><b>${FIRM.name}</b><i></i><p><strong>Platform</strong>: ${esc(CO.web)}</p><p><strong>Email</strong>: ${esc(CO.email)}</p><p><strong>Contact</strong>: ${FIRM.contact}</p></div></div><div class="sl-strip"></div>
  <div class="sl-title"><div><div class="eyebrow">${TYPE[o.type]}</div><h2>BOOKING SLIP</h2><small>Issued ${dtm(o.createdAt)}</small></div><div class="sl-id"><small>BOOKING ID</small><b>${esc(o.bookingId)}</b><span class="chip ${col}">${st}</span></div></div>
  <div class="sl-grid"><section><h4>Client information</h4>${tbl(S.client)}</section><section><h4>Booking details</h4>${tbl(S.book)}</section></div>
  <section><h4>${PAY.includes(o.type)||(o.type=='visa'&&o.details.priced)?'Payment summary':'Pricing'}</h4>${tbl(S.pay)}${PAY.includes(o.type)||(o.type=='visa'&&o.details.priced)?`<div class="sl-total"><span>TOTAL ${o.paymentStatus=='paid'?'PAID':'DUE'}</span><b>₦${num(o.amount)}</b></div>`:''}</section>
  ${TERMS.includes(o.type)?hotelTerms(o):''}
  <div class="sl-foot">Keep this slip and quote your Booking ID when contacting us.<br>${esc(CO.addr)}</div></div>`;
}

const mods={};
const loadJs=src=>mods[src]??=new Promise((ok,no)=>{const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=()=>{delete mods[src];no(new Error('Could not load '+src))};document.head.appendChild(s)});
const dataUrl=async u=>{const b=await (await fetch(u)).blob();return new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result);f.readAsDataURL(b)})};

async function pdf(o){
  await loadJs('js/vendor/jspdf.umd.min.js?v='+(window.NC?NC.v:''));
  const {jsPDF}=window.jspdf, doc=new jsPDF({unit:'mm',format:'a4'}), W=210, M=12, [st,col]=status(o), S=sections(o);
  const GOLD=[221,180,126],INK=[29,26,22],MU=[107,100,90],LINE=[231,224,212];
  const logo=await dataUrl('img/logo-gold.png').catch(()=>null);
  const priced=PAY.includes(o.type)||(o.type=='visa'&&o.details.priced);
  // ---- header: slim cream band, soft white waves, gold logo left, firm details right
  doc.setFillColor(250,247,240);doc.rect(0,0,W,27,'F');
  doc.setDrawColor(255,255,255);doc.setLineWidth(.4);
  [[0,19],[0,21.5],[0,24]].forEach(([x0,y0],i)=>{const d=i*2.5;doc.lines([[40,-9,80,-11,W*.5-x0,-3],[W*.5-40,8,W*.5-5,10+0,W*.5,0]],x0,y0,[1,1],'S')});
  if(logo)doc.addImage(logo,'PNG',M,(27-40*LOGO_H/LOGO_W)/2,40,40*LOGO_H/LOGO_W);
  const HL=[['Platform',CO.web],['Email',CO.email],['Contact',FIRM.contact]];
  doc.setFont('helvetica','normal');doc.setFontSize(7);
  const hw=Math.max(...HL.map(([k,v])=>{doc.setFont('helvetica','bold');const kw=doc.getTextWidth(k);doc.setFont('helvetica','normal');return kw+doc.getTextWidth(': '+v)}));
  doc.setFont('helvetica','bold');doc.setFontSize(11.5);const RX=W-M-Math.max(hw,doc.getTextWidth(FIRM.name));   // block's right edge sits on the body's right margin
  doc.setTextColor(...GOLD);doc.setFont('helvetica','bold');doc.setFontSize(11.5);doc.text(FIRM.name,RX,8.9);
  doc.setFillColor(...GOLD);doc.rect(RX,10.5,15,.7,'F');
  doc.setFontSize(7);HL.forEach(([k,v],i)=>{const yy=14.9+i*3.8;doc.setFont('helvetica','bold');doc.setTextColor(70,64,56);doc.text(k,RX,yy);const kw=doc.getTextWidth(k);doc.setFont('helvetica','normal');doc.text(': '+v,RX+kw,yy)});
  doc.setFillColor(226,209,184);doc.rect(0,27,W,1.8,'F');
  // ---- title + id
  let y=36;
  doc.setTextColor(...MU);doc.setFont('helvetica','bold');doc.setFontSize(6.8);doc.text(TYPE[o.type].toUpperCase(),M,y);
  doc.setTextColor(...INK);doc.setFontSize(16);doc.text('BOOKING SLIP',M,y+6.6);
  doc.setFont('helvetica','normal');doc.setFontSize(7.2);doc.setTextColor(...MU);doc.text('Issued '+dtm(o.createdAt),M,y+11.6);
  doc.setFontSize(6.8);doc.setFont('helvetica','bold');doc.text('BOOKING ID',W-M,y,{align:'right'});
  doc.setFont('courier','bold');doc.setFontSize(12.5);doc.setTextColor(...INK);doc.text(o.bookingId,W-M,y+6,{align:'right'});
  const fill={green:[222,241,228],amber:[251,238,215],red:[253,234,232]}[col],txt={green:[31,90,56],amber:[138,106,54],red:[179,38,30]}[col];
  doc.setFont('helvetica','bold');doc.setFontSize(7);const tw=doc.getTextWidth(st)+7;
  doc.setFillColor(...fill);doc.roundedRect(W-M-tw,y+8,tw,5.2,2.6,2.6,'F');doc.setTextColor(...txt);doc.text(st,W-M-tw/2,y+11.6,{align:'center'});
  y+=22;
  const need=h=>{if(y+h>284){doc.addPage();y=14}};
  // ---- compact label/value table; returns the y it ended at
  const table=(title,rows,x,w,lw,y0)=>{
    let yy=y0;doc.setFillColor(...GOLD);doc.rect(x,yy-3.2,1.3,4.6,'F');doc.setTextColor(...INK);doc.setFont('helvetica','bold');doc.setFontSize(8.2);doc.text(title.toUpperCase(),x+3.2,yy+.3);yy+=3.2;
    for(const [k,v] of rows){
      const t=String(v||'—').replace(/\s*\((\d)★\)/,'  ($1-star)');
      const lines=doc.setFont('helvetica','normal').setFontSize(8.3).splitTextToSize(t,w-lw-1);
      const h=Math.max(5.1,lines.length*3.7+1.6);
      doc.setTextColor(...MU);doc.setFontSize(7.4);doc.text(k,x+.8,yy+3.5);
      doc.setTextColor(...INK);doc.setFontSize(8.3);doc.text(lines,x+lw,yy+3.5,{lineHeightFactor:1.15});
      yy+=h;doc.setDrawColor(...LINE);doc.setLineWidth(.15);doc.line(x,yy,x+w,yy);
    }
    return yy+6.5;
  };
  const LW=70,RX2=M+LW+6,RW=W-M-RX2;
  const y1=table('Client information',S.client,M,LW,31,y);
  const y1b=table(priced?'Payment summary':'Pricing',S.pay,M,LW,31,y1);
  const y2=table('Booking details',S.book,RX2,RW,28,y);
  y=Math.max(y1b,y2);
  if(priced){
    doc.setFillColor(...INK);doc.roundedRect(M,y,W-2*M,11,2,2,'F');
    doc.setTextColor(...GOLD);doc.setFont('helvetica','bold');doc.setFontSize(8);doc.text('TOTAL '+(o.paymentStatus=='paid'?'PAID':'DUE'),M+5,y+7);
    doc.setTextColor(255,255,255);doc.setFontSize(13);doc.text('NGN '+num(o.amount),W-M-5,y+7.6,{align:'right'});y+=18;
  }
  // ---- hotel terms (compact cards)
  if(TERMS.includes(o.type)){
    const IW=W-2*M-9,FS=6.3,HS=6.9,PAD=3.4,GAP=1.3,MM=.3528;
    const lhOf=fs=>fs*MM*1.42;
    const lay=(parts,x,yTop,maxW,draw,fs)=>{   // word-wrapped rich text; returns height used
      const lh=lhOf(fs),words=[];parts.forEach(p=>{const t=typeof p=='string'?p:p.b,bold=typeof p!='string';t.split(/(\s+)/).forEach(w=>{if(w)words.push({w,bold})})});
      let x0=x,n=0,line=[];const base=fs*MM*.82;
      const flush=()=>{if(draw){let xx=x;line.forEach(t=>{doc.setFont('helvetica',t.bold?'bold':'normal');doc.setFontSize(fs);doc.text(t.w,xx,yTop+base+n*lh);xx+=doc.getTextWidth(t.w)})}n++;line=[];x0=x};
      doc.setFontSize(fs);
      for(const t of words){doc.setFont('helvetica',t.bold?'bold':'normal');const tw=doc.getTextWidth(t.w);if(/^\s+$/.test(t.w)){if(!line.length)continue}else if(x0+tw>x+maxW&&line.length){flush()}line.push(t);x0+=tw}
      if(line.length)flush();return n*lh};
    const card=items=>{   // items: {h, p | bul | inline}
      const HH=HS*MM*1.5,measure=(draw,X,y0)=>{let cy=y0+PAD;items.forEach((it,k)=>{
        if(k)cy+=GAP+.8;
        if(it.h){if(draw){doc.setFont('helvetica','bold');doc.setFontSize(HS);doc.setTextColor(...INK);doc.text(it.h,X,cy+HS*MM*.82)}cy+=HH}
        if(it.p)cy+=lay(it.p,X,cy,IW,draw,FS);
        if(it.inline)cy+=lay([it.inline],X,cy,IW,draw,FS);
        (it.bul||[]).forEach(bp=>{if(draw){doc.setFont('helvetica','normal');doc.setFontSize(FS);doc.text('•',X+.5,cy+FS*MM*.82)}cy+=lay(bp,X+4.5,cy,IW-4.5,draw,FS)+.5});
      });return cy-y0+PAD-1.1};
      const h=measure(false,0,0);need(h+3.4);
      doc.setFillColor(250,247,240);doc.rect(M,y,W-2*M,h,'F');doc.setFillColor(237,214,180);doc.rect(M,y,1.4,h,'F');
      doc.setTextColor(...INK);measure(true,M+6,y);y+=h+3.4};
    const gl=guestNames(o).map((n,i)=>`${i+1}. ${n}`).join('      ');
    if(o.type=='hotel')card([{h:'GUEST LIST:',inline:gl}]);
    card([{h:'SPECIAL REQUESTS:',p:[HT.special]},{h:'PAYMENT DETAILS',bul:HT.pay}]);
    card([{p:HT.cancel}]);
    card([{h:'NOTES',bul:HT.notes}]);
  }
  // ---- footer on every page
  const n=doc.getNumberOfPages();
  for(let p=1;p<=n;p++){doc.setPage(p);doc.setDrawColor(...GOLD);doc.setLineWidth(.4);doc.line(M,287,W-M,287);doc.setFont('helvetica','normal');doc.setFontSize(6.8);doc.setTextColor(...MU);
    doc.text('Keep this slip and quote your Booking ID when contacting us.  '+CO.phone+'  |  '+CO.email,M,291.5);doc.text(`Page ${p} of ${n}`,W-M,291.5,{align:'right'});}
  doc.save(`${o.bookingId}-booking-slip.pdf`);
}
window.NCSlip={html,pdf,status,CO};
})();
