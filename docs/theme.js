// Общая тема для окна, главной и настроек
var PRESETS={emerald:['#10a371','#14a39a','#0b3b47'],ocean:['#2f6df0','#0e9ec0','#0b2a4a'],plum:['#9a45e8','#c23bc8','#2a1245'],sunset:['#f0661a','#dc3a82','#3b1230'],graphite:['#64748b','#475569','#0f172a'],lavender:['#7f86ff','#a58bfa','#25264a']};
var PNAMES={emerald:'Изумруд',ocean:'Океан',plum:'Слива',sunset:'Закат',graphite:'Графит',lavender:'Лаванда'};
var DEFTHEME={preset:'emerald',mode:'dark',c:PRESETS.emerald.slice(),angle:150,glass:.14,blur:22};
function applyTheme(s){
  var t=Object.assign({},DEFTHEME,(s&&s.theme)||{}),r=document.documentElement.style,b=document.body;
  var dark=t.mode==='dark'||(t.mode==='auto'&&matchMedia('(prefers-color-scheme:dark)').matches);
  r.setProperty('--c1',t.c[0]);r.setProperty('--c2',t.c[1]);r.setProperty('--c3',t.c[2]);
  r.setProperty('--ga',(dark?t.glass+.06:t.glass+.52).toFixed(2));r.setProperty('--gb',(dark?t.glass:t.glass+.4).toFixed(2));
  r.setProperty('--blur',((s&&s.lite)?0:t.blur)+'px');
  r.setProperty('--fg',dark?'#f4f7f6':'#13201c');r.setProperty('--fg2',dark?'rgba(244,247,246,.65)':'rgba(19,32,28,.62)');
  r.setProperty('--tint',dark?'255,255,255':'255,255,255');r.setProperty('--shade',dark?'0,0,0':'20,40,34');
  var dim=dark?'rgba(9,13,15,.62)':'rgba(240,247,244,.55)';
  r.setProperty('--wall','linear-gradient('+dim+','+dim+'),linear-gradient('+t.angle+'deg,'+t.c[0]+' 0%,'+t.c[1]+' 52%,'+t.c[2]+' 100%)');
  if(s&&s.font)r.setProperty('--font',s.font);
  r.setProperty('--r',((s&&s.radius)||16)+'px');
  b.classList.toggle('lite',!!(s&&s.lite));b.classList.toggle('light',!dark);
}
