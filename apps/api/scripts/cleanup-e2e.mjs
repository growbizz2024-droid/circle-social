import { config } from 'dotenv';
config({path:'.env.test',quiet:true});
import { Client } from 'pg';
const [id,handle]=process.argv.slice(2);
if(!new URL(process.env.DATABASE_URL).pathname.endsWith('_test')||!/^[0-9a-f-]{36}$/.test(id??'')||!/^[a-z]+_[a-z]+_\d{4}$/.test(handle??''))throw new Error('Refusing cleanup outside the test database or generated identity');
const client=new Client({connectionString:process.env.DATABASE_URL});try{await client.connect();await client.query('DELETE FROM users WHERE id=$1::uuid AND handle=$2',[id,handle]);}finally{await client.end();}
