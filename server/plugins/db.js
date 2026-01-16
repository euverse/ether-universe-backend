import { connectDB } from '../db/mongoose.js'; 


export default defineNitroPlugin(async (nitroApp) => {
    //  Check if the current environment requires a database connection 
    if (useRuntimeConfig().NITRO_PRESET !== 'static') {
        try {
            console.log('Initializing Database Connection via Plugin...');
          
            await connectDB();
            
        } catch (error) {
   
            console.error('Fatal Error: Plugin failed to connect to database.', error);
        }
    }
});