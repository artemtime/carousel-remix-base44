import { createFileRoute } from "@tanstack/react-router";
import { requireUserRoute } from "@/lib/auth-middleware";
import { editorialTick } from "@/lib/editorial.server";
export const Route=createFileRoute("/api/editorial/tick")({server:{middleware:[requireUserRoute],handlers:{POST:async({context})=>{
  if(context.user?.role!=="admin")return Response.json({error:"Только для владельца редакции"},{status:403});
  try{return Response.json(await editorialTick(context.getBase44().asServiceRole));}
  catch(error){return Response.json({more:false,error:String(error.message || error).slice(0,500)});}
}}}});
