import subprocess, numpy as np
from scipy import signal
SR=48000; DUR=11.0
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

mix=np.zeros((int(DUR*SR),2))
log=[]
def place(x,t,gain_db,label):
    g=10**(gain_db/20); i=int(round(t*SR)); x=x*g
    j=min(len(mix),i+len(x)); mix[i:j]+=x[:j-i]; log.append((t,label))

# ---- attack offsets inside the source files (measured) ----
A_NOTIF=0.08; A_POP=0.0; A_N2=0.04

# SCENE 1  (visual hits: logo 0.2, pill 0.45, "14" pop 0.65, bar 1.35-2.25, visa 1.4, badge 2.0)
place(whoosh(0.45,500,3500,0.5,1.4),0.12,-17,'logo slide-in whoosh')
place(pitch(POP,-2),0.52,-12,'UMRAH PACKAGE pill pop')
place(impact(),0.72,-9,'14 DAYS impact')
place(NOTIF,0.78-A_NOTIF,-13,'14 DAYS chime')
place(riser(0.95),1.30,-22,'split-bar riser (grows 1.35-2.25)')
place(thwip(),1.46,-15,'ticket pop-in swoosh')
place(pitch(POP,3),2.08,-9,'MULTIPLE ENTRY VISA badge pop')
place(pitch(NOTIF2,5),2.10-A_N2,-16,'badge sparkle')
# SCENE 1 -> 2 transition (exit 3.3, new scene 3.4)
place(seg(TRANS,0,1.5),3.22,1,'scene 1->2 transition')
# SCENE 2 (cities 3.5, path 3.9, KSA logo 4.1, header 4.3, 5 items 4.45 +0.2 each)
place(pitch(POP,-4),3.56,-12,'city cards pop')
place(pitch(NOTIF2,-2),4.12-A_N2,-13,'Saudi logo reveal')
for i in range(5):
    t=4.45+i*0.2+0.12
    place(pitch(POP,i*2),t,-11,f'include item {i+1} tick')
# SCENE 2 -> 3 (exit 6.0, gold badge 6.4)
place(seg(TRANS,0.7,1.5),6.02,1,'scene 2->3 swell')
place(pitch(POP,-3),6.22,-14,'EXCLUSIVE OFFERS label')
place(impact(0.7),6.46,-12,'gold offer impact')
place(NOTIF2,6.50-A_N2,-11,'gold offer chime')
place(pitch(POP,2),6.98,-10,'teal offer pop')
place(pitch(NOTIF2,4),7.0-A_N2,-13,'teal offer chime')
# SCENE 3 -> 4 (exit 8.3, BOOK NOW 8.5, WhatsApp button 8.9)
place(seg(TRANS,0.45,1.5),8.28,1,'scene 3->4 transition swell')
place(impact(),8.52,-9,'BOOK NOW impact')
place(NOTIF,8.98-A_NOTIF,-9,'WhatsApp button ding')
place(pitch(POP,0),9.30,-13,'office card pop')
place(pitch(POP,2),9.52,-13,'36 states card pop')
place(pitch(POP,4),9.72,-13,'website pop')
place(pitch(POP,6),9.92,-13,'trust strip pop')

# master: soft limiter
mix=np.tanh(mix*1.1)/np.tanh(1.1)
out=(mix*32767).astype(np.int16)
import wave
w=wave.open('/tmp/claude-0/-home-user-Nusuk/2d110232-cc8a-55c2-b443-0f88f5d1ccba/scratchpad/sfx.wav','wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(out.tobytes()); w.close()
for t,l in sorted(log): print(f'{t:5.2f}  {l}')
print('peak',np.abs(mix).max())
