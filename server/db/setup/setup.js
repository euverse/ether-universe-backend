import { setupSuperAdmin } from "./admin"
import { setupAdminWallets } from "./admin-wallets"
import { setupHousePools } from "./housepools"
import { setupNetworks } from "./networks"
import { setupPairs } from "./pairs"
import { setupPriceData } from "./priceData"

export const setupDB = async function () {
    //avoid race condition
    await setupNetworks()
    await setupPairs()
    await setupPriceData()
    await setupHousePools()
    await setupSuperAdmin()
    await  setupAdminWallets()

}