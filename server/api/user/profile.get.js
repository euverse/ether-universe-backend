import { VERIFICATION_STATUSES } from "~/db/schemas/KYCSubmission";

export default defineEventHandler(async (event) => {
  const sessionUser = event.context.auth.user;
  const User = getModel('User');

  const userId = sessionUser._id;

  const user = await User.findById(userId)
    .select('id permissions personalInfo createdAt')
    .lean();

  if (!user) {
    throw createError({
      statusCode: 404,
      statusMessage: 'User not found'
    });
  }

  const KYCSubmission = getModel('KYCSubmission');
  const mostRecentKycSubmission = await KYCSubmission.findOne({ user: userId })
    .sort({ createdAt: -1 })
    .lean();

  const kyc = mostRecentKycSubmission || {}
  const personalInfo = user.personalInfo || {};
  const permissions = user.permissions || {};

  const profile = {
    userId: user.id,
    kycStatus: kyc.status || VERIFICATION_STATUSES.NOT_SUBMITTED,
    kycRequired: kyc.status !== VERIFICATION_STATUSES.APPROVED,
    firstName: personalInfo.firstName || null,
    lastName: personalInfo.lastName || null,
    dateOfBirth: personalInfo.dateOfBirth?.toISOString() || null,
    nationality: personalInfo.nationality || null,
    createdAt: user.createdAt?.toISOString() || null,
    canTrade: permissions.canTrade ?? false
  };

  return profile;
});
