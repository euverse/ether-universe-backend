
export default defineEventHandler(async (event) => {
    const admin = event.context.auth?.admin;
    
    if (!admin) {
        throw createError({
            statusCode: 401,
            statusMessage: 'Unauthorized'
        });
    }
    
    try {
        const AdminWallet = getModel('AdminWallet');
        const Pair = getModel('Pair');
        
        const adminWallets = await AdminWallet.find({ isActive: true });
        
        if (!adminWallets || adminWallets.length === 0) {
            return {
                balances: [],
                totalBalanceUsd: "0.00"
            };
        }
        
        const allPairs = await Pair.find({});
        
        let totalBalanceUsd = 0;
        const balances = [];
        
        for (const wallet of adminWallets) {
            const pair = allPairs.find(p => p.baseAsset === wallet.network);
            
            if (!pair) {
                console.log(`⚠️ No pair found for network: ${wallet.network}`);
                continue;
            }
            
            const balance = wallet.lastCheckedBalance || '0';
            const priceUsd = pair.valueUsd || 0;
            const balanceNum = parseFloat(balance);
            const balanceUsd = (balanceNum * priceUsd).toFixed(2);
            
            totalBalanceUsd += parseFloat(balanceUsd);
            
            balances.push({
                pair: {
                    _id: pair._id,
                    symbol: wallet.network,
                    name: pair.name,
                    logoUrl: pair.logoUrl
                },
                decimals: 18,
                balance: balance,
                balanceUsd: balanceUsd,
                priceUsd: priceUsd.toFixed(2)
            });
        }
        
        return {
            balances,
            totalBalanceUsd: totalBalanceUsd.toFixed(2)
        };
        
    } catch (error) {
        console.error('Get admin wallet balances error:', error);
        throw createError({
            statusCode: 500,
            statusMessage: error.message || 'Failed to fetch wallet balances'
        });
    }
});