"""Builds brochure.html for NUSUK CONSULT Service 5 - Saudi Partner Company Contracting.
Run:  python3 -I build.py && node render_pdf.mjs      (needs: pip install qrcode)"""
import base64, io, mimetypes, os
import qrcode

HERE = os.path.dirname(os.path.abspath(__file__))
A = os.path.join(HERE, 'assets')
FORM_URL = 'https://www.hausaly.com/nusuk/#/interest'          # the Service Interest Form on the NUSUK CONSULT site

def data(name):
    p = os.path.join(A, name); mime = mimetypes.guess_type(p)[0] or 'application/octet-stream'
    return f'data:{mime};base64,' + base64.b64encode(open(p, 'rb').read()).decode()

def qr_uri(url):
    q = qrcode.QRCode(box_size=10, border=1, error_correction=qrcode.constants.ERROR_CORRECT_M); q.add_data(url); q.make(fit=True)
    buf = io.BytesIO(); q.make_image(fill_color='#1d1a16', back_color='white').save(buf, format='PNG')
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()

def ico(d, s=20, c='currentColor', sw=1.8):
    return f'<svg viewBox="0 0 24 24" width="{s}" height="{s}" fill="none" stroke="{c}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round">{d}</svg>'
I = {
 'zap': '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
 'layers': '<path d="m12 3 9 5-9 5-9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5"/>',
 'bed': '<path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4M12 4v6M2 18h20"/>',
 'headset': '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="2" y="14" width="5" height="7" rx="2"/><rect x="17" y="14" width="5" height="7" rx="2"/><path d="M20 21a4 4 0 0 1-4 2h-2"/>',
 'tag': '<path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4z"/><circle cx="7.5" cy="7.5" r=".6"/>',
 'file': '<path d="M6 2h9l5 5v15H6zM15 2v5h5M9 13h7M9 17h7"/>',
 'cal': '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M9 16l2 2 4-4"/>',
 'user': '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
 'users': '<circle cx="9" cy="8" r="3.5"/><path d="M2 21a7 7 0 0 1 14 0M16 4.5a3.5 3.5 0 0 1 0 7M22 21a7 7 0 0 0-4.5-6.5"/>',
 'shield': '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
 'check': '<path d="M5 12l5 5 9-10"/>',
 'x': '<path d="M6 6l12 12M18 6 6 18"/>',
 'clock': '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 'bldg': '<path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M14 9h5a1 1 0 0 1 1 1v11M2 21h20M8 8h2M8 12h2M8 16h2"/>',
 'globe': '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
 'pin': '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
 'phone': '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
 'mail': '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
 'link': '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
 'at': '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>',
 'hash': '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
 'alert': '<path d="M12 3 2 20h20zM12 10v5M12 18h.01"/>',
 'list': '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
 'arrow': '<path d="M5 12h14M13 6l6 6-6 6"/>',
 'award': '<circle cx="12" cy="9" r="6"/><path d="m8.5 14-1.5 8 5-3 5 3-1.5-8"/>',
 'user_check': '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M16 11l2 2 4-4"/>',
 'plane': '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
}
def i(n, s=20, c='currentColor'): return ico(I[n], s, c)
YES = f'<span class="yes">{ico(I["check"], 18, "#2f7d4f", 2.6)}</span>'
NO = '<span class="no">—</span>'
SOCIAL = 'LinkedIn, Facebook, TikTok, Instagram, YouTube, X'

def rh(): return f'<div class="rh"><img src="{data("nusuk_consult_logo.jpg")}" alt="NUSUK CONSULT"><span class="sv">SERVICE 5</span></div>'
def pf(n): return f'<div class="pf"><span>NUSUK CONSULT · Service 5 — Saudi Partner Company Contracting</span><span>{n}</span></div>'
def ph(eyebrow, title, sub=''): return f'<div class="ph"><div class="eyebrow">{eyebrow}</div><h2>{title}</h2>{f"<p class=mu>{sub}</p>" if sub else ""}</div>'

pages = []

