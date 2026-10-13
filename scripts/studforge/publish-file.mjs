import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';

// Readers see a complete document. Brief Windows reader/virus-scanner locks are retried.
export async function publishFile(file, contents) {
    const temporary=`${file}.import-${randomUUID()}.tmp`;
    try {
        await fs.writeFile(temporary,contents);
        for(let attempt=0;;attempt++) {
            try { await fs.rename(temporary,file);break; }
            catch(error) {
                if(attempt>=7||!['EACCES','EPERM','EBUSY','UNKNOWN'].includes(error.code))throw error;
                await new Promise(resolve=>setTimeout(resolve,100*(attempt+1)));
            }
        }
    } finally { await fs.rm(temporary,{force:true}); }
}
