
export default defineEventHandler(async (event) => {
  const sessionUser = event.context.auth?.user;

  const User = getModel('User');

  const user = await User.findById(sessionUser._id)
    .select('id createdAt auth.lastLoggedInAt activity')
    .lean();

  if (!user) {
    throw createError({
      statusCode: 404,
      statusMessage: 'User not found'
    });
  }

  const activity = user.activity || {};
  const lastDeposit = activity.lastDeposit || null;
  const lastWithdrawal = activity.lastWithdrawal || null;

  return {
    userId: user.id,
    registeredOn: user.createdAt?.toISOString() || null,
    lastLoggedInAt: user.auth.lastLoggedInAt?.toISOString() || null,
    lastDeposit: lastDeposit
      ? {
        amount: lastDeposit.amount,
        currency: lastDeposit.currency,
        timestamp: lastDeposit.timestamp?.toISOString() || null
      }
      : null,
    lastWithdrawal: lastWithdrawal
      ? {
        amount: lastWithdrawal.amount,
        currency: lastWithdrawal.currency,
        timestamp: lastWithdrawal.timestamp?.toISOString() || null
      }
      : null
  };
});