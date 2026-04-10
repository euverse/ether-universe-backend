import Agenda from 'agenda';

const mongoConnectionString = useRuntimeConfig().MONGODB_URI;

// Create Agenda instance
const agenda = new Agenda({
  db: {
    address: mongoConnectionString,
    collection: 'agendaJobs'
  },
  processEvery: '5 seconds', // How often to check for jobs
  maxConcurrency: 20,
  defaultLockLifetime: 10 * 60 * 1000
});


// Graceful shutdown
async function graceful() {
  await agenda.stop();
  process.exit(0);
}

process.on('SIGTERM', graceful);
process.on('SIGINT', graceful);

export default agenda;

export async function startAgenda() {
  // Start agenda
  await agenda.start();
  console.log('Agenda started');

  await agenda.db.collection.updateMany({ lockedAt: { $exists: true, $ne: null } }, { $unset: { lockedAt: '' } });
}
