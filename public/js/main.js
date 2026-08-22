
(function(){
"use strict";

/* ---------------- видео: файл или поток ----------------
   Ролики из Cloudflare Stream приходят адресом на …/manifest/video.m3u8.
   Это не файл, а список кусков: плеер берёт ту версию, которую тянет канал,
   и начинает играть сразу, не скачивая всё целиком.

   Safari понимает такие адреса сам. Остальным нужен маленький плеер hls.js —
   и грузим мы его только тогда, когда первый поток действительно понадобился,
   чтобы обычные посетители за него не платили.

   Старые ролики из хранилища (обычные .mp4) работают как работали. */
var hlsLib = null;
function loadHls(){
  if(hlsLib) return hlsLib;
  hlsLib = new Promise(function(res, rej){
    var s = document.createElement("script");
    s.src = "js/hls.min.js?v=1";
    s.onload = function(){ res(window.Hls); };
    s.onerror = function(){ hlsLib = null; rej(new Error("hls.js не загрузился")); };
    document.head.appendChild(s);
  });
  return hlsLib;
}
function isStream(url){ return /\.m3u8(\?|$)/i.test(url || ""); }

function setVideoSrc(el, url){
  if(!el || !url) return;
  if(el.__hls){ try{ el.__hls.destroy(); }catch(e){} el.__hls = null; }
  if(!isStream(url)){ el.src = url; return; }
  loadHls().then(function(Hls){
    /* ГРАБЛИ. Раньше здесь первым делом спрашивали браузер: «умеешь играть
       поток сам?» — и если умеет, отдавали ему. Задумка была про айфоны:
       у них встроенный проигрыватель лучше нашего. Но Chrome на этот вопрос
       тоже отвечает «умею», забирает поток себе и играет с самой мутной
       дорожки — 426×240 в окне на тысячу с лишним пикселей. Наши настройки
       при этом не применялись вовсе: плеер попросту не создавался.
       Теперь порядок обратный: играем своим плеером везде, где он работает,
       потому что только его мы можем настроить. Встроенный остаётся
       запасным — для iPhone, где нашего нет. */
    if(!Hls || !Hls.isSupported()){ el.src = url; return; }
    var h = new Hls({
      maxBufferLength: 12,          /* не набираем лишнего впрок */

      /* Видео в потоке нарезано на несколько дорожек разного качества.
         По умолчанию плеер считает, что канал у зрителя медленный —
         полмегабита — и начинает с самой мутной, а потом медленно
         поднимается, замеряя скорость на каждом куске. Отсюда «первые
         двадцать секунд каша». Портфолио так показывать нельзя.
         Говорим сразу: канал быстрый, начинай с хорошего. Если окажется,
         что не тянет, плеер сам опустится — но уже вниз от хорошего,
         а не вверх от плохого. */
      abrEwmaDefaultEstimate: 10000000,
      abrBandWidthUpFactor: 0.9,    /* смелее поднимать качество (по умолчанию 0.7) */
      startFragPrefetch: true       /* первый кусок — не дожидаясь готовности плеера */
    });

    /* Стартовое качество выбираем сами, а не отдаём на откуп замерам.
       Смотрим высоту окошка на экране (с поправкой на ретину) и берём
       первую дорожку, которая в него влезает: в маленьком превью 4K не нужен,
       он там всё равно не виден, а трафик сожрёт. Если размер ещё неизвестен —
       берём максимум: лишний трафик лучше, чем мыло в кейсе.
       Дальше отпускаем автоматику: просядет канал — плеер опустится сам. */
    h.on(Hls.Events.MANIFEST_PARSED, function(){
      var L = h.levels || [];
      if(!L.length) return;
      var need = (el.clientHeight || 0) * Math.min(window.devicePixelRatio || 1, 2);
      var pick = L.length - 1;
      if(need > 0){
        for(var i = 0; i < L.length; i++){
          if((L[i].height || 0) >= need){ pick = i; break; }
        }
      }
      h.startLevel   = pick;
      h.nextAutoLevel = pick;
    });

    h.loadSource(url);
    h.attachMedia(el);
    el.__hls = h;
  }).catch(function(){ el.src = url; });   /* не вышло — пусть браузер пробует сам */
}

/* ---------------- site data (written by the admin panel) ---------------- */
var SITE = (function(){
  try{ return JSON.parse(document.getElementById("SITE_DATA").textContent); }
  catch(e){ return null; }
})() || {};

/* ---------------- project data ---------------- */
var DEFAULT_IMGS = {
  p1:"media/de4aa3e2eb.jpg",
  p2:"media/3b7ce02f04.jpg",
  p3:"media/0cdeba4f6c.jpg",
  p4:"media/47f2536f39.jpg",
  p5:"media/f738827f98.jpg",
  p6:"media/d2331a6ad4.jpg",
  p7:"media/615be1295e.jpg"
};

/* projects come from SITE.projects (managed in the admin panel) */
var IMGS = {};
var PROJECTS = (function(){
  var src = (SITE.projects && SITE.projects.length) ? SITE.projects : [
    {title:"SIGNAL",       year:"2026", client:"PERSONAL"},
    {title:"AFTERLIGHT",   year:"2025", client:"COMMERCIAL"},
    {title:"RED SHIFT",    year:"2025", client:"PERSONAL"},
    {title:"COLD FRONT",   year:"2024", client:"CLIENT"},
    {title:"MONOCHROME",   year:"2025", client:"PERSONAL"},
    {title:"STATIC BLOOM", year:"2026", client:"EXPERIMENT"},
    {title:"GRAIN CITY",   year:"2024", client:"PERSONAL"}
  ];
  /* scatter/grid geometry is generated so any number of projects works */
  var out = [];
  for(var i=0;i<src.length;i++){
    var s = src[i], id = "p"+(i+1);
    IMGS[id] = s.cover || DEFAULT_IMGS["p"+((i%7)+1)];
    var col = i % 3, row = Math.floor(i/3);
    out.push({
      id:id,
      index:i,
      /* Значок на столе — отдельная картинка. Обложка в превью широкая, а значок
         маленький квадрат, и это редко одно и то же. Если свой не задан —
         берём обложку, как было раньше. */
      icon: s.deskIcon || s.cover || DEFAULT_IMGS["p"+((i%7)+1)],
      video: !!(s.coverVideo || s.video),
      videoSrc: s.coverVideo || s.video || "",
      title: (s.title||"UNTITLED").toUpperCase(),
      fullTitle: s.fullTitle || "",   /* полное имя — как написано, без верхнего регистра */
      year:  s.year  || "",
      client:(s.client||"").toUpperCase(),
      desc:  s.desc || "",
      sx: 6 + (i*23)%70, sy: 8 + (i*29)%74, sw: 22 + (i%3)*4,
      d: 0.55 + ((i*37)%100)/100,
      gx: 2 + col*33, gy: 6 + row*46, gw: 30
    });
  }
  return out;
})();

var VIDEO_SRC = "media/51ecacbcc9.mp4";
var FRAMES = ["media/dbb8617632.webp", "media/754beeb4ab.webp", "media/2670a6ed74.webp", "media/dfc9a46e72.webp", "media/088359f4f4.webp", "media/e7a211a085.webp", "media/e0b8c93b42.webp", "media/32af77be01.webp", "media/6470097ff2.webp", "media/2eefe5ee79.webp", "media/bb32233f97.webp", "media/6b7b05ffd3.webp", "media/46b9df02e8.webp", "media/568cc25870.webp", "media/13325507cc.webp", "media/da20d73dd5.webp", "media/1843ae8953.webp", "media/cc1941908a.webp", "media/20327d88c5.webp", "media/d54fdac6fc.webp", "media/dca22b3737.webp", "media/f09f549e45.webp", "media/f3cd615650.webp", "media/7a4c620ee1.webp", "media/804d2f882b.webp", "media/5452948f85.webp", "media/944c197fc7.webp", "media/76150bb93d.webp", "media/5fe855106f.webp", "media/4db8399a43.webp", "media/1b23a06b25.webp", "media/7f343c9a50.webp", "media/c49d3290db.webp", "media/41c00ff58b.webp", "media/7389e82460.webp", "media/cdfa6778ad.webp", "media/f0b0892ab4.webp", "media/0b374e0131.webp", "media/9010570fce.webp", "media/e7ddab684a.webp", "media/2382aafdab.webp", "media/2bc930822b.webp", "media/644347d0aa.webp", "media/f9ad5e2429.webp", "media/9aac51d6d9.webp", "media/1bb2fe4a10.webp", "media/8c3f6cb94c.webp", "media/bdfe6c3384.webp", "media/ee52f06596.webp", "media/4af3a78bcd.webp", "media/818e17d7af.webp", "media/0f6a61fa60.webp", "media/f6447b739d.webp", "media/1491b0db08.webp", "media/7bd958d013.webp", "media/cfd8089961.webp", "media/9d225255ac.webp", "media/95421ca05f.webp", "media/b1b859957a.webp", "media/799d71bfc1.webp", "media/3c4c5f0e65.webp", "media/dfa39b2b01.webp"];

var scene = document.getElementById("scene");
var heroLayer = document.getElementById("heroLayer");
var heroCan = document.getElementById("heroCan");
var nav = document.getElementById("nav");
var foot = document.getElementById("foot");
var hint = document.getElementById("hint");
var dith = document.getElementById("dith");

var reduced = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false;

/* build boxes */
var boxes = [];
PROJECTS.forEach(function(p,i){
  var b = document.createElement("div");
  b.className = "box";
  var media;
  if(p.video){
    media = document.createElement("video");
    media.muted = true; media.loop = true; media.playsInline = true;
    media.setAttribute("playsinline","");
    /* Эти «летающие плитки» остались от ранней версии: ниже по коду
       scene.style.display = "none" прячет их насовсем. Но браузеру всё равно —
       он видел src и честно качал КАЖДЫЙ ролик кейса целиком, при каждом
       заходе, впустую. Отсюда и «сайт грузится вечно».
       preload="none" — ни байта, пока кто-нибудь не нажмёт play. */
    media.preload = "none";
    media.setAttribute("preload", "none");
    /* Здесь НЕ setVideoSrc: это те самые невидимые плитки, спрятанные
       через scene.style.display = "none". Потоковый плеер игнорирует
       preload="none" и начал бы качать видео в никуда — ровно то, от чего
       мы избавились раньше. Кладём адрес как есть: с preload="none"
       браузер не тронет его, пока никто не нажмёт play. */
    media.src = p.videoSrc || VIDEO_SRC;
  } else {
    media = document.createElement("img");
    media.src = IMGS[p.id];
    media.alt = p.title;
  }
  var frame = document.createElement("div");
  frame.className = "frame";
  frame.appendChild(media);
  var meta = document.createElement("div");
  meta.className = "meta";
  meta.innerHTML = '<div class="t">'+p.title+'</div><div class="yr">'+p.year+'<br>'+p.client+'</div>';
  b.appendChild(frame); b.appendChild(meta);
  scene.appendChild(b);
  frame.addEventListener("click", function(){ openCase(p); });
  boxes.push({el:b, media:media, frame:frame, p:p, phase: Math.random()*6.28, spd: .3 + Math.random()*.4, tex:null});
});

/* ---------------- typographic wall (recipe from the reference build) ----------------
   .a-word per line, letters split into <i>, animated: yPercent 50 → 0, opacity 0 → 1,
   rotateX -90 → 0, stagger .05, duration .6, power2.out. When a word finishes it gets
   .done and its data-text (the script line) un-blurs on top of it. */
var WALL = (SITE.words && SITE.words.length) ? SITE.words : [
  {word:"CREATING",      script:"AI Visuals"},
  {word:"UNFORGETTABLE", script:"Cinematics"},
  {word:"DIGITAL",       script:"Concept Art"},
  {word:"EXPERIENCES",   script:"Art Direction"}
];
var CODA_TEXT = SITE.coda || "WHERE ART MEETS TECHNOLOGY";

var typeSec  = document.getElementById("typeSec");
var typeWall = document.getElementById("typeWall");
var typeGrain= document.getElementById("typeGrain");

var wallRows = [];
(function(){
  for(var i=0;i<WALL.length;i++){
    var row = document.createElement("div");
    row.className = "a-word";
    row.setAttribute("data-text", WALL[i].script);
    var letters = [], txt = WALL[i].word;
    for(var c=0;c<txt.length;c++){
      var s = document.createElement("i");
      s.textContent = txt[c] === " " ? "\u00A0" : txt[c];
      row.appendChild(s); letters.push(s);
    }
    typeWall.appendChild(row);
    wallRows.push({el:row, letters:letters, done:false});
  }
})();

/* ---- coda: chrome type with chromatic aberration + reflection ---- */


function fitTypeLines(){ /* headline size is pure vw; the coda canvas self-fits */ }
window.addEventListener("resize", fitTypeLines);
fitTypeLines();

/* power2.out */
function easeOut2(x){ return 1 - (1-x)*(1-x); }

/* ---------------- horizontal desktop ---------------- */
var DOCK = [
  {k:"ae",        t:"After Effects", run:true},
  {k:"ps",        t:"Photoshop",     run:true},
  {k:"figma",     t:"Figma"},
  {k:"blender",   t:"Blender",       run:true},
  {k:"sep"},
  {k:"higgsfield",t:"Higgsfield",    run:true},
  {k:"claude",    t:"Claude",        run:true},
  {k:"sep"},
  {k:"folder",    t:"Works"},
  {k:"trash",     t:"Trash"}
];
var ICON_SRC = {"ae": "media/949afd70cc.png", "ps": "media/c9c4f31e7f.png", "figma": "media/f17aedd07a.png", "blender": "media/ec28f80870.png", "claude": "media/a573431179.png", "higgsfield": "media/df79371ee4.png", "folder": "media/74bf825f5e.png", "trash": "media/58c3b4a976.png"};

var deskSec  = document.getElementById("deskSec");
var deskWall = document.getElementById("deskWall");
var deskPane = document.getElementById("deskPane");
var dockEl   = document.getElementById("dock");

/* works scattered across the wide desktop, like files on a screen */
/* ---- раскладка рабочего стола ----
   Берётся из блока DESK_LAYOUT, если он есть; иначе строится колонка по умолчанию.
   Формат: {iconSize, icons:[{type:'work'|'folder', ref, x, y, label, items:[...]}],
            dock:{scale, items:[{k,t,src}]}} */
var LAYOUT = (function(){
  var el = document.getElementById("DESK_LAYOUT");
  if(el){ try{ var o = JSON.parse(el.textContent); if(o && o.icons) return o; }catch(e){} }
  var ic = [];
  for(var i=0;i<PROJECTS.length;i++)
    ic.push({type:"work", ref:i, x:2.2, y:13.5 + i*11.8, label:PROJECTS[i].title});
  return {iconSize:76, icons:ic, dock:{scale:1, items:null}};
})();

var ICON_PX = LAYOUT.iconSize || 76;
var EDGE = (LAYOUT.edge != null ? LAYOUT.edge : 26);   /* отступ прижатых колонок от края */

/* ---- вид подписей под значками (настраивается в админке) ---- */
var CAP = LAYOUT.cap || {};
(function(){
  function num(v, d){ return (v == null || isNaN(v)) ? d : +v; }
  var color   = CAP.color || "#ffffff";
  var size    = num(CAP.size, 10.5);
  var weight  = num(CAP.weight, 600);
  var track   = num(CAP.track, 5.5) / 100;
  var bgOn    = CAP.bg !== false;
  var bgColor = CAP.bgColor || "#0c0c0e";
  var bgOp    = num(CAP.bgOpacity, 52) / 100;
  var shOn    = CAP.shadow !== false;
  var shPow   = num(CAP.shadowPower, 70) / 100;
  var blurOn  = CAP.blur !== false;

  function hexToRgb(hx){
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hx || "");
    return m ? [parseInt(m[1],16), parseInt(m[2],16), parseInt(m[3],16)] : [12,12,14];
  }
  var c = hexToRgb(bgColor);

  var css = "#deskPane .dicon .cap{" +
    "color:" + color + ";" +
    "font-size:" + size + "px;" +
    "font-weight:" + weight + ";" +
    "letter-spacing:" + track.toFixed(3) + "em;" +
    "background:" + (bgOn ? "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + bgOp.toFixed(2) + ")" : "transparent") + ";" +
    (bgOn && blurOn ? "backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);" : "backdrop-filter:none;-webkit-backdrop-filter:none;") +
    "text-shadow:" + (shOn ? "0 1px 4px rgba(0,0,0," + shPow.toFixed(2) + ")" : "none") + ";" +
    "}";
  var st = document.createElement("style");
  st.id = "capStyle";
  st.textContent = css;
  document.head.appendChild(st);
})();

var TRACK_SRC = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='13' fill='%231d1f26'/%3E%3Crect x='.5' y='.5' width='63' height='63' rx='12.5' fill='none' stroke='rgba(255,255,255,.18)'/%3E%3Cpath d='M40 15v26.5a7.5 7.5 0 1 1-4-6.6V22l-14 3.2v20.3a7.5 7.5 0 1 1-4-6.6V21l22-6z' fill='%23fff'/%3E%3C/svg%3E";
var FOLDER_SRC = "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20200%20164%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22b%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%220%22%20y2%3D%221%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%2357a9f2%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%232f7fdd%22%2F%3E%3C%2FlinearGradient%3E%3ClinearGradient%20id%3D%22f%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%220%22%20y2%3D%221%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%2393cdff%22%2F%3E%3Cstop%20offset%3D%220.55%22%20stop-color%3D%22%2357a4f0%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%233d8ce4%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Cpath%20d%3D%22M10%2036a14%2014%200%200%201%2014-14h44a10%2010%200%200%201%207%203l17%2017h84a14%2014%200%200%201%2014%2014v78a14%2014%200%200%201-14%2014H24a14%2014%200%200%201-14-14z%22%20fill%3D%22url%28%23b%29%22%2F%3E%3Cpath%20d%3D%22M10%2062a14%2014%200%200%201%2014-14h152a14%2014%200%200%201%2014%2014v72a14%2014%200%200%201-14%2014H24a14%2014%200%200%201-14-14z%22%20fill%3D%22url%28%23f%29%22%2F%3E%3Cpath%20d%3D%22M10%2062a14%2014%200%200%201%2014-14h152a14%2014%200%200%201%2014%2014v6H10z%22%20fill%3D%22%23ffffff%22%20opacity%3D%22.22%22%2F%3E%3C%2Fsvg%3E";

(function(){
  for(var i=0;i<LAYOUT.icons.length;i++){
    var it = LAYOUT.icons[i];
    var d = document.createElement("div");
    d.className = "dicon";
    /* Значок центрируется внутри рамки, поэтому от x отнимаем половину лишней
       ширины — тогда x задаёт левый край самой картинки, а не край рамки. */
    var boxW = Math.round(ICON_PX * 1.37);
    var padX = Math.round((boxW - ICON_PX) / 2);
    /* snap — привязка к тому же отступу, что у логотипа и меню (26 px),
       чтобы колонка стояла ровно под ними на любом экране */
    if(it.snap === "left"){
      d.style.left = (EDGE - padX) + "px";
    } else if(it.snap === "right"){
      d.style.left = "auto";
      d.style.right = (EDGE - padX) + "px";
    } else {
      d.style.left = "calc(" + it.x + "% - " + padX + "px)";
    }
    d.style.top  = it.y + "%";
    d.style.width = boxW + "px";

    var img = document.createElement("img");
    img.className = "thumb";
    img.style.width = img.style.height = ICON_PX + "px";
    var cap = document.createElement("div");
    cap.className = "cap";

    if(it.type === "track"){
      img.src = it.cover || TRACK_SRC;
      img.alt = it.label || "Трек";
      cap.textContent = it.label || "Трек";
      d.classList.add("dtrack");
      (function(tr, node){
        node.addEventListener("click", function(){
          if(!tr.src) return;
          if(window.setSiteTrack) setSiteTrack(tr.src, tr.label || "");
          /* отмечаем играющий трек, как запущенное приложение в доке */
          var all = deskPane.querySelectorAll(".dtrack");
          for(var q=0;q<all.length;q++) all[q].classList.remove("playing");
          node.classList.add("playing");
        });
        node.addEventListener("mouseenter", function(){ if(window.hideQL) hideQL(); });
      })(it, d);
    } else if(it.type === "folder"){
      img.src = it.cover || FOLDER_SRC;
      img.alt = it.label || "Папка";
      cap.textContent = it.label || "Папка";
      (function(folder){
        d.addEventListener("click", function(){ openFolder(folder); });
        d.addEventListener("mouseenter", function(){ if(window.hideQL) hideQL(); });
      })(it);
    } else {
      var P = PROJECTS[(it.ref||0) % PROJECTS.length];
      /* Раньше здесь стояло: P.video ? IMGS["p1"] : IMGS[P.id] — и любой кейс
         с видео в превью получал на стол картинку ПЕРВОГО кейса. Значок всегда
         берём у своего проекта; своя картинка значка на этом месте — сильнее всего. */
      img.src = it.cover || P.icon;
      img.alt = P.title;
      cap.textContent = it.label || P.title;
      (function(proj){
        /* как было изначально: наведение — Quick Look, клик — страница кейса */
        d.addEventListener("click", function(){ openCase(proj); });
        d.addEventListener("mouseenter", function(){ if(window.showQL) showQL(proj); });
        d.addEventListener("mouseleave", function(){ if(window.hideQL) hideQL(); });
      })(P);
    }
    d.appendChild(img); d.appendChild(cap);
    deskPane.appendChild(d);
  }
})();

/* ---- окна приложений (genie из дока), Quick Look и сам док — оригинальная логика ---- */
(function(){
var APP_INFO = (SITE.apps && SITE.apps.length) ? SITE.apps : [
  {k:"ae", icon:"\uD83C\uDFAC", name:"After Effects", sub:"Motion Design & Visual Storytelling",
   text:"After Effects is where I shape movement, rhythm, and emotion. I use it to create cinematic sequences, title animations, commercials, UI motion, visual effects, and promotional content that communicate ideas with clarity and impact.",
   tags:["Visual Storytelling","Commercials","UI Animation","Compositing","Visual Effects"]},
  {k:"ps", icon:"\uD83C\uDFA8", name:"Photoshop", sub:"Concept Development & Art Direction",
   text:"Photoshop is my creative playground. It's where ideas take shape before becoming final visuals. From concept art and key visuals to cinematic compositions, photobashing, AI enhancement, and post-production, I use Photoshop to explore, refine, and direct visual ideas.",
   tags:["Art Direction","Concept Art","Key Visuals","Photobashing","Matte Painting","AI Enhancement","Post Production"]},
  {k:"figma", icon:"\uD83C\uDFAF", name:"Figma", sub:"Digital Experience & Product Thinking",
   text:"Great design isn't just about beautiful interfaces \u2014 it's about solving problems. I use Figma to design intuitive digital experiences, build design systems, prototype interactions, and create products that balance aesthetics with usability.",
   tags:["UX Strategy","UI Design","Product Thinking","Design Systems","Prototyping","User Experience"]},
  {k:"blender", icon:"\uD83E\uDDCA", name:"Blender", sub:"3D Visualization & Cinematic Production",
   text:"Blender allows me to transform concepts into believable worlds. I use it to build cinematic environments, advertising visuals, product presentations, and production-ready scenes through modeling, lighting, animation, texturing, and rendering.",
   tags:["Cinematic Production","Advertising","Environment Design","Product Visualization","Lighting","Animation","Rendering"]},
  {k:"higgsfield", icon:"\uD83D\uDE80", name:"Higgsfield", sub:"AI Filmmaking & Creative Direction",
   text:"AI has become an essential part of my creative workflow. I use Higgsfield to explore visual ideas, develop cinematic sequences, experiment with camera movement, and produce AI-generated videos while maintaining strong artistic direction and visual consistency. For me, AI isn't replacing creativity \u2014 it's expanding what's possible.",
   tags:["Creative Direction","AI Filmmaking","Prompt Engineering","Camera Language","Storytelling","Cinematic AI"]},
  {k:"claude", icon:"\u2728", name:"Claude", sub:"Ideas, Copy & Creative Sparring",
   text:"Claude is my thinking partner \u2014 for shaping concepts, writing copy, structuring cases and pushing ideas further before they turn into visuals.",
   tags:["Concepting","Copywriting","Research","Creative Sparring"]}
];

/* ---------------- app window: drawn on canvas, warped like the macOS genie ---------------- */
var appCan = document.getElementById("appCan");
var actx = appCan.getContext("2d");
var appTex = document.createElement("canvas");   /* the window, rendered once */
var atx = appTex.getContext("2d");
var appTimer = 0, appCurrent = null, appRaf = 0, appT0 = 0, appDir = 0, appMotion = null, appProg = 0;

var GENIE_DURATION = 620;
var SLIDE_END_FRACTION = 0.5;
var TRANSLATE_START_FRACTION = 0.4;
function clamp01(v){ return v<0?0:(v>1?1:v); }
function easeOutCubic(v){ return 1 - Math.pow(1-v,3); }
function easeInOutQuad(v){ return v<0.5 ? 2*v*v : 1 - Math.pow(-2*v+2,2)/2; }

/* ---- draw the window itself into an offscreen canvas ---- */
function roundRect(c,x,y,w,h,r){
  c.beginPath();
  c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r);
  c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath();
}
function wrapText(c, text, maxW){
  var words = String(text||"").split(/\s+/), lines = [], line = "";
  for(var i=0;i<words.length;i++){
    var test = line ? line+" "+words[i] : words[i];
    if(c.measureText(test).width > maxW && line){ lines.push(line); line = words[i]; }
    else line = test;
  }
  if(line) lines.push(line);
  return lines;
}
function renderAppTexture(info){
  var dpr = Math.min(window.devicePixelRatio||1, 2);
  var W = Math.min(560, window.innerWidth*0.8);
  var PAD = 20, BAR = 40;

  /* measure first so the height fits the copy */
  atx.font = "13.5px -apple-system, 'Segoe UI', Inter, sans-serif";
  var bodyLines = wrapText(atx, info.text, W - PAD*2);
  atx.font = "600 11px -apple-system, 'Segoe UI', Inter, sans-serif";
  var tags = info.tags || [], tagRows = [], row = [], rowW = 0;
  for(var i=0;i<tags.length;i++){
    var tw = atx.measureText(tags[i]).width + 18;
    if(rowW + tw > W - PAD*2 && row.length){ tagRows.push(row); row = []; rowW = 0; }
    row.push({t:tags[i], w:tw}); rowW += tw + 6;
  }
  if(row.length) tagRows.push(row);

  var H = BAR + 18 + 44 + 12 + bodyLines.length*22 + 16 + 14 + tagRows.length*26 + 16;

  appTex.width = Math.round(W*dpr); appTex.height = Math.round(H*dpr);
  atx.setTransform(dpr,0,0,dpr,0,0);
  atx.clearRect(0,0,W,H);

  /* body */
  roundRect(atx,0,0,W,H,16); atx.fillStyle="rgba(30,30,34,.95)"; atx.fill();
  atx.save(); roundRect(atx,0,0,W,H,16); atx.clip();

  /* title bar */
  var g = atx.createLinearGradient(0,0,0,BAR);
  g.addColorStop(0,"rgba(255,255,255,.14)"); g.addColorStop(1,"rgba(255,255,255,.04)");
  atx.fillStyle=g; atx.fillRect(0,0,W,BAR);
  atx.fillStyle="rgba(255,255,255,.16)"; atx.fillRect(0,BAR-0.5,W,0.5);
  var lights=["#ff5f57","#febc2e","#28c840"];
  for(var l=0;l<3;l++){ atx.beginPath(); atx.arc(18+l*19, BAR/2, 5.5, 0, 6.283); atx.fillStyle=lights[l]; atx.fill(); }
  atx.fillStyle="rgba(255,255,255,.85)"; atx.font="600 11.5px -apple-system,'Segoe UI',Inter,sans-serif";
  atx.textBaseline="middle"; atx.fillText(info.name, 82, BAR/2);

  /* header: icon + name + subtitle */
  var y = BAR + 18;
  var ic = appIcons[info.k];
  if(ic && ic.complete){ atx.save(); roundRect(atx,PAD,y,44,44,11); atx.clip(); atx.drawImage(ic,PAD,y,44,44); atx.restore(); }
  atx.textBaseline="alphabetic";
  atx.fillStyle="#fff"; atx.font="19px Anton, sans-serif";
  atx.fillText(String(info.name).toUpperCase(), PAD+57, y+19);
  atx.fillStyle="#a9adb8"; atx.font="600 12px -apple-system,'Segoe UI',Inter,sans-serif";
  atx.fillText(info.sub||"", PAD+57, y+37);

  /* body copy */
  y += 44 + 12;
  atx.fillStyle="#d9dce3"; atx.font="13.5px -apple-system,'Segoe UI',Inter,sans-serif";
  for(var b=0;b<bodyLines.length;b++){ atx.fillText(bodyLines[b], PAD, y+16+b*22); }
  y += bodyLines.length*22 + 16;

  /* focus divider + tags */
  atx.fillStyle="rgba(255,255,255,.14)"; atx.fillRect(PAD,y,W-PAD*2,0.5);
  y += 14;
  atx.fillStyle="#8b8f9a"; atx.font="800 9.5px -apple-system,'Segoe UI',Inter,sans-serif";
  atx.fillText("FOCUS", PAD, y+2);
  y += 14;
  for(var r2=0;r2<tagRows.length;r2++){
    var x = PAD;
    for(var t2=0;t2<tagRows[r2].length;t2++){
      var tag = tagRows[r2][t2];
      roundRect(atx, x, y+r2*26, tag.w, 20, 10);
      atx.fillStyle="rgba(255,255,255,.09)"; atx.fill();
      atx.strokeStyle="rgba(255,255,255,.14)"; atx.lineWidth=.5; atx.stroke();
      atx.fillStyle="#e7e9ee"; atx.font="600 11px -apple-system,'Segoe UI',Inter,sans-serif";
      atx.fillText(tag.t, x+9, y+r2*26+14);
      x += tag.w + 6;
    }
  }
  atx.restore();
  return {w:W, h:H, dpr:dpr};
}

/* preload the dock icons as images for the canvas */
var appIcons = {};
(function(){
  for(var k in ICON_SRC){ var im=new Image(); im.src=ICON_SRC[k]; appIcons[k]=im; }
})();

/* ---- genie curve (same maths as the reference implementation) ---- */
function curveRow(m, progress, rowProgress){
  var axisInitialFar = m.initTop, axisInitialNear = m.initBottom;
  var axisFinalFar = m.finTop, axisFinalNear = m.finBottom;
  var axisDistance = axisFinalFar - axisInitialFar;
  var slideProgress = easeOutCubic(clamp01(progress / SLIDE_END_FRACTION));
  var translateProgress = easeInOutQuad(clamp01((progress - TRANSLATE_START_FRACTION) / (1 - TRANSLATE_START_FRACTION)));
  var translation = translateProgress * axisDistance;
  var farEdgeY = axisInitialFar + translation;
  var nearEdgeY = Math.min(axisInitialNear + translation, axisFinalNear);
  var axisY = farEdgeY*(1-rowProgress) + nearEdgeY*rowProgress;
  var curveProgress = axisDistance === 0 ? 1 : easeInOutQuad(clamp01((axisY - axisInitialFar)/axisDistance));
  var leftTargetX  = m.initLeft  + (m.finLeft  - m.initLeft)  * slideProgress;
  var rightTargetX = m.initRight + (m.finRight - m.initRight) * slideProgress;
  return {
    leftX:  m.initLeft  + (leftTargetX  - m.initLeft)  * curveProgress,
    rightX: m.initRight + (rightTargetX - m.initRight) * curveProgress,
    y: axisY
  };
}

/* ---- the warp: every source row is redrawn at its own width and position ---- */
function drawGenie(progress){
  if(!appMotion) return;
  var dpr = Math.min(window.devicePixelRatio||1, 2);
  var cw = Math.round(window.innerWidth*dpr), ch = Math.round(window.innerHeight*dpr);
  if(appCan.width!==cw || appCan.height!==ch){ appCan.width=cw; appCan.height=ch; }
  actx.setTransform(dpr,0,0,dpr,0,0);
  actx.clearRect(0,0,window.innerWidth,window.innerHeight);

  var H = appMotion.h, texH = appTex.height, texW = appTex.width;
  var STEPS = Math.max(60, Math.round(H));            /* one slice per CSS pixel */
  var prev = curveRow(appMotion, progress, 0);
  actx.imageSmoothingQuality = "high";
  for(var i=1;i<=STEPS;i++){
    var rp = i/STEPS;
    var cur = curveRow(appMotion, progress, rp);
    var dy = prev.y, dh = Math.max(0.6, cur.y - prev.y + 0.6);
    var dx = prev.leftX, dw = prev.rightX - prev.leftX;
    var sy = ((i-1)/STEPS) * texH, sh = Math.max(1, (texH/STEPS));
    if(dw > 0.4) actx.drawImage(appTex, 0, sy, texW, sh, dx, dy, dw, dh);
    prev = cur;
  }
}

function appLoop(now){
  var p = clamp01((now - appT0) / GENIE_DURATION);
  /* the reference maths runs 0 = open, 1 = sucked into the dock */
  appProg = appDir > 0 ? 1 - p : p;
  drawGenie(appProg);
  if(p < 1){ appRaf = requestAnimationFrame(appLoop); }
  else {
    appRaf = 0;
    if(appDir < 0){ appCan.classList.remove("live"); actx.clearRect(0,0,appCan.width,appCan.height); appCurrent=null; }
  }
}

function showApp(key, iconEl){
  var info = null;
  for(var i=0;i<APP_INFO.length;i++){ if(APP_INFO[i].k === key){ info = APP_INFO[i]; break; } }
  if(!info){ hideApp(); return; }   /* у корзины описания нет — прячем чужое окно */
  clearTimeout(appTimer);
  if(appCurrent === key && appProg === 0) return;
  appCurrent = key;

  var box = renderAppTexture(info);
  var dock = document.getElementById("dock").getBoundingClientRect();
  var icon = iconEl.getBoundingClientRect();
  var left = Math.round(dock.left + dock.width/2 - box.w/2);
  var top  = Math.round(dock.top - box.h - 18);
  appMotion = {
    w:box.w, h:box.h,
    initLeft:left, initRight:left+box.w, initTop:top, initBottom:top+box.h,
    finLeft:icon.left, finRight:icon.right, finTop:icon.top, finBottom:icon.bottom
  };
  appCan.classList.add("live");
  appDir = 1; appT0 = performance.now();
  drawGenie(1);
  if(appRaf) cancelAnimationFrame(appRaf);
  appRaf = requestAnimationFrame(appLoop);
}
function hideApp(){
  clearTimeout(appTimer);
  appTimer = setTimeout(function(){
    if(!appCan.classList.contains("live") || appDir < 0) return;
    appDir = -1; appT0 = performance.now();
    if(appRaf) cancelAnimationFrame(appRaf);
    appRaf = requestAnimationFrame(appLoop);
  }, 110);
}

  /* Quick Look: hovering a file pops a window that plays the project */
  var qlWin = document.getElementById("qlWin");
  var qlVid = qlWin.querySelector(".qlv");
  var qlTit = qlWin.querySelector(".qlt");
  var qlY   = qlWin.querySelector(".qly");
  var qlC   = qlWin.querySelector(".qlc");
  var qlPlayer = qlWin.querySelector(".qlvid");
  var qlTimer = 0, qlCtx = qlVid.getContext("2d"), qlRaf = 0, qlPlaying = false;
  function qlLoop(now){
    if(!qlPlaying) return;
    var W = qlVid.clientWidth, H = qlVid.clientHeight;
    if(W && (qlVid.width !== W || qlVid.height !== H)){ qlVid.width = W; qlVid.height = H; }
    /* the hero frame sequence is already decoded in memory — play it here */
    var i = Math.floor(now/41.6) % FRAMES.length;
    var im = imgs[i];
    if(im && loaded[i] && qlVid.width){
      var s = Math.max(qlVid.width/im.naturalWidth, qlVid.height/im.naturalHeight);
      var dw = im.naturalWidth*s, dh = im.naturalHeight*s;
      qlCtx.drawImage(im, (qlVid.width-dw)/2, (qlVid.height-dh)/2, dw, dh);
    }
    qlRaf = requestAnimationFrame(qlLoop);
  }
  var qlName = qlWin.querySelector(".qlname");
  var qlMeta = qlWin.querySelector(".qlmeta");

  window.showQL = function(proj){
    clearTimeout(qlTimer);
    /* в полосе окна — короткое имя, крупно поверх кадра — полное */
    qlTit.textContent = proj.title;
    if(qlName) qlName.textContent = proj.fullTitle || proj.title;
    if(qlMeta){
      var src = (SITE.projects || [])[proj.index] || {};
      qlMeta.textContent = [src.category, proj.year].filter(Boolean).join(" · ");
    }
    qlY.textContent = proj.year;
    qlC.textContent = proj.client;
    /* the project's own video wins; the frame sequence is only a fallback */
    var src = proj.videoSrc || "";
    if(src){
      qlWin.classList.add("hasvid");
      if(qlPlayer.getAttribute("data-src") !== src){
        qlPlayer.setAttribute("data-src", src);
        /* Обложку сюда не ставим. Она была нужна, пока ролик качался долго,
           но теперь он лежит в кэше и стартует сразу — и подмена картинки
           на видео читается как рывок. Пусть сразу идёт видео. */
        qlPlayer.removeAttribute("poster");
        setVideoSrc(qlPlayer, src);
        qlPlayer.load();
      }
      try{ qlPlayer.currentTime = 0; }catch(e){}
      var pr = qlPlayer.play(); if(pr && pr.catch) pr.catch(function(){});
      qlPlaying = false;
      if(qlRaf) cancelAnimationFrame(qlRaf);
    } else {
      qlWin.classList.remove("hasvid");
      try{ qlPlayer.pause(); }catch(e){}
      if(!qlPlaying){ qlPlaying = true; qlRaf = requestAnimationFrame(qlLoop); }
    }
    qlWin.classList.add("on");
  };
  window.hideQL = function(){
    qlTimer = setTimeout(function(){
      qlWin.classList.remove("on");
      qlPlaying = false;
      if(qlRaf) cancelAnimationFrame(qlRaf);
      try{ qlPlayer.pause(); }catch(e){}
    }, 90);
  };

  /* если админка стола задала свой док — берём её набор, порядок и иконки */
  var LD = (LAYOUT.dock && LAYOUT.dock.items && LAYOUT.dock.items.length) ? LAYOUT.dock : null;
  if(LD){
    var built = [];
    for(var q=0;q<LD.items.length;q++){
      var itm = LD.items[q];
      if(itm.k === "trash" && q > 0) built.push({k:"sep"});
      built.push({k:itm.k, t:itm.t || itm.k, run: itm.k !== "trash", items: itm.items || []});
      if(itm.src) ICON_SRC[itm.k] = itm.src;
    }
    DOCK = built;
  }
  var DOCK_PX = Math.round(56 * ((LAYOUT.dock && LAYOUT.dock.scale) || 1));

  for(var k=0;k<DOCK.length;k++){
    if(DOCK[k].k === "sep"){
      var s = document.createElement("div"); s.className = "sep"; dockEl.appendChild(s); continue;
    }
    var wrap = document.createElement("div");
    wrap.className = "dockitem" + (DOCK[k].run ? " run" : "");
    var ic = document.createElement("img");
    ic.src = ICON_SRC[DOCK[k].k];
    ic.alt = DOCK[k].t;
    ic.style.width = ic.style.height = DOCK_PX + "px";
    var tip = null;
    var dot = document.createElement("div"); dot.className="dot";
    wrap.appendChild(ic); wrap.appendChild(dot);
    dockEl.appendChild(wrap);
    (function(key, node, item){
      node.addEventListener("mouseenter", function(){ showApp(key, node); });
      node.addEventListener("mouseleave", hideApp);
      /* корзина открывается как папка — туда складываются отвергнутые идеи */
      if(key === "trash"){
        node.style.cursor = "pointer";
        node.addEventListener("click", function(){
          hideApp();
          openFolder({ label: "Trash", items: item.items || [] });
        });
      }
    })(DOCK[k].k, wrap, DOCK[k]);
  }
  /* macOS dock magnification: neighbours swell around the pointer */
  var dockItems = dockEl.querySelectorAll(".dockitem");
  dockEl.addEventListener("mousemove", function(e){
    for(var i=0;i<dockItems.length;i++){
      var r = dockItems[i].getBoundingClientRect();
      var d = Math.abs(e.clientX - (r.left + r.width/2));
      var k2 = Math.max(0, 1 - d/140);
      var sc = 1 + k2*k2*0.55;
      dockItems[i].style.transform = "scale("+sc.toFixed(3)+") translateY("+(-k2*k2*10).toFixed(1)+"px)";
    }
  });
  dockEl.addEventListener("mouseleave", function(){
    for(var i=0;i<dockItems.length;i++) dockItems[i].style.transform = "";
  });
})();


