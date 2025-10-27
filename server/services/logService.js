import chalk from "chalk";
import { LOG_TYPES } from "../db/schemas/Log";

const CHALKS = {
    [LOG_TYPES.INFO]: chalk.cyan,
    [LOG_TYPES.SUCCESS]: chalk.green,
    [LOG_TYPES.ERROR]: chalk.red,
    [LOG_TYPES.WARNING]: chalk.yellow,
    [LOG_TYPES.ROUTINE]: chalk.white
}



class LogTask {

    constructor(id, { logToDB = false, fallSilently = true, parentId } = {}) {
        if (!id) throw Error("Log task id  required");

        this.id = new String(id).toUpperCase()
        this.fallSilently = fallSilently
        this.logToDB = logToDB
        this.parentId = parentId

        this.nestLoggers = new Map()
    }

    async persistToDB(type, message, metadata) {
        const Log = getModel("Log")

        await Log.create({
            taskId: this.taskId,
            type,
            message,
            metadata
        })
    }

    log(message, { type = LOG_TYPES.INFO, metadata } = {}) {
        if (!LOG_TYPES.hasOwnProperty(type)) {
            this.log("Invalid log")
        }

        const parentPrefix = this.parentId ? `[${this.parentId}]` : ''

        console.log(CHALKS[type](this.parentId, parentPrefix, `[${this.id}] [${new String(type)}]`) ,`=> ${message}`)

        if (this.logToDB) {
            this.persistToDB(type, message, metadata)
        }
    }

    warning(message, { metadata } = {}) {
        this.log(message, { type: LOG_TYPES.WARNING, metadata })
    }

    error(message, { metadata } = {}) {
        this.log(message, { type: LOG_TYPES.ERROR, metadata })
    }

    success(message, { metadata } = {}) {
        this.log(message, { type: LOG_TYPES.SUCCESS, metadata })
    }

    routine(message, { metadata } = {}) {
        this.log(message, { type: LOG_TYPES.ROUTINE, metadata })
    }

    //convinience utilities
    initialize({ frequency } = {}) {
        if (!frequency) {
            this.error('Frequency required when initializing')

            return;
        }

        this.routine(`INITIALIZE (${frequency})`)
    }

    start() {
        this.routine("START")
    }

    complete() {
        this.routine("COMPLETE")
    }

    createLogger(...args) {
        const [loggerId, loggerOpts] = args;

        const existingLogger = this.nestLoggers.get(loggerId)

        if (existingLogger) {
            return existingLogger
        };

        const newLogger = new LogTask(loggerId, {
            parentId: this.parentId,
            logToDB: this.logToDB,
            fallSilently: this.fallSilently,
            ...loggerOpts
        })

        this.nestLoggers.set(newLogger.id, newLogger)


        return newLogger;
    }

    handleError(error) {
        if (this.fallSilently) return;

        console.error(error)
    }

    destroy() {
        Object.keys(this).forEach(
            this[key] = undefined
        )
    }



}

class LogService {
    constructor() {
        this.loggers = new Map()
    }

    createLogger(...args) {
        const [loggerId] = args;

        const existingLogger = this.loggers.get(loggerId)

        if (existingLogger) {
            return existingLogger
        };

        const newLogger = new LogTask(...args)

        this.loggers.set(newLogger.id, newLogger)


        return newLogger;
    }
}


 const logService = new LogService()

//price update
const priceUpdateLogger = logService.createLogger('PRICE_UPDATE')

//price data update
const priceDataUpdateLogger = logService.createLogger('PRICE_DATA_UPDATE')
const initializePriceDataLogger = priceDataUpdateLogger.createLogger('INITIALIZE')
const updateHighPriorityPairsLogger = priceDataUpdateLogger.createLogger('HIGH_PRIORITY')
const updateAllPairsLogger = priceDataUpdateLogger.createLogger('ALL_PAIRS')


//deposits
const depositScanLogger = logService.createLogger('DEPOSIT_SCAN')
const evmLogger = depositScanLogger.createLogger('EVM')
const evmDepositScanLogger = evmLogger.createLogger('DEPOSIT')
const evmSweepLogger = evmLogger.createLogger('SWEEP')
const btcLogger = depositScanLogger.createLogger('BTC')
const btcDepositScanLogger = btcLogger.createLogger('DEPOSIT')
const btcSweepLogger = btcLogger.createLogger('SWEEP')




//
export {
    logService,

    //instances
    priceUpdateLogger,
    priceDataUpdateLogger,
    initializePriceDataLogger,
    updateHighPriorityPairsLogger,
    updateAllPairsLogger,
    evmLogger,
    evmDepositScanLogger,
    evmSweepLogger,
    btcLogger,
    btcDepositScanLogger,
    btcSweepLogger    
}

