export function weeklySlot(settings,now=new Date()) {
  const zone=settings.timezone || "Europe/Moscow";
  const p=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",weekday:"short",hourCycle:"h23"}).formatToParts(now).map(part=>[part.type,part.value]));
  const day={Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6,Sun:7}[p.weekday];
  const selected=Math.max(1,Math.min(7,Number(settings.digest_day)||1));
  const hour=Number.isInteger(Number(settings.digest_hour))?Math.max(0,Math.min(23,Number(settings.digest_hour))):9;
  let delta=(day-selected+7)%7;if(delta===0 && Number(p.hour)<hour)delta=7;
  const date=new Date(Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day))-delta*86400000).toISOString().slice(0,10);
  return `${date}@${String(hour).padStart(2,"0")}|${zone}`;
}
