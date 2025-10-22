import BigNumber from "bignumber.js";

// Configure BigNumber for crypto precision
BigNumber.config({
    DECIMAL_PLACES: 30,
    ROUNDING_MODE: BigNumber.ROUND_DOWN,
    EXPONENTIAL_AT: [-30, 30]
});


export default BigNumber;