# ---------------------------------------------------------------- 1 COVER
pages.append(f'''<section class="page cover">
<div class="cv-top"><img src="{data("nusuk_consult_logo_white.png")}" alt="NUSUK CONSULT"><span class="sv">SERVICE 5</span></div>
<div class="cv-mid"><div class="eyebrow">NUSUK CONSULT · BEYOND COMPLIANCE</div>
<h1>Saudi Partner<br><em>Company</em> Contracting</h1>
<p class="lead">Get the right Saudi Umrah company partner, signed directly and with no middlemen, for your ground services and NUSUK MASAR licensing.</p></div>
<div class="cv-low"><div class="cv-pts">
<div class="cv-pt"><div class="ci">{i("link",18)}</div><div><b>Zero middlemen</b><small>Your contract is directly between your agency and the licensed Saudi Umrah company.</small></div></div>
<div class="cv-pt"><div class="ci">{i("shield",18)}</div><div><b>NUSUK MASAR ready</b><small>From the first licensing form to Ministry final approval, handled end to end.</small></div></div>
<div class="cv-pt"><div class="ci">{i("file",18)}</div><div><b>Signed at the Forum</b><small>In person, once a year, at the Umrah &amp; Ziyarah Forum, or through our representative.</small></div></div></div>
<div class="cv-ph"><img src="{data("forum_signing_photo.jpg")}" alt=""><div class="cap"><b>PROVEN AT THE FORUM</b>Signing of the Umrah Pilgrims and Visitors Services Agreement, Umrah &amp; Ziyarah Forum 2026, Madinah.</div></div></div>
<div class="cv-ft"><span><b>www.hausaly.com/nusuk</b> · nusuk@hausaly.com</span><span>+234 813 122 7047 (WhatsApp / Calls)</span></div></section>''')

# ---------------------------------------------------------------- 2 WHY + PARTNER MATCHING
pages.append(f'''<section class="page roomy">{rh()}
{ph("WHY THIS MATTERS", "One step decides your whole season")}
<p class="body">Every External Agent and OTA selling Umrah Services must be licensed on <b>NUSUK MASAR</b>, the Ministry of Hajj and Umrah’s unified platform. One step decides your whole season: choosing and contracting with a <b>licensed Saudi Umrah company</b>.</p>
<p class="body">That partner approves your visa requests, delivers your pilgrims’ hotels and transport, and appears on your Ministry-approved contract for the season.</p>
<div class="two" style="margin-top:10px">
<div class="good"><h4>{i("check",18,"#2f7d4f")} Choose well</h4><p>Fast approvals, flexible packages, and support when something goes wrong.</p></div>
<div class="badc"><h4>{i("x",18,"#b3261e")} Choose badly</h4><p>Delayed visas, rigid package rules, and a full season locked into the wrong contract.</p></div></div>
<div class="callout" style="margin-top:10px">{i("alert",20,"#8a6a36")}<div><b>The contract can only be signed in person, once a year,</b> at the Umrah &amp; Ziyarah Forum for each Umrah session. If you miss the window, you miss the season. <b>NUSUK CONSULT takes you from the first form to the signed contract.</b></div></div>
<div class="eyebrow" style="margin-top:15px">WHAT WE DO</div>
<div class="sh" style="margin-top:2px"><div class="sn">1</div><div><h3>Partner Matching</h3><p>We shortlist licensed Saudi Umrah companies that fit how you sell. We look at:</p></div></div>
<div class="crit">
<div class="cr"><div class="ci">{i("zap",18)}</div><div><b>Visa approval speed</b><span>Their track record on turning around External Agent visa requests on NUSUK MASAR.</span></div></div>
<div class="cr"><div class="ci">{i("layers",18)}</div><div><b>Package flexibility</b><span>Whether they offer full packages only, or light options such as visa only with a flight reservation and a short-stay hotel.</span></div></div>
<div class="cr"><div class="ci">{i("bed",18)}</div><div><b>Service coverage</b><span>Hotels in Makkah and Madinah, ground transport, and add-ons.</span></div></div>
<div class="cr"><div class="ci">{i("headset",18)}</div><div><b>Support quality</b><span>Whether you get a dedicated contact who answers during the season.</span></div></div>
<div class="cr wide"><div class="ci">{i("tag",18)}</div><div><b>Commercial terms</b><span>Pricing, cancellation and refund policies, and bank guarantee requirements.</span></div></div></div>
<div style="height:10px"></div>
<div class="stepc"><div class="sn">2</div><div><h4>NUSUK MASAR Application Filing</h4><p>We prepare and file your licensing request: facility data, representative data, form data, financial data, and document uploads. Then we track each status until your request moves forward.</p></div></div>
{pf(2)}</section>''')

