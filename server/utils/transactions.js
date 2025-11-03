//opers defined step by step procedure actions
// rollback defines remedy for each failure
export async function Transact(opers = []) {
    const completedOpers = [];
    const failedRollBacks = [];
    let resolvedOpers = [];
    let failError = null;

    //resolve completed trasanctions
    const rollBack = async () => {
        //remedies must not follow one another
        const results = await Promise.allSettled(
            completedOpers.map(async oper => {
                if (!oper.remedy) return null;
                const remedyResult = await oper.remedy(oper.actionReturn);
                return { oper, remedyResult };
            })
        );

        results.forEach((result) => {
            if (result.status === 'fulfilled' && result.value) {
                resolvedOpers.push({
                    ...result.value.oper,
                    remedyResult: result.value.remedyResult
                });
            } else if (result.status === 'rejected') {
                const oper = completedOpers.find(op => !resolvedOpers.some(r => r.index === op.index));
                failedRollBacks.push({
                    ...oper,
                    remedyError: result.reason
                });
            }
        });
    };


    const resultMap = {};
    let isIrreversible = false;

    for (const [index, oper] of opers.filter(op => op.action).entries()) {
        try {
            const actionReturn = await oper.action(resultMap);

            completedOpers.push({
                index,
                actionReturn,
                remedy: oper.remedy
            });

            resultMap[oper.returnAs || `oper${index}`] = actionReturn;

            if (oper.isIrreversible === true) {
                isIrreversible = true
            }
        } catch (error) {
            if (isIrreversible) continue;

            failError = error;
            await rollBack();
            break;
        }
    }

    if (failError || failedRollBacks.length > 0) {

        const errorObj = {
            completedOpers,
            resolvedOpers,
            failedRollBacks,
            failError
        };

        console.log(JSON.stringify(errorObj));

        throw errorObj;
    }

    return {
        completedOpers,
        resultMap
    };
}