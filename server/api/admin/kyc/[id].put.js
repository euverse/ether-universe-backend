import { getRouterParam } from 'h3';
import { VERIFICATION_STATUSES } from '~/db/schemas/KYCSubmission.js';
import { ACCOUNT_TYPES } from '~/db/schemas/TradingAccount';

export default defineEventHandler(async (event) => {
    try {
        const kycSubmissionId = getRouterParam(event, "id");
        const {
            firstName,
            lastName,
            documentNumber,
            dateOfBirth,
            nationality,
            documentExpiry,
            address,
            status,
            rejectionReason,
            rejectionDetails
        } = await readAndValidateBody(event, {
            customValidators: {
                status: status => status ? Object.values(VERIFICATION_STATUSES).includes(status) : true,
            }
        });

        if (status === VERIFICATION_STATUSES.REJECTED && !rejectionReason) {
            throw createError({
                statusCode: 400,
                statusMessage: 'Rejection reason is required when rejecting KYC'
            });
        }

        if (status === VERIFICATION_STATUSES.APPROVED && (!firstName || !lastName || !documentNumber || !dateOfBirth || !nationality)) {
            throw createError({
                statusCode: 400,
                statusMessage: 'Holder information is required when approving KYC'
            });
        }

        const KYCSubmission = getModel('KYCSubmission');

        const kycSubmission = await KYCSubmission.findById(kycSubmissionId);

        if (!kycSubmission) {
            throw createError({
                statusCode: 404,
                statusMessage: 'KYC submission not found'
            });
        }

        const User = getModel("User")
        const user = await User.findById(kycSubmission.user);

        if (!user) {
            throw createError({
                statusCode: 404,
                statusMessage: 'User not found'
            });
        }


        if ([VERIFICATION_STATUSES.APPROVED, VERIFICATION_STATUSES.REJECTED].includes(kycSubmission.status)) {
            throw createError({
                statusCode: 400,
                statusMessage: `KYC submission already ${kycSubmission.status}. Cannot modify final status.`
            });
        }

        const now = new Date();

        const sessionAdmin = event.context.auth.admin;

        kycSubmission.status = status;
        kycSubmission.reviewedBy = sessionAdmin._id;
        kycSubmission.reviewedAt = now;


        if (status === VERIFICATION_STATUSES.APPROVED) {

            const verifiedData = {
                ...kycSubmission.verifiedData,
                firstName,
                lastName,
                documentNumber,
                dateOfBirth,
                nationality,
                ...(documentExpiry && {
                    documentExpiry
                }),
                ...(address && {
                    address
                })
            }

            kycSubmission.verifiedData = verifiedData;

            kycSubmission.approvedAt = now;

            await initializeTradingAccount(user.id, ACCOUNT_TYPES.REAL)

            user.personalInfo = {
                firstName: verifiedData.firstName,
                lastName: verifiedData.lastName,
                dateOfBirth: verifiedData.dateOfBirth,
                nationality: verifiedData.nationality
            };

            user.permissions = {
                ...user.permissions,
                canTrade: true
            };


            await createNotification({
                user: user._id,
                priority: 0.6,
                title: "KYC Approved",
                textContent: `Your KYC has been approved. 
                            You can now access full trading features on our app. 
                            We just created a live account for you.`,
                banner: "/assets/kyc-approved.png",
                themeColor: "green"
            })

        } else if (status === VERIFICATION_STATUSES.REJECTED) {
            kycSubmission.rejectedAt = now;
            kycSubmission.rejectionReason = rejectionReason;
            kycSubmission.rejectionDetails = rejectionDetails || [];

            user.permissions = {
                ...user.permissions,
                canTrade: false
            };

            await createNotification({
                user: user._id,
                priority: 0.6,
                title: "KYC Rejected",
                textContent: `Your KYC has been rejeted. Because of ${kycSubmission.rejectionReason}. You are only allowed to upload twice.`,
                banner: "/assets/kyc-rejected.png",
                themeColor: "red",
                action: {
                    label: "ReSubmit",
                    to: "/kyc"
                },
                reminder: {
                    isEnabled: true
                }
            })

        } else if (status === VERIFICATION_STATUSES.PROCESSING) {
            kycSubmission.processingStage = processingStage
        }

        await kycSubmission.save();
        await user.save()

        return {
            submissionId: kycSubmission._id,
            userId: kycSubmission.user.toString(),
            status: kycSubmission.status,
            reviewedAt: kycSubmission.reviewedAt?.toISOString(),
            reviewedBy: sessionAdmin._id
        };

    } catch (error) {
        if (error.statusCode) throw error;

        console.error('Update KYC status error:', error);
        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to update KYC Information'
        });
    }
});