/* медиа рабочего стола */
(function(){                       /* трек по умолчанию — но не сбрасываем, если уже играет */
  var a = document.getElementById("deskAudio");
  if(a && !a.getAttribute("src")) a.src = "media/bbfe5b9a8c.mp3";
})();
/* музыка вынесена в index.html — она стартует с заставки, а не с рабочего стола */


/* ---- окно папки: содержимое открывается как в системе ---- */
function openFolder(folder){
  var old = document.getElementById("folderWin");
  if(old) old.remove();
  var win = document.createElement("div");
  win.id = "folderWin";
  var bar = document.createElement("div");
  bar.className = "fwBar";
  var dots = document.createElement("div");
  dots.className = "fwDots";
  dots.innerHTML = "<i></i><i></i><i></i>";
  var ttl = document.createElement("div");
  ttl.className = "fwTitle";
  ttl.textContent = folder.label || "Папка";
  bar.appendChild(dots); bar.appendChild(ttl);
  var grid = document.createElement("div");
  grid.className = "fwGrid";
  var items = folder.items || [];
  if(!items.length){
    var em = document.createElement("div");
    em.className = "fwEmpty";
    em.textContent = "Пусто";
    grid.appendChild(em);
  }
  for(var i=0;i<items.length;i++){
    var f = items[i];
    var cell = document.createElement("div");
    cell.className = "fwCell";
    var media;
    if(f.kind === "video"){
      media = document.createElement("video");
        media.muted = true; media.loop = true;
      media.playsInline = true; media.autoplay = true;
      media.preload = "metadata";        /* сначала только заголовок, не весь файл */
      setVideoSrc(media, f.src);
    } else {
      media = document.createElement("img");
      media.src = f.src;
    }
    var nm = document.createElement("div");
    nm.className = "fwName";
    nm.textContent = f.name || "";
    cell.appendChild(media); cell.appendChild(nm);
    grid.appendChild(cell);
  }
  win.appendChild(bar); win.appendChild(grid);
  document.getElementById("deskSec").appendChild(win);
  dots.addEventListener("click", function(){ win.remove(); });
  requestAnimationFrame(function(){ win.classList.add("on"); });
}


