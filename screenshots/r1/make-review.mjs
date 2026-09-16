import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const {default: sharp} = await import(pathToFileURL(require.resolve('sharp', {paths: [path.dirname(require.resolve('next/package.json'))]})).href);
async function run() {
  const dir = __dirname;
  const out = path.join(dir, 'review');
  await fs.mkdir(out, {recursive: true});
  const pages = ['login','home','ideias','nova-ideia','detalhe','detalhe-edicao','perfil','agenda','memorias','kitchen-sink','select-aberto'];
  const manifest = [];
  for(const page of pages) {
    for(const family of ['mobile','desktop']) {
      const keys = family === 'mobile' ? ['320-light','320-dark','390-light','390-dark'] : ['1280-light','1280-dark'];
      const width = family === 'mobile' ? 320 : 640;
      const files = await Promise.all(keys.map(async key => {
        const file = page+'-'+key+'.png';
        const buffer = await sharp(path.join(dir,file)).resize({width}).png().toBuffer();
        return {file,buffer,meta:await sharp(buffer).metadata()};
      }));
      const height = Math.max(...files.map(x=>x.meta.height));
      for(let top = 0; top < height; top += 1000) {
        const rows = [];
        for(let i=0; i<files.length; i++) {
          const item = files[i];
          const label = Buffer.from('<svg width="'+width+'" height="30"><rect width="100%" height="100%" fill="#dce4e8"/><text x="6" y="20" font-size="13" font-family="Arial">'+item.file+' / y'+top+'</text></svg>');
          rows.push({input:label,top:0,left:i*width});
          if(top<item.meta.height) rows.push({input:await sharp(item.buffer).extract({left:0,top,width,height:Math.min(1000,item.meta.height-top)}).png().toBuffer(),top:30,left:i*width});
        }
        const output = page+'-'+family+'-'+(top/1000+1)+'.png';
        await sharp({create:{width:width*files.length,height:1030,channels:3,background:'#dce4e8'}}).composite(rows).png().toFile(path.join(out,output));
        manifest.push({output,sources:files.map(x=>x.file),top});
      }
    }
  }
  await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));
  console.log(JSON.stringify(manifest.map(x=>x.output)));
}
run().catch(e=>{console.error(e);process.exit(1)});

