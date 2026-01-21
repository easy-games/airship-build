import { NetworkSignal } from "@Easy/Core/Shared/Network/NetworkSignal";
import { EditSelection } from "./EditSelection";

export default class EditManager extends AirshipSingleton {
	public localEditSelection: EditSelection | undefined;
	public playerEditSelections = new Map<string, EditSelection>();

	private setEditSelectionNetSig = new NetworkSignal<[selection: EditSelection]>("Edit:SetSelection");

	override Start(): void {}

	private StartServer() {
		this.setEditSelectionNetSig.server.OnClientEvent((p, selection) => {
			this.playerEditSelections.set(p.userId, selection);
		});
	}

	private StartClient() {}

	public SetLocalEditSelection(pos1: Vector3, pos2: Vector3): void {
		this.localEditSelection = {
			pos1,
			pos2,
		};
		this.setEditSelectionNetSig.client.FireServer(this.localEditSelection);
	}

	override OnDestroy(): void {}
}