/* ---------------- WebGL paper warp ---------------- */
var glCanvas = document.getElementById("paperGL");
var pfx = (window.PaperFX) ? new PaperFX(glCanvas) : {ok:false};
if(pfx.ok){
  document.body.classList.add("gl");
  boxes.forEach(function(b){
    b.tex = pfx.makeTexture();
    if(b.p.video){
      pfx.setVideo(b.tex, b.media);
    } else {
      if(b.media.complete && b.media.naturalWidth){ pfx.setImage(b.tex, b.media); }
      else b.media.addEventListener("load", function(){ pfx.setImage(b.tex, b.media); });
    }
  });
}

/* ---------------- content from the admin panel ---------------- */
(function(){
  if(SITE.name){
    var parts = String(SITE.name).trim().split(/\s+/);
    var lg = document.getElementById("logo");
    lg.innerHTML = "";
    for(var i=0;i<parts.length;i++){
      var sp = document.createElement("span"); sp.textContent = parts[i]; lg.appendChild(sp);
    }
    document.title = SITE.name + " — Portfolio";
  }
  if(SITE.about){ document.querySelector("#about p").textContent = SITE.about; }
  if(SITE.contacts && SITE.contacts.length){
    var cl = document.querySelector(".clist");
    cl.innerHTML = "";
    for(var c=0;c<SITE.contacts.length;c++){
      var it = SITE.contacts[c];
      var a = document.createElement("a");
      a.href = it.href || "#";
      if(/^https?:/.test(a.href)){ a.target="_blank"; a.rel="noopener"; }
      var sm = document.createElement("small"); sm.textContent = it.label || "";
      a.appendChild(sm);
      a.appendChild(document.createTextNode(it.value || ""));
      cl.appendChild(a);
    }
    var fm = document.getElementById("footMail");
    var mail = SITE.contacts.find(function(x){ return /mail/i.test(x.label||""); });
    if(fm && mail){ fm.textContent = mail.value; fm.href = mail.href || ("mailto:"+mail.value); }
  }
  if(SITE.wallpaper){
    /* обои теперь рисует сцена на канвасе, картинку не подставляем */
  }
})();

