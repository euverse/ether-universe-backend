
export const readAndValidateBody = async function (event, { include = [], strict = false, customValidators = {} }) {
    const body = await readBody(event);

    validateInput(body, {
        include,
        strict,
        customValidators,
        onError: function (validationErrors) {
            throw createError({
                statusCode: 400,
                statusMessage: 'Bad Request',
                data: {
                    error: {
                        category: 'VALIDATION_ERROR',
                        data: validationErrors
                    }
                },
            });
        }
    })

    return body;
};

export function appErrorHandler(apiHandler, { onError } = {}) {
    return defineEventHandler(async (...args) => {
        try {
            
            return await apiHandler(args)

        } catch (error) {
            if (onError) {
                await onError(error)

                return;
            }

            if (error.statusCode) {
                throw error;
            }

            throw createError({
                statusCode: 500,
                data: {
                    message: error.message || "Unknown Error occured",
                    errorCode: error.errorCode || "UKNOWN_ERROR"
                }
            })
        }
    })
}