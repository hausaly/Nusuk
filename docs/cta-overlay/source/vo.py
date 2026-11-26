import soundfile as sf, numpy as np
from kokoro_onnx import Kokoro
k=Kokoro('tts/kokoro-v1.0.onnx','tts/voices-v1.0.bin')
V='am_michael'
lines={
 'a1':"Your Umrah journey starts here.",
 'a2':"Fourteen days. Ten in Makkah, and four in Madinah.",
 'b1':"Fly from Kano, Abuja, or Lagos, to Saudi Arabia.",
 'i1':"Includes a multiple entry visa,",
 'i2':"hotel in Makkah,",
 'i3':"hotel in Madinah,",
 'i4':"transport,",
 'i5':"and Ziyarah tours.",
 'c1':"Free visa reactivation!",
 'c2':"And you can pay small small.",
 'd1':"Book now on WhatsApp. Zero eight one three, one two two, seven zero four seven.",
 'd2':"We cover all thirty six states, nationwide.",
 'd3':"Hausaly dot com.",
}
for n,t in lines.items():
    a,sr=k.create(t,voice=V,speed=1.1,lang='en-us')
    # trim leading/trailing silence
    m=np.abs(a)>0.01; i=np.argmax(m); j=len(a)-np.argmax(m[::-1])
    a=a[max(0,i-int(.02*sr)):j+int(.05*sr)]
    sf.write(f'tts/{n}.wav',a,sr); print(n,round(len(a)/sr,2),sr)