/* ---------------- overlays ---------------- */
var lightbox = document.getElementById("lightbox");
var lbHolder = document.getElementById("lbHolder");
function openOvl(el){ el.classList.add("on"); }
function closeOvls(){
  document.querySelectorAll(".ovl").forEach(function(o){o.classList.remove("on");});
  lbHolder.innerHTML = "";
}
document.querySelectorAll("[data-close]").forEach(function(btn){ btn.addEventListener("click", closeOvls); });
document.addEventListener("keydown", function(e){ if(e.key==="Escape") closeOvls(); });
document.querySelectorAll(".ovl").forEach(function(o){
  o.addEventListener("click", function(e){ if(e.target===o) closeOvls(); });
});
/* ---------------- case page ---------------- */
var caseView = document.getElementById("caseView");
function el(tag, cls, txt){ var e=document.createElement(tag); if(cls) e.className=cls; if(txt!=null) e.textContent=txt; return e; }
function embedURL(u){
  u = String(u||"");
  var yt = u.match(/(?:youtu\.be\/|v=)([\w-]{6,})/);
  if(yt) return "https://www.youtube.com/embed/"+yt[1];
  var vm = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if(vm) return "https://player.vimeo.com/video/"+vm[1];
  return u;
}
function renderBlocks(blocks, host){
  host.innerHTML = "";
  (blocks||[]).forEach(function(b){
    var w = el("div","cb cb-"+b.type), i;
    if(b.align && b.align !== "left") w.setAttribute("data-align", b.align);
    if(b.width) w.style.maxWidth = b.width + "px";      /* ширина колонки текста */
    if(b.type==="heading"){ w.className="cb cb-heading"; w.textContent=b.text||""; }
    else if(b.type==="text"){ w.className="cb cb-text"; w.textContent=b.text||""; }
    else if(b.type==="quote"){ w.className="cb cb-quote"; w.textContent=b.text||""; }
    else if(b.type==="image"){ w.className="cb cb-img";
      if(b.src){ i=el("img"); i.src=b.src; i.alt=b.caption||""; w.appendChild(i); }
      if(b.caption) w.appendChild(el("div","cb-cap",b.caption)); }
    else if(b.type==="gallery"){ w.className="cb";
      var g=el("div","cb-grid "+((b.items||[]).length>2?"g3":"g2"));
      (b.items||[]).forEach(function(s){ var im=el("img"); im.src=s; g.appendChild(im); });
      w.appendChild(g);
      if(b.caption) w.appendChild(el("div","cb-cap",b.caption)); }
    else if(b.type==="twoImages"){ w.className="cb";
      var g2=el("div","cb-grid g2");
      [b.a,b.b].forEach(function(s){ if(s){ var im=el("img"); im.src=s; g2.appendChild(im); } });
      w.appendChild(g2);
      if(b.caption) w.appendChild(el("div","cb-cap",b.caption)); }
    else if(b.type==="video"){ w.className="cb cb-vid";
      if(b.src){ var v=el("video"); v.controls=true; v.muted=true; v.loop=true; v.playsInline=true;
        v.preload="metadata";              /* тянем заголовок, а не весь ролик */
        if(b.poster) v.poster=b.poster;
        v.setAttribute("playsinline",""); setVideoSrc(v, b.src); w.appendChild(v); }
      if(b.caption) w.appendChild(el("div","cb-cap",b.caption)); }
    else if(b.type==="embed"){ w.className="cb";
      var e2=el("div","cb-embed"); var f=el("iframe"); f.src=embedURL(b.url); f.allow="autoplay; fullscreen; picture-in-picture";
      f.setAttribute("allowfullscreen",""); e2.appendChild(f); w.appendChild(e2);
      if(b.caption) w.appendChild(el("div","cb-cap",b.caption)); }
    else if(b.type==="embedCode"){ w.className="cb"; w.innerHTML=b.html||""; }
    else if(b.type==="model3d"){ w.className="cb cb-model";
      w.textContent = b.name ? ("3D-модель: "+b.name) : "3D-модель не загружена"; }
    else if(b.type==="twoCols"){ w.className="cb cb-cols";
      var c1=el("div","cb-text",b.left||""), c2=el("div","cb-text",b.right||"");
      w.appendChild(c1); w.appendChild(c2); }
    else if(b.type==="spacer"){ w.className="cb"; w.style.height=(b.size||60)+"px"; }
    else if(b.type==="divider"){ w.className="cb cb-div"; }
    else if(b.type==="stats"){ w.className="cb";
      var sg=el("div","cb-stats");
      (b.items||[]).forEach(function(s){ var d=el("div","cb-stat"); d.appendChild(el("b",null,s.value||"")); d.appendChild(el("span",null,s.label||"")); sg.appendChild(d); });
      w.appendChild(sg); }
    else if(b.type==="credits"){ w.className="cb";
      var cg=el("div","cb-cred");
      (b.items||[]).forEach(function(s){
        var row=el("div","crow");
        row.appendChild(el("div","crole", s.role||""));
        var val=el("div","cname");
        /* в одной строке может быть несколько имён — каждое с новой строки */
        String(s.name||"").split(/\n+/).forEach(function(line){
          if(line.trim()) val.appendChild(el("span",null,line.trim()));
        });
        row.appendChild(val);
        cg.appendChild(row);
      });
      w.appendChild(cg); }
    else if(b.type==="cta"){ w.className="cb cb-cta";
      var a=el("a",null,b.label||"Открыть"); a.href=b.href||"#"; a.target="_blank"; a.rel="noopener"; w.appendChild(a); }
    host.appendChild(w);
  });

  revealBlocks(host);
}

