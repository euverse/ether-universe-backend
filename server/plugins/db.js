import { connectDB } from '../db/mongoose.js'; 


export default defineNitroPlugin(async (nitroApp) => {
    //  Check if the current environment requires a database connection 
    if (process.env.NITRO_PRESET !== 'static') {
        try {
            console.log('Initializing Database Connection via Plugin...');
          
            await connectDB();
            
        } catch (error) {
   
            console.error('Fatal Error: Plugin failed to connect to database.', error);
        }
    }
});

// import { connectDB, getDBStatus } from '../db/mongoose.js';

// export default defineNitroPlugin(async (nitroApp) => {
//   // Check if the current environment requires a database connection
//   if (process.env.NITRO_PRESET !== 'static') {
//     try {
//       console.log('[Database Plugin] Initializing Database Connection...');

//       const connected = await connectDB();

//       if (connected) {
//         console.log('[Database Plugin] Database plugin initialized successfully');
//       } else {
//         console.warn('[Database Plugin] Database connection failed but plugin will continue');
//       }

//       // Optional: Add a health check endpoint
//       nitroApp.hooks.hook('render:html', (html, event) => {
//         const status = getDBStatus();
//         console.log(`[Database Plugin] Health check - Status: ${status.state}`);
//       });

//     } catch (error) {
//       console.error('[Database Plugin] Fatal Error:', error.message);
//       // Continue anyway - don't crash the server
//     }
//   }
// });

// // ============================================================
// // server/api/health.js (OPTIONAL - Add this endpoint for monitoring)
// // ============================================================
// // (Moved health check endpoint to its own file: server/api/health.js)