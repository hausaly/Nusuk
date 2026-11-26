import json, soundfile as sf
d={n:(lambda f:len(f[0])/f[1])(sf.read(f'tts/{n}.wav')) for n in 'a1 a2 b1 i1 i2 i3 i4 i5 c1 c2 d1 d2 d3'.split()}
d={k:v*1.3 for k,v in d.items()}  # allow slower, natural human reading
vo={}; TL={}
GI=0.55   # pause inside a scene between phrases
HOLD=1.1 # pause after the last phrase of a scene before it exits
SIN=0.45  # gap between exit and next scene entering
# ---- scene 1
TL['s1pill']=[0.5]; TL['s1h']=[0.8]
vo['a1']=1.3; TL['s1sub']=[1.9]
vo['a2']=vo['a1']+d['a1']+GI+0.1
a2=vo['a2']
TL['s1bar']=[a2+0.75]; TL['s1visa']=[a2+0.35]; TL['s1badge']=[a2+d['a2']-0.9]
s1out=a2+d['a2']+HOLD
# ---- scene 2
s2=s1out+SIN
TL['s2h']=[s2]; vo['b1']=s2+0.3; b1=vo['b1']
TL['city0']=[b1+0.30]; TL['city1']=[b1+0.85]; TL['city2']=[b1+1.40]
TL['s2path']=[b1+1.75]; TL['s2ksa']=[b1+2.45]
inc=b1+d['b1']+0.55; TL['s2inc']=[inc]
t=inc+0.45; items=[]
for i in range(1,6):
    vo[f'i{i}']=t; items.append(t-0.05); t+=d[f'i{i}']+0.6
TL['items']=items
s2out=t-0.2+HOLD
# ---- scene 3
s3=s2out+SIN
TL['s3t']=[s3]; TL['s3a']=[s3+0.3]; vo['c1']=s3+0.4
vo['c2']=vo['c1']+d['c1']+0.35; TL['s3b']=[vo['c2']-0.15]
s3out=vo['c2']+d['c2']+HOLD
# ---- scene 4
s4=s3out+SIN
TL['s4h']=[s4]; TL['s4sub']=[s4+0.25]; TL['s4wa']=[s4+0.5]; vo['d1']=s4+0.45
d1e=vo['d1']+d['d1']
TL['s4addr']=[d1e-1.2]   # address card shows while number is finishing
vo['d2']=d1e+0.4; TL['s4map']=[vo['d2']-0.1]
vo['d3']=vo['d2']+d['d2']+0.35; TL['s4web']=[vo['d3']-0.1]; TL['s4trust']=[vo['d3']+0.5]
end=vo['d3']+d['d3']
DUR=round(end+2.6,2)
TL['out1']=s1out; TL['out2']=s2out; TL['out3']=s3out
TL['dur']=DUR; TL['fadeout']=DUR-0.5; TL['vo']=vo; TL['scenes']=[0,s2,s3,s4]
json.dump(TL,open('TL.json','w'),indent=1)
print(json.dumps({k:v for k,v in TL.items() if k in('scenes','dur','out1','out2','out3')}), {k:round(v,2) for k,v in vo.items()})

# ---------- patch html ----------
h=open('assets/cta.html').read()
def rep(a,b):
    global h
    assert h.count(a)==1,(a,h.count(a)); h=h.replace(a,b)
rep('data-in="0.45" data-out="3.3"','data-k="s1pill" data-s="1"')
rep('data-in="0.65" data-out="3.3"','data-k="s1h" data-s="1"')
rep('data-in="1.0" data-out="3.3"','data-k="s1sub" data-s="1"')
rep('data-in="1.15" data-out="3.3"','data-k="s1bar" data-s="1"')
rep('data-in="1.4" data-out="3.3"','data-k="s1visa" data-s="1"')
rep('data-in="2.0" data-out="3.3"','data-k="s1badge" data-s="1"')
rep('data-in="3.4" data-out="6.0"','data-k="s2h" data-s="2"')
rep('data-in="3.9" data-out="6.0"','data-k="s2path" data-s="2"')
rep('data-in="4.1" data-out="6.0"','data-k="s2ksa" data-s="2"')
rep('data-in="4.3" data-out="6.0"','data-k="s2inc" data-s="2"')
rep('data-in="6.2" data-out="8.3"','data-k="s3t" data-s="3"')
rep('data-in="6.4" data-out="8.3"','data-k="s3a" data-s="3"')
rep('data-in="6.9" data-out="8.3"','data-k="s3b" data-s="3"')
rep('data-in="8.5" data-fx="pop"','data-k="s4h" data-fx="pop"')
rep('data-in="8.7" data-fx="up"','data-k="s4sub" data-fx="up"')
rep('data-in="8.9" data-fx="fade"','data-k="s4wa" data-fx="fade"')
rep('data-in="8.9" data-fx="pop"','data-k="s4wa" data-fx="pop"')
rep('data-in="9.2" data-fx="up"','data-k="s4addr" data-fx="up"')
rep('data-in="9.4" data-fx="up"','data-k="s4map" data-fx="up"')
rep('data-in="9.6" data-fx="up"','data-k="s4web" data-fx="up"')
rep('data-in="9.8" data-fx="up"','data-k="s4trust" data-fx="up"')
# cities: individual timing (children become animated, container static)
rep('<div class="el" style="left:60px;top:395px;width:900px;display:flex;gap:20px" data-in="3.5" data-out="6.0" data-fx="none" id="cities">','<div style="position:absolute;left:60px;top:395px;width:900px;display:flex;gap:20px" id="cities">')
print('cities container ok' if 'id="cities"' in h else 'cities?')

rep("const DUR=11, FADE_OUT=10.55;","window.TL="+json.dumps(TL)+"; const DUR=TL.dur, FADE_OUT=TL.fadeout;")
rep("d.dataset.in=4.45+i*0.2; d.dataset.out=6.0;","d.dataset.in=TL.items[i]; d.dataset.out=TL.out2;")
rep("const els=[...document.querySelectorAll('.el')];","""document.querySelectorAll('.city').forEach((c,i)=>{c.classList.add('el');c.style.position='relative';c.dataset.k='city'+i;c.dataset.s='2';c.dataset.fx='up';});
const els=[...document.querySelectorAll('.el')];
els.forEach(el=>{const k=el.dataset.k; if(k){el.dataset.in=TL[k][0]; if(el.dataset.s) el.dataset.out=TL['out'+el.dataset.s];}});""")
rep("(t-1.35)/0.9","(t-TL.s1bar[0]-0.1)/0.9")
rep("(t<8.9)?0:","(t<TL.s4wa[0])?0:")
open('assets/cta2.html','w').write(h)