/* ---- появление блоков при прокрутке страницы кейса ----
   Следим за тем, что вошло в кадр, и показываем с небольшой задержкой друг за другом. */
/* ищем, что именно прокручивается: страница или контейнер кейса */
function scrollHost(node){
  var el = node;
  while(el && el !== document.body){
    var ov = getComputedStyle(el).overflowY;
    if((ov === "auto" || ov === "scroll") && el.scrollHeight > el.clientHeight + 4) return el;
    el = el.parentElement;
  }
  return null;
}

function revealBlocks(host){
  var items = host.querySelectorAll(".cb");
  if(!("IntersectionObserver" in window)){
    for(var q = 0; q < items.length; q++) items[q].classList.add("in");
    return;
  }
  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(e){
      if(!e.isIntersecting) return;
      var el = e.target;
      io.unobserve(el);
      el.classList.add("in");
      /* картинки внутри сетки выходят по очереди, а не разом */
      var kids = el.querySelectorAll(".cb-grid img, .cb-grid video");
      for(var k = 0; k < kids.length; k++){
        kids[k].style.transitionDelay = (k * 0.09).toFixed(2) + "s";
      }
    });
  }, { root: scrollHost(host), rootMargin: "0px 0px -12% 0px", threshold: 0.08 });

  for(var i = 0; i < items.length; i++) io.observe(items[i]);

  /* то, что уже видно при открытии, показываем сразу */
  requestAnimationFrame(function(){
    var box = scrollHost(host);
    var bottom = box ? box.getBoundingClientRect().bottom : window.innerHeight;
    for(var j = 0; j < items.length; j++){
      var r = items[j].getBoundingClientRect();
      if(r.top < bottom * 0.92) items[j].classList.add("in");
    }
  });
}
function openCase(proj){
  var src = (SITE.projects||[])[proj.index] || {};
  caseView.querySelector(".cvname").textContent = proj.fullTitle || proj.title;
  caseView.querySelector(".cvmeta").textContent = [src.client, src.category, src.year].filter(Boolean).join(" · ");
  var inner = caseView.querySelector(".cvinner");
  var blocks = (src.blocks||[]).slice();
  if(!blocks.length){
    blocks = [];
    if(src.summary) blocks.push({type:"text", text:src.summary});
    if(src.coverVideo || src.video) blocks.push({type:"video", src:src.coverVideo || src.video});
    else if(src.cover) blocks.push({type:"image", src:src.cover});
    if(!blocks.length) blocks.push({type:"text", text:"Страница кейса пока пустая — соберите её в админке."});
  }
  renderBlocks(blocks, inner);
  caseView.querySelector(".cvscroll").scrollTop = 0;
  caseView.classList.add("on");
  document.body.style.overflow = "hidden";
}
function closeCase(){
  caseView.classList.remove("on");
  document.body.style.overflow = "";
  caseView.querySelectorAll("video").forEach(function(v){ try{v.pause();}catch(e){} });
}
caseView.querySelector("[data-caseclose]").addEventListener("click", closeCase);
document.addEventListener("keydown", function(e){ if(e.key==="Escape" && caseView.classList.contains("on")) closeCase(); });

