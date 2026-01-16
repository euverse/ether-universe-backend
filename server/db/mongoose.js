import mongoose from 'mongoose'
import { setupDB } from './setup/setup'

const uri = useRuntimeConfig().MONGODB_URI

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