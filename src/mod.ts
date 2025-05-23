import {DependencyContainer} from "tsyringe";

import {ILogger} from "@spt/models/spt/utils/ILogger";
import {IPreSptLoadMod} from "@spt/models/external/IPreSptLoadMod";
import {InsuranceServiceExtension} from "./extensions/InsuranceServiceExtension";
import {LocationLifecycleServiceExtension} from "./extensions/LocationLifecycleServiceExtension";
import {InsuranceControllerExtension} from "./extensions/InsuranceControllerExtension";

class InsuranceFraud implements IPreSptLoadMod {
    preSptLoad(container: DependencyContainer): void {
        const logger = container.resolve<ILogger>("WinstonLogger");

        container.register("InsuranceService", { useClass: InsuranceServiceExtension });
        container.register("LocationLifecycleService", { useClass: LocationLifecycleServiceExtension });
        container.register("InsuranceController", { useClass: InsuranceControllerExtension });
    }
}

export const mod = new InsuranceFraud();