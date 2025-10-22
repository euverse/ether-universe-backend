import { VERIFICATION_STATUSES } from '~/db/schemas/KYCSubmission';

export default defineEventHandler(async (event) => {
  const sessionUser = event.context.auth?.user;

  const User = getModel('User');
  const KYCSubmission = getModel('KYCSubmission');

  const user = await User.findById(sessionUser._id).lean();

  if (!user) {
    throw createError({
      statusCode: 404,
      statusMessage: 'User not found'
    });
  }

  const submissions = await KYCSubmission.find({ user: user._id })
    .sort({ createdAt: -1 })
    .lean();

  return {
    submissions: submissions.map(submission => ({
      submissionId: submission._id,
      status: submission.status,
      submittedAt: submission.createdAt.toISOString(),
      ...(submission.status === VERIFICATION_STATUSES.APPROVED && { approvedAt: submission.approvedAt?.toISOString() }),
      ...(submission.status === VERIFICATION_STATUSES.REJECTED && {
        rejectedAt: submission.rejectedAt?.toISOString() || null,
        rejectionReason: submission.rejectionReason || null
      }),
    }))
  };
});
