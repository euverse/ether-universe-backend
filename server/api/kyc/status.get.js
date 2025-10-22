import { createError } from 'h3';
import { VERIFICATION_STATUSES } from '~/db/schemas/KYCSubmission';

export default defineEventHandler(async (event) => {
  const sessionUser = event.context.auth?.user;

  const User = getModel('User');
  const KYCSubmission = getModel('KYCSubmission');

  const user = await User.findById(sessionUser._id);

  if (!user) {
    throw createError({
      statusCode: 404,
      statusMessage: 'User not found'
    });
  }


  const userSubmissionQuery = { user: sessionUser._id }
  const latestSubmission = await KYCSubmission.findOne(userSubmissionQuery)
    .sort({ createdAt: -1 })
    .lean();

  if (!latestSubmission) {
    return {
      status: 'notSubmitted',
      message: "You haven't submitted KYC documents yet.",
      canTrade: false
    };
  }

  const response = {
    submissionId: latestSubmission._id,
    status: latestSubmission.status,
    submittedAt: latestSubmission.createdAt?.toISOString() || null,
  };

  switch (latestSubmission.status) {
    case VERIFICATION_STATUSES.PENDING:
    case VERIFICATION_STATUSES.PROCESSING:
      response.estimatedCompletion = latestSubmission.estimatedCompletion?.toISOString() || null;
      break;

    case VERIFICATION_STATUSES.APPROVED:
      response.approvedAt = latestSubmission.approvedAt?.toISOString() || null;
      response.verifiedData = {
        firstName: latestSubmission.verifiedData?.firstName || null,
        lastName: latestSubmission.verifiedData?.lastName || null,
        dateOfBirth: latestSubmission.verifiedData?.dateOfBirth || null,
        nationality: latestSubmission.verifiedData?.nationality || null
      };
      break;

    case VERIFICATION_STATUSES.REJECTED:
      response.rejectedAt = latestSubmission.rejectedAt?.toISOString() || null;
      response.rejectionReason = latestSubmission.rejectionReason || 'Document verification failed';
      response.rejectionDetails = latestSubmission.rejectionDetails || [];

      const totalSubmissions = await KYCSubmission.countDocuments(userSubmissionQuery);
      response.canResubmit = totalSubmissions < 2;
      break;
  }

  return response;
});