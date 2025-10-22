import { DOCUMENT_TYPES, VERIFICATION_STATUSES } from '~/db/schemas/KYCSubmission';

const User = getModel('User');
const KYCSubmission = getModel('KYCSubmission');

export default defineEventHandler(async (event) => {
  try {
    const formData = await readMultipartFormData(event);

    if (!formData) {
      throw createError({
        statusCode: 400,
        statusMessage: 'No form data received'
      });
    }

    const documentType = formData
      .find(item => item.name === 'documentType')
      ?.data.toString();

    const documentFront = formData.find(item => item.name === 'documentFront');
    const documentBack = formData.find(item => item.name === 'documentBack');


    // Validate documentType
    if (!documentType || !Object.values(DOCUMENT_TYPES).includes(documentType)) {
      throw createError({
        statusCode: 400,
        statusMessage: `Valid documentType required: ${Object.values(DOCUMENT_TYPES).join(', ')}`
      });
    }

    if (!documentFront) {
      throw createError({
        statusCode: 400,
        statusMessage: 'documentFront image is required'
      });
    }

    if ([DOCUMENT_TYPES.NATIONAL_ID, DOCUMENT_TYPES.DRIVERS_LICENSE].includes(documentType) && !documentBack) {
      throw createError({
        statusCode: 400,
        statusMessage: `documentBack image is required for ${documentType}`
      });
    }

    const sessionUser = event.context.auth.user;

    const userExists = await User.exists({ _id: sessionUser._id });

    if (!userExists) {
      throw createError({
        statusCode: 404,
        statusMessage: 'User not found'
      });
    }

    const previousSubmissionCount = await KYCSubmission.countDocuments({ user: sessionUser._id });

    if (previousSubmissionCount >= 2) {
      throw createError(
        {
          statusCode: 403,
          statusMessage: 'KYC submission attempts exceeded'
        }
      )
    }

    const mostRecentSubmission = await KYCSubmission.findOne({ user: sessionUser._id })
      .sort({ createdAt: -1 })
      .select('status')
      .lean();

    if (mostRecentSubmission && mostRecentSubmission.status !== VERIFICATION_STATUSES.REJECTED) {
      throw createError({
        statusCode: 403,
        statusMessage: 'You can only resubmit if the previous submission was rejected'
      });
    }

    const extractTextFromImage = async () => {

      return {
        text: "",
        confidence: 0.1
      }

    }

    // OCR processing
    const frontOCR = await extractTextFromImage(documentFront.data);

    let backOCR = null;
    if (documentBack) {
      backOCR = await extractTextFromImage(documentBack.data);
    }

    const ocrData = parseDocumentData(
      frontOCR.text,
      backOCR?.text || null,
      documentType
    );

    const avgConfidence = documentBack
      ? (frontOCR.confidence + backOCR.confidence) / 2
      : frontOCR.confidence;

    const frontBase64 = `data:${documentFront.type};base64,${documentFront.data.toString('base64')}`;
    const backBase64 = documentBack
      ? `data:${documentBack.type};base64,${documentBack.data.toString('base64')}`
      : null;

    const submission = await KYCSubmission.create({
      user: sessionUser._id,
      documentType,
      attachments: {
        documentFrontUrl: frontBase64,
        documentBackUrl: backBase64,
      },
      status: VERIFICATION_STATUSES.PENDING,
      ocrData,
      metadata: {
        ocrConfidence: avgConfidence,
      }
    });

    await createNotification({
      user: sessionUser._id,
      title: "KYC Submission",
      priority: 0.8,
      textContent: "We are in receipt of your KYC request. It is currently under review we'll let you know once it is processed.",
      banner: "/assets/kyc-pending.png"
    })


    return {
      submissionId: submission._id,
      status: submission.status,
      submittedAt: submission.createdAt.toISOString(),
      estimatedCompletion: submission.estimatedCompletion.toISOString(),
      ocrData: {
        firstName: submission.ocrData?.firstName,
        lastName: submission.ocrData?.lastName,
        dateOfBirth: submission.ocrData?.dateOfBirth,
        nationality: submission.ocrData?.nationality,
        documentNumber: submission.ocrData?.documentNumber,
        documentExpiry: submission.ocrData?.documentExpiry,
        address: submission.ocrData?.address,
      },
      metadata: {
        ocrConfidence: submission.metadata?.ocrConfidence
      }
    };

  } catch (error) {
    console.error('KYC Submission Error:', error);

    throw createError({
      statusCode: error.statusCode || 500,
      statusMessage: error.statusMessage || error.message || 'Failed to process KYC submission'
    });
  }
});