function openLB(p, srcMedia){
  lbHolder.innerHTML = "";
  var m;
  if(p.video){
    m = document.createElement("video");
    m.muted = true; m.loop = true; m.autoplay = true; m.playsInline = true;
    m.setAttribute("playsinline","");
    if(srcMedia.poster) m.poster = srcMedia.poster;
    setVideoSrc(m, srcMedia.src);
    m.id = "lbMedia";
  } else {
    m = document.createElement("img");
    m.src = srcMedia.src; m.alt = p.title; m.id = "lbMedia";
  }
  lbHolder.appendChild(m);
  document.getElementById("lbTitle").textContent = p.title;
  document.getElementById("lbSub").innerHTML = p.year + "<br>" + p.client;
  openOvl(lightbox);
}
document.getElementById("navAbout").addEventListener("click", function(){ openOvl(document.getElementById("about")); });
document.getElementById("navContact").addEventListener("click", function(){ openOvl(document.getElementById("contact")); });
document.getElementById("navWork").addEventListener("click", function(){
  window.scrollTo({top: maxScroll(), behavior:"smooth"});
});
document.getElementById("logo").addEventListener("click", function(){
  window.scrollTo({top: 0, behavior:"smooth"});
});

/* ---------------- hover scribble: handwrite the SAME word(s) over the text ---------------- */
(function(){
  var layer = document.getElementById("scribble");
  var PALETTE = ["#5B8CFF","#F5E13C","#C6FF1B","#A24BFF","#FF4D6D"];
  var active = null, timers = [];

  function clear(){
    for(var i=0;i<timers.length;i++) clearTimeout(timers[i]);
    timers = [];
    while(layer.firstChild) layer.removeChild(layer.firstChild);
    active = null;
  }

  /* lines from the element: <span> rows (logo) or the plain text */
  function sourceLines(el){
    var spans = el.querySelectorAll("span");
    if(spans.length >= 2){
      var out=[];
      for(var i=0;i<spans.length;i++){ var tx=(spans[i].textContent||"").trim(); if(tx) out.push(tx); }
      if(out.length) return out;
    }
    var raw=(el.textContent||"").trim();
    return raw.split(/\n+/).map(function(s){return s.trim();}).filter(Boolean);
  }

  function play(el){
    clear();
    var r = el.getBoundingClientRect();
    if(r.width < 4 || r.height < 4) return;
    var lines = sourceLines(el);
    if(!lines.length) return;
    active = el;

    var color = PALETTE[(el.textContent.length + Math.round(r.left)) % PALETTE.length];
    /* handwriting a bit bigger than the source text, clamped sensibly */
    var fs = Math.min(Math.max(r.height/lines.length*1.45, 30), 64);

    var box = document.createElement("div");
    box.className = "scw";
    box.style.color = color;
    box.style.fontSize = fs.toFixed(1)+"px";
    box.style.left = "0px"; box.style.top = "0px"; box.style.visibility = "hidden";

    var letters = [];
    for(var li=0; li<lines.length; li++){
      var row = document.createElement("span");
      row.className = "ln";
      var txt = lines[li].toUpperCase();
      for(var ci=0; ci<txt.length; ci++){
        var ch = txt[ci];
        var s = document.createElement("b");
        s.textContent = (ch === " ") ? "\u00A0" : ch;
        row.appendChild(s);
        if(ch !== " ") letters.push(s); else s.classList.add("on");
      }
      box.appendChild(row);
    }
    layer.appendChild(box);

    /* measure, then place centered just above the source text; shrink to fit */
    var bw = box.offsetWidth, bh = box.offsetHeight;
    var maxW = window.innerWidth*0.92;
    if(bw > maxW){
      fs = fs * (maxW/bw);
      box.style.fontSize = fs.toFixed(1)+"px";
      bw = box.offsetWidth; bh = box.offsetHeight;
    }
    var left = r.left + r.width/2 - bw/2;
    var top  = r.top + r.height/2 - bh/2 - fs*0.15;   /* sits over/just above */
    if(left < 6) left = 6;
    if(left + bw > window.innerWidth-6) left = window.innerWidth-6-bw;
    if(top < 4) top = 4;
    box.style.left = Math.round(left)+"px";
    box.style.top  = Math.round(top)+"px";
    box.style.visibility = "visible";

    /* write it: letters appear in sequence */
    var stepMs = Math.max(18, Math.min(46, 420/Math.max(letters.length,1)));
    for(var k=0;k<letters.length;k++){
      (function(node, delay){
        timers.push(setTimeout(function(){
          if(active === el) node.classList.add("on");
        }, delay));
      })(letters[k], k*stepMs);
    }
  }

  function bind(el){
    if(!el || el.__scribbled) return;
    el.__scribbled = true;
    el.classList.add("scribbleable");
    el.addEventListener("mouseenter", function(){ play(el); });
    el.addEventListener("mouseleave", function(){ if(active===el) clear(); });
  }
  ["#navWork","#navAbout","#navContact","#logo","#sndTop"].forEach(function(sel){ bind(document.querySelector(sel)); });
  Array.prototype.forEach.call(document.querySelectorAll(".clist a"), bind);
  Array.prototype.forEach.call(document.querySelectorAll("#scene .meta .t"), bind);
  window.addEventListener("scroll", function(){ if(active) clear(); }, {passive:true});
  window.__scribbleBind = bind;
})();

if(reduced){
  document.getElementById("nav").classList.add("on");
  document.getElementById("foot").classList.add("on");
  scene.classList.add("gridmode");
  var rv = document.createElement("video");
  setVideoSrc(rv, VIDEO_SRC); rv.muted = true; rv.loop = true; rv.setAttribute("playsinline","");
  rv.setAttribute("controls","");
  heroCan.replaceWith(rv);
  boxes.forEach(function(b){ if(b.p.video){ b.media.setAttribute("controls",""); } });
  return;
}

/* ---------------- helpers ---------------- */
function clamp(v,a,b){ return v<a?a:(v>b?b:v); }
function lerp(a,b,t){ return a+(b-a)*t; }
function ramp(t,a,b){ return clamp((t-a)/(b-a),0,1); }
function ease(t){ return t*t*(3-2*t); }
function maxScroll(){ return document.getElementById("space").offsetHeight - window.innerHeight; }

/* ---------------- hero: canvas frame sequence (Apple-style scrub) ---------------- */
var ctx = heroCan.getContext("2d");
ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = "high";
var imgs = new Array(FRAMES.length);
var loaded = new Array(FRAMES.length);
var frameW = 0, frameH = 0;
var fShown = -1; /* last drawn fractional frame */
var fCur = 0;    /* smoothed fractional frame */

function loadFrame(i, cb){
  if(imgs[i]) return;
  var im = new Image();
  im.onload = function(){
    loaded[i] = true; frameW = im.naturalWidth; frameH = im.naturalHeight;
    if(im.decode){ im.decode().catch(function(){}); } /* warm the decode cache */
    if(cb) cb();
  };
  im.src = FRAMES[i];
  imgs[i] = im;
}
/* Первый кадр — как можно раньше, остальные следом.
   О готовности первого кадра сообщаем наружу: заставка ждёт этот сигнал,
   иначе после ENTER человек упирается в чёрный экран, пока кадр едет. */
loadFrame(0, function(){
  fShown = -1;
  window.__heroReady = true;
  dispatchEvent(new Event("heroready"));
});
(function preloadRest(i){
  if(i >= FRAMES.length) return;
  loadFrame(i);
  setTimeout(function(){ preloadRest(i+1); }, 16);
})(1);

var canDpr = 1;
function sizeCanvas(){
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  canDpr = dpr;
  var w = Math.round(heroCan.clientWidth * dpr);
  var h = Math.round(heroCan.clientHeight * dpr);
  if(heroCan.width !== w || heroCan.height !== h){
    heroCan.width = w; heroCan.height = h;
    fShown = -1; /* force redraw */
  }
}

function nearestLoaded(i){
  if(loaded[i]) return i;
  for(var d=1; d<FRAMES.length; d++){
    if(loaded[i-d]) return i-d;
    if(loaded[i+d]) return i+d;
  }
  return -1;
}

function drawFrame(f){
  if(!frameW) return;
  /* snap to the NEAREST frame — no cross-fade, otherwise two frames blend
     into a ghosted double image that reads as cheap motion blur */
  var i = Math.round(f);
  var a = nearestLoaded(clamp(i,0,FRAMES.length-1));
  if(a < 0) return;
  var cw = heroCan.width, ch = heroCan.height;
  var s = Math.max(cw/frameW, ch/frameH);
  var dw = frameW*s, dh = frameH*s, dx = (cw-dw)/2, dy = (ch-dh)/2;
  ctx.drawImage(imgs[a], dx, dy, dw, dh);
  fShown = f;
}

/* ---------------- hero glitch under the cursor ---------------- */
var mx = -1, my = -1, mouseIn = false;
window.addEventListener("mousemove", function(e){ mx=e.clientX; my=e.clientY; mouseIn=true; }, {passive:true});
document.addEventListener("mouseleave", function(){ mouseIn=false; }, {passive:true});

function glitchHero(now){
  if(!mouseIn || !frameW) return;
  var D = canDpr;
  var R = Math.round(78*D);                 /* small patch around the pointer */
  var cx = mx*D, cy = my*D;
  var x0 = Math.max(0, Math.round(cx-R)), y0 = Math.max(0, Math.round(cy-R));
  var x1 = Math.min(heroCan.width, Math.round(cx+R)), y1 = Math.min(heroCan.height, Math.round(cy+R));
  var w = x1-x0, h = y1-y0;
  if(w < 8 || h < 8) return;

  var img, src;
  try{ img = ctx.getImageData(x0,y0,w,h); }catch(e){ return; }
  src = img.data;
  var out = new Uint8ClampedArray(src);
  var ccx = cx-x0, ccy = cy-y0;

  for(var y=0;y<h;y++){
    var by = (y/5)|0;
    var rowShift = Math.sin(by*3.1 + now*0.005)*3;
    for(var x=0;x<w;x++){
      var dx = x-ccx, dy = y-ccy;
      var d = Math.sqrt(dx*dx+dy*dy)/R;
      if(d >= 1) continue;                   /* circular patch, fades to nothing */
      var fall = (1-d); fall = fall*fall;    /* no seams: displacement → 0 at the rim */

      var bx = (x/7)|0;
      var n = Math.sin(bx*12.9 + by*4.7 + now*0.006) * Math.cos(by*7.3 - now*0.004);
      var sx = (x + n*15*fall)|0;
      var sy = (y + rowShift*fall)|0;
      sx = sx<0?0:(sx>=w?w-1:sx);
      sy = sy<0?0:(sy>=h?h-1:sy);

      var off = (5*fall*(1+n*0.6))|0;        /* RGB split */
      var rx = sx+off; rx = rx<0?0:(rx>=w?w-1:rx);
      var bxs = sx-off; bxs = bxs<0?0:(bxs>=w?w-1:bxs);

      var di = (y*w+x)*4, si = (sy*w+sx)*4;
      out[di]   = src[(sy*w+rx)*4];
      out[di+1] = src[si+1];
      out[di+2] = src[(sy*w+bxs)*4+2];
      out[di+3] = 255;
    }
  }
  img.data.set(out);
  ctx.putImageData(img, x0, y0);
}

