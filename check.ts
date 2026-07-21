import { getMasterLogRows } from './lib/masterSheet';
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

getMasterLogRows().then(r => { 
  console.log('Hari 16 rows:', r.filter(x => x.hari === 16).length); 
  console.log('Hari 15 rows:', r.filter(x => x.hari === 15).length); 
  const sample16 = r.filter(x => x.hari === 16)[0];
  console.log('Sample Hari 16:', sample16);
});
