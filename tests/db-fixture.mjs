/* global structuredClone */
// In-memory SDK fixture with conditional updates applied atomically in one JS turn.
export function matches(row,query) {
  return Object.entries(query).every(([key,value])=>{
    if(key==="$or")return value.some(q=>matches(row,q));
    if(key==="$and")return value.every(q=>matches(row,q));
    const actual=row[key];
    if(value && typeof value==="object" && !Array.isArray(value))return Object.entries(value).every(([op,v])=>{
      if(op==="$exists")return v?(actual!==undefined):(actual===undefined);
      if(op==="$in")return v.includes(actual);if(op==="$nin")return !v.includes(actual);if(op==="$ne")return actual!==v;
      if(op==="$lt")return actual<v;if(op==="$lte")return actual<=v;
      if(op==="$gt")return actual>v;if(op==="$gte")return actual>=v;
      return false;
    });
    return actual===value;
  });
}
export function database(seed={}) {
  const tables=Object.fromEntries(["Slide","Carousel","TaskQueue","Settings","MyStyle","Hero","WatchAuthor","SourcePost","EditorialItem","EditorialEvent"].map(name=>[name,structuredClone(seed[name] || [])]));let sequence=0;
  const entities=Object.fromEntries(Object.entries(tables).map(([name,records])=>[name,{
    get:async id=>{const row=records.find(r=>r.id===id);if(!row)throw new Error(`Missing ${name}:${id}`);return structuredClone(row);},
    list:async()=>({items:structuredClone(records)}),
    filter:async(query,options={})=>{let rows=records.filter(row=>matches(row,query));if(options.sort){const key=options.sort.replace(/^-/,'');rows=[...rows].sort((a,b)=>String(a[key]||'').localeCompare(String(b[key]||''))*(options.sort.startsWith('-')?-1:1));}return {items:structuredClone(rows.slice(0,options.limit || 500))};},
    create:async patch=>{const row={id:`job${++sequence}`,created_date:new Date().toISOString(),updated_date:new Date().toISOString(),...structuredClone(patch)};records.unshift(row);return structuredClone(row);},
    update:async(id,patch)=>{const row=records.find(r=>r.id===id);if(!row)throw new Error('Missing record');Object.assign(row,structuredClone(patch),{updated_date:new Date().toISOString()});return structuredClone(row);},
    updateMany:async(query,operation)=>{let updated=0;for(const row of records){if(!matches(row,query))continue;Object.assign(row,structuredClone(operation.$set || {}));for(const [key,value] of Object.entries(operation.$inc || {}))row[key]=(row[key]||0)+value;for(const key of Object.keys(operation.$unset || {}))delete row[key];updated++;}return {updated,has_more:false};},
    bulkUpdate:async patches=>{for(const patch of patches)Object.assign(records.find(r=>r.id===patch.id),structuredClone(patch));},
    bulkCreate:async patches=>{for(const patch of patches)records.push({id:`job${++sequence}`,...structuredClone(patch)});},
    delete:async id=>{const i=records.findIndex(r=>r.id===id);if(i>=0)records.splice(i,1);},
    count:async query=>records.filter(row=>matches(row,query)).length,
  }]));
  return {entities,tables};
}
