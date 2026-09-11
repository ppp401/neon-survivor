// icon.js — SV.Icons: Canvas 运行时生成 PNG 图标 dataURL(免去静态 PNG 资源)。
// 与 icon.svg 同构:中央全能者被四个带柔和辉光的巨大几何敌人包围。
(function () {
  "use strict";
  const SV = window.SV = window.SV || {};

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();
  }

  function polygon(ctx, points) {
    ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);
    for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);
    ctx.closePath();
  }

  // 几何敌人使用与游戏一致的同色柔和光晕，不添加高光或表情。
  function monster(ctx, x, y, r, shape, color, angle) {
    ctx.save();ctx.translate(x,y);ctx.rotate(angle||0);
    ctx.fillStyle=color;
    if(shape==="circle"){
      ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);
    }else if(shape==="triangle"){
      polygon(ctx,[[r,0],[-r*.64,r*.88],[-r*.64,-r*.88]]);
    }else if(shape==="square"){
      roundRect(ctx,-r,-r,r*2,r*2,r*.16);
    }else{
      polygon(ctx,[[r,0],[r*.5,r*.866],[-r*.5,r*.866],[-r,0],[-r*.5,-r*.866],[r*.5,-r*.866]]);
    }
    ctx.shadowColor=color;ctx.shadowBlur=r*.62;ctx.fill();ctx.fill();ctx.shadowBlur=0;
    ctx.restore();
  }

  function drawIcon(size) {
    size=Math.max(64,Math.floor(size||192));
    const cv=document.createElement("canvas");cv.width=size;cv.height=size;
    const ctx=cv.getContext("2d");if(!ctx)return "";
    const s=size/512;

    const bg=ctx.createRadialGradient(282*s,287*s,0,282*s,287*s,390*s);
    bg.addColorStop(0,"#171d44");bg.addColorStop(.62,"#0b0e22");bg.addColorStop(1,"#03050b");
    ctx.fillStyle=bg;roundRect(ctx,0,0,size,size,104*s);ctx.fill();

    ctx.save();roundRect(ctx,0,0,size,size,104*s);ctx.clip();
    monster(ctx,304*s,8*s,105*s,"hex","#5ad1ff",96*Math.PI/180);
    monster(ctx,6*s,200*s,103*s,"circle","#7dd87a",7*Math.PI/180);
    monster(ctx,522*s,287*s,121*s,"triangle","#ef3e61",187*Math.PI/180);
    monster(ctx,174*s,528*s,87*s,"square","#9148dc",-39*Math.PI/180);
    ctx.restore();

    // 全能者贴图:circle + 白色 core + facing，仅玩家保留辉光。
    const px=269*s,py=287*s;
    ctx.save();ctx.shadowColor="#79edff";ctx.shadowBlur=21*s;ctx.fillStyle="#b8c6ff";ctx.strokeStyle="#fff";ctx.lineWidth=9*s;
    ctx.beginPath();ctx.arc(px,py,75*s,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.shadowBlur=0;
    ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(px,py,34*s,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#dce5ff";ctx.beginPath();ctx.arc(px,py,13*s,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle="#fff";ctx.lineWidth=10*s;ctx.lineCap="round";ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(336*s,340*s);ctx.stroke();ctx.restore();

    try{return cv.toDataURL("image/png");}catch(e){return "";}
  }

  SV.Icons={
    draw:drawIcon,
    apply:function(){
      try{
        const touch=document.querySelector('link[rel="apple-touch-icon"]');
        if(touch){const d=drawIcon(180);if(d)touch.href=d;}
        const fav=document.querySelector('link[rel="icon"]');
        if(fav&&fav.getAttribute("type")!=="image/svg+xml"){const d2=drawIcon(192);if(d2)fav.href=d2;}
      }catch(e){/* 图标生成失败不应阻断游戏 */}
    }
  };
})();
