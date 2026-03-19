import { createDefaultDecisionEngine } from "../core/DecisionEngineFactory";
import type { ActionPlan, DecisionContext, ObservedState } from "../core/types";
import { pcLogicAdapter } from "../adapters/PcLogicAdapter";

class PcLogicRunner {
    private engine = createDefaultDecisionEngine();
    private planningMutex: Promise<void> = Promise.resolve();

    public async planOnce(state: ObservedState, context: DecisionContext = {}): Promise<ActionPlan[]> {
        const previous = this.planningMutex;
        let release!: () => void;
        this.planningMutex = new Promise<void>((resolve) => {
            release = resolve;
        });

        await previous;

        try {
            pcLogicAdapter.setStateProvider(async () => state);
            await pcLogicAdapter.attach();
            const observedState = await pcLogicAdapter.observe();
            const plans = this.engine.generatePlan(observedState, context);
            await pcLogicAdapter.execute(plans);
            return plans;
        } finally {
            release();
        }
    }

    public getLastPlans(): ActionPlan[] {
        return pcLogicAdapter.getLastActions();
    }
}

export const pcLogicRunner = new PcLogicRunner();
