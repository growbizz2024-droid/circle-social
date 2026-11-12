// Idempotent additive backfill. Does not change identity, legacy IDs or profile fields.
import {config} from 'dotenv';
config({quiet:true});
import {createHash} from 'node:crypto';
import {PrismaPg} from '@prisma/adapter-pg';
import {PrismaClient} from '../dist/generated/prisma/client.js';
import {generateAvatar} from '@circle/avatar-engine';
const db=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
let count=0;
try {
 for(;;){const users=await db.user.findMany({where:{avatar:null},take:100,select:{id:true}});if(!users.length)break;
 for(const u of users){const seed=createHash('sha256').update('circle-avatar-v1:'+u.id).digest('hex'),spec=generateAvatar(seed);await db.userAvatar.upsert({where:{userId:u.id},update:{},create:{userId:u.id,seed,defaultSeed:seed,config:spec.config}});count++;}}
 console.log(`Avatar backfill complete: ${count} records. Existing avatar records preserved.`);
} finally {await db.$disconnect();}
