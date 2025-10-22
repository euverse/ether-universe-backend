export const validateInput = function (input, {
    include = [],
    strict = false,
    customValidators = {},
    onError = function (validationErrors) {
        throw new Error({
            message: 'Validation Error',
            data: validationErrors,
        });
    }
}) {
    const validationErrors = [];

    const getNestedValue = (obj, path) => {
        return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
    };
    if (strict) {
        const unexpectedKeys = Object.keys(input).filter(key =>
            !include.some(includeKey => includeKey === key || includeKey.startsWith(`${key}.`))
        );

        validationErrors.push(...unexpectedKeys.map(key => ({
            field: key,
            message: `Unexpected field: ${key}`,
        })))
    }

    const missingKeys = include.filter(key => {
        const value = getNestedValue(input, key);

        return (value === undefined || value === null || value === '');
    });

    if (missingKeys.length > 0) {
        validationErrors.push(...missingKeys.map(key => ({
            field: key,
            message: `Field is required`,
        })))
    }

    for (const [field, validator] of Object.entries(customValidators)) {
        const value = getNestedValue(input, field);
        if (value !== undefined) {
            try {
                const isValid = validator(value);
                if (!isValid) {
                    validationErrors.push({
                        field,
                        message: `${field} is invalid`
                    });
                }
            } catch (err) {
                validationErrors.push({ field, message: `${field} validation failed: ${err.message}` });
            }
        }
    }

    if (validationErrors.length > 0) {
        onError(validationErrors)
    }
    return input;
};

export const PHONE_REGEX = /^(\+254|254|0)[17]\d{8}$/;
export const MPESA_PHONE_FORMAT = /^254[17]\d{8}$/;
export const validateRegex = (value, regex) => regex.test(value)