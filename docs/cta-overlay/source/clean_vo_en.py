import numpy as np, soundfile as sf
from scipy import signal
import noisereduce as nr
x,sr=sf.read('vo_en/raw.wav'); x=x.astype(np.float64)
# 1) high-pass rumble
sos=signal.butter(4,75,'hp',fs=sr,output='sos'); x=signal.sosfiltfilt(sos,x)
# 2) noise profile from the silent gaps between phrases
gaps=[(0.05,0.85),(11.6,12.1),(15.85,16.3),(28.1,28.55),(35.3,35.85),(39.1,40.05),(49.8,50.25)]
N=np.concatenate([x[int((a+.10)*sr):int((b-.04)*sr)] for a,b in gaps])
y=nr.reduce_noise(y=x,sr=sr,y_noise=N,stationary=True,prop_decrease=0.92,n_fft=2048,freq_mask_smooth_hz=300,time_mask_smooth_ms=60)
# 3) late-reverb (echo) suppression: spectral subtraction with an exponential-decay model
nfft,hop=2048,256
f,t,Z=signal.stft(y,sr,nperseg=nfft,noverlap=nfft-hop)
P=np.abs(Z)**2
T60=0.45; delta=3*np.log(10)/T60
d=int(round(0.050*sr/hop))               # late reverb starts ~50 ms after direct sound
dec=np.exp(-2*delta*(d*hop/sr))
late=np.zeros_like(P); late[:,d:]=dec*P[:,:-d]
# smooth the estimate over time so it models a diffuse tail
late=signal.lfilter([1],[1,-0.6],late,axis=1)*0.4
G=np.maximum(1-1.6*late/(P+1e-12),0.18)
# smooth gains (limit musical noise)
from scipy.ndimage import uniform_filter
G=uniform_filter(G,size=(3,3))
Z2=Z*G
_,y2=signal.istft(Z2,sr,nperseg=nfft,noverlap=nfft-hop); y2=y2[:len(x)]
# 4) gentle downward expander so gaps/tails fall to silence between phrases
w=int(0.010*sr); env=np.sqrt(np.convolve(y2**2,np.ones(w)/w,'same'))
db=20*np.log10(env+1e-9); thr=-47; rng=22
gain_db=np.clip((db-thr)*2.0,-rng,0)       # ratio ~3:1 below threshold
g=10**(gain_db/20)
# smooth: fast attack, slower release
a_att,a_rel=np.exp(-1/(0.004*sr)),np.exp(-1/(0.12*sr)); gs=np.empty_like(g); c=1.0
look=int(0.012*sr); gl=np.r_[g[look:],np.ones(look)]  # 12 ms look-ahead so word onsets are not clipped
for i,v in enumerate(gl):
    c = v+(c-v)*(a_att if v>c else a_rel); gs[i]=c
y3=y2*gs
sf.write('vo_en/stage1.wav',y3.astype(np.float32),sr)
def rms(a): return 20*np.log10(np.sqrt(np.mean(a**2))+1e-12)
Ng=lambda s: np.concatenate([s[int((a+.10)*sr):int((b-.04)*sr)] for a,b in gaps])
print('gap noise dB: raw %.1f -> clean %.1f'%(rms(Ng(x)),rms(Ng(y3))))
sp=[(1.0,3.7),(6.1,11.5),(28.9,35.1)]
Sg=lambda s: np.concatenate([s[int(a*sr):int(b*sr)] for a,b in sp])
print('speech dB: raw %.1f -> clean %.1f'%(rms(Sg(x)),rms(Sg(y3))))
