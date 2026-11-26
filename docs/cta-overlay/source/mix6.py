import subprocess, numpy as np
from scipy import signal
import json; TL=json.load(open('TL4.json')); SR=48000; DUR=TL['dur']
U='/root/.claude/uploads/2d110232-cc8a-55c2-b443-0f88f5d1ccba/'
def load(f):
    raw=subprocess.run(['ffmpeg','-v','error','-i',U+f,'-ac','2','-ar',str(SR),'-f','f32le','-'],capture_output=True).stdout
    return np.frombuffer(raw,dtype=np.float32).reshape(-1,2).copy()
NOTIF=load('e34effc6-Digital_Notification.mp3')   # bright multi-note chime, attack ~0.08s
POP=load('0a5e3e27-mixkitc_Popup.wav')            # short UI pop
TRANS=load('af93040c-SB_4_digital_transition.mp3')# whoosh burst + swell, climax ~1.1s
NOTIF2=load('c80fe370-SB_2_digital_notification.mp3') # warm soft chime, attack ~0.04s

def pitch(x,semi):
    r=2**(semi/12); n=int(len(x)/r); idx=np.linspace(0,len(x)-1,n)
    return np.stack([np.interp(idx,np.arange(len(x)),x[:,c]) for c in (0,1)],1)
def fade(x,fi=0.005,fo=0.03):
    x=x.copy(); a=int(fi*SR); b=int(fo*SR)
    if a: x[:a]*=np.linspace(0,1,a)[:,None]
    if b: x[-b:]*=np.linspace(1,0,b)[:,None]
    return x
