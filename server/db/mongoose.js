import mongoose from 'mongoose'
import { setupDB } from './setup/setup'

const uri = process.env.MONGODB_URI

if (!uri) {
    throw new Error('Please define the MONGODB_URI environment variable')
}

// Initialize global connection cache
globalThis._mongooseConn = globalThis._mongooseConn || {
    conn: null,
    promise: null,
    eventsRegistered: false
}

export async function connectDB() {
  
    if (globalThis._mongooseConn.conn && mongoose.connection.readyState === 1) {
       
        return globalThis._mongooseConn.conn
    }

    // If no connection promise exists, start a new attempt
    if (!globalThis._mongooseConn.promise) {
        console.log('Creating new MongoDB connection...')
        globalThis._mongooseConn.promise = mongoose.connect(uri, {
        
            connectTimeoutMS: 60 * 1000,
            socketTimeoutMS: 45000,
            serverSelectionTimeoutMS: 30000,
           
        })
    }

    try {
        // Await the connection
        globalThis._mongooseConn.conn = await globalThis._mongooseConn.promise

        // Register connection events only once
        if (!globalThis._mongooseConn.eventsRegistered) {
            mongoose.connection.on('error', (error) => {
                console.error('MongoDB connection error:', error)
            })

            mongoose.connection.on('disconnected', () => {
                console.warn('MongoDB disconnected')
                // Note: Mongoose typically handles auto-reconnect, so no need to reset the promise here.
            })

            mongoose.connection.on('reconnected', () => {
                console.log('MongoDB reconnected')
            })

            globalThis._mongooseConn.eventsRegistered = true
        }

        console.log('MongoDB connected successfully.')

        await setupDB()
        return globalThis._mongooseConn.conn
    } catch (error) {
        console.error('Error connecting to MongoDB:', error)
        
        // Reset promise and connection on definitive error so the next attempt starts fresh
        globalThis._mongooseConn.promise = null
        globalThis._mongooseConn.conn = null
        
        throw error // Re-throw the error to halt the server startup
    }
}


// import mongoose from 'mongoose';

// let connectionAttempts = 0;
// const MAX_RETRIES = 3;
// const RETRY_DELAY = 5000; // 5 seconds

// /**
//  * Connect to MongoDB with retry logic
//  */
// export const connectDB = async (attempt = 1) => {
//   try {
//     const mongoUri = process.env.MONGODB_URI || process.env.MONGO_DB_URL;

//     if (!mongoUri) {
//       throw new Error('MONGODB_URI or MONGO_DB_URL environment variable not set');
//     }

//     console.log(`[MongoDB] Connection attempt ${attempt}/${MAX_RETRIES}...`);

//     await mongoose.connect(mongoUri, {
//       useNewUrlParser: true,
//       useUnifiedTopology: true,
//       maxPoolSize: 10,
//       minPoolSize: 2,
//       serverSelectionTimeoutMS: 5000,
//       socketTimeoutMS: 45000,
//       family: 4, // Use IPv4, skip trying IPv6
//       retryWrites: true,
//       connectTimeoutMS: 10000,
//       // Important: Handle connection pooling
//       maxIdleTimeMS: 60000,
//     });

//     connectionAttempts = 0; // Reset on successful connection
//     console.log('✓ [MongoDB] Connected successfully');
    
//     // Setup connection event handlers
//     setupConnectionHandlers();

//     return true;

//   } catch (error) {
//     console.error(`✗ [MongoDB] Connection attempt ${attempt} failed:`, error.message);

//     // Retry logic
//     if (attempt < MAX_RETRIES) {
//       const nextAttempt = attempt + 1;
//       const delay = RETRY_DELAY * attempt; // Exponential backoff

//       console.log(`[MongoDB] Retrying in ${delay}ms... (Attempt ${nextAttempt}/${MAX_RETRIES})`);

//       await new Promise(resolve => setTimeout(resolve, delay));
//       return connectDB(nextAttempt);

//     } else {
//       console.error('[MongoDB] Failed to connect after maximum retries');
//       // Don't throw - let the app continue with degraded functionality
//       console.warn('[MongoDB] Running in degraded mode - WebSocket will work, but database operations may fail');
//       return false;
//     }
//   }
// };

// /**
//  * Setup MongoDB connection event handlers
//  */
// function setupConnectionHandlers() {
//   // Handle connection errors after initial connection
//   mongoose.connection.on('error', (err) => {
//     console.error('[MongoDB] Connection error:', err.message);
//     // Attempt to reconnect
//     if (mongoose.connection.readyState !== 1) {
//       console.log('[MongoDB] Attempting to reconnect...');
//       reconnectDB();
//     }
//   });

//   // Handle disconnection
//   mongoose.connection.on('disconnected', () => {
//     console.warn('[MongoDB] Disconnected from database');
//   });

//   // Handle reconnection
//   mongoose.connection.on('reconnected', () => {
//     console.log('✓ [MongoDB] Reconnected to database');
//   });

//   // Handle timeout
//   mongoose.connection.on('timeout', () => {
//     console.warn('[MongoDB] Connection timeout - attempting reconnect');
//     reconnectDB();
//   });

//   // Handle connection open
//   mongoose.connection.on('open', () => {
//     console.log('[MongoDB] Connection opened');
//   });

//   // Handle connection close
//   mongoose.connection.on('close', () => {
//     console.warn('[MongoDB] Connection closed');
//   });
// }

// /**
//  * Attempt to reconnect to MongoDB
//  */
// export const reconnectDB = async () => {
//   try {
//     const mongoUri = process.env.MONGODB_URI || process.env.MONGO_DB_URL;

//     if (!mongoUri) {
//       throw new Error('MONGODB_URI environment variable not set');
//     }

//     const maxAttempts = 5;
//     for (let i = 1; i <= maxAttempts; i++) {
//       try {
//         console.log(`[MongoDB] Reconnection attempt ${i}/${maxAttempts}...`);

//         await mongoose.connect(mongoUri, {
//           useNewUrlParser: true,
//           useUnifiedTopology: true,
//           maxPoolSize: 10,
//           minPoolSize: 2,
//           serverSelectionTimeoutMS: 5000,
//           socketTimeoutMS: 45000,
//           family: 4,
//           retryWrites: true,
//         });

//         console.log('✓ [MongoDB] Reconnected successfully');
//         return true;

//       } catch (err) {
//         if (i < maxAttempts) {
//           const delay = 3000 * i;
//           console.error(`[MongoDB] Reconnection attempt ${i} failed. Retrying in ${delay}ms...`);
//           await new Promise(resolve => setTimeout(resolve, delay));
//         } else {
//           console.error('[MongoDB] Failed to reconnect after maximum attempts');
//           return false;
//         }
//       }
//     }

//   } catch (error) {
//     console.error('[MongoDB] Reconnection error:', error.message);
//     return false;
//   }
// };

// /**
//  * Get MongoDB connection status
//  */
// export const getDBStatus = () => {
//   const states = {
//     0: 'disconnected',
//     1: 'connected',
//     2: 'connecting',
//     3: 'disconnecting'
//   };

//   return {
//     state: states[mongoose.connection.readyState] || 'unknown',
//     stateCode: mongoose.connection.readyState,
//     connected: mongoose.connection.readyState === 1
//   };
// };

// /**
//  * Close MongoDB connection
//  */
// export const closeDB = async () => {
//   try {
//     await mongoose.disconnect();
//     console.log('[MongoDB] Connection closed gracefully');
//   } catch (error) {
//     console.error('[MongoDB] Error closing connection:', error.message);
//   }
// }; 