import {injectable} from "tsyringe";

import { IInsurance } from "@spt/models/eft/profile/ISptProfile";
import {InsuranceController} from "@spt/controllers/InsuranceController";
import {IItem} from "@spt/models/eft/common/tables/IItem";

@injectable()
export class InsuranceControllerExtension extends InsuranceController {
    protected override processInsuredItems(insuranceDetails: IInsurance[], sessionID: string): void {
        this.logger.debug(
            `Processing ${insuranceDetails.length} insurance packages, which includes a total of ${this.countAllInsuranceItems(
                insuranceDetails,
            )} items, in profile ${sessionID}`,
        );

        // Iterate over each of the insurance packages.
        for (const insured of insuranceDetails) {
            // Create a new root parent ID for the message we'll be sending the player
            const rootItemParentID = this.hashUtil.generate();

            // Update the insured items to have the new root parent ID for root/orphaned items
            insured.items = this.itemHelper.adoptOrphanedItems(rootItemParentID, insured.items);

            const simulateItemsBeingTaken = this.insuranceConfig.simulateItemsBeingTaken;
            if (simulateItemsBeingTaken) {
                // Find items that could be taken by another player off the players body
                const itemsToDelete = this.findItemsToDelete(rootItemParentID, insured);

                // Actually remove them.
                this.removeItemsFromInsurance(insured, itemsToDelete);

                // There's a chance we've orphaned weapon attachments, so adopt any orphaned items again
                insured.items = this.itemHelper.adoptOrphanedItems(rootItemParentID, insured.items);

                // Deletes the dropped property for alls item returned back to player
                for (let i in insured.items) {
                    delete insured.items[i]["dropped"];
                }
            }

            // Send the mail to the player.
            this.sendMail(sessionID, insured);

            // Remove the fully processed insurance package from the profile.
            this.removeInsurancePackageFromProfile(sessionID, insured);
        }

    }

    protected override processRegularItems(insured: IInsurance, toDelete: Set<string>, parentAttachmentsMap: Map<string, IItem[]>): void {
        for (const insuredItem of insured.items) {
            // Skip if the item is an attachment. These are handled separately.
            if (this.itemHelper.isAttachmentAttached(insuredItem)) {
                continue;
            }

            // Roll for item deletion
            const itemRoll = this.rollForDelete(insured.traderId, insuredItem);
            if (itemRoll) {
                // Check to see if this item is a parent in the parentAttachmentsMap. If so, do a look-up for *all* of
                // its children and mark them for deletion as well. Additionally remove the parent (and its children)
                // from the parentAttachmentsMap so that it's children are not rolled for later in the process.
                if (parentAttachmentsMap.has(insuredItem._id)) {
                    // This call will also return the parent item itself, queueing it for deletion as well.
                    const itemAndChildren = this.itemHelper.findAndReturnChildrenAsItems(
                        insured.items,
                        insuredItem._id,
                    );
                    for (const item of itemAndChildren) {
                        if(!item["dropped"]){
                            toDelete.add(item._id);
                        }
                    }

                    // Remove the parent (and its children) from the parentAttachmentsMap.
                    parentAttachmentsMap.delete(insuredItem._id);
                } else {
                    // This item doesn't have any children. Simply mark it for deletion.
                    toDelete.add(insuredItem._id);
                }
            }
        }
    }

    protected override populateParentAttachmentsMap(rootItemParentID: string, insured: IInsurance, itemsMap: Map<string, IItem>): Map<string, IItem[]> {
        const mainParentToAttachmentsMap = new Map<string, IItem[]>();
        for (const insuredItem of insured.items) {
            // Use the parent ID from the item to get the parent item.
            const parentItem = insured.items.find((item) => item._id === insuredItem.parentId);

            // The parent (not the hideout) could not be found. Skip and warn.
            if (!parentItem && insuredItem.parentId !== rootItemParentID) {
                this.logger.warning(
                    this.localisationService.getText("insurance-unable_to_find_parent_of_item", {
                        insuredItemId: insuredItem._id,
                        insuredItemTpl: insuredItem._tpl,
                        parentId: insuredItem.parentId,
                    }),
                );

                continue;
            }

            if (insuredItem["dropped"] != undefined) {
                //Item was dropped on the ground, skip this item and go to the next
                if(insuredItem["dropped"] ) {
                    continue;
                }
            }

            // Check if this is an attachment currently attached to its parent.
            if (this.itemHelper.isAttachmentAttached(insuredItem)) {
                // Make sure the template for the item exists.
                if (!this.itemHelper.getItem(insuredItem._tpl)[0]) {
                    this.logger.warning(
                        this.localisationService.getText("insurance-unable_to_find_attachment_in_db", {
                            insuredItemId: insuredItem._id,
                            insuredItemTpl: insuredItem._tpl,
                        }),
                    );

                    continue;
                }

                // Get the main parent of this attachment. (e.g., The gun that this suppressor is attached to.)
                const mainParent = this.itemHelper.getAttachmentMainParent(insuredItem._id, itemsMap);
                if (!mainParent) {
                    // Odd. The parent couldn't be found. Skip this attachment and warn.
                    this.logger.warning(
                        this.localisationService.getText("insurance-unable_to_find_main_parent_for_attachment", {
                            insuredItemId: insuredItem._id,
                            insuredItemTpl: insuredItem._tpl,
                            parentId: insuredItem.parentId,
                        }),
                    );

                    continue;
                }

                // Update (or add to) the main-parent to attachments map.
                if (mainParentToAttachmentsMap.has(mainParent._id)) {
                    mainParentToAttachmentsMap.get(mainParent._id).push(insuredItem);
                } else {
                    mainParentToAttachmentsMap.set(mainParent._id, [insuredItem]);
                }
            }
        }
        return mainParentToAttachmentsMap;
    }

    protected override rollForDelete(traderId: string, insuredItem?: IItem): boolean | undefined {
        const trader = this.traderHelper.getTraderById(traderId);
        if (!trader) {
            return undefined;
        }

        const maxRoll = 9999;
        const conversionFactor = 100;

        const returnChance = this.randomUtil.getInt(0, maxRoll) / conversionFactor;
        const traderReturnChance = this.insuranceConfig.returnChancePercent[traderId];
        let roll = returnChance >= traderReturnChance;

        if (insuredItem != undefined) {
            //If the item's dropped is true, then roll will be set to false and item will return back to player
            if (insuredItem["dropped"]) {
                roll = false;
            }
        }

        // Log the roll with as much detail as possible.
        const itemName = insuredItem ? ` "${this.itemHelper.getItemName(insuredItem._tpl)}"` : "";
        const status = roll ? "Delete" : "Keep";
        this.logger.debug(
            `Rolling${itemName} with ${trader} - Return ${traderReturnChance}% - Roll: ${returnChance} - Status: ${status}`,
        );

        return roll;
    }
}