/* ---------------- dithered wave paint-over (fine Bayer dots, living edge) ---------------- */
var dctx = dith.getContext("2d");
var BAYER = [0,32,8,40,2,34,10,42,48,16,56,24,50,18,58,26,12,44,4,36,14,46,6,38,60,28,52,20,62,30,54,22,3,35,11,43,1,33,9,41,51,19,59,27,49,17,57,25,15,47,7,39,13,45,5,37,63,31,55,23,61,29,53,21];
var dBuf = null, dW = 0, dH = 0, colOff = null;
function sizeDith(){
  /* 1/3 of the CSS size = fine ~3px dots */
  var w = Math.max(240, Math.round(window.innerWidth/3));
  var h = Math.max(140, Math.round(window.innerHeight/3));
  if(w!==dW || h!==dH){
    dW=w; dH=h;
    dith.width=w; dith.height=h;
    dctx.imageSmoothingEnabled = false;
    dBuf = dctx.createImageData(w,h);
    var d = dBuf.data;
    for(var i=0;i<d.length;i+=4){ d[i]=5; d[i+1]=5; d[i+2]=5; d[i+3]=0; }
    colOff = new Float32Array(w);
  }
}


/* Растворение стены — по тому же принципу, что переход на первом экране.
   Сетка стоит на месте в пикселях, двигается ПОРОГ: три синуса ведут его во времени,
   и точки вспыхивают и гаснут там, где порог переходит их значение в сетке.
   Пересчитывается каждый кадр, как и в первом переходе. */
var dsCan = document.createElement("canvas");
var dsCtx = dsCan.getContext("2d");
var dsW = 0, dsH = 0, dsBuf = null, dsRow = null;
function sizeDissolve(){
  var w = Math.max(2, Math.round(window.innerWidth/3));
  var h = Math.max(2, Math.round(window.innerHeight/3));
  if(w === dsW && h === dsH) return;
  dsW = w; dsH = h; dsCan.width = w; dsCan.height = h;
  dsBuf = dsCtx.createImageData(w, h);
  dsRow = new Float32Array(h);
  var d = dsBuf.data;
  for(var i=0;i<w*h;i++){ d[i*4]=d[i*4+1]=d[i*4+2]=0; }
}
function dissolveWall(p, now, t){
  sizeDissolve();
  /* те же три синуса и те же коэффициенты, что в первом переходе */
  var T1 = now*.00045 + t*6.0;
  var T2 = now*.00030 - t*4.0;
  var T3 = now*.00060 + t*9.0;
  for(var y=0; y<dsH; y++){
    dsRow[y] = Math.sin(y*.021 + T1)*.50 + Math.sin(y*.049 - T2)*.28 + Math.sin(y*.009 + T3)*.42;
  }
  var d = dsBuf.data, edge = .55, wAmp = .13;
  for(var y2=0; y2<dsH; y2++){
    var by = (y2&7)*8;
    var base = (1 - p)*(1 + edge + wAmp*1.2) - dsRow[y2]*wAmp;
    for(var x=0; x<dsW; x++){
      /* слева стена цела дольше всего: справа порог достигается раньше */
      var lp = base - (x/dsW)*edge;
      d[(y2*dsW + x)*4 + 3] = (BAYER[by + (x&7)]/64 < lp) ? 255 : 0;
    }
  }
  dsCtx.putImageData(dsBuf, 0, 0);
  var u = "url(" + dsCan.toDataURL() + ")";
  typeSec.style.webkitMaskImage = u;
  typeSec.style.maskImage = u;
  typeSec.style.webkitMaskSize = "100% 100%";
  typeSec.style.maskSize = "100% 100%";
  typeSec.style.webkitMaskRepeat = "no-repeat";
  typeSec.style.maskRepeat = "no-repeat";
  typeSec.style.webkitMaskPosition = "0 0";
  typeSec.style.maskPosition = "0 0";
}

var dithHoriz = false;
function drawDith(p, now, t){
  sizeDith();
  /* living wave edge: several sines drifting with time and scroll */
  var T1 = now*.00045 + t*6.0;
  var T2 = now*.00030 - t*4.0;
  var T3 = now*.00060 + t*9.0;
  for(var x=0;x<dW;x++){
    colOff[x] = Math.sin(x*.021 + T1)*.50 + Math.sin(x*.049 - T2)*.28 + Math.sin(x*.009 + T3)*.42;
  }
  var d = dBuf.data, edge = .55, wAmp = .13;
  if(dithHoriz){
    /* тот же приём, но фронт идёт слева направо — под уезжающий вправо стол */
    for(var y2=0;y2<dH;y2++){
      var by2 = (y2&7)*8;
      var wob = Math.sin(y2*.035 + T1)*.5 + Math.sin(y2*.071 - T2)*.3;
      for(var x3=0;x3<dW;x3++){
        var left = 1 - x3/dW;
        var lp2 = p*(1+edge+wAmp*1.2) - left*edge - wob*wAmp;
        d[(y2*dW+x3)*4+3] = (BAYER[by2 + (x3&7)]/64 < lp2) ? 255 : 0;
      }
    }
  } else {
    for(var y=0;y<dH;y++){
      var up = 1 - y/dH; /* 1 at top, 0 at bottom: black rises from below */
      var rowBase = p*(1+edge+wAmp*1.2) - up*edge;
      var by = (y&7)*8;
      for(var x2=0;x2<dW;x2++){
        var lp = rowBase - colOff[x2]*wAmp;
        d[(y*dW+x2)*4+3] = (BAYER[by + (x2&7)]/64 < lp) ? 255 : 0;
      }
    }
  }
  dctx.putImageData(dBuf,0,0);
}

/* ---- живой дизеринг-фон типографической стены ---- */
var tbg=document.getElementById("typeBg"), tbgCtx=null, tbW=0, tbH=0, tbBuf=null, tbOff=null;
function sizeTbg(){
  var w=Math.max(2,Math.round(window.innerWidth/2.2)), h=Math.max(2,Math.round(window.innerHeight/2.2));
  if(w===tbW && h===tbH) return;
  tbW=w; tbH=h; tbg.width=w; tbg.height=h;
  tbgCtx=tbg.getContext("2d");
  tbBuf=tbgCtx.createImageData(w,h);
  tbOff=new Float32Array(w);
  var d=tbBuf.data;
  for(var i=0;i<w*h;i++){ d[i*4]=255; d[i*4+1]=255; d[i*4+2]=255; }
}
function drawTypeBg(now,t){
  sizeTbg();
  /* та же волна, что в переходе с первого экрана, только медленная и бесконечная */
  var T1=now*.00018+t*2.0, T2=now*.00011-t*1.4, T3=now*.00026+t*3.1;
  for(var x=0;x<tbW;x++){
    tbOff[x]=Math.sin(x*.024+T1)*.50+Math.sin(x*.055-T2)*.26+Math.sin(x*.011+T3)*.40;
  }
  var d=tbBuf.data;
  for(var y=0;y<tbH;y++){
    var up=y/tbH;
    var base=0.30+up*0.55+Math.sin(now*.00013+up*3.4)*0.06;
    var by=(y&7)*8;
    for(var x2=0;x2<tbW;x2++){
      var lp=base-tbOff[x2]*.10;
      d[(y*tbW+x2)*4+3]=(BAYER[by+(x2&7)]/64<lp)?255:0;
    }
  }
  tbgCtx.putImageData(tbBuf,0,0);
}


