import { env } from 'cloudflare:workers';
import { createGameHandler } from '@/lib/server';
export const dynamic='force-dynamic';
async function handle(req:Request){if(!env.DB)return Response.json({error:'Baza danych jest niedostępna.'},{status:503});return createGameHandler(env.DB)(req);}
export {handle as GET,handle as POST};
