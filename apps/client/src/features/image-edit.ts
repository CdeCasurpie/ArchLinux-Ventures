export type Point={x:number;y:number};
export type Crop={x:number;y:number;width:number;height:number};
export type Stroke={points:Point[];color:string;width:number};
export function imagePoint(client:Point,rect:{left:number;top:number;width:number;height:number},size:{width:number;height:number}):Point{
 return {x:Math.max(0,Math.min(size.width,(client.x-rect.left)*size.width/rect.width)),y:Math.max(0,Math.min(size.height,(client.y-rect.top)*size.height/rect.height))};
}
export function cropBetween(a:Point,b:Point,size:{width:number;height:number}):Crop{
 const x=Math.max(0,Math.floor(Math.min(a.x,b.x))),y=Math.max(0,Math.floor(Math.min(a.y,b.y)));
 return {x,y,width:Math.min(size.width-x,Math.ceil(Math.abs(a.x-b.x))),height:Math.min(size.height-y,Math.ceil(Math.abs(a.y-b.y)))};
}
export function paintPhoto(canvas:HTMLCanvasElement,image:HTMLImageElement,strokes:Stroke[],crop?:Crop|null){
 const context=canvas.getContext('2d');if(!context)throw new Error('No se pudo abrir el editor de imágenes.');
 canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
 context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0);
 for(const stroke of strokes){
  if(!stroke.points.length)continue;
  context.strokeStyle=stroke.color;context.fillStyle=stroke.color;context.lineWidth=stroke.width;context.lineCap='round';context.lineJoin='round';
  context.beginPath();context.moveTo(stroke.points[0].x,stroke.points[0].y);
  if(stroke.points.length===1){context.arc(stroke.points[0].x,stroke.points[0].y,stroke.width/2,0,Math.PI*2);context.fill()}
  else{for(const point of stroke.points.slice(1))context.lineTo(point.x,point.y);context.stroke()}
 }
 if(crop&&crop.width>=16&&crop.height>=16){
  const result=document.createElement('canvas');result.width=crop.width;result.height=crop.height;
  result.getContext('2d')!.drawImage(canvas,crop.x,crop.y,crop.width,crop.height,0,0,crop.width,crop.height);
  return result;
 }
 return canvas;
}
