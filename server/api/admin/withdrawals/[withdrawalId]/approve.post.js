import { model } from "mongoose";

export default defineEventHandler(async (event) => {
  try {
    const admin = event.context.admin;

    if (!admin) {
      throw createError({
        statusCode: 401,
        statusMessage: "Unauthorized",
      });
    }

    const withdrawalId = getRouterParam(event, "withdrawalId");

    if (!withdrawalId) {
      throw createError({
        statusCode: 400,
        message: "Withdrawal ID is required",
      });
    }

    const body = await readBody(event);
    const { txHash } = body;

    if (!txHash) {
      throw createError({
        statusCode: 400,
        message: "Transaction hash is required",
      });
    }

    const Withdrawal = model("Withdrawal");
    const Balance = model("Balance");

    const withdrawal = await Withdrawal.findOne({ withdrawalId })
      .populate("wallet")
      .populate("tradingPair");

    if (!withdrawal) {
      throw createError({ statusCode: 404, message: "Withdrawal not found" });
    }

    if (withdrawal.status !== "pending") {
      throw createError({
        statusCode: 400,
        message: `Cannot approve withdrawal with status: ${withdrawal.status}`,
      });
    }

    // Deduct virtual balance and unlock
    const balance = await Balance.findOne({
      wallet: withdrawal.wallet._id,
      tradingPair: withdrawal.tradingPair._id,
    });

    if (!balance) {
      throw createError({ statusCode: 404, message: "Balance not found" });
    }

    const requestedAmount = parseFloat(withdrawal.requestedAmount);
    const currentVirtual = parseFloat(balance.virtualBalance);
    const currentLocked = parseFloat(balance.locked);

    // Deduct from virtual balance
    balance.virtualBalance = (currentVirtual - requestedAmount).toFixed(6);
    balance.total = balance.virtualBalance;

    // Unlock the locked amount
    balance.locked = Math.max(0, currentLocked - requestedAmount).toFixed(6);

    // Update withdrawal tracking
    balance.totalWithdrawn = (
      parseFloat(balance.totalWithdrawn || "0") + requestedAmount
    ).toFixed(6);
    balance.lastWithdrawalAt = new Date();

    await balance.save();

    // Update withdrawal status
    withdrawal.status = "approved";
    withdrawal.txHash = txHash;
    withdrawal.reviewedAt = new Date();
    // withdrawal.reviewedBy = admin._id; // Uncomment when admin auth is added

    await withdrawal.save();

    console.log(`[admin/withdrawals/approve] Approved: ${withdrawalId}`);

    return {
      success: true,
      withdrawalId: withdrawal.withdrawalId,
      status: withdrawal.status,
      txHash: withdrawal.txHash,
      deductedAmount: requestedAmount.toFixed(6),
      remainingBalance: balance.virtualBalance,
      message: "Withdrawal approved successfully",
    };
  } catch (error) {
    console.error("[admin/withdrawals/approve.post] Error:", error);
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || "Failed to approve withdrawal",
    });
  }
});
