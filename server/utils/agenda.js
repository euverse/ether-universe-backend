/**
 * Safely initialize a recurring Agenda job
 * - Cancels any existing instances to avoid duplication
 * - Schedules the job with the specified interval
 * - Optionally runs the job immediately
 * 
 * @param {Object} agenda - The Agenda instance
 * @param {string} jobName - Name of the job
 * @param {Function} handler - Async function to execute
 * @param {string} interval - Cron/interval string (e.g., '5 seconds')
 * @param {Object} [options] - Additional options
 * @param {number} [options.dontRun] - Avoid running the job initially
 * @param {number} [options.runAfter] - After how long to run the job initially
 * @param {Object} [options.jobOptions] - Additional job definition options (e.g., priority, concurrency)
 */
export async function initializeRecurringJob(
    agenda,
    jobName,
    handler,
    interval,
    { dontRun = false, runAfter = 0, jobOptions = {} } = {}
) {
    // Define the job
    agenda.define(jobName, jobOptions, handler);

    // Cancel any existing instances to avoid duplication
    await agenda.cancel({ name: jobName });

    // Schedule the recurring job
    await agenda.every(interval, jobName);

    // Optionally run immediately
    if (!dontRun) {
        setTimeout(async () => {
            await agenda.now(jobName);
        }, runAfter)
    }

    return jobName;
}