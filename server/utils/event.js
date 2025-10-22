
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