def seg(x,a,b): return fade(x[int(a*SR):int(b*SR)],0.01,0.12)
def noise(n): return np.random.default_rng(7).standard_normal(n)
def bp_sweep(dur,f0,f1,q=1.2):
    """noise through a sweeping band-pass (STFT-free: block filtering)"""
    n=int(dur*SR); x=noise(n); out=np.zeros(n); blk=1024
    for i in range(0,n-blk,blk//2):
        t=i/n; f=f0*(f1/f0)**t
        b,a=signal.iirpeak(min(f,SR/2-100)/(SR/2),q)
        seg_=signal.lfilter(b,a,x[i:i+blk])*np.hanning(blk)
        out[i:i+blk]+=seg_
    return out/np.abs(out).max()
def stereo(m,w=0.0): return np.stack([m,np.roll(m,int(w*SR*0.002))],1)
def whoosh(dur,f0,f1,peak=0.5,q=1.5):
    m=bp_sweep(dur,f0,f1,q); n=len(m); t=np.linspace(0,1,n)
    env=np.sin(np.pi*t**peak/ (1)) ** 2 if False else (np.sin(np.pi*np.clip(t**(0.6 if peak<0.5 else 1.0),0,1))**2)
    return stereo(m*env)
def impact(dur=0.9):
    n=int(dur*SR); t=np.arange(n)/SR
    f=45+90*np.exp(-t*14); ph=2*np.pi*np.cumsum(f)/SR
    body=np.sin(ph)*np.exp(-t*5.5)
    click=noise(n)*np.exp(-t*90)*0.5
    b,a=signal.butter(2,2500/(SR/2)); click=signal.lfilter(b,a,click)
    air=bp_sweep(dur,6000,1500,1)*np.exp(-t*18)*0.25
    m=body+click+air; m/=np.abs(m).max(); return stereo(m)
def riser(dur):
    n=int(dur*SR); t=np.arange(n)/SR; k=t/dur
    f=350*(1+5*k**1.6); ph=2*np.pi*np.cumsum(f)/SR
    tone=np.sin(ph)*0.35+np.sin(ph*2)*0.12
    sh=bp_sweep(dur,1500,7000,1.0)*0.5
    env=(k**1.8)*np.minimum(1,(1-k)*12+0.05)
    m=(tone+sh)*env; m/=np.abs(m).max(); return stereo(m)
def thwip(dur=0.32):
    return whoosh(dur,900,5200,0.45,1.8)



mix=np.zeros((int(DUR*SR)+SR,2)); log=[]
def place(x,t,gain_db,label):
    g=10**(gain_db/20); i=int(round(t*SR)); x=x*g
    j=min(len(mix),i+len(x)); mix[i:j]+=x[:j-i]; log.append((t,label))
A_NOTIF=0.08; A_N2=0.04
K=lambda k:TL[k][0]
def scribble(d=0.6): return whoosh(d,2500,6500,0.5,1.0)
# ---- scene 1
place(whoosh(0.45,500,3500,0.5,1.4),0.25,-14,'logo tab whoosh')
place(thwip(0.45),K('s1pill')+0.02,-12,'sheet slide in')
place(pitch(POP,-2),K('s1pill')+0.10,-11.5,'package tab pop')
place(impact(),K('s1h')+0.05,-14,'14 DAYS impact')
place(NOTIF2,K('s1h')+0.12-A_N2,-13,'14 DAYS chime')
place(scribble(0.7),K('s1h')+0.55,-19,'marker circle scribble')
place(pitch(POP,-5),K('s1bar')+0.12,-11.5,'10 days note')
place(thwip(0.3),K('s1bar')+0.02,-16,'10 days note swoosh')
place(pitch(POP,-3),K('s1bar2')+0.12,-11.5,'4 days note')
place(thwip(0.3),K('s1bar2')+0.02,-16,'4 days note swoosh')
place(thwip(),K('s1visa')+0.04,-13,'ticket swoosh')
place(impact(0.8),K('s1badge')+0.22,-11,'visa stamp slam')
place(seg(TRANS,0,1.5),TL['out1']-0.10,-6,'transition 1->2')
# ---- scene 2
for i in range(3): place(pitch(POP,-4+i*2),K(f'city{i}')+0.16,-11.5,f'city {i} drop')
place(whoosh(1.2,700,3000,0.5,1.2),K('s2path'),-18,'plane flight')
place(pitch(NOTIF2,-2),K('s2ksa')+0.06-A_N2,-14,'Saudi logo')
place(scribble(0.5),K('s2inc')+0.3,-19,'highlighter')
for i,t in enumerate(TL['items']):
    place(pitch(POP,i*2),t+0.16,-11.5,f'item {i+1} drop')
    place(scribble(0.3),t+0.3,-22,f'item {i+1} tick draw')
place(seg(TRANS,0.7,1.5),TL['out2']-0.40,-6,'transition 2->3 swell')
# ---- scene 3
place(pitch(POP,-3),K('s3t')+0.1,-12,'offers label')
place(thwip(0.5),K('s3a')+0.02,-11,'strip A swoosh')
place(impact(0.7),K('s3a')+0.5,-15,'strip A slam')
place(NOTIF2,K('s3a')+0.55-A_N2,-13,'strip A chime')
place(thwip(0.5),K('s3b')+0.02,-11,'strip B swoosh')
place(impact(0.7),K('s3b')+0.5,-15,'strip B slam')
place(pitch(NOTIF2,4),K('s3b')+0.55-A_N2,-14,'strip B chime')
place(seg(TRANS,0.45,1.5),TL['out3']-0.12,-6,'transition 3->4')
# ---- scene 4
place(impact(),K('s4h')+0.08,-14,'BOOK NOW impact')
place(scribble(0.5),K('s4sub')+0.15,-19,'underline swipe')
place(NOTIF,K('s4wa')+0.25-A_NOTIF,-12.5,'WhatsApp ding')
for i,k in enumerate(['s4map','s4addr','s4trust','s4web']): place(pitch(POP,i*2),K(k)+0.16,-16,k+' drop')
mix=np.tanh(mix*1.1)/np.tanh(1.1)
import wave
w=wave.open('sfx6.wav','wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(mix,-1,1)*32767).astype(np.int16).tobytes()); w.close()
print('sfx peak',np.abs(mix).max(),'dur',DUR)
