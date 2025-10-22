import { Schema } from "mongoose";

const tradingPairSchema = new Schema({
    symbol:{
        type:String,
        required:true
    },
    baseAsset:{
        type:String,
        required:true
    },
    quoteAsset:{
        type:String,
        required:true
    },
    name:{
        type:String,
        required:true
    },
    valueUsd:{
        type:Number,
        required:true
    },
    percentageChange:{
        type:Number,
        required:true
    },
    high24h:{
        type:Number,
        required:true
    },
    low24h:{
        type:Number,
        required:true
    },
    volume24h:{
        type:Number,
        required:true
    },
    categoryId:{
        type:Number,
        required:true
    },
    logoUrl:{
        type:String,
        required:true
    }
})


export default tradingPairSchema;