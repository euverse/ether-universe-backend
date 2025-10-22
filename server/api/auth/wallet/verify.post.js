import { ethers } from 'ethers';
import { ACCOUNT_TYPES } from '~/db/schemas/TradingAccount';


export default defineEventHandler(async (event) => {
    const { challengeId, walletAddress, signature } = await readAndValidateBody(event, {
        include: ['challengeId', 'walletAddress', 'signature'],
    });

    const WalletChallenge = getModel('WalletChallenge');

    //nonce implementation
    const walletChallenge = await WalletChallenge.findOneAndDelete({
        challengeId,
        walletAddress,
    });

    if (!walletChallenge) {
        throw createError({
            statusCode: 404,
            message: 'Wallet Challenge not found',
        });
    }

    const message = walletChallenge.message;

    let signerAddress;
    try {
        signerAddress = ethers.verifyMessage(message, signature);
    } catch (err) {
        throw createError({
            statusCode: 401,
            message: 'Invalid signature format',
        });
    }

    if (signerAddress.toLowerCase() !== walletAddress.toLowerCase()) {
        throw createError({
            statusCode: 401,
            message: 'Signature verification failed',
        });
    }
    const User = getModel('User');

    let user = await User.findOne({ walletAddress });

    if (!user) {
        //generate a less predictable id
        function generateId() {
            return Date.now().toString().slice(-6);
        }

        user = await User.create({
            id: generateId(),
            walletAddress,
        });

        await initializeTradingAccount(user.id, ACCOUNT_TYPES.DEMO)
    }

    const { issuedAt, refreshToken, accessToken, expiresIn } = createUserSession(user, { refresh: false })

    user.auth.lastLoggedInAt = issuedAt;
    user.auth.refreshToken = refreshToken;

    await user.save()

    return {
        accessToken,
        refreshToken,
        expiresIn,
    };
});
