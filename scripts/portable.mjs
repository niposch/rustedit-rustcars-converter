import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

// Inline Vite's static bundle and local font files for file:// use, without a server.
const root=resolve('dist');
let html=await readFile(resolve(root,'index.html'),'utf8');
const script=html.match(/<script[^>]+src="([^"]+)"[^>]*><\/script>/);
const stylesheet=html.match(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"[^>]*>/);
if(!script||!stylesheet)throw new Error('Expected one Vite script and stylesheet.');
const js=await readFile(resolve(root,script[1]),'utf8');
const cssPath=resolve(root,stylesheet[1]);
let css=await readFile(cssPath,'utf8');
const assets=[...css.matchAll(/url\(([^)]+)\)/g)];
for(const match of assets){
  const url=match[1].replace(/^['"]|['"]$/g,'');
  if(/^(data:|https?:)/.test(url))continue;
  const bytes=await readFile(resolve(dirname(cssPath),url));
  const mime=url.endsWith('.woff2')?'font/woff2':'application/octet-stream';
  css=css.replaceAll(match[0],`url(data:${mime};base64,${bytes.toString('base64')})`);
}
html=html.replace(script[0],()=>`<script type="module">${js.replaceAll('</script','<\\/script')}</script>`);
html=html.replace(stylesheet[0],()=>`<style>${css}</style>`);
const notices = (await readFile('LICENSE', 'utf8')) + '\n\n' + (await readFile('THIRD_PARTY_NOTICES.txt', 'utf8'));
html=html.replace('</body>',()=>`<script type="text/plain" id="license-notices">${notices.replaceAll('</script','<\\/script')}</script></body>`);
await writeFile(resolve(root,'workshop.html'),html);
await copyFile('LICENSE',resolve(root,'LICENSE.txt'));
await copyFile('THIRD_PARTY_NOTICES.txt',resolve(root,'THIRD_PARTY_NOTICES.txt'));
console.log(`Portable offline page: dist/workshop.html (${(Buffer.byteLength(html)/1024).toFixed(0)} KB)`);
