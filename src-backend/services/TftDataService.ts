import { TftDataProvider } from "../data/TftDataProvider";
import type { TftDataSnapshot } from "../data/types";

class TftDataService {
    private readonly provider = new TftDataProvider();
    private initialized = false;
    private refreshInFlight: Promise<void> | null = null;

    public async refresh(force = false): Promise<void> {
        if (this.refreshInFlight) {
            return this.refreshInFlight;
        }
        this.refreshInFlight = this.provider.refresh(force).then(() => {
            this.initialized = true;
        }).finally(() => {
            this.refreshInFlight = null;
        });
        return this.refreshInFlight;
    }

    public async warmup(): Promise<void> {
        if (this.initialized) {
            return;
        }
        await this.refresh(false);
    }

    public getSnapshot(): TftDataSnapshot {
        return this.provider.getSnapshot();
    }
}

export const tftDataService = new TftDataService();
