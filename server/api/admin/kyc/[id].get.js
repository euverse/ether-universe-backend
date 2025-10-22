
export default defineEventHandler(async event => {
    try {
        const userId = getRouterParam(event, "id");

        const KYCSubmission = getModel("KYCSubmission");

        const mostRecentSubmission = await KYCSubmission.findOne({ user: userId })
            .sort({ createdAt: -1 })
            .populate("user")
            .lean()

        if (!mostRecentSubmission) {
            throw createError({
                statusCode: 404,
                message: 'KYC submission not found'
            })
        }

        const mostRecentSubmissionData = {
            ...mostRecentSubmission.ocrData,
            ...mostRecentSubmission.verifiedData
        }

        return {
            user: {
                _id: mostRecentSubmission.user._id
            },
            kyc: {
                _id: mostRecentSubmission._id,
                status: mostRecentSubmission.status,
                documentType: mostRecentSubmission.documentType,
                data: {
                    firstName: mostRecentSubmissionData.firstName,
                    lastName: mostRecentSubmissionData.lastName,
                    documentNumber: mostRecentSubmissionData.documentNumber,
                    nationality: mostRecentSubmissionData.nationality,
                    dateOfBirth: mostRecentSubmissionData.dateOfBirth,
                    address: mostRecentSubmissionData.address,
                },
                attachments: {
                    documentFront: mostRecentSubmission.attachments?.documentFrontUrl,
                    documentBack: mostRecentSubmission.attachments?.documentBackUrl,
                }
            }
        }
    } catch (error) {
        if (error.statusCode) throw error;

        console.error('Update KYC status error:', error);
        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to update KYC status'
        });

    }
})