# ---------------------------------------------------------------- 3 STEPS 2-5 + JOURNEY TABLE
pages.append(f'''<section class="page roomy">{rh()}
{ph("WHAT WE DO, CONTINUED", "From contracting request to Final Approval")}
<div class="stepc"><div class="sn">3</div><div><h4>Contracting Request and Forum Booking</h4><p>We submit your contracting request to the selected Umrah Company and book your agreement-signing slot at the Umrah &amp; Ziyarah Forum.</p></div></div>
<div class="stepc"><div class="sn">4</div><div><h4>Your Representative at the Forum</h4><p>If you cannot travel to Saudi Arabia, our representative attends the Forum for you. They meet your partner company, oversee the physical signing, and collect your contract file.</p></div></div>
<div class="stepc"><div class="sn">5</div><div><h4>Contract Approval and Ministry Follow-Through</h4><p>We follow up until your partner updates NUSUK MASAR with the contract approval. We then guide you through the Ministry of Foreign Affairs stage, including the document uploads and the “Send to Embassy” step, through to Final Approval.</p></div></div>
<div class="sh" style="margin-top:14px"><div class="sn" style="background:var(--g);color:var(--ink)">{i("list",15,"#1d1a16")}</div><div><h3>Your Licensing Journey, Handled End to End</h3><p>Who does what at every NUSUK MASAR step.</p></div></div>
<table class="tbl"><tr><th>NUSUK MASAR step</th><th>Who handles it</th></tr>
<tr><td>1. Submit new licensing request</td><td><span class="who">NUSUK CONSULT files it with you</span></td></tr>
<tr><td>2. Pay licensing fee (SAR 2,000*)</td><td><span class="who you">You pay directly on the platform; we guide you</span></td></tr>
<tr><td>3. Submit contracting request to Umrah company</td><td><span class="who">NUSUK CONSULT, after partner matching</span></td></tr>
<tr><td>4. Book the Umrah &amp; Ziyarah Forum</td><td><span class="who">NUSUK CONSULT</span></td></tr>
<tr><td>5. Sign the contract and get it approved</td><td><span class="who">NUSUK CONSULT representative at the Forum</span></td></tr>
<tr><td>6. Ministry of Foreign Affairs approval</td><td><span class="who">NUSUK CONSULT guides the submission</span></td></tr></table>
<p class="fn">*Fee as published by the Ministry; subject to change.</p>
<div class="trk"><h5>Your application, tracked at every stage</h5><div class="row">
<div class="st"><div class="dot">1</div><b>Request filed</b><small>Awaiting Payment</small></div>
<div class="st"><div class="dot">2</div><b>Fee paid</b><small>On the platform</small></div>
<div class="st"><div class="dot">3</div><b>Contracting request</b><small>To your partner</small></div>
<div class="st"><div class="dot">4</div><b>Forum slot booked</b><small>Signing scheduled</small></div>
<div class="st"><div class="dot">5</div><b>Contract signed</b><small>And approved</small></div>
<div class="st last"><div class="dot">6</div><b>Final Approval</b><small>After MOFA stage</small></div></div></div>
{pf(3)}</section>''')

