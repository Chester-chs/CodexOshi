// Original freely distributable geometric placeholder; no character artwork.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const width=96,height=96,pixels=Buffer.alloc(width*height*4);
function dot(x,y,color){if(x>=0&&x<width&&y>=0&&y<height)pixels.set(color,(y*width+x)*4);}
function ellipse(cx,cy,rx,ry,color){for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(((x-cx)/rx)**2+((y-cy)/ry)**2<=1)dot(x,y,color);}
ellipse(48,68,20,20,[62,113,139,255]);ellipse(48,35,28,26,[105,161,187,255]);ellipse(38,33,3,4,[25,52,79,255]);ellipse(58,33,3,4,[25,52,79,255]);
for(let x=39;x<=57;x++){const y=Math.round(44+3*(1-((x-48)/9)**2));dot(x,y,[25,52,79,255]);dot(x,y+1,[25,52,79,255]);}
function crc(buffer){let c=0xffffffff;for(const b of buffer){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function chunk(type,data){const header=Buffer.alloc(4);header.writeUInt32BE(data.length);const body=Buffer.concat([Buffer.from(type),data]),checksum=Buffer.alloc(4);checksum.writeUInt32BE(crc(body));return Buffer.concat([header,body,checksum]);}
const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
const scan=Buffer.alloc(height*(width*4+1));for(let y=0;y<height;y++)pixels.copy(scan,y*(width*4+1)+1,y*width*4,(y+1)*width*4);
const target=path.resolve(__dirname,'../assets/placeholder-ready.png');fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(scan)),chunk('IEND',Buffer.alloc(0))]));
