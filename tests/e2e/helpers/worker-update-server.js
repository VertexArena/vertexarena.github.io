import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname,resolve,sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Browser update requests bypass Playwright routing. Serve the actual app on
// an isolated HTTP port and deploy a byte-different worker through real HTTP.
export async function workerUpdateServer() {
  const root=fileURLToPath(new URL('../../../',import.meta.url));
  let updated=false;
  const server=createServer(async(request,response)=>{
    const path=new URL(request.url,'http://localhost').pathname;
    const target=resolve(root,path==='/'?'index.html':decodeURIComponent(path).replace(/^\//,''));
    if(!target.startsWith(root.endsWith(sep)?root:root+sep)){response.writeHead(403).end();return;}
    try{
      let body=await readFile(target);
      if(path==='/service-worker.js'&&updated)body=Buffer.from(body.toString().replace('vertex-static-m20-v1','vertex-static-m20-test-update'));
      const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json'};
      response.writeHead(200,{'content-type':types[extname(target)]||'application/octet-stream','cache-control':'no-store'}).end(body);
    }catch{response.writeHead(404,{'content-type':'text/html'}).end(await readFile(resolve(root,'404.html')));}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {origin:`http://127.0.0.1:${server.address().port}`,deploy(){updated=true;},async close(){await new Promise(resolve=>server.close(resolve));}};
}
