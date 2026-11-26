const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1080,height:1920}});
 await p.goto('file://'+process.argv[2]+'/cta3.html'); await p.evaluate(()=>document.fonts.ready);
 const N=Math.round((await p.evaluate(()=>TL.dur))*30);
 for(let i=0;i<N;i++){ await p.evaluate(t=>render(t),i/30); await p.screenshot({path:`frames/f${String(i).padStart(4,'0')}.png`,omitBackground:true}); }
 await b.close();
})();
