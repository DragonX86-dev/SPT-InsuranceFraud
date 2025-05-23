import {injectable} from "tsyringe";

import {InsuranceService} from "@spt/services/InsuranceService";
import {IItem} from "@spt/models/eft/common/tables/IItem";
import {IPmcData} from "@spt/models/eft/common/IPmcData";
import {IInsuranceEquipmentPkg} from "@spt/models/spt/services/IInsuranceEquipmentPkg";

@injectable()
export class InsuranceServiceExtension extends InsuranceService {
    public override mapInsuredItemsToTrader(
        sessionId: string,
        lostInsuredItems: IItem[],
        pmcProfile: IPmcData
    ): IInsuranceEquipmentPkg[] {
        const result: IInsuranceEquipmentPkg[] = [];

        const isDead = pmcProfile["isDead"];
        delete pmcProfile["isDead"];

        for (const lostItem of lostInsuredItems) {
            const insuranceDetails = pmcProfile.InsuredItems.find((insuredItem) => insuredItem.itemId === lostItem._id);
            if (!insuranceDetails) {
                this.logger.error(
                    `unable to find insurance details for item id: ${lostItem._id} with tpl: ${lostItem._tpl}`,
                );

                continue;
            }

            if (!isDead && this.insuranceConfig.simulateItemsBeingTaken) {
                insuranceDetails["dropped"] = true;
            }

            if (this.itemCannotBeLostOnDeath(lostItem, pmcProfile.Inventory.items)) {
                continue;
            }

            // Add insured item + details to return array
            result.push({
                sessionID: sessionId,
                itemToReturnToPlayer: lostItem,
                pmcData: pmcProfile,
                traderId: insuranceDetails.tid,
            });
        }

        return result;

    }
}