# ---------------------------------------------------------------- 4 RECEIVE + ZERO MIDDLEMEN + WHO
pages.append(f'''<section class="page">{rh()}
{ph("WHAT YOU RECEIVE", "Everything you walk away with")}
<div class="rec">
<div class="rc"><div class="ci">{i("file",17)}</div><div><b>Signed contract file</b><span>A copy of your official agreement from the Forum, plus the Forum signing pack.</span></div></div>
<div class="rc"><div class="ci">{i("shield",17)}</div><div><b>NUSUK MASAR contract approval</b><span>Your partnership confirmed on the platform.</span></div></div>
<div class="rc"><div class="ci">{i("headset",17)}</div><div><b>Direct partner support contact</b><span>A named person at your Saudi Umrah company for visas, packages, and in-season issues.</span></div></div>
<div class="rc"><div class="ci">{i("list",17)}</div><div><b>Partner comparison summary</b><span>Why your partner was chosen, and the terms you agreed to.</span></div></div>
<div class="rc wide"><div class="ci">{i("clock",17)}</div><div><b>Application tracking</b><span>Status updates at every stage, from “Awaiting Payment” to “Final Approval”.</span></div></div></div>
<div class="band"><div class="eyebrow">ZERO MIDDLEMEN</div><h3>What that means for you</h3>
<p>Your contract is directly between your agency and the licensed Saudi Umrah company. <b>NUSUK Consult facilitates the process but does not sit inside your contract.</b></p>
<p>Under the Ministry’s Unified Contract, <b>all package payments go through NUSUK MASAR only.</b> No money for your pilgrims’ packages passes through us, and no hidden markup is added between you and your partner.</p></div>
<div class="eyebrow" style="margin-top:16px">WHO THIS SERVICE IS FOR</div>
<div class="whoG">
<div class="wc"><div class="ci">{i("user_check",17)}</div><span><b>New External Agents</b>applying for a NUSUK MASAR license for the first time.</span></div>
<div class="wc"><div class="ci">{i("zap",17)}</div><span><b>Existing agents</b>who want a better partner: faster approvals, more flexible packages, better support.</span></div>
<div class="wc"><div class="ci">{i("globe",17)}</div><span><b>OTAs</b>entering the Umrah market and needing a compliant Saudi ground partner.</span></div>
<div class="wc"><div class="ci">{i("plane",17)}</div><span><b>Agencies that cannot travel</b>to the Forum but need the contract signed on time.</span></div></div>
<div class="callout" style="margin-top:14px">{i("cal",20,"#8a6a36")}<div><b>Plan ahead: key windows.</b> External Agent registration and Forum contracting happen in a fixed annual window, at the end of the Umrah season around Ramadan. <b>Start now.</b> Partner matching, document authentication, and Forum slots all take time. Agencies that prepare early get first choice of partners and signing slots.</div></div>
<div class="card" style="margin-top:10px;display:flex;gap:11px;align-items:center"><div class="ci" style="width:34px;height:34px;border-radius:10px;background:var(--gl);border:1px solid var(--g);color:var(--gd);display:flex;align-items:center;justify-content:center;flex:none">{i("list",18)}</div><div><b>What you’ll need to prepare</b><div style="font-size:8.8pt;color:var(--mu)">We give you a full checklist.</div></div></div>
{pf(4)}</section>''')

# ---------------------------------------------------------------- 5 PROVEN + PACKAGES
pages.append(f'''<section class="page">{rh()}
{ph("PROVEN AT THE FORUM", "Contracts signed in person, in Madinah")}
<div class="proven"><div class="pv-ph"><img src="{data("forum_signing_photo.jpg")}" alt=""><div class="cap">Signing of the Umrah Pilgrims and Visitors Services Agreement at the Umrah &amp; Ziyarah Forum 2026, Madinah.</div></div>
<div class="pv-tx"><p class="big">At the 2026 Umrah &amp; Ziyarah Forum in Madinah, NUSUK CONSULT guided many Nigerian External Agents from application to physical contract signing with a licensed Saudi Umrah company, for the 1448 AH season.</p>
<div class="pv-st"><div><b>2026</b><small>Umrah &amp; Ziyarah Forum</small></div><div><b>Madinah</b><small>Physical signing</small></div><div><b>1448 AH</b><small>Season contracted</small></div></div></div></div>
<div class="eyebrow" style="margin-top:17px">SERVICE PACKAGES</div>
<table class="pk"><tr><th>What’s included</th><th>Essential</th><th>Complete</th><th class="feat">Forum Concierge</th></tr>
<tr><td>Partner matching &amp; shortlist</td><td>{YES}</td><td>{YES}</td><td class="feat">{YES}</td></tr>
<tr><td>NUSUK MASAR application filing</td><td>{NO}</td><td>{YES}</td><td class="feat">{YES}</td></tr>
<tr><td>Contracting request &amp; Forum booking</td><td>{YES}</td><td>{YES}</td><td class="feat">{YES}</td></tr>
<tr><td>Representative at the Forum</td><td>{NO}</td><td>{NO}</td><td class="feat">{YES}</td></tr>
<tr><td>Contract approval follow-up</td><td>{YES}</td><td>{YES}</td><td class="feat">{YES}</td></tr>
<tr><td>Ministry of Foreign Affairs stage guidance</td><td>{NO}</td><td>{YES}</td><td class="feat">{YES}</td></tr></table>
<p class="fn">Cannot travel to Saudi Arabia? The Forum Concierge package sends our representative to attend and handle the signing for you.</p>
<div class="cta" style="margin-top:15px"><div><h3>Interested in a NUSUK Consult Service?</h3><p>Complete the Interest Form to request a NUSUK Consult service now!</p><span class="btn">Open the Interest Form {i("arrow",14,"#1d1a16")}</span><span class="url">{FORM_URL}</span></div>
<div class="qr"><img src="{qr_uri(FORM_URL)}" alt="QR code"><small>SCAN TO APPLY</small></div></div>
{pf(5)}</section>''')

