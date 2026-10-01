// Lossless brand-source conversion to the exact manifest dimensions. The
// maskable variant keeps the complete logo within the platform safe circle.
import { chromium } from 'playwright';
import { readFileSync,writeFileSync } from 'node:fs';
const browser=await chromium.launch();
const page=await browser.newPage();
const source=`data:image/png;base64,${readFileSync('assets/logo.png').toString('base64')}`;
for(const [size,maskable] of [[192,false],[512,false],[512,true]]){
  const data=await page.evaluate(async({source,size,maskable})=>{
    const image=new Image();image.src=source;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
    const context=canvas.getContext('2d');context.fillStyle='#F8FAFC';context.fillRect(0,0,size,size);
    const inset=size*(maskable?.22:.08);context.drawImage(image,inset,inset,size-inset*2,size-inset*2);
    return canvas.toDataURL('image/png').split(',')[1];
  },{source,size,maskable});
  writeFileSync(`assets/icon-${maskable?'maskable-':''}${size}.png`,Buffer.from(data,'base64'));
}
await browser.close();
