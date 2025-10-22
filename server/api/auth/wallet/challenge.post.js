
const WalletChallenge = getModel('WalletChallenge');

export default defineEventHandler(async event => {
  const { walletAddress } = await readAndValidateBody(event, { include: ['walletAddress'] });

  const challenge = await WalletChallenge.create({
    walletAddress
  });

  return {
    challengeId: challenge.challengeId,
    message: challenge.message,
    expiresAt: challenge.expiresAt, 
  };
});