/* ---------------- cursor dot-cloud (dithered comet, cycling palette) ---------------- */
var fx = document.getElementById("cursorFx");
var fxOn = false;   /* курсорный шлейф отключён — мешал типографике */
var fxCtx = null, fxW=0, fxH=0, fxDpr=1;
var PALETTE = ["#99F8FF","#DCC7FF","#6081D6","#FFF8A5","#FFBA6A","#8CCAF5","#9BE187","#99F8FF","#F98DFF","#C6FF1B","#F85255"];
var PAL = PALETTE.map(function(hx){ return [parseInt(hx.slice(1,3),16), parseInt(hx.slice(3,5),16), parseInt(hx.slice(5,7),16)]; });
var COL_HOLD = 620, COL_FADE = 200; /* ms per color, ms crossfade */
var trail = [], lastPush = 0;
if(fxOn){
  fxCtx = fx.getContext("2d");
  window.addEventListener("mousemove", function(e){
    var n = performance.now();
    if(n - lastPush > 12){
      trail.push({x:e.clientX, y:e.clientY, t:n});
      if(trail.length > 30) trail.shift();
      lastPush = n;
    }
  }, {passive:true});
} else {
  fx.style.display = "none";
}
function fxSize(){
  fxDpr = Math.min(window.devicePixelRatio||1, 1.5);
  var w = Math.round(fx.clientWidth*fxDpr), h = Math.round(fx.clientHeight*fxDpr);
  if(fx.width!==w || fx.height!==h){ fx.width=w; fx.height=h; }
  fxW = w; fxH = h;
}
function fxColor(now){
  var cyc = COL_HOLD + COL_FADE;
  var i = Math.floor(now/cyc) % PAL.length;
  var j = (i+1) % PAL.length;
  var ph = now % cyc;
  var m = ph < COL_HOLD ? 0 : (ph-COL_HOLD)/COL_FADE;
  var a = PAL[i], b = PAL[j];
  return [lerp(a[0],b[0],m), lerp(a[1],b[1],m), lerp(a[2],b[2],m)];
}
function drawFx(now){
  if(!fxOn) return;
  fxSize();
  fxCtx.clearRect(0,0,fxW,fxH);
  /* drop dead tail */
  while(trail.length && now - trail[0].t > 700) trail.shift();
  if(!trail.length) return;
  /* bounding box of the living trail */
  var minX=1e9,minY=1e9,maxX=-1e9,maxY=-1e9;
  for(var i=0;i<trail.length;i++){
    var p = trail[i];
    if(p.x<minX)minX=p.x; if(p.x>maxX)maxX=p.x;
    if(p.y<minY)minY=p.y; if(p.y>maxY)maxY=p.y;
  }
  var G = 4;                  /* dot grid step, css px (dense) */
  var Rhead = 20, Rtail = 5;  /* round head → thin tail (compact) */
  var LIFE = 750;
  var pad = Rhead*2.7;
  var gx0 = Math.floor((minX-pad)/G), gx1 = Math.ceil((maxX+pad)/G);
  var gy0 = Math.floor((minY-pad)/G), gy1 = Math.ceil((maxY+pad)/G);
  var cbase = fxColor(now); /* [r,g,b] */
  for(var gy=gy0; gy<=gy1; gy++){
    var cy = gy*G;
    var by = (gy&7)*8;
    for(var gx=gx0; gx<=gx1; gx++){
      var cx = gx*G;
      var field = 0;
      for(var k=0;k<trail.length;k++){
        var tp = trail[k];
        var age = 1 - (now - tp.t)/LIFE;
        if(age<=0) continue;
        var R = Rtail + (Rhead-Rtail)*age; /* radius tapers along the tail */
        var R2 = R*R;
        var dx = cx-tp.x, dy = cy-tp.y;
        var d2 = dx*dx+dy*dy;
        if(d2 > R2*7) continue;
        field += Math.exp(-d2/R2) * age;
      }
      var prob = 1 - Math.exp(-field*2.6); /* dense core, round grainy rim */
      if(prob > (BAYER[by + (gx&7)]+0.5)/64){
        var dens = Math.min(field, 1.4);
        var tw = 0.5 + 0.5*Math.sin(now*0.006 + (gx*12.9898 + gy*78.233)); /* per-dot twinkle */
        var sz = (0.7 + dens*1.7) * fxDpr * (0.75 + tw*0.5);
        if(sz < 0.6) sz = 0.6;
        var br = (0.35 + dens*0.65) * (0.6 + tw*0.55);
        if(br > 1) br = 1;
        fxCtx.fillStyle = "rgb("+Math.round(cbase[0]*br)+","+Math.round(cbase[1]*br)+","+Math.round(cbase[2]*br)+")";
        if(dens > 0.55){ /* round dots in the core */
          fxCtx.beginPath(); fxCtx.arc(cx*fxDpr, cy*fxDpr, sz*0.6, 0, 6.283); fxCtx.fill();
        } else {          /* square pixels at the sparse rim → texture */
          fxCtx.fillRect(cx*fxDpr-sz/2, cy*fxDpr-sz/2, sz, sz);
        }
      }
    }
  }
}

/* ---------------- scroll state ---------------- */
var sT = 0;          /* smoothed t 0..1 */
var vel = 0;         /* smoothed velocity */
var prevST = 0;
var W = window.innerWidth, H = window.innerHeight;
window.addEventListener("resize", function(){ W = window.innerWidth; H = window.innerHeight; });
window.addEventListener("scroll", function(){}, {passive:true});

var gridOn = false;
function setGrid(on){
  if(on===gridOn) return;
  gridOn = on;
  scene.classList.toggle("gridmode", on);
  foot.classList.toggle("on", on);
}

function frame(now){
  var ms = maxScroll();
  var target = ms>0 ? clamp(window.scrollY/ms,0,1) : 0;
  sT = lerp(sT, target, 0.11);
  if(Math.abs(sT-target) < 0.0004) sT = target;
  vel = lerp(vel, (sT - prevST)*1000, 0.12);
  prevST = sT;
  var t = sT;

  /* ---- phase 1: hero frame-sequence, scrubbed by scroll (0 → .50) ---- */
  var heroOp = 1 - ramp(t, .40, .45);
  var heroScale = 1 + ease(ramp(t, 0, .50))*.08;
  heroLayer.style.opacity = heroOp;
  heroLayer.style.visibility = heroOp<=0.001 ? "hidden" : "visible";
  heroLayer.style.transform = "scale("+heroScale+")";
  hint.style.opacity = (1 - ramp(t, .01, .08)) * .85;

  /* smooth scroll-scrub: fractional frame follows scroll, crossfaded */
  if(heroOp > 0.001){
    sizeCanvas();
    var fTarget = ease(ramp(t, 0, .50)) * (FRAMES.length - 1);
    fCur = lerp(fCur, fTarget, 0.26);
    if(Math.abs(fCur - fTarget) < 0.01) fCur = fTarget;
    if(mouseIn){
      drawFrame(fCur);       /* repaint clean base, then distort under the cursor */
      glitchHero(now);
    } else if(Math.round(fCur) !== Math.round(fShown)){
      drawFrame(fCur);
    }
  }

  /* ---- phase 2: dithered wave paints the screen to black (.44 → .62) ---- */
  var dp = ramp(t, .30, .42);
  var dithOp = 1 - ramp(t, .355, .45);
  /* вторая волна: тем же приёмом уводим стену и открываем рабочий стол */
  /* Переход на рабочий стол: без черноты.
     Стол раскрывается маской СПРАВА НАЛЕВО, проступая из дымки,
     а светлая частица летит вместе с фронтом и заканчивает путь ровно тогда,
     когда стол открыт целиком. */
  var rev = ramp(t, .655, .82);
  var revE = ease(rev);
  var dithOn = dp>0.001 && dithOp>0.001;
  if(rev <= 0.001 || rev >= 0.999){
    dith.style.visibility = dithOn ? "visible" : "hidden";
    dith.style.opacity = dithOp;
    if(dithOn) drawDith(ease(dp), now, t);
  }
  scene.style.setProperty("--sbg", ramp(t, .85, .89));

  /* ---- phase 3: typographic wall (.50 → .88) ----
     the wall scrolls past; each word plays the reference timeline as it hits
     the trigger line (equivalent of ScrollTrigger start:"top 80%") */
  var TA = .41, TB = .68;
  var TD = .77;
  var secVis = Math.min(ramp(t,TA-.05,TA-.02), 1-ramp(t,TD-.01,TD+.015));
  typeSec.style.visibility = secVis <= 0.002 ? "hidden" : "visible";
  typeSec.style.opacity = secVis;

  if(secVis > 0.002){
    typeGrain.style.opacity = (0.10*secVis).toFixed(3);
    tbg.style.opacity = (0.11*secVis).toFixed(3);
    drawTypeBg(now, t);

    var wallH = typeWall.scrollHeight || window.innerHeight*2;
    /* стена доезжает до положения "низ стены = низ экрана" ровно к старту волны:
       ниже последнего слова пустоты не остаётся, а стоять ей некогда — её сразу ест волна */
    var vhW = window.innerHeight;
    var wpStop = (vhW*0.62 + wallH - vhW) / (wallH + vhW*0.72);
    var wp = wpStop * ramp(t, .375, .615);
    var vh = window.innerHeight;
    var wy = vh*0.62 - wp*(wallH + vh*0.72);   /* enters from below, exits past the top */
    typeWall.style.transform = "translate3d(0,"+wy.toFixed(1)+"px,0)";

    for(var ri=0; ri<wallRows.length; ri++){
      var R = wallRows[ri];
      var rowTop = R.el.offsetTop + wy;
      /* GSAP: stagger .05 per char, duration .6 → total timeline length */
      var n = R.letters.length;
      var total = 0.6 + (n-1)*0.05;
      /* progress: 0 when the row is at 80% of the viewport, 1 after it travels 45% more */
      /* Стена замирает, когда последнее слово ещё внизу экрана, и его таймлайн
         не успевает доиграть — буквы стоят на 85%, а скрипт-строка не всплывает.
         Дотягиваем все строки до конца к моменту остановки стены. */
      var settle = ramp(t, .555, .625);   /* дособраться ровно к остановке стены */
      var p = Math.max(clamp((window.innerHeight*1.02 - rowTop) / (window.innerHeight*0.52), 0, 1), settle);
      var tl = p * total;
      for(var ci=0; ci<n; ci++){
        var lp = easeOut2(clamp((tl - ci*0.05)/0.6, 0, 1));
        var L = R.letters[ci];
        L.style.opacity = lp.toFixed(3);
        L.style.transform = "translateY("+(50*(1-lp)).toFixed(2)+"%) rotateX("+(-90*(1-lp)).toFixed(1)+"deg)";
      }
      var isDone = p >= 0.999;
      if(isDone !== R.done){
        R.done = isDone;
        R.el.classList.toggle("done", isDone);
      }
    }

  }

  /* ---- phase 4: horizontal desktop (.88 → 1.0) ----
     the slide travels sideways instead of down: the pane pans left while the
     wallpaper drifts slower behind it */
  var dsk = ramp(t, .82, 1.0);
  var dskVis = rev;
  deskSec.style.visibility = rev <= 0.002 ? "hidden" : "visible";
  deskSec.style.opacity = 1;

  if(rev > 0.002){
    /* стена поверх стола и растворяется рваным краем справа налево */
    typeSec.style.zIndex = "21";
    typeSec.style.clipPath = "none";
    deskSec.style.webkitMaskImage = "none";
    deskSec.style.maskImage = "none";
    dissolveWall(revE, now, t);

    /* проступает из дымки: сначала тёмный и мягкий, к концу — чистый */
    var haze = 1 - revE;
    deskPane.style.filter = "brightness(" + (0.72 + 0.28*revE).toFixed(3) +
                            ") blur(" + (haze*2.5).toFixed(2) + "px)";
    deskWall.style.filter = "brightness(" + (0.78 + 0.22*revE).toFixed(3) +
                            ") blur(" + (haze*2.5).toFixed(2) + "px)";

    /* панель не ездит: значки стоят у левого края, и сдвиг уводил их за экран,
       а справа в панели пусто — показывать там нечего.
       Небольшой параллакс оставляем только фону, для глубины. */
    deskPane.style.transform = "translate3d(0,0,0)";
    var par = ease(dsk) * 46;
    deskWall.style.transform = "translate3d(" + (-par).toFixed(1) + "px,0,0) scale(1.06)";
    deskSec.style.pointerEvents = rev > 0.9 ? "auto" : "none";
  } else {
    deskSec.style.pointerEvents = "none";
    typeSec.style.zIndex = "";
    typeSec.style.clipPath = "none";
    typeSec.style.webkitMaskImage = "none";
    typeSec.style.maskImage = "none";
    deskSec.style.webkitMaskImage = "none";
    deskSec.style.maskImage = "none";
  }

  /* the old floating boxes stay out of the way now */
  var g = 0, appear = 0, drift = 0, par = 0, scrollBend = 0, wind = 0;
  scene.style.display = "none";

  setGrid(false);

  drawFx(now);          /* курсорный шлейф — вызов потерялся при переносе */

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
})();
