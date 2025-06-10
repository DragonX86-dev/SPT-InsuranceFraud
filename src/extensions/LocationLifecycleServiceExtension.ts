import {injectable} from "tsyringe";

import {IPmcData} from "@spt/models/eft/common/IPmcData";
import {LocationLifecycleService} from "@spt/services/LocationLifecycleService";
import {IEndLocalRaidRequestData} from "@spt/models/eft/match/IEndLocalRaidRequestData";
import {InRaidHelper} from "@spt/helpers/InRaidHelper";
import {ItemHelper} from "@spt/helpers/ItemHelper";

@injectable()
export class LocationLifecycleServiceExtension extends LocationLifecycleService {
    protected override handleInsuredItemLostEvent(
        sessionId: string,
        preRaidPmcProfile: IPmcData,
        request: IEndLocalRaidRequestData,
        locationName: string,
    ): void {
        if (request.lostInsuredItems?.length > 0) {
            const postRaidProfile = request.results.profile;
            preRaidPmcProfile["isDead"] = this.isPlayerDead(request.results);

            const itemHelper = (this.inRaidHelper as InRaidHelper)["itemHelper"] as ItemHelper;
            preRaidPmcProfile["postRaidEquipmentItems"] = itemHelper.findAndReturnChildrenAsItems(
                postRaidProfile.Inventory.items,
                postRaidProfile.Inventory.equipment,
            );

            const mappedItems = this.insuranceService.mapInsuredItemsToTrader(
                sessionId,
                request.lostInsuredItems,
                preRaidPmcProfile,
            );

            // Is possible to have items in lostInsuredItems but removed before reaching mappedItems
            if (mappedItems.length === 0) {
                return;
            }

            this.insuranceService.storeGearLostInRaidToSendLater(sessionId, mappedItems);
            this.insuranceService.startPostRaidInsuranceLostProcess(preRaidPmcProfile, sessionId, locationName);
        }
    }
}