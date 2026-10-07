export const ZONE='Europe/Warsaw';
export function dayAt(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function shiftDay(day:string,n:number){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
export function resetAt(now=new Date()){const tomorrow=shiftDay(dayAt(now),1);let t=Date.parse(tomorrow+'T00:00:00Z');for(let i=0;i<3;i++){const p=new Intl.DateTimeFormat('en-GB',{timeZone:ZONE,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(t));const v=Object.fromEntries(p.map(p=>[p.type,p.value]));const local=Date.parse(`${v.year}-${v.month}-${v.day}T${v.hour}:${v.minute}:${v.second}Z`);t+=Date.parse(tomorrow+'T00:00:00Z')-local;}return t;}
export function effectiveStreak(u:{last_day:string|null;streak:number},day:string){return u.last_day===day||u.last_day===shiftDay(day,-1)?u.streak:0;}
export const CATALOG=[
 {id:'classic',kind:'button',name:'Original',price:0,color:'#b5f568',rarity:'Klasyczny',description:'Od tego zaczyna się każda historia.'},
 {id:'ocean',kind:'button',name:'Deep Blue',price:300,color:'#71caff',rarity:'Rzadki',description:'Spokojny jak ocean. Wytrwały jak Ty.'},
 {id:'lavender',kind:'button',name:'Ultraviolet',price:500,color:'#bda0ff',rarity:'Rzadki',description:'Twój codzienny rytuał w innym wymiarze.'},
 {id:'sunset',kind:'button',name:'Sunset Club',price:700,color:'#ffb173',rarity:'Epicki',description:'Zachód słońca, który nigdy się nie kończy.'},
 {id:'gold',kind:'button',name:'Liquid Gold',price:1500,color:'#f1d27c',rarity:'Legendarny',description:'Mały przycisk. Złoty standard.'},
 {id:'frog',kind:'avatar',name:'Żabka',price:200,emoji:'🐸',rarity:'Rzadki',description:'Spokojnie. Jeszcze tylko jeden klik.'},
 {id:'astronaut',kind:'avatar',name:'Odkrywca',price:400,emoji:'👨‍🚀',rarity:'Rzadki',description:'Mały krok dla Ciebie. Wielka seria.'},
 {id:'dragon',kind:'avatar',name:'Smok',price:800,emoji:'🐲',rarity:'Epicki',description:'Pilnuje Twojej serii jak skarbu.'},
 {id:'aurora',kind:'frame',name:'Aurora',price:600,color:'#bda0ff',rarity:'Epicki',description:'Zorza na profilu i świetlista ramka awatara.'},
 {id:'ember',kind:'frame',name:'Ember',price:1000,color:'#ffb173',rarity:'Epicki',description:'Ognista oprawa dla wytrwałych.'},
 {id:'champion',kind:'frame',name:'Champion',price:2000,color:'#f1d27c',rarity:'Legendarny',description:'Złota oprawa Twojej codziennej historii.'},
] as const;
export function duelResult(start:string,day:string,a:Set<string>,b:Set<string>){let d=start,score=0;while(d<day){const ac=a.has(d),bc=b.has(d);if(!ac||!bc)return {ended:d,score,winner:ac?'a':bc?'b':null};score++;d=shiftDay(d,1);}return {score,ended:null,winner:null};}
