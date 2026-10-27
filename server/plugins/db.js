import { connectDB } from '../db/mongoose.js'; 


export default defineNitroPlugin(async (nitroApp) => {
    //  Check if the current environment requires a database connection 
    if (useRuntimeConfig().NITRO_PRESET !== 'static') {
        try {
            console.log('Initializing Database Connection via Plugin...');

            await connectDB();

        } catch (error) {
            console.error('Fatal Error: Plugin failed to connect to database.', error);
            // Exit so PM2 restarts the process, instead of running indefinitely
            // with no DB connection while /api/health (which never touches
            // Mongo) keeps reporting healthy. Re-throwing is not enough: Nitro
            // only logs a rejected plugin as an unhandled rejection.
            process.exit(1);
        }
    }
});