# ---------------------------------------------------------------- 6 FAQ + CONTACTS + ECOSYSTEM
pages.append(f'''<section class="page">{rh()}
{ph("FAQ", "Questions we hear most")}
<div class="faq">
<div class="q"><h4><i>?</i>Can you guarantee fast visa approvals?</h4><p>Visa approvals depend on your partner company, the Ministry, and how complete each application is. We match you with companies that have a strong approval track record, and we make sure your setup is correct from day one.</p></div>
<div class="q"><h4><i>?</i>Can I offer visa-only services?</h4><p>Some Umrah companies offer only full packages (visa, hotel, and transfers). Others offer lighter options, such as a visa only with a flight reservation and a short-stay hotel. Tell us your sales model and we will match you with a partner whose offering fits it.</p></div>
<div class="q"><h4><i>?</i>Do I have to travel to Saudi Arabia?</h4><p>No. With the Forum Concierge package, our representative attends and handles the signing for you.</p></div>
<div class="q"><h4><i>?</i>What if my request is returned for corrections?</h4><p>We handle the revisions and resubmit for you until your request moves forward.</p></div></div>
<div class="eyebrow" style="margin-top:16px">CONTACTS</div>
<div class="cts">
<div class="ct"><div class="ci">{i("globe",15)}</div><div><small>Website</small><b>www.hausaly.com/nusuk</b></div></div>
<div class="ct"><div class="ci">{i("mail",15)}</div><div><small>Email</small><b>nusuk@hausaly.com</b></div></div>
<div class="ct"><div class="ci">{i("phone",15)}</div><div><small>Phone (WhatsApp / Calls)</small><b>+234 813 122 7047</b></div></div>
<div class="ct"><div class="ci">{i("pin",15)}</div><div><small>Head office</small><b>Bosso Plaza, Along Gombe Road, Biu, Borno State, Nigeria</b></div></div>
<div class="ct wide"><div class="ci">{i("at",15)}</div><div><small>Media handles</small><b>{SOCIAL} · @nusukconsult</b></div></div>
<div class="ct wide"><div class="ci">{i("hash",15)}</div><div><small>Hashtags</small><div class="tags"><span>#nusukconsult</span><span>#nusukmasar</span><span>#engr.ibrahiminusa</span></div></div></div>
<div class="ct wide"><div class="ci">{i("link",15)}</div><div><small>Umrah &amp; Ziyarah Forum</small><b>umrah-ziyarah.com</b></div></div></div>
<div class="eco"><h5>Platforms &amp; programmes referenced in this brochure</h5>
<div class="logos"><img src="{data("ministry_hajj_umrah_logo.png")}" alt="Ministry of Hajj and Umrah" style="height:40px"><img src="{data("nusuk_platform_logo.svg")}" alt="Nusuk" style="height:36px"><img src="{data("umrah_ziyarah_forum_logo.png")}" alt="Umrah and Ziyarah Forum" style="height:36px"><img src="{data("mofa_logo.svg")}" alt="Ministry of Foreign Affairs" style="height:40px"><img src="{data("ksa_visa_logo.svg")}" alt="KSA Visa" style="height:38px"><img src="{data("guests_of_rahman_logo.png")}" alt="Guests of Allah Service Program" style="height:30px"></div>
<p class="disc">All logos and trademarks belong to their respective owners and are shown only to identify the platforms and programmes referred to. NUSUK CONSULT is an independent advisory practice and is not affiliated with, endorsed by, or acting on behalf of the Ministry of Hajj and Umrah, the Ministry of Foreign Affairs, the Umrah &amp; Ziyarah Forum, or any Saudi Umrah company. Our services are advisory and facilitative; we do not guarantee any registration, visa, contractual or regulatory outcome. Fees and procedures are as published by the Ministry and are subject to change.</p></div>
{pf(6)}</section>''')

css = open(os.path.join(HERE, 'style.css'), encoding='utf8').read()
open(os.path.join(HERE, 'brochure.html'), 'w', encoding='utf8').write(
    f'<!doctype html><html lang="en"><meta charset="utf-8"><title>NUSUK CONSULT — Service 5: Saudi Partner Company Contracting</title><style>{css}</style><body>' + ''.join(pages) + '</body></html>')
print('pages', len(pages))
